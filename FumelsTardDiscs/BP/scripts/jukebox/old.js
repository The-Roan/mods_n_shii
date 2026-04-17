import { world, EquipmentSlot, GameMode, system, ItemStack } from '@minecraft/server';
import { musicDiscs } from '../musicDisc/musicDiscs';
export class jukeboxManager {
    static interactWithJukebox(block, player) {
        const equippable = player.getComponent("equippable");
        const heldItem = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        if (block.permutation.matches('moremusicdiscs:jukebox')) {
            if (jukeboxManager.getJukebox(block.location, block.dimension.id) == undefined)
                jukeboxManager.setJukebox(block.location, block.dimension.id, { playing_disc: "nothing", playingID: 0 });
            const jukeboxData = jukeboxManager.getJukebox(block.location, block.dimension.id);
            if (heldItem.hasItem() && jukeboxData.playing_disc == "nothing") {
                if (musicDiscs.hasOwnProperty(heldItem?.typeId)) {
                    system.runTimeout(() => {
                        const heldItem = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
                        if (heldItem.hasItem()) {
                            const sound = musicDiscs[heldItem.typeId].sound;
                            const musicdata = musicDiscs[heldItem.typeId];
                            player.dimension.playSound(sound.id, block.location, { volume: sound.volume });
                            jukeboxManager.setJukebox(block.location, block.dimension.id, { playing_disc: heldItem.typeId, playingID: jukeboxData.playingID + 1 });
                            this.playNotes(block.location, block.dimension, jukeboxData.playingID + 1);
                            this.startLoop(block, musicDiscs[heldItem.typeId], jukeboxData.playingID + 1);
                            if (musicdata.artist != undefined) {
                                const players = block.dimension.getEntities({ location: block.location, maxDistance: 15, type: "minecraft:player" });
                                players.forEach((playerInRadius) => {
                                    playerInRadius.onScreenDisplay.setActionBar("§dNow playing: " + musicdata.artist + " - " + musicdata.musicName);
                                });
                            }
                            if (player.getGameMode() != GameMode.creative)
                                equippable.getEquipmentSlot(EquipmentSlot.Mainhand).setItem(undefined);
                        }
                    });
                    return;
                }
            }
            else if (jukeboxData.playing_disc != "nothing") {
                const itemStack = new ItemStack(jukeboxData.playing_disc, 1);
                jukeboxManager.setJukebox(block.location, block.dimension.id, { playing_disc: "nothing", playingID: jukeboxData.playingID });
                system.runTimeout(() => {
                    block.dimension.spawnItem(itemStack, { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 });
                    block.dimension.runCommand(`execute positioned ` + block.location.x + ' ' + block.location.y + ' ' + block.location.z + ' run stopsound @a[r=100] ' + musicDiscs[jukeboxData.playing_disc].sound.id);
                });
            }
        }
    }
    static getJukebox(location, dimensionID) {
        const allJukeboxes = this.getAllJukeboxes();
        if (allJukeboxes.hasOwnProperty(JSON.stringify(location) + dimensionID)) {
            return allJukeboxes[JSON.stringify(location) + dimensionID];
        }
        else
            return undefined;
    }
    static startLoop(jukebox, sound, playingID) {
        let bottomBlock = undefined;
        try {
            bottomBlock = jukebox.below(1);
        }
        catch { }
        if (bottomBlock?.hasTag("pumpkin")) {
            const oldJukeboxData = jukeboxManager.getJukebox(jukebox.location, jukebox.dimension.id);
            system.runTimeout(() => {
                if (!jukebox.isValid())
                    return;
                let bottomBlock = undefined;
                try {
                    bottomBlock = jukebox.below(1);
                }
                catch { }
                if (bottomBlock == undefined)
                    return;
                if (!bottomBlock.hasTag("pumpkin"))
                    return;
                const jukeboxData = this.getJukebox(jukebox.location, jukebox.dimension.id);
                if (jukeboxData.playingID == playingID && jukeboxData.playing_disc == oldJukeboxData.playing_disc) {
                    try {
                        jukebox.dimension.playSound(sound.sound.id, jukebox.location, { volume: sound.sound.volume });
                    }
                    catch { }
                    this.startLoop(jukebox, sound, playingID);
                }
            }, sound.sound.tickLength);
        }
    }
    static getAllJukeboxes() {
        let data = world.getDynamicProperty("jukeboxes");
        if (data == undefined)
            data = {};
        return JSON.parse(data);
    }
    static setJukebox(location, dimensionID, data) {
        const allJukeboxes = this.getAllJukeboxes();
        allJukeboxes[JSON.stringify(location) + dimensionID] = data;
        world.setDynamicProperty("jukeboxes", JSON.stringify(allJukeboxes));
    }
    static removeJukebox(location, dimensionID) {
        const jukeboxes = this.getAllJukeboxes();
        delete jukeboxes[JSON.stringify(location) + dimensionID];
        world.setDynamicProperty("jukeboxes", JSON.stringify(jukeboxes));
    }
    static breakJukebox(block) {
        const jukeboxData = jukeboxManager.getJukebox(block.location, block.dimension.id);
        if (jukeboxData != undefined)
            if (jukeboxData.playing_disc != "nothing") {
                const itemStack = new ItemStack(jukeboxData.playing_disc, 1);
                block.dimension.spawnItem(itemStack, { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 });
                block.dimension.runCommand(`execute positioned ` + block.location.x + ' ' + block.location.y + ' ' + block.location.z + ' run stopsound @a[r=100] ' + musicDiscs[jukeboxData.playing_disc].sound.id);
            }
        jukeboxManager.removeJukebox(block.location, block.dimension.id);
    }
    static playNotes(location, dimension, playingID) {
        function tick() {
            const jukebox = jukeboxManager.getJukebox(location, dimension.id);
            if (jukebox.playingID != playingID)
                return;
            if (jukebox == undefined)
                return;
            let randomtick = Math.floor(Math.random() * 20);
            if (randomtick < 10)
                randomtick = 10;
            if (jukebox.playing_disc == "nothing")
                return;
            try {
                dimension.spawnParticle("minecraft:note_particle", { x: location.x + 0.5, y: location.y + 1.1, z: location.z + 0.5 });
            }
            catch { }
            system.runTimeout(() => {
                tick();
            }, randomtick);
        }
        tick();
    }
}
