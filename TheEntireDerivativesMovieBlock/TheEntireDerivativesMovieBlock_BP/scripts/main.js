import { world, system } from "@minecraft/server";

const FPB         = 32;
const TPF         = 4;
const BATCH_COUNT = 814;
const TYPE_ID     = "ddxblock:screen";
const DIM         = "overworld";

const spawnTicks     = new Map();
const lastCounters   = new Map();
const lastAudioBatch = new Map();

function stopSegment(batch) {
    if (batch < 0) return;
    const id = `ddx.segment_${String(batch).padStart(4, '0')}`;
    try { world.getDimension(DIM).runCommand(`stopsound @a ${id}`); } catch {}
}

function playSegment(batch) {
    const id = `ddx.segment_${String(batch).padStart(4, '0')}`;
    for (const player of world.getAllPlayers()) {
        try { player.playSound(id, { volume: 1.0 }); } catch {}
    }
}

world.afterEvents.entitySpawn.subscribe(ev => {
    if (ev.entity.typeId !== TYPE_ID) return;
    spawnTicks.set(ev.entity.id, system.currentTick);
    lastCounters.set(ev.entity.id, 0);
    lastAudioBatch.set(ev.entity.id, -1);
});

world.afterEvents.entityDie.subscribe(ev => {
    if (ev.deadEntity.typeId !== TYPE_ID) return;
    stopSegment(lastAudioBatch.get(ev.deadEntity.id) ?? -1);
    spawnTicks.delete(ev.deadEntity.id);
    lastCounters.delete(ev.deadEntity.id);
    lastAudioBatch.delete(ev.deadEntity.id);
});

system.runInterval(() => {
    try {
        const entities = world.getDimension(DIM).getEntities({ type: TYPE_ID });
        for (const entity of entities) {
            const id = entity.id;
            if (!spawnTicks.has(id)) {
                spawnTicks.set(id, system.currentTick);
                lastCounters.set(id, entity.getProperty("ddx:seek_counter"));
                lastAudioBatch.set(id, -1);
            }

            const elapsed = Math.floor((system.currentTick - spawnTicks.get(id)) / TPF);

            // Seek detection — stop old audio immediately, offset will re-trigger correct segment
            const counter = entity.getProperty("ddx:seek_counter");
            if (counter !== lastCounters.get(id)) {
                lastCounters.set(id, counter);
                stopSegment(lastAudioBatch.get(id) ?? -1);
                lastAudioBatch.set(id, -1);
                const target      = entity.getProperty("ddx:target_batch");
                const targetFrame = (target % BATCH_COUNT) * FPB;
                entity.setProperty("ddx:offset", targetFrame - elapsed);
            }

            // Audio sync — stop previous segment, play new one whenever batch changes
            const offset = entity.getProperty("ddx:offset") || 0;
            const frame  = elapsed + offset;
            const batch  = Math.floor(frame / FPB) % BATCH_COUNT;
            if (batch >= 0 && batch !== lastAudioBatch.get(id)) {
                stopSegment(lastAudioBatch.get(id) ?? -1);
                lastAudioBatch.set(id, batch);
                playSegment(batch);
            }
        }
    } catch {}
}, 1);