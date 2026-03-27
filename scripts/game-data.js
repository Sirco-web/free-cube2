export function createGameplayData(BLOCK, ITEM, buildCreativeMenuItems) {
  const HOTBAR_BLOCKS = [
    BLOCK.GRASS,
    BLOCK.DIRT,
    BLOCK.STONE,
    BLOCK.WOOD,
    BLOCK.PLANKS,
    BLOCK.CRAFTING_TABLE,
    BLOCK.FURNACE,
    BLOCK.LEAVES,
    BLOCK.SAND
  ];

  const CREATIVE_MENU_ITEMS = buildCreativeMenuItems();

  const CRAFTING_RECIPES = [
    {
      pattern: [
        [BLOCK.WOOD]
      ],
      result: { itemType: BLOCK.PLANKS, count: 4 }
    },
    {
      pattern: [
        [BLOCK.PLANKS],
        [BLOCK.PLANKS]
      ],
      result: { itemType: ITEM.STICK, count: 4 }
    },
    {
      pattern: [
        [BLOCK.PLANKS, BLOCK.PLANKS],
        [BLOCK.PLANKS, BLOCK.PLANKS]
      ],
      result: { itemType: BLOCK.CRAFTING_TABLE, count: 1 }
    },
    {
      pattern: [
        [BLOCK.STONE, BLOCK.STONE, BLOCK.STONE],
        [BLOCK.STONE, 0, BLOCK.STONE],
        [BLOCK.STONE, BLOCK.STONE, BLOCK.STONE]
      ],
      result: { itemType: BLOCK.FURNACE, count: 1 }
    },
    {
      pattern: [
        [ITEM.COAL],
        [ITEM.STICK]
      ],
      result: { itemType: BLOCK.TORCH, count: 4 }
    },
    {
      pattern: [
        [ITEM.REDSTONE_DUST],
        [ITEM.STICK]
      ],
      result: { itemType: BLOCK.REDSTONE_TORCH, count: 1 }
    },
    {
      pattern: [
        [ITEM.STICK],
        [BLOCK.COBBLESTONE]
      ],
      result: { itemType: BLOCK.LEVER, count: 1 }
    },
    {
      pattern: [
        [BLOCK.STONE, ITEM.REDSTONE_DUST, BLOCK.STONE],
        [ITEM.REDSTONE_TORCH, 0, ITEM.REDSTONE_TORCH]
      ],
      result: { itemType: BLOCK.REPEATER, count: 1 }
    },
    {
      pattern: [
        [BLOCK.PLANKS, BLOCK.PLANKS, BLOCK.PLANKS],
        [BLOCK.COBBLESTONE, ITEM.IRON_INGOT, BLOCK.COBBLESTONE],
        [BLOCK.COBBLESTONE, ITEM.REDSTONE_DUST, BLOCK.COBBLESTONE]
      ],
      result: { itemType: BLOCK.PISTON, count: 1 }
    },
    {
      pattern: [
        [BLOCK.PISTON],
        [BLOCK.LEAVES]
      ],
      result: { itemType: BLOCK.STICKY_PISTON, count: 1 }
    },
    {
      pattern: [
        [BLOCK.WHITE_WOOL, BLOCK.WHITE_WOOL, BLOCK.WHITE_WOOL],
        [BLOCK.PLANKS, BLOCK.PLANKS, BLOCK.PLANKS]
      ],
      result: { itemType: BLOCK.BED, count: 1 }
    },
    {
      pattern: [
        [BLOCK.PLANKS, BLOCK.PLANKS, BLOCK.PLANKS],
        [0, ITEM.STICK, 0],
        [0, ITEM.STICK, 0]
      ],
      result: { itemType: ITEM.WOODEN_PICKAXE, count: 1 }
    },
    {
      pattern: [
        [BLOCK.PLANKS, BLOCK.PLANKS],
        [BLOCK.PLANKS, ITEM.STICK],
        [0, ITEM.STICK]
      ],
      mirrored: true,
      result: { itemType: ITEM.WOODEN_AXE, count: 1 }
    },
    {
      pattern: [
        [BLOCK.PLANKS],
        [ITEM.STICK],
        [ITEM.STICK]
      ],
      result: { itemType: ITEM.WOODEN_SHOVEL, count: 1 }
    },
    {
      pattern: [
        [BLOCK.PLANKS],
        [BLOCK.PLANKS],
        [ITEM.STICK]
      ],
      result: { itemType: ITEM.WOODEN_SWORD, count: 1 }
    },
    {
      pattern: [
        [BLOCK.PLANKS, BLOCK.PLANKS],
        [0, ITEM.STICK],
        [0, ITEM.STICK]
      ],
      mirrored: true,
      result: { itemType: ITEM.WOODEN_HOE, count: 1 }
    },
    {
      pattern: [
        [ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT],
        [0, ITEM.STICK, 0],
        [0, ITEM.STICK, 0]
      ],
      result: { itemType: ITEM.IRON_PICKAXE, count: 1 }
    },
    {
      pattern: [
        [ITEM.IRON_INGOT, ITEM.IRON_INGOT],
        [ITEM.IRON_INGOT, ITEM.STICK],
        [0, ITEM.STICK]
      ],
      mirrored: true,
      result: { itemType: ITEM.IRON_AXE, count: 1 }
    },
    {
      pattern: [
        [ITEM.IRON_INGOT],
        [ITEM.STICK],
        [ITEM.STICK]
      ],
      result: { itemType: ITEM.IRON_SHOVEL, count: 1 }
    },
    {
      pattern: [
        [ITEM.IRON_INGOT],
        [ITEM.IRON_INGOT],
        [ITEM.STICK]
      ],
      result: { itemType: ITEM.IRON_SWORD, count: 1 }
    },
    {
      pattern: [
        [ITEM.IRON_INGOT, ITEM.IRON_INGOT],
        [0, ITEM.STICK],
        [0, ITEM.STICK]
      ],
      mirrored: true,
      result: { itemType: ITEM.IRON_HOE, count: 1 }
    },
    {
      pattern: [
        [ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND],
        [0, ITEM.STICK, 0],
        [0, ITEM.STICK, 0]
      ],
      result: { itemType: ITEM.DIAMOND_PICKAXE, count: 1 }
    },
    {
      pattern: [
        [ITEM.DIAMOND, ITEM.DIAMOND],
        [ITEM.DIAMOND, ITEM.STICK],
        [0, ITEM.STICK]
      ],
      mirrored: true,
      result: { itemType: ITEM.DIAMOND_AXE, count: 1 }
    },
    {
      pattern: [
        [ITEM.DIAMOND],
        [ITEM.STICK],
        [ITEM.STICK]
      ],
      result: { itemType: ITEM.DIAMOND_SHOVEL, count: 1 }
    },
    {
      pattern: [
        [ITEM.DIAMOND],
        [ITEM.DIAMOND],
        [ITEM.STICK]
      ],
      result: { itemType: ITEM.DIAMOND_SWORD, count: 1 }
    },
    {
      pattern: [
        [ITEM.DIAMOND, ITEM.DIAMOND],
        [0, ITEM.STICK],
        [0, ITEM.STICK]
      ],
      mirrored: true,
      result: { itemType: ITEM.DIAMOND_HOE, count: 1 }
    }
  ];

  const FURNACE_FUEL_TIME = {
    [BLOCK.WOOD]: 15,
    [BLOCK.PLANKS]: 8,
    [ITEM.STICK]: 3.5,
    [ITEM.COAL]: 48
  };

  const FURNACE_SMELT_TIME = 5.5;

  const SMELTING_RECIPES = {
    [ITEM.RAW_CHICKEN]: ITEM.COOKED_CHICKEN,
    [ITEM.RAW_MUTTON]: ITEM.COOKED_MUTTON,
    [BLOCK.SAND]: BLOCK.GLASS,
    [BLOCK.COBBLESTONE]: BLOCK.STONE,
    [BLOCK.IRON_ORE]: ITEM.IRON_INGOT,
    [BLOCK.GOLD_ORE]: ITEM.GOLD_INGOT
  };

  const ORE_VEIN_SETTINGS = [
    { type: BLOCK.COAL_ORE, minY: 8, maxY: 96, veinsPerChunk: 12, minSize: 5, maxSize: 17, chance: 0.92 },
    { type: BLOCK.IRON_ORE, minY: 6, maxY: 64, veinsPerChunk: 9, minSize: 4, maxSize: 10, chance: 0.84 },
    { type: BLOCK.GOLD_ORE, minY: 4, maxY: 32, veinsPerChunk: 6, minSize: 3, maxSize: 9, chance: 0.66 },
    { type: BLOCK.REDSTONE_ORE, minY: 4, maxY: 18, veinsPerChunk: 7, minSize: 4, maxSize: 10, chance: 0.72 },
    { type: BLOCK.DIAMOND_ORE, minY: 4, maxY: 16, veinsPerChunk: 4, minSize: 1, maxSize: 8, chance: 0.52 },
    { type: BLOCK.EMERALD_ORE, minY: 4, maxY: 40, veinsPerChunk: 3, minSize: 1, maxSize: 5, chance: 0.34, highlandsOnly: true }
  ];

  const CAVE_WORM_CHUNK_RADIUS = 1;
  const CAVE_WORM_MIN_LENGTH = 30;
  const CAVE_WORM_MAX_LENGTH = 100;

  const MOB_LOOT_TABLES = {
    sheep: [
      { itemType: BLOCK.WHITE_WOOL, min: 1, max: 2 },
      { itemType: ITEM.RAW_MUTTON, min: 1, max: 2 }
    ],
    chicken: [
      { itemType: ITEM.RAW_CHICKEN, min: 1, max: 2 }
    ],
    zombie: [
      { itemType: ITEM.ROTTEN_FLESH, min: 1, max: 2 }
    ]
  };

  return {
    HOTBAR_BLOCKS,
    CREATIVE_MENU_ITEMS,
    CRAFTING_RECIPES,
    FURNACE_FUEL_TIME,
    FURNACE_SMELT_TIME,
    SMELTING_RECIPES,
    ORE_VEIN_SETTINGS,
    CAVE_WORM_CHUNK_RADIUS,
    CAVE_WORM_MIN_LENGTH,
    CAVE_WORM_MAX_LENGTH,
    MOB_LOOT_TABLES
  };
}
