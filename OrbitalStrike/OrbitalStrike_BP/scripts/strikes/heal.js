import { world, system } from "@minecraft/server";
import { getTarget, getParticleSpawnPoints, FADE_TICKS, CAMSHAKE_RANGE } from "../shared.js";

export const ITEM_ID    = "orbital:heal_beacon";
export const RADIUS     = 5;
export const DELAY      = 40;
export const DEATH_TAG  = "heal_strike_kill"; // never applied — heal strike heals, not kills
export const ACTION_BAR = "§d✚ Heal Strike incoming...";
export const DEATH_MSG  = null;
export const PARTICLES  = {
  explosion: "orbital:heal_explosion",
  shockwave: "orbital:heal_shockwave",
  glow:      "orbital:heal_glow",
  image:     "orbital:heal_image"
};
export const PROTECTED  = new Set(); // unused

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player = ev.source;
  const dim    = player.dimension;
  const target = getTarget(player);
  const r2     = RADIUS ** 2;

  dim.playSound("random.orb",      target, { volume: 2.0, pitch: 0.4 });
  dim.playSound("beacon.activate", target, { volume: 1.5, pitch: 1.8 });
  player.onScreenDisplay.setActionBar(ACTION_BAR);

  system.runTimeout(() => {
    const minY = dim.heightRange.min;
    const maxY = dim.heightRange.max;
    const cx   = target.x, cz = target.z;
    const pcx  = cx + 0.5, pcz = cz + 0.5;

    dim.playSound("note.bell",    target, { volume: 4.0, pitch: 1.2 });
    dim.playSound("beacon.power", target, { volume: 2.0, pitch: 1.5 });
    dim.playSound("note.chime",   target, { volume: 3.0, pitch: 1.0 });

    for (const p of dim.getPlayers()) {
      const dx = p.location.x - cx, dz = p.location.z - cz;
      if (dx*dx + dz*dz <= (RADIUS * CAMSHAKE_RANGE) ** 2) {
        try { p.camera.shake(0.5, 0.5, "rotational"); } catch { /* ignore */ }
      }
    }

    const spawnPoints = getParticleSpawnPoints(cx, cz, RADIUS);
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
    for (let iy = minY; iy < maxY; iy += 12) {
      try { dim.spawnParticle(PARTICLES.image, { x: pcx, y: iy, z: pcz }); } catch { /* ignore */ }
    }

    // ── Apply healing effects to all entities in radius ─────────────────────────
    for (const entity of dim.getEntities()) {
      const dx = Math.floor(entity.location.x) - cx;
      const dz = Math.floor(entity.location.z) - cz;
      if (dx*dx + dz*dz <= r2) {
        try {
          entity.addEffect("instant_health", 1,   { amplifier: 9,  showParticles: true });
          entity.addEffect("regeneration",   200, { amplifier: 4,  showParticles: true });
          entity.addEffect("resistance",     200, { amplifier: 4,  showParticles: true });
          entity.addEffect("absorption",     200, { amplifier: 4,  showParticles: true });
        } catch { /* no effects component */ }
      }
    }

    system.runTimeout(() => {
      dim.playSound("beacon.deactivate", target, { volume: 1.5, pitch: 0.9 });
    }, FADE_TICKS);
  }, DELAY);
});
