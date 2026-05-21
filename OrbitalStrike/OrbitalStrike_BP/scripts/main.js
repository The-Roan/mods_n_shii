import { world, system } from "@minecraft/server";
import { spawnIndicator, activeCylinders, removeCylinder } from "./shared.js";
import "./recipe_book.js";
import * as orbital from "./strikes/orbital.js";
import * as ddx     from "./strikes/ddx.js";
import * as instant from "./strikes/instant.js";
import * as big     from "./strikes/big.js";
import * as throwable from "./strikes/throwable.js";
import * as laser    from "./strikes/laser.js";
import * as voidStrike from "./strikes/void.js";
import * as heal     from "./strikes/heal.js";
import * as napalm        from "./strikes/napalm.js";
import * as implicit      from "./strikes/implicit.js";
import * as relatedRates  from "./strikes/related_rates.js";
import * as optimization  from "./strikes/optimization.js";
import * as singularity   from "./strikes/singularity.js";
import * as bitcoin       from "./strikes/bitcoin.js";
import * as eventHorizon  from "./strikes/event_horizon.js";
import * as endOfIntegrals from "./strikes/end_of_integrals.js";

const ALL_STRIKES = [orbital, ddx, instant, big, throwable, laser, voidStrike, heal, napalm, implicit, relatedRates, optimization, singularity, bitcoin, eventHorizon, endOfIntegrals];

// Built automatically from each strike's exported ITEM_ID and RADIUS
const BEACON_STRIKE = Object.fromEntries(ALL_STRIKES.map(s => [s.ITEM_ID, s]));

// ─── Indicator loop ───────────────────────────────────────────────────────────
system.runInterval(() => {
  for (const player of world.getPlayers()) {
    try {
      const held   = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
      const strike = held ? BEACON_STRIKE[held.typeId] : undefined;
      if (!strike) continue;
      if (strike.INDICATOR_FN) {
        strike.INDICATOR_FN(player);
      } else if (strike.RADIUS !== undefined) {
        spawnIndicator(player, strike.RADIUS);
      }
    } catch { /* ignore */ }
  }
}, 5);

// ─── Cylinder cleanup (inactive in particle mode) ─────────────────────────────
system.runInterval(() => {
  if (activeCylinders.size === 0) return;
  const now = system.currentTick;
  for (const [id, data] of activeCylinders) {
    if (now >= data.removeAt) {
      removeCylinder(data.dimension, data.positions);
      activeCylinders.delete(id);
    }
  }
}, 10);

// ─── Death messages ───────────────────────────────────────────────────────────
world.afterEvents.entityDie.subscribe(ev => {
  const entity = ev.deadEntity;
  try {
    const name = entity.nameTag?.trim() ||
      (entity.typeId === "minecraft:player"
        ? (entity.name ?? "A player")
        : entity.typeId.replace("minecraft:", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    for (const strike of ALL_STRIKES) {
      if (strike.DEATH_TAG && entity.hasTag(strike.DEATH_TAG)) {
        if (strike.DEATH_MSG) world.sendMessage(strike.DEATH_MSG(name));
        entity.removeTag(strike.DEATH_TAG);
        break;
      }
    }
  } catch { /* ignore */ }
});

// ─── Load message ─────────────────────────────────────────────────────────────
world.afterEvents.worldInitialize.subscribe(() => {
  const gives = ALL_STRIKES.map(s => `§e/give @s ${s.ITEM_ID}`).join(" §7| ");
  world.sendMessage(`§b[Orbital Strike] §fLoaded. ${gives}`);
});
