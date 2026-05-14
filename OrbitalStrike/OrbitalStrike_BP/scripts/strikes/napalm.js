import { world, system, BlockPermutation, GameMode } from "@minecraft/server";
import { getTarget, spawnIndicator, EFFECT_TICKS, FADE_TICKS, CAMSHAKE_RANGE, getParticleSpawnPoints } from "../shared.js";

export const ITEM_ID    = "orbital:napalm_beacon";
export const RADIUS     = 5;
export const DEATH_TAG  = "napalm_strike_kill";
export const ACTION_BAR = "§6☄ Napalm Strike incoming...";
export const DEATH_MSG  = name => `§6${name} §7was incinerated by a napalm strike`;
export const PARTICLES  = {
  explosion: "orbital:napalm_explosion",
  shockwave: "orbital:napalm_shockwave",
  glow:      "orbital:napalm_glow"
};
export const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block"
]);

const KILL_RADIUS   = 5;
const CRATER_RADIUS = 10;
const CRATER_DEPTH  = 5;  // max carve depth at center
const DELAY         = 60;

// Two rings: inner kill zone + outer fire zone
export const INDICATOR_FN = (player) => {
  spawnIndicator(player, KILL_RADIUS);
  spawnIndicator(player, CRATER_RADIUS);
};

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player  = ev.source;
  const dim     = player.dimension;
  const target  = getTarget(player);
  const killR2  = KILL_RADIUS   * KILL_RADIUS;
  const craterR2 = CRATER_RADIUS * CRATER_RADIUS;

  dim.playSound("random.orb",      target, { volume: 2.0, pitch: 0.4 });
  dim.playSound("beacon.activate", target, { volume: 1.5, pitch: 1.8 });
  player.onScreenDisplay.setActionBar(ACTION_BAR);

  for (const entity of dim.getEntities()) {
    const dx = Math.floor(entity.location.x) - target.x;
    const dz = Math.floor(entity.location.z) - target.z;
    if (dx*dx + dz*dz <= killR2) {
      try {
        entity.addTag(DEATH_TAG);
        entity.addEffect("slowness",   EFFECT_TICKS, { amplifier: 100, showParticles: false });
        entity.addEffect("blindness",  EFFECT_TICKS, { amplifier: 0,   showParticles: false });
        entity.addEffect("resistance", EFFECT_TICKS, { amplifier: 50,  showParticles: false });
        entity.addEffect("wither",     EFFECT_TICKS, { amplifier: 1,   showParticles: false });
      } catch { /* no effects component */ }
    }
  }

  system.runTimeout(() => {
    const minY = dim.heightRange.min;
    const maxY = dim.heightRange.max;
    const cx = target.x, cz = target.z;
    const air  = BlockPermutation.resolve("minecraft:air");
    const fire = BlockPermutation.resolve("minecraft:fire");

    dim.playSound("random.explode", target, { volume: 4.0, pitch: 0.4 });
    dim.playSound("beacon.power",   target, { volume: 2.0, pitch: 0.7 });
    dim.playSound("random.explode", target, { volume: 3.0, pitch: 0.5 });
    dim.playSound("fire.ignite",    target, { volume: 3.0, pitch: 0.6 });

    for (const p of dim.getPlayers()) {
      const dx = p.location.x - cx;
      const dz = p.location.z - cz;
      if (dx*dx + dz*dz <= (CRATER_RADIUS * CAMSHAKE_RANGE) ** 2) {
        try { p.camera.shake(1.2, 0.6, "rotational"); } catch { /* ignore */ }
      }
    }

    const spawnPoints = getParticleSpawnPoints(cx, cz, CRATER_RADIUS);
    for (const sp of spawnPoints) {
      try { dim.spawnParticle(PARTICLES.shockwave, { x: sp.x, y: target.y,     z: sp.z }); } catch { /* ignore */ }
      try { dim.spawnParticle(PARTICLES.shockwave, { x: sp.x, y: target.y + 1, z: sp.z }); } catch { /* ignore */ }
    }
    for (let hy = minY; hy < maxY; hy += 8) {
      for (const sp of spawnPoints) {
        try { dim.spawnParticle(PARTICLES.explosion, { x: sp.x, y: hy, z: sp.z }); } catch { /* ignore */ }
      }
    }
    for (let gy = minY; gy < maxY; gy += 4) {
      for (const sp of spawnPoints) {
        try { dim.spawnParticle(PARTICLES.glow, { x: sp.x, y: gy, z: sp.z }); } catch { /* ignore */ }
      }
    }
    for (const sp of spawnPoints) {
      try { dim.spawnParticle("minecraft:huge_explosion_emitter", { x: sp.x, y: target.y, z: sp.z }); } catch { /* ignore */ }
    }

    // ─── Carve crater and fill with fire ──────────────────────────────────────
    for (let x = cx - CRATER_RADIUS; x <= cx + CRATER_RADIUS; x++) {
      for (let z = cz - CRATER_RADIUS; z <= cz + CRATER_RADIUS; z++) {
        const dist2 = (x-cx)*(x-cx) + (z-cz)*(z-cz);
        if (dist2 > craterR2) continue;

        // Bowl depth: hemisphere formula — deeper at center, 0 at edge
        const depth = Math.floor(Math.sqrt(Math.max(0, craterR2 - dist2)) * (CRATER_DEPTH / CRATER_RADIUS));
        const scanTop = Math.min(target.y + 5, maxY - 1);

        // Remove blocks from surface downward for crater depth
        for (let y = scanTop; y >= target.y - depth; y--) {
          try {
            const block = dim.getBlock({ x, y, z });
            if (block && block.typeId !== "minecraft:air" && block.typeId !== "minecraft:cave_air" && !PROTECTED.has(block.typeId)) {
              block.setPermutation(air);
            }
          } catch { /* unloaded */ }
        }

        // Place fire on the first solid block remaining after carving
        for (let y = scanTop; y >= minY; y--) {
          try {
            const block = dim.getBlock({ x, y, z });
            if (!block) continue;
            if (block.typeId !== "minecraft:air" && block.typeId !== "minecraft:cave_air") {
              const above = dim.getBlock({ x, y: y + 1, z });
              if (above && (above.typeId === "minecraft:air" || above.typeId === "minecraft:cave_air")) {
                above.setPermutation(fire);
              }
              break;
            }
          } catch { /* ignore */ }
        }
      }
    }

    // ─── Kill inner radius ─────────────────────────────────────────────────────
    for (const entity of dim.getEntities()) {
      const dx = Math.floor(entity.location.x) - cx;
      const dz = Math.floor(entity.location.z) - cz;
      const d2 = dx*dx + dz*dz;
      if (d2 <= killR2 || entity.getTags().includes(DEATH_TAG)) {
        try {
          if (!entity.getTags().includes(DEATH_TAG)) entity.addTag(DEATH_TAG);
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
      dim.playSound("beacon.deactivate", target, { volume: 1.5, pitch: 0.9 });
    }, FADE_TICKS);
  }, DELAY);
});
