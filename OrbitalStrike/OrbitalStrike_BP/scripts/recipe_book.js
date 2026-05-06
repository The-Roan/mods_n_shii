import { world } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";

const BOOK_ID = "orbital:recipe_book";

// ─── Recipe data ──────────────────────────────────────────────────────────────
const RECIPES = [
  {
    name:        "Orbital Strike Beacon",
    color:       "§c",
    icon:        "textures/items/orbital_strike_beacon",
    pageIcon:    "textures/items/recipe_page_orbital",
    pattern:     ["E  E  E", "N  B  N", "E  E  E"],
    key: [
      "§7E §f= End Crystal",
      "§7N §f= Nether Star",
      "§7B §f= Vanilla Beacon"
    ],
    description: "§7Precision orbital strike.\nDestroys a §c5-block radius §7after a §e2s §7delay."
  },
  {
    name:        "D/DX Strike Beacon",
    color:       "§e",
    icon:        "textures/items/ddx_beacon",
    pageIcon:    "textures/items/recipe_page_ddx",
    pattern:     ["G  G  G", "G  S  G", "G  G  G"],
    key: [
      "§7G §f= Gold Ingot",
      "§7S §f= Orbital Strike Beacon"
    ],
    description: "§7Orbital strike with an accompanying song.\nDestroys a §e5-block radius §7after a §e2s §7delay."
  },
  {
    name:        "Instant Strike Beacon",
    color:       "§6",
    icon:        "textures/items/instant_beacon",
    pageIcon:    "textures/items/recipe_page_instant",
    pattern:     ["R  C  R", "R  S  R", "R  R  R"],
    key: [
      "§7R §f= Redstone",
      "§7C §f= Clock",
      "§7S §f= Orbital Strike Beacon"
    ],
    description: "§7Orbital strike with §cno delay.\nDestroys a §65-block radius §7immediately."
  },
  {
    name:        "Big Strike Beacon",
    color:       "§4",
    icon:        "textures/items/big_beacon",
    pageIcon:    "textures/items/recipe_page_big",
    pattern:     ["E  E  E", "A  S  A", "E  E  E"],
    key: [
      "§7E §f= End Crystal",
      "§7A §f= Amethyst Shard",
      "§7S §f= Orbital Strike Beacon"
    ],
    description: "§7Larger orbital strike.\nDestroys a §410-block radius §7after a §e2s §7delay."
  },
  {
    name:        "Throwable Strike Beacon",
    color:       "§9",
    icon:        "textures/items/throwable_beacon",
    pageIcon:    "textures/items/recipe_page_throwable",
    pattern:     ["A  B  A", "S  O  S", "C  P  C"],
    key: [
      "§7A §f= Arrow",
      "§7B §f= Bow",
      "§7S §f= Snowball",
      "§7O §f= Orbital Strike Beacon",
      "§7C §f= End Crystal",
      "§7P §f= Ender Pearl"
    ],
    description: "§7Throwable beacon that detonates on impact.\nDestroys a §95-block radius §7on contact."
  },
  {
    name:        "Laser Strike Beacon",
    color:       "§b",
    icon:        "textures/items/laser_beacon",
    pageIcon:    "textures/items/recipe_page_laser",
    pattern:     ["B  C  B", "B  O  B", "B  C  B"],
    key: [
      "§7B §f= Bow",
      "§7C §f= Crossbow",
      "§7O §f= Orbital Strike Beacon"
    ],
    description: "§7Fires a laser beam along your line of sight.\nDestroys a §b2-wide path §7through blocks."
  },
  {
    name:        "Void Strike Beacon",
    color:       "§5",
    icon:        "textures/items/void_beacon",
    pageIcon:    "textures/items/recipe_page_void",
    pattern:     ["E  E  E", "B  O  B", "C  R  N"],
    key: [
      "§7E §f= Ender Pearl",
      "§7B §f= Bedrock",
      "§7O §f= Orbital Strike Beacon",
      "§7C §f= Command Block",
      "§7R §f= Repeating Command Block",
      "§7N §f= Chain Command Block"
    ],
    description: "§7Total annihilation strike.\nDestroys §4everything §7in a 5-block radius,\nincluding §4bedrock §7and protected blocks."
  },
  {
    name:        "Heal Strike Beacon",
    color:       "§a",
    icon:        "textures/items/heal_beacon",
    pageIcon:    "textures/items/recipe_page_heal",
    pattern:     ["T  S  T", "T  O  T", "T  D  T"],
    key: [
      "§7T §f= Totem of Undying",
      "§7S §f= Shield",
      "§7O §f= Orbital Strike Beacon",
      "§7D §f= Conduit"
    ],
    description: "§7Healing strike for allies in a 5-block radius.\nApplies §aInstant Health IX§7, §aRegeneration§7,\n§aResistance §7and §aAbsorption§7."
  }
];

// ─── Open book on use ─────────────────────────────────────────────────────────
world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== BOOK_ID) return;
  showMainMenu(ev.source);
});

// ─── Main menu ────────────────────────────────────────────────────────────────
function showMainMenu(player) {
  const form = new ActionFormData()
    .title("§6§lStrike Recipe Book")
    .body("§7Select a strike to view its crafting recipe.");

  for (const r of RECIPES) {
    form.button(`${r.color}§l${r.name}`, r.pageIcon);
  }

  form.show(player).then(result => {
    if (result.canceled || result.selection === undefined) return;
    showRecipePage(player, RECIPES[result.selection]);
  }).catch(() => {});
}

// ─── Recipe detail page ───────────────────────────────────────────────────────
function showRecipePage(player, recipe) {
  const body = [
    "§8▬▬▬ Crafting Recipe ▬▬▬",
    "",
    ...recipe.pattern.map(row => `  §f${row}`),
    "",
    "§8Key:",
    ...recipe.key,
    "",
    "§8▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
    "",
    recipe.description
  ].join("\n");

  new MessageFormData()
    .title(`${recipe.color}§l${recipe.name}`)
    .body(body)
    .button1("§7◀ Back")
    .button2("§cClose")
    .show(player)
    .then(result => {
      if (result.canceled) return;
      if (result.selection === 0) showMainMenu(player);
    })
    .catch(() => {});
}

// ─── Despawn book when dropped ────────────────────────────────────────────────
world.afterEvents.entitySpawn.subscribe(ev => {
  if (ev.entity.typeId !== "minecraft:item") return;
  try {
    const comp = ev.entity.getComponent("minecraft:item");
    if (comp?.itemStack?.typeId === BOOK_ID) {
      ev.entity.remove();
    }
  } catch { /* ignore */ }
});
