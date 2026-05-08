import { world, BlockPermutation, GameMode } from "@minecraft/server";

export const ITEM_ID   = "orbital:laser_beacon";
export const DEATH_TAG = "laser_strike_kill";
export const DEATH_MSG = null; // handled internally — needs killer name context

export const RANGE = 50; // blocks
export const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block"
]);

// Tracks who fired the laser at which entity: entity.id -> killerName
const laserKills = new Map();

// ─── Fire on item use ─────────────────────────────────────────────────────────
world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player = ev.source;
  const dim    = player.dimension;
  const loc    = player.location;
  const dir    = player.getViewDirection();
  const eyeX = loc.x, eyeY = loc.y + 1.62, eyeZ = loc.z;
  const air  = BlockPermutation.resolve("minecraft:air");
  const killerName = player.name ?? "someone";

  player.onScreenDisplay.setActionBar("§f⚡ Laser Strike fired!");

  // ── Tag and record entities in beam path ────────────────────────────────────
  for (const entity of dim.getEntities()) {
    if (entity === player) continue;
    const dx = entity.location.x - eyeX;
    const dy = (entity.location.y + 0.9) - eyeY;
    const dz = entity.location.z - eyeZ;
    const dot = dx * dir.x + dy * dir.y + dz * dir.z;
    if (dot < 0 || dot > RANGE) continue;
    const perpSq = (dx*dx + dy*dy + dz*dz) - dot*dot;
    if (perpSq <= 1.0) {
      try {
        entity.addTag(DEATH_TAG);
        laserKills.set(entity.id, killerName);
      } catch { /* ignore */ }
    }
  }

  // ── Perpendicular basis for 2-wide block destruction ────────────────────────
  // p1: horizontal vector perpendicular to dir; p2: cross(dir, p1)
  const hlen = Math.hypot(dir.x, dir.z);
  const p1x = hlen > 0.01 ? -dir.z / hlen : 1, p1z = hlen > 0.01 ? dir.x / hlen : 0;
  const p2x = dir.y * p1z, p2y = dir.z * p1x - dir.x * p1z, p2z = -dir.y * p1x;
  const PERP_OFFSETS = [
    [0, 0, 0],
    [Math.round(p1x), 0,                Math.round(p1z)],
    [-Math.round(p1x), 0,               -Math.round(p1z)],
    [Math.round(p2x),  Math.round(p2y), Math.round(p2z)],
    [-Math.round(p2x), -Math.round(p2y),-Math.round(p2z)],
  ];

  // ── Destroy blocks and spawn beam particles along path ──────────────────────
  const seen = new Set();
  const STEP = 0.3;
  const steps = Math.floor(RANGE / STEP);
  for (let i = 1; i <= steps; i++) {
    const t  = i * STEP;
    const px = eyeX + dir.x * t;
    const py = eyeY + dir.y * t;
    const pz = eyeZ + dir.z * t;

    // Beam particle (every 0.6 blocks to keep particle count reasonable)
    if (i % 2 === 0) {
      try { dim.spawnParticle("orbital:laser_beam", { x: px, y: py, z: pz }); } catch { /* ignore */ }
    }

    const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);

    for (const [ox, oy, oz] of PERP_OFFSETS) {
      const cx = bx + ox, cy = by + oy, cz = bz + oz;
      const key = `${cx},${cy},${cz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const block = dim.getBlock({ x: cx, y: cy, z: cz });
        if (block && !PROTECTED.has(block.typeId) &&
            block.typeId !== "minecraft:air" && block.typeId !== "minecraft:cave_air") {
          block.setPermutation(air);
        }
      } catch { /* unloaded */ }
    }
  }

  // ── Kill tagged entities ─────────────────────────────────────────────────────
  for (const entity of dim.getEntities()) {
    if (!entity.hasTag(DEATH_TAG)) continue;
    try {
      let gm;
      if (entity.typeId === "minecraft:player") {
        gm = entity.getGameMode();
        entity.setGameMode(GameMode.survival);
      }
      entity.kill();
      if (entity.typeId === "minecraft:player") entity.setGameMode(gm);
    } catch { /* already dead */ }
  }
});

// ─── Death message (internal — needs killer name) ─────────────────────────────
world.afterEvents.entityDie.subscribe(ev => {
  const entity = ev.deadEntity;
  if (!entity.hasTag(DEATH_TAG)) return;
  try {
    const victimName = entity.nameTag?.trim() ||
      (entity.typeId === "minecraft:player"
        ? (entity.name ?? "A player")
        : entity.typeId.replace("minecraft:", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    const killer = laserKills.get(entity.id) ?? "someone";
    laserKills.delete(entity.id);
    entity.removeTag(DEATH_TAG);
    world.sendMessage(`§f${victimName} §7was §clasered §7by §f${killer}`);
  } catch { /* ignore */ }
});
