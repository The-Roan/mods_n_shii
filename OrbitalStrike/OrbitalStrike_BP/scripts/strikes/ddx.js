import { world } from "@minecraft/server";
import { executeStrike } from "../shared.js";

export const ITEM_ID    = "orbital:ddx_beacon";
export const RADIUS     = 5;
export const DELAY      = 40;
export const DEATH_TAG  = "ddx_strike_kill";
export const ACTION_BAR = "§e☄ D/DX Strike incoming...";
export const DEATH_MSG  = name => `§e${name} §7was vaporized by a D/DX strike`;
export const PARTICLES  = {
  explosion: "orbital:ddx_explosion",
  shockwave: "orbital:ddx_shockwave",
  glow:      "orbital:ddx_glow",
  image:     "orbital:ddx_image"
};
export const SONG_SOUND  = "orbital.ddx.song";
export const SONG_VOLUME = 2.0;

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== ITEM_ID) return;
  const player = ev.source;
  player.dimension.playSound(SONG_SOUND, player.location, { volume: SONG_VOLUME });
  executeStrike(player, DEATH_TAG, PARTICLES, ACTION_BAR, RADIUS, DELAY);
});
