import { world, system, GameMode } from "@minecraft/server";
import { getTarget, spawnIndicator } from "../shared.js";

export const ITEM_ID    = "orbital:singularity_beacon";
export const RADIUS     = 10;
export const DEATH_TAG  = "singularity_kill";
const MARKED_TAG = "singularity_marked";
export const ACTION_BAR = "§5☄ Singularity Strike incoming...";
export const DEATH_MSG  = name => `§5${name} §7was devoured by the §5Singularity`;

export const INDICATOR_FN = (player) => {
  spawnIndicator(player, 5);
  spawnIndicator(player, 10);
};

const SPAWN_TICKS  = 40;
const SUCK_TICKS   = 100;
const SUCK_RADIUS  = 10;
const BLAST_RADIUS = 20;

const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block"
]);

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player = ev.source;
  const dim    = player.dimension;
  const target = getTarget(player);

  player.onScreenDisplay.setActionBar(ACTION_BAR);
  dim.playSound("orbital.singularity.spawn", target, { volume: 3.0 });

  // Mark everyone in range immediately so they get pulled even if they flee
  const suckR2 = SUCK_RADIUS * SUCK_RADIUS;
  for (const ent of dim.getEntities()) {
    if (ent === player) continue;
    const ex = ent.location.x - target.x, ey = ent.location.y - target.y, ez = ent.location.z - target.z;
    if (ex*ex + ey*ey + ez*ez <= suckR2) try { ent.addTag(MARKED_TAG); } catch { }
  }

  let t = 0;
  const runId = system.runInterval(() => {
    t++;

    // ── Phase 1: Formation (ticks 1–40) ───────────────────────────────────────
    if (t <= SPAWN_TICKS) {
      dim.spawnParticle("orbital:singularity_form", target);
      if (t % 4 === 0) dim.spawnParticle("orbital:singularity_ring", target);
      if (t >= Math.floor(SPAWN_TICKS * 0.6)) dim.spawnParticle("orbital:singularity_core", target);
    }

    if (t === SPAWN_TICKS) {
      dim.playSound("orbital.singularity.loop", target, { volume: 3.0 });
    }

    // ── Phase 2: Active suction (ticks 41–140) ────────────────────────────────
    if (t > SPAWN_TICKS && t <= SPAWN_TICKS + SUCK_TICKS) {
      dim.spawnParticle("orbital:singularity_core", target);
      if (t % 2 === 0) dim.spawnParticle("orbital:singularity_ring", target);
      if (t % 3 === 0) dim.spawnParticle("orbital:singularity_pull", target);

      // Tag anyone who walked into range during formation
      for (const ent of dim.getEntities()) {
        if (ent === player) continue;
        const ex = ent.location.x - target.x, ey = ent.location.y - target.y, ez = ent.location.z - target.z;
        if (ex*ex + ey*ey + ez*ez <= suckR2) try { ent.addTag(MARKED_TAG); } catch { }
      }

      // Pull every marked entity regardless of how far they've run
      for (const ent of dim.getEntities()) {
        if (!ent.getTags().includes(MARKED_TAG)) continue;
        try {
          const el  = ent.location;
          const dx  = target.x - el.x;
          const dy  = target.y - el.y;
          const dz  = target.z - el.z;
          const d   = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (d > 0.3) ent.applyImpulse({ x: (dx/d)*0.45, y: (dy/d)*0.45, z: (dz/d)*0.45 });
          ent.addEffect("blindness", 40, { amplifier: 1, showParticles: false });
          ent.addTag(DEATH_TAG);
        } catch { }
      }

      // Sphere block destruction — one fill per vertical column inside the sphere,
      // using "air destroy" so blocks drop their items
      const elapsed = t - SPAWN_TICKS;
      if (elapsed % 10 === 1) {
        const r  = Math.ceil(elapsed / SUCK_TICKS * SUCK_RADIUS);
        const r2 = r * r;
        for (let bx = Math.floor(target.x - r); bx <= Math.ceil(target.x + r); bx++) {
          for (let bz = Math.floor(target.z - r); bz <= Math.ceil(target.z + r); bz++) {
            const xz2 = (bx - target.x) * (bx - target.x) + (bz - target.z) * (bz - target.z);
            if (xz2 > r2) continue;
            const yHalf = Math.sqrt(r2 - xz2);
            const y1 = Math.floor(target.y - yHalf);
            const y2 = Math.ceil(target.y + yHalf);
            try { player.runCommand(`fill ${bx} ${y1} ${bz} ${bx} ${y2} ${bz} air destroy`); } catch { }
          }
        }
      }
    }

    // ── Phase 3: Explosion (tick 141) ─────────────────────────────────────────
    if (t === SPAWN_TICKS + SUCK_TICKS) {
      system.clearRun(runId);
      dim.playSound("orbital.singularity.explode", target, { volume: 4.0 });
      dim.spawnParticle("orbital:singularity_burst", target);

      // Kill everything in suck radius — works in creative mode, skips dropped items
      for (const ent of dim.getEntities({ location: target, maxDistance: SUCK_RADIUS })) {
        if (ent.typeId === "minecraft:item") continue;
        try {
          if (!ent.getTags().includes(DEATH_TAG)) ent.addTag(DEATH_TAG);
          let gm;
          if (ent.typeId === "minecraft:player") {
            gm = ent.getGameMode();
            ent.setGameMode(GameMode.survival);
          }
          ent.kill();
          if (ent.typeId === "minecraft:player") ent.setGameMode(gm);
        } catch { }
      }

      // Clean up the marked tag from any survivors
      for (const ent of dim.getEntities()) {
        if (ent.getTags().includes(MARKED_TAG)) try { ent.removeTag(MARKED_TAG); } catch { }
      }

      // Knock back everything in blast radius
      for (const ent of dim.getEntities({ location: target, maxDistance: BLAST_RADIUS })) {
        try {
          const el   = ent.location;
          const dx   = el.x - target.x;
          const dy   = el.y - target.y;
          const dz   = el.z - target.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (dist > 0.1) {
            ent.applyImpulse({ x: (dx/dist)*3.5, y: Math.max(0, dy/dist)*2+0.8, z: (dz/dist)*3.5 });
          }
        } catch { }
      }
    }
  }, 1);
});
