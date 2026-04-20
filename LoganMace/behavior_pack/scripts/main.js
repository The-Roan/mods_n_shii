// @minecraft/server 2.3.0 — MC Education 1.21.132
import { world, system } from "@minecraft/server";

const MACE_ID = "logan:logan_mace";
const RADIUS  = 5;
const COOLDOWN_TICKS = 200;

const SAFE_BLOCKS = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block", "minecraft_air"
]);

const cooldowns = new Map();
function isOnCooldown(id) { return (cooldowns.get(id) ?? 0) > 0; }
function setCooldown(id)  { cooldowns.set(id, COOLDOWN_TICKS); }

function podzolSphere(dim, cx, cy, cz) {
  const R = RADIUS;
  for (let x = -R; x <= R; x++)
    for (let y = -2; y <= R; y++)
      for (let z = -R; z <= R; z++) {
        if (Math.sqrt(x*x+y*y+z*z) > R) continue;
        try {
          const b = dim.getBlock({x:Math.floor(cx)+x, y:Math.floor(cy)+y, z:Math.floor(cz)+z});
          if (!b || SAFE_BLOCKS.has(b.typeId) || b.typeId==="minecraft:podzol") continue;
          b.setType("minecraft:podzol");
        } catch(_) {}
      }
}

function spawnParticles(dim, cx, cy, cz) {
  const R = RADIUS;

  // Spawn particles individually at many positions across the radius using spawnParticle()
  // This is the reliable Education Edition scripting API method

  // 1. Wither rose particles
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r     = Math.random() * R;
    const height = Math.random() * 2.5;
    try {
      dim.spawnParticle("minecraft:wither_rose_emitter", {
        x: cx + Math.cos(angle) * r,
        y: cy + height,
        z: cz + Math.sin(angle) * r
      });
    } catch(_) {}
  }

  // 2. Gravel/dirt falling particles
  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r     = Math.random() * R;
    const height = Math.random() * 3.0;
    try {
      dim.spawnParticle("minecraft:falling_dust_gravel_particle", {
        x: cx + Math.cos(angle) * r,
        y: cy + height,
        z: cz + Math.sin(angle) * r
      });
    } catch(_) {}
  }

  // 3. Terrain/podzol particles
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r     = 0.5 + Math.random() * (R - 0.5);
    try {
      dim.spawnParticle("minecraft:terrain", {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.random() * 1.5,
        z: cz + Math.sin(angle) * r
      });
    } catch(_) {}
  }

  // 4. Dark smoke particles
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r     = Math.random() * R;
    try {
      dim.spawnParticle("minecraft:basic_smoke_particle", {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.random() * 2.0,
        z: cz + Math.sin(angle) * r
      });
    } catch(_) {}
  }

  // 5. Extra wither particles
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    try {
      dim.spawnParticle("minecraft:wither_rose_emitter", {
        x: cx + Math.cos(angle) * R,
        y: cy + Math.random() * 1.0,
        z: cz + Math.sin(angle) * R
      });
    } catch(_) {}
  }
}

function groundSlam(player) {
  const loc = player.location;
  const dim  = player.dimension;

  try { dim.playSound("mob.wither.break_block", loc); } catch(_) {}
  try { dim.playSound("item.mace.smash_ground", loc); } catch(_) {}

  spawnParticles(dim, loc.x, loc.y, loc.z);
  podzolSphere(dim, loc.x, loc.y, loc.z);

  try {
    const ents = dim.getEntities({
      location: loc, maxDistance: RADIUS,
      excludeTypes: ["minecraft:item","minecraft:xp_orb","minecraft:arrow","minecraft:fishing_hook"]
    });
    for (const e of ents) {
      if (e.id === player.id) continue;
      try {
        const dx = e.location.x - loc.x;
        const dz = e.location.z - loc.z;
        const len = Math.sqrt(dx*dx+dz*dz) || 0.001;
        e.applyKnockback({x:(dx/len)*4, z:(dz/len)*4}, 1.0);
        e.addEffect("wither",   100, {amplifier:5, showParticles:true});
        e.addEffect("slowness", 100, {amplifier:2, showParticles:true});
      } catch(_) {}
    }
  } catch(err) { console.warn("[LoganMace] slam: "+err); }
}

world.afterEvents.worldLoad.subscribe(() => {

  system.runInterval(() => {
    for (const [id, rem] of cooldowns) {
      if (rem <= 0) cooldowns.delete(id);
      else cooldowns.set(id, rem - 1);
    }
  }, 1);

  world.afterEvents.itemUse.subscribe((ev) => {
    const player = ev.source;
    if (!player || player.typeId !== "minecraft:player") return;
    if (ev.itemStack?.typeId !== MACE_ID) return;
    if (!player.isOnGround) return;
    if (isOnCooldown(player.id)) return;

    setCooldown(player.id);

    try {
      const inv  = player.getComponent("inventory")?.container;
      const item = inv?.getItem(player.selectedSlotIndex);
      const cd   = item?.getComponent("minecraft:cooldown");
      if (cd) cd.startCooldown(player);
    } catch(_) {}

    groundSlam(player);
  });

  console.log("[LoganMace] v3.5 loaded");
});
