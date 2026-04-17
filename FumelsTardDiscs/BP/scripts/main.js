import { system, world, ItemStack } from '@minecraft/server';
import './customComponents/blockComponents';
if (world.getDynamicProperty("jukeboxes") == undefined)
    world.setDynamicProperty("jukeboxes", JSON.stringify({}));
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        const inv = player.getComponent("inventory");
        if (!inv)
            continue;
        if (!inv.container)
            continue;
        for (let i = 0; i < inv.container.size; i++) {
            const item = inv.container.getItem(i);
            if (!item)
                continue;
            if (item.typeId != 'minecraft:jukebox')
                continue;
            const newItem = new ItemStack("moremusicdiscs:jukebox", item.amount);
            inv.container.setItem(i, newItem);
        }
    }
}, 5);
world.afterEvents.entityDie.subscribe((data) => {
    if (data.deadEntity.typeId != "minecraft:ender_dragon")
        return;
    const { deadEntity } = data;
    const players = deadEntity.dimension.getEntities({ location: deadEntity.location, closest: 1, type: "minecraft:player" });
    if (!players[0])
        return;
    const ruleBefore = world.gameRules.sendCommandFeedback;
    world.gameRules.sendCommandFeedback = false;
    players[0].runCommand("give @s moremusicdiscs:music_disc_golden");
    players[0].sendMessage("§dNow you get music disc of the song Bolen played during derivatives lol.");
    world.gameRules.sendCommandFeedback = ruleBefore;
});
