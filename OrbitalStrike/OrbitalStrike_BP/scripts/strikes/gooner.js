import { world, system, Difficulty } from "@minecraft/server";
import { getTarget, getParticleSpawnPoints } from "../shared.js";

export const ITEM_ID    = "orbital:gooner_beacon";
export const RADIUS     = 10;
export const DEATH_TAG  = "gooner_strike_kill";
export const ACTION_BAR = "§d☄ Gooner Strike deployed... §b♥";
export const DEATH_MSG  = name => `§d${name} §7got §dgoonered §7by a §dGooner Strike §b♥`;
export const PARTICLES  = {
  explosion: "orbital:gooner_explosion",
  shockwave: "orbital:gooner_shockwave",
  glow:      "orbital:gooner_glow"
};
export const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block"
]);

const DESPAWN_TICKS = 600; // 30 seconds

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player = ev.source;
  const dim    = player.dimension;
  const target = getTarget(player);

  // Audio + action bar
  try { dim.playSound("orbital.target_lock", target, { volume: 2.0, pitch: 1.0 }); } catch {}
  try { dim.playSound("beacon.activate",     target, { volume: 1.5, pitch: 0.5 }); } catch {}
  player.onScreenDisplay.setActionBar(ACTION_BAR);

  // Bump out of peaceful so entities can exist
  if (world.getDifficulty() === Difficulty.Peaceful) {
    try { world.setDifficulty(Difficulty.Easy); } catch {}
  }

  // Spawn 50 e-girls evenly fanned around the target, each with a unique skin
  const spawned = [];
  for (let i = 0; i < 100; i++) {
    const angle = (i / 100) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
    const dist  = 1.5 + Math.random() * (RADIUS - 2);
    const sx    = target.x + 0.5 + Math.cos(angle) * dist;
    const sz    = target.z + 0.5 + Math.sin(angle) * dist;
    try {
      const ent = dim.spawnEntity("orbital:e_girl", { x: sx, y: target.y + 1, z: sz });
      ent.setProperty("orbital:skin_index", (i % 50) + 1);
      spawned.push(ent);
    } catch {}
  }

  // Particle burst at target
  const spawnPts = getParticleSpawnPoints(target.x, target.z, RADIUS);
  for (const sp of spawnPts) {
    try { dim.spawnParticle(PARTICLES.shockwave, { x: sp.x, y: target.y,     z: sp.z }); } catch {}
    try { dim.spawnParticle(PARTICLES.shockwave, { x: sp.x, y: target.y + 1, z: sp.z }); } catch {}
    try { dim.spawnParticle(PARTICLES.glow,      { x: sp.x, y: target.y + 2, z: sp.z }); } catch {}
    try { dim.spawnParticle(PARTICLES.explosion, { x: sp.x, y: target.y,     z: sp.z }); } catch {}
  }

  // Camera shake nearby players
  for (const p of dim.getPlayers()) {
    const dx = p.location.x - target.x, dz = p.location.z - target.z;
    if (dx * dx + dz * dz <= (RADIUS * 2) ** 2) {
      try { p.camera.shake(0.6, 0.4, "rotational"); } catch {}
    }
  }

  // Each entity gets a random 0-1 s initial delay, then loops every 76 ticks
  const SONG_TICKS = 76;
  const nextPlay = spawned.map(() => system.currentTick + Math.floor(Math.random() * 61));
  const songInterval = system.runInterval(() => {
    const now = system.currentTick;
    for (let i = 0; i < spawned.length; i++) {
      if (now >= nextPlay[i]) {
        try {
          if (spawned[i].isValid()) dim.playSound("orbital.e_girl.song", spawned[i].location);
        } catch {}
        nextPlay[i] = now + SONG_TICKS;
      }
    }
  }, 4);

  // Despawn e-girls after 30 s
  system.runTimeout(() => {
    system.clearRun(songInterval);
    for (const ent of spawned) {
      try { ent.kill(); } catch {}
    }
  }, DESPAWN_TICKS);
});
