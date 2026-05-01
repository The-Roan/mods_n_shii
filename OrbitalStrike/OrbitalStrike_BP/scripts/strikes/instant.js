import { world } from "@minecraft/server";
import { executeStrike } from "../shared.js";

export const ITEM_ID    = "orbital:instant_beacon";
export const RADIUS     = 5;
export const DELAY      = 0;
export const DEATH_TAG  = "instant_strike_kill";
export const ACTION_BAR = "§c⚡ Instant Strike!";
export const DEATH_MSG  = name => `§c${name} §7was instantly obliterated by an instant strike`;
export const PARTICLES  = {
  explosion: "orbital:instant_explosion",
  shockwave: "orbital:instant_shockwave",
  glow:      "orbital:instant_glow"
};

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  executeStrike(ev.source, DEATH_TAG, PARTICLES, ACTION_BAR, RADIUS, DELAY);
});
