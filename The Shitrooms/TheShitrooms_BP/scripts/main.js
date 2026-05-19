import { world, system } from "@minecraft/server";
import { generateInitial, startExplorationLoop, startSpawnLoop, resetState, getOrigin } from "./generator.js";

const INIT_PROP = "shitrooms:initialized";

world.beforeEvents.playerBreakBlock.subscribe(ev => {
  if (ev.block.typeId === "minecraft:sea_lantern") ev.cancel = true;
});

world.afterEvents.worldInitialize.subscribe(() => {
  world.sendMessage("§8[The Shitrooms] §7Loaded. Don't look behind you.");
  try { world.getDimension("overworld").runCommand("gamerule doMobSpawning false"); } catch { }
  startExplorationLoop();
  startSpawnLoop();
  startCleanupLoop();
});

function startCleanupLoop() {
  const LIQUIDS = ["minecraft:water", "minecraft:lava", "minecraft:flowing_water", "minecraft:flowing_lava"];
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      for (const liquid of LIQUIDS) {
        try { player.runCommand(`fill ~-25 ~-3 ~-25 ~25 ~5 ~25 air replace ${liquid}`); } catch { }
      }
    }
  }, 10);
  // Play ambient sounds for each nextbot every second via command (bypasses RP sound event system)
  const NEXTBOT_SEGMENT_COUNT = 39;
  const NEXTBOT_SEG_TICKS = 100; // 5 seconds per segment
  const NEXTBOT2_SOUND = "mob.nextbot2.ambient";
  const NEXTBOT2_TICKS = 38; // ~2 seconds
  // entityId -> { seg: number, tick: number }
  const soundState = new Map();
  system.runInterval(() => {
    const seen = new Set();
    const tick = system.currentTick;
    for (const player of world.getPlayers()) {
      if (seen.has(player.dimension.id)) continue;
      seen.add(player.dimension.id);
      const dim = player.dimension;
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT_SEG_TICKS) continue;
        const seg = (s.seg % NEXTBOT_SEGMENT_COUNT) + 1;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound mob.nextbot.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 100 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch { }
      }
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot2" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT2_TICKS) continue;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound ${NEXTBOT2_SOUND} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 100 1 0`);
          soundState.set(entity.id, { seg: 0, tick });
        } catch { }
      }
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot3" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT_SEG_TICKS) continue;
        const seg = (s.seg % 5) + 1;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound mob.nextbot3.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 100 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch { }
      }
    }
  }, 20);

  // Script-driven combat: steer nextbots toward the nearest player and deal damage.
  const attackCooldown = new Map();
  const lastDirs = new Map(); // entityId -> last chosen steer direction for momentum
  const CHASE_RANGE = 64;
  const ATTACK_RANGE = 2.5;
  const ATTACK_DAMAGE = 8;
  const ATTACK_INTERVAL = 20;
  const NEXTBOT_SPEED = 0.60;
  const NEXTBOT_TYPES = ["shitrooms:nextbot", "shitrooms:nextbot2", "shitrooms:nextbot3"];

  // Returns true if a 1.5-block step in direction (nx, nz) from (ex, ey, ez) is unobstructed.
  function pathClear(dim, ex, ey, ez, nx, nz) {
    try {
      const cx = ex + nx * 1.5, cz = ez + nz * 1.5;
      const b1 = dim.getBlock({ x: cx, y: ey + 0.1, z: cz });
      const b2 = dim.getBlock({ x: cx, y: ey + 0.9, z: cz });
      return (!b1 || b1.isAir) && (!b2 || b2.isAir);
    } catch { return true; }
  }

  // Rotate a unit direction (nx, nz) by deg degrees clockwise in the XZ plane.
  function rotate(nx, nz, deg) {
    const r = deg * Math.PI / 180;
    const c = Math.cos(r), s = Math.sin(r);
    return { x: nx * c + nz * s, z: -nx * s + nz * c };
  }

  // Sweep 12 directions (every 30°). Prefer last direction only if still clear and forward-facing.
  function steerDir(dim, ex, ey, ez, dx, dz, dist, entityId) {
    const nx = dx / dist, nz = dz / dist;
    const last = lastDirs.get(entityId);
    if (last && pathClear(dim, ex, ey, ez, last.x, last.z) && (last.x * nx + last.z * nz) > 0.0) {
      return last;
    }
    const angles = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180];
    for (const deg of angles) {
      const dir = deg === 0 ? { x: nx, z: nz } : rotate(nx, nz, deg);
      if (pathClear(dim, ex, ey, ez, dir.x, dir.z)) {
        lastDirs.set(entityId, dir);
        return dir;
      }
    }
    return { x: nx, z: nz };
  }

  system.runInterval(() => {
    const tick = system.currentTick;
    const dimsMap = new Map();
    for (const player of world.getPlayers()) dimsMap.set(player.dimension.id, player.dimension);

    for (const [, dim] of dimsMap) {
      const players = dim.getPlayers();
      if (players.length === 0) continue;

      for (const typeId of NEXTBOT_TYPES) {
        for (const entity of dim.getEntities({ type: typeId })) {
          let nearest = null;
          let nearestDist = CHASE_RANGE + 1;
          for (const p of players) {
            const dx = p.location.x - entity.location.x;
            const dy = p.location.y - entity.location.y;
            const dz = p.location.z - entity.location.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < nearestDist) { nearestDist = d; nearest = p; }
          }
          if (!nearest) continue;

          const ex = entity.location.x, ey = entity.location.y, ez = entity.location.z;
          const dx = nearest.location.x - ex;
          const dy = nearest.location.y - ey;
          const dz = nearest.location.z - ez;

          // Always face the player
          const yaw = Math.atan2(-dx, dz) * (180 / Math.PI);
          const horizDist = Math.sqrt(dx * dx + dz * dz);
          const pitch = -Math.atan2(dy, horizDist) * (180 / Math.PI);
          try { entity.setRotation({ x: pitch, y: yaw }); } catch { }

          if (nearestDist > 0.5) {
            const vel = entity.getVelocity();
            // Low XZ speed despite previous impulse = blocked by wall; reset momentum
            if (Math.sqrt(vel.x * vel.x + vel.z * vel.z) < 0.08) lastDirs.delete(entity.id);
            const dir = steerDir(dim, ex, ey, ez, dx, dz, nearestDist, entity.id);
            try {
              entity.applyImpulse({
                x: dir.x * NEXTBOT_SPEED - vel.x,
                y: 0,
                z: dir.z * NEXTBOT_SPEED - vel.z
              });
            } catch { }
          }

          // Deal damage when in melee range
          if (nearestDist <= ATTACK_RANGE) {
            const lastHit = attackCooldown.get(entity.id) ?? 0;
            if (tick - lastHit >= ATTACK_INTERVAL) {
              try { nearest.applyDamage(ATTACK_DAMAGE); } catch { }
              attackCooldown.set(entity.id, tick);
            }
          }
        }
      }
    }
  }, 2);

  // Keep Speed II and Strength II on all nextbots permanently
  system.runInterval(() => {
    const seen = new Set();
    for (const player of world.getPlayers()) {
      if (seen.has(player.dimension.id)) continue;
      seen.add(player.dimension.id);
      const dim = player.dimension;
      for (const typeId of NEXTBOT_TYPES) {
        for (const entity of dim.getEntities({ type: typeId })) {
          try {
            entity.runCommand("effect @s speed 4 1 true");
            entity.runCommand("effect @s strength 4 1 true");
          } catch { }
        }
      }
    }
  }, 60);

  // Keep Speed II on all players permanently
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      try { player.addEffect("speed", 100, { amplifier: 1, showParticles: false }); } catch { }
    }
  }, 60);

  const KILL_IGNORE = new Set([
    "minecraft:player",
    "shitrooms:nextbot",
    "shitrooms:nextbot2",
    "shitrooms:nextbot3",
  ]);

  // Kill all mobs and item drops every 5 seconds, sparing ignored types
  system.runInterval(() => {
    const seen = new Set();
    for (const player of world.getPlayers()) {
      if (seen.has(player.dimension.id)) continue;
      seen.add(player.dimension.id);
      for (const entity of player.dimension.getEntities()) {
        if (KILL_IGNORE.has(entity.typeId)) continue;
        try { entity.kill(); } catch { }
      }
    }
  }, 100);
}

// Generate on the first player to ever join this world
world.afterEvents.playerSpawn.subscribe(ev => {
  if (!ev.initialSpawn) return;
  try { ev.player.runCommand("gamemode survival"); } catch { }
  if (world.getDynamicProperty(INIT_PROP)) return;
  world.setDynamicProperty(INIT_PROP, true);
  const player = ev.player;
  player.addEffect("blindness", 100, { amplifier: 0, showParticles: false });
  player.addEffect("slowness", 100, { amplifier: 99, showParticles: false });
  // 40 ticks (~2 s) so the player's chunks are loaded before placing structures
  system.runTimeout(() => generateInitial(player), 40);
});

// On death, teleport the player back to the start room instead of the surface
world.afterEvents.playerSpawn.subscribe(ev => {
  if (ev.initialSpawn) return;
  const o = getOrigin();
  if (o.x === 0 && o.y === 0 && o.z === 0) return; // maze not generated yet
  system.runTimeout(() => {
    try {
      ev.player.teleport(
        { x: o.x + 2.5, y: o.y + 1, z: o.z + 2.5 },
        { dimension: ev.player.dimension }
      );
    } catch { }
  }, 2);
});

// /scriptevent shitrooms:reset
// Clears the init flag and regenerates the maze at your current position.
system.afterEvents.scriptEventReceive.subscribe(ev => {
  if (ev.id !== "shitrooms:reset") return;
  const player = ev.sourceEntity;
  if (!player) {
    world.sendMessage("§c[Shitrooms] Run /scriptevent as a player, not from console.");
    return;
  }
  world.setDynamicProperty(INIT_PROP, false);
  resetState();
  world.sendMessage("§8[Shitrooms] §7Resetting and regenerating...");
  system.runTimeout(() => generateInitial(player), 10);
}, { namespaces: ["shitrooms"] });
