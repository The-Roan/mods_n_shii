import { world } from '@minecraft/server';
import { jukeboxManager } from '../jukebox/jukeboxManager';
const blockComponents = [
    {
        id: "moremusicdiscs:jukebox",
        data: {
            onPlayerInteract: (data) => {
                if (!data.player)
                    return;
                jukeboxManager.interactWithJukebox(data.block, data.player);
            },
            onPlayerDestroy: (data) => {
                jukeboxManager.breakJukebox(data);
            },
            onTick: (data) => {
                const { block, dimension } = data;
                jukeboxManager.tick(block, dimension);
            }
        }
    }
];
world.beforeEvents.worldInitialize.subscribe((data) => {
    for (const comp of blockComponents) {
        data.blockComponentRegistry.registerCustomComponent(comp.id, comp.data);
    }
});
