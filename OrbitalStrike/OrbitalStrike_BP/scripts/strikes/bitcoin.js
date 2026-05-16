import { world } from "@minecraft/server";
import { executeStrike, getTarget } from "../shared.js";

export const ITEM_ID    = "orbital:bitcoin_beacon";
export const RADIUS     = 5;
export const DELAY      = 40;
export const DEATH_TAG  = "bitcoin_strike_kill";
export const ACTION_BAR = "§6₿ Bitcoin Strike incoming...";
export const DEATH_MSG  = name => `§6${name}'s §7bitcoin was §6stolen §7by Juan`;
export const PARTICLES  = {
  explosion: "orbital:bitcoin_explosion",
  shockwave: "orbital:bitcoin_shockwave",
  glow:      "orbital:bitcoin_glow",
  image:     "orbital:bitcoin_image"
};
export const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block"
]);

// Maps entity id -> player so kills reward gold to the striker
const pendingRewards = new Map();

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player = ev.source;
  const dim    = player.dimension;
  const target = getTarget(player);
  const r2     = RADIUS * RADIUS;

  for (const ent of dim.getEntities()) {
    if (ent === player || ent.typeId === "minecraft:item") continue;
    const dx = Math.floor(ent.location.x) - target.x;
    const dz = Math.floor(ent.location.z) - target.z;
    if (dx*dx + dz*dz <= r2) pendingRewards.set(ent.id, player);
  }

  executeStrike(player, DEATH_TAG, PARTICLES, ACTION_BAR, RADIUS, DELAY, PROTECTED);
});

world.afterEvents.entityDie.subscribe(ev => {
  const ent = ev.deadEntity;
  if (!ent.hasTag(DEATH_TAG)) return;
  const player = pendingRewards.get(ent.id);
  if (!player) return;
  pendingRewards.delete(ent.id);
  try { player.runCommand("give @s minecraft:gold_ingot 10"); } catch { /* ignore */ }
});
