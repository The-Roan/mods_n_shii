import { world, system, BlockPermutation } from "@minecraft/server";
import { generateInitial, startExplorationLoop, startSpawnLoop, resetState, getOrigin, restoreState } from "./generator.js";

const INIT_PROP  = "shitrooms:initialized";
const SCORE_OBJ  = "sr_time";
const SCORE_BEST = "sr_best";

// ─── Shitrooms entry helpers ──────────────────────────────────────────────────

function isInShitrooms(player) {
  return !!world.getDynamicProperty(`shitrooms:in_shitrooms:${player.name}`);
}

// Called when a player touches Trump. Marks them as entered, applies effects,
// sets their spawn point inside the maze, then TPs them down.
function enterShitrooms(player) {
  world.setDynamicProperty(`shitrooms:in_shitrooms:${player.name}`, true);
  const o = getOrigin();
  if (o.x === 0 && o.y === 0 && o.z === 0) return; // maze not ready yet

  const dim = world.getDimension("overworld");
  const dest = { x: o.x + 2.5, y: o.y + 1, z: o.z + 2.5 };

  // Clear a 3×3 column at the spawn point so the player never lands in bedrock.
  const sx = Math.floor(o.x + 1), sz = Math.floor(o.z + 1);
  const ex = Math.floor(o.x + 3), ez = Math.floor(o.z + 3);
  try { dim.runCommand(`fill ${sx} ${o.y + 1} ${sz} ${ex} ${o.y + 3} ${ez} air`); } catch {}

  try { player.addEffect("blindness", 100, { amplifier: 0, showParticles: false }); } catch {}
  try { player.addEffect("slowness",  100, { amplifier: 99, showParticles: false }); } catch {}
  try {
    player.setSpawnPoint({ x: Math.floor(o.x + 2), y: o.y + 1, z: Math.floor(o.z + 2), dimension: dim });
  } catch {}

  // Show the best-times sidebar — this is global but only triggered once the
  // first player enters, so pre-entry players just see an empty board briefly.
  try { dim.runCommand(`scoreboard objectives setdisplay sidebar ${SCORE_BEST}`); } catch {}

  world.sendMessage(`§7${player.name}§f has §cnoclipped §finto the §n§lShitrooms`);

  system.runTimeout(() => {
    try { player.teleport(dest, { dimension: dim }); } catch {}
  }, 5);
}

// ─── Block events ─────────────────────────────────────────────────────────────

world.beforeEvents.playerBreakBlock.subscribe(ev => {
  if (ev.block.typeId === "minecraft:sea_lantern") { ev.cancel = true; return; }
  if (ev.block.typeId === "shitrooms:backrooms_wall") {
    const item = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
    if (!item || item.typeId !== "shitrooms:wall_pickaxe") ev.cancel = true;
  }
});

world.afterEvents.playerBreakBlock.subscribe(ev => {
  if (ev.brokenBlockPermutation.type.id !== "shitrooms:backrooms_wall") return;
  const equip = ev.player.getComponent("minecraft:equippable");
  if (!equip) return;
  const item = equip.getEquipment("Mainhand");
  if (!item || item.typeId !== "shitrooms:wall_pickaxe") return;
  const dur = item.getComponent("minecraft:durability");
  if (!dur || dur.damage + 1 >= dur.maxDurability) {
    equip.setEquipment("Mainhand", undefined);
  } else {
    dur.damage += 1;
    equip.setEquipment("Mainhand", item);
  }
});

// ─── World init ───────────────────────────────────────────────────────────────

world.afterEvents.worldInitialize.subscribe(() => {
  world.sendMessage("§8[The Shitrooms] §7Loaded. Don't look behind you.");
  try { world.getDimension("overworld").runCommand("gamerule doMobSpawning false"); } catch {}
  if (world.getDynamicProperty(INIT_PROP)) restoreState();
  startExplorationLoop();
  startSpawnLoop();
  startCleanupLoop();
  startNavmeshLoop();
  startTrumpSpawnLoop();
  startFlashlightLoop();
  setupScoreboard();
});

// ─── Ground helpers ───────────────────────────────────────────────────────────

// Scan downward from (currentY + 5) to find the first solid block,
// then return the Y directly above it. Limits scan to 24 blocks so it's
// cheap per tick. Falls back to currentY if nothing solid is found.
function getGroundY(dim, x, currentY, z) {
  const startY = Math.floor(currentY) + 5;
  const endY   = Math.max(startY - 24, -64);
  for (let by = startY; by >= endY; by--) {
    try {
      const block = dim.getBlock({ x: Math.floor(x), y: by, z: Math.floor(z) });
      if (block && !block.isAir) return by + 1;
    } catch {}
  }
  return currentY;
}

// ─── A* pathfinding ───────────────────────────────────────────────────────────

const BOT_SPEED    = 0.3;   // blocks per tick in the shitrooms
const TRUMP_SPEED  = 0.22;  // slightly slower for dread
const PATH_RETICK  = 10;
const ASTAR_BUDGET = 500;

function isWalkable(dim, bx, bz, floorY) {
  try {
    const lo = dim.getBlock({ x: bx, y: floorY + 1, z: bz });
    const hi = dim.getBlock({ x: bx, y: floorY + 2, z: bz });
    return lo?.isAir && hi?.isAir;
  } catch { return false; }
}

function astar(dim, sx, sz, ex, ez, floorY) {
  if (sx === ex && sz === ez) return [];
  const key = (x, z) => `${x},${z}`;
  const h   = (x, z) => Math.abs(x - ex) + Math.abs(z - ez);
  const startKey = key(sx, sz);
  const goalKey  = key(ex, ez);

  const open  = [{ x: sx, z: sz, f: h(sx, sz) }];
  const prev  = new Map([[startKey, null]]);
  const gCost = new Map([[startKey, 0]]);

  while (open.length > 0 && prev.size <= ASTAR_BUDGET) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { x: cx, z: cz } = open.splice(bi, 1)[0];
    if (cx === ex && cz === ez) break;

    const ck = key(cx, cz);
    const cg = gCost.get(ck);
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cx + dx, nz = cz + dz;
      const nk = key(nx, nz);
      if (prev.has(nk)) continue;
      if (!isWalkable(dim, nx, nz, floorY)) continue;
      const ng = cg + 1;
      prev.set(nk, ck);
      gCost.set(nk, ng);
      if (nx === ex && nz === ez) { open.length = 0; break; }
      open.push({ x: nx, z: nz, f: ng + h(nx, nz) });
    }
  }

  if (!prev.has(goalKey)) return null;
  const path = [];
  let cur = goalKey;
  while (prev.get(cur) !== null) {
    const [x, z] = cur.split(",").map(Number);
    path.unshift({ x, z });
    cur = prev.get(cur);
  }
  return path;
}

const botCache = new Map(); // entityId -> { path, nextRecalc }

function startNavmeshLoop() {
  const NEXTBOT_TYPES = ["shitrooms:nextbot", "shitrooms:nextbot2", "shitrooms:nextbot3", "shitrooms:nextbot4", "shitrooms:nextbot5", "shitrooms:nextbot6"];

  system.runInterval(() => {
    const dim = world.getDimension("overworld");

    // ── Trump: direct movement toward nearest surface player ──────────────
    for (const trump of dim.getEntities({ type: "shitrooms:trump" })) {
      let nearest = null, nearDist = Infinity;
      for (const p of world.getPlayers()) {
        if (isInShitrooms(p)) continue; // only chase overworld players
        const d = Math.hypot(p.location.x - trump.location.x, p.location.z - trump.location.z);
        if (d < nearDist) { nearDist = d; nearest = p; }
      }
      if (!nearest) continue;

      try {
        trump.setRotation({
          x: 0,
          y: -Math.atan2(nearest.location.x - trump.location.x,
                         nearest.location.z - trump.location.z) * (180 / Math.PI) + 180
        });
      } catch {}

      const dx = nearest.location.x - trump.location.x;
      const dz = nearest.location.z - trump.location.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.1) continue;
      const step = Math.min(TRUMP_SPEED, dist);
      try {
        const newX = trump.location.x + (dx / dist) * step;
        const newZ = trump.location.z + (dz / dist) * step;
        const newY = getGroundY(dim, newX, trump.location.y, newZ);
        trump.teleport(
          { x: newX, y: newY, z: newZ },
          { dimension: dim, checkForBlocks: false }
        );
      } catch {}
    }

    // ── Nextbots: A* pathfinding inside the shitrooms ─────────────────────
    const origin = getOrigin();
    if (origin.x === 0 && origin.y === 0 && origin.z === 0) return;
    const floorY = origin.y;
    const tick   = system.currentTick;

    const shitroomsPlayers = world.getPlayers().filter(p => isInShitrooms(p));
    if (shitroomsPlayers.length === 0) return;

    for (const typeId of NEXTBOT_TYPES) {
      for (const entity of dim.getEntities({ type: typeId })) {
        let nearest = null, nearDist = Infinity;
        for (const p of shitroomsPlayers) {
          const d = Math.hypot(p.location.x - entity.location.x, p.location.z - entity.location.z);
          if (d < nearDist) { nearDist = d; nearest = p; }
        }
        if (!nearest) continue;

        try {
          entity.setRotation({
            x: 0,
            y: -Math.atan2(nearest.location.x - entity.location.x,
                           nearest.location.z - entity.location.z) * (180 / Math.PI)
          });
        } catch {}

        let cache = botCache.get(entity.id) ?? { path: null, nextRecalc: 0 };

        if (cache.path?.length > 0) {
          const wp = cache.path[0];
          if (Math.hypot(entity.location.x - (wp.x + 0.5),
                         entity.location.z - (wp.z + 0.5)) < 0.6) {
            cache.path.shift();
          }
        }

        if (!cache.path?.length || tick >= cache.nextRecalc) {
          const sx = Math.floor(entity.location.x);
          const sz = Math.floor(entity.location.z);
          const ex = Math.floor(nearest.location.x);
          const ez = Math.floor(nearest.location.z);
          cache = { path: astar(dim, sx, sz, ex, ez, floorY) ?? [], nextRecalc: tick + PATH_RETICK };
          botCache.set(entity.id, cache);
        }

        let wx, wz;
        if (cache.path.length === 0) {
          wx = nearest.location.x; wz = nearest.location.z;
        } else {
          wx = cache.path[0].x + 0.5; wz = cache.path[0].z + 0.5;
        }

        const dx = wx - entity.location.x;
        const dz = wz - entity.location.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.05) continue;

        const step = Math.min(BOT_SPEED, dist);
        try {
          entity.teleport(
            { x: entity.location.x + (dx / dist) * step, y: floorY + 1, z: entity.location.z + (dz / dist) * step },
            { dimension: dim, checkForBlocks: false }
          );
        } catch {}
      }
    }
  }, 1);
}

// ─── Cleanup / combat / effects ───────────────────────────────────────────────

function startCleanupLoop() {
  const LIQUIDS = ["minecraft:water", "minecraft:lava", "minecraft:flowing_water", "minecraft:flowing_lava"];

  // Liquid cleanup — only matters inside the shitrooms
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      if (!isInShitrooms(player)) continue;
      for (const liquid of LIQUIDS) {
        try { player.runCommand(`fill ~-25 ~-3 ~-25 ~25 ~5 ~25 air replace ${liquid}`); } catch {}
      }
    }
  }, 10);

  // Ambient sounds for each nextbot type
  const NEXTBOT_SEGMENT_COUNT = 39;
  const NEXTBOT_SEG_TICKS     = 100;
  const NEXTBOT2_SOUND        = "mob.nextbot2.ambient";
  const NEXTBOT2_TICKS        = 38;
  const soundState = new Map();

  system.runInterval(() => {
    const seen = new Set();
    const tick = system.currentTick;
    for (const player of world.getPlayers()) {
      if (seen.has(player.dimension.id)) continue;
      seen.add(player.dimension.id);
      const dim = player.dimension;
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT_SEG_TICKS) continue;
        const seg = (s.seg % NEXTBOT_SEGMENT_COUNT) + 1;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound mob.nextbot.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch {}
      }
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot2" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT2_TICKS) continue;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound ${NEXTBOT2_SOUND} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg: 0, tick });
        } catch {}
      }
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot3" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT_SEG_TICKS) continue;
        const seg = (s.seg % 5) + 1;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound mob.nextbot3.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch {}
      }
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot4" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT_SEG_TICKS) continue;
        const seg = (s.seg % 43) + 1;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound mob.nextbot4.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch {}
      }
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot5" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT_SEG_TICKS) continue;
        const seg = (s.seg % 12) + 1;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound mob.nextbot5.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch {}
      }
      for (const entity of dim.getEntities({ type: "shitrooms:nextbot6" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT_SEG_TICKS) continue;
        const seg = (s.seg % 31) + 1;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound mob.nextbot6.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch {}
      }
      for (const entity of dim.getEntities({ type: "shitrooms:trump" })) {
        const s = soundState.get(entity.id) ?? { seg: 0, tick: 0 };
        if (tick - s.tick < NEXTBOT_SEG_TICKS) continue;
        const seg = (s.seg % 12) + 1;
        const { x, y, z } = entity.location;
        try {
          dim.runCommand(`playsound mob.nextbot5.seg.${seg} @a ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 1.6 1 0`);
          soundState.set(entity.id, { seg, tick });
        } catch {}
      }
    }
  }, 20);

  // Nextbot kill-on-contact (shitrooms players only)
  const KILL_RANGE    = 2.5;
  const NEXTBOT_TYPES = ["shitrooms:nextbot", "shitrooms:nextbot2", "shitrooms:nextbot3", "shitrooms:nextbot4", "shitrooms:nextbot5", "shitrooms:nextbot6"];

  // Custom death message pools per nextbot. n = player name. One is chosen at random.
  const DEATH_MSGS = {
    "shitrooms:nextbot": [
      n => `§7${n} §fwas §cdifferentiated §fby §e§lHuntr/x`,
      n => `§7${n} §fwas sent §cup, up, up §fby §e§lHuntr/x`,
      n => `§7${n} §fgot §coptimized §fby §e§lHuntr/x`,
      n => `§7${n} §fwas brutally §cáss ráped§f by §e§lHuntr/x`,
      n => `§7${n} §fwas §cslain §fusing §bUltimate Derivatives Sword §fby §e§lHuntr/x`,
    ],
    "shitrooms:nextbot2": [
      n => `§7${n} §fwas §nshítted §fon by §n§lLogan`,
      n => `§7${n}'s nostrils §fgot filled with §nshit §fby §n§lLogan`,
      n => `§7${n} §fwas §ccrushed §fby §n§lLogan`,
      n => `§7${n} §fhas been §ceaten §fby §n§lLogan`,
    ],
    "shitrooms:nextbot3": [
      n => `§7${n}'s §fbitcoin was §chacked§f by §6§lJuan`,
      n => `§7${n} §fgot §cdeported §fby §6§lJuan`,
      n => `§7${n}'s §fcryptowallet was §cdrained §fby §6§lJuan`,
      n => `§7${n} §fwas §cliquidated §fby §6§lJuan`,
    ],
    "shitrooms:nextbot4": [
      n => `§7${n} §fgot §l§c67§f'd`,
    ],
    "shitrooms:nextbot5": [
      n => `§7${n} §fwas a §4victim §fof §c§lTotal Nígger Death`,
      n => `§7${n} §fwas §4killed §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4beheaded §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4roundhouse kicked §finto §7concrete §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §6slam dunked §finto a §2trash can §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4crucified §fby §c§lNiggertrump`,
      n => `§7${n} §fhad his food §ndefecated in §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §elaunched into the sun §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §6stir-fried in a wok §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §ctossed §finto an §4active volcano §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §ckicked §fin the §4testícles §fby §c§lNiggertrump`,
      n => `§7${n} §fhad his §ngas tank §eurinated in §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4judo thrown §finto a §4wood chipper §fby §c§lNiggertrump`,
      n => `§7${n} §fhad his head §4twisted off §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §creported §fto the §4I§fR§9S §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4karate chopped in half §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4curb stomped §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §ctrapped §fin §nquicksand §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4crushed §fin a §2trash compactor §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §3liquefied §fin a §2vat of acid §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4eaten §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4dissected §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4exterminated §fin the §2gas chamber §fby §c§lNiggertrump`,
      n => `§7${n} §fhad his skull §4stomped §fwith §7steel-toed boots §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §6cremated §fin the §4oven §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4lobotomized §fby §c§lNiggertrump`,
      n => `§7${n}'s child §fwas §caborted §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §4ground §fin the §2garbage disposal §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §3drowned §fin §6fried chicken grease §fby §c§lNiggertrump`,
      n => `§7${n} §fwas §bvaporized §fwith a §3ray gun §fby §c§lNiggertrump`,
    ],
    "shitrooms:nextbot6": [
      n => `§7${n} §fwas §cintegrated §fby §d§lGay§b People`,
      n => `§7${n} §fwas §dcarbonated §fby §d§lGay§b People`,
    ],
  };

  // Stash the killer typeId before kill(), broadcast a random custom message in entityDie.
  world.afterEvents.entityDie.subscribe(ev => {
    if (ev.deadEntity.typeId !== "minecraft:player") return;
    const key    = `shitrooms:killed_by:${ev.deadEntity.name}`;
    const typeId = world.getDynamicProperty(key);
    if (!typeId) return;
    try { world.setDynamicProperty(key, ""); } catch {}
    const pool = DEATH_MSGS[typeId];
    if (pool) {
      const msgFn = pool[Math.floor(Math.random() * pool.length)];
      world.sendMessage(msgFn(ev.deadEntity.name));
    } else {
      world.sendMessage(`§7${ev.deadEntity.name} §fwas killed`);
    }
  });

  system.runInterval(() => {
    const dim = world.getDimension("overworld");
    const shitroomsPlayers = world.getPlayers().filter(p => isInShitrooms(p));
    if (shitroomsPlayers.length === 0) return;
    for (const typeId of NEXTBOT_TYPES) {
      for (const entity of dim.getEntities({ type: typeId })) {
        for (const p of shitroomsPlayers) {
          const dx = p.location.x - entity.location.x;
          const dy = p.location.y - entity.location.y;
          const dz = p.location.z - entity.location.z;
          if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= KILL_RANGE) {
            try { world.setDynamicProperty(`shitrooms:killed_by:${p.name}`, typeId); } catch {}
            try { p.kill(); } catch {}
            try { entity.kill(); } catch {}
            break;
          }
        }
      }
    }
  }, 2);

  // Trump contact: surface player touches Trump → enter the shitrooms
  const TRUMP_RANGE = 2.0;
  system.runInterval(() => {
    const dim = world.getDimension("overworld");
    for (const trump of dim.getEntities({ type: "shitrooms:trump" })) {
      for (const p of world.getPlayers()) {
        if (isInShitrooms(p)) continue;
        const dx = p.location.x - trump.location.x;
        const dy = p.location.y - trump.location.y;
        const dz = p.location.z - trump.location.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= TRUMP_RANGE) {
          try { trump.kill(); } catch {}
          enterShitrooms(p);
          break;
        }
      }
    }
  }, 2);

  // Speed II + Saturation — shitrooms players only
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      if (!isInShitrooms(player)) continue;
      try { player.addEffect("speed",      100, { amplifier: 1, showParticles: false }); } catch {}
      try { player.addEffect("saturation", 100, { amplifier: 9, showParticles: false }); } catch {}
    }
  }, 60);

  // Only kill bats — everything else is fine at the bottom of the world.
  system.runInterval(() => {
    const seen = new Set();
    for (const player of world.getPlayers()) {
      if (seen.has(player.dimension.id)) continue;
      seen.add(player.dimension.id);
      for (const entity of player.dimension.getEntities({ type: "minecraft:bat" })) {
        try { entity.kill(); } catch {}
      }
    }
  }, 100);
}

// ─── Scoreboard / survival timer ─────────────────────────────────────────────

function setupScoreboard() {
  let obj = world.scoreboard.getObjective(SCORE_OBJ);
  if (!obj) obj = world.scoreboard.addObjective(SCORE_OBJ, "Time");
  let best = world.scoreboard.getObjective(SCORE_BEST);
  if (!best) best = world.scoreboard.addObjective(SCORE_BEST, "§6Best Time §f(s)");
  // Sidebar is NOT enabled here — it becomes visible when the first player enters
  // the shitrooms via enterShitrooms(). Pre-entry players see no scoreboard.
  try { world.getDimension("overworld").runCommand(`scoreboard objectives setdisplay list`); } catch {}

  system.runInterval(() => {
    const o = world.scoreboard.getObjective(SCORE_OBJ);
    const b = world.scoreboard.getObjective(SCORE_BEST);
    if (!o) return;
    for (const player of world.getPlayers()) {
      if (!isInShitrooms(player)) continue; // only track shitrooms players
      let cur = 0;
      try { cur = o.getScore(player) ?? 0; } catch {}
      const next = cur + 1;
      try { o.setScore(player, next); } catch {}
      if (b) {
        let pb = 0;
        try { pb = b.getScore(player) ?? 0; } catch {}
        if (next > pb) try { b.setScore(player, next); } catch {}
      }
      const heldItem = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
      let bar = `§7Current Time: §f${next}s`;
      if (heldItem?.typeId === "shitrooms:flashlight") {
        const dur = heldItem.getComponent("minecraft:durability");
        if (dur) {
          const pct   = Math.round((1 - dur.damage / dur.maxDurability) * 100);
          const color = pct > 50 ? "§a" : pct > 20 ? "§e" : "§c";
          bar += ` §7| §7Battery Left: ${color}${pct}%`;
        }
      }
      try { player.onScreenDisplay.setActionBar(bar); } catch {}
    }
  }, 20);
}

// Reset timer on death (shitrooms players only)
world.afterEvents.playerSpawn.subscribe(ev => {
  if (ev.initialSpawn) return;
  if (!isInShitrooms(ev.player)) return;
  const o = world.scoreboard.getObjective(SCORE_OBJ);
  if (!o) return;
  try { o.setScore(ev.player, 0); } catch {}
});

// ─── Player spawn handling ────────────────────────────────────────────────────

// First-ever player triggers maze generation (but is NOT teleported into it).
world.afterEvents.playerSpawn.subscribe(ev => {
  if (!ev.initialSpawn) return;
  try { ev.player.runCommand("gamemode survival"); } catch {}

  const seenKey = "shitrooms:seen:" + ev.player.name;
  if (world.getDynamicProperty(seenKey)) return; // returning player, nothing to do
  world.setDynamicProperty(seenKey, true);

  if (world.getDynamicProperty(INIT_PROP)) return; // maze already exists

  // Very first player: generate the maze deep underground, no TP
  world.setDynamicProperty(INIT_PROP, true);
  system.runTimeout(() => generateInitial(ev.player), 40);
});

// After death: respawn shitrooms players back into the maze.
// (Surface players respawn normally at their bed / world spawn.)
world.afterEvents.playerSpawn.subscribe(ev => {
  if (ev.initialSpawn) return;
  if (!isInShitrooms(ev.player)) return;
  const o = getOrigin();
  if (o.x === 0 && o.y === 0 && o.z === 0) return;
  system.runTimeout(() => {
    try {
      ev.player.teleport(
        { x: o.x + 2.5, y: o.y + 1, z: o.z + 2.5 },
        { dimension: world.getDimension("overworld") }
      );
    } catch {}
  }, 2);
});

// ─── Trump spawner ────────────────────────────────────────────────────────────

function startTrumpSpawnLoop() {
  const INTERVAL   = 1200; // check every 60 seconds
  const CHANCE     = 0.5;  // 50% per check → expected spawn every ~30 s
  const MIN_DIST   = 20;
  const MAX_DIST   = 45;

  system.runInterval(() => {
    const dim = world.getDimension("overworld");

    // Only one Trump allowed at a time
    if (dim.getEntities({ type: "shitrooms:trump" }).length > 0) return;

    // Need at least one surface (pre-entry) player to target
    const surfacePlayers = world.getPlayers().filter(p => !isInShitrooms(p));
    if (surfacePlayers.length === 0) return;

    if (Math.random() > CHANCE) return;

    const target = surfacePlayers[Math.floor(Math.random() * surfacePlayers.length)];
    const angle  = Math.random() * Math.PI * 2;
    const dist   = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST);
    const spawnX = target.location.x + Math.cos(angle) * dist;
    const spawnZ = target.location.z + Math.sin(angle) * dist;
    const spawnY = target.location.y;

    try {
      dim.spawnEntity("shitrooms:trump", { x: spawnX, y: spawnY, z: spawnZ });
    } catch {}
  }, INTERVAL);
}

// ─── Flashlight ───────────────────────────────────────────────────────────────

function startFlashlightLoop() {
  const lightPos   = new Map(); // playerId -> { x, y, z }
  const drainTick  = new Map(); // playerId -> last tick durability was drained
  const DRAIN_INTERVAL = 20;   // 1 drain per second

  system.runInterval(() => {
    const dim  = world.getDimension("overworld");
    const tick = system.currentTick;

    for (const player of world.getPlayers()) {
      const prev  = lightPos.get(player.id);
      const equip = player.getComponent("minecraft:equippable");
      const item  = equip?.getEquipment("Mainhand");
      const holding = item?.typeId === "shitrooms:flashlight";

      if (!holding) {
        if (prev) {
          try { dim.runCommand(`setblock ${prev.x} ${prev.y} ${prev.z} air`); } catch {}
          lightPos.delete(player.id);
        }
        drainTick.delete(player.id);
        continue;
      }

      // ── Durability drain: 1 per second ───────────────────────────────────
      if (!drainTick.has(player.id)) drainTick.set(player.id, tick);
      const last = drainTick.get(player.id);
      if (tick - last >= DRAIN_INTERVAL) {
        drainTick.set(player.id, tick);
        const dur = item.getComponent("minecraft:durability");
        if (dur) {
          if (dur.damage + 1 >= dur.maxDurability) {
            // Flashlight dead — remove it and kill the light
            try { equip.setEquipment("Mainhand", undefined); } catch {}
            if (prev) {
              try { dim.runCommand(`setblock ${prev.x} ${prev.y} ${prev.z} air`); } catch {}
              lightPos.delete(player.id);
            }
            drainTick.delete(player.id);
            continue;
          }
          dur.damage += 1;
          try { equip.setEquipment("Mainhand", item); } catch {}
        }
      }

      // ── Raycast from eye along view direction ─────────────────────────────
      const loc  = player.location;
      const dir  = player.getViewDirection();
      const eyeX = loc.x, eyeY = loc.y + 1.62, eyeZ = loc.z;
      let lx = Math.floor(eyeX), ly = Math.floor(eyeY), lz = Math.floor(eyeZ);
      for (let i = 1; i <= 24; i++) {
        const t  = i * 0.5;
        const bx = Math.floor(eyeX + dir.x * t);
        const by = Math.floor(eyeY + dir.y * t);
        const bz = Math.floor(eyeZ + dir.z * t);
        try {
          const block = dim.getBlock({ x: bx, y: by, z: bz });
          if (!block) break;
          if (block.typeId !== "minecraft:air" && block.typeId !== "minecraft:cave_air" && block.typeId !== "minecraft:light_block_10") break;
          lx = bx; ly = by; lz = bz;
        } catch { break; }
      }

      // Place the light 1 block above the raycast hit position
      const px = lx, py = ly + 1, pz = lz;

      // Only update if the target block changed
      if (prev && prev.x === px && prev.y === py && prev.z === pz) continue;

      // Remove old light, place new one
      if (prev) {
        try { dim.runCommand(`setblock ${prev.x} ${prev.y} ${prev.z} air`); } catch {}
      }
      try {
        dim.runCommand(`setblock ${px} ${py} ${pz} minecraft:light_block_10`);
        lightPos.set(player.id, { x: px, y: py, z: pz });
      } catch {}
    }
  }, 2);
}

// ─── /scriptevent shitrooms:reset ────────────────────────────────────────────

system.afterEvents.scriptEventReceive.subscribe(ev => {
  if (ev.id !== "shitrooms:reset") return;
  const player = ev.sourceEntity;
  if (!player) {
    world.sendMessage("§c[Shitrooms] Run /scriptevent as a player, not from console.");
    return;
  }
  world.setDynamicProperty(INIT_PROP, false);
  resetState();
  world.sendMessage("§8[Shitrooms] §7Resetting and regenerating...");
  system.runTimeout(() => generateInitial(player), 10);
}, { namespaces: ["shitrooms"] });
