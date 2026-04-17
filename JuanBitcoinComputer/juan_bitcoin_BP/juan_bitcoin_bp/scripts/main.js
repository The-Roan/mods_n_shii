import { world, ItemStack } from "@minecraft/server";

world.afterEvents.itemUse.subscribe((event) => {
  const item = event.itemStack;
  const player = event.source;

  if (item.typeId !== "juan:bitcoin_computer") return;

  // Give the player 1 gold ingot
  const goldIngot = new ItemStack("minecraft:gold_ingot", 1);
  player.getComponent("minecraft:inventory").container.addItem(goldIngot);

  // Play sound at player's location
  const loc = player.location;
  player.dimension.runCommand(
    `playsound juan.bitcoin_computer @a[x=${Math.floor(loc.x)},y=${Math.floor(loc.y)},z=${Math.floor(loc.z)},r=16]`
  );

  // Show action bar message
  player.onScreenDisplay.setActionBar("§6Mined 1 Bitcoin ₿");
});
