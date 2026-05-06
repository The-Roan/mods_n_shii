import { world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const BOOK_ID = "orbital:recipe_book";

// ─── Recipe data ──────────────────────────────────────────────────────────────
const RECIPES = [
  {
    name:     "Orbital Strike Beacon",
    color:    "§c",
    pageIcon: "textures/items/recipe_page_orbital",
    ingredients: [
      "End Crystal  ×6",
      "Nether Star  ×2",
      "Beacon  ×1"
    ]
  },
  {
    name:     "D/DX Strike Beacon",
    color:    "§e",
    pageIcon: "textures/items/recipe_page_ddx",
    ingredients: [
      "Gold Ingot  ×8",
      "Orbital Strike Beacon  ×1"
    ]
  },
  {
    name:     "Instant Strike Beacon",
    color:    "§6",
    pageIcon: "textures/items/recipe_page_instant",
    ingredients: [
      "Redstone  ×7",
      "Clock  ×1",
      "Orbital Strike Beacon  ×1"
    ]
  },
  {
    name:     "Big Strike Beacon",
    color:    "§4",
    pageIcon: "textures/items/recipe_page_big",
    ingredients: [
      "End Crystal  ×6",
      "Amethyst Shard  ×2",
      "Orbital Strike Beacon  ×1"
    ]
  },
  {
    name:     "Throwable Strike Beacon",
    color:    "§9",
    pageIcon: "textures/items/recipe_page_throwable",
    ingredients: [
      "Arrow  ×2",
      "Bow  ×1",
      "Snowball  ×2",
      "End Crystal  ×2",
      "Ender Pearl  ×1",
      "Orbital Strike Beacon  ×1"
    ]
  },
  {
    name:     "Laser Strike Beacon",
    color:    "§b",
    pageIcon: "textures/items/recipe_page_laser",
    ingredients: [
      "Bow  ×6",
      "Crossbow  ×2",
      "Orbital Strike Beacon  ×1"
    ]
  },
  {
    name:     "Void Strike Beacon",
    color:    "§5",
    pageIcon: "textures/items/recipe_page_void",
    ingredients: [
      "Ender Pearl  ×3",
      "Bedrock  ×2",
      "Command Block  ×1",
      "Repeating Command Block  ×1",
      "Chain Command Block  ×1",
      "Orbital Strike Beacon  ×1"
    ]
  },
  {
    name:     "Heal Strike Beacon",
    color:    "§a",
    pageIcon: "textures/items/recipe_page_heal",
    ingredients: [
      "Totem of Undying  ×6",
      "Shield  ×1",
      "Conduit  ×1",
      "Orbital Strike Beacon  ×1"
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
    .body("§7Select a strike to view its recipe.");

  for (const r of RECIPES) {
    form.button(`${r.color}§l${r.name}`, r.pageIcon);
  }

  form.show(player).then(result => {
    if (result.canceled || result.selection === undefined) return;
    showRecipePage(player, RECIPES[result.selection]);
  }).catch(() => {});
}

// ─── Recipe detail page ───────────────────────────────────────────────────────
// Layout: recipe image button at top, ingredient lines below, Back at bottom.
// Clicking the image or any ingredient line returns to the main menu.
function showRecipePage(player, recipe) {
  const form = new ActionFormData()
    .title(`${recipe.color}§l${recipe.name}`)
    .button("", recipe.pageIcon);  // recipe image — no label, icon is the focus

  for (const line of recipe.ingredients) {
    form.button(`§7• §f${line}`);
  }

  form.button("§7◀ Back");

  form.show(player).then(result => {
    if (result.canceled) return;
    // Last button is Back; everything else also returns to main menu
    showMainMenu(player);
  }).catch(() => {});
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
