import { world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const BOOK_ID = "orbital:recipe_book";

// ─── Recipe data ──────────────────────────────────────────────────────────────
const RECIPES = [
  {
    name:       "Orbital Strike Beacon",
    color:      "§b",
    pageIcon:   "textures/items/recipe_page_orbital",
    detailIcon: "textures/items/recipe_detail_orbital",
    desc:       "...was blown up by Mo",
    pattern:    ["EEE", "NBN", "EEE"],
    key: {
      E: { label: "End Crystal",  id: "minecraft:end_crystal",  count: 6 },
      N: { label: "Nether Star",  id: "minecraft:nether_star",  count: 2 },
      B: { label: "Beacon",       id: "minecraft:beacon",       count: 1 }
    }
  },
  {
    type:     "group",
    name:     "D/DX Strikes",
    color:    "§e",
    pageIcon: "textures/items/recipe_page_ddx",
    strikes: [
      {
        name:       "Derivatives Strike",
        color:      "§e",
        pageIcon:   "textures/items/recipe_page_ddx",
        detailIcon: "textures/items/recipe_detail_ddx",
        desc:       "We're going up up up",
        pattern:    ["GGG", "GSG", "GGG"],
        key: {
          G: { label: "Gold Ingot",             id: "minecraft:gold_ingot",  count: 8 },
          S: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon", count: 1 }
        }
      },
      {
        name:       "Implicit Differentiation Strike",
        color:      "§9",
        pageIcon:   "textures/items/recipe_page_implicit",
        detailIcon: "textures/items/recipe_detail_implicit",
        desc:       "How it's done done done",
        pattern:    ["SLS", "LXL", "SLS"],
        key: {
          S: { label: "Diamond Sword",      id: "minecraft:diamond_sword", count: 4 },
          L: { label: "Lapis Lazuli",       id: "minecraft:lapis_lazuli",  count: 4 },
          X: { label: "D/DX Strike Beacon", id: "orbital:ddx_beacon",      count: 1 }
        }
      },
      {
        name:       "Related Rates Strike",
        color:      "§c",
        pageIcon:   "textures/items/recipe_page_related_rates",
        detailIcon: "textures/items/recipe_detail_related_rates",
        desc:       "And rip out your heart",
        pattern:    ["SRS", "RXR", "SRS"],
        key: {
          S: { label: "Diamond Sword",      id: "minecraft:diamond_sword", count: 4 },
          R: { label: "Redstone Dust",      id: "minecraft:redstone",      count: 4 },
          X: { label: "D/DX Strike Beacon", id: "orbital:ddx_beacon",      count: 1 }
        }
      },
      {
        name:       "Optimization Strike",
        color:      "§b",
        pageIcon:   "textures/items/recipe_page_optimization",
        detailIcon: "textures/items/recipe_detail_optimization",
        desc:       "We broke into a million pieces",
        pattern:    ["SDS", "DXD", "SDS"],
        key: {
          S: { label: "Diamond Sword",      id: "minecraft:diamond_sword", count: 4 },
          D: { label: "Diamond",            id: "minecraft:diamond",       count: 4 },
          X: { label: "D/DX Strike Beacon", id: "orbital:ddx_beacon",      count: 1 }
        }
      }
    ]
  },
  {
    name:       "Instant Strike Beacon",
    color:      "§c",
    pageIcon:   "textures/items/recipe_page_instant",
    detailIcon: "textures/items/recipe_detail_instant",
    desc:       "Immediate evisceration",
    pattern:    ["RCR", "RSR", "RRR"],
    key: {
      R: { label: "Redstone",               id: "minecraft:redstone",    count: 7 },
      C: { label: "Clock",                  id: "minecraft:clock",       count: 1 },
      S: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon", count: 1 }
    }
  },
  {
    name:       "Big Strike Beacon",
    color:      "§5",
    pageIcon:   "textures/items/recipe_page_big",
    detailIcon: "textures/items/recipe_detail_big",
    desc:       "Built like Logan",
    pattern:    ["EEE", "ASA", "EEE"],
    key: {
      E: { label: "End Crystal",            id: "minecraft:end_crystal",    count: 6 },
      A: { label: "Amethyst Shard",         id: "minecraft:amethyst_shard", count: 2 },
      S: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon",    count: 1 }
    }
  },
  {
    name:       "Throwable Strike Beacon",
    color:      "§a",
    pageIcon:   "textures/items/recipe_page_throwable",
    detailIcon: "textures/items/recipe_detail_throwable",
    desc:       "Hiroshima in Brawl Stars",
    pattern:    ["RBR", "SOS", "CPC"],
    key: {
      R: { label: "Arrow",                  id: "minecraft:arrow",         count: 2 },
      B: { label: "Bow",                    id: "minecraft:bow",           count: 1 },
      S: { label: "Snowball",               id: "minecraft:snowball",      count: 2 },
      O: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon",   count: 1 },
      C: { label: "End Crystal",            id: "minecraft:end_crystal",   count: 1 },
      P: { label: "Ender Pearl",            id: "minecraft:ender_pearl",   count: 2 }
    }
  },
  {
    name:       "Laser Strike Beacon",
    color:      "§f",
    pageIcon:   "textures/items/recipe_page_laser",
    detailIcon: "textures/items/recipe_detail_laser",
    desc:       "Just snipe Juan atp",
    pattern:    ["BCB", "BOB", "BCB"],
    key: {
      B: { label: "Bow",                    id: "minecraft:bow",          count: 6 },
      C: { label: "Crossbow",               id: "minecraft:crossbow",     count: 2 },
      O: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon",  count: 1 }
    }
  },
  {
    name:       "Void Strike Beacon",
    color:      "§8",
    pageIcon:   "textures/items/recipe_page_void",
    detailIcon: "textures/items/recipe_detail_void",
    desc:       "Don't let Juan obtain this",
    pattern:    ["EEE", "BOB", "CRN"],
    key: {
      E: { label: "Ender Pearl",              id: "minecraft:ender_pearl",             count: 3 },
      B: { label: "Bedrock",                  id: "minecraft:bedrock",                 count: 2 },
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
    desc:       "Melodians, 탈덕안돼...아!",
    pattern:    ["TST", "TOT", "TDT"],
    key: {
      T: { label: "Totem of Undying",       id: "minecraft:totem_of_undying", count: 6 },
      S: { label: "Shield",                 id: "minecraft:shield",           count: 1 },
      O: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon",      count: 1 },
      D: { label: "Conduit",                id: "minecraft:conduit",          count: 1 }
    }
  },
  {
    name:       "Napalm Strike Beacon",
    color:      "§6",
    pageIcon:   "textures/items/recipe_page_napalm",
    detailIcon: "textures/items/recipe_detail_napalm",
    desc:       "Why are the trees talking?",
    pattern:    ["FFF", "IOI", "NNN"],
    key: {
      F: { label: "Fire Charge",            id: "minecraft:fire_charge",      count: 3 },
      I: { label: "Flint and Steel",        id: "minecraft:flint_and_steel",  count: 2 },
      O: { label: "Orbital Strike Beacon",  id: "orbital:strike_beacon",      count: 1 },
      N: { label: "Netherrack",             id: "minecraft:netherrack",       count: 3 }
    }
  },
  {
    name:       "Singularity Strike Beacon",
    color:      "§5",
    pageIcon:   "textures/items/recipe_page_singularity",
    detailIcon: "textures/items/recipe_detail_singularity",
    desc:       "The Artificial Disaster",
    pattern:    ["NBN", "BVB", "NBN"],
    key: {
      N: { label: "Nether Star",        id: "minecraft:nether_star", count: 4 },
      B: { label: "Big Strike Beacon",  id: "orbital:big_beacon",    count: 4 },
      V: { label: "Void Strike Beacon", id: "orbital:void_beacon",   count: 1 }
    }
  },
  {
    name:       "Ultimate D/DX Singularity Strike Beacon",
    color:      "§0",
    pageIcon:   "textures/items/recipe_page_event_horizon",
    detailIcon: "textures/items/recipe_detail_event_horizon",
    desc:       "Don't get sucked into the D/DX Ásshole...",
    pattern:    ["DNI", "NSN", "RNO"],
    key: {
      D: { label: "Derivatives Beacon",    id: "orbital:ddx_beacon"           },
      N: { label: "Nether Star",           id: "minecraft:nether_star"         },
      I: { label: "Implicit Beacon",       id: "orbital:implicit_beacon"       },
      S: { label: "Singularity Beacon",    id: "orbital:singularity_beacon"    },
      R: { label: "Related Rates Beacon",  id: "orbital:related_rates_beacon"  },
      O: { label: "Optimization Beacon",   id: "orbital:optimization_beacon"   }
    }
  },
  {
    name:       "Bitcoin Strike Beacon",
    color:      "§6",
    pageIcon:   "textures/items/recipe_page_bitcoin",
    detailIcon: "textures/items/recipe_detail_bitcoin",
    desc:       "JE STE AL ALL ZE BITCOIN",
    pattern:    ["DGD", "GOG", "IGI"],
    key: {
      D: { label: "D/DX Strike Beacon",    id: "orbital:ddx_beacon",     count: 2 },
      G: { label: "Gold Ingot",            id: "minecraft:gold_ingot",   count: 4 },
      O: { label: "Orbital Strike Beacon", id: "orbital:strike_beacon",  count: 1 },
      I: { label: "Instant Strike Beacon", id: "orbital:instant_beacon", count: 2 }
    }
  },
  {
    name:       "End of Integrals Strike Beacon",
    color:      "§c",
    pageIcon:   "textures/items/recipe_page_end_of_integrals",
    detailIcon: "textures/items/recipe_detail_end_of_integrals",
    desc:       "Omega Hel Fire gets obliterated by D/DX",
    pattern:    ["NON", "DOI", "ROR"],
    key: {
      N: { label: "Nether Star",            id: "minecraft:nether_star"          },
      O: { label: "Optimization Beacon",    id: "orbital:optimization_beacon"    },
      D: { label: "Derivatives Beacon",     id: "orbital:ddx_beacon"             },
      I: { label: "Implicit Beacon",        id: "orbital:implicit_beacon"        },
      R: { label: "Related Rates Beacon",   id: "orbital:related_rates_beacon"   }
    }
  }
];

// ─── Tier pages ───────────────────────────────────────────────────────────────
// Each tier references entries from RECIPES by index.
const TIERS = [
  {
    color: "§f",
    label: "Tier 1  §l— Basic",
    //       Orbital        D/DX group     Instant        Big
    items: [RECIPES[0], RECIPES[1], RECIPES[2], RECIPES[3]]
  },
  {
    color: "§f",
    label: "Tier 2  §l§a— Super",
    //       Throwable      Laser          Void           Heal           Napalm
    items: [RECIPES[4], RECIPES[5], RECIPES[6], RECIPES[7], RECIPES[8]]
  },
  {
    color: "§f",
    label: "Tier 3  §l§d— Master",
    //       Singularity    Bitcoin
    items: [RECIPES[9], RECIPES[11]]
  },
  {
    color: "§f",
    label: "Tier 4  §l— §cU§6l§et§2i§bm§9a§5t§de",
    //       Event Horizon   End of Integrals
    items: [RECIPES[10], RECIPES[12]]
  }
];

// ─── Build crafting grid display ──────────────────────────────────────────────
function buildRecipeBody(recipe) {
  const grid = recipe.pattern.map(row =>
    [row[0], row[1], row[2]]
      .map(letter => `§f[${recipe.key[letter].label}]`)
      .join("")
  ).join("\n");
  return recipe.desc ? `${grid}\n\n§8§o"${recipe.desc}"` : grid;
}

// ─── Ingredient expansion constants ──────────────────────────────────────────
const ORBITAL_BASE_INGREDIENTS = [
  { id: "minecraft:end_crystal", count: 6 },
  { id: "minecraft:nether_star", count: 2 },
  { id: "minecraft:beacon",      count: 1 }
];
const DDX_BASE_INGREDIENTS = [
  { id: "minecraft:gold_ingot",  count: 8 },
  { id: "minecraft:end_crystal", count: 6 },
  { id: "minecraft:nether_star", count: 2 },
  { id: "minecraft:beacon",      count: 1 }
];
const BIG_BASE_INGREDIENTS = [
  { id: "minecraft:end_crystal",    count: 12 },
  { id: "minecraft:amethyst_shard", count: 2 },
  { id: "minecraft:nether_star",    count: 2 },
  { id: "minecraft:beacon",         count: 1 }
];
const INSTANT_BASE_INGREDIENTS = [
  { id: "minecraft:redstone",    count: 7 },
  { id: "minecraft:clock",       count: 1 },
  { id: "minecraft:end_crystal", count: 6 },
  { id: "minecraft:nether_star", count: 2 },
  { id: "minecraft:beacon",      count: 1 }
];
const IMPLICIT_BASE_INGREDIENTS = [
  { id: "minecraft:diamond_sword", count: 4 },
  { id: "minecraft:lapis_lazuli",  count: 4 },
  ...DDX_BASE_INGREDIENTS
];
const RELATED_RATES_BASE_INGREDIENTS = [
  { id: "minecraft:diamond_sword", count: 4 },
  { id: "minecraft:redstone",      count: 4 },
  ...DDX_BASE_INGREDIENTS
];
const OPTIMIZATION_BASE_INGREDIENTS = [
  { id: "minecraft:diamond_sword", count: 4 },
  { id: "minecraft:diamond",       count: 4 },
  ...DDX_BASE_INGREDIENTS
];
const VOID_BASE_INGREDIENTS = [
  { id: "minecraft:ender_pearl",             count: 3 },
  { id: "minecraft:bedrock",                 count: 2 },
  { id: "minecraft:end_crystal",             count: 6 },
  { id: "minecraft:nether_star",             count: 2 },
  { id: "minecraft:beacon",                  count: 1 },
  { id: "minecraft:command_block",           count: 1 },
  { id: "minecraft:repeating_command_block", count: 1 },
  { id: "minecraft:chain_command_block",     count: 1 }
];
const SINGULARITY_BASE_INGREDIENTS = [
  { id: "minecraft:nether_star",              count: 14 },
  { id: "minecraft:end_crystal",              count: 54 },
  { id: "minecraft:amethyst_shard",           count: 8  },
  { id: "minecraft:beacon",                   count: 5  },
  { id: "minecraft:ender_pearl",              count: 3  },
  { id: "minecraft:bedrock",                  count: 2  },
  { id: "minecraft:command_block",            count: 1  },
  { id: "minecraft:repeating_command_block",  count: 1  },
  { id: "minecraft:chain_command_block",      count: 1  }
];

// ─── Open book on use ─────────────────────────────────────────────────────────
world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack.typeId !== BOOK_ID) return;
  showTierPage(ev.source, 0);
});

// ─── Tier page ────────────────────────────────────────────────────────────────
function showTierPage(player, tierIndex) {
  const tier    = TIERS[tierIndex];
  const hasPrev = tierIndex > 0;
  const hasNext = tierIndex < TIERS.length - 1;

  const form = new ActionFormData()
    .title("§8§lStrike Recipe Book")
    .body(`${tier.color}§l${tier.label}\n§7Page ${tierIndex + 1} of ${TIERS.length}`);

  for (const r of tier.items) {
    form.button(`${r.color}§l${r.name}`, r.pageIcon);
  }
  if (hasPrev) form.button("§0◀ Previous");
  if (hasNext) form.button("§0Next ▶");

  form.show(player).then(result => {
    if (result.canceled || result.selection === undefined) return;
    const sel = result.selection;

    if (sel < tier.items.length) {
      // Recipe button
      const r = tier.items[sel];
      if (r.type === "group") showGroupMenu(player, r, tierIndex);
      else                    showRecipePage(player, r, null, tierIndex);
    } else {
      // Navigation button
      const navIndex = sel - tier.items.length;
      if (hasPrev && navIndex === 0) showTierPage(player, tierIndex - 1);
      else                           showTierPage(player, tierIndex + 1);
    }
  }).catch(() => {});
}

// ─── D/DX group submenu ───────────────────────────────────────────────────────
function showGroupMenu(player, group, tierIndex) {
  const form = new ActionFormData()
    .title(`${group.color}§l${group.name}`)
    .body("§fSelect a strike to view its recipe.");

  for (const r of group.strikes) {
    form.button(`${r.color}§l${r.name}`, r.pageIcon);
  }

  form.show(player).then(result => {
    if (result.canceled) { showTierPage(player, tierIndex); return; }
    if (result.selection === undefined) return;
    showRecipePage(player, group.strikes[result.selection], group, tierIndex);
  }).catch(() => {});
}

// ─── Recipe detail page ───────────────────────────────────────────────────────
function showRecipePage(player, recipe, parentGroup, tierIndex) {
  new ActionFormData()
    .title(`${recipe.color}§l${recipe.name}`)
    .body(buildRecipeBody(recipe))
    .button("§a§lGive Ingredients", recipe.detailIcon)
    .button("§f◀ Back")
    .show(player)
    .then(result => {
      if (result.canceled) return;
      if (result.selection === 0) {
        const flat = recipe.pattern.join("");
        for (const [letter, item] of Object.entries(recipe.key)) {
          const count = [...flat].filter(c => c === letter).length;
          if (item.id === "orbital:strike_beacon") {
            for (const base of ORBITAL_BASE_INGREDIENTS)
              try { player.runCommand(`give @s ${base.id} ${base.count * count}`); } catch {}
          } else if (item.id === "orbital:ddx_beacon") {
            for (const base of DDX_BASE_INGREDIENTS)
              try { player.runCommand(`give @s ${base.id} ${base.count * count}`); } catch {}
          } else if (item.id === "orbital:big_beacon") {
            for (const base of BIG_BASE_INGREDIENTS)
              try { player.runCommand(`give @s ${base.id} ${base.count * count}`); } catch {}
          } else if (item.id === "orbital:instant_beacon") {
            for (const base of INSTANT_BASE_INGREDIENTS)
              try { player.runCommand(`give @s ${base.id} ${base.count * count}`); } catch {}
          } else if (item.id === "orbital:void_beacon") {
            for (const base of VOID_BASE_INGREDIENTS)
              try { player.runCommand(`give @s ${base.id} ${base.count * count}`); } catch {}
          } else if (item.id === "orbital:implicit_beacon") {
            for (const base of IMPLICIT_BASE_INGREDIENTS)
              try { player.runCommand(`give @s ${base.id} ${base.count * count}`); } catch {}
          } else if (item.id === "orbital:related_rates_beacon") {
            for (const base of RELATED_RATES_BASE_INGREDIENTS)
              try { player.runCommand(`give @s ${base.id} ${base.count * count}`); } catch {}
          } else if (item.id === "orbital:optimization_beacon") {
            for (const base of OPTIMIZATION_BASE_INGREDIENTS)
              try { player.runCommand(`give @s ${base.id} ${base.count * count}`); } catch {}
          } else if (item.id === "orbital:singularity_beacon") {
            for (const base of SINGULARITY_BASE_INGREDIENTS)
              try { player.runCommand(`give @s ${base.id} ${base.count * count}`); } catch {}
          } else {
            try { player.runCommand(`give @s ${item.id} ${count}`); } catch {}
          }
        }
        showRecipePage(player, recipe, parentGroup, tierIndex);
      } else {
        if (parentGroup) showGroupMenu(player, parentGroup, tierIndex);
        else             showTierPage(player, tierIndex);
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
  } catch {}
});
