import { world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const BOOK_ID = "orbital:recipe_book";

// ─── Recipe data ──────────────────────────────────────────────────────────────
const RECIPES = [
  {
    name:       "Orbital Strike Beacon",
    color:      "§c",
    pageIcon:   "textures/items/recipe_page_orbital",
    detailIcon: "textures/items/recipe_detail_orbital",
    pattern:    ["EEE", "NBN", "EEE"],
    key: {
      E: { label: "End Crystal",  id: "minecraft:end_crystal",  count: 1 },
      N: { label: "Nether Star",  id: "minecraft:nether_star",  count: 1 },
      B: { label: "Beacon",       id: "minecraft:beacon",       count: 1 }
    }
  },
  {
    name:       "D/DX Strike Beacon",
    color:      "§e",
    pageIcon:   "textures/items/recipe_page_ddx",
    detailIcon: "textures/items/recipe_detail_ddx",
    pattern:    ["GGG", "GSG", "GGG"],
    key: {
      G: { label: "Gold Ingot",             id: "minecraft:gold_ingot",  count: 1 },
      S: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon", count: 1 }
    }
  },
  {
    name:       "Instant Strike Beacon",
    color:      "§c",
    pageIcon:   "textures/items/recipe_page_instant",
    detailIcon: "textures/items/recipe_detail_instant",
    pattern:    ["RCR", "RSR", "RRR"],
    key: {
      R: { label: "Redstone",               id: "minecraft:redstone",    count: 1 },
      C: { label: "Clock",                  id: "minecraft:clock",       count: 1 },
      S: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon", count: 1 }
    }
  },
  {
    name:       "Big Strike Beacon",
    color:      "§5",
    pageIcon:   "textures/items/recipe_page_big",
    detailIcon: "textures/items/recipe_detail_big",
    pattern:    ["EEE", "ASA", "EEE"],
    key: {
      E: { label: "End Crystal",            id: "minecraft:end_crystal",    count: 1 },
      A: { label: "Amethyst Shard",         id: "minecraft:amethyst_shard", count: 1 },
      S: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon",    count: 1 }
    }
  },
  {
    name:       "Throwable Strike Beacon",
    color:      "§a",
    pageIcon:   "textures/items/recipe_page_throwable",
    detailIcon: "textures/items/recipe_detail_throwable",
    pattern:    ["RBR", "SOS", "CPC"],
    key: {
      R: { label: "Arrow",                  id: "minecraft:arrow",         count: 1 },
      B: { label: "Bow",                    id: "minecraft:bow",           count: 1 },
      S: { label: "Snowball",               id: "minecraft:snowball",      count: 1 },
      O: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon",   count: 1 },
      C: { label: "End Crystal",            id: "minecraft:end_crystal",   count: 1 },
      P: { label: "Ender Pearl",            id: "minecraft:ender_pearl",   count: 1 }
    }
  },
  {
    name:       "Laser Strike Beacon",
    color:      "§f",
    pageIcon:   "textures/items/recipe_page_laser",
    detailIcon: "textures/items/recipe_detail_laser",
    pattern:    ["BCB", "BOB", "BCB"],
    key: {
      B: { label: "Bow",                    id: "minecraft:bow",          count: 1 },
      C: { label: "Crossbow",               id: "minecraft:crossbow",     count: 1 },
      O: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon",  count: 1 }
    }
  },
  {
    name:       "Void Strike Beacon",
    color:      "§8",
    pageIcon:   "textures/items/recipe_page_void",
    detailIcon: "textures/items/recipe_detail_void",
    pattern:    ["EEE", "BOB", "CRN"],
    key: {
      E: { label: "Ender Pearl",              id: "minecraft:ender_pearl",             count: 1 },
      B: { label: "Bedrock",                  id: "minecraft:bedrock",                 count: 1 },
      O: { label: "Orbital Strike Beacon",    id: "orbital:strike_beacon",             count: 1 },
      C: { label: "Command Block",            id: "minecraft:command_block",           count: 1 },
      R: { label: "Repeating Cmd Block",      id: "minecraft:repeating_command_block", count: 1 },
      N: { label: "Chain Cmd Block",          id: "minecraft:chain_command_block",     count: 1 }
    }
  },
  {
    name:       "Heal Strike Beacon",
    color:      "§d",
    pageIcon:   "textures/items/recipe_page_heal",
    detailIcon: "textures/items/recipe_detail_heal",
    pattern:    ["TST", "TOT", "TDT"],
    key: {
      T: { label: "Totem of Undying",       id: "minecraft:totem_of_undying", count: 1 },
      S: { label: "Shield",                 id: "minecraft:shield",           count: 1 },
      O: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon",      count: 1 },
      D: { label: "Conduit",                id: "minecraft:conduit",          count: 1 }
    }
  }
];

// ─── Build crafting grid display ──────────────────────────────────────────────
function buildRecipeBody(recipe) {
  return recipe.pattern.map(row =>
    [row[0], row[1], row[2]]
      .map(letter => `§f[${recipe.key[letter].label}]`)
      .join("")
  ).join("\n");
}

// ─── Ingredients for the base orbital beacon (substituted when another recipe needs it) ──
const ORBITAL_BASE_INGREDIENTS = [
  { id: "minecraft:end_crystal", count: 6 },
  { id: "minecraft:nether_star", count: 2 },
  { id: "minecraft:beacon",      count: 1 }
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
    .body("§fSelect a strike to view its recipe.");

  for (const r of RECIPES) {
    form.button(`${r.color}§l${r.name}`, r.pageIcon);
  }

  form.show(player).then(result => {
    if (result.canceled || result.selection === undefined) return;
    showRecipePage(player, RECIPES[result.selection]);
  }).catch(() => {});
}

// ─── Recipe detail page ───────────────────────────────────────────────────────
// Button 0: detail icon + "Give Ingredients" — gives one of each ingredient
// Button 1: Back
function showRecipePage(player, recipe) {
  new ActionFormData()
    .title(`${recipe.color}§l${recipe.name}`)
    .body(buildRecipeBody(recipe))
    .button("§a§lGive Ingredients", recipe.detailIcon)
    .button("§f◀ Back")
    .show(player)
    .then(result => {
      if (result.canceled) return;
      if (result.selection === 0) {
        for (const item of Object.values(recipe.key)) {
          if (item.id === "orbital:strike_beacon") {
            for (const base of ORBITAL_BASE_INGREDIENTS) {
              try { player.runCommand(`give @s ${base.id} ${base.count}`); } catch { /* ignore */ }
            }
          } else {
            try { player.runCommand(`give @s ${item.id} 1`); } catch { /* ignore */ }
          }
        }
        showRecipePage(player, recipe);
      } else {
        showMainMenu(player);
      }
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
