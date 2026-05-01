import { system, BlockPermutation, GameMode } from "@minecraft/server";

// ─── Generic constants ────────────────────────────────────────────────────────
export const EFFECT_TICKS    = 20000000;
export const FADE_TICKS      = 20;
export const MAX_RANGE       = 50;
export const INDICATOR_STEPS = 32;
export const CAMSHAKE_RANGE  = 2;
export const STRIKE_BLOCK_ID = "orbital:strike_block"; // unused

export const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block"
]);

// ─── Raycast ──────────────────────────────────────────────────────────────────
export function getTarget(player) {
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
export function spawnIndicator(player, radius) {
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
export function getCylinderPositions(dimension, cx, cz, radius) {
  const minY = dimension.heightRange.min;
  const maxY = dimension.heightRange.max;
  const out  = [];
  const r2   = radius ** 2;
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      if ((x-cx)*(x-cx) + (z-cz)*(z-cz) <= r2) {
        for (let y = minY; y < maxY; y++) out.push({ x, y, z });
      }
    }
  }
  return out;
}

// unused
export function placeCylinder(dimension, cx, cz, radius) {
  const perm    = BlockPermutation.resolve(STRIKE_BLOCK_ID);
  const changed = [];
  for (const pos of getCylinderPositions(dimension, cx, cz, radius)) {
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

export function removeCylinder(dimension, positions) {
  const air = "minecraft:air";
  for (const pos of positions) {
    try {
      const block = dimension.getBlock(pos);
      if (block && block.typeId === STRIKE_BLOCK_ID) block.setPermutation(air);
    } catch { /* ignore */ }
  }
}

export const activeCylinders = new Map();

// ─── Particle spawn point grid (center + rings for large radii) ───────────────
function getParticleSpawnPoints(cx, cz, radius) {
  const pcx = cx + 0.5, pcz = cz + 0.5;
  const points = [{ x: pcx, z: pcz }];
  if (radius <= 5) return points;

  const addRing = (r) => {
    const count = Math.max(6, Math.round(2 * Math.PI * r / 5));
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      points.push({ x: pcx + Math.cos(angle) * r, z: pcz + Math.sin(angle) * r });
    }
  };
  for (let r = 5; r < radius; r += 5) addRing(r);
  addRing(radius - 1);
  return points;
}

// ─── Strike execution engine ──────────────────────────────────────────────────
export function executeStrike(player, deathTag, particles, actionBarMsg, radius, delay) {
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
