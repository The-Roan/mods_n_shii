import { world, system } from "@minecraft/server";
import { ROOMS, OPEN_ROOM, CELL_SIZE } from "./rooms.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const INITIAL_ROOMS  = 50;   // rooms carved on first join (DFS maze)
const EXPLORE_ROOMS  = 80;   // max new rooms per exploration tick
const EXPLORE_AHEAD  = 10;   // cell radius to keep frontier ahead of player
const CHECK_INTERVAL = 10;   // ticks between exploration scans

const NEXTBOT_TYPES   = ["shitrooms:nextbot", "shitrooms:nextbot2", "shitrooms:nextbot3"];
const MAX_PER_TYPE    = 3;
const SPAWN_DELAY     = 600;  // ticks before first spawn (~30 seconds)
const SPAWN_INTERVAL  = 600;  // ticks between spawn attempts (~30 seconds)
const SPAWN_MIN_DIST  = 10;   // minimum cell distance from any player to spawn
const SPAWN_MAX_DIST  = 20;   // maximum cell distance — beyond this chunks are likely unloaded

const DIRS = [
  { dx:  0, dz: -1, face: "north", opp: "south" },
  { dx:  0, dz:  1, face: "south", opp: "north" },
  { dx:  1, dz:  0, face: "east",  opp: "west"  },
  { dx: -1, dz:  0, face: "west",  opp: "east"  },
];


const placedCells = new Map(); // cellKey -> Set<exitFace>
const placedRooms = new Map(); // cellKey -> roomId
let originX = 0, originY = 0, originZ = 0;

function cellKey(gx, gz) { return `${gx},${gz}`; }

export function resetState() { placedCells.clear(); placedRooms.clear(); }
export function getOrigin() { return { x: originX, y: originY, z: originZ }; }

// Pick a room that has all required exits, boosting rooms whose type already
// appears in a neighbour cell (clusterBonus drives same-type clustering).
function pickRoom(exits, neighborIds = []) {
  const need = new Set(exits);
  const valid = ROOMS.filter(r => [...need].every(e => new Set(r.exits).has(e)));
  if (valid.length === 0) return ROOMS[ROOMS.length - 1];
  const total = valid.reduce((s, r) => {
    const w = (r.weight ?? 1) * (neighborIds.includes(r.id) ? (r.clusterBonus ?? 1) : 1);
    return s + w;
  }, 0);
  let rand = Math.random() * total;
  for (const room of valid) {
    rand -= (room.weight ?? 1) * (neighborIds.includes(room.id) ? (room.clusterBonus ?? 1) : 1);
    if (rand <= 0) return room;
  }
  return valid[valid.length - 1];
}

function placeRoom(dim, room, wx, wy, wz) {
  dim.runCommand(`structure load ${room.id} ${wx} ${wy} ${wz}`);
}

// ─── Iterative DFS maze carver ────────────────────────────────────────────────
function carveMaze(startGx, startGz, maxNew) {
  const newCells = new Map();
  const stack = [{ gx: startGx, gz: startGz }];
  if (!placedCells.has(cellKey(startGx, startGz))) {
    newCells.set(cellKey(startGx, startGz), new Set());
  }

  while (stack.length > 0 && newCells.size < maxNew) {
    const { gx, gz } = stack[stack.length - 1];
    const unvisited = DIRS.filter(d =>
      !newCells.has(cellKey(gx + d.dx, gz + d.dz)) &&
      !placedCells.has(cellKey(gx + d.dx, gz + d.dz))
    );
    if (unvisited.length === 0) { stack.pop(); continue; }

    const dir = unvisited[Math.floor(Math.random() * unvisited.length)];
    const nx = gx + dir.dx, nz = gz + dir.dz;
    const curKey = cellKey(gx, gz);
    if (newCells.has(curKey))         newCells.get(curKey).add(dir.face);
    else if (placedCells.has(curKey)) placedCells.get(curKey).add(dir.face);
    newCells.set(cellKey(nx, nz), new Set([dir.opp]));
    stack.push({ gx: nx, gz: nz });
  }
  return newCells;
}

function commitCells(newCells, dim) {
  for (const [key, exits] of newCells) {
    const [gx, gz] = key.split(",").map(Number);
    try {
      const neighborIds = DIRS
        .map(d => placedRooms.get(cellKey(gx + d.dx, gz + d.dz)))
        .filter(Boolean);
      const room = pickRoom([...exits], neighborIds);
      placeRoom(dim, room, originX + gx * CELL_SIZE, originY, originZ + gz * CELL_SIZE);
      placedCells.set(key, exits);
      placedRooms.set(key, room.id);
    } catch { }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateInitial(player) {
  const loc = player.location;
  originX = Math.floor(loc.x) - 2;
  originY = Math.floor(loc.y) - 1;
  originZ = Math.floor(loc.z) - 2;

  // Pre-place a 3x3 open area so the player is never boxed in at spawn
  for (let gx = -1; gx <= 1; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      placeRoom(player.dimension, OPEN_ROOM, originX + gx * CELL_SIZE, originY, originZ + gz * CELL_SIZE);
      placedCells.set(cellKey(gx, gz), new Set(["north", "south", "east", "west"]));
      placedRooms.set(cellKey(gx, gz), OPEN_ROOM.id);
    }
  }

  // Carve outward from each corner so the maze expands in all four directions
  for (const [sgx, sgz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const newCells = carveMaze(sgx, sgz, Math.ceil(INITIAL_ROOMS / 4));
    if (newCells.size > 0) commitCells(newCells, player.dimension);
  }

  // Settle player into the center of the open spawn area
  system.runTimeout(() => {
    try {
      player.teleport(
        { x: originX + 2.5, y: originY + 1, z: originZ + 2.5 },
        { dimension: player.dimension }
      );
    } catch {}
  }, 5);
}

// ─── Nextbot Spawner ──────────────────────────────────────────────────────────

export function startSpawnLoop() {
  system.runTimeout(() => {
    system.runInterval(() => {
      if (placedCells.size === 0) return;
      const players = world.getPlayers();
      if (players.length === 0) return;
      const dim = players[0].dimension;

      const type = NEXTBOT_TYPES[Math.floor(Math.random() * NEXTBOT_TYPES.length)];
      const existing = dim.getEntities({ type }).length;
      if (existing >= MAX_PER_TYPE) return;

      const NO_SPAWN_ROOMS = new Set(["shitrooms:corridors", "shitrooms:cross", "shitrooms:x"]);
      const validKeys = [...placedCells.keys()].filter(k => {
        if (NO_SPAWN_ROOMS.has(placedRooms.get(k))) return false;
        const [gx, gz] = k.split(",").map(Number);
        return players.every(p => {
          const pgx = Math.round((p.location.x - originX) / CELL_SIZE);
          const pgz = Math.round((p.location.z - originZ) / CELL_SIZE);
          const dist = Math.abs(gx - pgx) + Math.abs(gz - pgz);
          return dist >= SPAWN_MIN_DIST && dist <= SPAWN_MAX_DIST;
        });
      });
      if (validKeys.length === 0) return;

      const key = validKeys[Math.floor(Math.random() * validKeys.length)];
      const [gx, gz] = key.split(",").map(Number);
      const wx = originX + gx * CELL_SIZE + 2;
      const wy = originY + 1;
      const wz = originZ + gz * CELL_SIZE + 2;
      try {
        const entity = dim.spawnEntity(type, { x: wx, y: wy, z: wz });
        system.runTimeout(() => { try { entity.kill(); } catch { } }, 3600);
      } catch { }
    }, SPAWN_INTERVAL);
  }, SPAWN_DELAY);
}

export function startExplorationLoop() {
  system.runInterval(() => {
    if (placedCells.size === 0) return;

    for (const player of world.getPlayers()) {
      const loc = player.location;
      const pgx = Math.floor((loc.x - originX) / CELL_SIZE);
      const pgz = Math.floor((loc.z - originZ) / CELL_SIZE);
      const dim = player.dimension;

      // Collect every placed cell that has at least one unplaced neighbour within radius.
      // These are the frontier seeds from which DFS can expand.
      const seeds = [];
      for (let dgx = -EXPLORE_AHEAD; dgx <= EXPLORE_AHEAD; dgx++) {
        for (let dgz = -EXPLORE_AHEAD; dgz <= EXPLORE_AHEAD; dgz++) {
          const gx = pgx + dgx, gz = pgz + dgz;
          if (!placedCells.has(cellKey(gx, gz))) continue;
          for (const dir of DIRS) {
            if (!placedCells.has(cellKey(gx + dir.dx, gz + dir.dz))) {
              seeds.push({ gx, gz });
              break;
            }
          }
        }
      }

      if (seeds.length === 0) continue; // area fully covered

      // Shuffle so all directions get a fair shot each tick.
      for (let i = seeds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
      }

      // Run DFS from each seed, sharing the EXPLORE_ROOMS budget.
      let remaining = EXPLORE_ROOMS;
      for (const { gx, gz } of seeds) {
        if (remaining <= 0) break;
        const newCells = carveMaze(gx, gz, remaining);
        if (newCells.size === 0) continue;
        commitCells(newCells, dim);
        remaining -= newCells.size;
      }
    }
  }, CHECK_INTERVAL);
}
