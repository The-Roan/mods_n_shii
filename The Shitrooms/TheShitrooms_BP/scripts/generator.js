import { world, system } from "@minecraft/server";
import { ROOMS, ROOMS_1, OPEN_ROOM, OPEN_ROOM_1, CELL_SIZE } from "./rooms.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const INITIAL_ROOMS  = 50;
const EXPLORE_ROOMS  = 80;
const EXPLORE_AHEAD  = 10;
const CHECK_INTERVAL = 10;

const SHITROOMS_Y    = -64;
const ROOF_Y_OFFSET  = CELL_SIZE;      // bedrock above floor 0: originY + 5
const ROOF_Y_OFFSET1 = CELL_SIZE * 2;  // bedrock above floor 1: originY + 10
const EXIT_DIST_MIN  = 650;            // world-block distance at which exit room spawns
const UNLIT_DIST_1   = 300;            // floor 1 goes dark 300 blocks from entry

const NEXTBOT_TYPES  = ["shitrooms:nextbot", "shitrooms:nextbot2", "shitrooms:nextbot3", "shitrooms:nextbot4", "shitrooms:nextbot5", "shitrooms:nextbot6"];
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

// Rooms with no unlit variant
const NO_UNLIT   = new Set(["shitrooms:pickaxe", "shitrooms:flashlight", "shitrooms:exit"]);
const NO_UNLIT_1 = new Set(["shitrooms:1_flashlight"]);

// ─── State ────────────────────────────────────────────────────────────────────
const placedCells  = new Map();
const placedRooms  = new Map();
const placedCells1 = new Map();
const placedRooms1 = new Map();

let originX = 0, originY = 0, originZ = 0;
let floor1Active = false;
let exitGx = 0, exitGz = 0;
let exitWX = 0, exitWZ = 0; // world coords of exit room corner
let exitPlaced = false;
let exitMusicSpawned = false;

const playerFloorTracker = new Map(); // playerName -> last known floor (0 or 1)

function cellKey(gx, gz) { return `${gx},${gz}`; }

function isInShitrooms(player) {
  return !!world.getDynamicProperty(`shitrooms:in_shitrooms:${player.name}`);
}

// Returns 1 if player is on floor 1 (Y >= originY + CELL_SIZE - 0.5), else 0.
export function playerFloorOf(player) {
  if (originY === 0 && originX === 0 && originZ === 0) return 0;
  return player.location.y >= originY + CELL_SIZE - 0.5 ? 1 : 0;
}

export function getFloor1State() {
  return { floor1Active, exitGx, exitGz, exitWX, exitWZ, exitPlaced };
}

export function resetState() {
  placedCells.clear();  placedRooms.clear();
  placedCells1.clear(); placedRooms1.clear();
  originX = 0; originY = 0; originZ = 0;
  floor1Active = false; exitGx = 0; exitGz = 0; exitPlaced = false; exitMusicSpawned = false;
  playerFloorTracker.clear();
  try { world.setDynamicProperty("shitrooms:cells_n",      0);     } catch {}
  try { world.setDynamicProperty("shitrooms:cells1_n",     0);     } catch {}
  try { world.setDynamicProperty("shitrooms:floor1_active", false); } catch {}
  try { world.setDynamicProperty("shitrooms:exit_placed",  false); } catch {}
  try { world.setDynamicProperty("shitrooms:exit_gx",      0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit_gz",      0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit_wx",      0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit_wz",      0);     } catch {}
}

export function getOrigin()      { return { x: originX, y: originY, z: originZ }; }
export function getPlacedCells() { return placedCells; }

function saveState() {
  try {
    world.setDynamicProperty("shitrooms:ox", originX);
    world.setDynamicProperty("shitrooms:oy", originY);
    world.setDynamicProperty("shitrooms:oz", originZ);
    world.setDynamicProperty("shitrooms:floor1_active", floor1Active);
    world.setDynamicProperty("shitrooms:exit_placed",   exitPlaced);
    world.setDynamicProperty("shitrooms:exit_gx",       exitGx);
    world.setDynamicProperty("shitrooms:exit_gz",       exitGz);
    world.setDynamicProperty("shitrooms:exit_wx",       exitWX);
    world.setDynamicProperty("shitrooms:exit_wz",       exitWZ);

    const CHUNK = 30000;

    // Floor 0
    const parts = [];
    for (const [k] of placedCells) {
      const suffix = (placedRooms.get(k) ?? "").replace("shitrooms:", "");
      parts.push(k + "~" + suffix);
    }
    const data = parts.join("|");
    let chunk = 0;
    for (let i = 0; i < data.length; i += CHUNK) {
      world.setDynamicProperty(`shitrooms:cells_${chunk}`, data.slice(i, i + CHUNK));
      chunk++;
    }
    world.setDynamicProperty("shitrooms:cells_n", chunk);

    // Floor 1
    const parts1 = [];
    for (const [k] of placedCells1) {
      const suffix = (placedRooms1.get(k) ?? "").replace("shitrooms:", "");
      parts1.push(k + "~" + suffix);
    }
    const data1 = parts1.join("|");
    let chunk1 = 0;
    for (let i = 0; i < data1.length; i += CHUNK) {
      world.setDynamicProperty(`shitrooms:cells1_${chunk1}`, data1.slice(i, i + CHUNK));
      chunk1++;
    }
    world.setDynamicProperty("shitrooms:cells1_n", chunk1);
  } catch {}
}

export function restoreState() {
  const ox = world.getDynamicProperty("shitrooms:ox");
  const oy = world.getDynamicProperty("shitrooms:oy");
  const oz = world.getDynamicProperty("shitrooms:oz");
  if (typeof ox !== "number") return;
  originX = ox; originY = oy; originZ = oz;

  floor1Active = !!world.getDynamicProperty("shitrooms:floor1_active");
  exitPlaced   = !!world.getDynamicProperty("shitrooms:exit_placed");
  exitGx       = world.getDynamicProperty("shitrooms:exit_gx") ?? 0;
  exitGz       = world.getDynamicProperty("shitrooms:exit_gz") ?? 0;
  exitWX       = world.getDynamicProperty("shitrooms:exit_wx") ?? 0;
  exitWZ       = world.getDynamicProperty("shitrooms:exit_wz") ?? 0;
  // Old saves don't have exitWX/WZ — reconstruct from grid coords
  if (exitPlaced && exitWX === 0 && exitWZ === 0) {
    exitWX = originX + exitGx * CELL_SIZE;
    exitWZ = originZ + exitGz * CELL_SIZE;
  }

  // Floor 0
  const n = world.getDynamicProperty("shitrooms:cells_n");
  if (typeof n === "number" && n > 0) {
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

  // Floor 1
  const n1 = world.getDynamicProperty("shitrooms:cells1_n");
  if (typeof n1 === "number" && n1 > 0) {
    let data1 = "";
    for (let i = 0; i < n1; i++) data1 += world.getDynamicProperty(`shitrooms:cells1_${i}`) ?? "";
    for (const entry of data1.split("|")) {
      if (!entry) continue;
      const tilde = entry.indexOf("~");
      if (tilde === -1) continue;
      const k = entry.slice(0, tilde);
      const suffix = entry.slice(tilde + 1);
      placedCells1.set(k, new Set());
      if (suffix) placedRooms1.set(k, "shitrooms:" + suffix);
    }
  }
}

// ─── Room picking ─────────────────────────────────────────────────────────────
function pickRoom(exits, roomList, neighborIds = []) {
  const need  = new Set(exits);
  const valid = roomList.filter(r => [...need].every(e => new Set(r.exits).has(e)));
  if (valid.length === 0) return roomList[roomList.length - 1];
  const total = valid.reduce((s, r) => {
    return s + (r.weight ?? 1) * (neighborIds.includes(r.id) ? (r.clusterBonus ?? 1) : 1);
  }, 0);
  let rand = Math.random() * total;
  for (const room of valid) {
    rand -= (room.weight ?? 1) * (neighborIds.includes(room.id) ? (room.clusterBonus ?? 1) : 1);
    if (rand <= 0) return room;
  }
  return valid[valid.length - 1];
}

// ─── Room placement ───────────────────────────────────────────────────────────
// floor 0: wy = originY, unlit based on distance from originX/Z (500 blocks)
// floor 1: wy = originY + CELL_SIZE, unlit based on distance from exit cell (300 blocks)
function placeRoom(dim, room, wx, wz, floor) {
  const wy      = floor === 0 ? originY : originY + CELL_SIZE;
  const noUnlit = floor === 0 ? NO_UNLIT : NO_UNLIT_1;

  try {
    dim.runCommand(`fill ${wx} ${wy} ${wz} ${wx + CELL_SIZE - 1} ${wy + CELL_SIZE - 1} ${wz + CELL_SIZE - 1} air`);
  } catch {}

  let unlitChance;
  if (floor === 0) {
    const dist = Math.sqrt((wx - originX) ** 2 + (wz - originZ) ** 2);
    unlitChance = Math.min(dist / 500, 1.0);
  } else {
    const entryWX = originX + exitGx * CELL_SIZE;
    const entryWZ = originZ + exitGz * CELL_SIZE;
    const dist = Math.sqrt((wx - entryWX) ** 2 + (wz - entryWZ) ** 2);
    unlitChance = Math.min(dist / UNLIT_DIST_1, 1.0);
  }

  const useUnlit = Math.random() < unlitChance && !noUnlit.has(room.id);
  const id = useUnlit ? room.id + "_unlit" : room.id;
  try { dim.runCommand(`structure load ${id} ${wx} ${wy} ${wz}`); } catch {}
  const ex = wx + CELL_SIZE - 1, ey = wy + CELL_SIZE - 1, ez = wz + CELL_SIZE - 1;
  for (const liq of ["minecraft:water", "minecraft:lava", "minecraft:flowing_water", "minecraft:flowing_lava"]) {
    try { dim.runCommand(`fill ${wx} ${wy} ${wz} ${ex} ${ey} ${ez} air replace ${liq}`); } catch {}
  }
}

function sealRoof(dim, wx, wz, floor) {
  if (floor === 0) return; // bedrock only above floor 1, not floor 0
  const ry = originY + ROOF_Y_OFFSET1;
  try {
    dim.runCommand(`fill ${wx} ${ry} ${wz} ${wx + CELL_SIZE - 1} ${ry} ${wz + CELL_SIZE - 1} bedrock`);
  } catch {}
}

// ─── Maze carver ──────────────────────────────────────────────────────────────
// cells = placedCells (floor 0) or placedCells1 (floor 1)
function carveMaze(startGx, startGz, maxNew, cells) {
  const newCells = new Map();
  const stack = [{ gx: startGx, gz: startGz }];
  if (!cells.has(cellKey(startGx, startGz))) {
    newCells.set(cellKey(startGx, startGz), new Set());
  }

  while (stack.length > 0 && newCells.size < maxNew) {
    const { gx, gz } = stack[stack.length - 1];
    const unvisited = DIRS.filter(d =>
      !newCells.has(cellKey(gx + d.dx, gz + d.dz)) &&
      !cells.has(cellKey(gx + d.dx, gz + d.dz))
    );
    if (unvisited.length === 0) { stack.pop(); continue; }

    const dir = unvisited[Math.floor(Math.random() * unvisited.length)];
    const nx = gx + dir.dx, nz = gz + dir.dz;
    const curKey = cellKey(gx, gz);
    if (newCells.has(curKey))  newCells.get(curKey).add(dir.face);
    else if (cells.has(curKey)) cells.get(curKey).add(dir.face);
    newCells.set(cellKey(nx, nz), new Set([dir.opp]));
    stack.push({ gx: nx, gz: nz });
  }
  return newCells;
}

// ─── Cell commit ─────────────────────────────────────────────────────────────
function commitCells(newCells, dim, floor) {
  const cells    = floor === 0 ? placedCells  : placedCells1;
  const roomsMap = floor === 0 ? placedRooms  : placedRooms1;
  const roomList = floor === 0 ? ROOMS        : ROOMS_1;

  for (const [key, exits] of newCells) {
    const [gx, gz] = key.split(",").map(Number);
    const wx = originX + gx * CELL_SIZE;
    const wz = originZ + gz * CELL_SIZE;
    try {
      // Inject exit room on floor 0 when distance threshold is met (once only)
      if (floor === 0 && !exitPlaced) {
        const dist = Math.sqrt((wx - originX) ** 2 + (wz - originZ) ** 2);
        if (dist >= EXIT_DIST_MIN) {
          const wy = originY;
          dim.runCommand(`fill ${wx} ${wy} ${wz} ${wx + CELL_SIZE - 1} ${wy + CELL_SIZE - 1} ${wz + CELL_SIZE - 1} air`);
          dim.runCommand(`structure load shitrooms:exit ${wx} ${wy} ${wz}`);
          sealRoof(dim, wx, wz, 0);
          cells.set(key, exits);
          roomsMap.set(key, "shitrooms:exit");
          exitGx = gx; exitGz = gz; exitWX = wx; exitWZ = wz; exitPlaced = true;
          _buildFloor1(dim); // generate floor 1 immediately
          continue;
        }
      }

      const neighborIds = DIRS
        .map(d => roomsMap.get(cellKey(gx + d.dx, gz + d.dz)))
        .filter(Boolean);
      const room = pickRoom([...exits], roomList, neighborIds);
      placeRoom(dim, room, wx, wz, floor);
      sealRoof(dim, wx, wz, floor);
      cells.set(key, exits);
      roomsMap.set(key, room.id);
    } catch {}
  }
  saveState();
}

// ─── Floor 1 initialisation ───────────────────────────────────────────────────

// Called as soon as the exit room is placed — generates all floor 1 start rooms
// so they exist before the player ever climbs up.
function _buildFloor1(dim) {
  if (floor1Active) return;
  floor1Active = true;

  const entryWX = originX + exitGx * CELL_SIZE;
  const entryWZ = originZ + exitGz * CELL_SIZE;
  const entryWY = originY + CELL_SIZE;

  // 3×3 open area centred on the entry cell
  for (let dgx = -1; dgx <= 1; dgx++) {
    for (let dgz = -1; dgz <= 1; dgz++) {
      const gx = exitGx + dgx, gz = exitGz + dgz;
      const wx = originX + gx * CELL_SIZE;
      const wz = originZ + gz * CELL_SIZE;
      placeRoom(dim, OPEN_ROOM_1, wx, wz, 1);
      sealRoof(dim, wx, wz, 1);
      placedCells1.set(cellKey(gx, gz), new Set(["north", "south", "east", "west"]));
      placedRooms1.set(cellKey(gx, gz), OPEN_ROOM_1.id);
    }
  }

  // Overwrite the entry cell with 1_enter
  try {
    dim.runCommand(`fill ${entryWX} ${entryWY} ${entryWZ} ${entryWX + CELL_SIZE - 1} ${entryWY + CELL_SIZE - 1} ${entryWZ + CELL_SIZE - 1} air`);
    dim.runCommand(`structure load shitrooms:1_enter ${entryWX} ${entryWY} ${entryWZ}`);
  } catch {}
  placedRooms1.set(cellKey(exitGx, exitGz), "shitrooms:1_enter");

  // Initial carve outward from 4 corners
  for (const [dgx, dgz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const nc = carveMaze(exitGx + dgx, exitGz + dgz, Math.ceil(INITIAL_ROOMS / 4), placedCells1);
    if (nc.size > 0) commitCells(nc, dim, 1);
  }

  saveState();
}

// Called when a player first reaches floor 1 — sets their spawn to the entry point.
export function onPlayerReachFloor1(player, dim) {
  if (!floor1Active || !exitPlaced) return;
  const entryWX = originX + exitGx * CELL_SIZE;
  const entryWZ = originZ + exitGz * CELL_SIZE;
  try {
    player.setSpawnPoint({
      x: Math.floor(entryWX + 2),
      y: originY + CELL_SIZE + 1,
      z: Math.floor(entryWZ + 2),
      dimension: dim
    });
  } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function generateInitial(player) {
  const loc = player.location;
  originX = Math.floor(loc.x) - 2;
  originY = SHITROOMS_Y;
  originZ = Math.floor(loc.z) - 2;

  const dim = world.getDimension("overworld");

  for (let gx = -1; gx <= 1; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      const wx = originX + gx * CELL_SIZE;
      const wz = originZ + gz * CELL_SIZE;
      placeRoom(dim, OPEN_ROOM, wx, wz, 0);
      sealRoof(dim, wx, wz, 0);
      placedCells.set(cellKey(gx, gz), new Set(["north", "south", "east", "west"]));
      placedRooms.set(cellKey(gx, gz), OPEN_ROOM.id);
    }
  }

  for (const [sgx, sgz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const nc = carveMaze(sgx, sgz, Math.ceil(INITIAL_ROOMS / 4), placedCells);
    if (nc.size > 0) commitCells(nc, dim, 0);
  }
}

// ─── Nextbot spawner ──────────────────────────────────────────────────────────
export function startSpawnLoop() {
  const NO_SPAWN_0 = new Set(["shitrooms:corridors", "shitrooms:cross", "shitrooms:x", "shitrooms:exit"]);
  const NO_SPAWN_1 = new Set(["shitrooms:1_corridors", "shitrooms:1_hall_EW", "shitrooms:1_hall_NS", "shitrooms:1_enter"]);

  system.runTimeout(() => {
    system.runInterval(() => {
      if (placedCells.size === 0) return;

      const shitroomsPlayers = world.getPlayers().filter(p => isInShitrooms(p));
      if (shitroomsPlayers.length === 0) return;

      const dim = world.getDimension("overworld");

      const floor0Players = shitroomsPlayers.filter(p => playerFloorOf(p) === 0);
      const floor1Players = (floor1Active && exitPlaced) ? shitroomsPlayers.filter(p => playerFloorOf(p) === 1) : [];

      for (let i = 0; i < 2; i++) {
        // Pick a floor to spawn on weighted by player count
        let floor, players, cells, roomsMap, noSpawn, spawnY;
        if (floor1Players.length > 0 && (floor0Players.length === 0 || Math.random() < 0.5)) {
          floor = 1; players = floor1Players; cells = placedCells1; roomsMap = placedRooms1;
          noSpawn = NO_SPAWN_1; spawnY = originY + CELL_SIZE + 1;
        } else {
          if (floor0Players.length === 0) continue;
          floor = 0; players = floor0Players; cells = placedCells; roomsMap = placedRooms;
          noSpawn = NO_SPAWN_0; spawnY = originY + 1;
        }

        const validKeys = [...cells.keys()].filter(k => {
          if (noSpawn.has(roomsMap.get(k))) return false;
          const [gx, gz] = k.split(",").map(Number);
          return players.every(p => {
            const pgx = Math.round((p.location.x - originX) / CELL_SIZE);
            const pgz = Math.round((p.location.z - originZ) / CELL_SIZE);
            const dist = Math.abs(gx - pgx) + Math.abs(gz - pgz);
            return dist >= SPAWN_MIN_DIST && dist <= SPAWN_MAX_DIST;
          });
        });
        if (validKeys.length === 0) continue;

        const type = NEXTBOT_TYPES[Math.floor(Math.random() * NEXTBOT_TYPES.length)];
        if (dim.getEntities({ type }).length >= MAX_PER_TYPE) continue;
        const key = validKeys[Math.floor(Math.random() * validKeys.length)];
        const [gx, gz] = key.split(",").map(Number);
        const wx = originX + gx * CELL_SIZE + 2;
        const wz = originZ + gz * CELL_SIZE + 2;
        try {
          const entity = dim.spawnEntity(type, { x: wx, y: spawnY, z: wz });
          system.runTimeout(() => { try { entity.kill(); } catch {} }, 3600);
        } catch {}
      }
    }, SPAWN_INTERVAL);
  }, SPAWN_DELAY);
}

// ─── Exploration loop ─────────────────────────────────────────────────────────
export function startExplorationLoop() {
  system.runInterval(() => {
    if (placedCells.size === 0) return;

    const shitroomsPlayers = world.getPlayers().filter(p => isInShitrooms(p));
    if (shitroomsPlayers.length === 0) return;

    const dim = world.getDimension("overworld");

    for (const player of shitroomsPlayers) {
      const floor = playerFloorOf(player);
      const cells = floor === 0 ? placedCells : placedCells1;

      if (floor === 1 && (!floor1Active || !exitPlaced)) continue;

      const loc = player.location;
      const pgx = Math.floor((loc.x - originX) / CELL_SIZE);
      const pgz = Math.floor((loc.z - originZ) / CELL_SIZE);

      const seeds = [];
      for (let dgx = -EXPLORE_AHEAD; dgx <= EXPLORE_AHEAD; dgx++) {
        for (let dgz = -EXPLORE_AHEAD; dgz <= EXPLORE_AHEAD; dgz++) {
          const gx = pgx + dgx, gz = pgz + dgz;
          if (!cells.has(cellKey(gx, gz))) continue;
          for (const dir of DIRS) {
            if (!cells.has(cellKey(gx + dir.dx, gz + dir.dz))) {
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
        const nc = carveMaze(gx, gz, remaining, cells);
        if (nc.size === 0) continue;
        commitCells(nc, dim, floor);
        remaining -= nc.size;
      }
    }
  }, CHECK_INTERVAL);
}
