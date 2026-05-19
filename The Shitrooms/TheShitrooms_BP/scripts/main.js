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
  startNavmeshLoop();
  setupScoreboard();
});

// ─── Block-level A* pathfinding ───────────────────────────────────────────────

const BOT_SPEED     = 0.3;  // blocks per tick (~Speed II player)
const PATH_RETICK   = 10;   // recompute path every N ticks
const ASTAR_BUDGET  = 500;  // max nodes A* explores before giving up

function isWalkable(dim, bx, bz, floorY) {
  try {
    const lo = dim.getBlock({ x: bx, y: floorY + 1, z: bz });
    const hi = dim.getBlock({ x: bx, y: floorY + 2, z: bz });
    return lo?.isAir && hi?.isAir;
  } catch { return false; }
}

// A* on the block grid. Returns [{x,z},...] from first step to goal, or null.
function astar(dim, sx, sz, ex, ez, floorY) {
  if (sx === ex && sz === ez) return [];
  const key = (x, z) => `${x},${z}`;
  const h   = (x, z) => Math.abs(x - ex) + Math.abs(z - ez);
  const startKey = key(sx, sz);
  const goalKey  = key(ex, ez);

  const open  = [{ x: sx, z: sz, f: h(sx, sz) }];
  const prev  = new Map([[startKey, null]]);
  const gCost = new Map([[startKey, 0]]);

  while (open.length > 0 && prev.size <= ASTAR_BUDGET) {
    // Pop lowest-f (linear scan is fine for budgets under ~1000)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { x: cx, z: cz } = open.splice(bi, 1)[0];
    if (cx === ex && cz === ez) break;

    const ck = key(cx, cz);
    const cg = gCost.get(ck);
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cx + dx, nz = cz + dz;
      const nk = key(nx, nz);
      if (prev.has(nk)) continue;
      if (!isWalkable(dim, nx, nz, floorY)) continue;
      const ng = cg + 1;
      prev.set(nk, ck);
      gCost.set(nk, ng);
      if (nx === ex && nz === ez) { open.length = 0; break; }
      open.push({ x: nx, z: nz, f: ng + h(nx, nz) });
    }
  }

  if (!prev.has(goalKey)) return null;
  const path = [];
  let cur = goalKey;
  while (prev.get(cur) !== null) {
    const [x, z] = cur.split(",").map(Number);
    path.unshift({ x, z });
    cur = prev.get(cur);
  }
  return path;
}

const botCache = new Map(); // entityId -> { path: [{x,z}]|null, nextRecalc: number }

function startNavmeshLoop() {
  const TYPES = ["shitrooms:nextbot", "shitrooms:nextbot2", "shitrooms:nextbot3"];

  system.runInterval(() => {
    const origin = getOrigin();
    if (origin.x === 0 && origin.y === 0 && origin.z === 0) return;
    const floorY = origin.y;
    const tick   = system.currentTick;

    const dimsMap = new Map();
    for (const player of world.getPlayers()) dimsMap.set(player.dimension.id, player.dimension);

    for (const [, dim] of dimsMap) {
      const players = dim.getPlayers();
      if (players.length === 0) continue;

      for (const typeId of TYPES) {
        for (const entity of dim.getEntities({ type: typeId })) {
          // Nearest player
          let nearest = null, nearDist = Infinity;
          for (const p of players) {
            const d = Math.hypot(p.location.x - entity.location.x, p.location.z - entity.location.z);
            if (d < nearDist) { nearDist = d; nearest = p; }
          }
          if (!nearest) continue;

          // Always face the player
          try {
            entity.setRotation({
              x: 0,
              y: -Math.atan2(nearest.location.x - entity.location.x,
                             nearest.location.z - entity.location.z) * (180 / Math.PI)
            });
          } catch { }

          let cache = botCache.get(entity.id) ?? { path: null, nextRecalc: 0 };

          // Advance path when entity enters the current waypoint block
          if (cache.path?.length > 0) {
            const wp = cache.path[0];
            if (Math.hypot(entity.location.x - (wp.x + 0.5),
                           entity.location.z - (wp.z + 0.5)) < 0.6) {
              cache.path.shift();
            }
          }

          // Recompute when path is exhausted or timer fires
          if (!cache.path?.length || tick >= cache.nextRecalc) {
            const sx = Math.floor(entity.location.x);
            const sz = Math.floor(entity.location.z);
            const ex = Math.floor(nearest.location.x);
            const ez = Math.floor(nearest.location.z);
            cache = { path: astar(dim, sx, sz, ex, ez, floorY) ?? [], nextRecalc: tick + PATH_RETICK };
            botCache.set(entity.id, cache);
          }

          // Move toward next block waypoint, or directly to player when path is empty
          let wx, wz;
          if (cache.path.length === 0) {
            wx = nearest.location.x; wz = nearest.location.z;
          } else {
            wx = cache.path[0].x + 0.5; wz = cache.path[0].z + 0.5;
          }

          const dx = wx - entity.location.x;
          const dz = wz - entity.location.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 0.05) continue;

          const step = Math.min(BOT_SPEED, dist);
          try {
            entity.teleport(
              { x: entity.location.x + (dx / dist) * step, y: floorY + 1, z: entity.location.z + (dz / dist) * step },
              { dimension: dim, checkForBlocks: false }
            );
          } catch { }
        }
      }
    }
  }, 1);
}

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
          dim.runCommand(`playsound mob.nextbot.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch { }
      }
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot2" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT2_TICKS) continue;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound ${NEXTBOT2_SOUND} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg: 0, tick });
        } catch { }
      }
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot3" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT_SEG_TICKS) continue;
        const seg = (s.seg % 5) + 1;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound mob.nextbot3.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch { }
      }
    }
  }, 20);

  // Script-driven combat: steer nextbots toward the nearest player and deal damage.
  const KILL_RANGE = 2.5;
  const NEXTBOT_TYPES = ["shitrooms:nextbot", "shitrooms:nextbot2", "shitrooms:nextbot3"];

  system.runInterval(() => {
    const dimsMap = new Map();
    for (const player of world.getPlayers()) dimsMap.set(player.dimension.id, player.dimension);

    for (const [, dim] of dimsMap) {
      const players = dim.getPlayers();
      if (players.length === 0) continue;

      for (const typeId of NEXTBOT_TYPES) {
        for (const entity of dim.getEntities({ type: typeId })) {
          for (const p of players) {
            const dx = p.location.x - entity.location.x;
            const dy = p.location.y - entity.location.y;
            const dz = p.location.z - entity.location.z;
            if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= KILL_RANGE) {
              try { p.kill(); } catch { }
              try { entity.kill(); } catch { }
              break;
            }
          }
        }
      }
    }
  }, 2);

  // Keep Speed II and Saturation X on all players permanently
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      try { player.addEffect("speed",      100, { amplifier: 1, showParticles: false }); } catch { }
      try { player.addEffect("saturation", 100, { amplifier: 9, showParticles: false }); } catch { }
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

// ─── Survival time scoreboard ─────────────────────────────────────────────────

const SCORE_OBJ  = "sr_time"; // hidden — tracks current run
const SCORE_BEST = "sr_best"; // sidebar leaderboard — best times only

function setupScoreboard() {
  let obj = world.scoreboard.getObjective(SCORE_OBJ);
  if (!obj) obj = world.scoreboard.addObjective(SCORE_OBJ, "Time");

  let best = world.scoreboard.getObjective(SCORE_BEST);
  if (!best) best = world.scoreboard.addObjective(SCORE_BEST, "§6Best Time §f(s)");
  try { world.getDimension("overworld").runCommand(`scoreboard objectives setdisplay sidebar ${SCORE_BEST}`); } catch { }
  // Clear any previous list display so only sidebar shows
  try { world.getDimension("overworld").runCommand(`scoreboard objectives setdisplay list`); } catch { }

  system.runInterval(() => {
    const o = world.scoreboard.getObjective(SCORE_OBJ);
    const b = world.scoreboard.getObjective(SCORE_BEST);
    if (!o) return;
    for (const player of world.getPlayers()) {
      let cur = 0;
      try { cur = o.getScore(player) ?? 0; } catch { }
      const next = cur + 1;
      try { o.setScore(player, next); } catch { }
      if (b) {
        let pb = 0;
        try { pb = b.getScore(player) ?? 0; } catch { }
        if (next > pb) try { b.setScore(player, next); } catch { }
      }
      // Show current run time above the hotbar
      try { player.onScreenDisplay.setActionBar(`§7Current: §f${next}s`); } catch { }
    }
  }, 20);
}

// Reset timer on death (respawn fires after death)
world.afterEvents.playerSpawn.subscribe(ev => {
  if (ev.initialSpawn) return;
  const o = world.scoreboard.getObjective(SCORE_OBJ);
  if (!o) return;
  try { o.setScore(ev.player, 0); } catch { }
});

// Generate on the first player to ever join; teleport later joiners into the maze
world.afterEvents.playerSpawn.subscribe(ev => {
  if (!ev.initialSpawn) return;
  try { ev.player.runCommand("gamemode survival"); } catch { }
  if (world.getDynamicProperty(INIT_PROP)) {
    // Maze already exists — send this player straight to the spawn room
    const o = getOrigin();
    if (o.x !== 0 || o.y !== 0 || o.z !== 0) {
      system.runTimeout(() => {
        try {
          ev.player.teleport(
            { x: o.x + 2.5, y: o.y + 1, z: o.z + 2.5 },
            { dimension: ev.player.dimension }
          );
        } catch { }
      }, 40);
    }
    return;
  }
  world.setDynamicProperty(INIT_PROP, true);
  const player = ev.player;
  player.addEffect("blindness", 100, { amplifier: 0, showParticles: false });
  player.addEffect("slowness", 100, { amplifier: 99, showParticles: false });
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
