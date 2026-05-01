import { world } from "@minecraft/server";
import { executeStrike } from "../shared.js";

export const ITEM_ID    = "orbital:big_beacon";
export const RADIUS     = 10;
export const DELAY      = 40;
export const DEATH_TAG  = "big_strike_kill";
export const ACTION_BAR = "§5☄ Big Strike incoming...";
export const DEATH_MSG  = name => `§5${name} §7was crushed by a big orbital strike`;
export const PARTICLES  = {
  explosion: "orbital:big_explosion",
  shockwave: "orbital:big_shockwave",
  glow:      "orbital:big_glow"
};

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  executeStrike(ev.source, DEATH_TAG, PARTICLES, ACTION_BAR, RADIUS, DELAY);
});
