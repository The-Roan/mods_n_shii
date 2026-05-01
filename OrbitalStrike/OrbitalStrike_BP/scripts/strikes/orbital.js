import { world } from "@minecraft/server";
import { executeStrike } from "../shared.js";

export const ITEM_ID    = "orbital:strike_beacon";
export const RADIUS     = 5;
export const DELAY      = 40;
export const DEATH_TAG  = "orbital_strike_kill";
export const ACTION_BAR = "§c☄ Orbital Strike incoming...";
export const DEATH_MSG  = name => `§c${name} §7was obliterated by an orbital strike`;
export const PARTICLES  = {
  explosion: "orbital:explosion",
  shockwave: "orbital:shockwave",
  glow:      "orbital:glow"
};
export const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block",
  "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_void",
  "minecraft:jigsaw", "minecraft:allow", "minecraft:deny",
  "minecraft:border_block", "minecraft:light_block"
]);

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  executeStrike(ev.source, DEATH_TAG, PARTICLES, ACTION_BAR, RADIUS, DELAY, PROTECTED);
});
