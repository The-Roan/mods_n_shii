import { world, system } from "@minecraft/server";

const FRAMES_PER_BATCH = 32;
const TICKS_PER_FRAME  = 4;
const BATCH_COUNT      = 814;
const TYPE_ID          = "ddxblock:screen";

const spawnTicks   = new Map();  // id -> spawn tick
const lastCounters = new Map();  // id -> last seen ddx:seek_counter

world.afterEvents.entitySpawn.subscribe(ev => {
    if (ev.entity.typeId !== TYPE_ID) return;
    spawnTicks.set(ev.entity.id, system.currentTick);
    lastCounters.set(ev.entity.id, 0);
});

world.afterEvents.entityDie.subscribe(ev => {
    if (ev.deadEntity.typeId !== TYPE_ID) return;
    spawnTicks.delete(ev.deadEntity.id);
    lastCounters.delete(ev.deadEntity.id);
});

system.runInterval(() => {
    try {
        const entities = world.getDimension("overworld").getEntities({ type: TYPE_ID });
        for (const entity of entities) {
            const id = entity.id;
            if (!spawnTicks.has(id)) {
                spawnTicks.set(id, system.currentTick);
                lastCounters.set(id, entity.getProperty("ddx:seek_counter"));
            }
            const counter = entity.getProperty("ddx:seek_counter");
            if (counter === lastCounters.get(id)) continue;
            lastCounters.set(id, counter);
            const target      = entity.getProperty("ddx:target_batch");
            const elapsed     = Math.floor((system.currentTick - spawnTicks.get(id)) / TICKS_PER_FRAME);
            const targetFrame = (target % BATCH_COUNT) * FRAMES_PER_BATCH;
            entity.setProperty("ddx:offset", targetFrame - elapsed);
        }
    } catch {}
}, 1);