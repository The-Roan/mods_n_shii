export const CELL_SIZE = 5;

export const ROOMS = [
  { id: "shitrooms0:east_wall",  exits: ["north", "south", "west"],         weight: 1 },
  { id: "shitrooms0:west_wall",  exits: ["north", "south", "east"],         weight: 1 },
  { id: "shitrooms0:north_wall", exits: ["south", "east", "west"],          weight: 1 },
  { id: "shitrooms0:south_wall", exits: ["north", "east", "west"],          weight: 1 },
  { id: "shitrooms0:open",       exits: ["north", "south", "east", "west"], weight: 3   },
  { id: "shitrooms0:corridors",  exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 2   },
  { id: "shitrooms0:cross",      exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 1.5 },
  { id: "shitrooms0:x",          exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 1.5 },
  { id: "shitrooms0:pickaxe",    exits: ["north", "south", "east", "west"], weight: 0.05 },
  { id: "shitrooms0:flashlight", exits: ["north", "south", "east", "west"], weight: 0.01 },
];

export const ROOMS_1 = [
  { id: "shitrooms1:east_wall",  exits: ["north", "south", "west"],         weight: 1 },
  { id: "shitrooms1:west_wall",  exits: ["north", "south", "east"],         weight: 1 },
  { id: "shitrooms1:north_wall", exits: ["south", "east", "west"],          weight: 1 },
  { id: "shitrooms1:south_wall", exits: ["north", "east", "west"],          weight: 1 },
  { id: "shitrooms1:open",       exits: ["north", "south", "east", "west"], weight: 3   },
  { id: "shitrooms1:corridors",  exits: ["north", "south", "east", "west"], weight: 1,   clusterBonus: 2   },
  { id: "shitrooms1:hall_EW",    exits: ["east",  "west"],                  weight: 1,   clusterBonus: 2   },
  { id: "shitrooms1:hall_NS",    exits: ["north", "south"],                 weight: 1,   clusterBonus: 2   },
  { id: "shitrooms1:cage",       exits: ["north", "south", "east", "west"], weight: 2   },
  { id: "shitrooms1:tangle",     exits: ["north", "south", "east", "west"], weight: 1.5 },
  { id: "shitrooms1:tangle2",    exits: ["north", "south", "east", "west"], weight: 1.5 },
  { id: "shitrooms1:flashlight", exits: ["north", "south", "east", "west"], weight: 0.015 },
];

export const START_ROOM  = { id: "shitrooms0:shitstart", exits: ["north", "south", "east", "west"] };
export const OPEN_ROOM   = { id: "shitrooms0:open",      exits: ["north", "south", "east", "west"] };
export const OPEN_ROOM_1 = { id: "shitrooms1:open",    exits: ["north", "south", "east", "west"] };
export const OPEN_ROOM_2 = { id: "shitrooms2:open",      exits: ["north", "south", "east", "west"] };

export const ROOMS_2 = [
  { id: "shitrooms2:east_wall",  exits: ["north", "south", "west"],         weight: 20 },
  { id: "shitrooms2:west_wall",  exits: ["north", "south", "east"],         weight: 20 },
  { id: "shitrooms2:north_wall", exits: ["south", "east", "west"],          weight: 20 },
  { id: "shitrooms2:south_wall", exits: ["north", "east", "west"],          weight: 20 },
  { id: "shitrooms2:open",       exits: ["north", "south", "east", "west"], weight: 1  },
  { id: "shitrooms2:flashlight", exits: ["north", "south", "east", "west"], weight: 0.015 },
];
