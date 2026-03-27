import { hash4 } from "./noise.js";
import { clamp, generateRandomWorldSeed, normalizeWorldSeed } from "./core-utils.js";

export function createGameRegistry({
  BLOCK,
  ITEM,
  CHUNK_SIZE,
  SEA_LEVEL,
  VILLAGE_REGION_CHUNKS
}) {
  const MOB_DEFS = {
    zombie: {
      radius: 0.34,
      height: 1.8,
      maxHealth: 20,
      speed: 2.2,
      hostile: true,
      burnsInSunlight: true,
      aggroRange: 14,
      attackDamage: 2,
      attackReach: 1.2,
      meleeDamage: 4,
      modelHeight: 1.8,
      yawOffset: Math.PI
    },
    sheep: {
      radius: 0.42,
      height: 1.35,
      maxHealth: 8,
      speed: 1.05,
      hostile: false,
      scareRange: 7,
      meleeDamage: 1,
      modelHeight: 1.35,
      yawOffset: Math.PI,
      shellScale: 1.1,
      shellTint: [1, 1, 1, 0.58]
    },
    chicken: {
      radius: 0.26,
      height: 0.9,
      maxHealth: 4,
      speed: 1.15,
      hostile: false,
      scareRange: 6,
      meleeDamage: 1,
      modelHeight: 0.9,
      yawOffset: Math.PI
    },
    creeper: {
      radius: 0.36,
      height: 1.7,
      maxHealth: 20,
      speed: 1.85,
      hostile: true,
      aggroRange: 13,
      attackDamage: 0,
      attackReach: 0,
      meleeDamage: 0,
      fuseTime: 1.2,
      explosionRadius: 3.6,
      modelHeight: 1.7,
      yawOffset: Math.PI
    },
    spider: {
      radius: 0.72,
      height: 0.95,
      maxHealth: 16,
      speed: 2.15,
      hostile: true,
      aggroRange: 14,
      attackDamage: 2,
      attackReach: 1.5,
      meleeDamage: 3,
      leapSpeed: 5.25,
      leapVertical: 6.35,
      leapCooldown: 2.15,
      modelHeight: 0.95,
      yawOffset: Math.PI
    },
    villager: {
      radius: 0.34,
      height: 1.8,
      maxHealth: 20,
      speed: 1.05,
      hostile: false,
      scareRange: 8,
      meleeDamage: 1,
      modelHeight: 1.8,
      yawOffset: Math.PI
    },
    iron_golem: {
      radius: 0.62,
      height: 2.7,
      maxHealth: 60,
      speed: 1.35,
      hostile: false,
      scareRange: 0,
      meleeDamage: 9,
      attackDamage: 0,
      attackReach: 2.2,
      modelHeight: 2.7,
      yawOffset: Math.PI
    },
    wolf: {
      radius: 0.4,
      height: 1.0,
      maxHealth: 8,
      speed: 1.55,
      hostile: false,
      scareRange: 6,
      meleeDamage: 2,
      modelHeight: 1.0,
      yawOffset: Math.PI
    }
  };

  const EXTENDED_HOSTILE_MOB_TYPES = new Set([
    "blaze",
    "creeper",
    "ender_dragon",
    "enderman",
    "endermite",
    "ghast",
    "guardian",
    "piglin",
    "pillager",
    "shulker",
    "spider",
    "vex",
    "warden",
    "witch",
    "zombie",
    "zombie_villager"
  ]);

  const EXTENDED_PASSIVE_MOB_TYPES = new Set([
    "allay",
    "axolotl",
    "camel",
    "cat",
    "chicken",
    "cod",
    "dolphin",
    "fox",
    "frog",
    "goat",
    "horse",
    "llama",
    "parrot",
    "rabbit",
    "sheep",
    "sniffer",
    "tadpole",
    "turtle",
    "villager",
    "wolf"
  ]);

  const EXTENDED_MOB_DEF_OVERRIDES = {
    allay: { radius: 0.22, height: 0.6, maxHealth: 20, speed: 1.45 },
    axolotl: { radius: 0.34, height: 0.42, maxHealth: 14, speed: 1.05 },
    blaze: { radius: 0.45, height: 1.9, maxHealth: 20, speed: 1.55, attackDamage: 3, meleeDamage: 5, attackReach: 1.4 },
    camel: { radius: 0.9, height: 2.4, maxHealth: 32, speed: 1.0, scareRange: 5, meleeDamage: 2 },
    cat: { radius: 0.3, height: 0.7, maxHealth: 10, speed: 1.55, scareRange: 6 },
    cod: { radius: 0.22, height: 0.45, maxHealth: 3, speed: 1.1, scareRange: 4 },
    dolphin: { radius: 0.42, height: 0.8, maxHealth: 10, speed: 1.8, scareRange: 5 },
    ender_dragon: { radius: 1.8, height: 3.2, maxHealth: 200, speed: 1.25, attackDamage: 8, meleeDamage: 12, attackReach: 3.2, aggroRange: 24 },
    enderman: { radius: 0.35, height: 2.9, maxHealth: 40, speed: 2.0, attackDamage: 4, meleeDamage: 6, attackReach: 1.45, aggroRange: 16 },
    endermite: { radius: 0.2, height: 0.3, maxHealth: 8, speed: 1.8, attackDamage: 2, meleeDamage: 3, attackReach: 0.9, aggroRange: 12 },
    fox: { radius: 0.34, height: 0.75, maxHealth: 10, speed: 1.55, scareRange: 6, meleeDamage: 2 },
    frog: { radius: 0.32, height: 0.55, maxHealth: 10, speed: 1.2, scareRange: 5 },
    ghast: { radius: 1.8, height: 2.6, maxHealth: 20, speed: 0.75, attackDamage: 5, meleeDamage: 6, attackReach: 2.4, aggroRange: 24 },
    goat: { radius: 0.45, height: 1.3, maxHealth: 10, speed: 1.25, scareRange: 6, meleeDamage: 3 },
    guardian: { radius: 0.5, height: 0.85, maxHealth: 30, speed: 1.1, attackDamage: 4, meleeDamage: 6, attackReach: 1.35, aggroRange: 16 },
    horse: { radius: 0.7, height: 1.6, maxHealth: 30, speed: 1.25, scareRange: 5, meleeDamage: 3 },
    llama: { radius: 0.45, height: 1.85, maxHealth: 30, speed: 1.05, scareRange: 5, meleeDamage: 2 },
    parrot: { radius: 0.24, height: 0.6, maxHealth: 6, speed: 1.5, scareRange: 6 },
    piglin: { radius: 0.35, height: 1.9, maxHealth: 16, speed: 1.9, attackDamage: 4, meleeDamage: 5, attackReach: 1.3, aggroRange: 15 },
    pillager: { radius: 0.35, height: 1.9, maxHealth: 24, speed: 1.85, attackDamage: 4, meleeDamage: 5, attackReach: 1.3, aggroRange: 15 },
    rabbit: { radius: 0.22, height: 0.5, maxHealth: 3, speed: 1.7, scareRange: 7 },
    shulker: { radius: 0.5, height: 1.0, maxHealth: 30, speed: 0.35, attackDamage: 4, meleeDamage: 4, attackReach: 1.0, aggroRange: 14 },
    sniffer: { radius: 0.95, height: 1.75, maxHealth: 14, speed: 0.85, scareRange: 4, meleeDamage: 2 },
    tadpole: { radius: 0.16, height: 0.24, maxHealth: 3, speed: 1.0, scareRange: 4 },
    turtle: { radius: 0.65, height: 0.5, maxHealth: 30, speed: 0.6, scareRange: 4, meleeDamage: 2 },
    vex: { radius: 0.3, height: 0.8, maxHealth: 14, speed: 1.8, attackDamage: 3, meleeDamage: 4, attackReach: 1.05, aggroRange: 14 },
    warden: { radius: 0.65, height: 2.9, maxHealth: 80, speed: 1.1, attackDamage: 8, meleeDamage: 10, attackReach: 2.0, aggroRange: 18 },
    witch: { radius: 0.35, height: 1.95, maxHealth: 26, speed: 1.0, attackDamage: 3, meleeDamage: 4, attackReach: 1.2, aggroRange: 15 },
    zombie_villager: { radius: 0.35, height: 1.9, maxHealth: 20, speed: 2.0, attackDamage: 3, meleeDamage: 4, attackReach: 1.25, aggroRange: 14, burnsInSunlight: true }
  };

  function buildExtendedMobDef(type) {
    const hostile = EXTENDED_HOSTILE_MOB_TYPES.has(type);
    if (!hostile && !EXTENDED_PASSIVE_MOB_TYPES.has(type)) {
      return null;
    }
    const base = hostile
      ? {
          radius: 0.36,
          height: 1.8,
          maxHealth: 20,
          speed: 1.7,
          hostile: true,
          burnsInSunlight: false,
          aggroRange: 14,
          attackDamage: 2,
          attackReach: 1.25,
          meleeDamage: 4,
          yawOffset: Math.PI
        }
      : {
          radius: 0.38,
          height: 1.0,
          maxHealth: 8,
          speed: 1.15,
          hostile: false,
          scareRange: 6,
          meleeDamage: 1,
          yawOffset: Math.PI
        };
    const overrides = EXTENDED_MOB_DEF_OVERRIDES[type] || {};
    const height = Number.isFinite(overrides.height) ? overrides.height : base.height;
    return {
      ...base,
      ...overrides,
      modelHeight: Number.isFinite(overrides.modelHeight) ? overrides.modelHeight : height
    };
  }

  function isKnownMobType(type) {
    return !!(MOB_DEFS[type] || buildExtendedMobDef(type));
  }

  function getMobDef(type) {
    return MOB_DEFS[type] || buildExtendedMobDef(type) || MOB_DEFS.sheep;
  }

  function getVillageCenterInRegion(regionX, regionZ, seed) {
    const worldSeed = normalizeWorldSeed(seed, generateRandomWorldSeed());
    const hash = hash4(regionX * 37, 11, regionZ * 53, worldSeed + 9411);
    if ((hash % 100) >= 16) {
      return null;
    }
    const inner = Math.max(1, VILLAGE_REGION_CHUNKS - 2);
    const chunkX = regionX * VILLAGE_REGION_CHUNKS + 1 + (hash % inner);
    const chunkZ = regionZ * VILLAGE_REGION_CHUNKS + 1 + (Math.floor(hash / 97) % inner);
    return {
      x: chunkX * CHUNK_SIZE + 4 + (Math.floor(hash / 193) % 8) + 0.5,
      z: chunkZ * CHUNK_SIZE + 4 + (Math.floor(hash / 389) % 8) + 0.5,
      seed: hash
    };
  }

  function getNearbyVillageCenters(x, z, seed, radius = 128) {
    const worldSeed = normalizeWorldSeed(seed, generateRandomWorldSeed());
    const regionWorldSize = VILLAGE_REGION_CHUNKS * CHUNK_SIZE;
    const minRegionX = Math.floor((x - radius) / regionWorldSize);
    const maxRegionX = Math.floor((x + radius) / regionWorldSize);
    const minRegionZ = Math.floor((z - radius) / regionWorldSize);
    const maxRegionZ = Math.floor((z + radius) / regionWorldSize);
    const centers = [];

    for (let regionX = minRegionX; regionX <= maxRegionX; regionX += 1) {
      for (let regionZ = minRegionZ; regionZ <= maxRegionZ; regionZ += 1) {
        const center = getVillageCenterInRegion(regionX, regionZ, worldSeed);
        if (!center) continue;
        const dx = center.x - x;
        const dz = center.z - z;
        if (dx * dx + dz * dz <= radius * radius) {
          centers.push(center);
        }
      }
    }

    return centers;
  }

  function getNearestVillageCenter(x, z, seed, radius = 128) {
    const worldSeed = normalizeWorldSeed(seed, generateRandomWorldSeed());
    let best = null;
    let bestDist2 = radius * radius;
    for (const center of getNearbyVillageCenters(x, z, worldSeed, radius)) {
      const dx = center.x - x;
      const dz = center.z - z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 < bestDist2) {
        bestDist2 = dist2;
        best = center;
      }
    }
    return best;
  }

  const VILLAGER_PROFESSIONS = ["farmer", "smith", "librarian", "cleric", "shepherd"];
  const VILLAGER_PROFESSION_DEFS = {
    farmer: {
      label: "Farmer",
      workstation: BLOCK.CRAFTING_TABLE
    },
    smith: {
      label: "Smith",
      workstation: BLOCK.FURNACE
    },
    librarian: {
      label: "Librarian",
      workstation: BLOCK.PLANKS
    },
    cleric: {
      label: "Cleric",
      workstation: BLOCK.TORCH
    },
    shepherd: {
      label: "Shepherd",
      workstation: BLOCK.WHITE_WOOL
    }
  };

  function getVillagerProfessionLabel(profession = "farmer") {
    return VILLAGER_PROFESSION_DEFS[profession]?.label || "Villager";
  }

  function getVillageStructurePlan(centerX, centerZ, seed) {
    const worldSeed = normalizeWorldSeed(seed, generateRandomWorldSeed());
    const offsetVariant = worldSeed & 1;
    const houses = [
      {
        originX: centerX - 8,
        originZ: centerZ - 6,
        width: 5,
        depth: 5,
        doorSide: "south",
        profession: VILLAGER_PROFESSIONS[(worldSeed + 0) % VILLAGER_PROFESSIONS.length]
      },
      {
        originX: centerX + 4,
        originZ: centerZ - 6,
        width: 5,
        depth: 5,
        doorSide: "south",
        profession: VILLAGER_PROFESSIONS[(worldSeed + 1) % VILLAGER_PROFESSIONS.length]
      },
      {
        originX: offsetVariant === 0 ? centerX - 8 : centerX + 4,
        originZ: centerZ + 3,
        width: 5,
        depth: 5,
        doorSide: "north",
        profession: VILLAGER_PROFESSIONS[(worldSeed + 2) % VILLAGER_PROFESSIONS.length]
      }
    ];

    for (const house of houses) {
      const bedZ = house.doorSide === "south" ? house.originZ + 1 : house.originZ + house.depth - 2;
      const jobZ = house.doorSide === "south" ? house.originZ + 2 : house.originZ + house.depth - 3;
      const centerHouseX = house.originX + Math.floor(house.width / 2);
      house.bed = { x: centerHouseX, z: bedZ };
      house.jobSite = {
        x: house.originX + house.width - 2,
        z: jobZ,
        type: VILLAGER_PROFESSION_DEFS[house.profession]?.workstation || BLOCK.CRAFTING_TABLE
      };
    }

    return {
      gatherPoint: { x: centerX, z: centerZ },
      well: { x: centerX, z: centerZ },
      farms: [
        {
          minX: centerX - 3,
          maxX: centerX + 3,
          minZ: centerZ + 6,
          maxZ: centerZ + 10
        }
      ],
      pathNodes: [
        { x: centerX, z: centerZ },
        { x: centerX - 8, z: centerZ - 4 },
        { x: centerX + 4, z: centerZ - 4 },
        { x: centerX, z: centerZ + 5 }
      ],
      houses
    };
  }

  function getVillagePlanFromCenter(center, seed) {
    if (!center) return null;
    return getVillageStructurePlan(Math.floor(center.x), Math.floor(center.z), center.seed || seed);
  }

  function getVillagerTradeTable(profession = "farmer", seed = 0) {
    const offers = {
      farmer: [
        {
          id: `farmer-wool-${seed}`,
          label: "Trade wool for emeralds",
          costs: [{ itemType: BLOCK.WHITE_WOOL, count: 4 }],
          reward: { kind: "item", itemType: ITEM.EMERALD, count: 1 },
          maxUses: 6
        },
        {
          id: `farmer-food-${seed}`,
          label: "Buy cooked mutton",
          costs: [{ itemType: ITEM.EMERALD, count: 2 }],
          reward: { kind: "item", itemType: ITEM.COOKED_MUTTON, count: 3 },
          maxUses: 5
        }
      ],
      smith: [
        {
          id: `smith-sword-${seed}`,
          label: "Forge iron sword",
          costs: [{ itemType: ITEM.EMERALD, count: 3 }, { itemType: ITEM.IRON_INGOT, count: 2 }],
          reward: { kind: "item", itemType: ITEM.IRON_SWORD, count: 1 },
          maxUses: 4
        },
        {
          id: `smith-pick-${seed}`,
          label: "Forge iron pickaxe",
          costs: [{ itemType: ITEM.EMERALD, count: 4 }, { itemType: ITEM.IRON_INGOT, count: 3 }],
          reward: { kind: "item", itemType: ITEM.IRON_PICKAXE, count: 1 },
          maxUses: 4
        }
      ],
      librarian: [
        {
          id: `lib-eff-${seed}`,
          label: "Efficiency lesson",
          costs: [{ itemType: ITEM.EMERALD, count: 5 }],
          reward: { kind: "enchant", slot: "held", enchant: "efficiency", levels: 1 },
          maxUses: 3
        },
        {
          id: `lib-sharp-${seed}`,
          label: "Sharpness lesson",
          costs: [{ itemType: ITEM.EMERALD, count: 5 }],
          reward: { kind: "enchant", slot: "held", enchant: "sharpness", levels: 1 },
          maxUses: 3
        }
      ],
      cleric: [
        {
          id: `cleric-regen-${seed}`,
          label: "Blessing of regen",
          costs: [{ itemType: ITEM.EMERALD, count: 3 }, { itemType: ITEM.REDSTONE_DUST, count: 1 }],
          reward: { kind: "effect", effect: "regeneration", level: 1, duration: 90 },
          maxUses: 4
        },
        {
          id: `cleric-strength-${seed}`,
          label: "Blessing of strength",
          costs: [{ itemType: ITEM.EMERALD, count: 4 }, { itemType: ITEM.REDSTONE_DUST, count: 1 }],
          reward: { kind: "effect", effect: "strength", level: 1, duration: 120 },
          maxUses: 4
        }
      ],
      shepherd: [
        {
          id: `shep-armor-${seed}`,
          label: "Leather armor",
          costs: [{ itemType: ITEM.EMERALD, count: 2 }],
          reward: { kind: "item", itemType: ITEM.LEATHER_CHESTPLATE, count: 1 },
          maxUses: 3
        },
        {
          id: `shep-prot-${seed}`,
          label: "Protection lesson",
          costs: [{ itemType: ITEM.EMERALD, count: 4 }],
          reward: { kind: "enchant", slot: "armor", enchant: "protection", levels: 1 },
          maxUses: 3
        }
      ]
    };
    return (offers[profession] || offers.farmer).map((offer) => ({
      ...offer,
      uses: 0
    }));
  }

  const MAX_ACTIVE_MOBS = 15;

  return {
    MAX_ACTIVE_MOBS,
    MOB_DEFS,
    VILLAGER_PROFESSION_DEFS,
    VILLAGER_PROFESSIONS,
    buildExtendedMobDef,
    getMobDef,
    getNearbyVillageCenters,
    getNearestVillageCenter,
    getVillagePlanFromCenter,
    getVillageStructurePlan,
    getVillagerProfessionLabel,
    getVillagerTradeTable,
    isKnownMobType
  };
}
