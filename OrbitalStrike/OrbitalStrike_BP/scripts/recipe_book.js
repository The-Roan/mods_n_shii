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
    ingredients: [
      { label: "End Crystal  ×6",  id: "minecraft:end_crystal",  count: 6 },
      { label: "Nether Star  ×2",  id: "minecraft:nether_star",  count: 2 },
      { label: "Beacon  ×1",       id: "minecraft:beacon",       count: 1 }
    ]
  },
  {
    name:       "D/DX Strike Beacon",
    color:      "§e",
    pageIcon:   "textures/items/recipe_page_ddx",
    detailIcon: "textures/items/recipe_detail_ddx",
    ingredients: [
      { label: "Gold Ingot  ×8",            id: "minecraft:gold_ingot",   count: 8 },
      { label: "Orbital Strike Beacon  ×1", id: "orbital:strike_beacon",  count: 1 }
    ]
  },
  {
    name:       "Instant Strike Beacon",
    color:      "§6",
    pageIcon:   "textures/items/recipe_page_instant",
    detailIcon: "textures/items/recipe_detail_instant",
    ingredients: [
      { label: "Redstone  ×7",              id: "minecraft:redstone",     count: 7 },
      { label: "Clock  ×1",                 id: "minecraft:clock",        count: 1 },
      { label: "Orbital Strike Beacon  ×1", id: "orbital:strike_beacon",  count: 1 }
    ]
  },
  {
    name:       "Big Strike Beacon",
    color:      "§4",
    pageIcon:   "textures/items/recipe_page_big",
    detailIcon: "textures/items/recipe_detail_big",
    ingredients: [
      { label: "End Crystal  ×6",           id: "minecraft:end_crystal",    count: 6 },
      { label: "Amethyst Shard  ×2",        id: "minecraft:amethyst_shard", count: 2 },
      { label: "Orbital Strike Beacon  ×1", id: "orbital:strike_beacon",    count: 1 }
    ]
  },
  {
    name:       "Throwable Strike Beacon",
    color:      "§9",
    pageIcon:   "textures/items/recipe_page_throwable",
    detailIcon: "textures/items/recipe_detail_throwable",
    ingredients: [
      { label: "Arrow  ×2",                 id: "minecraft:arrow",         count: 2 },
      { label: "Bow  ×1",                   id: "minecraft:bow",           count: 1 },
      { label: "Snowball  ×2",              id: "minecraft:snowball",      count: 2 },
      { label: "End Crystal  ×2",           id: "minecraft:end_crystal",   count: 2 },
      { label: "Ender Pearl  ×1",           id: "minecraft:ender_pearl",   count: 1 },
      { label: "Orbital Strike Beacon  ×1", id: "orbital:strike_beacon",   count: 1 }
    ]
  },
  {
    name:       "Laser Strike Beacon",
    color:      "§b",
    pageIcon:   "textures/items/recipe_page_laser",
    detailIcon: "textures/items/recipe_detail_laser",
    ingredients: [
      { label: "Bow  ×6",                   id: "minecraft:bow",          count: 6 },
      { label: "Crossbow  ×2",              id: "minecraft:crossbow",     count: 2 },
      { label: "Orbital Strike Beacon  ×1", id: "orbital:strike_beacon",  count: 1 }
    ]
  },
  {
    name:       "Void Strike Beacon",
    color:      "§5",
    pageIcon:   "textures/items/recipe_page_void",
    detailIcon: "textures/items/recipe_detail_void",
    ingredients: [
      { label: "Ender Pearl  ×3",              id: "minecraft:ender_pearl",              count: 3 },
      { label: "Bedrock  ×2",                  id: "minecraft:bedrock",                  count: 2 },
      { label: "Command Block  ×1",            id: "minecraft:command_block",            count: 1 },
      { label: "Repeating Command Block  ×1",  id: "minecraft:repeating_command_block",  count: 1 },
      { label: "Chain Command Block  ×1",      id: "minecraft:chain_command_block",      count: 1 },
      { label: "Orbital Strike Beacon  ×1",    id: "orbital:strike_beacon",              count: 1 }
    ]
  },
  {
    name:       "Heal Strike Beacon",
    color:      "§a",
    pageIcon:   "textures/items/recipe_page_heal",
    detailIcon: "textures/items/recipe_detail_heal",
    ingredients: [
      { label: "Totem of Undying  ×6",      id: "minecraft:totem_of_undying", count: 6 },
      { label: "Shield  ×1",               id: "minecraft:shield",           count: 1 },
      { label: "Conduit  ×1",              id: "minecraft:conduit",          count: 1 },
      { label: "Orbital Strike Beacon  ×1", id: "orbital:strike_beacon",     count: 1 }
    ]
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
// Button 0: detail icon + "Give Ingredients" — gives the player all required items
// Button 1: Back
function showRecipePage(player, recipe) {
  const body = "§fIngredients:\n" +
    recipe.ingredients.map(i => `§e• ${i.label}`).join("\n");

  new ActionFormData()
    .title(`${recipe.color}§l${recipe.name}`)
    .body(body)
    .button("§a§lGive Ingredients", recipe.detailIcon)
    .button("§f◀ Back")
    .show(player)
    .then(result => {
      if (result.canceled) return;
      if (result.selection === 0) {
        for (const ing of recipe.ingredients) {
          try { player.runCommand(`give @s ${ing.id} ${ing.count}`); } catch { /* ignore */ }
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
