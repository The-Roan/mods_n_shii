export const CELL_SIZE = 5;

export const ROOMS = [
  { id: "shitrooms:east_wall",  exits: ["north", "south", "west"],         weight: 1 },
  { id: "shitrooms:west_wall",  exits: ["north", "south", "east"],         weight: 1 },
  { id: "shitrooms:north_wall", exits: ["south", "east", "west"],          weight: 1 },
  { id: "shitrooms:south_wall", exits: ["north", "east", "west"],          weight: 1 },
  { id: "shitrooms:open",       exits: ["north", "south", "east", "west"], weight: 3   },
  { id: "shitrooms:corridors",  exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 2   },
  { id: "shitrooms:cross",      exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 1.5 },
  { id: "shitrooms:x",          exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 1.5 },
  { id: "shitrooms:pickaxe",    exits: ["north", "south", "east", "west"], weight: 0.05 },
  { id: "shitrooms:flashlight", exits: ["north", "south", "east", "west"], weight: 0.01 },
];

export const ROOMS_1 = [
  { id: "shitrooms:1_east_wall",  exits: ["north", "south", "west"],         weight: 1 },
  { id: "shitrooms:1_west_wall",  exits: ["north", "south", "east"],         weight: 1 },
  { id: "shitrooms:1_north_wall", exits: ["south", "east", "west"],          weight: 1 },
  { id: "shitrooms:1_south_wall", exits: ["north", "east", "west"],          weight: 1 },
  { id: "shitrooms:1_open",       exits: ["north", "south", "east", "west"], weight: 3   },
  { id: "shitrooms:1_corridors",  exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 2   },
  { id: "shitrooms:1_hall_EW",    exits: ["east",  "west"],                  weight: 1,   clusterBonus: 2   },
  { id: "shitrooms:1_hall_NS",    exits: ["north", "south"],                 weight: 1,   clusterBonus: 2   },
  { id: "shitrooms:1_cage",       exits: ["north", "south", "east", "west"], weight: 2   },
  { id: "shitrooms:1_tangle",     exits: ["north", "south", "east", "west"], weight: 1.5 },
  { id: "shitrooms:1_tangle2",    exits: ["north", "south", "east", "west"], weight: 1.5 },
  { id: "shitrooms:1_flashlight", exits: ["north", "south", "east", "west"], weight: 0.015 },
];

export const START_ROOM  = { id: "shitrooms:shitstart", exits: ["north", "south", "east", "west"] };
export const OPEN_ROOM   = { id: "shitrooms:open",      exits: ["north", "south", "east", "west"] };
export const OPEN_ROOM_1 = { id: "shitrooms:1_open",    exits: ["north", "south", "east", "west"] };
