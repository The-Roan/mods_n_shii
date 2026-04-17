import {
  world,
  system,
  BlockPermutation,
  GameMode,
} from "@minecraft/server";

// ─── Constants ────────────────────────────────────────────────────────────────
const STRIKE_ITEM_ID  = "orbital:strike_beacon";
const STRIKE_BLOCK_ID = "orbital:strike_block";
const STRIKE_RADIUS   = 5;
const EFFECT_TICKS    = 20000000;
const CYLINDER_DELAY  = 40;
const FADE_TICKS      = 20;
const MAX_RANGE       = 100;
const INDICATOR_STEPS = 32;

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

// ─── Is player holding the beacon ────────────────────────────────────────────
function isHoldingBeacon(player) {
  try {
    const held = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
    return held?.typeId === STRIKE_ITEM_ID;
  } catch { return false; }
}

// ─── Indicator ────────────────────────────────────────────────────────────────
function spawnIndicator(player) {
  const dim    = player.dimension;
  const target = getTarget(player);
  for (let i = 0; i < INDICATOR_STEPS; i++) {
    const angle = (i / INDICATOR_STEPS) * Math.PI * 2;
    const px = target.x + 0.5 + Math.cos(angle) * (STRIKE_RADIUS + 0.5);
    const pz = target.z + 0.5 + Math.sin(angle) * (STRIKE_RADIUS + 0.5);
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
  const r2   = STRIKE_RADIUS * STRIKE_RADIUS;
  for (let x = cx - STRIKE_RADIUS; x <= cx + STRIKE_RADIUS; x++) {
    for (let z = cz - STRIKE_RADIUS; z <= cz + STRIKE_RADIUS; z++) {
      if ((x-cx)*(x-cx) + (z-cz)*(z-cz) <= r2) {
        for (let y = minY; y < maxY; y++) out.push({ x, y, z });
      }
    }
  }
  return out;
}

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
  const air = BlockPermutation.resolve("minecraft:air");
  for (const pos of positions) {
    try {
      const block = dimension.getBlock(pos);
      if (block && block.typeId === STRIKE_BLOCK_ID) block.setPermutation(air);
    } catch { /* ignore */ }
  }
}

// ─── Active cylinders (unused in particle mode, ready for block mode) ─────────
const activeCylinders = new Map();
let strikeId = 0;

// ─── Indicator loop ───────────────────────────────────────────────────────────
system.runInterval(() => {
  for (const player of world.getPlayers()) {
    if (isHoldingBeacon(player)) spawnIndicator(player);
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
    // In particle mode, check if entity died near the strike target via tag
    const name = entity.nameTag?.trim() ||
      (entity.typeId === "minecraft:player"
        ? (entity.name ?? "A player")
        : entity.typeId.replace("minecraft:", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    if (entity.hasTag("orbital_strike_kill")) {
      world.sendMessage(`§c${name} §7was obliterated by an orbital strike`);
      entity.removeTag("orbital_strike_kill");
    }
  } catch { /* ignore */ }
});

// ─── Item use ─────────────────────────────────────────────────────────────────
world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== STRIKE_ITEM_ID) return;

  const player    = ev.source;
  const dimension = player.dimension;
  const target    = getTarget(player);
  const r2        = STRIKE_RADIUS * STRIKE_RADIUS;

  dimension.playSound("random.orb",      target, { volume: 2.0, pitch: 0.4 });
  dimension.playSound("beacon.activate", target, { volume: 1.5, pitch: 1.8 });
  player.onScreenDisplay.setActionBar("§c☄ Orbital Strike incoming...");

  // Effects across full cylinder column
  for (const entity of dimension.getEntities()) {
    const dx = Math.floor(entity.location.x) - target.x;
    const dz = Math.floor(entity.location.z) - target.z;
    if (dx * dx + dz * dz <= r2) {
      try {
        entity.addTag("orbital_strike_kill");
        entity.addEffect("slowness",  EFFECT_TICKS, { amplifier: 100, showParticles: false });
        entity.addEffect("blindness", EFFECT_TICKS, { amplifier: 0,   showParticles: false });
        entity.addEffect("resistance", EFFECT_TICKS, { amplifier: 50,   showParticles: false });
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

    // Camera shake for all players within 2x strike radius
    for (const p of dimension.getPlayers()) {
      const dx = p.location.x - cx;
      const dz = p.location.z - cz;
      if (dx * dx + dz * dz <= (STRIKE_RADIUS * 2) ** 2) {
        try { p.camera.shake(1.0, 0.5, "rotational"); } catch { /* ignore */ }
      }
    }

    // Particles
    const pcx = cx + 0.5, pcz = cz + 0.5;
    try { dimension.spawnParticle("orbital:shockwave", { x: pcx, y: target.y,     z: pcz }); } catch { /* ignore */ }
    try { dimension.spawnParticle("orbital:shockwave", { x: pcx, y: target.y + 1, z: pcz }); } catch { /* ignore */ }
    // Explosion fireballs from bedrock to world height
    for (let hy = minY; hy < maxY; hy += 8) {
      try { dimension.spawnParticle("orbital:explosion", { x: pcx, y: hy, z: pcz }); } catch { /* ignore */ }
    }
    // Glow wisps from bedrock to world height
    for (let gy = minY; gy < maxY; gy += 4) {
      try { dimension.spawnParticle("orbital:glow", { x: pcx, y: gy, z: pcz }); } catch { /* ignore */ }
    }
    try { dimension.spawnParticle("minecraft:huge_explosion_emitter", { x: pcx, y: target.y,      z: pcz }); } catch { /* ignore */ }
    try { dimension.spawnParticle("minecraft:huge_explosion_emitter", { x: pcx, y: minY + 10,     z: pcz }); } catch { /* ignore */ }

    // Carve hole + kill entities
    for (let x = cx - STRIKE_RADIUS; x <= cx + STRIKE_RADIUS; x++) {
      for (let z = cz - STRIKE_RADIUS; z <= cz + STRIKE_RADIUS; z++) {
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
      if (dx * dx + dz * dz <= r2 || entity.getTags().includes("orbital_strike_kill")) {
        try {
          if(!entity.getTags().includes("orbital_strike_kill")){
            entity.addTag("orbital_strike_kill");
          }
          let gm;
          if (entity.typeId === "minecraft:player"){
            gm = entity.getGameMode();
            entity.setGameMode(GameMode.survival);
          }
          entity.kill();
          if(entity.typeId === "minecraft:player"){
            entity.setGameMode(gm);
          }
        } catch { /* already dead */ }
      }
    }

    system.runTimeout(() => {
      dimension.playSound("beacon.deactivate", target, { volume: 1.5, pitch: 0.9 });
    }, FADE_TICKS);

  }, CYLINDER_DELAY);
});

// ─── Load message ─────────────────────────────────────────────────────────────
world.afterEvents.worldInitialize.subscribe(() => {
  world.sendMessage("§b[Orbital Strike] §fLoaded. §e/give @s orbital:strike_beacon");
});
