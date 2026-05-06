import { world, system } from "@minecraft/server";
import { executeStrike, INDICATOR_STEPS } from "../shared.js";

export const ITEM_ID       = "orbital:throwable_beacon";
export const RADIUS        = 5;
export const DEATH_TAG     = "throwable_strike_kill";
export const ACTION_BAR    = "§a☄ Throwable Strike incoming...";
export const DEATH_MSG     = name => `§a${name} §7was exploded by a tick strike`;
export const PARTICLES     = {
  explosion: "orbital:throwable_explosion",
  shockwave: "orbital:throwable_shockwave",
  glow:      "orbital:throwable_glow"
};
export const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block"
]);

// Physics constants — used for the indicator simulation
const THROW_SPEED   = 1.5;  // blocks/tick
const THROW_GRAVITY = 0.04; // blocks/tick^2 — matches Bedrock snowball entity gravity
const MIN_H         = 0.25; // minimum horizontal component — prevents landing on player when aiming steeply

// When looking nearly straight up/down, hlen ≈ 0 so the ball spawns at the player
// and has no horizontal travel. Enforce a minimum horizontal component using body yaw.
function getThrowDir(player) {
  const dir  = player.getViewDirection();
  const hlen = Math.hypot(dir.x, dir.z);
  if (hlen >= MIN_H) return dir;
  const yawRad = player.getRotation().y * (Math.PI / 180);
  return { x: -Math.sin(yawRad) * MIN_H, y: dir.y, z: Math.cos(yawRad) * MIN_H };
}

// Tracks in-flight balls by entity ID: id -> { player, spawnTick }
const pendingStrikes = new Map();

// ─── Strike circle indicator (predicted landing ring) ─────────────────────────
const SPAWN_DIST = 1.0; // how far ahead the ball spawns — must match throw handler

export const INDICATOR_FN = (player) => {
  const dim = player.dimension;
  const loc = player.location;
  const dir = getThrowDir(player);
  const tdH = Math.hypot(dir.x, dir.z);
  let x = loc.x + (dir.x / tdH) * SPAWN_DIST;
  let y = loc.y + 1.62;
  let z = loc.z + (dir.z / tdH) * SPAWN_DIST;
  let vx = dir.x * THROW_SPEED, vy = dir.y * THROW_SPEED, vz = dir.z * THROW_SPEED;
  let landX = Math.floor(x), landY = Math.floor(y), landZ = Math.floor(z);

  for (let t = 0; t < 60; t++) {
    x += vx; y += vy; z += vz;
    vy -= THROW_GRAVITY;
    try {
      const block = dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
      if (block && block.typeId !== "minecraft:air" && block.typeId !== "minecraft:cave_air") {
        landX = Math.floor(x); landY = Math.floor(y); landZ = Math.floor(z);
        break;
      }
    } catch { break; }
    landX = Math.floor(x); landY = Math.floor(y); landZ = Math.floor(z);
  }

  for (let i = 0; i < INDICATOR_STEPS; i++) {
    const angle = (i / INDICATOR_STEPS) * Math.PI * 2;
    const px = landX + 0.5 + Math.cos(angle) * (RADIUS + 0.5);
    const pz = landZ + 0.5 + Math.sin(angle) * (RADIUS + 0.5);
    for (const py of [landY + 0.1, landY + 0.6, landY + 1.1]) {
      try { dim.spawnParticle("minecraft:basic_flame_particle", { x: px, y: py, z: pz }); } catch { /* ignore */ }
    }
  }
};

// ─── Throw on item use ────────────────────────────────────────────────────────
world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player = ev.source;
  const td     = getThrowDir(player);
  const tdH    = Math.hypot(td.x, td.z);
  const spawnPos = {
    x: player.location.x + (td.x / tdH) * SPAWN_DIST,
    y: player.location.y + 1.62,
    z: player.location.z + (td.z / tdH) * SPAWN_DIST
  };

  try {
    // Snowball has reliable physics and responds correctly to applyImpulse
    const ball = player.dimension.spawnEntity("minecraft:snowball", spawnPos);
    ball.addTag("throwable_strike_projectile");
    pendingStrikes.set(ball.id, { player, spawnTick: system.currentTick });
    // Defer by one tick so the entity is fully initialised before impulse is applied
    system.run(() => {
      try {
        ball.applyImpulse({ x: td.x * THROW_SPEED, y: td.y * THROW_SPEED, z: td.z * THROW_SPEED });
      } catch { /* ignore */ }
    });
  } catch { /* ignore */ }

  player.onScreenDisplay.setActionBar(ACTION_BAR);
});

// ─── Detonate on block hit ────────────────────────────────────────────────────
world.afterEvents.projectileHitBlock.subscribe(ev => {
  const data = pendingStrikes.get(ev.projectile.id);
  if (!data) return;
  pendingStrikes.delete(ev.projectile.id);
  const target = {
    x: Math.floor(ev.location.x),
    y: Math.floor(ev.location.y),
    z: Math.floor(ev.location.z)
  };
  try { ev.projectile.kill(); } catch { /* ignore */ }
  executeStrike(data.player, DEATH_TAG, PARTICLES, ACTION_BAR, RADIUS, 0, PROTECTED, target);
});

// ─── Also detonate on entity hit ─────────────────────────────────────────────
world.afterEvents.projectileHitEntity.subscribe(ev => {
  const data = pendingStrikes.get(ev.projectile.id);
  if (!data) return;
  // Ignore self-hit (can happen when sprinting — player walks into the ball before impulse fires)
  if (ev.hitEntity.id === data.player.id) return;
  pendingStrikes.delete(ev.projectile.id);
  const target = {
    x: Math.floor(ev.location.x),
    y: Math.floor(ev.location.y),
    z: Math.floor(ev.location.z)
  };
  try { ev.projectile.kill(); } catch { /* ignore */ }
  executeStrike(data.player, DEATH_TAG, PARTICLES, ACTION_BAR, RADIUS, 0, PROTECTED, target);
});

// ─── TTL cleanup for balls that fly into the void or unloaded chunks ──────────
system.runInterval(() => {
  if (pendingStrikes.size === 0) return;
  const now = system.currentTick;
  for (const [id, data] of pendingStrikes) {
    if (now - data.spawnTick > 200) pendingStrikes.delete(id);
  }
}, 40);
