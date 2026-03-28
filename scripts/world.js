import { hash4, random2, random3, createSeededRng, FractalNoise, FractalNoise3D } from "./noise.js";

export function createWorldModule(deps) {
  const {
    BLOCK,
    LIGHT_LEVEL_MAX,
    WORLD_HEIGHT,
    CHUNK_SIZE,
    VILLAGE_REGION_CHUNKS,
    SEA_LEVEL,
    LAVA_LEVEL,
    MAX_REACH,
    MAX_WATER_FLOW_LEVEL,
    MAX_LAVA_FLOW_LEVEL,
    REDSTONE_UPDATE_LIMIT_PER_STEP,
    REDSTONE_SCHEDULE_LIMIT_PER_STEP,
    REDSTONE_NEIGHBOR_OFFSETS,
    FACE_DEFS,
    FACE_BY_ID,
    GAME_VERSION,
    STORAGE_KEY,
    ORE_VEIN_SETTINGS,
    CAVE_WORM_CHUNK_RADIUS,
    CAVE_WORM_MIN_LENGTH,
    CAVE_WORM_MAX_LENGTH,
    cloneRedstoneState,
    usesRedstoneState,
    normalizeSerializedRedstoneState,
    isRedstoneRelevantBlock,
    packBlockPositionKey,
    packChunkKey,
    packLocalKey,
    unpackLocalKey,
    mod,
    clamp,
    isFluidBlock,
    isCollidable,
    blocksLightPropagation,
    getBlockLightEmission,
    shouldRenderFace,
    normalizeWorldSeed,
    generateRandomWorldSeed
  } = deps;

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

const SURFACE_STRUCTURE_REGION_CHUNKS = 5;
const DUNGEON_REGION_CHUNKS = 4;
const DUNGEON_MOB_TYPES = ["zombie", "skeleton", "spider"];

function getSurfaceStructureInRegion(regionX, regionZ, seed) {
  const worldSeed = normalizeWorldSeed(seed, generateRandomWorldSeed());
  const hash = hash4(regionX * 61, 17, regionZ * 67, worldSeed + 15213);
  if ((hash % 100) >= 34) {
    return null;
  }
  const inner = Math.max(1, SURFACE_STRUCTURE_REGION_CHUNKS - 2);
  const chunkX = regionX * SURFACE_STRUCTURE_REGION_CHUNKS + 1 + (Math.floor(hash / 7) % inner);
  const chunkZ = regionZ * SURFACE_STRUCTURE_REGION_CHUNKS + 1 + (Math.floor(hash / 19) % inner);
  const kindIndex = Math.floor(hash / 43) % 3;
  return {
    kind: kindIndex === 0 ? "ruined_tower" : kindIndex === 1 ? "camp" : "stone_well",
    x: chunkX * CHUNK_SIZE + 2 + (Math.floor(hash / 97) % 12) + 0.5,
    z: chunkZ * CHUNK_SIZE + 2 + (Math.floor(hash / 193) % 12) + 0.5,
    seed: hash
  };
}

function getNearbySurfaceStructures(x, z, seed, radius = 160) {
  const worldSeed = normalizeWorldSeed(seed, generateRandomWorldSeed());
  const regionWorldSize = SURFACE_STRUCTURE_REGION_CHUNKS * CHUNK_SIZE;
  const minRegionX = Math.floor((x - radius) / regionWorldSize);
  const maxRegionX = Math.floor((x + radius) / regionWorldSize);
  const minRegionZ = Math.floor((z - radius) / regionWorldSize);
  const maxRegionZ = Math.floor((z + radius) / regionWorldSize);
  const structures = [];

  for (let regionX = minRegionX; regionX <= maxRegionX; regionX += 1) {
    for (let regionZ = minRegionZ; regionZ <= maxRegionZ; regionZ += 1) {
      const structure = getSurfaceStructureInRegion(regionX, regionZ, worldSeed);
      if (!structure) continue;
      const dx = structure.x - x;
      const dz = structure.z - z;
      if (dx * dx + dz * dz <= radius * radius) {
        structures.push(structure);
      }
    }
  }

  return structures;
}

function getDungeonAnchorInRegion(regionX, regionZ, seed) {
  const worldSeed = normalizeWorldSeed(seed, generateRandomWorldSeed());
  const hash = hash4(regionX * 73, 29, regionZ * 79, worldSeed + 20473);
  if ((hash % 100) >= 26) {
    return null;
  }
  const inner = Math.max(1, DUNGEON_REGION_CHUNKS - 1);
  const chunkX = regionX * DUNGEON_REGION_CHUNKS + (Math.floor(hash / 11) % inner);
  const chunkZ = regionZ * DUNGEON_REGION_CHUNKS + (Math.floor(hash / 23) % inner);
  return {
    x: chunkX * CHUNK_SIZE + 3 + (Math.floor(hash / 61) % 10) + 0.5,
    z: chunkZ * CHUNK_SIZE + 3 + (Math.floor(hash / 127) % 10) + 0.5,
    seed: hash,
    mobType: DUNGEON_MOB_TYPES[Math.floor(hash / 43) % DUNGEON_MOB_TYPES.length]
  };
}

function getNearbyDungeonAnchors(x, z, seed, radius = 112) {
  const worldSeed = normalizeWorldSeed(seed, generateRandomWorldSeed());
  const regionWorldSize = DUNGEON_REGION_CHUNKS * CHUNK_SIZE;
  const minRegionX = Math.floor((x - radius) / regionWorldSize);
  const maxRegionX = Math.floor((x + radius) / regionWorldSize);
  const minRegionZ = Math.floor((z - radius) / regionWorldSize);
  const maxRegionZ = Math.floor((z + radius) / regionWorldSize);
  const anchors = [];

  for (let regionX = minRegionX; regionX <= maxRegionX; regionX += 1) {
    for (let regionZ = minRegionZ; regionZ <= maxRegionZ; regionZ += 1) {
      const anchor = getDungeonAnchorInRegion(regionX, regionZ, worldSeed);
      if (!anchor) continue;
      const dx = anchor.x - x;
      const dz = anchor.z - z;
      if (dx * dx + dz * dz <= radius * radius) {
        anchors.push(anchor);
      }
    }
  }

  return anchors;
}

function getDungeonPlacementForAnchor(terrain, anchor) {
  const column = terrain.describeColumn(Math.floor(anchor.x), Math.floor(anchor.z));
  if (!column || column.height <= SEA_LEVEL + 6 || column.biome === "riverbank") {
    return null;
  }
  const maxDepth = Math.max(10, Math.min(30, column.height - 12));
  const depth = 8 + (Math.floor(anchor.seed / 89) % maxDepth);
  const y = clamp(column.height - depth, 10, Math.max(10, column.height - 7));
  return {
    ...anchor,
    y
  };
}

class TerrainGenerator {
  constructor(seed) {
    this.seed = seed;
    this.continents = new FractalNoise(seed + 11, 4, 0.5, 2);
    this.hills = new FractalNoise(seed + 23, 4, 0.52, 2.05);
    this.details = new FractalNoise(seed + 37, 3, 0.55, 2.4);
    this.moisture = new FractalNoise(seed + 49, 4, 0.5, 2);
    this.temperature = new FractalNoise(seed + 61, 4, 0.5, 2);
    this.ridges = new FractalNoise(seed + 71, 4, 0.48, 2.2);
    this.forest = new FractalNoise(seed + 83, 4, 0.5, 2.1);
    this.peaks = new FractalNoise(seed + 93, 4, 0.5, 2.12);
    this.erosion = new FractalNoise(seed + 107, 3, 0.54, 2.15);
    this.rivers = new FractalNoise(seed + 121, 3, 0.55, 2.3);
    this.caveWarp = new FractalNoise3D(seed + 151, 2, 0.52, 2.02);
    this.cheeseCaves = new FractalNoise3D(seed + 173, 4, 0.54, 2.04);
    this.spaghettiCavesA = new FractalNoise3D(seed + 197, 3, 0.56, 2.18);
    this.spaghettiCavesB = new FractalNoise3D(seed + 223, 3, 0.55, 2.12);
    this.noodleCaves = new FractalNoise3D(seed + 239, 2, 0.58, 2.42);
    this.verticalCaves = new FractalNoise3D(seed + 257, 3, 0.5, 2.08);
    this.caveMask = new FractalNoise3D(seed + 271, 3, 0.53, 1.96);
    this.cavePillars = new FractalNoise3D(seed + 293, 2, 0.5, 2.3);
    this.aquiferNoise = new FractalNoise3D(seed + 311, 3, 0.55, 2.03);
    this.aquiferLevelNoise = new FractalNoise3D(seed + 337, 2, 0.5, 1.9);
    this.lavaPools = new FractalNoise3D(seed + 359, 2, 0.57, 2.08);
    this.heightCache = new Map();
    this.columnCache = new Map();
  }

  _columnKey(x, z) {
    return `${x},${z}`;
  }

  _trimCaches() {
    if (this.heightCache.size > 32768) {
      this.heightCache.clear();
    }
    if (this.columnCache.size > 16384) {
      this.columnCache.clear();
    }
  }

  sampleHeight(x, z) {
    const key = this._columnKey(x, z);
    const cached = this.heightCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const continental = this.continents.fractal(x * 0.0038, z * 0.0038) * 0.5 + 0.5;
    const hills = this.hills.fractal(x * 0.012, z * 0.012);
    const detail = this.details.fractal(x * 0.038, z * 0.038);
    const erosion = this.erosion.fractal(x * 0.0075, z * 0.0075) * 0.5 + 0.5;
    const ridge = 1 - Math.abs(this.ridges.fractal(x * 0.009, z * 0.009));
    const peaks = Math.max(0, this.peaks.fractal(x * 0.0065, z * 0.0065) * 0.5 + 0.5 - 0.42);
    const river = 1 - Math.min(1, Math.abs(this.rivers.fractal(x * 0.0048, z * 0.0048)) * 4.4);

    let height = 16;
    height += continental * 17;
    height += hills * (5.5 + erosion * 4.5);
    height += ridge * (4.5 + erosion * 5.5);
    height += detail * 2.8;
    height += peaks * peaks * (22 + erosion * 13);
    if (continental < 0.33) {
      height -= (0.33 - continental) * 15;
    }
    height -= river > 0.62 ? (river - 0.62) * 20 : 0;

    const result = clamp(Math.round(height), 6, WORLD_HEIGHT - 8);
    this._trimCaches();
    this.heightCache.set(key, result);
    return result;
  }

  describeColumn(x, z) {
    const key = this._columnKey(x, z);
    const cached = this.columnCache.get(key);
    if (cached) {
      return cached;
    }

    const height = this.sampleHeight(x, z);
    const moisture = this.moisture.fractal(x * 0.006, z * 0.006) * 0.5 + 0.5;
    const temperature = this.temperature.fractal(x * 0.0055, z * 0.0055) * 0.5 + 0.5;
    const forest = this.forest.fractal(x * 0.0085, z * 0.0085) * 0.5 + 0.5;
    const river = 1 - Math.min(1, Math.abs(this.rivers.fractal(x * 0.0048, z * 0.0048)) * 4.4);
    const slope =
      Math.abs(this.sampleHeight(x + 1, z) - this.sampleHeight(x - 1, z)) +
      Math.abs(this.sampleHeight(x, z + 1) - this.sampleHeight(x, z - 1));

    let biome = "plains";
    let surface = BLOCK.GRASS;
    let filler = BLOCK.DIRT;
    let topDepth = 4;

    if (river > 0.74 || height <= SEA_LEVEL + 1) {
      biome = "riverbank";
      surface = BLOCK.SAND;
      filler = BLOCK.SAND;
      topDepth = 5;
    } else if (temperature > 0.66 && moisture < 0.34) {
      biome = "desert";
      surface = BLOCK.SAND;
      filler = BLOCK.SAND;
      topDepth = 5;
    } else if (height > SEA_LEVEL + 30 || (height > SEA_LEVEL + 22 && slope > 7)) {
      biome = "mountains";
      surface = slope > 4 ? BLOCK.STONE : BLOCK.GRASS;
      filler = BLOCK.STONE;
      topDepth = surface === BLOCK.STONE ? 2 : 3;
    } else if (forest > 0.58 && moisture > 0.45 && slope < 6) {
      biome = "forest";
      topDepth = 4;
    } else if (height > SEA_LEVEL + 16 && slope > 7) {
      biome = "cliff";
      surface = BLOCK.STONE;
      filler = BLOCK.STONE;
      topDepth = 2;
    } else if (moisture > 0.72 && slope < 5) {
      biome = "meadow";
      topDepth = 4;
    }

    const result = {
      height,
      moisture,
      temperature,
      forest,
      river,
      slope,
      biome,
      surface,
      filler,
      topDepth
    };
    this._trimCaches();
    this.columnCache.set(key, result);
    return result;
  }

  sampleOreBlock(x, y, z) {
    if (y < 5 || y > WORLD_HEIGHT - 8) {
      return BLOCK.STONE;
    }

    const vein = random3(Math.floor(x * 0.32), Math.floor(y * 0.32), Math.floor(z * 0.32), this.seed + 541);
    const detail = random3(x, y, z, this.seed + 557);
    const highlands = this.peaks.fractal(x * 0.0065, z * 0.0065) * 0.5 + 0.5;

    if (y <= 16 && vein > 0.78 && detail > 0.7) {
      return BLOCK.DIAMOND_ORE;
    }
    if (y <= 18 && vein > 0.72 && detail > 0.46) {
      return BLOCK.REDSTONE_ORE;
    }
    if (y <= 28 && vein > 0.75 && detail > 0.64) {
      return BLOCK.GOLD_ORE;
    }
    if (y <= 56 && vein > 0.71 && detail > 0.54) {
      return BLOCK.IRON_ORE;
    }
    if (y <= 40 && highlands > 0.72 && vein > 0.81 && detail > 0.74) {
      return BLOCK.EMERALD_ORE;
    }
    if (y <= 84 && vein > 0.66 && detail > 0.42) {
      return BLOCK.COAL_ORE;
    }

    return BLOCK.STONE;
  }

  shouldPlaceTree(x, z, column) {
    if (
      column.surface !== BLOCK.GRASS ||
      column.height <= SEA_LEVEL + 1 ||
      column.slope > 5 ||
      column.biome === "mountains" ||
      column.biome === "cliff"
    ) {
      return false;
    }
    const chance = random2(x, z, this.seed + 301);
    let threshold = 0.955;
    if (column.biome === "forest") {
      threshold = 0.76;
    } else if (column.biome === "meadow") {
      threshold = 0.9;
    } else if (column.moisture > 0.6) {
      threshold = 0.9;
    }
    return chance > threshold;
  }

  getTreeHeight(x, z, column = null) {
    const biome = column?.biome || this.describeColumn(x, z).biome;
    const base = biome === "forest" ? 5 : 4;
    const variance = biome === "forest" ? 3 : 2;
    return base + Math.floor(random2(x, z, this.seed + 401) * variance);
  }

  sampleCaveProfile(x, y, z, surfaceY) {
    if (y < 5 || y >= surfaceY - 3) {
      return { carve: false, fluidType: BLOCK.AIR, openness: 0, chamber: 0 };
    }

    const depth = clamp((surfaceY - y) / Math.max(22, surfaceY * 0.72), 0, 1);
    if (depth < 0.12) {
      return { carve: false, fluidType: BLOCK.AIR, openness: 0, chamber: 0 };
    }

    const warpX = this.caveWarp.fractal(x * 0.028, y * 0.024, z * 0.028) * 7.5;
    const warpY = this.caveWarp.fractal(x * 0.022 + 13.7, y * 0.03 - 5.8, z * 0.022 - 9.4) * 5.6;
    const warpZ = this.caveWarp.fractal(x * 0.028 - 17.1, y * 0.021 + 4.2, z * 0.028 + 11.5) * 7.5;
    const sampleX = (x + warpX) * 0.055;
    const sampleY = (y + warpY) * 0.055;
    const sampleZ = (z + warpZ) * 0.055;

    const chamber = this.cheeseCaves.fractal(sampleX * 0.68, sampleY * 0.68, sampleZ * 0.68) * 0.5 + 0.5;
    const openness = this.caveMask.fractal(sampleX * 0.92 + 9.4, sampleY * 0.92 - 6.8, sampleZ * 0.92 + 4.1) * 0.5 + 0.5;
    const spaghettiA = 1 - clamp(Math.abs(this.spaghettiCavesA.fractal(sampleX * 1.42 + 7.3, sampleY * 1.16 - 8.9, sampleZ * 1.42 + 2.1)) * 3.8, 0, 1);
    const spaghettiB = 1 - clamp(Math.abs(this.spaghettiCavesB.fractal(sampleX * 1.31 - 11.6, sampleY * 1.24 + 5.5, sampleZ * 1.31 - 14.7)) * 3.5, 0, 1);
    const spaghetti = Math.max(spaghettiA, spaghettiB) * (0.72 + openness * 0.28);
    const noodle = 1 - clamp(Math.abs(this.noodleCaves.fractal(sampleX * 2.18 - 5.2, sampleY * 2.64 + 3.1, sampleZ * 2.18 + 17.2)) * 5.3, 0, 1);
    const vertical = 1 - clamp(Math.abs(this.verticalCaves.fractal(sampleX * 1.04 - 3.7, sampleY * 0.62 + 7.2, sampleZ * 1.04 + 5.4)) * 2.7, 0, 1);
    const pillarNoise = this.cavePillars.fractal(sampleX * 0.96 + 4.3, sampleY * 1.36 - 12.2, sampleZ * 0.96 - 1.8) * 0.5 + 0.5;

    const caveCeilingPenalty = y > surfaceY - 10 ? (y - (surfaceY - 10)) * 0.036 : 0;
    const cheeseThreshold = 0.75 + (1 - depth) * 0.13 + caveCeilingPenalty;
    const spaghettiThreshold = 0.8 + (1 - depth) * 0.08 + caveCeilingPenalty;
    const noodleThreshold = 0.885 + (1 - depth) * 0.045 + caveCeilingPenalty;

    const carveCheese = chamber > cheeseThreshold;
    const carveSpaghetti = spaghetti > spaghettiThreshold && openness > 0.36;
    const carveNoodle = noodle > noodleThreshold && vertical > 0.28 && openness > 0.5;
    let carve = carveCheese || carveSpaghetti || carveNoodle;

    if (carveCheese && pillarNoise > 0.69 && openness < 0.8) {
      carve = false;
    }

    const fluidType = carve ? this.getCaveFluidType(x, y, z, surfaceY, openness, chamber) : BLOCK.AIR;
    return { carve, fluidType, openness, chamber };
  }

  shouldCarveCave(x, y, z, surfaceY) {
    return this.sampleCaveProfile(x, y, z, surfaceY).carve;
  }

  shouldFillCaveWithWater(x, y, z, surfaceY, openness = 0.5) {
    if (y >= surfaceY - 10 || y > SEA_LEVEL - 4 || y < LAVA_LEVEL + 3) {
      return false;
    }
    const aquifer = this.aquiferNoise.fractal(x * 0.027, y * 0.024, z * 0.027) * 0.5 + 0.5;
    if (aquifer < 0.72 || openness < 0.42) {
      return false;
    }
    const aquiferDepth = this.aquiferLevelNoise.fractal(x * 0.013, y * 0.009, z * 0.013) * 0.5 + 0.5;
    const waterLine = SEA_LEVEL - 4 - Math.floor(aquiferDepth * 18);
    return y <= waterLine;
  }

  shouldFillCaveWithLava(x, y, z, surfaceY, chamber = 0.5) {
    if (y > LAVA_LEVEL || y >= surfaceY - 16) {
      return false;
    }

    const poolMask = this.lavaPools.fractal(x * 0.032, y * 0.02, z * 0.032) * 0.5 + 0.5;
    if (poolMask < 0.66 || chamber < 0.54) {
      return false;
    }
    const fillHeight = clamp(Math.floor(3 + (poolMask - 0.66) * 22), 3, LAVA_LEVEL);
    return y <= fillHeight;
  }

  getCaveFluidType(x, y, z, surfaceY, openness = 0.5, chamber = 0.5) {
    if (this.shouldFillCaveWithLava(x, y, z, surfaceY, chamber)) {
      return BLOCK.LAVA;
    }
    if (this.shouldFillCaveWithWater(x, y, z, surfaceY, openness)) {
      return BLOCK.WATER;
    }
    return BLOCK.AIR;
  }
}

class Chunk {
  constructor(world, chunkX, chunkZ) {
    this.world = world;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.skyLight = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.blockLight = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.generated = false;
    this.meshDirty = true;
    this.mesh = [];
    this.meshMaxY = 0;
  }

  index(x, y, z) {
    return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
  }

  getLocal(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return BLOCK.AIR;
    }
    return this.blocks[this.index(x, y, z)];
  }

  setLocal(x, y, z, type) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return;
    }
    this.blocks[this.index(x, y, z)] = type;
    if (type !== BLOCK.AIR) {
      this.meshMaxY = Math.max(this.meshMaxY, y);
    }
    this.meshDirty = true;
  }

  setLocalRaw(x, y, z, type) {
    this.blocks[this.index(x, y, z)] = type;
    if (type !== BLOCK.AIR) {
      this.meshMaxY = Math.max(this.meshMaxY, y);
    }
  }

  rebuildMeshHeight() {
    this.meshMaxY = 0;
    for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          if (this.blocks[this.index(x, y, z)] !== BLOCK.AIR) {
            this.meshMaxY = y;
            return;
          }
        }
      }
    }
  }

  loadSnapshot(blocks) {
    if (!(blocks instanceof Uint8Array) || blocks.length !== this.blocks.length) {
      return false;
    }
    this.blocks.set(blocks);
    this.skyLight.fill(0);
    this.blockLight.fill(0);
    this.generated = true;
    this.meshDirty = true;
    this.rebuildMeshHeight();
    return true;
  }

  getSkyLightLocal(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return 0;
    }
    return this.skyLight[this.index(x, y, z)] || 0;
  }

  getBlockLightLocal(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return 0;
    }
    return this.blockLight[this.index(x, y, z)] || 0;
  }

  setSkyLightLocal(x, y, z, level) {
    this.skyLight[this.index(x, y, z)] = clamp(Math.floor(level), 0, LIGHT_LEVEL_MAX);
  }

  setBlockLightLocal(x, y, z, level) {
    this.blockLight[this.index(x, y, z)] = clamp(Math.floor(level), 0, LIGHT_LEVEL_MAX);
  }

  carveNoiseCaves(baseX, baseZ) {
    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
        const worldX = baseX + lx;
        const worldZ = baseZ + lz;
        const column = this.world.terrain.describeColumn(worldX, worldZ);
        const surfaceY = column.height;
        for (let y = 6; y < surfaceY - 4; y += 1) {
          const current = this.getLocal(lx, y, lz);
          if (current === BLOCK.AIR || isFluidBlock(current) || current === BLOCK.BEDROCK) {
            continue;
          }
          const profile = this.world.terrain.sampleCaveProfile(worldX, y, worldZ, surfaceY);
          if (!profile.carve) {
            continue;
          }
          this.setLocalRaw(
            lx,
            y,
            lz,
            profile.fluidType || BLOCK.AIR
          );
        }
      }
    }
  }

  carveWormSphere(worldX, worldY, worldZ, radius) {
    const minX = Math.floor(worldX - radius);
    const maxX = Math.ceil(worldX + radius);
    const minY = Math.max(4, Math.floor(worldY - radius));
    const maxY = Math.min(WORLD_HEIGHT - 2, Math.ceil(worldY + radius));
    const minZ = Math.floor(worldZ - radius);
    const maxZ = Math.ceil(worldZ + radius);
    const radiusSq = radius * radius;

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          const dx = x + 0.5 - worldX;
          const dy = y + 0.5 - worldY;
          const dz = z + 0.5 - worldZ;
          if (dx * dx + dy * dy + dz * dz > radiusSq) {
            continue;
          }
          if (x < this.chunkX * CHUNK_SIZE || x >= this.chunkX * CHUNK_SIZE + CHUNK_SIZE || z < this.chunkZ * CHUNK_SIZE || z >= this.chunkZ * CHUNK_SIZE + CHUNK_SIZE) {
            continue;
          }
          const surfaceY = this.world.terrain.describeColumn(x, z).height;
          if (y >= surfaceY - 3) {
            continue;
          }
          const localX = x - this.chunkX * CHUNK_SIZE;
          const localZ = z - this.chunkZ * CHUNK_SIZE;
          const current = this.getLocal(localX, y, localZ);
          if (current === BLOCK.AIR || isFluidBlock(current) || current === BLOCK.BEDROCK) {
            continue;
          }
          const caveProfile = this.world.terrain.sampleCaveProfile(x, y, z, surfaceY);
          this.setLocalRaw(
            localX,
            y,
            localZ,
            caveProfile.fluidType || BLOCK.AIR
          );
        }
      }
    }
  }

  carveWormPath(rng, startX, startY, startZ, length, dirX = null, dirY = null, dirZ = null, branchDepth = 0) {
    let x = startX;
    let y = startY;
    let z = startZ;
    let vx = Number.isFinite(dirX) ? dirX : rng() * 2 - 1;
    let vy = Number.isFinite(dirY) ? dirY : (rng() * 2 - 1) * 0.26;
    let vz = Number.isFinite(dirZ) ? dirZ : rng() * 2 - 1;
    let branched = false;

    for (let step = 0; step < length; step += 1) {
      const arch = Math.sin((step / Math.max(1, length - 1)) * Math.PI);
      const radius = (1.45 + arch * (1.8 + rng() * 0.45)) * (branchDepth > 0 ? 0.82 : 1);
      this.carveWormSphere(x, y, z, radius);

      vx += (rng() * 2 - 1) * 0.22;
      vy += (rng() * 2 - 1) * 0.13;
      vz += (rng() * 2 - 1) * 0.22;
      const len = Math.hypot(vx, vy, vz) || 1;
      vx /= len;
      vy = clamp(vy / len, -0.46, 0.46);
      vz /= len;

      if (!branched && branchDepth < 2 && step > length * 0.28 && step < length * 0.78 && rng() > 0.962) {
        branched = true;
        const branchYaw = (rng() > 0.5 ? 1 : -1) * (0.65 + rng() * 0.5);
        const branchDirX = vx * Math.cos(branchYaw) - vz * Math.sin(branchYaw);
        const branchDirZ = vx * Math.sin(branchYaw) + vz * Math.cos(branchYaw);
        const branchDirY = clamp(vy + (rng() * 2 - 1) * 0.12, -0.42, 0.42);
        const branchLength = Math.max(18, Math.floor(length * (0.34 + rng() * 0.2)));
        this.carveWormPath(rng, x, y, z, branchLength, branchDirX, branchDirY, branchDirZ, branchDepth + 1);
      }

      x += vx * 1.42;
      y = clamp(y + vy * 1.04, 5, WORLD_HEIGHT - 7);
      z += vz * 1.42;
    }
  }

  carveWormTunnels() {
    for (let sourceChunkX = this.chunkX - CAVE_WORM_CHUNK_RADIUS; sourceChunkX <= this.chunkX + CAVE_WORM_CHUNK_RADIUS; sourceChunkX += 1) {
      for (let sourceChunkZ = this.chunkZ - CAVE_WORM_CHUNK_RADIUS; sourceChunkZ <= this.chunkZ + CAVE_WORM_CHUNK_RADIUS; sourceChunkZ += 1) {
        const wormCount = 1 + Math.floor(random3(sourceChunkX, 0, sourceChunkZ, this.world.seed + 8801) * 2);
        for (let wormIndex = 0; wormIndex < wormCount; wormIndex += 1) {
          const rng = createSeededRng(hash4(sourceChunkX, wormIndex, sourceChunkZ, this.world.seed + 8807));
          let x = sourceChunkX * CHUNK_SIZE + rng() * CHUNK_SIZE;
          let y = 10 + rng() * (WORLD_HEIGHT - 28);
          let z = sourceChunkZ * CHUNK_SIZE + rng() * CHUNK_SIZE;
          const length = CAVE_WORM_MIN_LENGTH + Math.floor(rng() * (CAVE_WORM_MAX_LENGTH - CAVE_WORM_MIN_LENGTH + 1));
          this.carveWormPath(rng, x, y, z, length);
        }
      }
    }
  }

  generateOreVeins(baseX, baseZ) {
    for (const ore of ORE_VEIN_SETTINGS) {
      const rng = createSeededRng(hash4(this.chunkX, ore.type, this.chunkZ, this.world.seed + 9901));
      const attempts = ore.veinsPerChunk;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (rng() > ore.chance) {
          continue;
        }
        const startLocalX = Math.floor(rng() * CHUNK_SIZE);
        const startLocalZ = Math.floor(rng() * CHUNK_SIZE);
        const startWorldX = baseX + startLocalX;
        const startWorldZ = baseZ + startLocalZ;
        const column = this.world.terrain.describeColumn(startWorldX, startWorldZ);
        if (ore.highlandsOnly && column.biome !== "mountains" && column.biome !== "cliff") {
          continue;
        }
        const maxY = Math.min(ore.maxY, column.height - 4);
        if (maxY < ore.minY) {
          continue;
        }
        let localX = startLocalX;
        let localY = ore.minY + Math.floor(rng() * (maxY - ore.minY + 1));
        let localZ = startLocalZ;
        const size = ore.minSize + Math.floor(rng() * (ore.maxSize - ore.minSize + 1));

        for (let step = 0; step < size; step += 1) {
          const radius = step === 0 ? 1 : (rng() > 0.7 ? 1 : 0);
          for (let dx = -radius; dx <= radius; dx += 1) {
            for (let dy = -radius; dy <= radius; dy += 1) {
              for (let dz = -radius; dz <= radius; dz += 1) {
                const x = clamp(localX + dx, 0, CHUNK_SIZE - 1);
                const y = clamp(localY + dy, 1, WORLD_HEIGHT - 2);
                const z = clamp(localZ + dz, 0, CHUNK_SIZE - 1);
                if (this.getLocal(x, y, z) === BLOCK.STONE) {
                  this.setLocalRaw(x, y, z, ore.type);
                }
              }
            }
          }
          localX = clamp(localX + Math.floor(rng() * 3) - 1, 0, CHUNK_SIZE - 1);
          localY = clamp(localY + Math.floor(rng() * 3) - 1, ore.minY, maxY);
          localZ = clamp(localZ + Math.floor(rng() * 3) - 1, 0, CHUNK_SIZE - 1);
        }
      }
    }
  }

  generate() {
    if (this.generated) {
      return;
    }

    const baseX = this.chunkX * CHUNK_SIZE;
    const baseZ = this.chunkZ * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
        const worldX = baseX + lx;
        const worldZ = baseZ + lz;
        const column = this.world.terrain.describeColumn(worldX, worldZ);
        const surfaceY = column.height;
        const topDepth = Math.max(2, column.topDepth || 4);
        const solidCeiling = Math.min(WORLD_HEIGHT - 1, Math.max(surfaceY, SEA_LEVEL) + 1);
        const stoneCeiling = surfaceY - topDepth;

        for (let y = 0; y <= solidCeiling; y += 1) {
          let type = BLOCK.AIR;
          if (y === 0) {
            type = BLOCK.BEDROCK;
          } else if (y <= 4 && random3(worldX, y, worldZ, this.world.seed + 4041) > y * 0.22) {
            type = BLOCK.BEDROCK;
          } else if (y < stoneCeiling) {
            type = BLOCK.STONE;
          } else if (y < surfaceY) {
            type = column.filler;
          } else if (y === surfaceY) {
            type = column.surface;
          } else if (y <= SEA_LEVEL) {
            type = BLOCK.WATER;
          }

          this.setLocalRaw(lx, y, lz, type);
        }

      }
    }

    this.carveNoiseCaves(baseX, baseZ);
    this.carveWormTunnels();
    this.generateOreVeins(baseX, baseZ);

    this.decorateTrees(baseX, baseZ);
    this.decorateSurfaceStructures(baseX, baseZ);
    this.decorateVillage(baseX, baseZ);
    this.decorateDungeons(baseX, baseZ);

    this.generated = true;
    this.world.applyOverridesToChunk(this);
    this.meshDirty = true;
  }

  decorateTrees(baseX, baseZ) {
    for (let worldX = baseX - 2; worldX <= baseX + CHUNK_SIZE + 2; worldX += 1) {
      for (let worldZ = baseZ - 2; worldZ <= baseZ + CHUNK_SIZE + 2; worldZ += 1) {
        const column = this.world.terrain.describeColumn(worldX, worldZ);
        if (
          column.height < WORLD_HEIGHT - 10 &&
          this.world.terrain.shouldPlaceTree(worldX, worldZ, column)
        ) {
          this.applyWorldTree(worldX, column.height, worldZ, this.world.terrain.getTreeHeight(worldX, worldZ, column));
        }
      }
    }
  }

  writeWorldBlock(worldX, y, worldZ, type, replaceSolid = true) {
    const localX = worldX - this.chunkX * CHUNK_SIZE;
    const localZ = worldZ - this.chunkZ * CHUNK_SIZE;
    if (localX < 0 || localX >= CHUNK_SIZE || localZ < 0 || localZ >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) {
      return;
    }
    const current = this.getLocal(localX, y, localZ);
    if (!replaceSolid && current !== BLOCK.AIR && current !== BLOCK.LEAVES) {
      return;
    }
    this.setLocalRaw(localX, y, localZ, type);
  }

  applyWorldTree(worldX, groundY, worldZ, height) {
    for (let trunk = 1; trunk <= height; trunk += 1) {
      this.writeWorldBlock(worldX, groundY + trunk, worldZ, BLOCK.WOOD, true);
    }

    const canopyBase = groundY + height - 2;
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dy = 0; dy <= 3; dy += 1) {
          const leafY = canopyBase + dy;
          const spread = Math.abs(dx) + Math.abs(dz) + dy * 0.7;
          const isCorner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
          if (leafY >= WORLD_HEIGHT) {
            continue;
          }
          if (spread < 4.15 && !(isCorner && dy === 0)) {
            this.writeWorldBlock(worldX + dx, leafY, worldZ + dz, BLOCK.LEAVES, false);
          }
        }
      }
    }

    this.writeWorldBlock(worldX, groundY + height + 2, worldZ, BLOCK.LEAVES, false);
  }

  decorateSurfaceStructures(baseX, baseZ) {
    const structures = getNearbySurfaceStructures(baseX + CHUNK_SIZE * 0.5, baseZ + CHUNK_SIZE * 0.5, this.world.seed, CHUNK_SIZE * 4.5);
    for (const structure of structures) {
      if (structure.x < baseX - 20 || structure.x > baseX + CHUNK_SIZE + 20 || structure.z < baseZ - 20 || structure.z > baseZ + CHUNK_SIZE + 20) {
        continue;
      }
      if (getNearbyVillageCenters(structure.x, structure.z, this.world.seed, 28).length > 0) {
        continue;
      }
      const centerX = Math.floor(structure.x);
      const centerZ = Math.floor(structure.z);
      const column = this.world.terrain.describeColumn(centerX, centerZ);
      if (!column || column.height <= SEA_LEVEL + 1 || column.slope > 7) {
        continue;
      }
      const groundY = clamp(column.height, 2, WORLD_HEIGHT - 9);
      if (structure.kind === "ruined_tower") {
        this.applyRuinedTowerAt(centerX, groundY, centerZ, structure.seed);
      } else if (structure.kind === "camp") {
        this.applyCampAt(centerX, groundY, centerZ, structure.seed);
      } else {
        this.applyStoneWellAt(centerX, groundY, centerZ, structure.seed);
      }
    }
  }

  decorateDungeons(baseX, baseZ) {
    const anchors = getNearbyDungeonAnchors(baseX + CHUNK_SIZE * 0.5, baseZ + CHUNK_SIZE * 0.5, this.world.seed, CHUNK_SIZE * 4.5);
    for (const anchor of anchors) {
      const placement = getDungeonPlacementForAnchor(this.world.terrain, anchor);
      if (!placement) continue;
      if (placement.x < baseX - 12 || placement.x > baseX + CHUNK_SIZE + 12 || placement.z < baseZ - 12 || placement.z > baseZ + CHUNK_SIZE + 12) {
        continue;
      }
      this.applyDungeonAt(Math.floor(placement.x), placement.y, Math.floor(placement.z), placement.seed);
    }
  }

  applyRuinedTowerAt(centerX, groundY, centerZ, seed) {
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        const wx = centerX + dx;
        const wz = centerZ + dz;
        const columnY = this.world.terrain.describeColumn(wx, wz).height;
        for (let y = columnY + 1; y <= groundY; y += 1) {
          this.writeWorldBlock(wx, y, wz, BLOCK.COBBLESTONE, true);
        }
        this.writeWorldBlock(wx, groundY, wz, BLOCK.COBBLESTONE, true);
      }
    }

    const towerHeight = 5 + (seed % 3);
    for (let y = groundY + 1; y <= groundY + towerHeight; y += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dz = -2; dz <= 2; dz += 1) {
          const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (!edge) {
            this.writeWorldBlock(centerX + dx, y, centerZ + dz, BLOCK.AIR, true);
            continue;
          }
          const damage = hash4(centerX + dx, y, centerZ + dz, seed + 411) % 100;
          const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
          if (!corner && damage < 19) {
            this.writeWorldBlock(centerX + dx, y, centerZ + dz, BLOCK.AIR, true);
            continue;
          }
          this.writeWorldBlock(centerX + dx, y, centerZ + dz, corner ? BLOCK.WOOD : BLOCK.COBBLESTONE, true);
        }
      }
    }

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        this.writeWorldBlock(centerX + dx, groundY + towerHeight, centerZ + dz, BLOCK.PLANKS, true);
      }
    }
    this.writeWorldBlock(centerX, groundY + towerHeight + 1, centerZ, BLOCK.TORCH, true);
  }

  applyCampAt(centerX, groundY, centerZ, seed) {
    for (let dx = -3; dx <= 3; dx += 1) {
      for (let dz = -3; dz <= 3; dz += 1) {
        const wx = centerX + dx;
        const wz = centerZ + dz;
        const columnY = this.world.terrain.describeColumn(wx, wz).height;
        for (let y = columnY + 1; y <= groundY; y += 1) {
          this.writeWorldBlock(wx, y, wz, BLOCK.DIRT, true);
        }
        if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
          this.writeWorldBlock(wx, groundY, wz, BLOCK.PLANKS, true);
        }
      }
    }

    for (const [dx, dz] of [[-2, -1], [2, -1], [-2, 1], [2, 1]]) {
      this.writeWorldBlock(centerX + dx, groundY + 1, centerZ + dz, BLOCK.WOOD, true);
      this.writeWorldBlock(centerX + dx, groundY + 2, centerZ + dz, BLOCK.WOOD, true);
    }
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 1) continue;
        this.writeWorldBlock(centerX + dx, groundY + 3, centerZ + dz, BLOCK.WHITE_WOOL, true);
      }
    }

    this.writeWorldBlock(centerX - 1, groundY + 1, centerZ - 1, BLOCK.BED, true);
    this.writeWorldBlock(centerX + 1, groundY + 1, centerZ + 1, BLOCK.CRAFTING_TABLE, true);
    if ((seed % 2) === 0) {
      this.writeWorldBlock(centerX, groundY + 1, centerZ + 2, BLOCK.FURNACE, true);
    }
    this.writeWorldBlock(centerX - 3, groundY + 1, centerZ, BLOCK.TORCH, true);
    this.writeWorldBlock(centerX + 3, groundY + 1, centerZ, BLOCK.TORCH, true);
  }

  applyStoneWellAt(centerX, groundY, centerZ, seed) {
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        const wx = centerX + dx;
        const wz = centerZ + dz;
        const columnY = this.world.terrain.describeColumn(wx, wz).height;
        for (let y = columnY + 1; y <= groundY; y += 1) {
          this.writeWorldBlock(wx, y, wz, BLOCK.COBBLESTONE, true);
        }
      }
    }

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
        this.writeWorldBlock(centerX + dx, groundY + 1, centerZ + dz, edge ? BLOCK.COBBLESTONE : BLOCK.WATER, true);
      }
    }

    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      this.writeWorldBlock(centerX + dx, groundY + 1, centerZ + dz, BLOCK.WOOD, true);
      this.writeWorldBlock(centerX + dx, groundY + 2, centerZ + dz, BLOCK.WOOD, true);
      this.writeWorldBlock(centerX + dx, groundY + 3, centerZ + dz, BLOCK.WOOD, true);
    }

    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2 && (hash4(centerX + dx, groundY, centerZ + dz, seed + 613) % 100) < 22) {
          continue;
        }
        this.writeWorldBlock(centerX + dx, groundY + 4, centerZ + dz, BLOCK.PLANKS, true);
      }
    }
  }

  applyDungeonAt(centerX, centerY, centerZ, seed) {
    const halfX = 3 + (seed % 2);
    const halfZ = 3 + (Math.floor(seed / 5) % 2);
    const height = 4;
    for (let dx = -halfX; dx <= halfX; dx += 1) {
      for (let dz = -halfZ; dz <= halfZ; dz += 1) {
        for (let dy = -1; dy <= height; dy += 1) {
          const wx = centerX + dx;
          const wy = centerY + dy;
          const wz = centerZ + dz;
          const shell = dy === -1 || dy === height || Math.abs(dx) === halfX || Math.abs(dz) === halfZ;
          if (shell) {
            const cracked = hash4(wx, wy, wz, seed + 877) % 100;
            this.writeWorldBlock(wx, wy, wz, cracked < 20 ? BLOCK.STONE : BLOCK.COBBLESTONE, true);
          } else {
            this.writeWorldBlock(wx, wy, wz, BLOCK.AIR, true);
          }
        }
      }
    }

    this.writeWorldBlock(centerX, centerY, centerZ, BLOCK.COBBLESTONE, true);
    this.writeWorldBlock(centerX, centerY + 1, centerZ, BLOCK.AIR, true);
    const doorwaySide = Math.floor(seed / 17) % 4;
    if (doorwaySide === 0) {
      this.writeWorldBlock(centerX - halfX, centerY, centerZ, BLOCK.AIR, true);
      this.writeWorldBlock(centerX - halfX, centerY + 1, centerZ, BLOCK.AIR, true);
    } else if (doorwaySide === 1) {
      this.writeWorldBlock(centerX + halfX, centerY, centerZ, BLOCK.AIR, true);
      this.writeWorldBlock(centerX + halfX, centerY + 1, centerZ, BLOCK.AIR, true);
    } else if (doorwaySide === 2) {
      this.writeWorldBlock(centerX, centerY, centerZ - halfZ, BLOCK.AIR, true);
      this.writeWorldBlock(centerX, centerY + 1, centerZ - halfZ, BLOCK.AIR, true);
    } else {
      this.writeWorldBlock(centerX, centerY, centerZ + halfZ, BLOCK.AIR, true);
      this.writeWorldBlock(centerX, centerY + 1, centerZ + halfZ, BLOCK.AIR, true);
    }
  }

  decorateVillage(baseX, baseZ) {
    const centers = getNearbyVillageCenters(baseX + CHUNK_SIZE * 0.5, baseZ + CHUNK_SIZE * 0.5, this.world.seed, CHUNK_SIZE * 3.5);
    for (const center of centers) {
      if (center.x < baseX - 16 || center.x > baseX + CHUNK_SIZE + 16 || center.z < baseZ - 16 || center.z > baseZ + CHUNK_SIZE + 16) {
        continue;
      }
      const centerX = Math.floor(center.x);
      const centerZ = Math.floor(center.z);
      const sampleHeights = [
        this.world.terrain.describeColumn(centerX, centerZ).height,
        this.world.terrain.describeColumn(centerX + 5, centerZ).height,
        this.world.terrain.describeColumn(centerX - 5, centerZ).height,
        this.world.terrain.describeColumn(centerX, centerZ + 5).height,
        this.world.terrain.describeColumn(centerX, centerZ - 5).height
      ];
      const minH = Math.min(...sampleHeights);
      const maxH = Math.max(...sampleHeights);
      if (maxH - minH > 4 || maxH <= SEA_LEVEL + 1) {
        continue;
      }
      const groundY = Math.round(sampleHeights[0]);
      this.applyVillageAt(centerX, groundY, centerZ, center.seed);
    }
  }

  carveAirBox(minX, minY, minZ, maxX, maxY, maxZ) {
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          this.writeWorldBlock(x, y, z, BLOCK.AIR, true);
        }
      }
    }
  }

  layVillageSurface(worldX, worldZ, topType = BLOCK.PLANKS, supportType = BLOCK.WOOD) {
    const column = this.world.terrain.describeColumn(worldX, worldZ);
    const topY = clamp(column.height, 1, WORLD_HEIGHT - 8);
    for (let y = Math.max(1, topY - 2); y < topY; y += 1) {
      this.writeWorldBlock(worldX, y, worldZ, supportType, true);
    }
    this.writeWorldBlock(worldX, topY, worldZ, topType, true);
    for (let y = topY + 1; y <= Math.min(WORLD_HEIGHT - 1, topY + 5); y += 1) {
      this.writeWorldBlock(worldX, y, worldZ, BLOCK.AIR, true);
    }
  }

  buildVillageHouse(originX, originZ, width = 5, depth = 5, doorSide = "south", options = {}) {
    let floorY = 0;
    for (let dx = 0; dx < width; dx += 1) {
      for (let dz = 0; dz < depth; dz += 1) {
        floorY = Math.max(floorY, this.world.terrain.describeColumn(originX + dx, originZ + dz).height);
      }
    }
    floorY = clamp(floorY + 1, 2, WORLD_HEIGHT - 8);

    for (let dx = 0; dx < width; dx += 1) {
      for (let dz = 0; dz < depth; dz += 1) {
        const wx = originX + dx;
        const wz = originZ + dz;
        const columnY = this.world.terrain.describeColumn(wx, wz).height;
        for (let y = columnY + 1; y < floorY; y += 1) {
          this.writeWorldBlock(wx, y, wz, BLOCK.WOOD, true);
        }
        this.writeWorldBlock(wx, floorY, wz, BLOCK.PLANKS, true);
        for (let y = floorY + 1; y <= floorY + 4; y += 1) {
          this.writeWorldBlock(wx, y, wz, BLOCK.AIR, true);
        }
      }
    }

    for (let dx = 0; dx < width; dx += 1) {
      for (let dz = 0; dz < depth; dz += 1) {
        const edge = dx === 0 || dz === 0 || dx === width - 1 || dz === depth - 1;
        const corner = (dx === 0 || dx === width - 1) && (dz === 0 || dz === depth - 1);
        for (let y = floorY + 1; y <= floorY + 3; y += 1) {
          if (edge) {
            this.writeWorldBlock(originX + dx, y, originZ + dz, corner ? BLOCK.WOOD : BLOCK.PLANKS, true);
          }
        }
      }
    }

    const doorX = originX + Math.floor(width / 2);
    const doorZ = doorSide === "south" ? originZ + depth - 1 : originZ;
    this.writeWorldBlock(doorX, floorY + 1, doorZ, BLOCK.AIR, true);
    this.writeWorldBlock(doorX, floorY + 2, doorZ, BLOCK.AIR, true);

    for (let x = originX + 1; x <= originX + width - 2; x += 1) {
      this.writeWorldBlock(x, floorY + 4, originZ + 1, BLOCK.PLANKS, true);
      this.writeWorldBlock(x, floorY + 4, originZ + depth - 2, BLOCK.PLANKS, true);
    }
    for (let z = originZ + 1; z <= originZ + depth - 2; z += 1) {
      this.writeWorldBlock(originX + 1, floorY + 4, z, BLOCK.PLANKS, true);
      this.writeWorldBlock(originX + width - 2, floorY + 4, z, BLOCK.PLANKS, true);
    }

    for (let dx = -1; dx <= width; dx += 1) {
      for (let dz = -1; dz <= depth; dz += 1) {
        this.writeWorldBlock(originX + dx, floorY + 4, originZ + dz, BLOCK.PLANKS, true);
      }
    }

    this.writeWorldBlock(originX + 1, floorY + 2, originZ, BLOCK.GLASS, true);
    this.writeWorldBlock(originX + width - 2, floorY + 2, originZ + depth - 1, BLOCK.GLASS, true);
    this.writeWorldBlock(originX, floorY + 2, originZ + 1, BLOCK.GLASS, true);
    this.writeWorldBlock(originX + width - 1, floorY + 2, originZ + depth - 2, BLOCK.GLASS, true);

    const bedX = options?.bed?.x ?? (originX + Math.floor(width / 2));
    const bedZ = options?.bed?.z ?? (doorSide === "south" ? originZ + 1 : originZ + depth - 2);
    const jobX = options?.jobSite?.x ?? (originX + width - 2);
    const jobZ = options?.jobSite?.z ?? (doorSide === "south" ? originZ + 2 : originZ + depth - 3);
    const jobType = options?.jobSite?.type ?? BLOCK.CRAFTING_TABLE;
    this.writeWorldBlock(bedX, floorY + 1, bedZ, BLOCK.BED, true);
    this.writeWorldBlock(jobX, floorY + 1, jobZ, jobType, true);
  }

  applyVillageAt(centerX, groundY, centerZ, seed) {
    const plan = getVillageStructurePlan(centerX, centerZ, seed);
    for (let d = -7; d <= 7; d += 1) {
      this.layVillageSurface(centerX + d, centerZ, BLOCK.PLANKS, BLOCK.WOOD);
      this.layVillageSurface(centerX, centerZ + d, BLOCK.PLANKS, BLOCK.WOOD);
    }

    for (const house of plan.houses) {
      this.buildVillageHouse(house.originX, house.originZ, house.width, house.depth, house.doorSide, house);
    }

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        this.layVillageSurface(centerX + dx, centerZ + dz, BLOCK.BRICK, BLOCK.STONE);
      }
    }

    for (let y = groundY + 1; y <= groundY + 3; y += 1) {
      this.writeWorldBlock(centerX, y, centerZ, BLOCK.WOOD, true);
    }
    this.writeWorldBlock(centerX, groundY + 4, centerZ, BLOCK.TORCH, true);

    for (const farm of plan.farms) {
      for (let x = farm.minX; x <= farm.maxX; x += 1) {
        for (let z = farm.minZ; z <= farm.maxZ; z += 1) {
          const isWaterChannel = x === centerX;
          this.layVillageSurface(x, z, isWaterChannel ? BLOCK.WATER : BLOCK.GRASS, BLOCK.DIRT);
        }
      }
    }
  }
}

class World {
  constructor(seed) {
    this.seed = normalizeWorldSeed(seed, generateRandomWorldSeed());
    this.terrain = new TerrainGenerator(this.seed);
    this.chunks = new Map();
    this.savedChunkSnapshots = new Map();
    this.modifiedChunks = new Map();
    this.fluidStates = new Map();
    this.redstoneStates = new Map();
    this.redstoneDirty = new Set();
    this.redstoneScheduledTicks = new Map();
    this.redstoneTickCounter = 0;
    this.pendingBlockBroadcasts = new Map();
    this.activeWaterUpdates = new Set();
    this.activeLavaUpdates = new Set();
    this.savedPlayerState = null;
    this.savedSettings = null;
    this.saveDirty = false;
    this.loadedFromStorage = false;
  }

  getRedstoneStateAt(x, y, z) {
    return cloneRedstoneState(this.redstoneStates.get(packBlockPositionKey(x, y, z)) || null);
  }

  setRedstoneStateAt(x, y, z, blockType, nextState) {
    if (!usesRedstoneState(blockType) || !nextState || typeof nextState !== "object") {
      return false;
    }
    const key = packBlockPositionKey(x, y, z);
    const normalized = normalizeSerializedRedstoneState(blockType, nextState);
    if (!normalized) {
      return false;
    }
    const previous = this.redstoneStates.get(key);
    const candidate = { ...normalized, blockType };
    if (previous && JSON.stringify(previous) === JSON.stringify(candidate)) {
      return false;
    }
    this.redstoneStates.set(key, candidate);
    this.saveDirty = true;
    return true;
  }

  clearRedstoneStateAt(x, y, z) {
    const deleted = this.redstoneStates.delete(packBlockPositionKey(x, y, z));
    if (deleted) {
      this.saveDirty = true;
    }
    return deleted;
  }

  moveRedstoneState(fromX, fromY, fromZ, toX, toY, toZ) {
    const fromKey = packBlockPositionKey(fromX, fromY, fromZ);
    const toKey = packBlockPositionKey(toX, toY, toZ);
    const previous = this.redstoneStates.get(fromKey);
    this.redstoneStates.delete(toKey);
    if (!previous) {
      return false;
    }
    this.redstoneStates.set(toKey, { ...previous });
    this.redstoneStates.delete(fromKey);
    this.saveDirty = true;
    return true;
  }

  queueRedstoneDirtyAt(x, y, z) {
    this.redstoneDirty.add(packBlockPositionKey(x, y, z));
  }

  queueRedstoneDirtyAround(x, y, z) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          this.queueRedstoneDirtyAt(x + dx, y + dy, z + dz);
        }
      }
    }
    for (const offset of REDSTONE_NEIGHBOR_OFFSETS) {
      this.queueRedstoneDirtyAt(x + offset.x * 2, y + offset.y * 2, z + offset.z * 2);
    }
  }

  consumeQueuedRedstoneDirty(limit = REDSTONE_UPDATE_LIMIT_PER_STEP) {
    const result = [];
    for (const key of this.redstoneDirty) {
      result.push(key);
      this.redstoneDirty.delete(key);
      if (result.length >= limit) {
        break;
      }
    }
    return result;
  }

  advanceRedstoneTicks() {
    this.redstoneTickCounter += 1;
  }

  queueRedstoneTick(x, y, z, delaySteps = 1, reason = "generic") {
    const key = packBlockPositionKey(x, y, z);
    const ticketKey = `${key}:${reason}`;
    const nextDue = this.redstoneTickCounter + Math.max(1, Math.floor(delaySteps) || 1);
    const current = this.redstoneScheduledTicks.get(ticketKey);
    if (current && current.dueStep <= nextDue) {
      return;
    }
    this.redstoneScheduledTicks.set(ticketKey, {
      key,
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z),
      dueStep: nextDue,
      reason
    });
  }

  consumeDueRedstoneTicks(limit = REDSTONE_SCHEDULE_LIMIT_PER_STEP) {
    const due = [];
    for (const [ticketKey, entry] of this.redstoneScheduledTicks) {
      if (entry.dueStep > this.redstoneTickCounter) continue;
      this.redstoneScheduledTicks.delete(ticketKey);
      due.push(entry);
      if (due.length >= limit) {
        break;
      }
    }
    return due;
  }

  queuePendingBlockBroadcastAt(x, y, z, type = this.peekBlock(x, y, z)) {
    this.pendingBlockBroadcasts.set(packBlockPositionKey(x, y, z), {
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z),
      type: Number(type) || BLOCK.AIR
    });
  }

  consumePendingBlockBroadcasts(limit = 128) {
    const updates = [];
    for (const [key, entry] of this.pendingBlockBroadcasts) {
      this.pendingBlockBroadcasts.delete(key);
      updates.push(entry);
      if (updates.length >= limit) {
        break;
      }
    }
    return updates;
  }

  peekChunk(chunkX, chunkZ) {
    return this.chunks.get(packChunkKey(chunkX, chunkZ)) || null;
  }

  setChunkSnapshots(chunkSnapshots) {
    this.savedChunkSnapshots = chunkSnapshots instanceof Map ? new Map(chunkSnapshots) : new Map();
  }

  snapshotChunk(chunk) {
    if (!chunk) return;
    this.savedChunkSnapshots.set(packChunkKey(chunk.chunkX, chunk.chunkZ), new Uint8Array(chunk.blocks));
  }

  serializeChunkSnapshots() {
    for (const chunk of this.chunks.values()) {
      this.snapshotChunk(chunk);
    }
    return this.savedChunkSnapshots;
  }

  getChunk(chunkX, chunkZ) {
    const key = packChunkKey(chunkX, chunkZ);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(this, chunkX, chunkZ);
      this.chunks.set(key, chunk);
      const savedSnapshot = this.savedChunkSnapshots.get(key);
      if (savedSnapshot) {
        chunk.loadSnapshot(savedSnapshot);
        this.applyOverridesToChunk(chunk);
      } else {
        chunk.generate();
        this.snapshotChunk(chunk);
      }
      this.recalculateLightingRegion(chunkX, chunkZ, 1);
      this.queueFluidUpdatesForChunk(chunkX, chunkZ);
      this.queueFluidUpdatesForChunk(chunkX - 1, chunkZ);
      this.queueFluidUpdatesForChunk(chunkX + 1, chunkZ);
      this.queueFluidUpdatesForChunk(chunkX, chunkZ - 1);
      this.queueFluidUpdatesForChunk(chunkX, chunkZ + 1);
      this.markChunkAndNeighborsDirty(chunkX, chunkZ);
    }
    return chunk;
  }

  applyOverridesToChunk(chunk) {
    const bucket = this.modifiedChunks.get(packChunkKey(chunk.chunkX, chunk.chunkZ));
    if (!bucket) {
      return;
    }
    for (const [localKey, type] of bucket) {
      const coords = unpackLocalKey(localKey);
      chunk.setLocal(coords.x, coords.y, coords.z, type);
    }
  }

  markChunkDirty(chunkX, chunkZ) {
    const chunk = this.peekChunk(chunkX, chunkZ);
    if (chunk) {
      chunk.meshDirty = true;
    }
  }

  markChunkAndNeighborsDirty(chunkX, chunkZ) {
    this.markChunkDirty(chunkX, chunkZ);
    this.markChunkDirty(chunkX - 1, chunkZ);
    this.markChunkDirty(chunkX + 1, chunkZ);
    this.markChunkDirty(chunkX, chunkZ - 1);
    this.markChunkDirty(chunkX, chunkZ + 1);
  }

  markChunkAndTouchingNeighborsDirty(chunkX, chunkZ, localX, localZ) {
    this.markChunkDirty(chunkX, chunkZ);
    if (localX === 0) this.markChunkDirty(chunkX - 1, chunkZ);
    if (localX === CHUNK_SIZE - 1) this.markChunkDirty(chunkX + 1, chunkZ);
    if (localZ === 0) this.markChunkDirty(chunkX, chunkZ - 1);
    if (localZ === CHUNK_SIZE - 1) this.markChunkDirty(chunkX, chunkZ + 1);
  }

  recalculateLightingRegion(centerChunkX, centerChunkZ, radius = 1) {
    const chunks = [];
    const chunkKeys = new Set();

    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const chunkX = centerChunkX + dx;
        const chunkZ = centerChunkZ + dz;
        const chunk = this.peekChunk(chunkX, chunkZ);
        if (!chunk) continue;
        chunks.push(chunk);
        chunkKeys.add(packChunkKey(chunkX, chunkZ));
        chunk.skyLight.fill(0);
        chunk.blockLight.fill(0);
      }
    }
    if (chunks.length === 0) {
      return;
    }

    for (const chunk of chunks) {
      for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
        for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
          let light = LIGHT_LEVEL_MAX;
          for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
            const type = chunk.getLocal(lx, y, lz);
            if (blocksLightPropagation(type)) {
              light = 0;
              chunk.setSkyLightLocal(lx, y, lz, 0);
            } else {
              chunk.setSkyLightLocal(lx, y, lz, light);
            }
          }
        }
      }
    }

    const queue = [];
    let queueIndex = 0;
    const enqueue = (worldX, y, worldZ, level) => {
      if (level <= 0 || y < 0 || y >= WORLD_HEIGHT) {
        return;
      }
      const chunkX = Math.floor(worldX / CHUNK_SIZE);
      const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
      const key = packChunkKey(chunkX, chunkZ);
      if (!chunkKeys.has(key)) {
        return;
      }
      const chunk = this.peekChunk(chunkX, chunkZ);
      if (!chunk) {
        return;
      }
      const localX = mod(worldX, CHUNK_SIZE);
      const localZ = mod(worldZ, CHUNK_SIZE);
      const index = chunk.index(localX, y, localZ);
      if ((chunk.blockLight[index] || 0) >= level) {
        return;
      }
      chunk.blockLight[index] = clamp(level, 0, LIGHT_LEVEL_MAX);
      queue.push({ x: worldX, y, z: worldZ, level });
    };

    for (const chunk of chunks) {
      const baseX = chunk.chunkX * CHUNK_SIZE;
      const baseZ = chunk.chunkZ * CHUNK_SIZE;
      const maxY = clamp((chunk.meshMaxY || SEA_LEVEL) + 2, 1, WORLD_HEIGHT - 1);
      for (let y = 1; y <= maxY; y += 1) {
        for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
          for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
            const emission = getBlockLightEmission(chunk.getLocal(lx, y, lz));
            if (emission > 0) {
              enqueue(baseX + lx, y, baseZ + lz, emission);
            }
          }
        }
      }
    }

    while (queueIndex < queue.length) {
      const entry = queue[queueIndex++];
      if (entry.level <= 1) {
        continue;
      }
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1]
      ]) {
        const nx = entry.x + dx;
        const ny = entry.y + dy;
        const nz = entry.z + dz;
        if (ny < 0 || ny >= WORLD_HEIGHT) {
          continue;
        }
        if (blocksLightPropagation(this.peekBlock(nx, ny, nz))) {
          continue;
        }
        enqueue(nx, ny, nz, entry.level - 1);
      }
    }

    for (const chunk of chunks) {
      chunk.meshDirty = true;
    }
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) {
      return BLOCK.AIR;
    }
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = mod(x, CHUNK_SIZE);
    const localZ = mod(z, CHUNK_SIZE);
    return this.getChunk(chunkX, chunkZ).getLocal(localX, y, localZ);
  }

  peekBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) {
      return BLOCK.AIR;
    }
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const chunk = this.peekChunk(chunkX, chunkZ);
    if (!chunk) {
      return BLOCK.AIR;
    }
    return chunk.getLocal(mod(x, CHUNK_SIZE), y, mod(z, CHUNK_SIZE));
  }

  getSkyLightAt(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) {
      return 0;
    }
    const chunk = this.peekChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    if (!chunk) {
      return 0;
    }
    return chunk.getSkyLightLocal(mod(x, CHUNK_SIZE), y, mod(z, CHUNK_SIZE));
  }

  getBlockLightAt(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) {
      return 0;
    }
    const chunk = this.peekChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    if (!chunk) {
      return 0;
    }
    return chunk.getBlockLightLocal(mod(x, CHUNK_SIZE), y, mod(z, CHUNK_SIZE));
  }

  getCombinedLightAt(x, y, z) {
    return Math.max(this.getSkyLightAt(x, y, z), this.getBlockLightAt(x, y, z));
  }

  getFaceLightLevel(x, y, z, faceId) {
    const face = FACE_BY_ID[faceId];
    if (!face) {
      return LIGHT_LEVEL_MAX;
    }
    return this.getCombinedLightAt(x + face.offset.x, y + face.offset.y, z + face.offset.z);
  }

  getFaceLightScale(x, y, z, faceId) {
    return 0.22 + (this.getFaceLightLevel(x, y, z, faceId) / LIGHT_LEVEL_MAX) * 0.78;
  }

  getFluidUpdateSet(type) {
    return type === BLOCK.LAVA ? this.activeLavaUpdates : this.activeWaterUpdates;
  }

  getFluidMaxLevel(type) {
    return type === BLOCK.LAVA ? MAX_LAVA_FLOW_LEVEL : MAX_WATER_FLOW_LEVEL;
  }

  getFluidStateAt(x, y, z, peekOnly = false) {
    const type = peekOnly ? this.peekBlock(x, y, z) : this.getBlock(x, y, z);
    if (!isFluidBlock(type)) {
      return null;
    }
    const key = packBlockPositionKey(x, y, z);
    const stored = this.fluidStates.get(key);
    if (stored && stored.type === type) {
      return { ...stored, implicit: false };
    }
    return { type, level: 0, source: true, falling: false, implicit: true };
  }

  clearFluidStateAt(x, y, z) {
    const key = packBlockPositionKey(x, y, z);
    this.fluidStates.delete(key);
    this.activeWaterUpdates.delete(key);
    this.activeLavaUpdates.delete(key);
  }

  queueFluidUpdateAt(x, y, z, type = this.peekBlock(x, y, z)) {
    if (!isFluidBlock(type)) {
      return;
    }
    this.getFluidUpdateSet(type).add(packBlockPositionKey(x, y, z));
  }

  queueFluidUpdatesAround(x, y, z) {
    const checks = [
      [x, y, z],
      [x + 1, y, z],
      [x - 1, y, z],
      [x, y + 1, z],
      [x, y - 1, z],
      [x, y, z + 1],
      [x, y, z - 1]
    ];
    for (const [cx, cy, cz] of checks) {
      const type = this.peekBlock(cx, cy, cz);
      if (isFluidBlock(type)) {
        this.queueFluidUpdateAt(cx, cy, cz, type);
      }
    }
  }

  queueFluidUpdatesForChunk(chunkX, chunkZ) {
    const chunk = this.peekChunk(chunkX, chunkZ);
    if (!chunk) {
      return;
    }
    const minX = chunkX * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE;
    const minZ = chunkZ * CHUNK_SIZE;
    const maxZ = minZ + CHUNK_SIZE;
    for (const [key, state] of this.fluidStates) {
      const [x, y, z] = key.split("|").map(Number);
      if (x >= minX && x < maxX && z >= minZ && z < maxZ && y > 0 && y < WORLD_HEIGHT) {
        this.queueFluidUpdateAt(x, y, z, state.type);
      }
    }

    const maxY = clamp((chunk.meshMaxY || SEA_LEVEL) + 1, 1, WORLD_HEIGHT - 1);
    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
        for (let y = 1; y <= maxY; y += 1) {
          const type = chunk.getLocal(lx, y, lz);
          if (!isFluidBlock(type)) {
            continue;
          }
          const worldX = minX + lx;
          const worldZ = minZ + lz;
          const hasFlowOpening =
            this.peekBlock(worldX, y - 1, worldZ) === BLOCK.AIR ||
            this.peekBlock(worldX + 1, y, worldZ) === BLOCK.AIR ||
            this.peekBlock(worldX - 1, y, worldZ) === BLOCK.AIR ||
            this.peekBlock(worldX, y, worldZ + 1) === BLOCK.AIR ||
            this.peekBlock(worldX, y, worldZ - 1) === BLOCK.AIR;
          if (hasFlowOpening) {
            this.queueFluidUpdateAt(worldX, y, worldZ, type);
          }
        }
      }
    }
  }

  _writeBlockRaw(x, y, z, type) {
    if (y <= 0 || y >= WORLD_HEIGHT) {
      return false;
    }

    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = mod(x, CHUNK_SIZE);
    const localZ = mod(z, CHUNK_SIZE);
    const chunk = this.getChunk(chunkX, chunkZ);
    const current = chunk.getLocal(localX, y, localZ);
    if (current === type) {
      return false;
    }

    chunk.setLocal(localX, y, localZ, type);
    this.snapshotChunk(chunk);
    let bucket = this.modifiedChunks.get(packChunkKey(chunkX, chunkZ));
    if (!bucket) {
      bucket = new Map();
      this.modifiedChunks.set(packChunkKey(chunkX, chunkZ), bucket);
    }
    bucket.set(packLocalKey(localX, y, localZ), type);
    this.markChunkAndTouchingNeighborsDirty(chunkX, chunkZ, localX, localZ);
    return true;
  }

  canFluidFlowInto(x, y, z, type) {
    if (y <= 0 || y >= WORLD_HEIGHT) {
      return false;
    }
    const chunk = this.peekChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    if (!chunk) {
      return false;
    }
    const existing = this.peekBlock(x, y, z);
    return existing === BLOCK.AIR || existing === type;
  }

  setFluidBlock(x, y, z, type, level = 0, source = false, falling = false) {
    if (!isFluidBlock(type) || y <= 0 || y >= WORLD_HEIGHT) {
      return false;
    }
    const existing = this.peekBlock(x, y, z);
    if (existing !== BLOCK.AIR && existing !== type) {
      return false;
    }

    const key = packBlockPositionKey(x, y, z);
    const nextState = {
      type,
      level: clamp(Math.floor(level), 0, this.getFluidMaxLevel(type)),
      source: !!source,
      falling: !!falling
    };
    let changed = false;

    if (existing !== type) {
      changed = this._writeBlockRaw(x, y, z, type) || changed;
    }

    const prevState = this.fluidStates.get(key);
    if (
      !prevState ||
      prevState.type !== nextState.type ||
      prevState.level !== nextState.level ||
      !!prevState.source !== nextState.source ||
      !!prevState.falling !== nextState.falling
    ) {
      this.fluidStates.set(key, nextState);
      changed = true;
    }

    if (changed) {
      this.queueFluidUpdatesAround(x, y, z);
      this.resolveFluidInteractionsAround(x, y, z);
      if (getBlockLightEmission(type) > 0) {
        this.recalculateLightingRegion(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), 1);
      }
      this.saveDirty = true;
    }
    return changed;
  }

  removeDynamicFluidAt(x, y, z, type = this.peekBlock(x, y, z)) {
    if (!isFluidBlock(type)) {
      return false;
    }
    const key = packBlockPositionKey(x, y, z);
    let changed = false;
    if (this.peekBlock(x, y, z) === type) {
      changed = this._writeBlockRaw(x, y, z, BLOCK.AIR) || changed;
    }
    if (this.fluidStates.delete(key)) {
      changed = true;
    }
    this.activeWaterUpdates.delete(key);
    this.activeLavaUpdates.delete(key);
    if (changed) {
      this.queueFluidUpdatesAround(x, y, z);
      if (getBlockLightEmission(type) > 0) {
        this.recalculateLightingRegion(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), 1);
      }
      this.saveDirty = true;
    }
    return changed;
  }

  updateFluidCell(x, y, z, type) {
    if (!isFluidBlock(type)) {
      return false;
    }
    if (this.peekBlock(x, y, z) !== type) {
      this.clearFluidStateAt(x, y, z);
      return false;
    }

    const state = this.getFluidStateAt(x, y, z, true);
    if (!state) {
      return false;
    }

    const maxLevel = this.getFluidMaxLevel(type);
    const implicitSource = !!state.implicit;
    const wasSource = !!state.source || implicitSource;
    const aboveType = this.peekBlock(x, y + 1, z);
    const belowType = this.peekBlock(x, y - 1, z);

    let nextLevel = 0;
    let nextSource = wasSource;
    let nextFalling = false;

    if (!wasSource) {
      if (aboveType === type) {
        nextLevel = 0;
        nextFalling = this.canFluidFlowInto(x, y - 1, z, type) && this.peekBlock(x, y - 1, z) === BLOCK.AIR;
      } else {
        let adjacentSources = 0;
        let bestLevel = Number.POSITIVE_INFINITY;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (this.peekBlock(x + dx, y, z + dz) !== type) continue;
          const neighborState = this.getFluidStateAt(x + dx, y, z + dz, true);
          if (!neighborState) continue;
          if (neighborState.source || neighborState.implicit) {
            adjacentSources += 1;
          }
          bestLevel = Math.min(bestLevel, (neighborState.level || 0) + 1);
        }

        const canBecomeSource =
          type === BLOCK.WATER &&
          belowType !== BLOCK.AIR &&
          belowType !== BLOCK.LAVA &&
          adjacentSources >= 2;

        if (canBecomeSource) {
          nextSource = true;
          nextLevel = 0;
        } else if (Number.isFinite(bestLevel) && bestLevel <= maxLevel) {
          nextLevel = bestLevel;
        } else {
          return this.removeDynamicFluidAt(x, y, z, type);
        }
      }
    }

    if (implicitSource) {
      this.fluidStates.delete(packBlockPositionKey(x, y, z));
    } else {
      this.fluidStates.set(packBlockPositionKey(x, y, z), {
        type,
        level: clamp(nextLevel, 0, maxLevel),
        source: !!nextSource,
        falling: !!nextFalling
      });
    }

    let changed = false;
    if (this.canFluidFlowInto(x, y - 1, z, type) && this.peekBlock(x, y - 1, z) === BLOCK.AIR) {
      changed = this.setFluidBlock(x, y - 1, z, type, 0, false, true) || changed;
    } else if (!nextFalling && nextLevel < maxLevel) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        const neighborType = this.peekBlock(nx, y, nz);
        if (neighborType === BLOCK.AIR) {
          changed = this.setFluidBlock(nx, y, nz, type, nextLevel + 1, false, false) || changed;
        } else if (neighborType === type) {
          const neighborState = this.getFluidStateAt(nx, y, nz, true);
          if (
            neighborState &&
            !neighborState.source &&
            !neighborState.implicit &&
            (((neighborState.level || 0) > nextLevel + 1) || neighborState.falling)
          ) {
            changed = this.setFluidBlock(nx, y, nz, type, nextLevel + 1, false, false) || changed;
          }
        }
      }
    }

    this.resolveFluidInteractionsAround(x, y, z);
    return changed;
  }

  stepFluidSimulation(type, limit = 16) {
    const queue = this.getFluidUpdateSet(type);
    if (!queue || queue.size === 0 || limit <= 0) {
      return false;
    }
    let processed = 0;
    for (const key of Array.from(queue)) {
      if (processed >= limit) {
        break;
      }
      queue.delete(key);
      const [x, y, z] = key.split("|").map(Number);
      if (!this.peekChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))) {
        queue.add(key);
        continue;
      }
      if (this.peekBlock(x, y, z) !== type) {
        if (!isFluidBlock(this.peekBlock(x, y, z))) {
          this.clearFluidStateAt(x, y, z);
        }
        continue;
      }
      this.updateFluidCell(x, y, z, type);
      processed += 1;
    }
    return processed > 0;
  }

  resolveFluidInteractionAt(x, y, z) {
    const type = this.peekBlock(x, y, z);
    if (!isFluidBlock(type)) {
      return false;
    }

    const horizontalNeighbors = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1]
    ];

    if (type === BLOCK.WATER) {
      if (this.peekBlock(x, y - 1, z) === BLOCK.LAVA) {
        return this.setBlock(x, y - 1, z, BLOCK.OBSIDIAN);
      }
      for (const [dx, dy, dz] of horizontalNeighbors) {
        if (this.peekBlock(x + dx, y + dy, z + dz) === BLOCK.LAVA) {
          return this.setBlock(x + dx, y + dy, z + dz, BLOCK.COBBLESTONE);
        }
      }
      return false;
    }

    if (this.peekBlock(x, y + 1, z) === BLOCK.WATER || this.peekBlock(x, y - 1, z) === BLOCK.WATER) {
      return this.setBlock(x, y, z, BLOCK.OBSIDIAN);
    }
    for (const [dx, dy, dz] of horizontalNeighbors) {
      if (this.peekBlock(x + dx, y + dy, z + dz) === BLOCK.WATER) {
        return this.setBlock(x, y, z, BLOCK.COBBLESTONE);
      }
    }
    return false;
  }

  resolveFluidInteractionsAround(x, y, z) {
    const checks = [
      [x, y, z],
      [x + 1, y, z],
      [x - 1, y, z],
      [x, y + 1, z],
      [x, y - 1, z],
      [x, y, z + 1],
      [x, y, z - 1]
    ];
    for (const [cx, cy, cz] of checks) {
      this.resolveFluidInteractionAt(cx, cy, cz);
    }
  }

  setBlock(x, y, z, type) {
    const previous = this.peekBlock(x, y, z);
    if (!this._writeBlockRaw(x, y, z, type)) {
      return false;
    }

    if (isFluidBlock(type)) {
      this.fluidStates.set(packBlockPositionKey(x, y, z), {
        type,
        level: 0,
        source: true,
        falling: false
      });
    } else {
      this.clearFluidStateAt(x, y, z);
    }
    if (previous !== type) {
      if (!usesRedstoneState(type) || previous !== type) {
        this.clearRedstoneStateAt(x, y, z);
      }
      if (isRedstoneRelevantBlock(previous) || isRedstoneRelevantBlock(type)) {
        this.queueRedstoneDirtyAround(x, y, z);
      }
    }
    this.queueFluidUpdatesAround(x, y, z);
    this.resolveFluidInteractionsAround(x, y, z);
    this.recalculateLightingRegion(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), 1);
    this.queuePendingBlockBroadcastAt(x, y, z, type);
    this.saveDirty = true;
    return true;
  }

  buildChunkMesh(chunkX, chunkZ) {
    const chunk = this.getChunk(chunkX, chunkZ);
    const faces = [];
    const worldBaseX = chunkX * CHUNK_SIZE;
    const worldBaseZ = chunkZ * CHUNK_SIZE;
    const maxY = clamp((chunk.meshMaxY || 0) + 1, 1, WORLD_HEIGHT - 1);

    for (let y = 0; y <= maxY; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          const type = chunk.getLocal(x, y, z);
          if (!isSolidForMeshing(type)) {
            continue;
          }

          const worldX = worldBaseX + x;
          const worldZ = worldBaseZ + z;

          for (const face of FACE_DEFS) {
            if (isFluidBlock(type) && face.id === "bottom") {
              continue;
            }
            const neighborType = this.peekBlock(
              worldX + face.offset.x,
              y + face.offset.y,
              worldZ + face.offset.z
            );
            if (shouldRenderFace(type, neighborType)) {
              const lightLevel = this.getFaceLightLevel(worldX, y, worldZ, face.id);
              faces.push({
                x: worldX,
                y,
                z: worldZ,
                type,
                faceId: face.id,
                lightLevel
              });
            }
          }
        }
      }
    }

    chunk.mesh = faces;
    chunk.meshDirty = false;
    return faces;
  }

  getChunkMesh(chunkX, chunkZ) {
    const chunk = this.getChunk(chunkX, chunkZ);
    if (chunk.meshDirty) {
      return this.buildChunkMesh(chunkX, chunkZ);
    }
    return chunk.mesh;
  }

  getModifiedBlockCount() {
    let count = 0;
    for (const bucket of this.modifiedChunks.values()) {
      count += bucket.size;
    }
    return count;
  }

  unloadFarChunks(playerChunkX, playerChunkZ, keepRadius) {
    for (const [chunkKey, chunk] of this.chunks) {
      const distance = Math.max(Math.abs(chunk.chunkX - playerChunkX), Math.abs(chunk.chunkZ - playerChunkZ));
      if (distance > keepRadius) {
        this.snapshotChunk(chunk);
        this.chunks.delete(chunkKey);
      }
    }
  }

  findSpawn(startX = 0, startZ = 0) {
    for (let radius = 0; radius <= 16; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          const worldX = startX + dx;
          const worldZ = startZ + dz;
          const column = this.terrain.describeColumn(worldX, worldZ);
          if (column.height > SEA_LEVEL) {
            return {
              x: worldX + 0.5,
              y: column.height + 1.001,
              z: worldZ + 0.5
            };
          }
        }
      }
    }

    return { x: 0.5, y: SEA_LEVEL + 2, z: 0.5 };
  }

  getNearbyDungeonSpawners(x, z, radius = 112) {
    return getNearbyDungeonAnchors(x, z, this.seed, radius)
      .map((anchor) => getDungeonPlacementForAnchor(this.terrain, anchor))
      .filter(Boolean);
  }

  raycast(origin, direction, maxDistance = MAX_REACH) {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0) {
      return null;
    }

    const dx = direction.x / length;
    const dy = direction.y / length;
    const dz = direction.z / length;

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dx >= 0 ? 1 : -1;
    const stepY = dy >= 0 ? 1 : -1;
    const stepZ = dz >= 0 ? 1 : -1;

    const tDeltaX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
    const tDeltaY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
    const tDeltaZ = dz === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dz);

    let tMaxX =
      dx === 0
        ? Number.POSITIVE_INFINITY
        : ((dx > 0 ? x + 1 - origin.x : origin.x - x) || 0) * tDeltaX;
    let tMaxY =
      dy === 0
        ? Number.POSITIVE_INFINITY
        : ((dy > 0 ? y + 1 - origin.y : origin.y - y) || 0) * tDeltaY;
    let tMaxZ =
      dz === 0
        ? Number.POSITIVE_INFINITY
        : ((dz > 0 ? z + 1 - origin.z : origin.z - z) || 0) * tDeltaZ;

    let faceNormal = { x: 0, y: 0, z: 0 };
    let traveled = 0;

    while (traveled <= maxDistance) {
      const blockType = this.peekBlock(x, y, z);
      if (blockType !== BLOCK.AIR && !isFluidBlock(blockType) && traveled > 0) {
        return {
          x,
          y,
          z,
          type: blockType,
          normal: faceNormal,
          place: {
            x: x + faceNormal.x,
            y: y + faceNormal.y,
            z: z + faceNormal.z
          },
          distance: traveled
        };
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        traveled = tMaxX;
        tMaxX += tDeltaX;
        faceNormal = { x: -stepX, y: 0, z: 0 };
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        traveled = tMaxY;
        tMaxY += tDeltaY;
        faceNormal = { x: 0, y: -stepY, z: 0 };
      } else {
        z += stepZ;
        traveled = tMaxZ;
        tMaxZ += tDeltaZ;
        faceNormal = { x: 0, y: 0, z: -stepZ };
      }
    }

    return null;
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") {
        return;
      }

      if (data.modifiedChunks && typeof data.modifiedChunks === "object") {
        for (const [chunkKey, entries] of Object.entries(data.modifiedChunks)) {
          const bucket = new Map();
          for (const [localKey, type] of Object.entries(entries)) {
            bucket.set(localKey, Number(type));
          }
          if (bucket.size > 0) {
            this.modifiedChunks.set(chunkKey, bucket);
          }
        }
      }

      this.savedPlayerState = data.player || null;
      this.savedSettings = data.settings || null;
      this.loadedFromStorage = true;
    } catch (error) {
      console.warn("FreeCube2 storage load failed:", error.message);
    }
  }

  saveToStorage(playerState, settingsState) {
    try {
      const modifiedChunks = {};
      for (const [chunkKey, bucket] of this.modifiedChunks) {
        if (bucket.size === 0) {
          continue;
        }
        modifiedChunks[chunkKey] = {};
        for (const [localKey, type] of bucket) {
          modifiedChunks[chunkKey][localKey] = type;
        }
      }

      const payload = {
        version: GAME_VERSION,
        seed: this.seed,
        modifiedChunks,
        player: playerState,
        settings: settingsState
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      this.saveDirty = false;
      return true;
    } catch (error) {
      console.warn("FreeCube2 storage save failed:", error.message);
      return false;
    }
  }
}

  return { World, TerrainGenerator, Chunk };
}
