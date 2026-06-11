import { world, system } from "@minecraft/server";
import { ROOMS, ROOMS_1, ROOMS_2, OPEN_ROOM, OPEN_ROOM_1, OPEN_ROOM_2, CELL_SIZE } from "./rooms.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const INITIAL_ROOMS  = 50;
const EXPLORE_ROOMS  = 80;
const EXPLORE_AHEAD  = 10;
const CHECK_INTERVAL = 10;

const SHITROOMS_Y    = -64;
const ROOF_Y_OFFSET  = CELL_SIZE;      // bedrock above floor 0: originY + 5
const ROOF_Y_OFFSET1 = CELL_SIZE * 2;  // bedrock above floor 1: originY + 10
const ROOF_Y_OFFSET2 = CELL_SIZE * 3;  // bedrock above floor 2: originY + 15
const EXIT_DIST_MIN  = 650;            // world-block distance at which exit room spawns
const EXIT1_DIST_MIN = 500;            // floor 1 exit spawns 500 blocks from floor 1 entry
const EXIT2_DIST_MIN = 650;            // floor 2 exit spawns 650 blocks from floor 2 entry
const UNLIT_DIST_1   = 300;            // floor 1 goes dark 300 blocks from entry
const UNLIT_DIST_2   = 300;            // floor 2 goes dark 300 blocks from entry

const NEXTBOT_TYPES = [
  { id: "shitrooms:nextbot",  minLevel: 0 },
  { id: "shitrooms:nextbot2", minLevel: 0 },
  { id: "shitrooms:nextbot3", minLevel: 0 },
  { id: "shitrooms:nextbot4", minLevel: 0 },
  { id: "shitrooms:nextbot5", minLevel: 0 },
  { id: "shitrooms:nextbot6", minLevel: 0 },
];
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
const NO_UNLIT   = new Set(["shitrooms0:pickaxe", "shitrooms0:flashlight", "shitrooms0:exit"]);
const NO_UNLIT_1 = new Set(["shitrooms1:1_flashlight", "shitrooms1:1_exit"]);
const NO_UNLIT_2 = new Set(["shitrooms2:enter", "shitrooms2:exit", "shitrooms2:flashlight"]);

// ─── State ────────────────────────────────────────────────────────────────────
const placedCells  = new Map();
const placedRooms  = new Map();
const placedCells1 = new Map();
const placedRooms1 = new Map();
const placedCells2 = new Map();
const placedRooms2 = new Map();

let originX = 0, originY = 0, originZ = 0;
let floor1Active = false;
let exitGx = 0, exitGz = 0;
let exitWX = 0, exitWZ = 0;
let exitPlaced = false;
let exitMusicSpawned = false;
let exit1Placed = false;
let exit1WX = 0, exit1WZ = 0;
let floor2Active = false;
let exit2EntryGx = 0, exit2EntryGz = 0; // grid coords of floor 2 entry (= floor 1 exit grid)
let exit2Placed = false;
let exit2WX = 0, exit2WZ = 0;

const playerFloorTracker = new Map();

function cellKey(gx, gz) { return `${gx},${gz}`; }

function isInShitrooms(player) {
  return !!world.getDynamicProperty(`shitrooms:in_shitrooms:${player.name}`);
}

export function playerFloorOf(player) {
  if (originY === 0 && originX === 0 && originZ === 0) return 0;
  const y = player.location.y;
  if (y >= originY + CELL_SIZE * 2 - 0.5) return 2;
  if (y >= originY + CELL_SIZE - 0.5) return 1;
  return 0;
}

export function getFloor1State() {
  return { floor1Active, exitGx, exitGz, exitWX, exitWZ, exitPlaced, exit1Placed, exit1WX, exit1WZ,
           floor2Active, exit2EntryGx, exit2EntryGz, exit2Placed, exit2WX, exit2WZ };
}

export function resetState() {
  placedCells.clear();  placedRooms.clear();
  placedCells1.clear(); placedRooms1.clear();
  placedCells2.clear(); placedRooms2.clear();
  originX = 0; originY = 0; originZ = 0;
  floor1Active = false; exitGx = 0; exitGz = 0; exitPlaced = false; exitMusicSpawned = false;
  exit1Placed = false; exit1WX = 0; exit1WZ = 0;
  floor2Active = false; exit2EntryGx = 0; exit2EntryGz = 0; exit2Placed = false; exit2WX = 0; exit2WZ = 0;
  playerFloorTracker.clear();
  try { world.setDynamicProperty("shitrooms:cells_n",        0);     } catch {}
  try { world.setDynamicProperty("shitrooms:cells1_n",       0);     } catch {}
  try { world.setDynamicProperty("shitrooms:cells2_n",       0);     } catch {}
  try { world.setDynamicProperty("shitrooms:floor1_active",  false); } catch {}
  try { world.setDynamicProperty("shitrooms:floor2_active",  false); } catch {}
  try { world.setDynamicProperty("shitrooms:exit_placed",    false); } catch {}
  try { world.setDynamicProperty("shitrooms:exit_gx",        0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit_gz",        0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit_wx",        0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit_wz",        0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit1_placed",   false); } catch {}
  try { world.setDynamicProperty("shitrooms:exit1_wx",       0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit1_wz",       0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit2_placed",   false); } catch {}
  try { world.setDynamicProperty("shitrooms:exit2_entry_gx", 0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit2_entry_gz", 0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit2_wx",       0);     } catch {}
  try { world.setDynamicProperty("shitrooms:exit2_wz",       0);     } catch {}
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
    world.setDynamicProperty("shitrooms:exit1_placed",   exit1Placed);
    world.setDynamicProperty("shitrooms:exit1_wx",       exit1WX);
    world.setDynamicProperty("shitrooms:exit1_wz",       exit1WZ);
    world.setDynamicProperty("shitrooms:floor2_active",  floor2Active);
    world.setDynamicProperty("shitrooms:exit2_placed",   exit2Placed);
    world.setDynamicProperty("shitrooms:exit2_entry_gx", exit2EntryGx);
    world.setDynamicProperty("shitrooms:exit2_entry_gz", exit2EntryGz);
    world.setDynamicProperty("shitrooms:exit2_wx",       exit2WX);
    world.setDynamicProperty("shitrooms:exit2_wz",       exit2WZ);

    const CHUNK = 30000;

    // Floor 0
    const parts = [];
    for (const [k] of placedCells) {
      const suffix = (placedRooms.get(k) ?? "").replace("shitrooms0:", "");
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
      const suffix = (placedRooms1.get(k) ?? "").replace("shitrooms1:", "");
      parts1.push(k + "~" + suffix);
    }
    const data1 = parts1.join("|");
    let chunk1 = 0;
    for (let i = 0; i < data1.length; i += CHUNK) {
      world.setDynamicProperty(`shitrooms:cells1_${chunk1}`, data1.slice(i, i + CHUNK));
      chunk1++;
    }
    world.setDynamicProperty("shitrooms:cells1_n", chunk1);

    // Floor 2
    const parts2 = [];
    for (const [k] of placedCells2) {
      const suffix = (placedRooms2.get(k) ?? "").replace("shitrooms2:", "");
      parts2.push(k + "~" + suffix);
    }
    const data2 = parts2.join("|");
    let chunk2 = 0;
    for (let i = 0; i < data2.length; i += CHUNK) {
      world.setDynamicProperty(`shitrooms:cells2_${chunk2}`, data2.slice(i, i + CHUNK));
      chunk2++;
    }
    world.setDynamicProperty("shitrooms:cells2_n", chunk2);
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
  exitWX       = world.getDynamicProperty("shitrooms:exit_wx")  ?? 0;
  exitWZ       = world.getDynamicProperty("shitrooms:exit_wz")  ?? 0;
  exit1Placed      = !!world.getDynamicProperty("shitrooms:exit1_placed");
  exit1WX          = world.getDynamicProperty("shitrooms:exit1_wx") ?? 0;
  exit1WZ          = world.getDynamicProperty("shitrooms:exit1_wz") ?? 0;
  floor2Active     = !!world.getDynamicProperty("shitrooms:floor2_active");
  exit2Placed      = !!world.getDynamicProperty("shitrooms:exit2_placed");
  exit2EntryGx     = world.getDynamicProperty("shitrooms:exit2_entry_gx") ?? 0;
  exit2EntryGz     = world.getDynamicProperty("shitrooms:exit2_entry_gz") ?? 0;
  exit2WX          = world.getDynamicProperty("shitrooms:exit2_wx") ?? 0;
  exit2WZ          = world.getDynamicProperty("shitrooms:exit2_wz") ?? 0;
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
      if (suffix) placedRooms.set(k, "shitrooms0:" + suffix);
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
      if (suffix) placedRooms1.set(k, "shitrooms1:" + suffix);
    }
  }

  // Floor 2
  const n2 = world.getDynamicProperty("shitrooms:cells2_n");
  if (typeof n2 === "number" && n2 > 0) {
    let data2 = "";
    for (let i = 0; i < n2; i++) data2 += world.getDynamicProperty(`shitrooms:cells2_${i}`) ?? "";
    for (const entry of data2.split("|")) {
      if (!entry) continue;
      const tilde = entry.indexOf("~");
      if (tilde === -1) continue;
      const k = entry.slice(0, tilde);
      const suffix = entry.slice(tilde + 1);
      placedCells2.set(k, new Set());
      if (suffix) placedRooms2.set(k, "shitrooms2:" + suffix);
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
function placeRoom(dim, room, wx, wz, floor) {
  const wy      = originY + floor * CELL_SIZE;
  const noUnlit = floor === 0 ? NO_UNLIT : floor === 1 ? NO_UNLIT_1 : NO_UNLIT_2;

  try {
    dim.runCommand(`fill ${wx} ${wy} ${wz} ${wx + CELL_SIZE - 1} ${wy + CELL_SIZE - 1} ${wz + CELL_SIZE - 1} air`);
  } catch {}

  let unlitChance;
  if (floor === 0) {
    const dist = Math.sqrt((wx - originX) ** 2 + (wz - originZ) ** 2);
    unlitChance = Math.min(dist / 500, 1.0);
  } else if (floor === 1) {
    const entryWX = originX + exitGx * CELL_SIZE;
    const entryWZ = originZ + exitGz * CELL_SIZE;
    const dist = Math.sqrt((wx - entryWX) ** 2 + (wz - entryWZ) ** 2);
    unlitChance = Math.min(dist / UNLIT_DIST_1, 1.0);
  } else {
    const entryWX = originX + exit2EntryGx * CELL_SIZE;
    const entryWZ = originZ + exit2EntryGz * CELL_SIZE;
    const dist = Math.sqrt((wx - entryWX) ** 2 + (wz - entryWZ) ** 2);
    unlitChance = Math.min(dist / UNLIT_DIST_2, 1.0);
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
  if (floor !== 2) return;
  const ry = originY + ROOF_Y_OFFSET2;
  try {
    dim.runCommand(`fill ${wx} ${ry} ${wz} ${wx + CELL_SIZE - 1} ${ry} ${wz + CELL_SIZE - 1} bedrock`);
  } catch {}
}

// ─── Maze carver ──────────────────────────────────────────────────────────────

// DFS carver for floors 0 and 1
function carveMaze(startGx, startGz, maxNew, cells, floor = 0) {
  const newCells = new Map();
  const stack = [{ gx: startGx, gz: startGz }];
  if (!cells.has(cellKey(startGx, startGz))) {
    newCells.set(cellKey(startGx, startGz), new Set());
  }
  while (stack.length > 0 && newCells.size < maxNew) {
    const { gx, gz } = stack[stack.length - 1];
    const ck = cellKey(gx, gz);
    const unvisited = DIRS.filter(d =>
      !newCells.has(cellKey(gx + d.dx, gz + d.dz)) &&
      !cells.has(cellKey(gx + d.dx, gz + d.dz))
    );
    if (unvisited.length === 0) { stack.pop(); continue; }
    const dir = unvisited[Math.floor(Math.random() * unvisited.length)];
    const nx = gx + dir.dx, nz = gz + dir.dz;
    if (newCells.has(ck))   newCells.get(ck).add(dir.face);
    else if (cells.has(ck)) cells.get(ck).add(dir.face);
    newCells.set(cellKey(nx, nz), new Set([dir.opp]));
    stack.push({ gx: nx, gz: nz });
  }
  return newCells;
}


// ─── Cell commit ─────────────────────────────────────────────────────────────
function commitCells(newCells, dim, floor) {
  const cells    = floor === 0 ? placedCells  : floor === 1 ? placedCells1  : placedCells2;
  const roomsMap = floor === 0 ? placedRooms  : floor === 1 ? placedRooms1  : placedRooms2;
  const roomList = floor === 0 ? ROOMS : floor === 1 ? ROOMS_1 : ROOMS_2;

  for (const [key, exits] of newCells) {
    const [gx, gz] = key.split(",").map(Number);
    const wx = originX + gx * CELL_SIZE;
    const wz = originZ + gz * CELL_SIZE;
    try {
      // Floor 0 exit injection
      if (floor === 0 && !exitPlaced) {
        const dist = Math.sqrt((wx - originX) ** 2 + (wz - originZ) ** 2);
        if (dist >= EXIT_DIST_MIN) {
          const wy = originY;
          dim.runCommand(`fill ${wx} ${wy} ${wz} ${wx + CELL_SIZE - 1} ${wy + CELL_SIZE - 1} ${wz + CELL_SIZE - 1} air`);
          dim.runCommand(`structure load shitrooms0:exit ${wx} ${wy} ${wz}`);
          sealRoof(dim, wx, wz, 0);
          cells.set(key, exits);
          roomsMap.set(key, "shitrooms0:exit");
          exitGx = gx; exitGz = gz; exitWX = wx; exitWZ = wz; exitPlaced = true;
          _buildFloor1(dim);
          continue;
        }
      }

      // Floor 1 exit injection
      if (floor === 1 && !exit1Placed) {
        const entryWX = originX + exitGx * CELL_SIZE;
        const entryWZ = originZ + exitGz * CELL_SIZE;
        const dist = Math.sqrt((wx - entryWX) ** 2 + (wz - entryWZ) ** 2);
        if (dist >= EXIT1_DIST_MIN) {
          const wy = originY + CELL_SIZE;
          dim.runCommand(`fill ${wx} ${wy} ${wz} ${wx + CELL_SIZE - 1} ${wy + CELL_SIZE - 1} ${wz + CELL_SIZE - 1} air`);
          dim.runCommand(`structure load shitrooms1:1_exit ${wx} ${wy} ${wz}`);
          sealRoof(dim, wx, wz, 1);
          cells.set(key, exits);
          roomsMap.set(key, "shitrooms1:1_exit");
          exit1Placed = true; exit1WX = wx; exit1WZ = wz;
          _buildFloor2(dim);
          continue;
        }
      }

      // Floor 2 exit injection
      if (floor === 2 && !exit2Placed) {
        const entryWX = originX + exit2EntryGx * CELL_SIZE;
        const entryWZ = originZ + exit2EntryGz * CELL_SIZE;
        const dist = Math.sqrt((wx - entryWX) ** 2 + (wz - entryWZ) ** 2);
        if (dist >= EXIT2_DIST_MIN) {
          const wy = originY + CELL_SIZE * 2;
          dim.runCommand(`fill ${wx} ${wy} ${wz} ${wx + CELL_SIZE - 1} ${wy + CELL_SIZE - 1} ${wz + CELL_SIZE - 1} air`);
          dim.runCommand(`structure load shitrooms2:exit ${wx} ${wy} ${wz}`);
          sealRoof(dim, wx, wz, 2);
          cells.set(key, exits);
          roomsMap.set(key, "shitrooms2:exit");
          exit2Placed = true; exit2WX = wx; exit2WZ = wz;
          continue;
        }
      }

      const neighborIds = DIRS.map(d => roomsMap.get(cellKey(gx + d.dx, gz + d.dz))).filter(Boolean);
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
    dim.runCommand(`structure load shitrooms1:1_enter ${entryWX} ${entryWY} ${entryWZ}`);
  } catch {}
  placedRooms1.set(cellKey(exitGx, exitGz), "shitrooms1:1_enter");

  // Initial carve outward from 4 corners
  for (const [dgx, dgz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const nc = carveMaze(exitGx + dgx, exitGz + dgz, Math.ceil(INITIAL_ROOMS / 4), placedCells1, 1);
    if (nc.size > 0) commitCells(nc, dim, 1);
  }

  saveState();
}

function _buildFloor2(dim) {
  if (floor2Active) return;
  floor2Active = true;

  exit2EntryGx = Math.round((exit1WX - originX) / CELL_SIZE);
  exit2EntryGz = Math.round((exit1WZ - originZ) / CELL_SIZE);
  const entryWX = originX + exit2EntryGx * CELL_SIZE;
  const entryWZ = originZ + exit2EntryGz * CELL_SIZE;
  const entryWY = originY + CELL_SIZE * 2;

  // 3×3 open area around entry
  for (let dgx = -1; dgx <= 1; dgx++) {
    for (let dgz = -1; dgz <= 1; dgz++) {
      const gx = exit2EntryGx + dgx, gz = exit2EntryGz + dgz;
      const wx = originX + gx * CELL_SIZE;
      const wz = originZ + gz * CELL_SIZE;
      placeRoom(dim, OPEN_ROOM_2, wx, wz, 2);
      sealRoof(dim, wx, wz, 2);
      placedCells2.set(cellKey(gx, gz), new Set(["north", "south", "east", "west"]));
      placedRooms2.set(cellKey(gx, gz), OPEN_ROOM_2.id);
    }
  }

  // Enter room at entry cell
  try {
    dim.runCommand(`fill ${entryWX} ${entryWY} ${entryWZ} ${entryWX + CELL_SIZE - 1} ${entryWY + CELL_SIZE - 1} ${entryWZ + CELL_SIZE - 1} air`);
    dim.runCommand(`structure load shitrooms2:enter ${entryWX} ${entryWY} ${entryWZ}`);
  } catch {}
  placedRooms2.set(cellKey(exit2EntryGx, exit2EntryGz), "shitrooms2:enter");

  // Initial carve outward from 4 corners
  for (const [dgx, dgz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const nc = carveMaze(exit2EntryGx + dgx, exit2EntryGz + dgz, Math.ceil(INITIAL_ROOMS / 4), placedCells2, 2);
    if (nc.size > 0) commitCells(nc, dim, 2);
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

export function onPlayerReachFloor2(player, dim) {
  if (!floor2Active || !exit1Placed) return;
  const entryWX = originX + exit2EntryGx * CELL_SIZE;
  const entryWZ = originZ + exit2EntryGz * CELL_SIZE;
  try {
    player.setSpawnPoint({
      x: Math.floor(entryWX + 2),
      y: originY + CELL_SIZE * 2 + 1,
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
    const nc = carveMaze(sgx, sgz, Math.ceil(INITIAL_ROOMS / 4), placedCells, 0);
    if (nc.size > 0) commitCells(nc, dim, 0);
  }
}

// ─── Nextbot spawner ──────────────────────────────────────────────────────────
export function startSpawnLoop() {
  const NO_SPAWN_0 = new Set(["shitrooms0:corridors", "shitrooms0:cross", "shitrooms0:x", "shitrooms0:exit"]);
  const NO_SPAWN_1 = new Set(["shitrooms1:1_corridors", "shitrooms1:1_hall_EW", "shitrooms1:1_hall_NS", "shitrooms1:1_enter", "shitrooms1:1_exit"]);
  const NO_SPAWN_2 = new Set(["shitrooms2:enter", "shitrooms2:exit", "shitrooms2:flashlight"]);

  system.runTimeout(() => {
    system.runInterval(() => {
      if (placedCells.size === 0) return;

      const shitroomsPlayers = world.getPlayers().filter(p => isInShitrooms(p));
      if (shitroomsPlayers.length === 0) return;

      const dim = world.getDimension("overworld");

      const floor0Players = shitroomsPlayers.filter(p => playerFloorOf(p) === 0);
      const floor1Players = (floor1Active && exitPlaced)  ? shitroomsPlayers.filter(p => playerFloorOf(p) === 1) : [];
      const floor2Players = (floor2Active && exit1Placed) ? shitroomsPlayers.filter(p => playerFloorOf(p) === 2) : [];

      for (let i = 0; i < 2; i++) {
        let floor, players, cells, roomsMap, noSpawn, spawnY;
        const r = Math.random();
        if (floor2Players.length > 0 && (floor0Players.length === 0 && floor1Players.length === 0 || r < 0.33)) {
          floor = 2; players = floor2Players; cells = placedCells2; roomsMap = placedRooms2;
          noSpawn = NO_SPAWN_2; spawnY = originY + CELL_SIZE * 2 + 1;
        } else if (floor1Players.length > 0 && (floor0Players.length === 0 || r < 0.5)) {
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

        const eligible = NEXTBOT_TYPES.filter(e => e.minLevel <= floor);
        if (eligible.length === 0) continue;
        const entry = eligible[Math.floor(Math.random() * eligible.length)];
        const type = entry.id;
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
      const cells = floor === 0 ? placedCells : floor === 1 ? placedCells1 : placedCells2;

      if (floor === 1 && (!floor1Active || !exitPlaced))  continue;
      if (floor === 2 && (!floor2Active || !exit1Placed)) continue;

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
        const nc = carveMaze(gx, gz, remaining, cells, floor);
        if (nc.size === 0) continue;
        commitCells(nc, dim, floor);
        remaining -= nc.size;
      }
    }
  }, CHECK_INTERVAL);
}
