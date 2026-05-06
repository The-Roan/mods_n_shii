import { world } from "@minecraft/server";
import { executeStrike } from "../shared.js";

export const ITEM_ID    = "orbital:void_beacon";
export const RADIUS     = 5;
export const DELAY      = 40;
export const DEATH_TAG  = "void_strike_kill";
export const ACTION_BAR = "§8☄ Void Strike incoming...";
export const DEATH_MSG  = name => `§8${name} §7was consumed by the void`;
export const PARTICLES  = {
  explosion: "orbital:void_explosion",
  shockwave: "orbital:void_shockwave",
  glow:      "orbital:void_glow"
};
export const PROTECTED  = new Set(); // intentionally empty — no block is protected

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  executeStrike(ev.source, DEATH_TAG, PARTICLES, ACTION_BAR, RADIUS, DELAY, PROTECTED);
});
