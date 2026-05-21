import { world, system, GameMode } from "@minecraft/server";
import { getTarget, spawnIndicator } from "../shared.js";

export const ITEM_ID    = "orbital:ultimate_ddx_singularity_beacon";
export const RADIUS     = 10;
export const DEATH_TAG  = "event_horizon_kill";
const MARKED_TAG = "event_horizon_marked";
export const ACTION_BAR = "§d☄ Ultimate D/DX Singularity Strike incoming...";
export const DEATH_MSG  = name => `§d${name} §7fell into §l§cD§6/§eD§2X §bA§9S§5S§dH§c0§6L§eE`;

export const INDICATOR_FN = (player) => {
  spawnIndicator(player, 5);
  spawnIndicator(player, 10);
};

const SPAWN_TICKS   = 40;   // 2 s formation
const SUCK_TICKS    = 300;  // 15 s active suction
const BASE_RADIUS   = 5.0;  // initial event-horizon radius; suck radius = radius × 2
const BLOCK_GROWTH  = 0.4;  // radius added per fill-cycle (every 10 ticks)
const ENTITY_GROWTH = 1.5;  // radius added per entity killed at centre

// Orbiting orb definitions — ax/ay/az and bx/by/bz are perpendicular unit vectors
// that define the orbital plane.  Position = center + r*(A*cos(a) + B*sin(a))
const ORBITS = [
  // m  = radius multiplier (actual r = radius * m) — kept close to the disc edge
  // s  = angular speed in radians/tick
  // n  = BASE number of orbs (scales up with radius at spawn time)
  // ph = starting phase offset
  { m:0.9,  s:0.05, n:2, ph:0.0, ax:1, ay:0,     az:0,     bx:0,     by:0,     bz:1     }, // flat
  { m:1.05, s:0.03, n:2, ph:1.0, ax:1, ay:0,     az:0,     bx:0,     by:1,     bz:0     }, // vertical N/S
  { m:1.2,  s:0.07, n:1, ph:2.1, ax:0, ay:0,     az:1,     bx:0,     by:1,     bz:0     }, // vertical E/W
  { m:0.95, s:0.04, n:2, ph:0.5, ax:1, ay:0,     az:0,     bx:0,     by:0.707, bz:0.707 }, // 45° tilt toward N
  { m:1.1,  s:0.08, n:1, ph:3.1, ax:0, ay:0,     az:1,     bx:0.707, by:0.707, bz:0     }, // 45° tilt toward E
];

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player = ev.source;
  const dim    = player.dimension;
  const target = getTarget(player);

  player.onScreenDisplay.setActionBar(ACTION_BAR);
  dim.playSound("orbital.event_horizon.spawn", target, { volume: 3.0 });

  let radius = BASE_RADIUS;

  // Tag everyone already inside the initial suck radius so they can't escape
  const initSuckR2 = (BASE_RADIUS * 2) ** 2;
  for (const ent of dim.getEntities()) {
    if (ent.typeId === "orbital:event_horizon_entity") continue;
    const el = ent.location;
    const ex = el.x - target.x, ey = el.y - target.y, ez = el.z - target.z;
    if (ex*ex + ey*ey + ez*ez <= initSuckR2) try { ent.addTag(MARKED_TAG); } catch {}
  }

  let t = 0;
  let prevFillR = 0;
  let bhEntity  = null;

  const runId = system.runInterval(() => {
    t++;

    const suckR  = radius * 2;
    const suckR2 = suckR * suckR;

    // ── Orbiting orb particles (active whole lifetime) ────────────────────────
    if (t <= SPAWN_TICKS + SUCK_TICKS) {
      for (const o of ORBITS) {
        const r     = radius * o.m;
        const nOrbs = Math.min(12, Math.ceil(o.n * radius / BASE_RADIUS));
        for (let i = 0; i < nOrbs; i++) {
          const a = t * o.s + o.ph + (i / nOrbs) * Math.PI * 2;
          dim.spawnParticle("orbital:event_horizon_core", {
            x: target.x + r * (o.ax * Math.cos(a) + o.bx * Math.sin(a)),
            y: target.y + r * (o.ay * Math.cos(a) + o.by * Math.sin(a)),
            z: target.z + r * (o.az * Math.cos(a) + o.bz * Math.sin(a))
          });
        }
      }
    }

    // ── Phase 1: Formation — spawn entity and play sounds ─────────────────────
    if (t === 1) {
      dim.playSound("orbital.event_horizon.song", target, { volume: 3.0 });
      try { bhEntity = dim.spawnEntity("orbital:event_horizon_entity", target); } catch {}
    }
    if (t === SPAWN_TICKS) {
      dim.playSound("orbital.event_horizon.loop", target, { volume: 3.0 });
    }

    // ── Phase 2: Active suction (ticks 41–640) ────────────────────────────────
    if (t > SPAWN_TICKS && t <= SPAWN_TICKS + SUCK_TICKS) {

      // Drive entity scale to match current radius
      if (bhEntity) try { bhEntity.setProperty("orbital:bh_radius", radius); } catch { bhEntity = null; }

      // Mark any new entity that drifted into suck range
      for (const ent of dim.getEntities()) {
        if (ent.typeId === "orbital:event_horizon_entity") continue;
        const el = ent.location;
        const ex = el.x - target.x, ey = el.y - target.y, ez = el.z - target.z;
        if (ex*ex + ey*ey + ez*ez <= suckR2) try { ent.addTag(MARKED_TAG); } catch {}
      }

      // Pull marked entities; kill and grow when they reach the centre
      for (const ent of dim.getEntities()) {
        if (ent.typeId === "orbital:event_horizon_entity") continue;
        if (!ent.getTags().includes(MARKED_TAG)) continue;
        try {
          const el = ent.location;
          const dx = target.x - el.x, dy = target.y - el.y, dz = target.z - el.z;
          const d2 = dx*dx + dy*dy + dz*dz;
          const d  = Math.sqrt(d2);

          if (d2 <= 1.5 * 1.5) {
            try { ent.removeTag(MARKED_TAG); } catch {}
            ent.addTag(DEATH_TAG);
            let gm;
            if (ent.typeId === "minecraft:player") {
              gm = ent.getGameMode();
              ent.setGameMode(GameMode.survival);
            }
            try { ent.kill(); } catch {}
            if (ent.typeId === "minecraft:player") try { ent.setGameMode(gm); } catch {}
            radius += ENTITY_GROWTH;
          } else {
            if (d > 0.3) ent.applyImpulse({ x: (dx/d)*0.45, y: (dy/d)*0.45, z: (dz/d)*0.45 });
            ent.addEffect("blindness", 40, { amplifier: 1, showParticles: false });
          }
        } catch {}
      }

      // Block destruction — full cube XZ slabs split in two to stay under the 32,768-block fill limit
      const elapsed = t - SPAWN_TICKS;
      if (elapsed % 10 === 1) {
        const fillR = Math.floor(radius); // use visual radius, not suck radius
        if (fillR > prevFillR) {
          const cx = Math.round(target.x), cy = Math.round(target.y), cz = Math.round(target.z);
          const x1 = cx - fillR, xMid = cx, x2 = cx + fillR;
          const z1 = cz - fillR, z2 = cz + fillR;
          for (let y = cy - fillR; y <= cy + fillR; y++) {
            try { player.runCommand(`fill ${x1} ${y} ${z1} ${xMid} ${y} ${z2} air replace`); } catch {}
            try { player.runCommand(`fill ${xMid + 1} ${y} ${z1} ${x2} ${y} ${z2} air replace`); } catch {}
          }
          prevFillR = fillR;
        }
        radius += BLOCK_GROWTH;
      }
    }

    // ── Phase 3: Collapse trigger ─────────────────────────────────────────────
    const COLLAPSE_TICKS = 30; // 1.5 s shrink animation
    const collapseStart  = SPAWN_TICKS + SUCK_TICKS + 1;

    if (t === collapseStart) {
      dim.playSound("orbital.event_horizon.collapse", target, { volume: 2.0 });
      try { player.runCommand("stopsound @s orbital.event_horizon.song"); } catch {}
      try { player.runCommand("stopsound @s orbital.event_horizon.loop"); } catch {}
      for (const ent of dim.getEntities()) {
        try { ent.removeTag(MARKED_TAG); } catch {}
      }
      // Entity stays alive — animation plays first
    }

    // ── Phase 4: Shrink animation ─────────────────────────────────────────────
    if (t >= collapseStart && t < collapseStart + COLLAPSE_TICKS) {
      const cp = (t - collapseStart + 1) / COLLAPSE_TICKS; // 1/30 → 30/30
      if (bhEntity) try {
        bhEntity.setProperty("orbital:collapse_t", Math.min(cp, 1.0));
      } catch { bhEntity = null; }
    }

    // ── Phase 5: Glow burst then despawn ─────────────────────────────────────
    if (t === collapseStart + COLLAPSE_TICKS) {
      // Fibonacci-sphere burst of glow orbs
      const N = 80;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const theta = Math.acos(1 - 2 * (i + 0.5) / N);
        const phi   = goldenAngle * i;
        const r     = radius * (0.3 + Math.random() * 0.9);
        dim.spawnParticle("orbital:event_horizon_core", {
          x: target.x + r * Math.sin(theta) * Math.cos(phi),
          y: target.y + r * Math.cos(theta),
          z: target.z + r * Math.sin(theta) * Math.sin(phi)
        });
      }
      if (bhEntity) { try { bhEntity.kill(); } catch {} bhEntity = null; }
      system.clearRun(runId);
    }
  }, 1);
});
