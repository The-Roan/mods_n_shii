import { world, system, BlockPermutation } from "@minecraft/server";

const BATCH_COUNT    = 814;
const BATCH_INTERVAL = 128;  // 32 frames x 4 ticks/frame = one batch at 5fps
const BLOCK_PREFIX   = "ddxblock:video_";

// pos key -> runTimeout handle; cancelled when the block is broken
const pendingTimers = new Map();

function scheduleNext(x, y, z, currentBatch) {
    const key    = `${x},${y},${z}`;
    const handle = system.runTimeout(() => {
        pendingTimers.delete(key);
        const dim = world.getDimension("overworld");
        try {
            const block = dim.getBlock({ x, y, z });
            if (!block?.typeId.startsWith(BLOCK_PREFIX)) return;
            const next   = (currentBatch % BATCH_COUNT) + 1;
            const nextId = BLOCK_PREFIX + String(next).padStart(4, "0");
            block.setPermutation(BlockPermutation.resolve(nextId));
            scheduleNext(x, y, z, next);
        } catch {}
    }, BATCH_INTERVAL);
    pendingTimers.set(key, handle);
}

world.afterEvents.playerPlaceBlock.subscribe(ev => {
    const id = ev.block.typeId;
    if (!id.startsWith(BLOCK_PREFIX)) return;
    const batch = parseInt(id.slice(BLOCK_PREFIX.length), 10);
    const { x, y, z } = ev.block.location;
    scheduleNext(x, y, z, batch);
});

world.afterEvents.playerBreakBlock.subscribe(ev => {
    const id = ev.brokenBlockPermutation.type.id;
    if (!id.startsWith(BLOCK_PREFIX)) return;
    const { x, y, z } = ev.block.location;
    const key    = `${x},${y},${z}`;
    const handle = pendingTimers.get(key);
    if (handle !== undefined) {
        system.clearRun(handle);
        pendingTimers.delete(key);
    }
});