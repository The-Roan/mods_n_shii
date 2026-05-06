import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const BOOK_ID = "orbital:recipe_book";

// ─── Recipe data ──────────────────────────────────────────────────────────────
const RECIPES = [
  {
    name:       "Orbital Strike Beacon",
    color:      "§c",
    pageIcon:   "textures/items/recipe_page_orbital",
    signal:     "§0rb_1"
  },
  {
    name:       "D/DX Strike Beacon",
    color:      "§e",
    pageIcon:   "textures/items/recipe_page_ddx",
    signal:     "§0rb_2"
  },
  {
    name:       "Instant Strike Beacon",
    color:      "§6",
    pageIcon:   "textures/items/recipe_page_instant",
    signal:     "§0rb_3"
  },
  {
    name:       "Big Strike Beacon",
    color:      "§4",
    pageIcon:   "textures/items/recipe_page_big",
    signal:     "§0rb_4"
  },
  {
    name:       "Throwable Strike Beacon",
    color:      "§9",
    pageIcon:   "textures/items/recipe_page_throwable",
    signal:     "§0rb_5"
  },
  {
    name:       "Laser Strike Beacon",
    color:      "§b",
    pageIcon:   "textures/items/recipe_page_laser",
    signal:     "§0rb_6"
  },
  {
    name:       "Void Strike Beacon",
    color:      "§5",
    pageIcon:   "textures/items/recipe_page_void",
    signal:     "§0rb_7"
  },
  {
    name:       "Heal Strike Beacon",
    color:      "§a",
    pageIcon:   "textures/items/recipe_page_heal",
    signal:     "§0rb_8"
  }
];

// ─── Active HUD overlays ──────────────────────────────────────────────────────
// Maps player name → signal string currently being broadcast
const activeOverlay = new Map();

// Broadcast signals every tick so the binding stays active
system.runInterval(() => {
  for (const [name, signal] of activeOverlay) {
    try {
      const player = world.getPlayers().find(p => p.name === name);
      if (!player) { activeOverlay.delete(name); continue; }
      player.onScreenDisplay.setActionBar(signal);
    } catch { activeOverlay.delete(name); }
  }
}, 1);

// ─── Open book on use ─────────────────────────────────────────────────────────
world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== BOOK_ID) return;
  const player = ev.source;
  // If an overlay is already open, close it
  if (activeOverlay.has(player.name)) {
    activeOverlay.delete(player.name);
    return;
  }
  showMainMenu(player);
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

// ─── Recipe detail page (HUD overlay) ────────────────────────────────────────
function showRecipePage(player, recipe) {
  // Start broadcasting the HUD signal — the UI JSON panel becomes visible
  activeOverlay.set(player.name, recipe.signal);

  // Show a simple "close" form so the player has a way back
  new ActionFormData()
    .title(`${recipe.color}§l${recipe.name}`)
    .body("§7Press the button below to go back.")
    .button("§7◀ Back")
    .show(player)
    .then(result => {
      activeOverlay.delete(player.name);
      if (!result.canceled) showMainMenu(player);
    })
    .catch(() => { activeOverlay.delete(player.name); });
}

// ─── Cleanup on player leave ──────────────────────────────────────────────────
world.afterEvents.playerLeave.subscribe(ev => {
  activeOverlay.delete(ev.playerName);
});

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
