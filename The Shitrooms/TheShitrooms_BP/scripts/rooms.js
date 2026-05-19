export const CELL_SIZE = 5; // all rooms are 5x5x5

// clusterBonus: weight multiplier applied when a neighbour already uses this room type.
// Higher = larger clusters (corridors chains long; cross/x cluster in small pockets).
export const ROOMS = [
  { id: "shitrooms:east_wall",  exits: ["north", "south", "west"],         weight: 1 },
  { id: "shitrooms:west_wall",  exits: ["north", "south", "east"],         weight: 1 },
  { id: "shitrooms:north_wall", exits: ["south", "east", "west"],          weight: 1 },
  { id: "shitrooms:south_wall", exits: ["north", "east", "west"],          weight: 1 },
  { id: "shitrooms:open",       exits: ["north", "south", "east", "west"], weight: 3   },
  { id: "shitrooms:corridors",  exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 2   },
  { id: "shitrooms:cross",      exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 1.5 },
  { id: "shitrooms:x",         exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 1.5 },
  { id: "shitrooms:pickaxe",   exits: ["north", "south", "east", "west"], weight: 0.05 },
];

export const START_ROOM = { id: "shitrooms:shitstart", exits: ["north", "south", "east", "west"] };
export const OPEN_ROOM  = { id: "shitrooms:open",      exits: ["north", "south", "east", "west"] };
