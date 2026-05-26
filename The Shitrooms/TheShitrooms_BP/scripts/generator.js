import { world, system } from "@minecraft/server";
import { ROOMS, OPEN_ROOM, CELL_SIZE } from "./rooms.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const INITIAL_ROOMS  = 50;
const EXPLORE_ROOMS  = 80;
const EXPLORE_AHEAD  = 10;
const CHECK_INTERVAL = 10;

const SHITROOMS_Y   = -64;  // Floor replaces the bottom bedrock layer
const ROOF_Y_OFFSET = CELL_SIZE; // Bedrock cap 1 block above room ceiling (Y = -64+5 = -59)

const NEXTBOT_TYPES  = ["shitrooms:nextbot", "shitrooms:nextbot2", "shitrooms:nextbot3", "shitrooms:nextbot4", "shitrooms:nextbot5"];
const MAX_PER_TYPE   = 3;
const SPAWN_DELAY    = 600;
const SPAWN_INTERVAL = 600;
const SPAWN_MIN_DIST = 10;
const SPAWN_MAX_DIST = 20;

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

// Mirrors the same helper in main.js (can't import across without circular deps)
function isInShitrooms(player) {
  return !!world.getDynamicProperty(`shitrooms:in_shitrooms:${player.name}`);
}

export function resetState() {
  placedCells.clear(); placedRooms.clear(); originX = 0; originY = 0; originZ = 0;
  try { world.setDynamicProperty("shitrooms:cells_n", 0); } catch { }
}
export function getOrigin() { return { x: originX, y: originY, z: originZ }; }
export function getPlacedCells() { return placedCells; }

function saveState() {
  try {
    world.setDynamicProperty("shitrooms:ox", originX);
    world.setDynamicProperty("shitrooms:oy", originY);
    world.setDynamicProperty("shitrooms:oz", originZ);
    const parts = [];
    for (const [k] of placedCells) {
      const suffix = (placedRooms.get(k) ?? "").replace("shitrooms:", "");
      parts.push(k + "~" + suffix);
    }
    const data = parts.join("|");
    const CHUNK = 30000;
    let chunk = 0;
    for (let i = 0; i < data.length; i += CHUNK) {
      world.setDynamicProperty(`shitrooms:cells_${chunk}`, data.slice(i, i + CHUNK));
      chunk++;
    }
    world.setDynamicProperty("shitrooms:cells_n", chunk);
  } catch { }
}

export function restoreState() {
  const ox = world.getDynamicProperty("shitrooms:ox");
  const oy = world.getDynamicProperty("shitrooms:oy");
  const oz = world.getDynamicProperty("shitrooms:oz");
  if (typeof ox !== "number") return;
  originX = ox; originY = oy; originZ = oz;
  const n = world.getDynamicProperty("shitrooms:cells_n");
  if (typeof n !== "number" || n === 0) return;
  let data = "";
  for (let i = 0; i < n; i++) data += world.getDynamicProperty(`shitrooms:cells_${i}`) ?? "";
  for (const entry of data.split("|")) {
    if (!entry) continue;
    const tilde = entry.indexOf("~");
    if (tilde === -1) continue;
    const k = entry.slice(0, tilde);
    const suffix = entry.slice(tilde + 1);
    placedCells.set(k, new Set());
    if (suffix) placedRooms.set(k, "shitrooms:" + suffix);
  }
}

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

// Rooms with no unlit variant — always stay lit regardless of distance.
const NO_UNLIT = new Set(["shitrooms:pickaxe"]);

function placeRoom(dim, room, wx, wy, wz) {
  // Pre-fill the entire cell with air so that natural bedrock layers
  // (Y=-63, -62, etc.) are cleared before the structure is placed.
  try {
    dim.runCommand(`fill ${wx} ${wy} ${wz} ${wx + CELL_SIZE - 1} ${wy + CELL_SIZE - 1} ${wz + CELL_SIZE - 1} air`);
  } catch {}

  // Farther from the maze entrance → higher chance of unlit room.
  // At 0 blocks: 0% unlit. At 1000+ blocks: 100% unlit.
  // Unlit variants are named <id>_unlit, e.g. shitrooms:open_unlit.
  const dist        = Math.sqrt((wx - originX) ** 2 + (wz - originZ) ** 2);
  const unlitChance = Math.min(dist / 500, 1.0);
  const useUnlit    = Math.random() < unlitChance && !NO_UNLIT.has(room.id);
  const id          = useUnlit ? room.id + "_unlit" : room.id;
  dim.runCommand(`structure load ${id} ${wx} ${wy} ${wz}`);
}

// Place a 1-block-thick bedrock layer above the room ceiling so players
// digging down see bedrock instead of the shitrooms from above.
function sealRoof(dim, wx, wz) {
  const ry = originY + ROOF_Y_OFFSET;
  try {
    dim.runCommand(`fill ${wx} ${ry} ${wz} ${wx + CELL_SIZE - 1} ${ry} ${wz + CELL_SIZE - 1} bedrock`);
  } catch { }
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
      const wx = originX + gx * CELL_SIZE;
      const wz = originZ + gz * CELL_SIZE;
      placeRoom(dim, room, wx, originY, wz);
      sealRoof(dim, wx, wz);  // bedrock cap above every placed cell
      placedCells.set(key, exits);
      placedRooms.set(key, room.id);
    } catch { }
  }
  saveState();
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Generates the maze at the bottom of the world (Y = SHITROOMS_Y) centered on
// the given player's XZ position. Does NOT teleport the player — that happens
// in main.js when the player touches Trump.
export function generateInitial(player) {
  const loc = player.location;
  originX = Math.floor(loc.x) - 2;
  originY = SHITROOMS_Y;   // fixed deep underground — replaces natural bedrock
  originZ = Math.floor(loc.z) - 2;

  const dim = world.getDimension("overworld");

  // Pre-place a 3×3 open area so the player is never boxed in at spawn
  for (let gx = -1; gx <= 1; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      const wx = originX + gx * CELL_SIZE;
      const wz = originZ + gz * CELL_SIZE;
      placeRoom(dim, OPEN_ROOM, wx, originY, wz);
      sealRoof(dim, wx, wz);
      placedCells.set(cellKey(gx, gz), new Set(["north", "south", "east", "west"]));
      placedRooms.set(cellKey(gx, gz), OPEN_ROOM.id);
    }
  }

  // Carve outward from each corner
  for (const [sgx, sgz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const newCells = carveMaze(sgx, sgz, Math.ceil(INITIAL_ROOMS / 4));
    if (newCells.size > 0) commitCells(newCells, dim);
  }
  // Player is NOT teleported here — enterShitrooms() in main.js handles that.
}

// ─── Nextbot Spawner ──────────────────────────────────────────────────────────

export function startSpawnLoop() {
  system.runTimeout(() => {
    system.runInterval(() => {
      if (placedCells.size === 0) return;

      // Only spawn nextbots when at least one player is inside the shitrooms
      const shitroomsPlayers = world.getPlayers().filter(p => isInShitrooms(p));
      if (shitroomsPlayers.length === 0) return;

      const dim = world.getDimension("overworld");

      const NO_SPAWN_ROOMS = new Set(["shitrooms:corridors", "shitrooms:cross", "shitrooms:x"]);
      const validKeys = [...placedCells.keys()].filter(k => {
        if (NO_SPAWN_ROOMS.has(placedRooms.get(k))) return false;
        const [gx, gz] = k.split(",").map(Number);
        return shitroomsPlayers.every(p => {
          const pgx = Math.round((p.location.x - originX) / CELL_SIZE);
          const pgz = Math.round((p.location.z - originZ) / CELL_SIZE);
          const dist = Math.abs(gx - pgx) + Math.abs(gz - pgz);
          return dist >= SPAWN_MIN_DIST && dist <= SPAWN_MAX_DIST;
        });
      });
      if (validKeys.length === 0) return;

      for (let i = 0; i < 2; i++) {
        const type = NEXTBOT_TYPES[Math.floor(Math.random() * NEXTBOT_TYPES.length)];
        if (dim.getEntities({ type }).length >= MAX_PER_TYPE) continue;
        const key = validKeys[Math.floor(Math.random() * validKeys.length)];
        const [gx, gz] = key.split(",").map(Number);
        const wx = originX + gx * CELL_SIZE + 2;
        const wy = originY + 1;
        const wz = originZ + gz * CELL_SIZE + 2;
        try {
          const entity = dim.spawnEntity(type, { x: wx, y: wy, z: wz });
          system.runTimeout(() => { try { entity.kill(); } catch { } }, 3600);
        } catch { }
      }
    }, SPAWN_INTERVAL);
  }, SPAWN_DELAY);
}

export function startExplorationLoop() {
  system.runInterval(() => {
    if (placedCells.size === 0) return;

    // Only extend the maze for players who are actually inside it
    const shitroomsPlayers = world.getPlayers().filter(p => isInShitrooms(p));
    if (shitroomsPlayers.length === 0) return;

    const dim = world.getDimension("overworld");

    for (const player of shitroomsPlayers) {
      const loc = player.location;
      const pgx = Math.floor((loc.x - originX) / CELL_SIZE);
      const pgz = Math.floor((loc.z - originZ) / CELL_SIZE);

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

      if (seeds.length === 0) continue;

      for (let i = seeds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
      }

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
