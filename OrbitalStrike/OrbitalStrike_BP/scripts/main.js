import {
  world,
  system,
  BlockPermutation,
  GameMode
} from "@minecraft/server";

// ─── Constants ────────────────────────────────────────────────────────────────
const STRIKE_ITEM_ID  = "orbital:strike_beacon";
const DDX_ITEM_ID     = "orbital:ddx_beacon";
const INSTANT_ITEM_ID = "orbital:instant_beacon";
const BIG_ITEM_ID     = "orbital:big_beacon";
const STRIKE_BLOCK_ID = "orbital:strike_block"; // unused
const STRIKE_RADIUS   = 5;
const BIG_STRIKE_RADIUS = 10;
const EFFECT_TICKS    = 20000000;
const CYLINDER_DELAY  = 40;
const FADE_TICKS      = 20;
const MAX_RANGE       = 50;
const INDICATOR_STEPS = 32;
const CAMSHAKE_RANGE  = 2;

// Maps each beacon item ID to its indicator radius
const BEACON_RADIUS = {
  [STRIKE_ITEM_ID]:  STRIKE_RADIUS,
  [DDX_ITEM_ID]:     STRIKE_RADIUS,
  [INSTANT_ITEM_ID]: STRIKE_RADIUS,
  [BIG_ITEM_ID]:     BIG_STRIKE_RADIUS,
};

const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block"
]);

// ─── Raycast ──────────────────────────────────────────────────────────────────
function getTarget(player) {
  const loc = player.location;
  const dir = player.getViewDirection();
  const dim = player.dimension;
  const eyeX = loc.x, eyeY = loc.y + 1.62, eyeZ = loc.z;
  let lastX = Math.floor(eyeX), lastY = Math.floor(eyeY), lastZ = Math.floor(eyeZ);
  const STEP = 0.5;
  const steps = Math.floor(MAX_RANGE / STEP);
  for (let i = 1; i <= steps; i++) {
    const t  = i * STEP;
    const bx = Math.floor(eyeX + dir.x * t);
    const by = Math.floor(eyeY + dir.y * t);
    const bz = Math.floor(eyeZ + dir.z * t);
    try {
      const block = dim.getBlock({ x: bx, y: by, z: bz });
      if (block && block.typeId !== "minecraft:air" && block.typeId !== "minecraft:cave_air") {
        return { x: lastX, y: lastY, z: lastZ };
      }
    } catch { break; }
    lastX = bx; lastY = by; lastZ = bz;
  }
  return { x: lastX, y: lastY, z: lastZ };
}

// ─── Indicator ────────────────────────────────────────────────────────────────
function spawnIndicator(player, radius) {
  const dim    = player.dimension;
  const target = getTarget(player);
  for (let i = 0; i < INDICATOR_STEPS; i++) {
    const angle = (i / INDICATOR_STEPS) * Math.PI * 2;
    const px = target.x + 0.5 + Math.cos(angle) * (radius + 0.5);
    const pz = target.z + 0.5 + Math.sin(angle) * (radius + 0.5);
    for (const py of [target.y, target.y + 0.5, target.y + 1.0]) {
      try { dim.spawnParticle("minecraft:basic_flame_particle", { x: px, y: py, z: pz }); } catch { /* ignore */ }
    }
  }
  try { dim.spawnParticle("minecraft:basic_flame_particle", { x: target.x + 0.5, y: target.y, z: target.z + 0.5 }); } catch { /* ignore */ }
}

// ─── Cylinder helpers (kept for future block mode) ────────────────────────────
function getCylinderPositions(dimension, cx, cz) {
  const minY = dimension.heightRange.min;
  const maxY = dimension.heightRange.max;
  const out  = [];
  const r2   = STRIKE_RADIUS ** 2;
  for (let x = cx - STRIKE_RADIUS; x <= cx + STRIKE_RADIUS; x++) {
    for (let z = cz - STRIKE_RADIUS; z <= cz + STRIKE_RADIUS; z++) {
      if ((x-cx)*(x-cx) + (z-cz)*(z-cz) <= r2) {
        for (let y = minY; y < maxY; y++) out.push({ x, y, z });
      }
    }
  }
  return out;
}

// unused
function placeCylinder(dimension, cx, cz) {
  const perm    = BlockPermutation.resolve(STRIKE_BLOCK_ID);
  const changed = [];
  for (const pos of getCylinderPositions(dimension, cx, cz)) {
    try {
      const block = dimension.getBlock(pos);
      if (block && !PROTECTED.has(block.typeId)) {
        block.setPermutation(perm);
        changed.push(pos);
      }
    } catch { /* unloaded */ }
  }
  return changed;
}

function removeCylinder(dimension, positions) {
  const air = "minecraft:air";
  for (const pos of positions) {
    try {
      const block = dimension.getBlock(pos);
      if (block && block.typeId === STRIKE_BLOCK_ID) block.setPermutation(air);
    } catch { /* ignore */ }
  }
}

// ─── Active cylinders (unused in particle mode, ready for block mode) ─────────
const activeCylinders = new Map();
let strikeId = 0; // unused

// ─── Indicator loop ───────────────────────────────────────────────────────────
system.runInterval(() => {
  for (const player of world.getPlayers()) {
    try {
      const held = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
      const radius = held ? BEACON_RADIUS[held.typeId] : undefined;
      if (radius !== undefined) spawnIndicator(player, radius);
    } catch { /* ignore */ }
  }
}, 5);

// ─── Cylinder cleanup (inactive in particle mode) ─────────────────────────────
system.runInterval(() => {
  if (activeCylinders.size === 0) return;
  const now = system.currentTick;
  for (const [id, data] of activeCylinders) {
    if (now >= data.removeAt) {
      removeCylinder(data.dimension, data.positions);
      activeCylinders.delete(id);
    }
  }
}, 10);

// ─── Death message ────────────────────────────────────────────────────────────
world.afterEvents.entityDie.subscribe(ev => {
  const entity = ev.deadEntity;
  try {
    const name = entity.nameTag?.trim() ||
      (entity.typeId === "minecraft:player"
        ? (entity.name ?? "A player")
        : entity.typeId.replace("minecraft:", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    if (entity.hasTag("orbital_strike_kill")) {
      world.sendMessage(`§3${name} §7was §cobliterated §7by an orbital strike`);
      entity.removeTag("orbital_strike_kill");
    } else if (entity.hasTag("ddx_strike_kill")) {
      world.sendMessage(`§e${name} §7was brutally §cáss ráped§7 by §pHuntr/x`);
      entity.removeTag("ddx_strike_kill");
    } else if (entity.hasTag("instant_strike_kill")) {
      world.sendMessage(`§c${name} §7was §cinstantly §7vaporized`);
      entity.removeTag("instant_strike_kill");
    } else if (entity.hasTag("big_strike_kill")) {
      world.sendMessage(`§5${name} §7was §ccrushed §7by a big orbital strike`);
      entity.removeTag("big_strike_kill");
    }
  } catch { /* ignore */ }
});

// ─── Particle spawn point grid (center + rings for large radii) ───────────────
function getParticleSpawnPoints(cx, cz, radius) {
  const pcx = cx + 0.5, pcz = cz + 0.5;
  const points = [{ x: pcx, z: pcz }];
  if (radius <= STRIKE_RADIUS) return points;

  const addRing = (r) => {
    const count = Math.max(6, Math.round(2 * Math.PI * r / 5));
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      points.push({ x: pcx + Math.cos(angle) * r, z: pcz + Math.sin(angle) * r });
    }
  };
  for (let r = STRIKE_RADIUS; r < radius; r += STRIKE_RADIUS) addRing(r);
  addRing(radius - 1);
  return points;
}

// ─── Shared strike execution ──────────────────────────────────────────────────
// opts: { radius = STRIKE_RADIUS, delay = CYLINDER_DELAY }
function executeStrike(player, deathTag, particles, actionBarMsg, opts = {}) {
  const radius = opts.radius ?? STRIKE_RADIUS;
  const delay  = opts.delay  ?? CYLINDER_DELAY;
  const dimension = player.dimension;
  const target    = getTarget(player);
  const r2        = radius ** 2;

  dimension.playSound("random.orb",      target, { volume: 2.0, pitch: 0.4 });
  dimension.playSound("beacon.activate", target, { volume: 1.5, pitch: 1.8 });
  player.onScreenDisplay.setActionBar(actionBarMsg);

  for (const entity of dimension.getEntities()) {
    const dx = Math.floor(entity.location.x) - target.x;
    const dz = Math.floor(entity.location.z) - target.z;
    if (dx * dx + dz * dz <= r2) {
      try {
        entity.addTag(deathTag);
        entity.addEffect("slowness",   EFFECT_TICKS, { amplifier: 100, showParticles: false });
        entity.addEffect("blindness",  EFFECT_TICKS, { amplifier: 0,   showParticles: false });
        entity.addEffect("resistance", EFFECT_TICKS, { amplifier: 50,  showParticles: false });
        entity.addEffect("wither",     EFFECT_TICKS, { amplifier: 1,   showParticles: false });
      } catch { /* no effects component */ }
    }
  }

  system.runTimeout(() => {
    const minY = dimension.heightRange.min;
    const maxY = dimension.heightRange.max;
    const cx   = target.x;
    const cz   = target.z;
    const air  = BlockPermutation.resolve("minecraft:air");

    dimension.playSound("random.explode", target, { volume: 4.0, pitch: 0.4 });
    dimension.playSound("beacon.power",   target, { volume: 2.0, pitch: 0.7 });
    dimension.playSound("random.explode", target, { volume: 3.0, pitch: 0.6 });

    for (const p of dimension.getPlayers()) {
      const dx = p.location.x - cx;
      const dz = p.location.z - cz;
      if (dx * dx + dz * dz <= (radius * CAMSHAKE_RANGE) ** 2) {
        try { p.camera.shake(1.0, 0.5, "rotational"); } catch { /* ignore */ }
      }
    }

    const pcx = cx + 0.5, pcz = cz + 0.5;
    const spawnPoints = getParticleSpawnPoints(cx, cz, radius);
    for (const sp of spawnPoints) {
      try { dimension.spawnParticle(particles.shockwave, { x: sp.x, y: target.y,     z: sp.z }); } catch { /* ignore */ }
      try { dimension.spawnParticle(particles.shockwave, { x: sp.x, y: target.y + 1, z: sp.z }); } catch { /* ignore */ }
    }
    for (let hy = minY; hy < maxY; hy += 8) {
      for (const sp of spawnPoints) {
        try { dimension.spawnParticle(particles.explosion, { x: sp.x, y: hy, z: sp.z }); } catch { /* ignore */ }
      }
    }
    for (let gy = minY; gy < maxY; gy += 4) {
      for (const sp of spawnPoints) {
        try { dimension.spawnParticle(particles.glow, { x: sp.x, y: gy, z: sp.z }); } catch { /* ignore */ }
      }
    }
    for (const sp of spawnPoints) {
      try { dimension.spawnParticle("minecraft:huge_explosion_emitter", { x: sp.x, y: target.y,  z: sp.z }); } catch { /* ignore */ }
      try { dimension.spawnParticle("minecraft:huge_explosion_emitter", { x: sp.x, y: minY + 10, z: sp.z }); } catch { /* ignore */ }
    }
    if (particles.image) {
      for (let iy = minY; iy < maxY; iy += 12) {
        try { dimension.spawnParticle(particles.image, { x: pcx, y: iy, z: pcz }); } catch { /* ignore */ }
      }
    }

    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let z = cz - radius; z <= cz + radius; z++) {
        if ((x-cx)*(x-cx) + (z-cz)*(z-cz) <= r2) {
          for (let y = minY; y < maxY; y++) {
            try {
              const block = dimension.getBlock({ x, y, z });
              if (block && !PROTECTED.has(block.typeId)) block.setPermutation(air);
            } catch { /* unloaded */ }
          }
        }
      }
    }

    for (const entity of dimension.getEntities()) {
      const dx = Math.floor(entity.location.x) - cx;
      const dz = Math.floor(entity.location.z) - cz;
      if (dx * dx + dz * dz <= r2 || entity.getTags().includes(deathTag)) {
        try {
          if (!entity.getTags().includes(deathTag)) entity.addTag(deathTag);
          let gm;
          if (entity.typeId === "minecraft:player") {
            gm = entity.getGameMode();
            entity.setGameMode(GameMode.survival);
          }
          entity.kill();
          if (entity.typeId === "minecraft:player") entity.setGameMode(gm);
        } catch { /* already dead */ }
      }
    }

    system.runTimeout(() => {
      dimension.playSound("beacon.deactivate", target, { volume: 1.5, pitch: 0.9 });
    }, FADE_TICKS);

  }, delay);
}

// ─── Item use ─────────────────────────────────────────────────────────────────
world.afterEvents.itemUse.subscribe(ev => {
  const { itemStack, source: player } = ev;

  if (itemStack.typeId === STRIKE_ITEM_ID) {
    executeStrike(player,
      "orbital_strike_kill",
      { explosion: "orbital:explosion", shockwave: "orbital:shockwave", glow: "orbital:glow" },
      "§c☄ Orbital Strike incoming..."
    );
    return;
  }

  if (itemStack.typeId === DDX_ITEM_ID) {
    player.dimension.playSound("orbital.ddx.song", player.location, { volume: 2.0 });
    executeStrike(player,
      "ddx_strike_kill",
      { explosion: "orbital:ddx_explosion", shockwave: "orbital:ddx_shockwave", glow: "orbital:ddx_glow", image: "orbital:ddx_image" },
      "§e☄ D/DX Strike incoming..."
    );
    return;
  }

  if (itemStack.typeId === INSTANT_ITEM_ID) {
    executeStrike(player,
      "instant_strike_kill",
      { explosion: "orbital:instant_explosion", shockwave: "orbital:instant_shockwave", glow: "orbital:instant_glow" },
      "§c⚡ Instant Strike!",
      { delay: 0 }
    );
    return;
  }

  if (itemStack.typeId === BIG_ITEM_ID) {
    executeStrike(player,
      "big_strike_kill",
      { explosion: "orbital:big_explosion", shockwave: "orbital:big_shockwave", glow: "orbital:big_glow" },
      "§5☄ Big Strike incoming...",
      { radius: BIG_STRIKE_RADIUS }
    );
    return;
  }
});

// ─── Load message ─────────────────────────────────────────────────────────────
world.afterEvents.worldInitialize.subscribe(() => {
  world.sendMessage("§b[Orbital Strike] §fLoaded. §e/give @s orbital:strike_beacon §7| §e/give @s orbital:ddx_beacon §7| §e/give @s orbital:instant_beacon §7| §e/give @s orbital:big_beacon");
});
