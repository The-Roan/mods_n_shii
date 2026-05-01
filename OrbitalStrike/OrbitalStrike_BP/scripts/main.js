import { world, system } from "@minecraft/server";
import { spawnIndicator, activeCylinders, removeCylinder } from "./shared.js";
import * as orbital from "./strikes/orbital.js";
import * as ddx     from "./strikes/ddx.js";
import * as instant from "./strikes/instant.js";
import * as big     from "./strikes/big.js";

const ALL_STRIKES = [orbital, ddx, instant, big];

// Built automatically from each strike's exported ITEM_ID and RADIUS
const BEACON_RADIUS = Object.fromEntries(ALL_STRIKES.map(s => [s.ITEM_ID, s.RADIUS]));

// ─── Indicator loop ───────────────────────────────────────────────────────────
system.runInterval(() => {
  for (const player of world.getPlayers()) {
    try {
      const held = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
      const radius = held ? BEACON_RADIUS[held.typeId] : undefined;
      if (radius !== undefined) spawnIndicator(player, radius);
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
      if (entity.hasTag(strike.DEATH_TAG)) {
        world.sendMessage(strike.DEATH_MSG(name));
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
