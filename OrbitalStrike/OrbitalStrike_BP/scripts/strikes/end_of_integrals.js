import { world, system, GameMode } from "@minecraft/server";
import { getTarget, spawnIndicator } from "../shared.js";

export const ITEM_ID    = "orbital:end_of_integrals_beacon";
export const RADIUS     = 50;
export const DEATH_TAG  = "end_of_integrals_kill";
export const ACTION_BAR = "§c☄ End of Integrals Strike incoming...";
export const DEATH_MSG  = name => `§c${name} §7was obliterated by the §l§cEnd §4of §cIntegrals`;

export const INDICATOR_FN = (player) => {
  spawnIndicator(player, 15);
  spawnIndicator(player, 30);
  spawnIndicator(player, 50);
};

// ── Timing (notation: [s]:[30ths] → ticks = s*20 + Math.round(30ths*20/30)) ──
const T_FIRE_ANIM   = 20;
const T_ORBS_SPAWN  = 101;
const T_ORBS_UP     = 140;

const FLASH_TICKS   = new Set([140,151,161,171,180,189,199,209,219,228,238,248]);
const BIG_EXP_TICKS = new Set([248, 275]);
const SHOCK_TICKS   = new Set([295,305,315,325,335,344,354,363]);

const T_GREEN_BIG   = 373;
const T_RED_BIG     = 393;
const T_PURPLE_BIG  = 411;

const FINAL_TICKS   = new Set([451, 461]);
const T_CONV_START  = 451;
const T_BANG        = 471;
const T_END         = 779;

const FIRE_RADIUS   = 15;
const FIRE_HEIGHT   = 10;
const ORB_RADIUS    = 15;
const ORB_HEIGHT    = 15;
const ORB_SPEED     = Math.PI * 2 / 160;

const ORB_PARTICLES = [
  "orbital:eoi_purple_glow",
  "orbital:eoi_red_glow",
  "orbital:eoi_green_glow"
];

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player = ev.source;
  const dim    = player.dimension;
  const target = getTarget(player);

  player.onScreenDisplay.setActionBar(ACTION_BAR);
  dim.playSound("orbital.end_of_integrals.song", target, { volume: 3.0 });

  let t = 0;
  let explosions = [];  // expanding sphere-shell bursts
  let rings      = [];  // expanding ring waves

  const runId = system.runInterval(() => {
    try {
    t++;
    const cx = target.x, cy = target.y, cz = target.z;

    // ── Process ongoing expanding effects ────────────────────────────────────
    explosions = tickExplosions(dim, explosions);
    rings      = tickRings(dim, rings);

    // ── Orb positions ────────────────────────────────────────────────────────
    const orbH = t < T_ORBS_SPAWN ? 0
               : t >= T_ORBS_UP   ? ORB_HEIGHT
               : ORB_HEIGHT * (t - T_ORBS_SPAWN) / (T_ORBS_UP - T_ORBS_SPAWN);

    const convProg = t >= T_CONV_START
      ? Math.min(1.0, (t - T_CONV_START) / (T_BANG - T_CONV_START))
      : 0.0;
    const orbR = ORB_RADIUS * (1.0 - convProg);

    const orbPos = [0, 1, 2].map(i => {
      const a = i * (Math.PI * 2 / 3) + t * ORB_SPEED;
      return { x: cx + orbR * Math.cos(a), y: cy + orbH, z: cz + orbR * Math.sin(a) };
    });

    // ── Phase 1: Pink fire column (t=1 … T_BANG-1) ──────────────────────────
    if (t >= 1 && t < T_BANG) {
      const fireScale = Math.min(1.0, t / T_FIRE_ANIM);
      const effR = FIRE_RADIUS * fireScale;
      const effH = FIRE_HEIGHT * fireScale;

      // Inner fill — 40/tick uniform disk
      const nFire = Math.round(40 * fireScale);
      for (let i = 0; i < nFire; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r     = Math.sqrt(Math.random()) * effR;
        const h     = Math.random() * effH;
        dim.spawnParticle("orbital:eoi_pink_glow",
          { x: cx + r * Math.cos(angle), y: cy + h, z: cz + r * Math.sin(angle) });
      }

      // Rim wall — 10 particles every other tick
      if (t % 2 === 0 && fireScale > 0.4) {
        for (let i = 0; i < 10; i++) {
          const angle = Math.random() * Math.PI * 2;
          const r     = effR * (0.87 + Math.random() * 0.15);
          const h     = Math.random() * effH;
          dim.spawnParticle("orbital:eoi_pink_glow",
            { x: cx + r * Math.cos(angle), y: cy + h, z: cz + r * Math.sin(angle) });
        }
      }

      // Fire spires — 5 particles every 6 ticks
      if (t % 6 === 0 && fireScale > 0.5) {
        for (let i = 0; i < 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          const r     = Math.random() * effR * 0.7;
          const h     = effH + Math.random() * effH * 1.4;
          dim.spawnParticle("orbital:eoi_pink_glow",
            { x: cx + r * Math.cos(angle), y: cy + h, z: cz + r * Math.sin(angle) });
        }
      }

      // Burn entities inside cylinder every 5 ticks
      if (t % 5 === 0) {
        for (const ent of dim.getEntities()) {
          try {
            const el  = ent.location;
            const edx = el.x - cx, edz = el.z - cz, edy = el.y - cy;
            if (edx*edx + edz*edz <= FIRE_RADIUS*FIRE_RADIUS && edy >= 0 && edy <= FIRE_HEIGHT) {
              ent.addTag(DEATH_TAG);
              try { ent.setOnFire(60); } catch {}
              try { ent.applyDamage(1); } catch {}
            }
          } catch {}
        }
      }

      // Fire blocks every 20 ticks
      if (t % 20 === 1) {
        const bx = Math.round(cx), by = Math.round(cy), bz = Math.round(cz);
        try { player.runCommand(`fill ${bx-15} ${by} ${bz-15} ${bx}    ${by} ${bz+15} fire replace air`); } catch {}
        try { player.runCommand(`fill ${bx+1}  ${by} ${bz-15} ${bx+15} ${by} ${bz+15} fire replace air`); } catch {}
      }
    }

    // ── Phase 2: Orbiting glow orbs (T_ORBS_SPAWN … T_BANG) ────────────────
    if (t >= T_ORBS_SPAWN && t <= T_BANG) {
      for (let i = 0; i < 3; i++) {
        // 2-particle cluster at orb head
        for (let k = 0; k < 2; k++) {
          dim.spawnParticle(ORB_PARTICLES[i], {
            x: orbPos[i].x + (Math.random()-0.5) * 0.5,
            y: orbPos[i].y + (Math.random()-0.5) * 0.5,
            z: orbPos[i].z + (Math.random()-0.5) * 0.5
          });
        }
        // Trail: 3 ghost positions
        for (let trail = 1; trail <= 3; trail++) {
          const ta = i * (Math.PI * 2 / 3) + (t - trail * 3) * ORB_SPEED;
          dim.spawnParticle(ORB_PARTICLES[i], {
            x: cx + orbR * Math.cos(ta),
            y: cy + orbH,
            z: cz + orbR * Math.sin(ta)
          });
        }
      }
    }

    // ── Phase 3: Flash bursts (07:00–12:12) — ~10 ticks apart ───────────────
    // Duration 7 < gap of 10, so events never stack.
    if (FLASH_TICKS.has(t)) {
      for (let i = 0; i < 3; i++) {
        const pos = orbPos[i];
        addExplosion(explosions, pos.x, pos.y, pos.z, ORB_PARTICLES[i], 7, 8, 7);
      }
      addRing(rings, cx, cy, cz, "orbital:eoi_pink_glow", 0, 10, 7);
      // Burn entities near each orb + set ground fire
      for (const ent of dim.getEntities()) {
        try {
          const el = ent.location;
          for (let i = 0; i < 3; i++) {
            const dx = el.x - orbPos[i].x, dy = el.y - orbPos[i].y, dz = el.z - orbPos[i].z;
            if (dx*dx + dy*dy + dz*dz <= 64) { // r=8 sphere around each orb
              ent.addTag(DEATH_TAG);
              try { ent.setOnFire(60); } catch {}
              try { ent.applyDamage(1); } catch {}
              break;
            }
          }
        } catch {}
      }
      for (let i = 0; i < 3; i++) {
        const bx = Math.round(orbPos[i].x), by = Math.round(cy), bz = Math.round(orbPos[i].z);
        try { player.runCommand(`fill ${bx-6} ${by} ${bz-6} ${bx}   ${by} ${bz+6} fire replace air`); } catch {}
        try { player.runCommand(`fill ${bx+1} ${by} ${bz-6} ${bx+6} ${by} ${bz+6} fire replace air`); } catch {}
      }
    }

    // ── Phase 4: Big orb + fire explosions (12:12, 13:22) — 27 ticks apart ──
    // Duration 12 < gap of 27, no stacking.
    if (BIG_EXP_TICKS.has(t)) {
      for (let i = 0; i < 3; i++) {
        const pos = orbPos[i];
        addExplosion(explosions, pos.x, pos.y, pos.z, ORB_PARTICLES[i], 14, 15, 12);
        addRing(rings, pos.x, pos.y, pos.z, ORB_PARTICLES[i], 0, 12, 10);
      }
      addExplosion(explosions, cx, cy + 4, cz, "orbital:eoi_pink_glow", 18, 22, 12);
      addRing(rings, cx, cy,     cz, "orbital:eoi_pink_glow", 0, 18, 11);
      addRing(rings, cx, cy + 5, cz, "orbital:eoi_pink_glow", 0, 12, 10);
      // Burn entities within r=18 + large ground fire
      for (const ent of dim.getEntities()) {
        try {
          const el = ent.location;
          const dx = el.x - cx, dz = el.z - cz;
          if (dx*dx + dz*dz <= 324) { // r=18
            ent.addTag(DEATH_TAG);
            try { ent.setOnFire(100); } catch {}
            try { ent.applyDamage(2); } catch {}
          }
        } catch {}
      }
      const bx4 = Math.round(cx), by4 = Math.round(cy), bz4 = Math.round(cz);
      try { player.runCommand(`fill ${bx4-18} ${by4} ${bz4-18} ${bx4}    ${by4} ${bz4+18} fire replace air`); } catch {}
      try { player.runCommand(`fill ${bx4+1}  ${by4} ${bz4-18} ${bx4+18} ${by4} ${bz4+18} fire replace air`); } catch {}
    }

    // ── Phase 5: Shockwave events (14:23–18:05) — ~10 ticks apart ───────────
    // Duration 7 < gap of 10, no stacking.
    if (SHOCK_TICKS.has(t)) {
      for (let i = 0; i < 3; i++) {
        const pos = orbPos[i];
        addExplosion(explosions, pos.x, pos.y, pos.z, ORB_PARTICLES[i], 9, 10, 7);
      }
      addRing(rings, cx, cy,     cz, "orbital:eoi_pink_glow", 0, 18, 7);
      addRing(rings, cx, cy + 5, cz, "orbital:eoi_pink_glow", 0, 12, 6);
      // Burn entities within r=20 + ground fire
      for (const ent of dim.getEntities()) {
        try {
          const el  = ent.location;
          const edx = el.x - cx, edz = el.z - cz;
          if (edx*edx + edz*edz <= 400) {
            ent.addTag(DEATH_TAG);
            try { ent.setOnFire(60); } catch {}
            try { ent.applyDamage(1); } catch {}
          }
        } catch {}
      }
      const bx5 = Math.round(cx), by5 = Math.round(cy), bz5 = Math.round(cz);
      try { player.runCommand(`fill ${bx5-18} ${by5} ${bz5-18} ${bx5}    ${by5} ${bz5+18} fire replace air`); } catch {}
      try { player.runCommand(`fill ${bx5+1}  ${by5} ${bz5-18} ${bx5+18} ${by5} ${bz5+18} fire replace air`); } catch {}
    }

    // ── Phase 6: Individual big orb explosions (18:19–20:17) — 20 ticks apart
    // Duration 14 < gap of 20, no stacking.
    if (t === T_GREEN_BIG || t === T_RED_BIG || t === T_PURPLE_BIG) {
      const idx = t === T_GREEN_BIG ? 2 : t === T_RED_BIG ? 1 : 0;
      const pos = orbPos[idx];
      addExplosion(explosions, pos.x, pos.y, pos.z, ORB_PARTICLES[idx], 18, 30, 14);
      addRing(rings, pos.x, pos.y, pos.z, ORB_PARTICLES[idx], 0, 12, 12);
      addRing(rings, pos.x, pos.y, pos.z, ORB_PARTICLES[idx], 0, 22, 14);
      addExplosion(explosions, cx, cy + 4, cz, "orbital:eoi_pink_glow", 14, 20, 14);
      addRing(rings, cx, cy, cz, "orbital:eoi_pink_glow", 0, 18, 12);
      // Burn entities near the exploding orb (3D sphere) + within flat radius of center
      for (const ent of dim.getEntities()) {
        try {
          const el = ent.location;
          const dx = el.x - pos.x, dy = el.y - pos.y, dz = el.z - pos.z;
          const dx2 = el.x - cx,   dz2 = el.z - cz;
          if (dx*dx + dy*dy + dz*dz <= 400 || dx2*dx2 + dz2*dz2 <= 225) { // r=20 orb or r=15 center
            ent.addTag(DEATH_TAG);
            try { ent.setOnFire(100); } catch {}
            try { ent.applyDamage(2); } catch {}
          }
        } catch {}
      }
      // Ground fire — wide area
      const bx6 = Math.round(cx), by6 = Math.round(cy), bz6 = Math.round(cz);
      try { player.runCommand(`fill ${bx6-20} ${by6} ${bz6-20} ${bx6}    ${by6} ${bz6+20} fire replace air`); } catch {}
      try { player.runCommand(`fill ${bx6+1}  ${by6} ${bz6-20} ${bx6+20} ${by6} ${bz6+20} fire replace air`); } catch {}
    }

    // ── Phase 7: Final countdown (22:16, 23:01) — 10 ticks apart ────────────
    // Duration 9 < gap of 10, no stacking.
    if (FINAL_TICKS.has(t)) {
      for (let i = 0; i < 3; i++) {
        const pos = orbPos[i];
        addExplosion(explosions, pos.x, pos.y, pos.z, ORB_PARTICLES[i], 14, 20, 9);
        addRing(rings, pos.x, pos.y, pos.z, ORB_PARTICLES[i], 0, 16, 9);
      }
      addRing(rings, cx, cy,     cz, "orbital:eoi_pink_glow", 0, 24, 9);
      addRing(rings, cx, cy + 6, cz, "orbital:eoi_pink_glow", 0, 16, 8);
      addExplosion(explosions, cx, cy + 4, cz, "orbital:eoi_pink_glow", 18, 28, 9);
      // Burn entities within r=25 + very large ground fire
      for (const ent of dim.getEntities()) {
        try {
          const el = ent.location;
          const dx = el.x - cx, dz = el.z - cz;
          if (dx*dx + dz*dz <= 625) { // r=25
            ent.addTag(DEATH_TAG);
            try { ent.setOnFire(120); } catch {}
            try { ent.applyDamage(2); } catch {}
          }
        } catch {}
      }
      const bx7 = Math.round(cx), by7 = Math.round(cy), bz7 = Math.round(cz);
      try { player.runCommand(`fill ${bx7-24} ${by7} ${bz7-24} ${bx7}    ${by7} ${bz7+24} fire replace air`); } catch {}
      try { player.runCommand(`fill ${bx7+1}  ${by7} ${bz7-24} ${bx7+24} ${by7} ${bz7+24} fire replace air`); } catch {}
    }

    // ── Phase 8: White convergence + THE BIG BANG (23:16) ───────────────────
    if (t === T_BANG) {
      dim.playSound("orbital.end_of_integrals.bang", target, { volume: 5.0 });

      // Convergence cluster (30 white, r~2.5)
      for (let j = 0; j < 30; j++) {
        const theta = Math.acos(2*Math.random()-1);
        const phi   = Math.random() * Math.PI * 2;
        const r     = Math.random() * 2.5;
        dim.spawnParticle("orbital:eoi_white_glow", {
          x: cx + r * Math.sin(theta) * Math.cos(phi),
          y: cy + r * Math.cos(theta),
          z: cz + r * Math.sin(theta) * Math.sin(phi)
        });
      }

      // Fibonacci sphere burst — 250 white particles to 40 blocks
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < 250; i++) {
        const theta = Math.acos(1 - 2*(i+0.5)/250);
        const phi   = goldenAngle * i;
        const r     = 40 * (0.2 + Math.random() * 0.85);
        dim.spawnParticle("orbital:eoi_white_glow", {
          x: cx + r * Math.sin(theta) * Math.cos(phi),
          y: cy + r * Math.cos(theta),
          z: cz + r * Math.sin(theta) * Math.sin(phi)
        });
      }

      // Expanding shockwave rings — constant expansion speed (~2.5 blocks/tick)
      addRing(rings, cx, cy, cz, "orbital:eoi_white_glow", 0, 12,  5);
      addRing(rings, cx, cy, cz, "orbital:eoi_white_glow", 0, 25, 10);
      addRing(rings, cx, cy, cz, "orbital:eoi_white_glow", 0, 38, 15);
      addRing(rings, cx, cy, cz, "orbital:eoi_pink_glow",  0, 18,  7);
      addRing(rings, cx, cy, cz, "orbital:eoi_pink_glow",  0, 28, 11);

      // (obliteration is handled below, spread over 31 ticks)

      // Entity effects: ≤30 blocks = kill; 30–50 = fire
      for (const ent of dim.getEntities()) {
        try {
          const el  = ent.location;
          const edx = el.x - cx, edy = el.y - cy, edz = el.z - cz;
          const d2  = edx*edx + edy*edy + edz*edz;
          if (d2 <= 900) {
            ent.addTag(DEATH_TAG);
            let gm;
            if (ent.typeId === "minecraft:player") {
              gm = ent.getGameMode();
              ent.setGameMode(GameMode.survival);
            }
            try { ent.kill(); } catch {}
            if (ent.typeId === "minecraft:player") try { ent.setGameMode(gm); } catch {}
          } else if (d2 <= 2500) {
            ent.addTag(DEATH_TAG);
            try { ent.setOnFire(200); } catch {}
            try { ent.applyDamage(2); } catch {}
          }
        } catch {}
      }
    }

    // ── Crater obliteration — expands outward from center, 1 ring per tick ───
    // Spreading over 31 ticks (T_BANG … T_BANG+30) keeps us at ≤8 fill
    // commands/tick instead of 244, so no layers are silently dropped.
    if (t >= T_BANG && t <= T_BANG + 30) {
      const ring = t - T_BANG;  // 0 → 30 (radius of ring being processed)
      const bx = Math.round(cx), by = Math.round(cy), bz = Math.round(cz);
      // dy=0 on tick 0; then -ring and +ring together on subsequent ticks
      const layers = ring === 0 ? [0] : [-ring, ring];
      for (const dy of layers) {
        const lR = Math.floor(Math.sqrt(900 - dy * dy));
        if (lR <= 0) continue;
        // obliterate
        try { player.runCommand(`fill ${bx-lR} ${by+dy} ${bz-lR} ${bx}    ${by+dy} ${bz+lR} air replace`); } catch {}
        try { player.runCommand(`fill ${bx+1}  ${by+dy} ${bz-lR} ${bx+lR} ${by+dy} ${bz+lR} air replace`); } catch {}
        // ignite the cleared space
        try { player.runCommand(`fill ${bx-lR} ${by+dy} ${bz-lR} ${bx}    ${by+dy} ${bz+lR} fire replace air`); } catch {}
        try { player.runCommand(`fill ${bx+1}  ${by+dy} ${bz-lR} ${bx+lR} ${by+dy} ${bz+lR} fire replace air`); } catch {}
      }
    }

    // ── Phase 9: Expanding post-bang shockfront (T_BANG+1 … T_END) ──────────
    if (t > T_BANG && t <= T_END) {
      const prog    = (t - T_BANG) / (T_END - T_BANG);  // 0 → 1
      const fade    = 1.0 - prog;                         // 1 → 0
      const expandR = 30 + prog * 15;                     // 30 → 45 blocks (stay in loaded chunks)

      // White leading-edge particles
      const nWhite = Math.round(35 * fade);
      for (let i = 0; i < nWhite; i++) {
        const theta = Math.acos(2*Math.random()-1);
        const phi   = Math.random() * Math.PI * 2;
        const r     = expandR + (Math.random() - 0.3) * 12;
        dim.spawnParticle("orbital:eoi_white_glow", {
          x: cx + r * Math.sin(theta) * Math.cos(phi),
          y: cy + r * Math.cos(theta),
          z: cz + r * Math.sin(theta) * Math.sin(phi)
        });
      }

      // Pink trailing embers inside the shell
      const nPink = Math.round(25 * fade);
      for (let i = 0; i < nPink; i++) {
        const theta = Math.acos(2*Math.random()-1);
        const phi   = Math.random() * Math.PI * 2;
        const r     = Math.max(1, expandR - 5 - Math.random() * 20);
        dim.spawnParticle("orbital:eoi_pink_glow", {
          x: cx + r * Math.sin(theta) * Math.cos(phi),
          y: cy + r * Math.cos(theta),
          z: cz + r * Math.sin(theta) * Math.sin(phi)
        });
      }

      // Ripple rings on the explosion surface every 18 ticks
      if ((t - T_BANG) % 18 === 0) {
        addRing(rings, cx, cy, cz, "orbital:eoi_white_glow", expandR, expandR + 18, 12);
        if (expandR > 15) {
          addRing(rings, cx, cy, cz, "orbital:eoi_pink_glow", Math.max(1, expandR - 12), expandR + 6, 11);
        }
      }
    }

    // ── End ──────────────────────────────────────────────────────────────────
    if (t >= T_END) {
      system.clearRun(runId);
    }
    } catch(e) {
      // A single-tick error (e.g. particle cap, unloaded chunk) must not kill the
      // whole interval — swallow it and let the next tick run normally.
      if (t >= T_END) system.clearRun(runId);
    }
  }, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Expanding sphere burst: shell at radius = maxR * sqrt(elapsed/duration)
// ─────────────────────────────────────────────────────────────────────────────
function addExplosion(arr, x, y, z, particleId, maxR, startN, duration) {
  arr.push({ x, y, z, particleId, maxR, startN, duration, elapsed: 0 });
}

function tickExplosions(dim, arr) {
  for (const exp of arr) {
    exp.elapsed++;
    const prog  = exp.elapsed / exp.duration;
    const r     = exp.maxR * Math.sqrt(prog);
    const shell = exp.maxR * 0.3;
    const n     = Math.round(exp.startN * (1 - prog * 0.75));
    for (let i = 0; i < n; i++) {
      const theta = Math.acos(2*Math.random()-1);
      const phi   = Math.random() * Math.PI * 2;
      const rad   = r + (Math.random() - 0.5) * shell;
      try {
        dim.spawnParticle(exp.particleId, {
          x: exp.x + rad * Math.sin(theta) * Math.cos(phi),
          y: exp.y + rad * Math.cos(theta),
          z: exp.z + rad * Math.sin(theta) * Math.sin(phi)
        });
      } catch {}
    }
  }
  return arr.filter(e => e.elapsed < e.duration);
}

// ─────────────────────────────────────────────────────────────────────────────
// Expanding ring wave: travels from startR → maxR over duration ticks.
// Particle count is CAPPED at 32 per tick to prevent blowout at large radii.
// ─────────────────────────────────────────────────────────────────────────────
function addRing(arr, cx, cy, cz, particleId, startR, maxR, duration) {
  arr.push({ cx, cy, cz, particleId, startR, maxR, duration, elapsed: 0 });
}

function tickRings(dim, arr) {
  for (const ring of arr) {
    ring.elapsed++;
    const prog = ring.elapsed / ring.duration;
    const r    = ring.startR + (ring.maxR - ring.startR) * prog;
    if (r <= 0) continue;
    const n = Math.min(32, Math.max(8, Math.round(r * 2)));  // CAPPED at 32
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      try {
        dim.spawnParticle(ring.particleId, {
          x: ring.cx + r * Math.cos(a),
          y: ring.cy,
          z: ring.cz + r * Math.sin(a)
        });
      } catch {}
    }
  }
  return arr.filter(r => r.elapsed < r.duration);
}
