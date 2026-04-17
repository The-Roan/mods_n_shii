import { EquipmentSlot, EntityEquippableComponent, GameMode, system, ItemStack, BlockInventoryComponent } from '@minecraft/server';
import { musicDiscs } from '../musicDisc/musicDiscs';
import { randomNum, randomWholeNum } from '../math/randomNumbers';
var JukeboxStates;
(function (JukeboxStates) {
    JukeboxStates["Playing_Disc"] = "moremusicdiscs:playing_disc";
    JukeboxStates["Vanilla_Disc_1"] = "moremusicdiscs:vanilla_disc_1";
    JukeboxStates["Vanilla_Disc_2"] = "moremusicdiscs:vanilla_disc_2";
    JukeboxStates["Custom_Disc_1"] = "moremusicdiscs:custom_disc_1";
    JukeboxStates["Custom_Disc_2"] = "moremusicdiscs:custom_disc_2";
})(JukeboxStates || (JukeboxStates = {}));
const states = [
    JukeboxStates.Vanilla_Disc_1,
    JukeboxStates.Vanilla_Disc_2,
    JukeboxStates.Custom_Disc_1,
    JukeboxStates.Custom_Disc_2
];
var HopperLocations;
(function (HopperLocations) {
    HopperLocations["Up"] = "up";
    HopperLocations["North"] = "north";
    HopperLocations["South"] = "south";
    HopperLocations["East"] = "east";
    HopperLocations["West"] = "west";
})(HopperLocations || (HopperLocations = {}));
const playingJukeboxes = {};
export class jukeboxManager {
    static jukeboxID = 'moremusicdiscs:jukebox';
    static tick(block, dimension) {
        const center = block.center();
        const players = this.getPlayersInRadius(center, dimension, 40);
        if (!players[0])
            return;
        const isPlayingDisc = block.permutation.getState(JukeboxStates.Playing_Disc);
        if (isPlayingDisc) {
            if (!playingJukeboxes[`${block.dimension.id}.${JSON.stringify(block.location)}`]) {
                block.setPermutation(block.permutation.withState(JukeboxStates.Playing_Disc, false));
                const discData = this.getPlayingDisc(block.permutation);
                if (discData)
                    this.stopSoundInRadius(discData.data.sound.id, block.location, block.dimension, 100);
            }
            return;
        }
        const discData = this.getPlayingDisc(block.permutation);
        if (discData) {
            const hopper = this.getOutputHopper(block);
            if (!hopper)
                return;
            const inv = this.getInventory(hopper);
            if (!inv)
                return;
            if (!inv.container)
                return;
            if (inv.container.emptySlotsCount <= 0)
                return;
            const item = new ItemStack(discData.id, 1);
            inv.container.addItem(item);
            this.clearDisc(block);
        }
        else {
            const hoppers = this.getConnectedHoppers(block, dimension);
            if (!hoppers[0])
                return;
            let found = false;
            for (const hopper of hoppers) {
                if (found)
                    return;
                const inv = this.getInventory(hopper);
                if (!inv)
                    continue;
                if (!inv.container)
                    continue;
                for (let i = 0; i < inv.container.size; i++) {
                    if (found)
                        return;
                    const item = inv.container.getItem(i);
                    if (!item)
                        continue;
                    const disc = musicDiscs[item.typeId];
                    if (!disc)
                        continue;
                    this.playDisc(block, dimension, disc, item.typeId);
                    inv.container.setItem(i, undefined);
                    found = true;
                }
            }
        }
    }
    static getInventory(block) {
        const inv = block.getComponent(BlockInventoryComponent.componentId);
        return inv;
    }
    static interactWithJukebox(block, player) {
        const dimension = block.dimension;
        const disc = this.getPlayingDisc(block.permutation);
        const center = block.center();
        if (!disc) {
            const mainhand = player.getComponent(EntityEquippableComponent.componentId).getEquipmentSlot(EquipmentSlot.Mainhand);
            if (!mainhand)
                return;
            const item = mainhand.getItem();
            if (!item)
                return;
            const discdata = musicDiscs[item.typeId];
            if (!discdata)
                return;
            if (player.getGameMode() != GameMode.creative)
                mainhand.setItem();
            this.playDisc(block, dimension, discdata, item.typeId);
        }
        else {
            this.stopSoundInRadius(disc.data.sound.id, center, dimension, 100);
            const item = new ItemStack(disc.id, 1);
            const itemEntity = this.spawnItemAnywhere(item, { x: center.x, y: center.y + 0.5, z: center.z }, block.dimension);
            itemEntity.applyImpulse({ x: randomNum(-0.2, 0.2), y: 0.2, z: randomNum(-0.2, 0.2) });
            this.clearDisc(block);
            delete playingJukeboxes[`${block.dimension.id}.${JSON.stringify(block.location)}`];
        }
    }
    static getConnectedHoppers(mainblock, dimension) {
        const blockLoc = mainblock.location;
        const hoppers = [];
        const directions = [HopperLocations.Up, HopperLocations.North, HopperLocations.South, HopperLocations.East, HopperLocations.West];
        for (const dir of directions) {
            let loc = undefined;
            switch (dir) {
                case HopperLocations.Up:
                    loc = { x: 0, y: 1, z: 0 };
                    break;
                case HopperLocations.North:
                    loc = { x: 0, y: 0, z: -1 };
                    break;
                case HopperLocations.South:
                    loc = { x: 0, y: 0, z: 1 };
                    break;
                case HopperLocations.East:
                    loc = { x: 1, y: 0, z: 0 };
                    break;
                case HopperLocations.West:
                    loc = { x: -1, y: 0, z: 0 };
                    break;
            }
            let block = undefined;
            if (loc == undefined)
                continue;
            try {
                block = dimension.getBlock({ x: blockLoc.x + loc.x, y: blockLoc.y + loc.y, z: blockLoc.z + loc.z });
            }
            catch { }
            if (!block)
                continue;
            if (block.typeId != "minecraft:hopper")
                continue;
            let connectedValue = undefined;
            const facing = block.permutation.getState("facing_direction");
            switch (facing) {
                case 0:
                    connectedValue = HopperLocations.Up;
                    break;
                case 3:
                    connectedValue = HopperLocations.North;
                    break;
                case 2:
                    connectedValue = HopperLocations.South;
                    break;
                case 4:
                    connectedValue = HopperLocations.East;
                    break;
                case 5:
                    connectedValue = HopperLocations.West;
                    break;
            }
            if (connectedValue == undefined)
                continue;
            if (connectedValue != dir)
                continue;
            hoppers.push(block);
        }
        return hoppers;
    }
    static getOutputHopper(block) {
        let hopper = undefined;
        try {
            hopper = block.below(1);
        }
        catch { }
        if (!hopper)
            return undefined;
        if (hopper.typeId != "minecraft:hopper")
            return undefined;
        return hopper;
    }
    static playDisc(block, dimension, discdata, discName) {
        const center = block.center();
        const location = block.location;
        playingJukeboxes[`${block.dimension.id}.${JSON.stringify(block.location)}`] = true;
        dimension.playSound(discdata.sound.id, center, { volume: discdata.sound.volume });
        this.setDisc(block, discName);
        this.getPlayersInRadius(center, dimension, 20).forEach((player) => {
            player.onScreenDisplay.setActionBar(`§dNow Playing: ${discdata.musicName} - ${discdata.artist}`);
        });
        this.playNotes(block.location, dimension, discName);
        let canceled = false;
        let tick = 0;
        const interval = system.runInterval(() => {
            tick++;
            if ((tick * 10) > discdata.sound.tickLength) {
                system.clearRun(interval);
                return;
            }
            let newBlock = undefined;
            try {
                newBlock = dimension.getBlock(location);
            }
            catch { }
            if (!newBlock)
                return;
            if (newBlock.typeId != this.jukeboxID) {
                canceled = true;
                system.clearRun(interval);
                return;
            }
            const newdiscdata = this.getPlayingDisc(newBlock.permutation);
            if (!newdiscdata) {
                canceled = true;
                system.clearRun(interval);
                return;
            }
            if (newdiscdata.id != discName) {
                canceled = true;
                system.clearRun(interval);
                return;
            }
        }, 10);
        system.runTimeout(() => {
            if (canceled)
                return;
            let newBlock = undefined;
            try {
                newBlock = dimension.getBlock(location);
            }
            catch { }
            if (!newBlock)
                return;
            if (newBlock.typeId != this.jukeboxID)
                return;
            const newdiscdata = this.getPlayingDisc(newBlock.permutation);
            if (!newdiscdata)
                return;
            if (newdiscdata.id != discName)
                return;
            newBlock.setPermutation(newBlock.permutation.withState(JukeboxStates.Playing_Disc, false));
            delete playingJukeboxes[`${block.dimension.id}.${JSON.stringify(block.location)}`];
            this.stopSoundInRadius(newdiscdata.data.sound.id, center, dimension, 100);
        }, discdata.sound.tickLength);
    }
    static breakJukebox(data) {
        const { block, dimension, player, destroyedBlockPermutation } = data;
        const playingDisc = this.getPlayingDisc(data.destroyedBlockPermutation);
        if (!playingDisc)
            return;
        const item = new ItemStack(playingDisc.id, 1);
        const center = block.center();
        const itemEntity = this.spawnItemAnywhere(item, { x: center.x, y: center.y, z: center.z }, block.dimension);
        itemEntity.applyImpulse({ x: randomNum(-0.2, 0.2), y: 0.2, z: randomNum(-0.2, 0.2) });
        this.stopSoundInRadius(playingDisc.data.sound.id, center, block.dimension, 100);
    }
    static stopSoundInRadius(soundID, location, dimension, radius) {
        const players = this.getPlayersInRadius(location, dimension, 100);
        for (const player of players) {
            if (player.isValid())
                player.runCommand(`stopsound @s  ${soundID}`);
        }
    }
    static getPlayingDisc(permutation) {
        let disc = undefined;
        for (const state of states) {
            const data = permutation.getState(state);
            if (data != "none") {
                disc = { id: data, data: musicDiscs[data] };
                break;
            }
        }
        return disc;
    }
    static getPlayersInRadius(location, dimension, radius) {
        let players = [];
        players = dimension.getEntities({ location: location, maxDistance: radius, type: "minecraft:player" });
        return players;
    }
    static spawnItemAnywhere(item, location, dimension) {
        const itemEntity = dimension.spawnItem(item, { x: location.x, y: 100, z: location.z });
        itemEntity.teleport(location);
        return itemEntity;
    }
    static clearDisc(block) {
        block.setPermutation(block.permutation.withState("moremusicdiscs:playing_disc", false));
        for (const state of states) {
            block.setPermutation(block.permutation.withState(state, "none"));
        }
    }
    static setDisc(block, id) {
        for (const state of states) {
            block.setPermutation(block.permutation.withState("moremusicdiscs:playing_disc", true));
            try {
                block.setPermutation(block.permutation.withState(state, id));
            }
            catch { }
        }
    }
    static playNotes(location, dimension, playingID) {
        function tick() {
            const players = jukeboxManager.getPlayersInRadius(location, dimension, 30);
            if (players[0] != undefined) {
                let block = undefined;
                try {
                    block = dimension.getBlock(location);
                }
                catch { }
                if (block == undefined)
                    return;
                const isPlayingDisc = block.permutation.getState(JukeboxStates.Playing_Disc);
                if (!isPlayingDisc)
                    return;
                if (block.typeId != jukeboxManager.jukeboxID)
                    return;
                const playingDisc = jukeboxManager.getPlayingDisc(block.permutation);
                if (!playingDisc)
                    return;
                if (playingDisc.id != playingID)
                    return;
                const center = block.center();
                try {
                    dimension.spawnParticle("minecraft:note_particle", { x: center.x, y: center.y + 0.6, z: center.z });
                }
                catch { }
            }
            let randomtick = randomWholeNum(10, 20);
            system.runTimeout(() => {
                tick();
            }, randomtick);
        }
        tick();
    }
}
