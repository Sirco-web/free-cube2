const GAME_VERSION = "4.8.1";
const STORAGE_KEY = "freecube2-static-save-v5";
const WORLD_SEED = 124578;
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 112;
const SEA_LEVEL = 30;
const PLAYER_HEIGHT = 1.8;
const PLAYER_EYE_HEIGHT = 1.62;
const PLAYER_RADIUS = 0.32;
const MAX_REACH = 6;
const DEFAULT_RENDER_DISTANCE = 3;
const DEFAULT_SETTINGS = {
  renderDistanceChunks: DEFAULT_RENDER_DISTANCE,
  mouseSensitivity: 0.0026,
  invertY: false,
  gameMode: "survival", // "survival" | "creative"
  fovDegrees: 70,
  showFps: true,
  viewBobbing: true,
  texturePack: "gigantopack32",
  mobModels: true
};

const LOADING_CHUNK_GEN_LIMIT = 4;
const LOADING_CHUNK_MESH_LIMIT = 3;
const LOADING_CHUNK_MESH_BUDGET_MS = 5;
const PLAY_CHUNK_GEN_LIMIT = 1;
const PLAY_CHUNK_MESH_LIMIT = 1;
const PLAY_CHUNK_MESH_BUDGET_MS = 1.25;
const AUTOSAVE_INTERVAL_SECONDS = 8;

const GAME_MODE = {
  SURVIVAL: "survival",
  CREATIVE: "creative"
};

const WORLDS_INDEX_KEY = "freecube2-worlds-index-v1";
const WORLD_SAVE_PREFIX = "freecube2-world-save-v1:";
const LEGACY_SAVE_KEYS = [
  "freecube2-static-save-v4",
  "freecube2-static-save-v5"
];

function generateId() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.floor(Math.random() * 1e16).toString(16);
}

function generateRandomWorldSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return Number(value[0] % 2147483647) || 1;
  }
  return Math.floor(Math.random() * 2147483646) + 1;
}

function normalizeWorldSeed(value, fallback = generateRandomWorldSeed()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }

  if (/^-?\d+$/.test(raw)) {
    const parsed = Number(raw);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || fallback;
}

function serializeModifiedChunks(modifiedChunks) {
  const result = {};
  for (const [chunkKey, bucket] of modifiedChunks) {
    if (!bucket || bucket.size === 0) {
      continue;
    }
    const entries = {};
    for (const [localKey, type] of bucket) {
      entries[localKey] = type;
    }
    result[chunkKey] = entries;
  }
  return result;
}

function deserializeModifiedChunks(obj) {
  const result = new Map();
  if (!obj || typeof obj !== "object") {
    return result;
  }
  for (const [chunkKey, entries] of Object.entries(obj)) {
    if (!entries || typeof entries !== "object") {
      continue;
    }
    const bucket = new Map();
    for (const [localKey, type] of Object.entries(entries)) {
      bucket.set(localKey, Number(type));
    }
    if (bucket.size > 0) {
      result.set(chunkKey, bucket);
    }
  }
  return result;
}

class WorldStore {
  constructor() {
    this.index = null;
  }

  loadIndex() {
    if (this.index) {
      return this.index;
    }
    try {
      const raw = localStorage.getItem(WORLDS_INDEX_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.worlds)) {
          this.index = parsed;
          return this.index;
        }
      }
    } catch (error) {
      console.warn("World index load failed:", error.message);
    }
    this.index = { version: 1, worlds: [], selectedWorldId: null };
    this.migrateLegacySave();
    this.saveIndex();
    return this.index;
  }

  saveIndex() {
    if (!this.index) {
      this.loadIndex();
    }
    try {
      localStorage.setItem(WORLDS_INDEX_KEY, JSON.stringify(this.index));
      return true;
    } catch (error) {
      console.warn("World index save failed:", error.message);
      return false;
    }
  }

  migrateLegacySave() {
    if (!this.index || this.index.worlds.length > 0) {
      return;
    }
    for (const key of LEGACY_SAVE_KEYS) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          continue;
        }
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") {
          continue;
        }
        const seed = normalizeWorldSeed(data.seed, generateRandomWorldSeed());
        const name = "Migrated World";
        const worldId = this.createWorld({ name, seed, select: true });
        this.saveWorld(worldId, {
          seed,
          modifiedChunks: data.modifiedChunks || {},
          player: data.player || null,
          settings: data.settings || null
        });
        localStorage.removeItem(key);
        console.log("Migrated legacy save into world id", worldId);
        break;
      } catch (error) {
        console.warn("Legacy migration failed:", error.message);
      }
    }
  }

  listWorlds() {
    this.loadIndex();
    return [...this.index.worlds].sort((a, b) => (b.lastPlayedAt || b.updatedAt || 0) - (a.lastPlayedAt || a.updatedAt || 0));
  }

  getSelectedWorldId() {
    this.loadIndex();
    return this.index.selectedWorldId;
  }

  selectWorld(worldId) {
    this.loadIndex();
    this.index.selectedWorldId = worldId;
    this.saveIndex();
  }

  getWorldMeta(worldId) {
    this.loadIndex();
    return this.index.worlds.find((w) => w.id === worldId) || null;
  }

  createWorld({ name, seed, select = false } = {}) {
    this.loadIndex();
    const worldId = generateId();
    const now = Date.now();
    const meta = {
      id: worldId,
      name: (name || "New World").slice(0, 48),
      seed: normalizeWorldSeed(seed, generateRandomWorldSeed()),
      createdAt: now,
      updatedAt: now,
      lastPlayedAt: null
    };
    this.index.worlds.push(meta);
    if (select || !this.index.selectedWorldId) {
      this.index.selectedWorldId = worldId;
    }
    this.saveIndex();
    this.saveWorld(worldId, { seed: meta.seed, modifiedChunks: {}, player: null, settings: null });
    return worldId;
  }

  renameWorld(worldId, name) {
    const meta = this.getWorldMeta(worldId);
    if (!meta) {
      return false;
    }
    meta.name = String(name || "World").slice(0, 48);
    meta.updatedAt = Date.now();
    return this.saveIndex();
  }

  deleteWorld(worldId) {
    this.loadIndex();
    const before = this.index.worlds.length;
    this.index.worlds = this.index.worlds.filter((w) => w.id !== worldId);
    try {
      localStorage.removeItem(`${WORLD_SAVE_PREFIX}${worldId}`);
    } catch (error) {
      console.warn("World delete failed:", error.message);
    }
    if (this.index.selectedWorldId === worldId) {
      this.index.selectedWorldId = this.index.worlds[0]?.id || null;
    }
    this.saveIndex();
    return this.index.worlds.length !== before;
  }

  loadWorld(worldId) {
    try {
      const raw = localStorage.getItem(`${WORLD_SAVE_PREFIX}${worldId}`);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed;
    } catch (error) {
      console.warn("World load failed:", error.message);
      return null;
    }
  }

  saveWorld(worldId, payload) {
    try {
      localStorage.setItem(`${WORLD_SAVE_PREFIX}${worldId}`, JSON.stringify(payload));
      const meta = this.getWorldMeta(worldId);
      if (meta) {
        meta.updatedAt = Date.now();
        this.saveIndex();
      }
      return true;
    } catch (error) {
      console.warn("World save failed:", error.message);
      return false;
    }
  }

  markPlayed(worldId) {
    const meta = this.getWorldMeta(worldId);
    if (!meta) {
      return;
    }
    meta.lastPlayedAt = Date.now();
    meta.updatedAt = meta.lastPlayedAt;
    this.saveIndex();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

function rgb(r, g, b) {
  return [r, g, b];
}

function mixRgb(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t))
  ];
}

function scaleRgb(color, factor) {
  return [
    clamp(Math.round(color[0] * factor), 0, 255),
    clamp(Math.round(color[1] * factor), 0, 255),
    clamp(Math.round(color[2] * factor), 0, 255)
  ];
}

function rgba(color, alpha = 1) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function packChunkKey(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

function packLocalKey(x, y, z) {
  return `${x}|${y}|${z}`;
}

function unpackLocalKey(key) {
  const [x, y, z] = key.split("|").map(Number);
  return { x, y, z };
}

function serializeFurnaceStates(furnaces) {
  const result = {};
  for (const [key, state] of furnaces || []) {
    if (!state || typeof state !== "object") continue;
    result[key] = {
      inputType: Number(state.inputType) || 0,
      inputCount: Math.max(0, Math.floor(Number(state.inputCount) || 0)),
      fuelType: Number(state.fuelType) || 0,
      fuelCount: Math.max(0, Math.floor(Number(state.fuelCount) || 0)),
      outputType: Number(state.outputType) || 0,
      outputCount: Math.max(0, Math.floor(Number(state.outputCount) || 0)),
      burnTime: Math.max(0, Number(state.burnTime) || 0),
      burnTimeTotal: Math.max(0, Number(state.burnTimeTotal) || 0),
      cookTime: Math.max(0, Number(state.cookTime) || 0)
    };
  }
  return result;
}

function deserializeFurnaceStates(obj) {
  const result = new Map();
  if (!obj || typeof obj !== "object") {
    return result;
  }
  for (const [key, state] of Object.entries(obj)) {
    if (!state || typeof state !== "object") continue;
    result.set(key, {
      inputType: Number(state.inputType) || 0,
      inputCount: Math.max(0, Math.floor(Number(state.inputCount) || 0)),
      fuelType: Number(state.fuelType) || 0,
      fuelCount: Math.max(0, Math.floor(Number(state.fuelCount) || 0)),
      outputType: Number(state.outputType) || 0,
      outputCount: Math.max(0, Math.floor(Number(state.outputCount) || 0)),
      burnTime: Math.max(0, Number(state.burnTime) || 0),
      burnTimeTotal: Math.max(0, Number(state.burnTimeTotal) || 0),
      cookTime: Math.max(0, Number(state.cookTime) || 0)
    });
  }
  return result;
}

function hash4(x, y, z, seed) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 374761393);
  h = Math.imul(h ^ (y | 0), 668265263);
  h = Math.imul(h ^ (z | 0), 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function random2(x, z, seed) {
  return hash4(x, 0, z, seed) / 4294967295;
}

function random3(x, y, z, seed) {
  return hash4(x, y, z, seed) / 4294967295;
}

class PerlinNoise {
  constructor(seed = 12345) {
    this.seed = seed;
    this.p = this.buildPermutation(seed);
  }

  buildPermutation(seed) {
    const values = Array.from({ length: 256 }, (_, index) => index);
    for (let index = 255; index > 0; index -= 1) {
      seed = (seed * 16807) % 2147483647;
      const swapIndex = Math.floor((seed / 2147483647) * (index + 1));
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values.concat(values);
  }

  noise(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);

    const n00 = this.grad2d(xi, yi, xf, yf);
    const n10 = this.grad2d(xi + 1, yi, xf - 1, yf);
    const n01 = this.grad2d(xi, yi + 1, xf, yf - 1);
    const n11 = this.grad2d(xi + 1, yi + 1, xf - 1, yf - 1);

    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return nx0 + v * (nx1 - nx0);
  }

  grad2d(x, y, dx, dy) {
    const gradients = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    const hash = this.p[(this.p[x & 255] + y) & 255] & 3;
    const gradient = gradients[hash];
    return gradient[0] * dx + gradient[1] * dy;
  }
}

class FractalNoise {
  constructor(seed = 12345, octaves = 4, persistence = 0.5, lacunarity = 2) {
    this.baseNoise = new PerlinNoise(seed);
    this.octaves = octaves;
    this.persistence = persistence;
    this.lacunarity = lacunarity;
  }

  fractal(x, y) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let octave = 0; octave < this.octaves; octave += 1) {
      value += this.baseNoise.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }

    return value / maxValue;
  }
}

const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  WATER: 6,
  SAND: 7,
  PLANKS: 8,
  BRICK: 9,
  BEDROCK: 10,
  GLASS: 11,
  CRAFTING_TABLE: 12,
  FURNACE: 13
};

const ITEM = {
  STICK: 32,
  WOODEN_PICKAXE: 33,
  WOODEN_AXE: 34,
  WOODEN_SHOVEL: 35,
  WOODEN_SWORD: 36,
  LEATHER_HELMET: 40,
  LEATHER_CHESTPLATE: 41,
  LEATHER_LEGGINGS: 42,
  LEATHER_BOOTS: 43,
  IRON_HELMET: 44,
  IRON_CHESTPLATE: 45,
  IRON_LEGGINGS: 46,
  IRON_BOOTS: 47,
  RAW_CHICKEN: 48,
  COOKED_CHICKEN: 49,
  RAW_MUTTON: 50,
  COOKED_MUTTON: 51,
  ROTTEN_FLESH: 52
};

const BLOCK_BREAK_TIME = {
  [BLOCK.GRASS]: 0.45,
  [BLOCK.DIRT]: 0.5,
  [BLOCK.SAND]: 0.45,
  [BLOCK.STONE]: 1.4,
  [BLOCK.WOOD]: 1.05,
  [BLOCK.PLANKS]: 0.85,
  [BLOCK.CRAFTING_TABLE]: 0.95,
  [BLOCK.FURNACE]: 1.25,
  [BLOCK.LEAVES]: 0.2,
  [BLOCK.BRICK]: 1.9,
  [BLOCK.GLASS]: 0.28,
  [BLOCK.WATER]: Infinity,
  [BLOCK.BEDROCK]: Infinity
};

function getBreakTime(blockType) {
  const t = BLOCK_BREAK_TIME[blockType];
  return Number.isFinite(t) ? Math.max(0.08, t) : 0.8;
}

function getToolBreakMultiplier(itemType, blockType) {
  const tool = getItemToolType(itemType);
  if (!tool) {
    return 1;
  }
  if (tool === "shovel" && (blockType === BLOCK.DIRT || blockType === BLOCK.GRASS || blockType === BLOCK.SAND)) {
    return 2.4;
  }
  if (tool === "axe" && (blockType === BLOCK.WOOD || blockType === BLOCK.PLANKS || blockType === BLOCK.CRAFTING_TABLE)) {
    return 2.2;
  }
  if (tool === "pickaxe" && (blockType === BLOCK.STONE || blockType === BLOCK.BRICK || blockType === BLOCK.FURNACE)) {
    return 2.6;
  }
  if (tool === "sword" && blockType === BLOCK.LEAVES) {
    return 2;
  }
  return 1;
}

const BLOCK_INFO = {
  [BLOCK.AIR]: {
    name: "Air",
    collidable: false,
    transparent: true,
    alpha: 0,
    palette: { top: rgb(0, 0, 0), side: rgb(0, 0, 0), bottom: rgb(0, 0, 0) }
  },
  [BLOCK.GRASS]: {
    name: "Grass",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(115, 187, 76),
      side: rgb(102, 145, 74),
      bottom: rgb(120, 84, 57)
    }
  },
  [BLOCK.DIRT]: {
    name: "Dirt",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(131, 91, 62),
      side: rgb(121, 83, 57),
      bottom: rgb(108, 74, 50)
    }
  },
  [BLOCK.STONE]: {
    name: "Stone",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(140, 144, 151),
      side: rgb(124, 129, 137),
      bottom: rgb(100, 105, 113)
    }
  },
  [BLOCK.WOOD]: {
    name: "Log",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(151, 112, 67),
      side: rgb(118, 84, 48),
      bottom: rgb(98, 70, 40)
    }
  },
  [BLOCK.LEAVES]: {
    name: "Leaves",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(80, 147, 63),
      side: rgb(67, 125, 53),
      bottom: rgb(59, 110, 48)
    }
  },
  [BLOCK.WATER]: {
    name: "Water",
    collidable: false,
    transparent: true,
    alpha: 0.58,
    palette: {
      top: rgb(74, 145, 226),
      side: rgb(54, 120, 206),
      bottom: rgb(40, 99, 177)
    }
  },
  [BLOCK.SAND]: {
    name: "Sand",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(215, 204, 124),
      side: rgb(197, 185, 112),
      bottom: rgb(174, 162, 98)
    }
  },
  [BLOCK.PLANKS]: {
    name: "Planks",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(181, 140, 90),
      side: rgb(164, 126, 80),
      bottom: rgb(146, 111, 70)
    }
  },
  [BLOCK.BRICK]: {
    name: "Brick",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(164, 84, 70),
      side: rgb(150, 76, 62),
      bottom: rgb(129, 65, 52)
    }
  },
  [BLOCK.BEDROCK]: {
    name: "Bedrock",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(52, 52, 57),
      side: rgb(44, 44, 50),
      bottom: rgb(32, 32, 36)
    }
  },
  [BLOCK.GLASS]: {
    name: "Glass",
    collidable: true,
    transparent: true,
    alpha: 0.28,
    palette: {
      top: rgb(204, 236, 248),
      side: rgb(184, 220, 235),
      bottom: rgb(162, 204, 221)
    }
  },
  [BLOCK.CRAFTING_TABLE]: {
    name: "Crafting Table",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(120, 92, 62),
      side: rgb(126, 92, 59),
      bottom: rgb(115, 86, 55)
    }
  },
  [BLOCK.FURNACE]: {
    name: "Furnace",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(132, 132, 138),
      side: rgb(114, 114, 120),
      bottom: rgb(96, 96, 104)
    }
  }
};

const BLOCK_TEXTURE_PATHS = {
  [BLOCK.GRASS]: {
    top: "PNG/Tiles/grass_top.png",
    side: "PNG/Tiles/dirt_grass.png",
    bottom: "PNG/Tiles/dirt.png"
  },
  [BLOCK.DIRT]: {
    top: "PNG/Tiles/dirt.png",
    side: "PNG/Tiles/dirt.png",
    bottom: "PNG/Tiles/dirt.png"
  },
  [BLOCK.STONE]: {
    top: "PNG/Tiles/stone.png",
    side: "PNG/Tiles/stone.png",
    bottom: "PNG/Tiles/stone.png"
  },
  [BLOCK.WOOD]: {
    top: "PNG/Tiles/trunk_top.png",
    side: "PNG/Tiles/trunk_side.png",
    bottom: "PNG/Tiles/trunk_top.png"
  },
  [BLOCK.LEAVES]: {
    top: "PNG/Tiles/leaves.png",
    side: "PNG/Tiles/leaves.png",
    bottom: "PNG/Tiles/leaves.png"
  },
  [BLOCK.WATER]: {
    top: "PNG/Tiles/water.png",
    side: "PNG/Tiles/water.png",
    bottom: "PNG/Tiles/water.png"
  },
  [BLOCK.SAND]: {
    top: "PNG/Tiles/sand.png",
    side: "PNG/Tiles/sand.png",
    bottom: "PNG/Tiles/sand.png"
  },
  [BLOCK.PLANKS]: {
    top: "PNG/Tiles/wood.png",
    side: "PNG/Tiles/wood.png",
    bottom: "PNG/Tiles/wood.png"
  },
  [BLOCK.BRICK]: {
    top: "PNG/Tiles/brick_red.png",
    side: "PNG/Tiles/brick_red.png",
    bottom: "PNG/Tiles/brick_red.png"
  },
  [BLOCK.BEDROCK]: {
    top: "PNG/Tiles/greystone.png",
    side: "PNG/Tiles/greystone.png",
    bottom: "PNG/Tiles/greystone.png"
  },
  [BLOCK.GLASS]: {
    top: "PNG/Tiles/glass.png",
    side: "PNG/Tiles/glass.png",
    bottom: "PNG/Tiles/glass.png"
  },
  [BLOCK.CRAFTING_TABLE]: {
    top: "PNG/Tiles/table.png",
    side: "PNG/Tiles/table.png",
    bottom: "PNG/Tiles/table.png"
  },
  [BLOCK.FURNACE]: {
    top: "PNG/Tiles/oven.png",
    side: "PNG/Tiles/oven.png",
    bottom: "PNG/Tiles/oven.png"
  }
};

const TEXTURE_PACKS = {
  default: {},
  gigantopack32: {
    [BLOCK.GRASS]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/grass_top (13).png",
      side: "PNG/Tiles/dirt_grass.png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/dirt4.png"
    },
    [BLOCK.DIRT]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/dirt4.png",
      side: "32px Seamless MC Texture Gigantopack/all textures/dirt4.png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/dirt4.png"
    },
    [BLOCK.STONE]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/stone (45).png",
      side: "32px Seamless MC Texture Gigantopack/all textures/stone (45).png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/stone (45).png"
    },
    [BLOCK.WOOD]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/log_oak_top (45).png",
      side: "32px Seamless MC Texture Gigantopack/all textures/log_oak (46).png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/log_oak_top (45).png"
    },
    [BLOCK.LEAVES]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/leaves_oak_opaque.png",
      side: "32px Seamless MC Texture Gigantopack/all textures/leaves_oak_opaque.png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/leaves_oak_opaque.png"
    },
    [BLOCK.WATER]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/water_still (12).png",
      side: "32px Seamless MC Texture Gigantopack/all textures/water_still (12).png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/water_still (12).png"
    },
    [BLOCK.SAND]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/sand (7).png",
      side: "32px Seamless MC Texture Gigantopack/all textures/sand (7).png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/sand (7).png"
    },
    [BLOCK.PLANKS]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/planks_oak (35).png",
      side: "32px Seamless MC Texture Gigantopack/all textures/planks_oak (35).png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/planks_oak (35).png"
    },
    [BLOCK.BRICK]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/brick.png",
      side: "32px Seamless MC Texture Gigantopack/all textures/brick.png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/brick.png"
    },
    [BLOCK.BEDROCK]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/bedrock.png",
      side: "32px Seamless MC Texture Gigantopack/all textures/bedrock.png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/bedrock.png"
    },
    [BLOCK.GLASS]: {
      top: "32px Seamless MC Texture Gigantopack/all textures/glass_light_blue.png",
      side: "32px Seamless MC Texture Gigantopack/all textures/glass_light_blue.png",
      bottom: "32px Seamless MC Texture Gigantopack/all textures/glass_light_blue.png"
    },
    [BLOCK.CRAFTING_TABLE]: {
      top: "PNG/Tiles/table.png",
      side: "PNG/Tiles/table.png",
      bottom: "PNG/Tiles/table.png"
    },
    [BLOCK.FURNACE]: {
      top: "PNG/Tiles/oven.png",
      side: "PNG/Tiles/oven.png",
      bottom: "PNG/Tiles/oven.png"
    }
  }
};

const RESOURCE_PACK_META = {
  default: {
    name: "Default",
    description: "The default look and feel of FreeCube.",
    iconBlock: BLOCK.GRASS
  },
  gigantopack32: {
    name: "Gigantopack 32",
    description: "Sharper 32px textures for a cleaner, richer block look.",
    iconBlock: BLOCK.STONE
  }
};

const ARMOR_SLOT_KEYS = ["head", "chest", "legs", "feet"];
const ARMOR_SLOT_LABELS = ["Helmet", "Chestplate", "Leggings", "Boots"];

function svgDataUrl(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const ITEM_TEXTURE_SOURCES = {
  [ITEM.STICK]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="8" y="1" width="2" height="3" fill="#8b5a2b"/>
      <rect x="7" y="4" width="2" height="3" fill="#9f6a34"/>
      <rect x="6" y="7" width="2" height="3" fill="#a96f3a"/>
      <rect x="5" y="10" width="2" height="3" fill="#9f6a34"/>
      <rect x="4" y="13" width="2" height="2" fill="#8b5a2b"/>
    </svg>
  `),
  [ITEM.WOODEN_PICKAXE]: "PNG/Items/pick_bronze.png",
  [ITEM.WOODEN_AXE]: "PNG/Items/axe_bronze.png",
  [ITEM.WOODEN_SHOVEL]: "PNG/Items/shovel_bronze.png",
  [ITEM.WOODEN_SWORD]: "PNG/Items/sword_bronze.png",
  [ITEM.LEATHER_HELMET]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="3" width="10" height="2" fill="#7a4c2a"/>
      <rect x="2" y="5" width="12" height="5" fill="#8c5b33"/>
      <rect x="2" y="10" width="3" height="2" fill="#7a4c2a"/>
      <rect x="11" y="10" width="3" height="2" fill="#7a4c2a"/>
    </svg>
  `),
  [ITEM.LEATHER_CHESTPLATE]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="2" width="3" height="3" fill="#7a4c2a"/>
      <rect x="10" y="2" width="3" height="3" fill="#7a4c2a"/>
      <rect x="4" y="4" width="8" height="8" fill="#8c5b33"/>
      <rect x="5" y="12" width="2" height="3" fill="#7a4c2a"/>
      <rect x="9" y="12" width="2" height="3" fill="#7a4c2a"/>
    </svg>
  `),
  [ITEM.LEATHER_LEGGINGS]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="2" width="10" height="3" fill="#7a4c2a"/>
      <rect x="4" y="5" width="8" height="4" fill="#8c5b33"/>
      <rect x="4" y="9" width="3" height="6" fill="#7a4c2a"/>
      <rect x="9" y="9" width="3" height="6" fill="#7a4c2a"/>
    </svg>
  `),
  [ITEM.LEATHER_BOOTS]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="4" width="4" height="8" fill="#8c5b33"/>
      <rect x="9" y="4" width="4" height="8" fill="#8c5b33"/>
      <rect x="2" y="12" width="6" height="2" fill="#7a4c2a"/>
      <rect x="8" y="12" width="6" height="2" fill="#7a4c2a"/>
    </svg>
  `),
  [ITEM.IRON_HELMET]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="3" width="10" height="2" fill="#dfe5ec"/>
      <rect x="2" y="5" width="12" height="5" fill="#c7ced8"/>
      <rect x="2" y="10" width="3" height="2" fill="#9da9b8"/>
      <rect x="11" y="10" width="3" height="2" fill="#9da9b8"/>
    </svg>
  `),
  [ITEM.IRON_CHESTPLATE]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="2" width="3" height="3" fill="#dfe5ec"/>
      <rect x="10" y="2" width="3" height="3" fill="#dfe5ec"/>
      <rect x="4" y="4" width="8" height="8" fill="#c7ced8"/>
      <rect x="5" y="12" width="2" height="3" fill="#9da9b8"/>
      <rect x="9" y="12" width="2" height="3" fill="#9da9b8"/>
    </svg>
  `),
  [ITEM.IRON_LEGGINGS]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="2" width="10" height="3" fill="#dfe5ec"/>
      <rect x="4" y="5" width="8" height="4" fill="#c7ced8"/>
      <rect x="4" y="9" width="3" height="6" fill="#9da9b8"/>
      <rect x="9" y="9" width="3" height="6" fill="#9da9b8"/>
    </svg>
  `),
  [ITEM.IRON_BOOTS]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="4" width="4" height="8" fill="#c7ced8"/>
      <rect x="9" y="4" width="4" height="8" fill="#c7ced8"/>
      <rect x="2" y="12" width="6" height="2" fill="#9da9b8"/>
      <rect x="8" y="12" width="6" height="2" fill="#9da9b8"/>
    </svg>
  `),
  [ITEM.RAW_CHICKEN]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="5" y="2" width="6" height="9" rx="1" fill="#f2cfb9"/>
      <rect x="4" y="4" width="8" height="7" fill="#f6d9c5"/>
      <rect x="6" y="10" width="1" height="4" fill="#f7efe9"/>
      <rect x="9" y="10" width="1" height="4" fill="#f7efe9"/>
      <rect x="5" y="14" width="3" height="1" fill="#d9d0c6"/>
      <rect x="8" y="14" width="3" height="1" fill="#d9d0c6"/>
    </svg>
  `),
  [ITEM.COOKED_CHICKEN]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="5" y="2" width="6" height="9" rx="1" fill="#9a4d1f"/>
      <rect x="4" y="4" width="8" height="7" fill="#b45e27"/>
      <rect x="6" y="10" width="1" height="4" fill="#f4eadf"/>
      <rect x="9" y="10" width="1" height="4" fill="#f4eadf"/>
      <rect x="5" y="14" width="3" height="1" fill="#cec5bb"/>
      <rect x="8" y="14" width="3" height="1" fill="#cec5bb"/>
    </svg>
  `),
  [ITEM.RAW_MUTTON]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="4" width="10" height="8" fill="#d86e7c"/>
      <rect x="4" y="5" width="8" height="6" fill="#ef8b99"/>
      <rect x="11" y="6" width="2" height="2" fill="#f7e7d9"/>
      <rect x="11" y="8" width="2" height="2" fill="#f7e7d9"/>
    </svg>
  `),
  [ITEM.COOKED_MUTTON]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="4" width="10" height="8" fill="#8d4a24"/>
      <rect x="4" y="5" width="8" height="6" fill="#ac6132"/>
      <rect x="11" y="6" width="2" height="2" fill="#f5e8dd"/>
      <rect x="11" y="8" width="2" height="2" fill="#f5e8dd"/>
    </svg>
  `),
  [ITEM.ROTTEN_FLESH]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="3" y="4" width="10" height="8" fill="#5c7052"/>
      <rect x="4" y="5" width="8" height="6" fill="#749266"/>
      <rect x="5" y="6" width="2" height="2" fill="#b96d66"/>
      <rect x="9" y="8" width="2" height="2" fill="#b96d66"/>
    </svg>
  `)
};

const ITEM_INFO = {
  [ITEM.STICK]: { name: "Stick", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.STICK] },
  [ITEM.WOODEN_PICKAXE]: { name: "Wooden Pickaxe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.WOODEN_PICKAXE], tool: "pickaxe" },
  [ITEM.WOODEN_AXE]: { name: "Wooden Axe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.WOODEN_AXE], tool: "axe" },
  [ITEM.WOODEN_SHOVEL]: { name: "Wooden Shovel", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.WOODEN_SHOVEL], tool: "shovel" },
  [ITEM.WOODEN_SWORD]: { name: "Wooden Sword", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.WOODEN_SWORD], tool: "sword" },
  [ITEM.LEATHER_HELMET]: { name: "Leather Helmet", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.LEATHER_HELMET], armorSlot: "head", armor: 1 },
  [ITEM.LEATHER_CHESTPLATE]: { name: "Leather Chestplate", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.LEATHER_CHESTPLATE], armorSlot: "chest", armor: 3 },
  [ITEM.LEATHER_LEGGINGS]: { name: "Leather Leggings", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.LEATHER_LEGGINGS], armorSlot: "legs", armor: 2 },
  [ITEM.LEATHER_BOOTS]: { name: "Leather Boots", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.LEATHER_BOOTS], armorSlot: "feet", armor: 1 },
  [ITEM.IRON_HELMET]: { name: "Iron Helmet", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_HELMET], armorSlot: "head", armor: 2 },
  [ITEM.IRON_CHESTPLATE]: { name: "Iron Chestplate", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_CHESTPLATE], armorSlot: "chest", armor: 6 },
  [ITEM.IRON_LEGGINGS]: { name: "Iron Leggings", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_LEGGINGS], armorSlot: "legs", armor: 5 },
  [ITEM.IRON_BOOTS]: { name: "Iron Boots", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_BOOTS], armorSlot: "feet", armor: 2 },
  [ITEM.RAW_CHICKEN]: { name: "Raw Chicken", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.RAW_CHICKEN], food: 2 },
  [ITEM.COOKED_CHICKEN]: { name: "Cooked Chicken", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.COOKED_CHICKEN], food: 6 },
  [ITEM.RAW_MUTTON]: { name: "Raw Mutton", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.RAW_MUTTON], food: 2 },
  [ITEM.COOKED_MUTTON]: { name: "Cooked Mutton", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.COOKED_MUTTON], food: 6 },
  [ITEM.ROTTEN_FLESH]: { name: "Rotten Flesh", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.ROTTEN_FLESH], food: 4 }
};

function getAllItemTexturePaths() {
  return Object.values(ITEM_TEXTURE_SOURCES);
}

function getItemInfo(itemType) {
  if (!Number.isFinite(itemType) || itemType <= 0) {
    return null;
  }
  if (BLOCK_INFO[itemType]) {
    return {
      id: itemType,
      name: BLOCK_INFO[itemType].name,
      maxStack: itemType === BLOCK.WATER || itemType === BLOCK.BEDROCK ? 1 : 64,
      placeBlock: itemType !== BLOCK.AIR && itemType !== BLOCK.WATER && itemType !== BLOCK.BEDROCK ? itemType : null,
      blockType: itemType,
      armor: 0,
      armorSlot: null,
      tool: null
    };
  }
  return ITEM_INFO[itemType] || null;
}

function getItemName(itemType) {
  return getItemInfo(itemType)?.name || "Unknown Item";
}

function getItemMaxStack(itemType) {
  return getItemInfo(itemType)?.maxStack || 64;
}

function getPlacedBlockType(itemType) {
  return getItemInfo(itemType)?.placeBlock || BLOCK.AIR;
}

function getItemArmorSlot(itemType) {
  return getItemInfo(itemType)?.armorSlot || null;
}

function getItemArmorPoints(itemType) {
  return getItemInfo(itemType)?.armor || 0;
}

function getItemToolType(itemType) {
  return getItemInfo(itemType)?.tool || null;
}

function getItemFoodValue(itemType) {
  return Math.max(0, Number(getItemInfo(itemType)?.food) || 0);
}

function getFurnaceFuelTime(itemType) {
  return Math.max(0, Number(FURNACE_FUEL_TIME[itemType]) || 0);
}

function isFuelItem(itemType) {
  return getFurnaceFuelTime(itemType) > 0;
}

function getSmeltingResult(itemType) {
  return Number(SMELTING_RECIPES[itemType]) || BLOCK.AIR;
}

function isSmeltableItem(itemType) {
  return getSmeltingResult(itemType) !== BLOCK.AIR;
}

function normalizeItemName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function resolveItemTypeByName(name) {
  const key = normalizeItemName(name);
  if (!key) return BLOCK.AIR;

  for (const [id, info] of Object.entries(BLOCK_INFO)) {
    if (normalizeItemName(info?.name) === key) {
      return Number(id);
    }
  }
  for (const [id, info] of Object.entries(ITEM_INFO)) {
    if (normalizeItemName(info?.name) === key) {
      return Number(id);
    }
  }

  const aliases = {
    log: BLOCK.WOOD,
    leaves: BLOCK.LEAVES,
    glass: BLOCK.GLASS,
    crafting_table: BLOCK.CRAFTING_TABLE,
    table: BLOCK.CRAFTING_TABLE,
    furnace: BLOCK.FURNACE,
    plank: BLOCK.PLANKS,
    planks: BLOCK.PLANKS,
    stick: ITEM.STICK,
    wooden_pickaxe: ITEM.WOODEN_PICKAXE,
    wooden_axe: ITEM.WOODEN_AXE,
    wooden_shovel: ITEM.WOODEN_SHOVEL,
    wooden_sword: ITEM.WOODEN_SWORD,
    leather_helmet: ITEM.LEATHER_HELMET,
    leather_chestplate: ITEM.LEATHER_CHESTPLATE,
    leather_leggings: ITEM.LEATHER_LEGGINGS,
    leather_boots: ITEM.LEATHER_BOOTS,
    iron_helmet: ITEM.IRON_HELMET,
    iron_chestplate: ITEM.IRON_CHESTPLATE,
    iron_leggings: ITEM.IRON_LEGGINGS,
    iron_boots: ITEM.IRON_BOOTS,
    raw_chicken: ITEM.RAW_CHICKEN,
    cooked_chicken: ITEM.COOKED_CHICKEN,
    raw_mutton: ITEM.RAW_MUTTON,
    cooked_mutton: ITEM.COOKED_MUTTON,
    rotten_flesh: ITEM.ROTTEN_FLESH
  };
  return aliases[key] || BLOCK.AIR;
}

function getBlockTextureEntry(blockType, settingsState = DEFAULT_SETTINGS) {
  const packName = settingsState?.texturePack || DEFAULT_SETTINGS.texturePack;
  const override = TEXTURE_PACKS[packName]?.[blockType];
  return override || BLOCK_TEXTURE_PATHS[blockType] || null;
}

function getBlockTexturePath(blockType, faceId, settingsState = DEFAULT_SETTINGS) {
  const entry = getBlockTextureEntry(blockType, settingsState);
  if (!entry) {
    return null;
  }
  return faceId === "top" ? entry.top : faceId === "bottom" ? entry.bottom : entry.side;
}

function getAllBlockTexturePaths() {
  const paths = new Set();
  for (const entry of Object.values(BLOCK_TEXTURE_PATHS)) {
    for (const path of Object.values(entry || {})) {
      if (path) paths.add(path);
    }
  }
  for (const pack of Object.values(TEXTURE_PACKS)) {
    for (const entry of Object.values(pack || {})) {
      for (const path of Object.values(entry || {})) {
        if (path) paths.add(path);
      }
    }
  }
  return Array.from(paths);
}

function getResourcePackMeta(packName) {
  return RESOURCE_PACK_META[packName] || {
    name: packName === "default" ? "Default" : String(packName || "Unknown Pack"),
    description: "Built-in resource pack.",
    iconBlock: BLOCK.GRASS
  };
}

const ENTITY_TEXTURE_CATALOG_PATH = "assets/entity/externalTextures.json";
const ENTITY_TEXTURE_NAMES = new Set(["sheep", "zombie", "creeper", "spider", "villager", "chicken", "wolf"]);
const OBJ_ENTITY_MODEL_PATHS = {
  sheep: "assets/entity/models/sheep.obj",
  chicken: "assets/entity/models/chicken.obj",
  creeper: "assets/entity/models/creeper.obj",
  spider: "assets/entity/models/spider.obj",
  villager: "assets/entity/models/villager.obj",
  wolf: "assets/entity/models/wolf.obj"
};

const MOB_DEFS = {
  zombie: {
    radius: 0.34,
    height: 1.8,
    maxHealth: 20,
    speed: 2.2,
    hostile: true,
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
    shellScale: 1.08,
    shellTint: [1, 1, 1, 0.38]
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
    attackDamage: 3,
    attackReach: 1.3,
    meleeDamage: 4,
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

const PASSIVE_MOB_TYPES = ["sheep", "chicken", "wolf"];
const HOSTILE_MOB_TYPES = ["zombie", "creeper", "spider"];
const MAX_ACTIVE_MOBS = 15;
const VILLAGE_REGION_CHUNKS = 6;

function getMobDef(type) {
  return MOB_DEFS[type] || MOB_DEFS.sheep;
}

function getVillageCenterInRegion(regionX, regionZ, seed = WORLD_SEED) {
  const hash = hash4(regionX * 37, 11, regionZ * 53, seed + 9411);
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

function getNearbyVillageCenters(x, z, seed = WORLD_SEED, radius = 128) {
  const regionWorldSize = VILLAGE_REGION_CHUNKS * CHUNK_SIZE;
  const minRegionX = Math.floor((x - radius) / regionWorldSize);
  const maxRegionX = Math.floor((x + radius) / regionWorldSize);
  const minRegionZ = Math.floor((z - radius) / regionWorldSize);
  const maxRegionZ = Math.floor((z + radius) / regionWorldSize);
  const centers = [];

  for (let regionX = minRegionX; regionX <= maxRegionX; regionX += 1) {
    for (let regionZ = minRegionZ; regionZ <= maxRegionZ; regionZ += 1) {
      const center = getVillageCenterInRegion(regionX, regionZ, seed);
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

function getNearestVillageCenter(x, z, seed = WORLD_SEED, radius = 128) {
  let best = null;
  let bestDist2 = radius * radius;
  for (const center of getNearbyVillageCenters(x, z, seed, radius)) {
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

function getDayCycleInfo(time = 0) {
  const dayLength = 600;
  const t = ((time % dayLength) + dayLength) % dayLength / dayLength;

  let daylight = 1;
  let phase = "Day";
  if (t >= 0.52 && t < 0.6) {
    daylight = 1 - (t - 0.52) / 0.08 * 0.82;
    phase = "Sunset";
  } else if (t >= 0.6 && t < 0.88) {
    daylight = 0.18;
    phase = "Night";
  } else if (t >= 0.88 || t < 0.08) {
    const sunriseT = t >= 0.88 ? (t - 0.88) / 0.12 : (t + 0.12) / 0.2;
    daylight = 0.18 + clamp(sunriseT, 0, 1) * 0.82;
    phase = "Sunrise";
  }

  daylight = clamp(daylight, 0.12, 1);
  return {
    t,
    daylight,
    darkness: 1 - daylight,
    phase,
    isNight: phase === "Night" || daylight < 0.34
  };
}

function isNightTime(time = 0) {
  return getDayCycleInfo(time).isNight;
}

class TextureLibrary {
  constructor(engine) {
    this.engine = engine;
    this.images = new Map();
    this.settings = { ...DEFAULT_SETTINGS };
    this.loadStarted = false;
    this.ready = false;
    this.failed = false;
    this.readyPromise = null;
    this.progress = 0;
    this.total = 0;
  }

  startLoading() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.loadStarted = true;
    const uniquePaths = [...new Set([...getAllBlockTexturePaths(), ...getAllItemTexturePaths()])];

    this.total = uniquePaths.length;
    let loaded = 0;

    this.readyPromise = Promise.all(
      uniquePaths.map(async (path) => {
        try {
          const image = await this.engine.resources.loadImage(path);
          this.images.set(path, image);
          loaded += 1;
          this.progress = loaded / Math.max(1, this.total);
        } catch (error) {
          console.warn(`Texture load failed for ${path}: ${error.message}`);
        }
      })
    )
      .then(() => {
        this.ready = true;
        this.progress = 1;
        return true;
      })
      .catch((error) => {
        this.failed = true;
        console.warn("Texture library failed:", error.message);
        return false;
      });

    return this.readyPromise;
  }

  getBlockFaceTexture(blockType, faceId, settingsState = this.settings) {
    const path = getBlockTexturePath(blockType, faceId, settingsState);
    return this.images.get(path) || null;
  }

  getItemTexture(itemType, settingsState = this.settings) {
    const info = getItemInfo(itemType);
    if (!info) {
      return null;
    }
    if (info.blockType) {
      return this.getBlockFaceTexture(info.blockType, "top", settingsState);
    }
    return this.images.get(info.texture) || null;
  }
}

class EntityTextureLibrary {
  constructor(engine) {
    this.engine = engine;
    this.images = new Map();
    this.billboardImages = new Map();
    this.glTextures = new Map();
    this.ready = false;
    this.failed = false;
    this.readyPromise = null;
  }

  startLoading() {
    if (this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = this.engine.resources
      .fetchJSON(ENTITY_TEXTURE_CATALOG_PATH)
      .then(async (catalog) => {
        const tasks = [];
        for (const [name, dataUrl] of Object.entries(catalog || {})) {
          if (!ENTITY_TEXTURE_NAMES.has(name) || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
            continue;
          }
          tasks.push(
            this.engine.resources
              .loadImage(dataUrl)
              .then((image) => {
                this.images.set(name, image);
              })
              .catch((error) => {
                console.warn(`Entity texture failed for ${name}: ${error.message}`);
              })
          );
        }
        await Promise.all(tasks);
        this.ready = this.images.size > 0;
        console.log("Entity textures ready:", Array.from(this.images.keys()));
        return this.ready;
      })
      .catch((error) => {
        this.failed = true;
        console.warn("Entity texture catalog failed:", error.message);
        return false;
      });
    return this.readyPromise;
  }

  getImage(type) {
    return this.images.get(type) || null;
  }

  getBillboardImage(type) {
    const image = this.getImage(type);
    if (!image) {
      return null;
    }
    if (this.billboardImages.has(type)) {
      return this.billboardImages.get(type);
    }

    let billboard = image;
    if ((type === "zombie" || type === "creeper") && image.width >= 64 && image.height >= 32) {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 8, 8, 8, 8, 4, 0, 8, 8);
      ctx.drawImage(image, 20, 20, 8, 12, 4, 8, 8, 12);
      ctx.drawImage(image, 44, 20, 4, 12, 0, 8, 4, 12);
      ctx.drawImage(image, 44, 20, 4, 12, 12, 8, 4, 12);
      ctx.drawImage(image, 4, 20, 4, 12, 4, 20, 4, 12);
      ctx.drawImage(image, 4, 20, 4, 12, 8, 20, 4, 12);
      billboard = canvas;
    }

    this.billboardImages.set(type, billboard);
    return billboard;
  }

  getGLTexture(gl, type) {
    const image = this.getImage(type);
    if (!image) {
      return null;
    }
    if (this.glTextures.has(type)) {
      return this.glTextures.get(type);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.glTextures.set(type, tex);
    return tex;
  }
}

function parseObjModel(text) {
  const positions = [];
  const uvs = [];
  const normals = [];
  const vertices = [];
  const indices = [];
  const vertexMap = new Map();

  const useVertex = (token) => {
    const cached = vertexMap.get(token);
    if (cached !== undefined) {
      return cached;
    }
    const [viRaw, vtiRaw, vniRaw] = token.split("/");
    const vi = Number(viRaw) - 1;
    const vti = Number(vtiRaw) - 1;
    const vni = Number(vniRaw) - 1;
    const pos = positions[vi] || [0, 0, 0];
    const uv = uvs[vti] || [0, 0];
    const normal = normals[vni] || [0, 1, 0];
    const index = vertices.length / 8;
    vertices.push(pos[0], pos[1], pos[2], uv[0], uv[1], normal[0], normal[1], normal[2]);
    vertexMap.set(token, index);
    return index;
  };

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const tag = parts.shift();
    if (tag === "v") {
      positions.push(parts.slice(0, 3).map(Number));
    } else if (tag === "vt") {
      uvs.push([Number(parts[0]) || 0, Number(parts[1]) || 0]);
    } else if (tag === "vn") {
      normals.push(parts.slice(0, 3).map(Number));
    } else if (tag === "f") {
      const face = parts.map(useVertex);
      for (let i = 1; i < face.length - 1; i += 1) {
        indices.push(face[0], face[i], face[i + 1]);
      }
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const pos of positions) {
    if (!pos) continue;
    minX = Math.min(minX, pos[0]);
    minY = Math.min(minY, pos[1]);
    minZ = Math.min(minZ, pos[2]);
    maxX = Math.max(maxX, pos[0]);
    maxY = Math.max(maxY, pos[1]);
    maxZ = Math.max(maxZ, pos[2]);
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    bounds: {
      minX: Number.isFinite(minX) ? minX : -0.5,
      minY: Number.isFinite(minY) ? minY : 0,
      minZ: Number.isFinite(minZ) ? minZ : -0.5,
      maxX: Number.isFinite(maxX) ? maxX : 0.5,
      maxY: Number.isFinite(maxY) ? maxY : 1,
      maxZ: Number.isFinite(maxZ) ? maxZ : 0.5
    }
  };
}

class ObjModelLibrary {
  constructor(engine) {
    this.engine = engine;
    this.models = new Map();
    this.ready = false;
    this.failed = false;
    this.readyPromise = null;
  }

  startLoading() {
    if (this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = Promise.all(
      Object.entries(OBJ_ENTITY_MODEL_PATHS).map(async ([type, path]) => {
        try {
          const text = await this.engine.resources.fetchText(path);
          this.models.set(type, parseObjModel(text));
        } catch (error) {
          console.warn(`OBJ model failed for ${type}: ${error.message}`);
        }
      })
    )
      .then(() => {
        this.ready = this.models.size > 0;
        console.log("OBJ entity models ready:", Array.from(this.models.keys()));
        return this.ready;
      })
      .catch((error) => {
        this.failed = true;
        console.warn("OBJ entity model library failed:", error.message);
        return false;
      });
    return this.readyPromise;
  }

  getModel(type) {
    return this.models.get(type) || null;
  }

  hasModel(type) {
    return this.models.has(type);
  }
}

const HOTBAR_SLOTS = 9;
const INVENTORY_ROWS = 4;
const INVENTORY_COLS = 9;
const INVENTORY_SLOTS = INVENTORY_ROWS * INVENTORY_COLS;
const MAIN_INVENTORY_START = HOTBAR_SLOTS;
const ARMOR_SLOTS = 4;
const CRAFT_GRID_SMALL = 4;
const CRAFT_GRID_LARGE = 9;

const HOTBAR_BLOCKS = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.WOOD,
  BLOCK.PLANKS,
  BLOCK.CRAFTING_TABLE,
  BLOCK.FURNACE,
  BLOCK.LEAVES,
  BLOCK.SAND,
  BLOCK.GLASS
];

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
  }
];

const FURNACE_FUEL_TIME = {
  [BLOCK.WOOD]: 15,
  [BLOCK.PLANKS]: 8,
  [ITEM.STICK]: 3.5
};

const FURNACE_SMELT_TIME = 5.5;

const SMELTING_RECIPES = {
  [ITEM.RAW_CHICKEN]: ITEM.COOKED_CHICKEN,
  [ITEM.RAW_MUTTON]: ITEM.COOKED_MUTTON
};

const MOB_LOOT_TABLES = {
  sheep: [
    { itemType: ITEM.RAW_MUTTON, min: 1, max: 2 }
  ],
  chicken: [
    { itemType: ITEM.RAW_CHICKEN, min: 1, max: 2 }
  ],
  zombie: [
    { itemType: ITEM.ROTTEN_FLESH, min: 1, max: 2 }
  ]
};

let defaultPlayerSkinCanvas = null;

function fillCanvasRects(ctx, color, rects) {
  ctx.fillStyle = color;
  for (const rect of rects) {
    const [x, y, w = 1, h = 1] = rect;
    ctx.fillRect(x, y, w, h);
  }
}

function getDefaultPlayerSkinCanvas() {
  if (defaultPlayerSkinCanvas) {
    return defaultPlayerSkinCanvas;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const skin = "#e3c7aa";
  const skinShade = "#cfae90";
  const hair = "#352316";
  const hairShade = "#21150c";
  const shirt = "#22c6d8";
  const shirtShade = "#148998";
  const pants = "#39d3e2";
  const pantsShade = "#2293a3";
  const shoes = "#f0f0f0";
  const belt = "#2c241d";

  fillCanvasRects(ctx, skin, [
    [8, 8, 8, 8],
    [20, 20, 8, 12],
    [44, 20, 4, 12],
    [36, 52, 4, 12],
    [4, 20, 4, 12],
    [20, 52, 4, 12]
  ]);
  fillCanvasRects(ctx, skinShade, [
    [20, 30, 8, 2],
    [44, 30, 4, 2],
    [36, 62, 4, 2],
    [4, 30, 4, 2],
    [20, 62, 4, 2]
  ]);
  fillCanvasRects(ctx, hair, [
    [8, 8, 8, 2],
    [8, 10, 2, 3],
    [14, 10, 2, 3],
    [9, 12, 6, 1],
    [40, 8, 8, 2],
    [40, 10, 2, 3],
    [46, 10, 2, 3],
    [41, 12, 6, 1]
  ]);
  fillCanvasRects(ctx, hairShade, [
    [10, 10, 4, 1],
    [42, 10, 4, 1]
  ]);
  fillCanvasRects(ctx, "#ffffff", [
    [10, 12, 1, 1],
    [13, 12, 1, 1]
  ]);
  fillCanvasRects(ctx, "#5c3f28", [
    [10, 12, 1, 1],
    [13, 12, 1, 1],
    [11, 14, 2, 1]
  ]);
  fillCanvasRects(ctx, shirt, [
    [20, 20, 8, 10],
    [44, 20, 4, 4],
    [36, 52, 4, 4]
  ]);
  fillCanvasRects(ctx, shirtShade, [
    [20, 20, 8, 2],
    [20, 28, 8, 2],
    [44, 20, 4, 2],
    [36, 52, 4, 2]
  ]);
  fillCanvasRects(ctx, pants, [
    [4, 20, 4, 10],
    [20, 52, 4, 10]
  ]);
  fillCanvasRects(ctx, pantsShade, [
    [4, 20, 4, 2],
    [20, 52, 4, 2]
  ]);
  fillCanvasRects(ctx, shoes, [
    [4, 30, 4, 2],
    [20, 62, 4, 2]
  ]);
  fillCanvasRects(ctx, belt, [
    [20, 30, 8, 2]
  ]);

  defaultPlayerSkinCanvas = canvas;
  return canvas;
}

function getArmorPreviewColor(itemType) {
  switch (itemType) {
    case ITEM.LEATHER_HELMET:
    case ITEM.LEATHER_CHESTPLATE:
    case ITEM.LEATHER_LEGGINGS:
    case ITEM.LEATHER_BOOTS:
      return "rgba(144, 98, 62, 0.86)";
    case ITEM.IRON_HELMET:
    case ITEM.IRON_CHESTPLATE:
    case ITEM.IRON_LEGGINGS:
    case ITEM.IRON_BOOTS:
      return "rgba(219, 226, 236, 0.88)";
    default:
      return "rgba(219, 226, 236, 0.82)";
  }
}

function renderPlayerPreviewCanvas(canvas, armorItems = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const skin = getDefaultPlayerSkinCanvas();

  canvas.width = 96;
  canvas.height = 176;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(18, 150, 60, 10);

  const drawPart = (sx, sy, sw, sh, dx, dy, dw, dh) => {
    ctx.drawImage(skin, sx, sy, sw, sh, dx, dy, dw, dh);
  };

  drawPart(8, 8, 8, 8, 32, 6, 32, 32);
  drawPart(40, 8, 8, 8, 32, 6, 32, 32);
  drawPart(20, 20, 8, 12, 36, 42, 24, 36);
  drawPart(44, 20, 4, 12, 22, 42, 14, 36);
  drawPart(36, 52, 4, 12, 60, 42, 14, 36);
  drawPart(4, 20, 4, 12, 38, 78, 14, 44);
  drawPart(20, 52, 4, 12, 52, 78, 14, 44);

  const drawArmorOverlay = (color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };

  if (armorItems.head) {
    drawArmorOverlay(getArmorPreviewColor(armorItems.head), 29, 3, 38, 18);
  }
  if (armorItems.chest) {
    drawArmorOverlay(getArmorPreviewColor(armorItems.chest), 33, 38, 30, 30);
    drawArmorOverlay(getArmorPreviewColor(armorItems.chest), 20, 41, 16, 22);
    drawArmorOverlay(getArmorPreviewColor(armorItems.chest), 60, 41, 16, 22);
  }
  if (armorItems.legs) {
    drawArmorOverlay(getArmorPreviewColor(armorItems.legs), 36, 76, 32, 24);
  }
  if (armorItems.feet) {
    drawArmorOverlay(getArmorPreviewColor(armorItems.feet), 36, 118, 32, 12);
  }
}

const FACE_DEFS = [
  {
    id: "north",
    normal: { x: 0, y: 0, z: -1 },
    offset: { x: 0, y: 0, z: -1 },
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0]
    ],
    light: 0.84
  },
  {
    id: "south",
    normal: { x: 0, y: 0, z: 1 },
    offset: { x: 0, y: 0, z: 1 },
    corners: [
      [1, 0, 1],
      [0, 0, 1],
      [0, 1, 1],
      [1, 1, 1]
    ],
    light: 0.92
  },
  {
    id: "west",
    normal: { x: -1, y: 0, z: 0 },
    offset: { x: -1, y: 0, z: 0 },
    corners: [
      [0, 0, 1],
      [0, 0, 0],
      [0, 1, 0],
      [0, 1, 1]
    ],
    light: 0.8
  },
  {
    id: "east",
    normal: { x: 1, y: 0, z: 0 },
    offset: { x: 1, y: 0, z: 0 },
    corners: [
      [1, 0, 0],
      [1, 0, 1],
      [1, 1, 1],
      [1, 1, 0]
    ],
    light: 0.88
  },
  {
    id: "top",
    normal: { x: 0, y: 1, z: 0 },
    offset: { x: 0, y: 1, z: 0 },
    corners: [
      [0, 1, 0],
      [1, 1, 0],
      [1, 1, 1],
      [0, 1, 1]
    ],
    light: 1
  },
  {
    id: "bottom",
    normal: { x: 0, y: -1, z: 0 },
    offset: { x: 0, y: -1, z: 0 },
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 0, 0],
      [0, 0, 0]
    ],
    light: 0.58
  }
];

const FACE_BY_ID = Object.fromEntries(FACE_DEFS.map((face) => [face.id, face]));

function getFaceColor(blockType, faceId) {
  const info = BLOCK_INFO[blockType];
  if (!info) {
    return rgb(255, 255, 255);
  }
  if (faceId === "top") {
    return info.palette.top;
  }
  if (faceId === "bottom") {
    return info.palette.bottom;
  }
  return info.palette.side;
}

function isSolidForMeshing(blockType) {
  return blockType !== BLOCK.AIR;
}

function isCollidable(blockType) {
  return !!BLOCK_INFO[blockType]?.collidable;
}

function shouldRenderFace(blockType, neighborType) {
  if (blockType === BLOCK.WATER) {
    return neighborType !== BLOCK.WATER;
  }
  if (neighborType === BLOCK.AIR) {
    return true;
  }
  const block = BLOCK_INFO[blockType];
  const neighbor = BLOCK_INFO[neighborType];
  if (!neighbor) {
    return true;
  }
  if (!neighbor.collidable && neighborType !== BLOCK.WATER) {
    return true;
  }
  if (!block.transparent && neighbor.transparent) {
    return true;
  }
  if (block.transparent) {
    if (neighborType === blockType) {
      return false;
    }
    return !neighbor.collidable || neighbor.transparent;
  }
  return false;
}

class TerrainGenerator {
  constructor(seed) {
    this.seed = seed;
    this.continents = new FractalNoise(seed + 11, 4, 0.5, 2);
    this.hills = new FractalNoise(seed + 23, 4, 0.52, 2.05);
    this.details = new FractalNoise(seed + 37, 3, 0.55, 2.4);
    this.moisture = new FractalNoise(seed + 49, 4, 0.5, 2);
    this.ridges = new FractalNoise(seed + 71, 4, 0.48, 2.2);
    this.peaks = new FractalNoise(seed + 93, 4, 0.5, 2.12);
    this.rivers = new FractalNoise(seed + 121, 3, 0.55, 2.3);
    this.cavesXZ = new FractalNoise(seed + 151, 3, 0.56, 2.1);
    this.cavesXY = new FractalNoise(seed + 173, 3, 0.52, 2.06);
    this.cavesYZ = new FractalNoise(seed + 197, 3, 0.54, 2.14);
    this.caveWarp = new FractalNoise(seed + 223, 2, 0.5, 2);
  }

  sampleHeight(x, z) {
    const continental = this.continents.fractal(x * 0.0038, z * 0.0038) * 0.5 + 0.5;
    const hills = this.hills.fractal(x * 0.012, z * 0.012);
    const detail = this.details.fractal(x * 0.038, z * 0.038);
    const ridge = 1 - Math.abs(this.ridges.fractal(x * 0.009, z * 0.009));
    const peaks = Math.max(0, this.peaks.fractal(x * 0.0065, z * 0.0065) * 0.5 + 0.5 - 0.42);
    const river = 1 - Math.min(1, Math.abs(this.rivers.fractal(x * 0.0048, z * 0.0048)) * 4.4);

    let height = 18;
    height += continental * 18;
    height += hills * 7;
    height += ridge * 8;
    height += detail * 2.8;
    height += peaks * peaks * 28;
    height -= river > 0.65 ? (river - 0.65) * 17 : 0;

    return clamp(Math.round(height), 6, WORLD_HEIGHT - 8);
  }

  describeColumn(x, z) {
    const height = this.sampleHeight(x, z);
    const moisture = this.moisture.fractal(x * 0.006, z * 0.006) * 0.5 + 0.5;
    const river = 1 - Math.min(1, Math.abs(this.rivers.fractal(x * 0.0048, z * 0.0048)) * 4.4);
    const slope =
      Math.abs(this.sampleHeight(x + 1, z) - this.sampleHeight(x - 1, z)) +
      Math.abs(this.sampleHeight(x, z + 1) - this.sampleHeight(x, z - 1));

    let biome = "plains";
    let surface = BLOCK.GRASS;
    let filler = BLOCK.DIRT;

    if (river > 0.72 || height <= SEA_LEVEL + 1) {
      biome = "shore";
      surface = BLOCK.SAND;
      filler = BLOCK.SAND;
    } else if (moisture < 0.28) {
      biome = "desert";
      surface = BLOCK.SAND;
      filler = BLOCK.SAND;
    } else if (height > SEA_LEVEL + 28) {
      biome = "mountains";
      surface = slope > 4 ? BLOCK.STONE : BLOCK.GRASS;
      filler = BLOCK.STONE;
    } else if (height > SEA_LEVEL + 16 && slope > 7) {
      biome = "cliff";
      surface = BLOCK.STONE;
      filler = BLOCK.STONE;
    }

    return {
      height,
      moisture,
      river,
      slope,
      biome,
      surface,
      filler
    };
  }

  shouldPlaceTree(x, z, column) {
    if (
      column.surface !== BLOCK.GRASS ||
      column.height <= SEA_LEVEL + 1 ||
      column.slope > 4 ||
      column.biome === "mountains"
    ) {
      return false;
    }
    const chance = random2(x, z, this.seed + 301);
    const threshold = column.moisture > 0.6 ? 0.91 : 0.952;
    return chance > threshold;
  }

  getTreeHeight(x, z) {
    return 4 + Math.floor(random2(x, z, this.seed + 401) * 3);
  }

  shouldCarveCave(x, y, z, surfaceY) {
    if (y < 6 || y >= surfaceY - 4) {
      return false;
    }

    const depth = clamp((surfaceY - y) / 26, 0, 1);
    if (depth < 0.18) {
      return false;
    }

    const warp = this.caveWarp.fractal(x * 0.018, z * 0.018) * 9;
    const sampleX = (x + warp) * 0.055;
    const sampleY = y * 0.06;
    const sampleZ = (z - warp) * 0.055;

    const density =
      Math.abs(this.cavesXZ.fractal(sampleX, sampleZ)) * 0.46 +
      Math.abs(this.cavesXY.fractal(sampleX, sampleY)) * 0.29 +
      Math.abs(this.cavesYZ.fractal(sampleY, sampleZ)) * 0.25;

    const tunnel =
      Math.abs(this.cavesXZ.fractal(sampleX * 1.9 + 17.3, sampleZ * 1.9 - 11.4)) * 0.6 +
      Math.abs(this.cavesXY.fractal(sampleX * 1.7 - 8.1, sampleY * 1.7 + 3.7)) * 0.4;

    const threshold = 0.14 + depth * 0.11 + (y < SEA_LEVEL - 8 ? 0.035 : 0);
    return density < threshold || tunnel < threshold * 0.78;
  }
}

class Chunk {
  constructor(world, chunkX, chunkZ) {
    this.world = world;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.generated = false;
    this.meshDirty = true;
    this.mesh = [];
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
    this.meshDirty = true;
  }

  setLocalRaw(x, y, z, type) {
    this.blocks[this.index(x, y, z)] = type;
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

        for (let y = 0; y < WORLD_HEIGHT; y += 1) {
          let type = BLOCK.AIR;
          if (y === 0) {
            type = BLOCK.BEDROCK;
          } else if (y < surfaceY - 3) {
            type = BLOCK.STONE;
          } else if (y < surfaceY) {
            type = column.filler;
          } else if (y === surfaceY) {
            type = column.surface;
          } else if (y <= SEA_LEVEL) {
            type = BLOCK.WATER;
          }

          if (
            type !== BLOCK.AIR &&
            type !== BLOCK.WATER &&
            type !== BLOCK.BEDROCK &&
            this.world.terrain.shouldCarveCave(worldX, y, worldZ, surfaceY)
          ) {
            type = BLOCK.AIR;
          }

          this.setLocalRaw(lx, y, lz, type);
        }

      }
    }

    this.decorateTrees(baseX, baseZ);
    this.decorateVillage(baseX, baseZ);

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
          this.applyWorldTree(worldX, column.height, worldZ, this.world.terrain.getTreeHeight(worldX, worldZ));
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

  buildVillageHouse(originX, originZ, width = 5, depth = 5, doorSide = "south") {
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
  }

  applyVillageAt(centerX, groundY, centerZ, seed) {
    for (let d = -7; d <= 7; d += 1) {
      this.layVillageSurface(centerX + d, centerZ, BLOCK.PLANKS, BLOCK.WOOD);
      this.layVillageSurface(centerX, centerZ + d, BLOCK.PLANKS, BLOCK.WOOD);
    }

    this.buildVillageHouse(centerX - 8, centerZ - 6, 5, 5, "south");
    this.buildVillageHouse(centerX + 4, centerZ - 6, 5, 5, "south");
    if ((seed & 1) === 0) {
      this.buildVillageHouse(centerX - 8, centerZ + 3, 5, 5, "north");
    } else {
      this.buildVillageHouse(centerX + 4, centerZ + 3, 5, 5, "north");
    }

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        this.layVillageSurface(centerX + dx, centerZ + dz, BLOCK.BRICK, BLOCK.STONE);
      }
    }
  }
}

class World {
  constructor(seed = WORLD_SEED) {
    this.seed = seed;
    this.terrain = new TerrainGenerator(seed);
    this.chunks = new Map();
    this.modifiedChunks = new Map();
    this.savedPlayerState = null;
    this.savedSettings = null;
    this.saveDirty = false;
    this.loadedFromStorage = false;
  }

  peekChunk(chunkX, chunkZ) {
    return this.chunks.get(packChunkKey(chunkX, chunkZ)) || null;
  }

  getChunk(chunkX, chunkZ) {
    const key = packChunkKey(chunkX, chunkZ);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(this, chunkX, chunkZ);
      this.chunks.set(key, chunk);
      chunk.generate();
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

  setBlock(x, y, z, type) {
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
    let bucket = this.modifiedChunks.get(packChunkKey(chunkX, chunkZ));
    if (!bucket) {
      bucket = new Map();
      this.modifiedChunks.set(packChunkKey(chunkX, chunkZ), bucket);
    }
    bucket.set(packLocalKey(localX, y, localZ), type);
    this.markChunkAndTouchingNeighborsDirty(chunkX, chunkZ, localX, localZ);
    this.saveDirty = true;
    return true;
  }

  buildChunkMesh(chunkX, chunkZ) {
    const chunk = this.getChunk(chunkX, chunkZ);
    const faces = [];
    const worldBaseX = chunkX * CHUNK_SIZE;
    const worldBaseZ = chunkZ * CHUNK_SIZE;

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          const type = chunk.getLocal(x, y, z);
          if (!isSolidForMeshing(type)) {
            continue;
          }

          const worldX = worldBaseX + x;
          const worldZ = worldBaseZ + z;

          for (const face of FACE_DEFS) {
            if (type === BLOCK.WATER && face.id === "bottom") {
              continue;
            }
            const neighborType = this.peekBlock(
              worldX + face.offset.x,
              y + face.offset.y,
              worldZ + face.offset.z
            );
            if (shouldRenderFace(type, neighborType)) {
              faces.push({
                x: worldX,
                y,
                z: worldZ,
                type,
                faceId: face.id
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
    for (const [chunkKey] of this.chunks) {
      const [chunkX, chunkZ] = chunkKey.split(",").map(Number);
      const distance = Math.max(Math.abs(chunkX - playerChunkX), Math.abs(chunkZ - playerChunkZ));
      if (distance > keepRadius) {
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
      if (blockType !== BLOCK.AIR && blockType !== BLOCK.WATER && traveled > 0) {
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

class BrowserInput {
  constructor(engine) {
    this.engine = engine;
    this.canvas = engine.canvas;
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    this.locked = false;
    this.buttonsDown = [false, false, false];
    this.buttonsPressed = new Set();
    this.pressedKeys = new Set();
    this.actionUnlockAt = 0;
    this.pointerLockEnabled = false;
    this._lostPointerLock = false;
    this._hidden = false;

    this.canvas.style.cursor = "pointer";
    this.canvas.setAttribute("tabindex", "0");

    this.resetLocalState = () => {
      this.lookX = 0;
      this.lookY = 0;
      this.wheel = 0;
      this.buttonsDown = [false, false, false];
      this.buttonsPressed.clear();
      this.pressedKeys.clear();
    };

    this.resetState = (resetEngine = false) => {
      this.resetLocalState();
      if (resetEngine && this.engine?.input?.reset) {
        this.engine.input.reset();
      }
    };

    this.onMouseMove = (event) => {
      if (!this.locked) {
        return;
      }
      this.lookX += event.movementX || 0;
      this.lookY += event.movementY || 0;
    };

    this.onMouseDown = (event) => {
      if (this.locked || event.target === this.canvas) {
        event.preventDefault();
      }
      this.buttonsDown[event.button] = true;
      this.buttonsPressed.add(event.button);

      if (!this.locked && this.pointerLockEnabled && event.button === 0) {
        this.requestPointerLock();
      }
    };

    this.onMouseUp = (event) => {
      this.buttonsDown[event.button] = false;
    };

    this.onWheel = (event) => {
      event.preventDefault();
      this.wheel += event.deltaY > 0 ? 1 : -1;
    };

    this.onKeyDown = (event) => {
      const target = event.target;
      const tag = target && target.tagName ? String(target.tagName).toUpperCase() : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      this.pressedKeys.add(event.key);
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
      }
    };

    this.onBlur = () => {
      this.resetState(true);
    };

    this.onVisibilityChange = () => {
      this._hidden = !!document.hidden;
      if (this._hidden) {
        this.resetState(true);
      }
    };

    this.onPointerLockChange = () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      this.canvas.style.cursor = this.locked ? "none" : "pointer";
      if (wasLocked && !this.locked) {
        this.resetState(true);
      }
      if (wasLocked && !this.locked && this.pointerLockEnabled) {
        // ESC often exits pointer lock without sending a key event.
        this._lostPointerLock = true;
      }
      if (this.locked) {
        this.actionUnlockAt = performance.now() + 120;
      }
    };

    this.onContextMenu = (event) => {
      event.preventDefault();
    };

    document.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  requestPointerLock() {
    if (!this.canvas.requestPointerLock) {
      return;
    }
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch (error) {
      console.debug("Pointer lock request failed:", error.message);
    }
  }

  isDown(key) {
    return this.engine.input.isDown(key);
  }

  getMousePosition() {
    return {
      x: this.engine.input.mouse.x,
      y: this.engine.input.mouse.y
    };
  }

  consumeLook() {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  consumeWheel() {
    const wheel = this.wheel;
    this.wheel = 0;
    return wheel;
  }

  consumePress(...keys) {
    for (const key of keys) {
      if (this.pressedKeys.has(key)) {
        this.pressedKeys.delete(key);
        return true;
      }
    }
    return false;
  }

  consumeMousePress(button) {
    if (this.buttonsPressed.has(button)) {
      this.buttonsPressed.delete(button);
      return true;
    }
    return false;
  }

  consumeLostPointerLock() {
    if (this._lostPointerLock) {
      this._lostPointerLock = false;
      return true;
    }
    return false;
  }
}

class Player {
  constructor() {
    this.x = 0;
    this.y = SEA_LEVEL + 3;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = Math.PI;
    this.pitch = -0.18;
    this.onGround = false;
    this.breakCooldown = 0;
    this.placeCooldown = 0;
    this.selectedHotbarSlot = 0;
    this.initializeInventory();
    this.maxHealth = 20;
    this.health = 20;
    this.maxHunger = 20;
    this.hunger = 20;
    this.xp = 0;
    this.xpLevel = 0;
    this.hurtCooldown = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.inWater = false;
    this.fallDistance = 0;
    this.pendingFallDamage = 0;
    this.isSprinting = false;
  }

  initializeInventory() {
    this.inventoryTypes = new Uint8Array(INVENTORY_SLOTS);
    this.inventoryCounts = new Uint16Array(INVENTORY_SLOTS);
    this.hotbarTypes = this.inventoryTypes.subarray(0, HOTBAR_SLOTS);
    this.hotbarCounts = this.inventoryCounts.subarray(0, HOTBAR_SLOTS);
    this.armorTypes = new Uint8Array(ARMOR_SLOTS);
    this.armorCounts = new Uint8Array(ARMOR_SLOTS);
  }

  getArmorPoints() {
    let total = 0;
    for (let i = 0; i < ARMOR_SLOTS; i += 1) {
      if ((this.armorCounts[i] || 0) > 0) {
        total += getItemArmorPoints(this.armorTypes[i] || 0);
      }
    }
    return total;
  }

  getEyePosition() {
    return {
      x: this.x,
      y: this.y + PLAYER_EYE_HEIGHT,
      z: this.z
    };
  }

  getLookVector() {
    const cosPitch = Math.cos(this.pitch);
    return {
      x: Math.sin(this.yaw) * cosPitch,
      y: Math.sin(this.pitch),
      z: Math.cos(this.yaw) * cosPitch
    };
  }

  getAABB(x = this.x, y = this.y, z = this.z) {
    return {
      minX: x - PLAYER_RADIUS,
      maxX: x + PLAYER_RADIUS,
      minY: y,
      maxY: y + PLAYER_HEIGHT,
      minZ: z - PLAYER_RADIUS,
      maxZ: z + PLAYER_RADIUS
    };
  }

  intersectsBlock(blockX, blockY, blockZ, x = this.x, y = this.y, z = this.z) {
    const aabb = this.getAABB(x, y, z);
    return (
      aabb.maxX > blockX &&
      aabb.minX < blockX + 1 &&
      aabb.maxY > blockY &&
      aabb.minY < blockY + 1 &&
      aabb.maxZ > blockZ &&
      aabb.minZ < blockZ + 1
    );
  }

  wouldCollide(world, x = this.x, y = this.y, z = this.z) {
    const aabb = this.getAABB(x, y, z);
    const minX = Math.floor(aabb.minX);
    const maxX = Math.floor(aabb.maxX - 0.00001);
    const minY = Math.floor(aabb.minY);
    const maxY = Math.floor(aabb.maxY - 0.00001);
    const minZ = Math.floor(aabb.minZ);
    const maxZ = Math.floor(aabb.maxZ - 0.00001);

    for (let blockX = minX; blockX <= maxX; blockX += 1) {
      for (let blockY = minY; blockY <= maxY; blockY += 1) {
        for (let blockZ = minZ; blockZ <= maxZ; blockZ += 1) {
          if (isCollidable(world.getBlock(blockX, blockY, blockZ)) && this.intersectsBlock(blockX, blockY, blockZ, x, y, z)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  isInWater(world, x = this.x, y = this.y, z = this.z) {
    const aabb = this.getAABB(x, y, z);
    const minX = Math.floor(aabb.minX);
    const maxX = Math.floor(aabb.maxX - 0.00001);
    const minY = Math.floor(aabb.minY);
    const maxY = Math.floor(aabb.maxY - 0.00001);
    const minZ = Math.floor(aabb.minZ);
    const maxZ = Math.floor(aabb.maxZ - 0.00001);

    for (let bx = minX; bx <= maxX; bx += 1) {
      for (let by = minY; by <= maxY; by += 1) {
        for (let bz = minZ; bz <= maxZ; bz += 1) {
          if (world.getBlock(bx, by, bz) === BLOCK.WATER && this.intersectsBlock(bx, by, bz, x, y, z)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  setPosition(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
  }

  applyLook(deltaX, deltaY, settings = DEFAULT_SETTINGS) {
    const sensitivity = settings.mouseSensitivity || DEFAULT_SETTINGS.mouseSensitivity;
    const invertY = settings.invertY ? -1 : 1;
    // PointerLock movementX is positive when moving mouse right.
    // In our coordinate setup, subtracting makes "mouse left -> turn left" like Minecraft.
    this.yaw -= deltaX * sensitivity;
    this.pitch = clamp(this.pitch + deltaY * sensitivity * 0.84 * invertY, -1.5, 1.5);
  }

  resolveAxisCollisions(world, axis, delta) {
    let aabb = this.getAABB();
    const minX = Math.floor(aabb.minX);
    const maxX = Math.floor(aabb.maxX - 0.00001);
    const minY = Math.floor(aabb.minY);
    const maxY = Math.floor(aabb.maxY - 0.00001);
    const minZ = Math.floor(aabb.minZ);
    const maxZ = Math.floor(aabb.maxZ - 0.00001);

    for (let blockX = minX; blockX <= maxX; blockX += 1) {
      for (let blockY = minY; blockY <= maxY; blockY += 1) {
        for (let blockZ = minZ; blockZ <= maxZ; blockZ += 1) {
          if (!isCollidable(world.getBlock(blockX, blockY, blockZ))) {
            continue;
          }
          if (!this.intersectsBlock(blockX, blockY, blockZ)) {
            continue;
          }

          if (axis === "x") {
            if (delta > 0) {
              this.x = blockX - PLAYER_RADIUS - 0.0001;
            } else {
              this.x = blockX + 1 + PLAYER_RADIUS + 0.0001;
            }
            this.vx = 0;
          } else if (axis === "z") {
            if (delta > 0) {
              this.z = blockZ - PLAYER_RADIUS - 0.0001;
            } else {
              this.z = blockZ + 1 + PLAYER_RADIUS + 0.0001;
            }
            this.vz = 0;
          } else if (axis === "y") {
            if (delta > 0) {
              this.y = blockY - PLAYER_HEIGHT - 0.0001;
            } else {
              this.y = blockY + 1 + 0.0001;
              this.onGround = true;
            }
            this.vy = 0;
          }

          aabb = this.getAABB();
        }
      }
    }
  }

  update(dt, input, world) {
    this.breakCooldown = Math.max(0, this.breakCooldown - dt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);

    const startedInWater = this.inWater;
    this.inWater = this.isInWater(world);
    const startY = this.y;

    const forward = (input.isDown("w") || input.isDown("W") ? 1 : 0) - (input.isDown("s") || input.isDown("S") ? 1 : 0);
    // Strafe should match Minecraft: A = left, D = right.
    const strafe = (input.isDown("a") || input.isDown("A") ? 1 : 0) - (input.isDown("d") || input.isDown("D") ? 1 : 0);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const forwardX = sinYaw;
    const forwardZ = cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    let moveX = rightX * strafe + forwardX * forward;
    let moveZ = rightZ * strafe + forwardZ * forward;
    const length = Math.hypot(moveX, moveZ);
    if (length > 0) {
      moveX /= length;
      moveZ /= length;
    }
    const wantsSprint = !this.inWater && this.hunger > 0 && length > 0 && input.isDown("Shift");
    this.isSprinting = wantsSprint;

    const speed = this.inWater ? 2.8 : wantsSprint ? 6.9 : 4.6;

    const targetVX = moveX * speed;
    const targetVZ = moveZ * speed;
    const accel = this.inWater ? 7.5 : this.onGround ? 16 : 5;
    const blend = clamp(accel * dt, 0, 1);

    this.vx = lerp(this.vx, targetVX, blend);
    this.vz = lerp(this.vz, targetVZ, blend);

    if (length === 0 && this.onGround) {
      this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1));
      this.vz = lerp(this.vz, 0, clamp(12 * dt, 0, 1));
    }

    if (this.inWater) {
      // Fluid movement: buoyancy + drag + swim controls.
      const wantUp = input.isDown(" ");

      // Swim controls: sink by default, only rise while holding jump.
      if (wantUp) {
        this.vy = lerp(this.vy, 4.8, clamp(7.8 * dt, 0, 1));
      } else {
        this.vy = lerp(this.vy, -2.3, clamp(2.6 * dt, 0, 1));
      }

      // Water drag (keep it swimmy, not honey).
      const drag = Math.pow(0.955, dt * 60);
      this.vx *= drag;
      this.vy *= Math.pow(0.975, dt * 60);
      this.vz *= drag;
      this.vy = clamp(this.vy, -5.5, 5.5);
      this.onGround = false;
    } else {
      if (this.onGround && input.consumePress(" ")) {
        this.vy = 8.5;
        this.onGround = false;
      }

      this.vy -= 24 * dt;
      this.vy = Math.max(this.vy, -32);
      this.onGround = false;
    }

    this.x += this.vx * dt;
    this.resolveAxisCollisions(world, "x", this.vx * dt);

    this.z += this.vz * dt;
    this.resolveAxisCollisions(world, "z", this.vz * dt);

    this.y += this.vy * dt;
    this.resolveAxisCollisions(world, "y", this.vy * dt);
    this.inWater = this.isInWater(world);

    const fallStep = Math.max(0, startY - this.y);
    if (this.inWater) {
      this.fallDistance = 0;
    } else if (this.onGround) {
      if (!startedInWater && this.fallDistance > 3.25) {
        this.pendingFallDamage = Math.max(this.pendingFallDamage, Math.floor(this.fallDistance - 3));
      }
      this.fallDistance = 0;
    } else if (this.vy < 0 && fallStep > 0) {
      this.fallDistance += fallStep;
    } else if (this.vy > 0.2) {
      this.fallDistance = 0;
    }

    if (this.y < -20) {
      const spawn = world.findSpawn(Math.floor(this.x), Math.floor(this.z));
      this.setPosition(spawn.x, spawn.y, spawn.z);
      this.fallDistance = 0;
    }
  }

  ensureSafePosition(world) {
    // Only rescue the player if they're stuck inside blocks or below the world.
    // Do not snap to terrain height, otherwise digging holes won't work.
    if (this.y < 0.001) {
      this.y = 0.001;
      this.vy = 0;
    }

    if (!this.wouldCollide(world, this.x, this.y, this.z)) {
      return;
    }

    // Try to push upward out of collision.
    const startY = this.y;
    for (let i = 0; i < 60; i += 1) {
      this.y = startY + i * 0.1;
      if (!this.wouldCollide(world, this.x, this.y, this.z)) {
        this.vy = 0;
        return;
      }
    }
  }

  serialize() {
    return {
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      pitch: this.pitch,
      selectedHotbarSlot: this.selectedHotbarSlot,
      inventoryTypes: Array.from(this.inventoryTypes),
      inventoryCounts: Array.from(this.inventoryCounts),
      armorTypes: Array.from(this.armorTypes),
      armorCounts: Array.from(this.armorCounts),
      hotbarTypes: Array.from(this.hotbarTypes),
      hotbarCounts: Array.from(this.hotbarCounts),
      health: this.health,
      hunger: this.hunger,
      xp: this.xp,
      xpLevel: this.xpLevel
    };
  }

  restore(data) {
    if (!data || typeof data !== "object") {
      return false;
    }

    if ([data.x, data.y, data.z, data.yaw, data.pitch].every((value) => Number.isFinite(value))) {
      this.x = data.x;
      this.y = data.y;
      this.z = data.z;
      this.yaw = data.yaw;
      this.pitch = data.pitch;
      this.selectedHotbarSlot = clamp(Number(data.selectedHotbarSlot) || 0, 0, HOTBAR_SLOTS - 1);
      this.initializeInventory();
      const savedTypes = Array.isArray(data.inventoryTypes) ? data.inventoryTypes : data.hotbarTypes;
      const savedCounts = Array.isArray(data.inventoryCounts) ? data.inventoryCounts : data.hotbarCounts;
      if (Array.isArray(savedTypes) && Array.isArray(savedCounts)) {
        for (let i = 0; i < Math.min(INVENTORY_SLOTS, savedTypes.length, savedCounts.length); i += 1) {
          const t = Number(savedTypes[i]) || 0;
          const c = Number(savedCounts[i]) || 0;
          if (t > 0 && c > 0) {
            this.inventoryTypes[i] = t;
            this.inventoryCounts[i] = clamp(Math.floor(c), 0, getItemMaxStack(t));
          }
        }
      }
      if (Array.isArray(data.armorTypes) && Array.isArray(data.armorCounts)) {
        for (let i = 0; i < Math.min(ARMOR_SLOTS, data.armorTypes.length, data.armorCounts.length); i += 1) {
          const t = Number(data.armorTypes[i]) || 0;
          const c = Number(data.armorCounts[i]) || 0;
          if (t > 0 && c > 0 && getItemArmorSlot(t) === ARMOR_SLOT_KEYS[i]) {
            this.armorTypes[i] = t;
            this.armorCounts[i] = 1;
          }
        }
      }
      this.maxHealth = 20;
      this.health = clamp(Number(data.health) || 20, 0, this.maxHealth);
      this.maxHunger = 20;
      this.hunger = clamp(Number(data.hunger) || 20, 0, this.maxHunger);
      this.xp = clamp(Number(data.xp) || 0, 0, 1);
      this.xpLevel = Math.max(0, Math.floor(Number(data.xpLevel) || 0));
      return true;
    }

    return false;
  }
}

function entityAABB(x, y, z, radius, height) {
  return {
    minX: x - radius,
    maxX: x + radius,
    minY: y,
    maxY: y + height,
    minZ: z - radius,
    maxZ: z + radius
  };
}

function entityIntersectsBlock(x, y, z, radius, height, blockX, blockY, blockZ) {
  const aabb = entityAABB(x, y, z, radius, height);
  return (
    aabb.maxX > blockX &&
    aabb.minX < blockX + 1 &&
    aabb.maxY > blockY &&
    aabb.minY < blockY + 1 &&
    aabb.maxZ > blockZ &&
    aabb.minZ < blockZ + 1
  );
}

function entityWouldCollide(world, x, y, z, radius, height) {
  const aabb = entityAABB(x, y, z, radius, height);
  const minX = Math.floor(aabb.minX);
  const maxX = Math.floor(aabb.maxX - 0.00001);
  const minY = Math.floor(aabb.minY);
  const maxY = Math.floor(aabb.maxY - 0.00001);
  const minZ = Math.floor(aabb.minZ);
  const maxZ = Math.floor(aabb.maxZ - 0.00001);

  for (let bx = minX; bx <= maxX; bx += 1) {
    for (let by = minY; by <= maxY; by += 1) {
      for (let bz = minZ; bz <= maxZ; bz += 1) {
        if (isCollidable(world.getBlock(bx, by, bz)) && entityIntersectsBlock(x, y, z, radius, height, bx, by, bz)) {
          return true;
        }
      }
    }
  }
  return false;
}

function findWalkableY(world, x, z, hintY = SEA_LEVEL + 4, clearance = 2) {
  const blockX = Math.floor(x);
  const blockZ = Math.floor(z);
  const startY = clamp(Math.floor(hintY) + 3, 1, WORLD_HEIGHT - 3);
  const endY = Math.max(1, startY - 14);

  const canStandAt = (groundY) => {
    if (!isCollidable(world.getBlock(blockX, groundY, blockZ))) return false;
    for (let i = 1; i <= clearance; i += 1) {
      if (isCollidable(world.getBlock(blockX, groundY + i, blockZ))) return false;
    }
    return true;
  };

  for (let y = startY; y >= endY; y -= 1) {
    if (canStandAt(y)) {
      return y + 1.001;
    }
  }

  for (let y = WORLD_HEIGHT - 3; y >= 1; y -= 1) {
    if (canStandAt(y)) {
      return y + 1.001;
    }
  }
  return null;
}

function rayIntersectAABB(origin, direction, maxDistance, aabb) {
  let tMin = 0;
  let tMax = maxDistance;
  const axes = [
    ["x", "minX", "maxX"],
    ["y", "minY", "maxY"],
    ["z", "minZ", "maxZ"]
  ];

  for (const [axis, minKey, maxKey] of axes) {
    const d = direction[axis];
    const o = origin[axis];
    const min = aabb[minKey];
    const max = aabb[maxKey];
    if (Math.abs(d) < 1e-6) {
      if (o < min || o > max) {
        return null;
      }
      continue;
    }
    const inv = 1 / d;
    let t0 = (min - o) * inv;
    let t1 = (max - o) * inv;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMax < tMin) {
      return null;
    }
  }

  return tMin >= 0 && tMin <= maxDistance ? tMin : null;
}

class Mob {
  constructor(type = "zombie") {
    this.type = type;
    this.x = 0;
    this.y = SEA_LEVEL + 3;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = 0;
    this.onGround = false;
    this.goalX = null;
    this.goalZ = null;
    this.goalTimer = 0;
    this.grazeTimer = 0;
    this.fleeTimer = 0;
    this.jumpCooldown = 0;
    this.attackCooldown = 0;
    this.hurtTimer = 0;
    this.stuckTimer = 0;
    this.lastX = 0;
    this.lastZ = 0;
    this.maxHealth = getMobDef(type).maxHealth;
    this.health = this.maxHealth;
    this.age = 0;
    this.homeX = null;
    this.homeZ = null;
    this.turnBias = Math.random() < 0.5 ? -1 : 1;
    this.turnCooldown = 0;
    this.sunBurnTimer = 0;
  }

  get radius() {
    return getMobDef(this.type).radius;
  }

  get height() {
    return getMobDef(this.type).height;
  }

  setPosition(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.lastX = x;
    this.lastZ = z;
  }

  chooseGoal(world, minDistance = 2.5, maxDistance = 8, preferredYaw = Math.random() * Math.PI * 2) {
    for (let tries = 0; tries < 14; tries += 1) {
      const angle = preferredYaw + (Math.random() - 0.5) * Math.PI * 1.2;
      const dist = minDistance + Math.random() * (maxDistance - minDistance);
      const targetX = this.x + Math.sin(angle) * dist;
      const targetZ = this.z + Math.cos(angle) * dist;
      const targetY = findWalkableY(world, targetX, targetZ, this.y + 1, this.height > 1.2 ? 2 : 1);
      if (!Number.isFinite(targetY)) continue;
      if (Math.abs(targetY - this.y) > 2.4) continue;
      if (entityWouldCollide(world, targetX, targetY, targetZ, this.radius, this.height)) continue;
      this.goalX = targetX;
      this.goalZ = targetZ;
      this.goalTimer = 1.6 + Math.random() * 3.4;
      return true;
    }
    this.goalX = this.x;
    this.goalZ = this.z;
    this.goalTimer = 1;
    return false;
  }

  takeDamage(amount, sourceX = this.x, sourceZ = this.z) {
    const dmg = Math.max(0, Number(amount) || 0);
    if (dmg <= 0 || this.hurtTimer > 0.08) {
      return false;
    }
    this.health = Math.max(0, this.health - dmg);
    this.hurtTimer = 0.3;
    this.fleeTimer = getMobDef(this.type).hostile ? 0 : 2.8;
    const dx = this.x - sourceX;
    const dz = this.z - sourceZ;
    const len = Math.hypot(dx, dz) || 1;
    this.vx += (dx / len) * 3.2;
    this.vz += (dz / len) * 3.2;
    this.vy = Math.max(this.vy, 4.8);
    this.goalX = null;
    this.goalZ = null;
    return this.health <= 0;
  }

  _forwardBlocked(world, moveX, moveZ) {
    const len = Math.hypot(moveX, moveZ);
    if (len < 0.001) return "";
    const dirX = moveX / len;
    const dirZ = moveZ / len;
    const probeX = this.x + dirX * (this.radius + 0.22);
    const probeZ = this.z + dirZ * (this.radius + 0.22);
    const footY = Math.floor(this.y + 0.05);
    const headY = Math.floor(this.y + Math.min(this.height - 0.2, 1.1));
    const frontFeet = world.getBlock(Math.floor(probeX), footY, Math.floor(probeZ));
    const frontHead = world.getBlock(Math.floor(probeX), headY, Math.floor(probeZ));
    const standY = findWalkableY(world, probeX, probeZ, this.y + 0.8, this.height > 1.2 ? 2 : 1);
    const dropTooFar = standY !== null && standY < this.y - 1.15;
    if (isCollidable(frontFeet) || isCollidable(frontHead)) {
      return "obstacle";
    }
    if (dropTooFar || standY === null) {
      return "ledge";
    }
    return "";
  }

  resolveAxis(world, axis, delta) {
    const r = this.radius;
    const h = this.height;
    let aabb = entityAABB(this.x, this.y, this.z, r, h);
    const minX = Math.floor(aabb.minX);
    const maxX = Math.floor(aabb.maxX - 0.00001);
    const minY = Math.floor(aabb.minY);
    const maxY = Math.floor(aabb.maxY - 0.00001);
    const minZ = Math.floor(aabb.minZ);
    const maxZ = Math.floor(aabb.maxZ - 0.00001);

    for (let bx = minX; bx <= maxX; bx += 1) {
      for (let by = minY; by <= maxY; by += 1) {
        for (let bz = minZ; bz <= maxZ; bz += 1) {
          if (!isCollidable(world.getBlock(bx, by, bz))) continue;
          if (!entityIntersectsBlock(this.x, this.y, this.z, r, h, bx, by, bz)) continue;

          if (axis === "x") {
            if (delta > 0) this.x = bx - r - 0.0001;
            else this.x = bx + 1 + r + 0.0001;
            this.vx = 0;
          } else if (axis === "z") {
            if (delta > 0) this.z = bz - r - 0.0001;
            else this.z = bz + 1 + r + 0.0001;
            this.vz = 0;
          } else if (axis === "y") {
            if (delta > 0) this.y = by - h - 0.0001;
            else {
              this.y = by + 1 + 0.0001;
              this.onGround = true;
            }
            this.vy = 0;
          }

          aabb = entityAABB(this.x, this.y, this.z, r, h);
        }
      }
    }
  }

  update(dt, world, player) {
    const def = getMobDef(this.type);
    this.age += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.goalTimer -= dt;
    this.grazeTimer = Math.max(0, this.grazeTimer - dt);
    this.fleeTimer = Math.max(0, this.fleeTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.turnCooldown = Math.max(0, this.turnCooldown - dt);

    const dxp = player.x - this.x;
    const dzp = player.z - this.z;
    const dist = Math.hypot(dxp, dzp);
    const distHome = Number.isFinite(this.homeX) && Number.isFinite(this.homeZ)
      ? Math.hypot((this.homeX || 0) - this.x, (this.homeZ || 0) - this.z)
      : Infinity;
    const isHostile = !!def.hostile;
    const shouldFlee = !isHostile && (this.fleeTimer > 0 || dist < (def.scareRange || 0));
    let targetX = this.goalX;
    let targetZ = this.goalZ;
    let desiredSpeed = 0;
    let preferredYaw = this.yaw;

    if (isHostile && dist < def.aggroRange) {
      targetX = player.x;
      targetZ = player.z;
      desiredSpeed = def.speed;
      preferredYaw = Math.atan2(dxp, dzp);
      this.goalTimer = Math.max(this.goalTimer, 0.2);
    } else if (!isHostile && Number.isFinite(this.homeX) && Number.isFinite(this.homeZ) && distHome > 10) {
      targetX = this.homeX;
      targetZ = this.homeZ;
      desiredSpeed = def.speed * 0.96;
      preferredYaw = Math.atan2(targetX - this.x, targetZ - this.z);
      this.goalTimer = Math.max(this.goalTimer, 0.8);
    } else if (shouldFlee) {
      const awayX = this.x - dxp;
      const awayZ = this.z - dzp;
      preferredYaw = Math.atan2(awayX, awayZ);
      if (!Number.isFinite(targetX) || !Number.isFinite(targetZ) || this.goalTimer <= 0) {
        this.chooseGoal(world, 5, 10, preferredYaw);
        targetX = this.goalX;
        targetZ = this.goalZ;
      }
      desiredSpeed = def.speed * 1.15;
    } else {
      const reached = Number.isFinite(targetX) && Number.isFinite(targetZ) && Math.hypot(targetX - this.x, targetZ - this.z) < 0.9;
      if (!Number.isFinite(targetX) || !Number.isFinite(targetZ) || this.goalTimer <= 0 || reached) {
        const baseYaw = Number.isFinite(this.homeX) && Number.isFinite(this.homeZ)
          ? Math.atan2(this.homeX - this.x, this.homeZ - this.z)
          : this.yaw;
        this.chooseGoal(world, 1.8, Number.isFinite(this.homeX) ? 5.5 : 7.5, baseYaw + this.turnBias * 0.45);
        targetX = this.goalX;
        targetZ = this.goalZ;
        this.grazeTimer = Math.random() < 0.28 ? 0.6 + Math.random() * 1.6 : 0;
      }
      desiredSpeed = this.grazeTimer > 0 ? 0 : def.speed * 0.9;
    }

    if (Number.isFinite(targetX) && Number.isFinite(targetZ)) {
      preferredYaw = Math.atan2(targetX - this.x, targetZ - this.z);
    }

    this.yaw = lerpAngle(this.yaw, preferredYaw, clamp(dt * 3.8, 0, 1));

    let moveX = Math.sin(this.yaw) * desiredSpeed;
    let moveZ = Math.cos(this.yaw) * desiredSpeed;
    const blockState = this._forwardBlocked(world, moveX, moveZ);
    if (blockState) {
      if (blockState === "obstacle" && this.onGround && this.jumpCooldown <= 0) {
        this.vy = Math.max(this.vy, 6.1);
        this.jumpCooldown = 0.6;
      } else if (!isHostile || blockState === "ledge") {
        if (this.turnCooldown <= 0) {
          this.turnBias *= -1;
          this.turnCooldown = 0.85;
        }
        this.chooseGoal(world, 2.2, 6.5, this.yaw + this.turnBias * (blockState === "ledge" ? 1.15 : 0.9));
      } else {
        if (this.turnCooldown <= 0) {
          this.turnBias *= -1;
          this.turnCooldown = 0.55;
        }
        this.goalX = this.x + Math.sin(this.yaw + this.turnBias * 0.92) * 3.2;
        this.goalZ = this.z + Math.cos(this.yaw + this.turnBias * 0.92) * 3.2;
        this.goalTimer = 0.9;
      }
      moveX *= 0.2;
      moveZ *= 0.2;
    }

    const accel = this.onGround ? 11 : 4;
    this.vx = lerp(this.vx, moveX, clamp(accel * dt, 0, 1));
    this.vz = lerp(this.vz, moveZ, clamp(accel * dt, 0, 1));
    if (desiredSpeed <= 0.001 && this.onGround) {
      this.vx = lerp(this.vx, 0, clamp(dt * 10, 0, 1));
      this.vz = lerp(this.vz, 0, clamp(dt * 10, 0, 1));
    }

    // Gravity.
    this.vy -= 22 * dt;
    this.vy = Math.max(this.vy, -28);
    this.onGround = false;

    // Integrate + collide.
    this.x += this.vx * dt;
    this.resolveAxis(world, "x", this.vx * dt);

    this.z += this.vz * dt;
    this.resolveAxis(world, "z", this.vz * dt);

    this.y += this.vy * dt;
    this.resolveAxis(world, "y", this.vy * dt);

    const moved = Math.hypot(this.x - this.lastX, this.z - this.lastZ);
    if (desiredSpeed > 0.2 && moved < 0.02) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.75) {
        this.turnBias *= -1;
        this.chooseGoal(world, 2.2, 6.8, this.yaw + this.turnBias * 1.15);
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = this.x;
    this.lastZ = this.z;

    if (this.y < -40) {
      const spawn = world.findSpawn(Math.floor(player.x), Math.floor(player.z));
      const jitter = (random2(Math.floor(this.x), Math.floor(this.z), world.seed + 777) - 0.5) * 6;
      this.setPosition(spawn.x + jitter, spawn.y, spawn.z);
    }
  }
}

function lerpAngle(a, b, t) {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

class VoxelRenderer {
  constructor(canvas, ctx, world, player, textures, settings) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.world = world;
    this.player = player;
    this.textures = textures;
    this.settings = settings;
    this.renderDistanceChunks = settings.renderDistanceChunks || DEFAULT_RENDER_DISTANCE;
    this.showDebug = false;
    this.frameStats = { facesDrawn: 0, chunksVisible: 0, meshFaces: 0 };
    this.fov = Math.PI / 3.05;
    this.cloudTime = 0;
    this.skyFog = rgb(192, 226, 248);
    this.sunColor = rgb(255, 236, 178);
  }

  setSettings(settings) {
    this.settings = settings;
  }

  setRenderDistance(distance) {
    this.renderDistanceChunks = clamp(distance, 1, 6);
    this.settings.renderDistanceChunks = this.renderDistanceChunks;
  }

  uiScale() {
    const cssWidth = Math.max(window.innerWidth || 1, 1);
    return Math.max(1, this.canvas.width / cssWidth);
  }

  beginProjection() {
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.cameraX = this.player.x;
    this.cameraY = this.player.y + PLAYER_EYE_HEIGHT;
    this.cameraZ = this.player.z;
    this.sinYaw = Math.sin(this.player.yaw);
    this.cosYaw = Math.cos(this.player.yaw);
    this.sinPitch = Math.sin(this.player.pitch);
    this.cosPitch = Math.cos(this.player.pitch);
    this.focalLength = (this.height * 0.5) / Math.tan(this.fov / 2);
  }

  toCameraSpace(x, y, z) {
    const dx = x - this.cameraX;
    const dy = y - this.cameraY;
    const dz = z - this.cameraZ;
    const localX = dx * this.cosYaw - dz * this.sinYaw;
    const localZ = dx * this.sinYaw + dz * this.cosYaw;
    const rotatedY = dy * this.cosPitch - localZ * this.sinPitch;
    const rotatedZ = dy * this.sinPitch + localZ * this.cosPitch;
    return { x: localX, y: rotatedY, z: rotatedZ };
  }

  projectPoint(x, y, z) {
    const camera = this.toCameraSpace(x, y, z);
    if (camera.z <= 0.02) {
      return null;
    }
    return {
      x: this.centerX + (camera.x / camera.z) * this.focalLength,
      y: this.centerY - (camera.y / camera.z) * this.focalLength,
      depth: camera.z
    };
  }

  projectPointClamped(x, y, z) {
    const camera = this.toCameraSpace(x, y, z);
    if (camera.z <= -0.12) {
      return null;
    }
    const depth = Math.max(camera.z, 0.02);
    return {
      x: this.centerX + (camera.x / depth) * this.focalLength,
      y: this.centerY - (camera.y / depth) * this.focalLength,
      depth
    };
  }

  drawBackground(dt) {
    this.cloudTime += dt;
    const ctx = this.ctx;
    const horizon = clamp(this.height * (0.56 + this.player.pitch * 0.17), this.height * 0.18, this.height * 0.84);
    const cycle = getDayCycleInfo(worldTime);
    const skyTop = mixRgb(rgb(99, 183, 255), rgb(18, 24, 56), cycle.darkness * 0.92);
    const skyMid = mixRgb(rgb(143, 209, 255), rgb(48, 72, 118), cycle.darkness * 0.82);
    const skyBot = mixRgb(rgb(216, 243, 255), rgb(106, 118, 160), cycle.darkness * 0.64);

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, rgba(skyTop, 1));
    sky.addColorStop(0.56, rgba(skyMid, 1));
    sky.addColorStop(1, rgba(skyBot, 1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, horizon);

    const haze = ctx.createLinearGradient(0, horizon, 0, this.height);
    haze.addColorStop(0, rgba(mixRgb(rgb(204, 228, 216), rgb(70, 86, 116), cycle.darkness * 0.7), 0.96));
    haze.addColorStop(1, rgba(mixRgb(rgb(92, 156, 106), rgb(32, 44, 66), cycle.darkness * 0.78), 0.92));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon, this.width, this.height - horizon);

    const sunX = this.width * 0.84;
    const sunY = this.height * 0.18;
    const sunSize = 20 * this.uiScale();
    if (!cycle.isNight || cycle.phase === "Sunrise" || cycle.phase === "Sunset") {
      ctx.fillStyle = rgba(this.sunColor, 0.18 * cycle.daylight);
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunSize * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(this.sunColor, 0.98 * cycle.daylight);
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunSize, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(226,232,255,0.14)";
      ctx.beginPath();
      ctx.arc(this.width * 0.78, this.height * 0.16, sunSize * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(240,244,255,0.88)";
      ctx.beginPath();
      ctx.arc(this.width * 0.78, this.height * 0.16, sunSize * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let index = 0; index < 7; index += 1) {
      const offset = ((this.cloudTime * (16 + index * 3) + index * 220) % (this.width + 480)) - 260;
      const y = this.height * (0.16 + index * 0.044);
      const width = (80 + index * 18) * this.uiScale();
      const height = (18 + index * 4) * this.uiScale();
      ctx.fillStyle = `rgba(255,255,255,${0.42 - cycle.darkness * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(offset, y, width, height, 0, 0, Math.PI * 2);
      ctx.ellipse(offset + width * 0.46, y - height * 0.18, width * 0.76, height * 0.88, 0, 0, Math.PI * 2);
      ctx.ellipse(offset - width * 0.34, y + height * 0.07, width * 0.62, height * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  computeFaceStyle(face, depth) {
    const baseColor = getFaceColor(face.type, face.faceId);
    const faceDef = FACE_BY_ID[face.faceId];
    const jitter = 0.95 + random3(face.x, face.y, face.z, face.type * 97 + face.faceId.length) * 0.1;
    const lit = scaleRgb(baseColor, faceDef.light * jitter);
    const fog = clamp((depth - 10) / ((this.renderDistanceChunks + 0.75) * CHUNK_SIZE), 0, 1) * 0.78;
    const texture = this.textures?.getBlockFaceTexture(face.type, face.faceId, this.settings) || null;
    const alpha = BLOCK_INFO[face.type].alpha;
    return {
      texture,
      tint: rgba(lit, texture ? 0.18 : alpha),
      fill: rgba(mixRgb(lit, this.skyFog, fog), alpha),
      stroke: rgba(scaleRgb(lit, 0.7), alpha < 1 ? Math.min(1, alpha + 0.18) : 0.34),
      shadowAlpha: clamp((1 - faceDef.light * jitter) * 0.45, 0.02, 0.28),
      fogAlpha: fog * 0.68,
      alpha,
      lineWidth: texture ? 0 : depth < 11 ? Math.max(1, this.uiScale()) : 0
    };
  }

  collectFaces() {
    const faces = [];
    const playerChunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(this.player.z / CHUNK_SIZE);
    const maxDistance = (this.renderDistanceChunks + 0.75) * CHUNK_SIZE;
    const maxDistanceSq = maxDistance * maxDistance;
    const forward = this.player.getLookVector();

    let chunksVisible = 0;
    let meshFaces = 0;

    for (let chunkX = playerChunkX - this.renderDistanceChunks; chunkX <= playerChunkX + this.renderDistanceChunks; chunkX += 1) {
      for (let chunkZ = playerChunkZ - this.renderDistanceChunks; chunkZ <= playerChunkZ + this.renderDistanceChunks; chunkZ += 1) {
        const chunk = this.world.peekChunk(chunkX, chunkZ);
        if (!chunk) {
          continue;
        }

        chunksVisible += 1;
        const mesh = this.world.getChunkMesh(chunkX, chunkZ);
        meshFaces += mesh.length;

        for (const face of mesh) {
          const faceDef = FACE_BY_ID[face.faceId];
          const centerX = face.x + 0.5 + faceDef.normal.x * 0.5;
          const centerY = face.y + 0.5 + faceDef.normal.y * 0.5;
          const centerZ = face.z + 0.5 + faceDef.normal.z * 0.5;
          const toCameraX = this.cameraX - centerX;
          const toCameraY = this.cameraY - centerY;
          const toCameraZ = this.cameraZ - centerZ;
          const facing = faceDef.normal.x * toCameraX + faceDef.normal.y * toCameraY + faceDef.normal.z * toCameraZ;

          if (facing <= 0) {
            continue;
          }

          const dx = centerX - this.cameraX;
          const dy = centerY - this.cameraY;
          const dz = centerZ - this.cameraZ;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq > maxDistanceSq * 1.45) {
            continue;
          }

          const alignment = (dx * forward.x + dy * forward.y + dz * forward.z) / Math.sqrt(Math.max(distSq, 0.0001));
          if (alignment < -0.45 && distSq > 20) {
            continue;
          }

          const points = [];
          let depth = 0;
          let visible = true;

          for (const corner of faceDef.corners) {
            let projected = this.projectPoint(face.x + corner[0], face.y + corner[1], face.z + corner[2]);
            if (!projected) {
              projected = this.projectPointClamped(face.x + corner[0], face.y + corner[1], face.z + corner[2]);
            }
            if (!projected) {
              visible = false;
              break;
            }
            depth += projected.depth;
            points.push(projected);
          }

          if (!visible) {
            continue;
          }

          if (
            points.every((point) => point.x < -140) ||
            points.every((point) => point.x > this.width + 140) ||
            points.every((point) => point.y < -140) ||
            points.every((point) => point.y > this.height + 140)
          ) {
            continue;
          }

          const averageDepth = depth / 4;
          faces.push({
            points,
            depth: averageDepth,
            faceId: face.faceId,
            style: this.computeFaceStyle(face, averageDepth)
          });
        }
      }
    }

    faces.sort((a, b) => b.depth - a.depth);
    this.frameStats = {
      facesDrawn: faces.length,
      chunksVisible,
      meshFaces
    };
    return faces;
  }

  withQuadPath(points) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.closePath();
  }

  withTriPath(a, b, c) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
  }

  // Affine-maps a texture onto a screen-space triangle.
  // This removes the "swimming/rotating" look from the canvas fallback.
  drawTexturedTriangle(img, p0, p1, p2, u0, v0, u1, v1, u2, v2, alpha) {
    const ctx = this.ctx;
    const denom = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if (Math.abs(denom) < 1e-6) {
      return;
    }

    const a = (p0.x * (v1 - v2) + p1.x * (v2 - v0) + p2.x * (v0 - v1)) / denom;
    const c = (p0.x * (u2 - u1) + p1.x * (u0 - u2) + p2.x * (u1 - u0)) / denom;
    const e =
      (p0.x * (u1 * v2 - u2 * v1) + p1.x * (u2 * v0 - u0 * v2) + p2.x * (u0 * v1 - u1 * v0)) / denom;

    const b = (p0.y * (v1 - v2) + p1.y * (v2 - v0) + p2.y * (v0 - v1)) / denom;
    const d = (p0.y * (u2 - u1) + p1.y * (u0 - u2) + p2.y * (u1 - u0)) / denom;
    const f =
      (p0.y * (u1 * v2 - u2 * v1) + p1.y * (u2 * v0 - u0 * v2) + p2.y * (u0 * v1 - u1 * v0)) / denom;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.withTriPath(p0, p1, p2);
    ctx.clip();

    ctx.globalAlpha = alpha;
    ctx.setTransform(a, b, c, d, e, f);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  drawTexturedQuad(img, points, alpha, flipV = false) {
    const w = img.width || 1;
    const h = img.height || 1;
    const p0 = points[0], p1 = points[1], p2 = points[2], p3 = points[3];
    // Two triangles with matching UVs.
    if (!flipV) {
      this.drawTexturedTriangle(img, p0, p1, p2, 0, 0, w, 0, w, h, alpha);
      this.drawTexturedTriangle(img, p0, p2, p3, 0, 0, w, h, 0, h, alpha);
    } else {
      // Flip vertically (fixes grass side orientation in canvas fallback).
      this.drawTexturedTriangle(img, p0, p1, p2, 0, h, w, h, w, 0, alpha);
      this.drawTexturedTriangle(img, p0, p2, p3, 0, h, w, 0, 0, 0, alpha);
    }
  }

  drawFace(face) {
    const ctx = this.ctx;
    const points = face.points;
    const style = face.style;

    ctx.save();
    this.withQuadPath(points);
    ctx.clip();

    if (style.texture) {
      const flipV = face.faceId !== "top" && face.faceId !== "bottom";
      this.drawTexturedQuad(style.texture, points, style.alpha, flipV);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = style.tint;
      this.withQuadPath(points);
      ctx.fill();
      ctx.fillStyle = `rgba(0,0,0,${style.shadowAlpha})`;
      this.withQuadPath(points);
      ctx.fill();
      if (style.fogAlpha > 0.01) {
        ctx.fillStyle = `rgba(${this.skyFog[0]},${this.skyFog[1]},${this.skyFog[2]},${style.fogAlpha})`;
        this.withQuadPath(points);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = style.fill;
      this.withQuadPath(points);
      ctx.fill();
    }
    ctx.restore();

    if (style.lineWidth > 0) {
      ctx.lineWidth = style.lineWidth;
      ctx.strokeStyle = style.stroke;
      this.withQuadPath(points);
      ctx.stroke();
    }
  }

  drawWorld() {
    const faces = this.collectFaces();
    for (const face of faces) {
      this.drawFace(face);
    }
  }

  drawMobs(mobs) {
    if (!mobs || mobs.length === 0) return;
    const ctx = this.ctx;
    const scale = this.uiScale();
    for (const mob of mobs) {
      const foot = this.projectPoint(mob.x, mob.y + 0.05, mob.z);
      const head = this.projectPoint(mob.x, mob.y + mob.height, mob.z);
      if (!foot || !head) continue;
      const height = Math.max(8 * scale, Math.abs(foot.y - head.y));
      const width = height * 0.6;
      const x = foot.x - width / 2;
      const y = Math.min(foot.y, head.y);
      const tex = this.entityTextures?.getImage(mob.type) || null;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (tex) {
        ctx.globalAlpha = 0.96;
        ctx.drawImage(tex, x, y, width, height);
      } else {
        ctx.fillStyle = mob.type === "zombie" ? "rgba(60,210,120,0.92)" : "rgba(240,240,240,0.92)";
        ctx.fillRect(x, y, width, height);
      }
      ctx.restore();
    }
  }

  drawItems(items) {
    if (!items || items.length === 0) return;
    const ctx = this.ctx;
    const scale = this.uiScale();
    for (const item of items) {
      const bob = Math.sin(item.age * 6) * 0.08;
      const p = this.projectPoint(item.x, item.y + bob, item.z);
      if (!p) continue;
      const size = clamp((240 / Math.max(0.2, p.depth)) * scale, 10 * scale, 22 * scale);
      const tex = this.textures?.getItemTexture(item.itemType ?? item.blockType, this.settings) || null;
      ctx.save();
      ctx.globalAlpha = 0.95;
      if (tex) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tex, p.x - size / 2, p.y - size / 2, size, size);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.restore();
    }
  }

  drawBlockOutline(blockX, blockY, blockZ) {
    const corners = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1]
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const projected = [];
    for (const corner of corners) {
      const point = this.projectPoint(blockX + corner[0], blockY + corner[1], blockZ + corner[2]);
      if (!point) {
        return;
      }
      projected.push(point);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = Math.max(1.2 * this.uiScale(), 1);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.shadowColor = "rgba(255,255,255,0.55)";
    ctx.shadowBlur = 12 * this.uiScale();
    for (const edge of edges) {
      ctx.beginPath();
      ctx.moveTo(projected[edge[0]].x, projected[edge[0]].y);
      ctx.lineTo(projected[edge[1]].x, projected[edge[1]].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCrosshair() {
    const ctx = this.ctx;
    const scale = this.uiScale();
    const size = 7 * scale;
    const gap = 4 * scale;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = Math.max(1.5 * scale, 1);
    ctx.beginPath();
    ctx.moveTo(this.centerX - gap - size, this.centerY);
    ctx.lineTo(this.centerX - gap, this.centerY);
    ctx.moveTo(this.centerX + gap, this.centerY);
    ctx.lineTo(this.centerX + gap + size, this.centerY);
    ctx.moveTo(this.centerX, this.centerY - gap - size);
    ctx.lineTo(this.centerX, this.centerY - gap);
    ctx.moveTo(this.centerX, this.centerY + gap);
    ctx.lineTo(this.centerX, this.centerY + gap + size);
    ctx.stroke();
    ctx.restore();
  }

  drawSlotPreview(x, y, size, blockType) {
    const ctx = this.ctx;
    const pad = size * 0.18;
    const texture = this.textures?.getBlockFaceTexture(blockType, "top", this.settings);
    if (texture) {
      ctx.drawImage(texture, x + pad, y + pad, size - pad * 2, size - pad * 2);
    } else {
      ctx.fillStyle = rgba(BLOCK_INFO[blockType].palette.top, 1);
      ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = Math.max(1, this.uiScale());
    ctx.strokeRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
  }

  drawHotbar(selectedSlot) {
    const ctx = this.ctx;
    const scale = this.uiScale();
    const slotSize = 42 * scale;
    const gap = 7 * scale;
    const totalWidth = slotSize * HOTBAR_BLOCKS.length + gap * (HOTBAR_BLOCKS.length - 1);
    const startX = this.centerX - totalWidth / 2;
    const y = this.height - 62 * scale;

    ctx.fillStyle = "rgba(12,18,28,0.58)";
    ctx.fillRect(startX - 12 * scale, y - 12 * scale, totalWidth + 24 * scale, slotSize + 24 * scale);

    for (let index = 0; index < HOTBAR_BLOCKS.length; index += 1) {
      const x = startX + index * (slotSize + gap);
      const blockType = HOTBAR_BLOCKS[index];
      const active = index === selectedSlot;
      ctx.fillStyle = active ? "rgba(244, 201, 92, 0.96)" : "rgba(32,45,61,0.92)";
      ctx.fillRect(x, y, slotSize, slotSize);
      ctx.strokeStyle = active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.18)";
      ctx.lineWidth = Math.max(2 * scale, 1);
      ctx.strokeRect(x, y, slotSize, slotSize);
      this.drawSlotPreview(x, y, slotSize, blockType);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `${Math.round(11 * scale)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1), x + slotSize / 2, y + slotSize + 14 * scale);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = `${Math.round(14 * scale)}px monospace`;
    ctx.fillText(BLOCK_INFO[HOTBAR_BLOCKS[selectedSlot]].name, this.centerX, y - 10 * scale);
  }

  drawPanel(x, y, width, height, alpha = 0.8) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(7,10,18,${alpha})`;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = Math.max(2 * this.uiScale(), 1);
    ctx.strokeRect(x, y, width, height);
  }

  drawButton(button, hovered) {
    const ctx = this.ctx;
    const scale = this.uiScale();
    const grad = ctx.createLinearGradient(button.x, button.y, button.x, button.y + button.h);
    if (hovered) {
      grad.addColorStop(0, "rgba(82,164,255,0.98)");
      grad.addColorStop(1, "rgba(48,106,204,0.98)");
    } else {
      grad.addColorStop(0, "rgba(40,58,86,0.96)");
      grad.addColorStop(1, "rgba(22,30,46,0.96)");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(button.x, button.y, button.w, button.h);
    ctx.strokeStyle = hovered ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.24)";
    ctx.lineWidth = Math.max(2 * scale, 1);
    ctx.strokeRect(button.x, button.y, button.w, button.h);
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.textAlign = "center";
    ctx.font = `${Math.round(18 * scale)}px monospace`;
    ctx.fillText(button.label, button.x + button.w / 2, button.y + button.h / 2 + 6 * scale);
  }

  drawTitleScreen(buttons, hoveredButton, hasSave) {
    const ctx = this.ctx;
    const scale = this.uiScale();
    const width = 620 * scale;
    const height = 390 * scale;
    const x = this.centerX - width / 2;
    const y = this.centerY - height / 2;
    this.drawPanel(x, y, width, height, 0.72);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.font = `${Math.round(56 * scale)}px monospace`;
    ctx.fillText("FREECUBE", this.centerX, y + 86 * scale);
    ctx.fillStyle = "rgba(129,224,255,0.98)";
    ctx.font = `${Math.round(17 * scale)}px monospace`;
    ctx.fillText("Minecraft-style voxel sandbox in the browser", this.centerX, y + 118 * scale);
    ctx.fillStyle = "rgba(248,209,102,0.96)";
    ctx.font = `${Math.round(13 * scale)}px monospace`;
    ctx.fillText("Static world. No server. PNG tile textures. Local saves only.", this.centerX, y + 146 * scale);

    const previewY = y + 172 * scale;
    const previewSize = 58 * scale;
    const previewGap = 14 * scale;
    const previewStart = this.centerX - ((previewSize * 5 + previewGap * 4) / 2);
    const previewBlocks = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.WOOD, BLOCK.LEAVES];
    for (let index = 0; index < previewBlocks.length; index += 1) {
      const px = previewStart + index * (previewSize + previewGap);
      ctx.fillStyle = "rgba(18,24,35,0.88)";
      ctx.fillRect(px, previewY, previewSize, previewSize);
      this.drawSlotPreview(px, previewY, previewSize, previewBlocks[index]);
    }

    buttons.forEach((button) => {
      this.drawButton(button, hoveredButton === button.id);
    });

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `${Math.round(12 * scale)}px monospace`;
    ctx.fillText(hasSave ? "Continue keeps your browser save." : "Start creates a fresh local save.", this.centerX, y + height - 24 * scale);
  }

  drawSettingsScreen(buttons, hoveredButton, settings) {
    const ctx = this.ctx;
    const scale = this.uiScale();
    const width = 700 * scale;
    const height = 420 * scale;
    const x = this.centerX - width / 2;
    const y = this.centerY - height / 2;
    this.drawPanel(x, y, width, height, 0.78);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.font = `${Math.round(42 * scale)}px monospace`;
    ctx.fillText("SETTINGS", this.centerX, y + 58 * scale);

    const lines = [
      `Render Distance: ${settings.renderDistanceChunks}`,
      `Mouse Sensitivity: ${settings.mouseSensitivity.toFixed(4)}`,
      `Invert Y: ${settings.invertY ? "ON" : "OFF"}`
    ];
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(224,237,246,0.98)";
    ctx.font = `${Math.round(18 * scale)}px monospace`;
    lines.forEach((line, index) => {
      ctx.fillText(line, x + 56 * scale, y + 132 * scale + index * 72 * scale);
    });

    buttons.forEach((button) => {
      this.drawButton(button, hoveredButton === button.id);
    });
  }

  drawPauseScreen(buttons, hoveredButton) {
    const ctx = this.ctx;
    const scale = this.uiScale();
    const width = 430 * scale;
    const height = 320 * scale;
    const x = this.centerX - width / 2;
    const y = this.centerY - height / 2;
    this.drawPanel(x, y, width, height, 0.8);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.font = `${Math.round(36 * scale)}px monospace`;
    ctx.fillText("PAUSED", this.centerX, y + 56 * scale);
    buttons.forEach((button) => {
      this.drawButton(button, hoveredButton === button.id);
    });
  }

  drawPlayPrompt() {
    const ctx = this.ctx;
    const scale = this.uiScale();
    const width = 430 * scale;
    const height = 140 * scale;
    const x = this.centerX - width / 2;
    const y = this.centerY - height / 2;
    this.drawPanel(x, y, width, height, 0.74);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.font = `${Math.round(28 * scale)}px monospace`;
    ctx.fillText("CLICK TO PLAY", this.centerX, y + 48 * scale);
    ctx.fillStyle = "rgba(168,227,255,0.96)";
    ctx.font = `${Math.round(14 * scale)}px monospace`;
    ctx.fillText("Mouse lock starts first-person controls", this.centerX, y + 82 * scale);
    ctx.fillText("ESC pauses and opens the menu", this.centerX, y + 106 * scale);
  }

  drawLoading(progress, loaded, total, textureProgress) {
    const ctx = this.ctx;
    const scale = this.uiScale();
    const barWidth = 360 * scale;
    const barHeight = 18 * scale;
    const x = this.centerX - barWidth / 2;
    const y = this.centerY + 18 * scale;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.font = `${Math.round(34 * scale)}px monospace`;
    ctx.fillText("BUILDING WORLD", this.centerX, this.centerY - 42 * scale);
    ctx.fillStyle = "rgba(130,217,255,0.98)";
    ctx.font = `${Math.round(13 * scale)}px monospace`;
    ctx.fillText("Loading terrain and PNG block textures", this.centerX, this.centerY - 10 * scale);
    ctx.fillStyle = "rgba(18,24,35,0.9)";
    ctx.fillRect(x - 2 * scale, y - 2 * scale, barWidth + 4 * scale, barHeight + 4 * scale);
    ctx.fillStyle = "rgba(94,236,171,0.96)";
    ctx.fillRect(x, y, barWidth * progress, barHeight);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = Math.max(1.5 * scale, 1);
    ctx.strokeRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `${Math.round(12 * scale)}px monospace`;
    ctx.fillText(`${loaded} / ${total} chunks`, this.centerX, y + 34 * scale);
    ctx.fillText(`Texture pack ${(textureProgress * 100).toFixed(0)}%`, this.centerX, y + 54 * scale);
  }

  drawNotices(notices) {
    const ctx = this.ctx;
    const scale = this.uiScale();
    const startX = this.width - 18 * scale;
    let y = 18 * scale;
    ctx.textAlign = "right";
    for (const notice of notices) {
      const alpha = clamp(notice.ttl / notice.duration, 0, 1);
      ctx.fillStyle = `rgba(12, 16, 26, ${0.62 * alpha})`;
      ctx.fillRect(startX - 340 * scale, y, 322 * scale, 28 * scale);
      ctx.fillStyle = `rgba(255,255,255,${0.95 * alpha})`;
      ctx.font = `${Math.round(12 * scale)}px monospace`;
      ctx.fillText(notice.text, startX - 12 * scale, y + 18 * scale);
      y += 34 * scale;
    }
  }

  drawDebug(currentTarget) {
    if (!this.showDebug) {
      return;
    }
    const ctx = this.ctx;
    const scale = this.uiScale();
    const playerChunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(this.player.z / CHUNK_SIZE);
    const lines = [
      `FreeCube2 ${GAME_VERSION}`,
      `Pos ${this.player.x.toFixed(2)} ${this.player.y.toFixed(2)} ${this.player.z.toFixed(2)}`,
      `Yaw ${Math.round((this.player.yaw * 180) / Math.PI)} Pitch ${Math.round((this.player.pitch * 180) / Math.PI)}`,
      `Chunk ${playerChunkX}, ${playerChunkZ}`,
      `Faces ${this.frameStats.facesDrawn} / mesh ${this.frameStats.meshFaces}`,
      `Visible chunks ${this.frameStats.chunksVisible} / loaded ${this.world.chunks.size}`,
      `Modified blocks ${this.world.getModifiedBlockCount()}`,
      `Render distance ${this.renderDistanceChunks}`
    ];
    if (currentTarget) {
      lines.push(`Target ${BLOCK_INFO[currentTarget.type].name} @ ${currentTarget.x}, ${currentTarget.y}, ${currentTarget.z}`);
    }
    ctx.fillStyle = "rgba(10,14,20,0.72)";
    ctx.fillRect(16 * scale, 16 * scale, 334 * scale, (lines.length * 17 + 14) * scale);
    ctx.fillStyle = "rgba(164,255,163,0.96)";
    ctx.textAlign = "left";
    ctx.font = `${Math.round(12 * scale)}px monospace`;
    lines.forEach((line, index) => {
      ctx.fillText(line, 26 * scale, (31 + index * 17) * scale);
    });
  }

  renderFrame(dt, state, ui, currentTarget) {
    this.beginProjection();
    this.drawBackground(dt);

    // Canvas fallback now uses the DOM HUD/menus (same as WebGL mode),
    // so the renderer only draws the 3D world.
    this.drawWorld();
    this.drawItems(this.items || []);
    this.drawMobs(this.mobs || []);
    if (currentTarget) {
      this.drawBlockOutline(currentTarget.x, currentTarget.y, currentTarget.z);
    }
    this.drawDebug(currentTarget);
  }
}

function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function mat4Perspective(out, fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[15] = 0;

  if (far != null && far !== Infinity) {
    const nf = 1 / (near - far);
    out[10] = (far + near) * nf;
    out[14] = 2 * far * near * nf;
  } else {
    out[10] = -1;
    out[14] = -2 * near;
  }
  return out;
}

function mat4LookAt(out, eye, center, up) {
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz);
  if (len === 0) {
    zz = 1;
    len = 1;
  }
  zx /= len;
  zy /= len;
  zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz);
  if (len === 0) {
    xx = 1;
    len = 1;
  }
  xx /= len;
  xy /= len;
  xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Shader compile failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "Program link failed";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

class TextureArrayAtlas {
  constructor(gl, textures) {
    this.gl = gl;
    this.textures = textures;
    this.settings = textures?.settings || { ...DEFAULT_SETTINGS };
    this.texture = null;
    this.pathToLayer = new Map();
    this.layerCount = 0;
  }

  getLayerForPath(path) {
    return this.pathToLayer.get(path) ?? 0;
  }

  getLayerForBlockFace(blockType, faceId) {
    const path = getBlockTexturePath(blockType, faceId, this.settings);
    return this.getLayerForPath(path);
  }

  async build() {
    const gl = this.gl;
    await this.textures.startLoading();
    await this.textures.readyPromise;

    const uniquePaths = getAllBlockTexturePaths().sort();

    this.pathToLayer.clear();
    uniquePaths.forEach((path, index) => this.pathToLayer.set(path, index));
    this.layerCount = Math.max(1, uniquePaths.length);

    const width = 128;
    const height = 128;
    const levels = 1;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, width, height, this.layerCount);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    for (let layer = 0; layer < uniquePaths.length; layer += 1) {
      const path = uniquePaths[layer];
      const image = this.textures.images.get(path);
      if (!image) {
        continue;
      }
      const source = image.width === width && image.height === height
        ? image
        : (() => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(image, 0, 0, width, height);
            return canvas;
          })();
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    this.texture = tex;
    return true;
  }
}

class GreedyChunkMesher {
  constructor(world, atlas) {
    this.world = world;
    this.atlas = atlas;
  }

  buildChunk(chunkX, chunkZ) {
    const baseX = chunkX * CHUNK_SIZE;
    const baseZ = chunkZ * CHUNK_SIZE;
    const size = [CHUNK_SIZE, WORLD_HEIGHT, CHUNK_SIZE];
    const verticesOpaque = [];
    const indicesOpaque = [];
    const verticesTrans = [];
    const indicesTrans = [];

    const pushQuad = (vertexArray, indexArray, quadVerts, normal, uv, layer, light) => {
      const startIndex = (vertexArray.length / 10) | 0;
      for (let i = 0; i < 4; i += 1) {
        const v = quadVerts[i];
        vertexArray.push(
          v[0], v[1], v[2],
          normal[0], normal[1], normal[2],
          uv[i][0], uv[i][1],
          layer,
          light
        );
      }
      indexArray.push(
        startIndex, startIndex + 1, startIndex + 2,
        startIndex, startIndex + 2, startIndex + 3
      );
    };

    // IMPORTANT: Use peekBlock so meshing doesn't force-generate neighbor chunks.
    // This is a huge performance win and prevents runaway chunk loading.
    const getBlock = (lx, y, lz) => this.world.peekBlock(baseX + lx, y, baseZ + lz);

    const axisInfo = [
      { d: 0, u: 1, v: 2, posFace: "east", negFace: "west" },
      { d: 1, u: 2, v: 0, posFace: "top", negFace: "bottom" },
      { d: 2, u: 1, v: 0, posFace: "south", negFace: "north" }
    ];

    for (const info of axisInfo) {
      const d = info.d;
      const u = info.u;
      const v = info.v;
      const du = [0, 0, 0];
      const dv = [0, 0, 0];

      for (const dir of [-1, 1]) {
        const faceId = dir === 1 ? info.posFace : info.negFace;
        const normal = d === 0 ? [dir, 0, 0] : d === 1 ? [0, dir, 0] : [0, 0, dir];
        const light = FACE_BY_ID[faceId]?.light ?? 1;
        const maskSizeU = size[u];
        const maskSizeV = size[v];
        const mask = new Array(maskSizeU * maskSizeV);

        for (let slice = 0; slice <= size[d]; slice += 1) {
          for (let iu = 0; iu < maskSizeU; iu += 1) {
            for (let iv = 0; iv < maskSizeV; iv += 1) {
              const coord = [0, 0, 0];
              coord[d] = slice;
              coord[u] = iu;
              coord[v] = iv;

              const aCoord = [...coord];
              const bCoord = [...coord];
              aCoord[d] = slice - 1;
              bCoord[d] = slice;

              const aType = getBlock(aCoord[0], aCoord[1], aCoord[2]);
              const bType = getBlock(bCoord[0], bCoord[1], bCoord[2]);
              const blockType = dir === 1 ? aType : bType;
              const neighborType = dir === 1 ? bType : aType;

              const index = iu * maskSizeV + iv;
              if (blockType !== BLOCK.AIR && shouldRenderFace(blockType, neighborType)) {
                mask[index] = {
                  blockType,
                  layer: this.atlas.getLayerForBlockFace(blockType, faceId),
                  transparent: !!BLOCK_INFO[blockType]?.transparent
                };
              } else {
                mask[index] = null;
              }
            }
          }

          for (let iu = 0; iu < maskSizeU; iu += 1) {
            for (let iv = 0; iv < maskSizeV; iv += 1) {
              const index = iu * maskSizeV + iv;
              const cell = mask[index];
              if (!cell) {
                continue;
              }

              let width = 1;
              while (iv + width < maskSizeV) {
                const next = mask[index + width];
                if (!next || next.blockType !== cell.blockType || next.layer !== cell.layer || next.transparent !== cell.transparent) {
                  break;
                }
                width += 1;
              }

              let height = 1;
              outer: while (iu + height < maskSizeU) {
                for (let k = 0; k < width; k += 1) {
                  const next = mask[index + k + height * maskSizeV];
                  if (!next || next.blockType !== cell.blockType || next.layer !== cell.layer || next.transparent !== cell.transparent) {
                    break outer;
                  }
                }
                height += 1;
              }

              const x = [0, 0, 0];
              x[d] = slice;
              x[u] = iu;
              x[v] = iv;

              du[0] = 0; du[1] = 0; du[2] = 0;
              dv[0] = 0; dv[1] = 0; dv[2] = 0;
              du[u] = height;
              dv[v] = width;

              const quad = [
                [baseX + x[0], x[1], baseZ + x[2]],
                [baseX + x[0] + dv[0], x[1] + dv[1], baseZ + x[2] + dv[2]],
                [baseX + x[0] + dv[0] + du[0], x[1] + dv[1] + du[1], baseZ + x[2] + dv[2] + du[2]],
                [baseX + x[0] + du[0], x[1] + du[1], baseZ + x[2] + du[2]]
              ];

              if (dir === -1) {
                [quad[1], quad[3]] = [quad[3], quad[1]];
              }

              const uv = [
                [0, 0],
                [width, 0],
                [width, height],
                [0, height]
              ];
              if (dir === -1) {
                // Keep UVs matched to vertices when we swap for winding.
                [uv[1], uv[3]] = [uv[3], uv[1]];
              }
              // Keep textures oriented consistently across faces.
              // Without this, some faces end up mirrored ("inverted") depending on face normal.
              if (cell.blockType !== BLOCK.LEAVES && (faceId === "south" || faceId === "west")) {
                for (let i = 0; i < 4; i += 1) {
                  uv[i][0] = width - uv[i][0];
                }
              }

              const targetVertices = cell.transparent ? verticesTrans : verticesOpaque;
              const targetIndices = cell.transparent ? indicesTrans : indicesOpaque;
              pushQuad(targetVertices, targetIndices, quad, normal, uv, cell.layer, light);

              for (let hu = 0; hu < height; hu += 1) {
                for (let wv = 0; wv < width; wv += 1) {
                  mask[index + wv + hu * maskSizeV] = null;
                }
              }

              iv += width - 1;
            }
          }
        }
      }
    }

    return {
      opaque: {
        vertices: new Float32Array(verticesOpaque),
        indices: new Uint32Array(indicesOpaque)
      },
      transparent: {
        vertices: new Float32Array(verticesTrans),
        indices: new Uint32Array(indicesTrans)
      }
    };
  }
}

class WebGLChunkMesh {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    this.indexCount = 0;
  }

  update(mesh) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.indexCount = mesh.indices.length;

    const stride = 10 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 8 * 4);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 9 * 4);

    gl.bindVertexArray(null);
  }

  draw() {
    const gl = this.gl;
    if (!this.indexCount) {
      return;
    }
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  destroy() {
    const gl = this.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.ibo) gl.deleteBuffer(this.ibo);
    this.vao = null;
    this.vbo = null;
    this.ibo = null;
    this.indexCount = 0;
  }
}

class WebGLVoxelRenderer {
  constructor(gl, world, player, atlas, settings) {
    this.gl = gl;
    this.world = world;
    this.player = player;
    this.atlas = atlas;
    this.settings = settings;
    this.renderDistanceChunks = settings.renderDistanceChunks || DEFAULT_RENDER_DISTANCE;
    this.chunkMeshes = new Map(); // chunkKey -> { opaque, transparent }
    this.chunkGenQueue = [];
    this.meshQueue = [];
    this.proj = mat4Identity();
    this.view = mat4Identity();
    this.fov = Math.PI / 3;
    this.targetBlock = null;
    this.textureLibrary = null;
    this.entityTextures = null;
    this.objModelLibrary = null;
    this._spriteTextures = new WeakMap();
    this._outline = this._createOutlineRenderer();
    this.entities = [];
    this._entities = this._createEntityRenderer();
    this._zombie = this._createZombieRenderer();
    this._objEntities = this._createObjEntityRenderer();

    this.program = createProgram(
      gl,
      `#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPos;
      layout(location=1) in vec3 aNormal;
      layout(location=2) in vec2 aUV;
      layout(location=3) in float aLayer;
      layout(location=4) in float aLight;
      uniform mat4 uProj;
      uniform mat4 uView;
      out vec2 vUV;
      flat out int vLayer;
      out float vLight;
      void main(){
        vUV = aUV;
        vLayer = int(aLayer + 0.5);
        vLight = aLight;
        gl_Position = uProj * uView * vec4(aPos, 1.0);
      }`,
      `#version 300 es
      precision highp float;
      precision highp sampler2DArray;
      uniform sampler2DArray uTex;
      in vec2 vUV;
      flat in int vLayer;
      in float vLight;
      out vec4 outColor;
      void main(){
        // Avoid sampling exactly on texel edges (nearest + fract causes visible seams).
        vec2 uv = fract(vUV);
        vec2 inset = vec2(0.5 / 128.0);
        uv = uv * (1.0 - inset * 2.0) + inset;
        vec4 tex = texture(uTex, vec3(uv, float(vLayer)));
        vec4 col = vec4(tex.rgb * vLight, tex.a);
        if(col.a < 0.06) discard;
        outColor = col;
      }`
    );

    this.uProj = gl.getUniformLocation(this.program, "uProj");
    this.uView = gl.getUniformLocation(this.program, "uView");
    this.uTex = gl.getUniformLocation(this.program, "uTex");

    this.mesher = new GreedyChunkMesher(world, atlas);

    gl.enable(gl.DEPTH_TEST);
    // Disable face culling: our greedy mesher can produce mixed winding on some GPUs/drivers.
    // Backface culling being wrong looks like "inside out" blocks.
    gl.disable(gl.CULL_FACE);
  }

  setRenderDistance(distance) {
    this.renderDistanceChunks = clamp(distance, 1, 6);
    this.settings.renderDistanceChunks = this.renderDistanceChunks;
  }

  setTargetBlock(target) {
    const next = target ? { x: target.x, y: target.y, z: target.z } : null;
    const prev = this.targetBlock;
    const changed = (!prev && !!next) || (!!prev && !next) || (prev && next && (prev.x !== next.x || prev.y !== next.y || prev.z !== next.z));
    this.targetBlock = next;
    if (changed) {
      this._outline.update(next);
    }
  }

  _withinDistance(dx, dz) {
    const r = this.renderDistanceChunks + 0.5;
    return dx * dx + dz * dz <= r * r;
  }

  queueChunk(chunkX, chunkZ) {
    const key = packChunkKey(chunkX, chunkZ);
    if (this.meshQueue.some((entry) => entry.key === key)) {
      return;
    }
    this.meshQueue.push({ key, chunkX, chunkZ });
  }

  queueChunkGeneration(chunkX, chunkZ) {
    const key = packChunkKey(chunkX, chunkZ);
    if (this.chunkGenQueue.some((entry) => entry.key === key)) {
      return;
    }
    this.chunkGenQueue.push({ key, chunkX, chunkZ });
  }

  updateQueue(limit = 1, budgetMs = 4) {
    const start = performance.now();
    for (let i = 0; i < limit && this.meshQueue.length > 0; i += 1) {
      const next = this.meshQueue.shift();
      this.rebuildChunk(next.chunkX, next.chunkZ);
      if (performance.now() - start >= budgetMs) {
        break;
      }
    }
  }

  rebuildChunk(chunkX, chunkZ) {
    const gl = this.gl;
    const key = packChunkKey(chunkX, chunkZ);
    const chunk = this.world.getChunk(chunkX, chunkZ);
    const built = this.mesher.buildChunk(chunkX, chunkZ);
    let record = this.chunkMeshes.get(key);
    if (!record) {
      record = {
        opaque: new WebGLChunkMesh(gl),
        transparent: new WebGLChunkMesh(gl)
      };
      this.chunkMeshes.set(key, record);
    }
    record.opaque.update(built.opaque);
    record.transparent.update(built.transparent);
    chunk.meshDirty = false;
  }

  ensureVisibleChunks(generateLimit = PLAY_CHUNK_GEN_LIMIT) {
    const playerChunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(this.player.z / CHUNK_SIZE);

    const visible = buildChunkLoadList(playerChunkX, playerChunkZ, this.renderDistanceChunks);
    for (const candidate of visible) {
      const dx = candidate.x - playerChunkX;
      const dz = candidate.z - playerChunkZ;
      if (!this._withinDistance(dx, dz)) continue;
      const key = packChunkKey(candidate.x, candidate.z);
      const chunk = this.world.peekChunk(candidate.x, candidate.z);
      if (!chunk) {
        this.queueChunkGeneration(candidate.x, candidate.z);
        continue;
      }
      if (chunk.meshDirty || !this.chunkMeshes.has(key)) {
        this.queueChunk(candidate.x, candidate.z);
      }
    }

    for (let i = 0; i < generateLimit && this.chunkGenQueue.length > 0; i += 1) {
      const next = this.chunkGenQueue.shift();
      const dx = next.chunkX - playerChunkX;
      const dz = next.chunkZ - playerChunkZ;
      if (!this._withinDistance(dx, dz)) continue;
      const chunk = this.world.getChunk(next.chunkX, next.chunkZ);
      if (chunk.meshDirty || !this.chunkMeshes.has(next.key)) {
        this.queueChunk(next.chunkX, next.chunkZ);
      }
    }
    this.world.unloadFarChunks(playerChunkX, playerChunkZ, this.renderDistanceChunks + 2);

    // Drop GPU meshes for chunks we unloaded.
    for (const [key, record] of this.chunkMeshes) {
      if (!this.world.chunks.has(key)) {
        record.opaque.destroy();
        record.transparent.destroy();
        this.chunkMeshes.delete(key);
      }
    }
    this.chunkGenQueue = this.chunkGenQueue.filter((entry) => {
      const dx = entry.chunkX - playerChunkX;
      const dz = entry.chunkZ - playerChunkZ;
      return this._withinDistance(dx, dz);
    });
  }

  updateCamera() {
    const gl = this.gl;
    const aspect = gl.canvas.width / gl.canvas.height;
    this.fov = ((this.settings?.fovDegrees || DEFAULT_SETTINGS.fovDegrees) * Math.PI) / 180;
    mat4Perspective(this.proj, this.fov, aspect, 0.02, 1200);
    const bobStrength = this.settings?.viewBobbing === false ? 0 : clamp(Math.hypot(this.player.vx, this.player.vz) / 5.4, 0, 1);
    const bobPhase = performance.now() * 0.012;
    const bobY = this.player.onGround ? Math.abs(Math.sin(bobPhase)) * 0.045 * bobStrength : 0;
    const bobX = this.player.onGround ? Math.cos(bobPhase * 0.5) * 0.028 * bobStrength : 0;
    const eye = [this.player.x + bobX, this.player.y + PLAYER_EYE_HEIGHT - bobY, this.player.z];
    const dir = this.player.getLookVector();
    const center = [eye[0] + dir.x, eye[1] + dir.y, eye[2] + dir.z];
    mat4LookAt(this.view, eye, center, [0, 1, 0]);
  }

  _getOrCreateSpriteTexture(image) {
    if (!image) {
      return null;
    }
    const existing = this._spriteTextures.get(image);
    if (existing) {
      return existing;
    }
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    this._spriteTextures.set(image, tex);
    return tex;
  }

  renderFrame() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uProj, false, this.proj);
    gl.uniformMatrix4fv(this.uView, false, this.view);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas.texture);
    gl.uniform1i(this.uTex, 0);

    gl.disable(gl.BLEND);
    gl.depthMask(true);

    const playerChunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(this.player.z / CHUNK_SIZE);

    for (let cx = playerChunkX - this.renderDistanceChunks; cx <= playerChunkX + this.renderDistanceChunks; cx += 1) {
      for (let cz = playerChunkZ - this.renderDistanceChunks; cz <= playerChunkZ + this.renderDistanceChunks; cz += 1) {
        if (!this._withinDistance(cx - playerChunkX, cz - playerChunkZ)) continue;
        const record = this.chunkMeshes.get(packChunkKey(cx, cz));
        if (!record) continue;
        record.opaque.draw();
      }
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    // Draw transparent chunks sorted back-to-front (chunk-level sort)
    const transparentDraw = [];
    for (let cx = playerChunkX - this.renderDistanceChunks; cx <= playerChunkX + this.renderDistanceChunks; cx += 1) {
      for (let cz = playerChunkZ - this.renderDistanceChunks; cz <= playerChunkZ + this.renderDistanceChunks; cz += 1) {
        if (!this._withinDistance(cx - playerChunkX, cz - playerChunkZ)) continue;
        const record = this.chunkMeshes.get(packChunkKey(cx, cz));
        if (!record) continue;
        const dx = (cx + 0.5) * CHUNK_SIZE - this.player.x;
        const dz = (cz + 0.5) * CHUNK_SIZE - this.player.z;
        transparentDraw.push({ record, dist: dx * dx + dz * dz });
      }
    }
    transparentDraw.sort((a, b) => b.dist - a.dist);
    for (const item of transparentDraw) {
      item.record.transparent.draw();
    }

    if (this.settings?.mobModels !== false) {
      this._objEntities.draw(this.proj, this.view, this.entities || []);
      this._zombie.draw(this.proj, this.view, this.entities || []);
    }
    this._entities.draw(this.proj, this.view, this.entities || []);

    // Outline is drawn last so it stays readable.
    this._outline.draw(this.proj, this.view);

    gl.depthMask(true);
  }

  _createOutlineRenderer() {
    const gl = this.gl;
    const program = createProgram(
      gl,
      `#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPos;
      uniform mat4 uProj;
      uniform mat4 uView;
      void main(){
        gl_Position = uProj * uView * vec4(aPos, 1.0);
      }`,
      `#version 300 es
      precision highp float;
      uniform vec4 uColor;
      out vec4 outColor;
      void main(){
        outColor = uColor;
      }`
    );

    const uProj = gl.getUniformLocation(program, "uProj");
    const uView = gl.getUniformLocation(program, "uView");
    const uColor = gl.getUniformLocation(program, "uColor");

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(24 * 3), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 3 * 4, 0);
    gl.bindVertexArray(null);

    const update = (block) => {
      if (!block) return;
      const eps = 0.01;
      const x0 = block.x - eps, y0 = block.y - eps, z0 = block.z - eps;
      const x1 = block.x + 1 + eps, y1 = block.y + 1 + eps, z1 = block.z + 1 + eps;
      const p = [
        // bottom square
        x0, y0, z0,  x1, y0, z0,
        x1, y0, z0,  x1, y0, z1,
        x1, y0, z1,  x0, y0, z1,
        x0, y0, z1,  x0, y0, z0,
        // top square
        x0, y1, z0,  x1, y1, z0,
        x1, y1, z0,  x1, y1, z1,
        x1, y1, z1,  x0, y1, z1,
        x0, y1, z1,  x0, y1, z0,
        // verticals
        x0, y0, z0,  x0, y1, z0,
        x1, y0, z0,  x1, y1, z0,
        x1, y0, z1,  x1, y1, z1,
        x0, y0, z1,  x0, y1, z1
      ];
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(p));
    };

    const draw = (proj, view) => {
      if (!this.targetBlock) return;
      gl.useProgram(program);
      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.uniform4f(uColor, 1.0, 1.0, 1.0, 0.95);
      gl.bindVertexArray(vao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.depthMask(true);
      gl.bindVertexArray(null);
    };

    return { update, draw };
  }

  _createEntityRenderer() {
    const gl = this.gl;
    const program = createProgram(
      gl,
      `#version 300 es
      precision highp float;
      layout(location=0) in vec2 aPos;
      layout(location=1) in vec2 aUV;
      uniform mat4 uProj;
      uniform mat4 uView;
      uniform vec3 uPos;
      uniform vec2 uSize;
      uniform float uFaceYaw;
      out vec2 vUV;
      void main(){
        float s = sin(uFaceYaw);
        float c = cos(uFaceYaw);
        vec3 right = vec3(c, 0.0, -s);
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 p = uPos + right * (aPos.x * uSize.x) + up * (aPos.y * uSize.y);
        gl_Position = uProj * uView * vec4(p, 1.0);
        vUV = aUV;
      }`,
      `#version 300 es
      precision highp float;
      precision highp sampler2D;
      uniform sampler2D uTex;
      uniform vec4 uColor;
      uniform float uUseTex;
      in vec2 vUV;
      out vec4 outColor;
      void main(){
        vec4 col = uColor;
        if (uUseTex > 0.5) {
          col *= texture(uTex, vUV);
        }
        if (col.a < 0.06) discard;
        outColor = col;
      }`
    );

    const uProj = gl.getUniformLocation(program, "uProj");
    const uView = gl.getUniformLocation(program, "uView");
    const uPos = gl.getUniformLocation(program, "uPos");
    const uSize = gl.getUniformLocation(program, "uSize");
    const uFaceYaw = gl.getUniformLocation(program, "uFaceYaw");
    const uTex = gl.getUniformLocation(program, "uTex");
    const uColor = gl.getUniformLocation(program, "uColor");
    const uUseTex = gl.getUniformLocation(program, "uUseTex");

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();

    const verts = new Float32Array([
      -0.5, 0.0, 0.0, 1.0,
       0.5, 0.0, 1.0, 1.0,
       0.5, 1.0, 1.0, 0.0,
      -0.5, 1.0, 0.0, 0.0
    ]);

    const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 4 * 4, 2 * 4);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    const draw = (proj, view, entities) => {
      if (!entities || entities.length === 0) return;
      const sorted = [...entities].sort((a, b) => {
        const dax = a.x - this.player.x;
        const day = a.y - this.player.y;
        const daz = a.z - this.player.z;
        const dbx = b.x - this.player.x;
        const dby = b.y - this.player.y;
        const dbz = b.z - this.player.z;
        return dbx * dbx + dby * dby + dbz * dbz - (dax * dax + day * day + daz * daz);
      });
      gl.useProgram(program);
      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uTex, 0);
      gl.bindVertexArray(vao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const e of sorted) {
        const isItem = Number.isFinite(e.itemType ?? e.blockType);
        const isZombie = !isItem && e.type === "zombie";
        const hasObjModel = !isItem && this.objModelLibrary?.hasModel(e.type);
        const hasEntityTexture = !isItem && !!(this.entityTextures?.getBillboardImage(e.type) || this.entityTextures?.getImage(e.type));
        const canUseObjModel = hasObjModel && hasEntityTexture;
        const canUseZombieModel = isZombie && !!this.entityTextures?.getImage("zombie");
        if (canUseObjModel && this.settings?.mobModels !== false) {
          continue;
        }
        if (canUseZombieModel && this.settings?.mobModels !== false) {
          // Zombie uses the 3D model renderer.
          continue;
        }

        const image = isItem
          ? this.textureLibrary?.getItemTexture(e.itemType ?? e.blockType, this.settings) || null
          : this.entityTextures?.getBillboardImage(e.type) || this.entityTextures?.getImage(e.type) || null;
        const tex = image ? this._getOrCreateSpriteTexture(image) : null;
        const faceYaw = Math.atan2(this.player.x - e.x, this.player.z - e.z);
        const bob = isItem ? Math.sin((e.age || 0) * 6) * 0.08 : 0;
        const width = isItem ? 0.48 : 0.9;
        const height = isItem ? 0.48 : 1.8;
        const y = isItem ? e.y + bob : e.y;
        const color = isItem ? [1, 1, 1, 0.96] : [1, 1, 1, 0.98];
        gl.uniform4f(uColor, color[0], color[1], color[2], color[3]);
        gl.uniform3f(uPos, e.x, y, e.z);
        gl.uniform2f(uSize, width, height);
        gl.uniform1f(uFaceYaw, faceYaw);
        gl.uniform1f(uUseTex, tex ? 1 : 0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }
      gl.depthMask(true);
      gl.bindVertexArray(null);
    };

    return { draw };
  }

  _createZombieRenderer() {
    const gl = this.gl;
    const program = createProgram(
      gl,
      `#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPos;
      layout(location=1) in vec2 aUV;
      uniform mat4 uProj;
      uniform mat4 uView;
      out vec2 vUV;
      void main(){
        gl_Position = uProj * uView * vec4(aPos, 1.0);
        vUV = aUV;
      }`,
      `#version 300 es
      precision highp float;
      precision highp sampler2D;
      uniform sampler2D uTex;
      in vec2 vUV;
      out vec4 outColor;
      void main(){
        vec4 col = texture(uTex, vUV);
        if (col.a < 0.06) discard;
        outColor = col;
      }`
    );

    const uProj = gl.getUniformLocation(program, "uProj");
    const uView = gl.getUniformLocation(program, "uView");
    const uTex = gl.getUniformLocation(program, "uTex");

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 5 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 5 * 4, 3 * 4);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 4, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);

    const pushFace = (verts, idx, baseIndex, p0, p1, p2, p3, uv0, uv1, uv2, uv3) => {
      verts.push(
        p0[0], p0[1], p0[2], uv0[0], uv0[1],
        p1[0], p1[1], p1[2], uv1[0], uv1[1],
        p2[0], p2[1], p2[2], uv2[0], uv2[1],
        p3[0], p3[1], p3[2], uv3[0], uv3[1]
      );
      idx.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
      return baseIndex + 4;
    };

    const addBox = (verts, idx, baseIndex, corners, texW, texH, u, v, w, h, d) => {
      // Corner indices:
      // 0:(x0,y0,z0) 1:(x1,y0,z0) 2:(x1,y1,z0) 3:(x0,y1,z0)
      // 4:(x0,y0,z1) 5:(x1,y0,z1) 6:(x1,y1,z1) 7:(x0,y1,z1)
      const U = (px) => px / texW;
      const V = (py) => py / texH;

      const scaleU = texW >= 64 ? 1 : texW / 64;
      const scaleV = texH >= 64 ? 1 : texH / 64;
      const u0 = u * scaleU;
      const v0 = v * scaleV;
      const wU = w * scaleU;
      const hV = h * scaleV;
      const dU = d * scaleU;
      const dV = d * scaleV;

      const topU = u0 + dU;
      const topV = v0;
      const bottomU = u0 + dU + wU;
      const bottomV = v0;
      const leftU = u0;
      const leftV = v0 + dV;
      const frontU = u0 + dU;
      const frontV = v0 + dV;
      const rightU = u0 + dU + wU;
      const rightV = v0 + dV;
      const backU = u0 + dU + wU + dU;
      const backV = v0 + dV;

      // Top
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[7],
        corners[6],
        corners[2],
        corners[3],
        [U(topU), V(topV + dV)],
        [U(topU + wU), V(topV + dV)],
        [U(topU + wU), V(topV)],
        [U(topU), V(topV)]
      );
      // Bottom
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[0],
        corners[1],
        corners[5],
        corners[4],
        [U(bottomU), V(bottomV)],
        [U(bottomU + wU), V(bottomV)],
        [U(bottomU + wU), V(bottomV + dV)],
        [U(bottomU), V(bottomV + dV)]
      );
      // Front
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[4],
        corners[5],
        corners[6],
        corners[7],
        [U(frontU), V(frontV + hV)],
        [U(frontU + wU), V(frontV + hV)],
        [U(frontU + wU), V(frontV)],
        [U(frontU), V(frontV)]
      );
      // Back
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[1],
        corners[0],
        corners[3],
        corners[2],
        [U(backU), V(backV + hV)],
        [U(backU + wU), V(backV + hV)],
        [U(backU + wU), V(backV)],
        [U(backU), V(backV)]
      );
      // Left
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[0],
        corners[4],
        corners[7],
        corners[3],
        [U(leftU), V(leftV + hV)],
        [U(leftU + dU), V(leftV + hV)],
        [U(leftU + dU), V(leftV)],
        [U(leftU), V(leftV)]
      );
      // Right
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[5],
        corners[1],
        corners[2],
        corners[6],
        [U(rightU), V(rightV + hV)],
        [U(rightU + dU), V(rightV + hV)],
        [U(rightU + dU), V(rightV)],
        [U(rightU), V(rightV)]
      );
      return baseIndex;
    };

    const makeCorners = (x0, y0, z0, x1, y1, z1, rotX, pivotY, yaw, ox, oy, oz) => {
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const sinX = Math.sin(rotX);
      const cosX = Math.cos(rotX);
      const s = 1 / 16;

      const rotVertex = (x, y, z) => {
        // X-rotation around pivotY in local pixel space.
        const dy = y - pivotY;
        const ry = dy * cosX - z * sinX;
        const rz = dy * sinX + z * cosX;
        const lx = x;
        const ly = pivotY + ry;
        const lz = rz;

        // Yaw around origin.
        const wx = (lx * cosY - lz * sinY) * s;
        const wz = (lx * sinY + lz * cosY) * s;
        const wy = ly * s;
        return [ox + wx, oy + wy, oz + wz];
      };

      return [
        rotVertex(x0, y0, z0),
        rotVertex(x1, y0, z0),
        rotVertex(x1, y1, z0),
        rotVertex(x0, y1, z0),
        rotVertex(x0, y0, z1),
        rotVertex(x1, y0, z1),
        rotVertex(x1, y1, z1),
        rotVertex(x0, y1, z1)
      ];
    };

    const draw = (proj, view, entities) => {
      if (!entities || entities.length === 0) return;
      const image = this.entityTextures?.getImage("zombie") || null;
      if (!image) return;
      const tex = this._getOrCreateSpriteTexture(image);
      if (!tex) return;

      const texW = image.width || 64;
      const texH = image.height || 64;
      const verts = [];
      const idx = [];
      let baseIndex = 0;

      for (const e of entities) {
        if (!e || e.type !== "zombie") continue;
        const yaw = (e.yaw || 0) + Math.PI;
        const ox = e.x;
        const oy = e.y;
        const oz = e.z;
        const walk = Math.min(1, Math.hypot(e.vx || 0, e.vz || 0) / 2.2);
        const phase = (e.age || 0) * 6;
        const swing = Math.sin(phase) * 0.9 * walk;

        // Head (8x8x8), uv (0,0)
        baseIndex = addBox(
          verts,
          idx,
          baseIndex,
          makeCorners(-4, 24, -4, 4, 32, 4, 0, 24, yaw, ox, oy, oz),
          texW,
          texH,
          0,
          0,
          8,
          8,
          8
        );
        // Body (8x12x4), uv (16,16)
        baseIndex = addBox(
          verts,
          idx,
          baseIndex,
          makeCorners(-4, 12, -2, 4, 24, 2, 0, 12, yaw, ox, oy, oz),
          texW,
          texH,
          16,
          16,
          8,
          12,
          4
        );
        // Right Arm (4x12x4), uv (40,16)
        baseIndex = addBox(
          verts,
          idx,
          baseIndex,
          makeCorners(-8, 12, -2, -4, 24, 2, swing, 24, yaw, ox, oy, oz),
          texW,
          texH,
          40,
          16,
          4,
          12,
          4
        );
        // Left Arm (4x12x4), reuse uv (40,16)
        baseIndex = addBox(
          verts,
          idx,
          baseIndex,
          makeCorners(4, 12, -2, 8, 24, 2, -swing, 24, yaw, ox, oy, oz),
          texW,
          texH,
          40,
          16,
          4,
          12,
          4
        );
        // Right Leg (4x12x4), uv (0,16)
        baseIndex = addBox(
          verts,
          idx,
          baseIndex,
          makeCorners(-4, 0, -2, 0, 12, 2, -swing, 12, yaw, ox, oy, oz),
          texW,
          texH,
          0,
          16,
          4,
          12,
          4
        );
        // Left Leg (4x12x4), reuse uv (0,16)
        baseIndex = addBox(
          verts,
          idx,
          baseIndex,
          makeCorners(0, 0, -2, 4, 12, 2, swing, 12, yaw, ox, oy, oz),
          texW,
          texH,
          0,
          16,
          4,
          12,
          4
        );
      }

      if (idx.length === 0) return;

      gl.useProgram(program);
      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uTex, 0);

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.DYNAMIC_DRAW);

      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
    };

    return { draw };
  }

  _createObjEntityRenderer() {
    const gl = this.gl;
    const program = createProgram(
      gl,
      `#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPos;
      layout(location=1) in vec2 aUV;
      uniform mat4 uProj;
      uniform mat4 uView;
      uniform vec3 uPos;
      uniform float uYaw;
      uniform float uScale;
      uniform vec2 uCenterXZ;
      uniform float uMinY;
      uniform float uYOffset;
      out vec2 vUV;
      void main(){
        float s = sin(uYaw);
        float c = cos(uYaw);
        vec3 local = vec3(
          (aPos.x - uCenterXZ.x) * uScale,
          (aPos.y - uMinY) * uScale + uYOffset,
          (aPos.z - uCenterXZ.y) * uScale
        );
        vec3 p = vec3(
          local.x * c - local.z * s,
          local.y,
          local.x * s + local.z * c
        ) + uPos;
        gl_Position = uProj * uView * vec4(p, 1.0);
        vUV = aUV;
      }`,
      `#version 300 es
      precision highp float;
      precision highp sampler2D;
      uniform sampler2D uTex;
      uniform vec4 uColor;
      in vec2 vUV;
      out vec4 outColor;
      void main(){
        vec4 col = texture(uTex, vUV) * uColor;
        if (col.a < 0.12) discard;
        outColor = col;
      }`
    );

    const uProj = gl.getUniformLocation(program, "uProj");
    const uView = gl.getUniformLocation(program, "uView");
    const uPos = gl.getUniformLocation(program, "uPos");
    const uYaw = gl.getUniformLocation(program, "uYaw");
    const uScale = gl.getUniformLocation(program, "uScale");
    const uCenterXZ = gl.getUniformLocation(program, "uCenterXZ");
    const uMinY = gl.getUniformLocation(program, "uMinY");
    const uYOffset = gl.getUniformLocation(program, "uYOffset");
    const uTex = gl.getUniformLocation(program, "uTex");
    const uColor = gl.getUniformLocation(program, "uColor");

    const buffers = new Map();

    const getBuffer = (type) => {
      if (buffers.has(type)) {
        return buffers.get(type);
      }
      const model = this.objModelLibrary?.getModel(type);
      if (!model) {
        return null;
      }
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      const ibo = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);
      const stride = 8 * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 3 * 4);
      gl.bindVertexArray(null);
      const record = { vao, vbo, ibo, indexCount: model.indices.length, bounds: model.bounds };
      buffers.set(type, record);
      return record;
    };

    const drawModel = (buffer, tex, entity, scaleMul = 1, color = [1, 1, 1, 1], yOffset = 0) => {
      const def = getMobDef(entity.type);
      const bounds = buffer.bounds || { minX: -0.5, minY: 0, minZ: -0.5, maxX: 0.5, maxY: 1, maxZ: 0.5 };
      const modelHeight = Math.max(0.01, bounds.maxY - bounds.minY);
      const scale = ((def.modelHeight || def.height || 1) / modelHeight) * scaleMul;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform3f(uPos, entity.x, entity.y, entity.z);
      gl.uniform1f(uYaw, (entity.yaw || 0) + (def.yawOffset || 0));
      gl.uniform1f(uScale, scale);
      gl.uniform2f(uCenterXZ, (bounds.minX + bounds.maxX) * 0.5, (bounds.minZ + bounds.maxZ) * 0.5);
      gl.uniform1f(uMinY, bounds.minY);
      gl.uniform1f(uYOffset, yOffset);
      gl.uniform4f(uColor, color[0], color[1], color[2], color[3]);
      gl.bindVertexArray(buffer.vao);
      gl.drawElements(gl.TRIANGLES, buffer.indexCount, gl.UNSIGNED_INT, 0);
    };

    const draw = (proj, view, entities) => {
      if (!entities || entities.length === 0) return;
      gl.useProgram(program);
      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uTex, 0);
      gl.depthMask(true);

      for (const e of entities) {
        if (!e || Number.isFinite(e.itemType ?? e.blockType)) continue;
        const model = this.objModelLibrary?.getModel(e.type);
        if (!model) continue;
        const image = this.entityTextures?.getImage(e.type) || null;
        const tex = image ? this._getOrCreateSpriteTexture(image) : null;
        const buffer = getBuffer(e.type);
        if (!buffer || !tex) continue;
        const def = getMobDef(e.type);
        const walkFactor = clamp(Math.hypot(e.vx || 0, e.vz || 0) / Math.max(0.1, def.speed || 1), 0, 1);
        const bob = Math.sin((e.age || 0) * 8) * 0.02 * walkFactor;
        const hurtTint = e.hurtTimer > 0 ? [1, 0.74, 0.74, 1] : [1, 1, 1, 1];

        drawModel(buffer, tex, e, 1, hurtTint, bob);

        if (e.type === "sheep" && def.shellScale) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.depthMask(false);
          drawModel(buffer, tex, e, def.shellScale, def.shellTint || [1, 1, 1, 0.42], bob + 0.01);
          gl.depthMask(true);
          gl.disable(gl.BLEND);
        }
      }

      gl.bindVertexArray(null);
    };

    return { draw };
  }
}

function buildChunkLoadList(centerChunkX, centerChunkZ, radius) {
  const chunks = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      chunks.push({
        x: centerChunkX + dx,
        z: centerChunkZ + dz,
        distance: Math.max(Math.abs(dx), Math.abs(dz)) + Math.hypot(dx, dz) * 0.001
      });
    }
  }
  chunks.sort((a, b) => a.distance - b.distance);
  return chunks;
}

export default function FreeCube2Game(engine) {
  let store = null;
  let textures = null;
  let entityTextures = null;
  let objModels = null;
  let gl = null;
  let atlas = null;
  let glRenderer = null;
  let canvasRenderer = null;
  let useWebGL = false;

  let world = null;
  let player = null;
  let input = null;
  let settings = { ...DEFAULT_SETTINGS };
  let activeWorldId = null;
  let selectedWorldId = null;
  let mode = "menu"; // menu | loading | playing | paused
  let chatOpen = false;
  let inventoryOpen = false;
  let chatLines = [];
  let chatNeedsRender = false;
  let mobs = [];
  let items = [];
  let mining = { key: null, progress: 0, type: BLOCK.AIR };
  let hud = { visible: true, last: null, timer: 0 };
  let boss = { active: false, name: "Boss", health: 1 };
  let worldTime = 0; // seconds, loops
  let spawnTimer = 0;
  let saveTimer = 0;
  let fps = 0;
  let fpsTimer = 0;
  let fpsSmoothed = 0;
  let currentTarget = null;
  let currentEntityTarget = null;
  let inventoryCursor = { type: BLOCK.AIR, count: 0 };
  let inventoryContext = "inventory";
  let inventoryCraftTypes = new Uint8Array(CRAFT_GRID_SMALL);
  let inventoryCraftCounts = new Uint16Array(CRAFT_GRID_SMALL);
  let tableCraftTypes = new Uint8Array(CRAFT_GRID_LARGE);
  let tableCraftCounts = new Uint16Array(CRAFT_GRID_LARGE);
  let furnaceStates = new Map();
  let activeFurnaceKey = null;
  let inventoryDrag = { pending: false, active: false, button: 0, origin: null, targets: [], targetKeys: new Set() };
  let suppressInventoryClick = false;
  let mobRenderWarnings = new Set();
  let lastMobRenderSummaryAt = 0;

  let ui = null;
  let loadingStartChunk = null;

  function setupWebGL() {
    const canvas = engine.canvas;
    if (engine.gl && typeof WebGL2RenderingContext !== "undefined" && engine.gl instanceof WebGL2RenderingContext) {
      gl = engine.gl;
      console.log("Reusing Sirco WebGL2 context from engine.");
      return true;
    }
    const opts = {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      desynchronized: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    };
    let context = null;
    try {
      context = canvas.getContext("webgl2", opts);
    } catch (error) {
      console.warn("WebGL2 context threw:", error.message);
    }
    if (!context) {
      // Some browsers are picky about context attrs. Try again without attrs.
      try {
        context = canvas.getContext("webgl2");
      } catch (error) {
        console.warn("WebGL2 context threw (no opts):", error.message);
      }
    }
    if (!context) {
      const hasWebGL2 = typeof WebGL2RenderingContext !== "undefined";
      let hasWebGL1 = false;
      try {
        hasWebGL1 = !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
      } catch (error) {
        hasWebGL1 = false;
      }
      console.warn("WebGL2 unavailable. Falling back to Canvas renderer.", { hasWebGL2, hasWebGL1, userAgent: navigator.userAgent });
      return false;
    }

    gl = context;
    engine.gl = gl;
    engine.ctx2d = null;
    if (window.SircoEngine?.Renderer2D) {
      engine.renderer2D = new window.SircoEngine.Renderer2D(gl, engine.resources);
    }

    try {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      console.log("WebGL2:", {
        vendor,
        renderer,
        maxTexSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxTexLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)
      });
    } catch (error) {
      console.warn("WebGL2 info query failed:", error.message);
    }
    return true;
  }

  function ensureUI() {
    if (ui) return ui;

    if (!document.getElementById("freecube2-ui-styles")) {
      const style = document.createElement("style");
      style.id = "freecube2-ui-styles";
      style.textContent = `
        #freecube2-ui-root{position:fixed;inset:0;pointer-events:none;z-index:1000;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Arial}
        #freecube2-ui-root.menu-open{pointer-events:auto}
        #freecube2-fps{position:fixed;left:10px;top:8px;padding:6px 8px;background:rgba(0,0,0,0.35);color:#eaffea;font:12px/1.1 monospace;border:1px solid rgba(255,255,255,0.12);border-radius:6px}
        #freecube2-time-tint{position:fixed;inset:0;pointer-events:none;background:rgba(22,42,88,0);opacity:0;transition:opacity 0.18s linear}
        #freecube2-time-chip{position:fixed;left:50%;top:14px;transform:translateX(-50%);padding:6px 12px;background:rgba(0,0,0,0.32);border:1px solid rgba(255,255,255,0.14);border-radius:999px;color:#f4f7ff;font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 10px rgba(0,0,0,0.55);display:none}
        #freecube2-boss{position:fixed;left:50%;top:14px;transform:translateX(-50%);width:min(520px,86vw);display:none}
        #freecube2-boss-name{margin-bottom:6px;text-align:center;color:rgba(255,255,255,0.95);font:700 13px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 10px rgba(0,0,0,0.6)}
        #freecube2-boss-bar{height:14px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.14);overflow:hidden}
        #freecube2-boss-bar > div{height:100%;width:50%;background:linear-gradient(90deg, rgba(255,92,210,0.96), rgba(182,72,255,0.96))}
        #freecube2-xp{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);width:min(520px,86vw);display:none}
        #freecube2-xp-bar{height:10px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.14);overflow:hidden}
        #freecube2-xp-bar > div{height:100%;width:0%;background:linear-gradient(90deg, rgba(94,236,171,0.96), rgba(72,162,255,0.96))}
        #freecube2-xp-level{margin-top:6px;text-align:center;color:rgba(220,235,255,0.9);font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 10px rgba(0,0,0,0.6)}
        #freecube2-status{position:fixed;left:50%;bottom:122px;transform:translateX(-50%);width:min(820px,94vw);display:none;justify-content:space-between;gap:14px}
        .fc-armor,.fc-hearts,.fc-hunger{display:flex;gap:3px;align-items:center}
        .fc-heart,.fc-food,.fc-armor-icon{width:16px;height:16px;display:inline-block;background:rgba(0,0,0,0.25);border:1px solid rgba(0,0,0,0.55);box-shadow:0 2px 0 rgba(0,0,0,0.45);image-rendering:pixelated}
        .fc-heart{mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain}
        .fc-food{mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain}
        .fc-armor-icon{mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain}
        .fc-heart{mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 14s-6-3.7-6-8.3C2 3 3.7 1.5 5.6 1.5c1.2 0 2.1.6 2.4 1.2.3-.6 1.2-1.2 2.4-1.2C12.3 1.5 14 3 14 5.7 14 10.3 8 14 8 14z'/%3E%3C/svg%3E");-webkit-mask-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 14s-6-3.7-6-8.3C2 3 3.7 1.5 5.6 1.5c1.2 0 2.1.6 2.4 1.2.3-.6 1.2-1.2 2.4-1.2C12.3 1.5 14 3 14 5.7 14 10.3 8 14 8 14z'/%3E%3C/svg%3E\")}
        .fc-food{mask-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M6.4 1.6c1.5 0 2.5 1.2 2.5 2.6v.6c0 .8.6 1.5 1.5 1.7l.5.1c1.8.4 3.1 2 3.1 3.8 0 2.3-1.9 4.2-4.2 4.2H7.2C4.9 14.6 3 12.7 3 10.4V4.2C3 2.8 4 1.6 5.5 1.6h.9z'/%3E%3C/svg%3E\");-webkit-mask-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M6.4 1.6c1.5 0 2.5 1.2 2.5 2.6v.6c0 .8.6 1.5 1.5 1.7l.5.1c1.8.4 3.1 2 3.1 3.8 0 2.3-1.9 4.2-4.2 4.2H7.2C4.9 14.6 3 12.7 3 10.4V4.2C3 2.8 4 1.6 5.5 1.6h.9z'/%3E%3C/svg%3E\")}
        .fc-armor-icon{mask-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M5 2h6l2 2v3l-1 1v4H4V8L3 7V4l2-2zm1 2L5 5v1h1v5h4V6h1V5L10 4H6z'/%3E%3C/svg%3E\");-webkit-mask-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M5 2h6l2 2v3l-1 1v4H4V8L3 7V4l2-2zm1 2L5 5v1h1v5h4V6h1V5L10 4H6z'/%3E%3C/svg%3E\")}
        .fc-heart.full{background:linear-gradient(180deg, rgba(255,72,72,0.98), rgba(150,18,18,0.98))}
        .fc-heart.half{background:linear-gradient(90deg, rgba(255,72,72,0.98) 50%, rgba(0,0,0,0.22) 50%)}
        .fc-heart.empty{background:rgba(0,0,0,0.22)}
        .fc-food.full{background:linear-gradient(180deg, rgba(255,210,92,0.98), rgba(160,92,20,0.98))}
        .fc-food.half{background:linear-gradient(90deg, rgba(255,210,92,0.98) 50%, rgba(0,0,0,0.22) 50%)}
        .fc-food.empty{background:rgba(0,0,0,0.22)}
        .fc-armor-icon.full{background:linear-gradient(180deg, rgba(255,255,255,0.98), rgba(160,170,185,0.98))}
        .fc-armor-icon.half{background:linear-gradient(90deg, rgba(255,255,255,0.98) 50%, rgba(0,0,0,0.22) 50%)}
        .fc-armor-icon.empty{background:rgba(0,0,0,0.22)}
        #freecube2-chat{position:fixed;left:10px;bottom:86px;width:min(520px,72vw);pointer-events:none}
        #freecube2-chat-log{display:flex;flex-direction:column;gap:4px;max-height:42vh;overflow:hidden}
        .fc-chat-line{padding:4px 6px;background:rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(235,245,255,0.95);font:12px/1.25 ui-monospace,Menlo,Consolas,monospace;backdrop-filter:blur(8px)}
        .fc-chat-line.sys{color:rgba(164,255,163,0.98)}
        .fc-chat-line.err{color:rgba(255,180,180,0.98)}
        #freecube2-chat-input-wrap{margin-top:8px;pointer-events:auto;display:none}
        #freecube2-chat-input{all:unset;width:100%;padding:10px 10px;border-radius:10px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.16);color:#fff;font:14px/1.2 ui-monospace,Menlo,Consolas,monospace}
        #freecube2-chat-input:focus{border-color:rgba(90,200,255,0.9);box-shadow:0 0 0 3px rgba(90,200,255,0.15)}
        #freecube2-crosshair{position:fixed;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);opacity:0.9}
        #freecube2-crosshair::before,#freecube2-crosshair::after{content:'';position:absolute;left:50%;top:50%;background:rgba(255,255,255,0.95);transform:translate(-50%,-50%)}
        #freecube2-crosshair::before{width:18px;height:2px}
        #freecube2-crosshair::after{width:2px;height:18px}
        #freecube2-mining{position:fixed;left:50%;top:50%;transform:translate(-50%, 46px);width:180px;height:10px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);overflow:hidden;display:none}
        #freecube2-mining-bar{height:100%;width:0%;background:linear-gradient(90deg, rgba(255,255,255,0.96), rgba(90,200,255,0.96))}
        #freecube2-hotbar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:8px;padding:10px 12px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.14);border-radius:10px}
        #freecube2-inventory{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);display:none;pointer-events:auto;z-index:1002}
        .fc-inv-panel{min-width:min(664px,94vw);padding:18px;background:#c6c6c6;border:4px solid #1f1f1f;box-shadow:inset 4px 4px 0 #ffffff,inset -4px -4px 0 #555555,0 18px 48px rgba(0,0,0,0.42);image-rendering:pixelated}
        .fc-inv-title{margin-bottom:12px;color:#3a3a3a;font:900 20px/1 ui-monospace,Menlo,Consolas,monospace;text-align:left;text-shadow:none}
        .fc-inv-top{display:flex;justify-content:center;gap:20px;align-items:stretch;margin-bottom:16px;flex-wrap:wrap}
        .fc-inv-pane{display:flex;flex-direction:column;gap:8px;min-width:0}
        .fc-inv-preview-pane{min-width:152px}
        .fc-inv-subtitle{color:#3a3a3a;font:700 13px/1 ui-monospace,Menlo,Consolas,monospace;text-align:center;text-shadow:none}
        .fc-inv-column{display:grid;grid-template-columns:repeat(1,44px);gap:8px;justify-content:center}
        .fc-inv-crafting-row{display:flex;align-items:center;gap:12px}
        .fc-inv-grid-2{grid-template-columns:repeat(2,44px)}
        .fc-inv-grid-3{grid-template-columns:repeat(3,44px)}
        .fc-inv-arrow{color:#8a8a8a;font:900 28px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:none}
        .fc-inv-grid{display:grid;grid-template-columns:repeat(9,44px);gap:8px;justify-content:center}
        .fc-inv-grid + .fc-inv-grid{margin-top:18px}
        .fc-inv-cursor{position:fixed;left:0;top:0;transform:translate(-50%,-50%);display:none;pointer-events:none;z-index:1003}
        .freecube2-slot{position:relative;width:44px;height:44px;background:#8b8b8b;border:2px solid #373737;box-shadow:inset 2px 2px 0 #ffffff,inset -2px -2px 0 #555555;display:grid;place-items:center}
        .freecube2-slot.drag-target{border-color:#f6de69;box-shadow:inset 2px 2px 0 #fff7c6,inset -2px -2px 0 #8d7422}
        .freecube2-slot.sel{border-color:#ffffff;box-shadow:inset 2px 2px 0 #ffffff,inset -2px -2px 0 #2a2a2a}
        .freecube2-slot img{width:32px;height:32px;image-rendering:pixelated;pointer-events:none;-webkit-user-drag:none;user-select:none}
        .freecube2-slot .fc-count{position:absolute;right:6px;bottom:4px;color:rgba(255,255,255,0.95);font:900 12px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 0 rgba(0,0,0,0.75)}
        .fc-inv-preview{width:152px;min-height:192px;padding:12px;background:#1a1a1a;border:2px solid #373737;box-shadow:inset 2px 2px 0 #555555,inset -2px -2px 0 #101010;display:flex;align-items:center;justify-content:center}
        .fc-inv-player-canvas{width:96px;height:176px;image-rendering:pixelated;filter:drop-shadow(0 8px 10px rgba(0,0,0,0.42))}
        .fc-inv-player{position:relative;width:86px;height:168px;image-rendering:pixelated}
        .fc-inv-player .body{position:absolute;background:#3aa4c1}
        .fc-inv-player .skin{background:#e6cfb2}
        .fc-inv-player .hair{background:#3d2816}
        .fc-inv-player .shirt{background:#24c6d8}
        .fc-inv-player .pants{background:#3ad6e4}
        .fc-inv-player .belt{background:#3a3024}
        .fc-inv-player .boots{background:#f0f0f0}
        .fc-inv-player .head{left:27px;top:0;width:32px;height:32px}
        .fc-inv-player .hair{left:27px;top:0;width:32px;height:12px}
        .fc-inv-player .torso{left:31px;top:34px;width:24px;height:46px}
        .fc-inv-player .arm-left{left:15px;top:34px;width:14px;height:46px}
        .fc-inv-player .arm-right{left:57px;top:34px;width:14px;height:46px}
        .fc-inv-player .leg-left{left:31px;top:84px;width:18px;height:56px}
        .fc-inv-player .leg-right{left:49px;top:84px;width:18px;height:56px}
        .fc-inv-player .belt{left:31px;top:74px;width:36px;height:8px}
        .fc-inv-player .boots{left:31px;top:138px;width:36px;height:8px}
        .fc-inv-player .armor{position:absolute;display:none;background:rgba(230,235,244,0.72);border:1px solid rgba(255,255,255,0.38)}
        .fc-inv-player.has-head .armor-head{display:block;left:25px;top:-2px;width:36px;height:18px}
        .fc-inv-player.has-chest .armor-chest{display:block;left:27px;top:31px;width:32px;height:36px}
        .fc-inv-player.has-legs .armor-legs{display:block;left:29px;top:78px;width:36px;height:34px}
        .fc-inv-player.has-feet .armor-feet{display:block;left:29px;top:132px;width:36px;height:12px}
        .fc-inv-furnace{display:none;min-width:242px}
        .fc-inv-furnace.show{display:flex}
        .fc-furnace-layout{display:grid;grid-template-columns:44px 58px 68px 44px;grid-template-rows:44px 44px;align-items:center;justify-content:center;column-gap:12px;row-gap:8px}
        .fc-furnace-slot-input{grid-column:1;grid-row:1}
        .fc-furnace-slot-fuel{grid-column:1;grid-row:2}
        .fc-furnace-fire{grid-column:2;grid-row:2;display:flex;align-items:flex-end;justify-content:center;height:44px}
        .fc-furnace-firebar{width:18px;height:32px;border-radius:4px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);overflow:hidden}
        .fc-furnace-firebar > div{height:0%;width:100%;background:linear-gradient(180deg, rgba(255,228,112,0.98), rgba(255,104,24,0.98))}
        .fc-furnace-arrow{grid-column:3;grid-row:1 / span 2;display:flex;align-items:center;gap:8px;color:#fff;font:900 28px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 8px rgba(0,0,0,0.7)}
        .fc-furnace-progress{width:54px;height:10px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);overflow:hidden}
        .fc-furnace-progress > div{height:100%;width:0%;background:linear-gradient(90deg, rgba(255,255,255,0.96), rgba(90,200,255,0.96))}
        .fc-furnace-slot-output{grid-column:4;grid-row:1 / span 2}
        #freecube2-menu{position:fixed;inset:0;display:none;align-items:stretch;justify-content:center;overflow:auto;pointer-events:auto;background:#2b2b2b url('PNG/Tiles/dirt.png') repeat; background-size:256px 256px; image-rendering:pixelated; animation:fc-menu-pan 32s linear infinite}
        @keyframes fc-menu-pan{0%{background-position:0 0}100%{background-position:-256px -256px}}
        #freecube2-menu::before{content:'';position:fixed;inset:0;background:radial-gradient(circle at 50% 20%, rgba(255,255,255,0.06), transparent 52%),linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.55));pointer-events:none}
        #freecube2-menu.show{display:flex}
        #freecube2-panel{position:relative;width:min(920px,96vw);min-height:calc(100dvh - 24px);margin:auto;padding:12px 0;background:transparent;border:none;box-shadow:none;text-align:center;display:flex;flex-direction:column;justify-content:center}
        #fc-screen-title,#fc-screen-worlds,#fc-screen-settings,#fc-screen-resource-packs,#fc-screen-loading,#fc-screen-pause{width:min(860px,100%);margin:0 auto}
        .fc-title{font:900 72px/1 ui-monospace,Menlo,Consolas,monospace;color:#fff;letter-spacing:4px;text-shadow:0 6px 0 rgba(0,0,0,0.45),0 18px 60px rgba(0,0,0,0.6);margin:0 auto 10px auto}
        .fc-sub{color:rgba(255,255,255,0.85);font:700 18px/1.1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 26px auto;transform:rotate(-10deg);display:inline-block}
        .fc-row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
        .fc-stack{display:flex;flex-direction:column;gap:10px;align-items:center}
        .fc-btn{all:unset;cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:center;min-width:min(420px,86vw);height:42px;padding:0 14px;background:#c6c6c6;border:2px solid #000;box-shadow:inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.25), 0 10px 30px rgba(0,0,0,0.25);color:#1a1a1a;font:800 16px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 1px 0 rgba(255,255,255,0.55)}
        .fc-btn:hover{outline:2px solid rgba(255,255,255,0.95)}
        .fc-btn:active{transform:translateY(1px)}
        .fc-btn.small{min-width:min(200px,44vw)}
        .fc-btn.half{min-width:min(320px,42vw)}
        .fc-btn.danger{background:#c66}
        .fc-btn.disabled, .fc-btn:disabled{opacity:0.55;cursor:not-allowed;outline:none}
        .fc-card{padding:12px 12px;background:rgba(0,0,0,0.55);border:2px solid #000;box-shadow:inset 0 2px 0 rgba(255,255,255,0.08)}
        .fc-list{display:flex;flex-direction:column;gap:6px;margin-top:10px}
        #fc-world-list{height:min(360px,44dvh);overflow:auto}
        .fc-world{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 10px;background:rgba(0,0,0,0.45);border:2px solid #000;cursor:pointer}
        .fc-world.sel{outline:2px solid rgba(255,255,255,0.95)}
        .fc-world b{font:900 16px/1.1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.7)}
        .fc-world span{font:13px/1.2 ui-monospace,Menlo,Consolas,monospace;color:rgba(230,230,230,0.9)}
        .fc-field{display:flex;flex-direction:column;gap:6px;margin-top:10px}
        .fc-field label{font:12px/1 ui-monospace,Menlo,Consolas,monospace;color:rgba(255,255,255,0.9)}
        .fc-field input:not([type="range"]):not([type="checkbox"]){all:unset;height:34px;padding:0 10px;background:#111;border:2px solid #000;color:#fff;font:14px/1.2 ui-monospace,Menlo,Consolas,monospace}
        .fc-field input:not([type="range"]):not([type="checkbox"]):focus{outline:2px solid rgba(255,255,255,0.9)}
        .fc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .fc-small{font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;color:rgba(255,255,255,0.82);text-shadow:0 2px 8px rgba(0,0,0,0.6)}
        .fc-slider{all:revert;width:100%}
        .fc-check{display:flex;align-items:center;gap:10px}
        .fc-check input[type="checkbox"]{all:revert;width:18px;height:18px;accent-color:#fff;cursor:pointer}
        .fc-check label{cursor:pointer}
        .fc-footer{display:flex;justify-content:space-between;gap:10px;margin-top:16px;color:rgba(255,255,255,0.85);font:12px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 10px rgba(0,0,0,0.7)}
        .fc-pack-shell{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
        .fc-pack-column{flex:1 1 280px;max-width:380px;min-width:260px}
        .fc-pack-head{font:900 18px/1.1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin-bottom:8px;text-align:center}
        .fc-pack-list{display:flex;flex-direction:column;gap:8px;min-height:280px}
        .fc-pack-entry{display:flex;gap:10px;align-items:flex-start;padding:10px;background:rgba(0,0,0,0.5);border:2px solid #000;cursor:pointer;text-align:left}
        .fc-pack-entry:hover{outline:2px solid rgba(255,255,255,0.95)}
        .fc-pack-entry.selected{cursor:default;outline:2px solid rgba(255,255,255,0.55)}
        .fc-pack-entry.selected:hover{outline:2px solid rgba(255,255,255,0.55)}
        .fc-pack-icon{width:52px;height:52px;background:#111;border:2px solid #000;flex:0 0 auto;image-rendering:pixelated}
        .fc-pack-copy{display:flex;flex-direction:column;gap:4px;min-width:0}
        .fc-pack-name{font:900 16px/1.1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.7)}
        .fc-pack-desc{font:13px/1.2 ui-monospace,Menlo,Consolas,monospace;color:rgba(230,230,230,0.92)}
        .fc-pack-empty{display:grid;place-items:center;min-height:84px;padding:12px;background:rgba(0,0,0,0.35);border:2px solid #000;color:rgba(210,210,210,0.8);font:13px/1.2 ui-monospace,Menlo,Consolas,monospace}
        @media (max-width: 760px){
          #freecube2-panel{width:min(96vw,96vw);min-height:calc(100dvh - 12px);padding:6px 0}
          .fc-title{font-size:clamp(42px,12vw,64px);letter-spacing:2px}
          .fc-sub{font-size:14px;margin-bottom:18px}
          .fc-grid{grid-template-columns:1fr}
          .fc-btn,.fc-btn.half,.fc-btn.small{min-width:100%}
          .fc-row{flex-direction:column;align-items:stretch}
          .fc-footer{flex-direction:column;align-items:center}
          #fc-world-list{height:min(300px,38dvh)}
        }
      `;
      document.head.appendChild(style);
    }

    const root = document.getElementById("freecube2-ui-root") || document.createElement("div");
    root.id = "freecube2-ui-root";
    root.innerHTML = `
      <div id="freecube2-fps">FPS: --</div>
      <div id="freecube2-time-tint"></div>
      <div id="freecube2-time-chip">Day</div>
      <div id="freecube2-boss">
        <div id="freecube2-boss-name">Boss</div>
        <div id="freecube2-boss-bar"><div></div></div>
      </div>
      <div id="freecube2-chat">
        <div id="freecube2-chat-log"></div>
        <div id="freecube2-chat-input-wrap">
          <input id="freecube2-chat-input" autocomplete="off" spellcheck="false" placeholder="Type chat... (/help)" />
        </div>
      </div>
      <div id="freecube2-crosshair"></div>
      <div id="freecube2-mining"><div id="freecube2-mining-bar"></div></div>
      <div id="freecube2-status">
        <div class="fc-armor" id="freecube2-armor"></div>
        <div class="fc-hearts" id="freecube2-hearts"></div>
        <div class="fc-hunger" id="freecube2-hunger"></div>
      </div>
      <div id="freecube2-xp">
        <div id="freecube2-xp-bar"><div></div></div>
        <div id="freecube2-xp-level">0</div>
      </div>
      <div id="freecube2-hotbar"></div>
      <div id="freecube2-inventory">
        <div class="fc-inv-panel">
          <div id="freecube2-inventory-title" class="fc-inv-title">Inventory</div>
          <div class="fc-inv-top">
            <div class="fc-inv-pane">
              <div class="fc-inv-subtitle">Armor</div>
              <div id="freecube2-inventory-armor" class="fc-inv-column"></div>
            </div>
            <div class="fc-inv-pane fc-inv-preview-pane">
              <div class="fc-inv-subtitle">Player</div>
              <div id="freecube2-inventory-preview" class="fc-inv-preview"></div>
            </div>
            <div class="fc-inv-pane">
              <div id="freecube2-crafting-label" class="fc-inv-subtitle">Crafting</div>
              <div class="fc-inv-crafting-row">
                <div id="freecube2-crafting-grid" class="fc-inv-grid fc-inv-grid-2"></div>
                <div class="fc-inv-arrow">→</div>
                <div id="freecube2-crafting-output" class="freecube2-slot"></div>
              </div>
            </div>
            <div id="freecube2-furnace-pane" class="fc-inv-pane fc-inv-furnace">
              <div class="fc-inv-subtitle">Furnace</div>
              <div class="fc-furnace-layout">
                <div id="freecube2-furnace-input" class="freecube2-slot fc-furnace-slot-input"></div>
                <div id="freecube2-furnace-fuel" class="freecube2-slot fc-furnace-slot-fuel"></div>
                <div class="fc-furnace-fire">
                  <div class="fc-furnace-firebar"><div id="freecube2-furnace-burn"></div></div>
                </div>
                <div class="fc-furnace-arrow">
                  →
                  <div class="fc-furnace-progress"><div id="freecube2-furnace-progress"></div></div>
                </div>
                <div id="freecube2-furnace-output" class="freecube2-slot fc-furnace-slot-output"></div>
              </div>
            </div>
          </div>
          <div id="freecube2-inventory-main" class="fc-inv-grid"></div>
          <div id="freecube2-inventory-hotbar" class="fc-inv-grid"></div>
        </div>
      </div>
      <div id="freecube2-inventory-cursor" class="freecube2-slot fc-inv-cursor"></div>
      <div id="freecube2-menu" class="show">
        <div id="freecube2-panel">
          <div id="fc-screen-title">
            <div class="fc-title">FREECUBE</div>
            <div class="fc-sub">Also try digging straight down</div>
            <div class="fc-stack">
              <button class="fc-btn" data-action="singleplayer">Singleplayer</button>
              <button class="fc-btn disabled" disabled>Multiplayer</button>
              <button class="fc-btn" data-action="open-settings">Options...</button>
              <button class="fc-btn" data-action="reload">Quit Game</button>
            </div>
            <div class="fc-footer" style="margin-top:18px">
              <span>FreeCube2 ${GAME_VERSION}</span>
              <span>Static. Local saves.</span>
            </div>
          </div>
          <div id="fc-screen-worlds" style="display:none">
            <div style="font:900 22px ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 10px auto">Select World</div>
            <div class="fc-card" style="padding:10px;margin:0 auto 10px auto">
              <div class="fc-field" style="margin-top:0">
                <label>Search</label>
                <input id="fc-world-search" placeholder="" />
              </div>
            </div>
            <div class="fc-card" style="margin:0 auto">
              <div id="fc-world-list" class="fc-list"></div>
            </div>
            <div class="fc-row" style="margin-top:10px">
              <button class="fc-btn half" data-action="play-world">Play Selected World</button>
              <button class="fc-btn half" data-action="new-world">Create New World</button>
            </div>
            <div class="fc-row" style="margin-top:10px">
              <button class="fc-btn small disabled" disabled>Edit</button>
              <button class="fc-btn small danger" data-action="delete-world">Delete</button>
              <button class="fc-btn small disabled" disabled>Re-Create</button>
              <button class="fc-btn small" data-action="back-title">Cancel</button>
            </div>
            <div id="fc-new-world" class="fc-card" style="display:none;margin-top:10px">
              <div style="font:900 18px ui-monospace,Menlo,Consolas,monospace;color:#fff;margin-bottom:8px;text-shadow:0 2px 10px rgba(0,0,0,0.7)">Create New World</div>
              <div class="fc-grid">
                <div class="fc-field">
                  <label>World Name</label>
                  <input id="fc-world-name" placeholder="New World" maxlength="48" />
                </div>
                <div class="fc-field">
                  <label>Seed</label>
                  <input id="fc-world-seed" placeholder="Leave blank for random" />
                </div>
              </div>
              <div class="fc-row" style="margin-top:10px">
                <button class="fc-btn half" data-action="create-world">Create New World</button>
                <button class="fc-btn half" data-action="cancel-new-world">Cancel</button>
              </div>
            </div>
          </div>
          <div id="fc-screen-settings" style="display:none">
            <div style="font:900 22px ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 10px auto">Options</div>
            <div class="fc-card" style="margin:0 auto">
              <div class="fc-field">
                <label>Render distance (chunks): <span id="fc-rd-label">4</span></label>
                <input id="fc-rd" class="fc-slider" type="range" min="2" max="6" step="1" value="4" />
              </div>
              <div class="fc-field">
                <label>Mouse sensitivity: <span id="fc-ms-label">0.0026</span></label>
                <input id="fc-ms" class="fc-slider" type="range" min="0.0012" max="0.006" step="0.0001" value="0.0026" />
              </div>
              <div class="fc-field">
                <label>FOV: <span id="fc-fov-label">70</span></label>
                <input id="fc-fov" class="fc-slider" type="range" min="55" max="95" step="1" value="70" />
              </div>
              <div class="fc-field fc-check">
                <input id="fc-show-fps" type="checkbox" />
                <label for="fc-show-fps">Show FPS counter</label>
              </div>
              <div class="fc-field fc-check">
                <input id="fc-view-bob" type="checkbox" />
                <label for="fc-view-bob">View bobbing</label>
              </div>
              <div class="fc-field fc-check" style="display:none">
                <input id="fc-pack32" type="checkbox" />
                <label for="fc-pack32">Use 32px Gigantopack</label>
              </div>
              <div class="fc-field">
                <button id="fc-resource-packs-btn" class="fc-btn" data-action="open-resource-packs-screen">Resource Packs...</button>
                <div id="fc-resource-pack-current" class="fc-small" style="margin-top:8px">Current: Default</div>
              </div>
              <div class="fc-field fc-check">
                <input id="fc-mob-models" type="checkbox" />
                <label for="fc-mob-models">3D mob models</label>
              </div>
              <div class="fc-field fc-check">
                <input id="fc-inv" type="checkbox" />
                <label for="fc-inv">Invert Y</label>
              </div>
              <div class="fc-field fc-check">
                <input id="fc-gm" type="checkbox" />
                <label for="fc-gm">Creative mode (instant break)</label>
              </div>
              <div class="fc-small" style="margin-top:8px">Tip: ESC opens Game Menu. T opens chat. F1 hides HUD.</div>
            </div>
            <div class="fc-row" style="margin-top:10px">
              <button class="fc-btn" data-action="back-settings">Done</button>
            </div>
          </div>
          <div id="fc-screen-resource-packs" style="display:none">
            <div style="font:900 22px ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 6px auto">Select Resource Packs</div>
            <div class="fc-small" style="margin-bottom:10px">Choose between the built-in packs for this world.</div>
            <div class="fc-pack-shell">
              <div class="fc-card fc-pack-column">
                <div class="fc-pack-head">Available</div>
                <div id="fc-resource-pack-available" class="fc-pack-list"></div>
              </div>
              <div class="fc-card fc-pack-column">
                <div class="fc-pack-head">Selected</div>
                <div id="fc-resource-pack-selected" class="fc-pack-list"></div>
              </div>
            </div>
            <div class="fc-row" style="margin-top:10px">
              <button class="fc-btn half" data-action="open-resource-packs">Open Pack Folder</button>
              <button class="fc-btn half" data-action="done-resource-packs">Done</button>
            </div>
          </div>
          <div id="fc-screen-loading" style="display:none">
            <div style="font:700 20px ui-monospace,Menlo,Consolas,monospace;color:#fff;margin:10px 6px 6px 6px">Loading...</div>
            <div class="fc-small" id="fc-load-text">Building chunks and uploading textures</div>
            <div class="fc-card" style="margin-top:10px">
              <div style="height:10px;border-radius:8px;background:rgba(255,255,255,0.1);overflow:hidden">
                <div id="fc-load-bar" style="height:100%;width:0%;background:linear-gradient(90deg, rgba(94,236,171,0.96), rgba(72,162,255,0.96))"></div>
              </div>
              <div class="fc-small" id="fc-load-sub" style="margin-top:8px">0%</div>
            </div>
          </div>
          <div id="fc-screen-pause" style="display:none">
            <div style="font:900 22px ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 10px auto">Game Menu</div>
            <div class="fc-stack">
              <button class="fc-btn" data-action="resume">Back to Game</button>
              <div class="fc-row" style="max-width:min(420px,86vw)">
                <button class="fc-btn half disabled" disabled>Advancements</button>
                <button class="fc-btn half disabled" disabled>Statistics</button>
              </div>
              <div class="fc-row" style="max-width:min(420px,86vw)">
                <button class="fc-btn half" data-action="open-settings">Options...</button>
                <button class="fc-btn half disabled" disabled>Open to LAN</button>
              </div>
              <button class="fc-btn" data-action="quit-title">Save and Quit to Title</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const fpsEl = root.querySelector("#freecube2-fps");
    const bossEl = root.querySelector("#freecube2-boss");
    const timeTintEl = root.querySelector("#freecube2-time-tint");
    const timeChipEl = root.querySelector("#freecube2-time-chip");
    const bossNameEl = root.querySelector("#freecube2-boss-name");
    const bossFill = root.querySelector("#freecube2-boss-bar > div");
    const chatLogEl = root.querySelector("#freecube2-chat-log");
    const chatInputWrap = root.querySelector("#freecube2-chat-input-wrap");
    const chatInput = root.querySelector("#freecube2-chat-input");
    const crosshairEl = root.querySelector("#freecube2-crosshair");
    const miningEl = root.querySelector("#freecube2-mining");
    const miningBar = root.querySelector("#freecube2-mining-bar");
    const statusEl = root.querySelector("#freecube2-status");
    const armorEl = root.querySelector("#freecube2-armor");
    const heartsEl = root.querySelector("#freecube2-hearts");
    const hungerEl = root.querySelector("#freecube2-hunger");
    const xpEl = root.querySelector("#freecube2-xp");
    const xpFill = root.querySelector("#freecube2-xp-bar > div");
    const xpLevelEl = root.querySelector("#freecube2-xp-level");
    const hotbarEl = root.querySelector("#freecube2-hotbar");
    const inventoryEl = root.querySelector("#freecube2-inventory");
    const inventoryTitleEl = root.querySelector("#freecube2-inventory-title");
    const inventoryArmorEl = root.querySelector("#freecube2-inventory-armor");
    const inventoryPreviewEl = root.querySelector("#freecube2-inventory-preview");
    const inventoryCraftLabelEl = root.querySelector("#freecube2-crafting-label");
    const inventoryCraftGridEl = root.querySelector("#freecube2-crafting-grid");
    const inventoryCraftResultEl = root.querySelector("#freecube2-crafting-output");
    const inventoryFurnacePaneEl = root.querySelector("#freecube2-furnace-pane");
    const inventoryFurnaceInputEl = root.querySelector("#freecube2-furnace-input");
    const inventoryFurnaceFuelEl = root.querySelector("#freecube2-furnace-fuel");
    const inventoryFurnaceOutputEl = root.querySelector("#freecube2-furnace-output");
    const inventoryFurnaceBurnEl = root.querySelector("#freecube2-furnace-burn");
    const inventoryFurnaceProgressEl = root.querySelector("#freecube2-furnace-progress");
    const inventoryMainEl = root.querySelector("#freecube2-inventory-main");
    const inventoryHotbarEl = root.querySelector("#freecube2-inventory-hotbar");
    const inventoryCursorEl = root.querySelector("#freecube2-inventory-cursor");
    const menuEl = root.querySelector("#freecube2-menu");

    const screens = {
      title: root.querySelector("#fc-screen-title"),
      worlds: root.querySelector("#fc-screen-worlds"),
      settings: root.querySelector("#fc-screen-settings"),
      resourcePacks: root.querySelector("#fc-screen-resource-packs"),
      loading: root.querySelector("#fc-screen-loading"),
      pause: root.querySelector("#fc-screen-pause")
    };

    const worldListEl = root.querySelector("#fc-world-list");
    const newWorldCard = root.querySelector("#fc-new-world");
    const worldNameInput = root.querySelector("#fc-world-name");
    const worldSeedInput = root.querySelector("#fc-world-seed");
    const playWorldBtn = root.querySelector('[data-action="play-world"]');
    const deleteWorldBtn = root.querySelector('[data-action="delete-world"]');

    const rdSlider = root.querySelector("#fc-rd");
    const rdLabel = root.querySelector("#fc-rd-label");
    const msSlider = root.querySelector("#fc-ms");
    const msLabel = root.querySelector("#fc-ms-label");
    const fovSlider = root.querySelector("#fc-fov");
    const fovLabel = root.querySelector("#fc-fov-label");
    const showFpsCheck = root.querySelector("#fc-show-fps");
    const viewBobCheck = root.querySelector("#fc-view-bob");
    const pack32Check = root.querySelector("#fc-pack32");
    const resourcePacksBtn = root.querySelector("#fc-resource-packs-btn");
    const resourcePackCurrentEl = root.querySelector("#fc-resource-pack-current");
    const mobModelsCheck = root.querySelector("#fc-mob-models");
    const invCheck = root.querySelector("#fc-inv");
    const gmCheck = root.querySelector("#fc-gm");
    const resourcePackAvailableEl = root.querySelector("#fc-resource-pack-available");
    const resourcePackSelectedEl = root.querySelector("#fc-resource-pack-selected");

    const loadBar = root.querySelector("#fc-load-bar");
    const loadSub = root.querySelector("#fc-load-sub");
    const loadText = root.querySelector("#fc-load-text");

    const showScreen = (screen) => {
      Object.values(screens).forEach((el) => { el.style.display = "none"; });
      screens[screen].style.display = "block";
      root.classList.add("menu-open");
      menuEl.classList.add("show");
      crosshairEl.style.display = screen === "loading" || screen === "menu" || screen === "title" || screen === "worlds" || screen === "settings" || screen === "resourcePacks" || screen === "pause" ? "none" : "";
    };

    const hideMenu = () => {
      menuEl.classList.remove("show");
      root.classList.remove("menu-open");
      crosshairEl.style.display = "";
    };

    const setHudVisible = (visible) => {
      hotbarEl.style.display = visible ? "flex" : "none";
      crosshairEl.style.display = visible ? "" : "none";
      statusEl.style.display = visible ? "flex" : "none";
      xpEl.style.display = visible ? "block" : "none";
    };

    ui = {
      root,
      fpsEl,
      bossEl,
      timeTintEl,
      timeChipEl,
      bossNameEl,
      bossFill,
      chatLogEl,
      chatInputWrap,
      chatInput,
      hotbarEl,
      menuEl,
      miningEl,
      miningBar,
      statusEl,
      armorEl,
      heartsEl,
      hungerEl,
      xpEl,
      xpFill,
      xpLevelEl,
      worldListEl,
      inventoryEl,
      inventoryTitleEl,
      inventoryArmorEl,
      inventoryPreviewEl,
      inventoryCraftLabelEl,
      inventoryCraftGridEl,
      inventoryCraftResultEl,
      inventoryFurnacePaneEl,
      inventoryFurnaceInputEl,
      inventoryFurnaceFuelEl,
      inventoryFurnaceOutputEl,
      inventoryFurnaceBurnEl,
      inventoryFurnaceProgressEl,
      inventoryMainEl,
      inventoryHotbarEl,
      inventoryCursorEl,
      newWorldCard,
      worldNameInput,
      worldSeedInput,
      playWorldBtn,
      deleteWorldBtn,
      rdSlider,
      rdLabel,
      msSlider,
      msLabel,
      fovSlider,
      fovLabel,
      showFpsCheck,
      viewBobCheck,
      pack32Check,
      resourcePacksBtn,
      resourcePackCurrentEl,
      mobModelsCheck,
      invCheck,
      gmCheck,
      resourcePackAvailableEl,
      resourcePackSelectedEl,
      loadBar,
      loadSub,
      loadText,
      showScreen,
      hideMenu,
      setHudVisible
    };

    return ui;
  }

  function setHotbarImages() {
    if (!ui) return;
    ui.hotbarEl.innerHTML = "";
    if (!player) return;
    for (let i = 0; i < HOTBAR_SLOTS; i += 1) {
      const slot = document.createElement("div");
      slot.className = "freecube2-slot" + (i === player.selectedHotbarSlot ? " sel" : "");
      renderSlotContents(slot, i, true);
      ui.hotbarEl.appendChild(slot);
    }
    renderInventoryUI();
  }

  function updateHotbarSelection() {
    if (!ui || !player) return;
    const slots = Array.from(ui.hotbarEl.querySelectorAll(".freecube2-slot"));
    slots.forEach((slot, idx) => {
      slot.classList.toggle("sel", idx === player.selectedHotbarSlot);
    });
    const invHotbarSlots = Array.from(ui.inventoryHotbarEl.querySelectorAll(".freecube2-slot"));
    invHotbarSlots.forEach((slot, idx) => {
      slot.classList.toggle("sel", idx === player.selectedHotbarSlot);
    });
  }

  function getInventorySlotType(index) {
    if (!player) return BLOCK.AIR;
    const count = player.inventoryCounts[index] || 0;
    if (count <= 0) return BLOCK.AIR;
    return player.inventoryTypes[index] || BLOCK.AIR;
  }

  function getInventorySlotCount(index) {
    return player ? (player.inventoryCounts[index] || 0) : 0;
  }

  function setInventorySlot(index, type, count) {
    if (!player || index < 0 || index >= INVENTORY_SLOTS) return;
    if (!type || type === BLOCK.AIR || count <= 0) {
      player.inventoryTypes[index] = BLOCK.AIR;
      player.inventoryCounts[index] = 0;
      return;
    }
    player.inventoryTypes[index] = type;
    player.inventoryCounts[index] = clamp(Math.floor(count), 0, getItemMaxStack(type));
  }

  function getArmorSlotType(index) {
    if (!player || index < 0 || index >= ARMOR_SLOTS) return BLOCK.AIR;
    return (player.armorCounts[index] || 0) > 0 ? (player.armorTypes[index] || BLOCK.AIR) : BLOCK.AIR;
  }

  function getArmorSlotCount(index) {
    if (!player || index < 0 || index >= ARMOR_SLOTS) return 0;
    return player.armorCounts[index] || 0;
  }

  function setArmorSlot(index, type, count) {
    if (!player || index < 0 || index >= ARMOR_SLOTS) return;
    const slotKey = ARMOR_SLOT_KEYS[index];
    if (!type || type === BLOCK.AIR || count <= 0 || getItemArmorSlot(type) !== slotKey) {
      player.armorTypes[index] = BLOCK.AIR;
      player.armorCounts[index] = 0;
      return;
    }
    player.armorTypes[index] = type;
    player.armorCounts[index] = 1;
  }

  function packBlockPositionKey(x, y, z) {
    return `${Math.floor(x)}|${Math.floor(y)}|${Math.floor(z)}`;
  }

  function getFurnaceStateByKey(key, create = false) {
    if (!key) return null;
    let state = furnaceStates.get(key) || null;
    if (!state && create) {
      state = {
        inputType: BLOCK.AIR,
        inputCount: 0,
        fuelType: BLOCK.AIR,
        fuelCount: 0,
        outputType: BLOCK.AIR,
        outputCount: 0,
        burnTime: 0,
        burnTimeTotal: 0,
        cookTime: 0
      };
      furnaceStates.set(key, state);
    }
    return state;
  }

  function getFurnaceStateAt(x, y, z, create = false) {
    return getFurnaceStateByKey(packBlockPositionKey(x, y, z), create);
  }

  function getActiveFurnaceState(create = false) {
    return getFurnaceStateByKey(activeFurnaceKey, create);
  }

  function trimFurnaceSlot(typeKey, countKey, state) {
    if (!state) return;
    if (!state[typeKey] || state[typeKey] === BLOCK.AIR || (state[countKey] || 0) <= 0) {
      state[typeKey] = BLOCK.AIR;
      state[countKey] = 0;
    }
  }

  function isFurnaceEmpty(state) {
    if (!state) return true;
    return (
      (state.inputCount || 0) <= 0 &&
      (state.fuelCount || 0) <= 0 &&
      (state.outputCount || 0) <= 0 &&
      (state.burnTime || 0) <= 0 &&
      (state.cookTime || 0) <= 0
    );
  }

  function pruneFurnaceState(key) {
    if (!key) return;
    const state = furnaceStates.get(key);
    if (isFurnaceEmpty(state)) {
      furnaceStates.delete(key);
    }
  }

  function getFurnaceSlotValue(slot) {
    const state = getActiveFurnaceState(false);
    if (!state) return { type: BLOCK.AIR, count: 0 };
    if (slot === "input") {
      return { type: state.inputCount > 0 ? (state.inputType || BLOCK.AIR) : BLOCK.AIR, count: state.inputCount || 0 };
    }
    if (slot === "fuel") {
      return { type: state.fuelCount > 0 ? (state.fuelType || BLOCK.AIR) : BLOCK.AIR, count: state.fuelCount || 0 };
    }
    return { type: state.outputCount > 0 ? (state.outputType || BLOCK.AIR) : BLOCK.AIR, count: state.outputCount || 0 };
  }

  function setFurnaceSlotValue(slot, type, count) {
    const state = getActiveFurnaceState(true);
    if (!state) return;
    if (slot === "input") {
      state.inputType = !type || type === BLOCK.AIR || count <= 0 ? BLOCK.AIR : type;
      state.inputCount = state.inputType === BLOCK.AIR ? 0 : clamp(Math.floor(count), 0, getItemMaxStack(type));
      trimFurnaceSlot("inputType", "inputCount", state);
    } else if (slot === "fuel") {
      state.fuelType = !type || type === BLOCK.AIR || count <= 0 ? BLOCK.AIR : type;
      state.fuelCount = state.fuelType === BLOCK.AIR ? 0 : clamp(Math.floor(count), 0, getItemMaxStack(type));
      trimFurnaceSlot("fuelType", "fuelCount", state);
    } else {
      state.outputType = !type || type === BLOCK.AIR || count <= 0 ? BLOCK.AIR : type;
      state.outputCount = state.outputType === BLOCK.AIR ? 0 : clamp(Math.floor(count), 0, getItemMaxStack(type));
      trimFurnaceSlot("outputType", "outputCount", state);
    }
    pruneFurnaceState(activeFurnaceKey);
  }

  function getFurnaceCookProgress(state = getActiveFurnaceState(false)) {
    if (!state) return 0;
    return clamp((state.cookTime || 0) / FURNACE_SMELT_TIME, 0, 1);
  }

  function getFurnaceBurnProgress(state = getActiveFurnaceState(false)) {
    if (!state) return 0;
    if ((state.burnTimeTotal || 0) <= 0 || (state.burnTime || 0) <= 0) return 0;
    return clamp((state.burnTime || 0) / (state.burnTimeTotal || 1), 0, 1);
  }

  function getActiveCraftState() {
    const isTable = inventoryContext === "table";
    return isTable
      ? { types: tableCraftTypes, counts: tableCraftCounts, size: 3, slots: CRAFT_GRID_LARGE, title: "Crafting Table", label: "Crafting 3x3" }
      : { types: inventoryCraftTypes, counts: inventoryCraftCounts, size: 2, slots: CRAFT_GRID_SMALL, title: "Inventory", label: "Crafting 2x2" };
  }

  function getCraftSlotType(index) {
    const state = getActiveCraftState();
    if (index < 0 || index >= state.slots) return BLOCK.AIR;
    return (state.counts[index] || 0) > 0 ? (state.types[index] || BLOCK.AIR) : BLOCK.AIR;
  }

  function getCraftSlotCount(index) {
    const state = getActiveCraftState();
    if (index < 0 || index >= state.slots) return 0;
    return state.counts[index] || 0;
  }

  function setCraftSlot(index, type, count) {
    const state = getActiveCraftState();
    if (index < 0 || index >= state.slots) return;
    if (!type || type === BLOCK.AIR || count <= 0) {
      state.types[index] = BLOCK.AIR;
      state.counts[index] = 0;
      return;
    }
    state.types[index] = type;
    state.counts[index] = clamp(Math.floor(count), 0, getItemMaxStack(type));
  }

  function trimCraftingMatrix(types, counts, size) {
    let minRow = size;
    let maxRow = -1;
    let minCol = size;
    let maxCol = -1;

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const index = row * size + col;
        if ((counts[index] || 0) <= 0 || (types[index] || 0) === BLOCK.AIR) continue;
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
      }
    }

    if (maxRow < minRow || maxCol < minCol) {
      return [];
    }

    const result = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      const outRow = [];
      for (let col = minCol; col <= maxCol; col += 1) {
        const index = row * size + col;
        outRow.push((counts[index] || 0) > 0 ? (types[index] || BLOCK.AIR) : BLOCK.AIR);
      }
      result.push(outRow);
    }
    return result;
  }

  function mirrorMatrixHorizontally(matrix) {
    return matrix.map((row) => [...row].reverse());
  }

  function matricesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let row = 0; row < a.length; row += 1) {
      if ((a[row] || []).length !== (b[row] || []).length) return false;
      for (let col = 0; col < a[row].length; col += 1) {
        if ((a[row][col] || 0) !== (b[row][col] || 0)) return false;
      }
    }
    return true;
  }

  function getCraftingResult() {
    const state = getActiveCraftState();
    const matrix = trimCraftingMatrix(state.types, state.counts, state.size);
    if (matrix.length === 0) {
      return null;
    }
    for (const recipe of CRAFTING_RECIPES) {
      const recipeHeight = recipe.pattern.length;
      const recipeWidth = recipe.pattern[0]?.length || 0;
      if (recipeHeight > state.size || recipeWidth > state.size) continue;
      if (matrix.length !== recipeHeight || matrix[0].length !== recipeWidth) continue;
      if (matricesEqual(matrix, recipe.pattern) || (recipe.mirrored && matricesEqual(matrix, mirrorMatrixHorizontally(recipe.pattern)))) {
        return recipe;
      }
    }
    return null;
  }

  function consumeCraftingIngredients(recipe) {
    const state = getActiveCraftState();
    const pattern = recipe.pattern;
    const matrix = trimCraftingMatrix(state.types, state.counts, state.size);
    const mirrored = recipe.mirrored && matricesEqual(matrix, mirrorMatrixHorizontally(recipe.pattern)) && !matricesEqual(matrix, recipe.pattern);
    const target = mirrored ? mirrorMatrixHorizontally(pattern) : pattern;

    let minRow = state.size;
    let minCol = state.size;
    for (let row = 0; row < state.size; row += 1) {
      for (let col = 0; col < state.size; col += 1) {
        const index = row * state.size + col;
        if ((state.counts[index] || 0) <= 0 || (state.types[index] || 0) === BLOCK.AIR) continue;
        minRow = Math.min(minRow, row);
        minCol = Math.min(minCol, col);
      }
    }

    for (let row = 0; row < target.length; row += 1) {
      for (let col = 0; col < target[row].length; col += 1) {
        const expected = target[row][col] || BLOCK.AIR;
        if (!expected) continue;
        const index = (minRow + row) * state.size + (minCol + col);
        const next = Math.max(0, (state.counts[index] || 0) - 1);
        state.counts[index] = next;
        if (next <= 0) {
          state.types[index] = BLOCK.AIR;
        }
      }
    }
  }

  function returnCraftItemsToInventory() {
    const state = getActiveCraftState();
    for (let index = 0; index < state.slots; index += 1) {
      const type = state.types[index] || BLOCK.AIR;
      const count = state.counts[index] || 0;
      if (!type || type === BLOCK.AIR || count <= 0) continue;
      const left = addToInventory(type, count, false);
      if (left > 0 && player) {
        const eye = player.getEyePosition();
        spawnItemEntity(type, left, eye.x, eye.y - 0.4, eye.z, 0, 1.6, 0, 0.2);
      }
      state.types[index] = BLOCK.AIR;
      state.counts[index] = 0;
    }
  }

  function renderItemStack(slot, itemType, count = 0, showCount = true, placeholder = "") {
    slot.innerHTML = "";
    slot.draggable = false;
    if (placeholder) {
      slot.title = placeholder;
    } else {
      slot.removeAttribute("title");
    }
    if (!itemType || itemType === BLOCK.AIR || count <= 0) return;
    const image = textures?.getItemTexture(itemType, settings);
    if (image?.src) {
      const img = document.createElement("img");
      img.src = image.src;
      img.alt = getItemName(itemType);
      img.draggable = false;
      img.setAttribute("draggable", "false");
      img.addEventListener("dragstart", (event) => {
        event.preventDefault();
      });
      slot.appendChild(img);
    }
    if (showCount && count > 1) {
      const c = document.createElement("div");
      c.className = "fc-count";
      c.textContent = String(count);
      slot.appendChild(c);
    }
  }

  function renderSlotContents(slot, inventoryIndex, isHotbar = false) {
    if (!player) {
      slot.innerHTML = "";
      return;
    }
    const isCreative = settings.gameMode === GAME_MODE.CREATIVE;
    const itemType = isCreative && isHotbar ? HOTBAR_BLOCKS[inventoryIndex] : getInventorySlotType(inventoryIndex);
    const count = isCreative && isHotbar ? 1 : getInventorySlotCount(inventoryIndex);
    renderItemStack(slot, itemType, count, !isCreative);
  }

  function updateInventoryCursorVisual() {
    if (!ui) return;
    ui.inventoryCursorEl.innerHTML = "";
    if (!inventoryOpen || inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      ui.inventoryCursorEl.style.display = "none";
      return;
    }
    ui.inventoryCursorEl.style.display = "grid";
    renderItemStack(ui.inventoryCursorEl, inventoryCursor.type, inventoryCursor.count, true);
  }

  function updateInventoryCursorPosition() {
    if (!ui || !inventoryOpen || ui.inventoryCursorEl.style.display === "none") return;
    const mouse = input?.getMousePosition?.() || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    ui.inventoryCursorEl.style.left = `${mouse.x}px`;
    ui.inventoryCursorEl.style.top = `${mouse.y}px`;
  }

  function clearInventoryDragVisuals() {
    if (!ui) return;
    ui.root.querySelectorAll(".freecube2-slot.drag-target").forEach((slot) => slot.classList.remove("drag-target"));
  }

  function renderInventoryPreview() {
    if (!ui) return;
    const canvas = document.createElement("canvas");
    canvas.className = "fc-inv-player-canvas";
    renderPlayerPreviewCanvas(canvas, {
      head: getArmorSlotType(0),
      chest: getArmorSlotType(1),
      legs: getArmorSlotType(2),
      feet: getArmorSlotType(3)
    });
    ui.inventoryPreviewEl.innerHTML = "";
    ui.inventoryPreviewEl.appendChild(canvas);
  }

  function renderInventoryUI() {
    if (!ui || !player) return;
    const craftState = getActiveCraftState();
    const craftResult = getCraftingResult();
    const isFurnace = inventoryContext === "furnace";
    const furnaceState = getActiveFurnaceState(false);
    ui.inventoryTitleEl.textContent = isFurnace ? "Furnace" : craftState.title;
    ui.inventoryCraftLabelEl.textContent = craftState.label;
    ui.inventoryCraftGridEl.classList.toggle("fc-inv-grid-2", craftState.size === 2);
    ui.inventoryCraftGridEl.classList.toggle("fc-inv-grid-3", craftState.size === 3);
    ui.inventoryCraftGridEl.parentElement.style.display = isFurnace ? "none" : "flex";
    ui.inventoryCraftLabelEl.style.display = isFurnace ? "none" : "block";
    ui.inventoryFurnacePaneEl.classList.toggle("show", isFurnace);

    ui.inventoryArmorEl.innerHTML = "";
    ui.inventoryCraftGridEl.innerHTML = "";
    ui.inventoryMainEl.innerHTML = "";
    ui.inventoryHotbarEl.innerHTML = "";

    for (let index = 0; index < ARMOR_SLOTS; index += 1) {
      const slot = document.createElement("div");
      slot.className = "freecube2-slot";
      slot.dataset.armorIndex = String(index);
      renderItemStack(slot, getArmorSlotType(index), getArmorSlotCount(index), true, ARMOR_SLOT_LABELS[index]);
      ui.inventoryArmorEl.appendChild(slot);
    }
    renderInventoryPreview();

    if (!isFurnace) {
      for (let index = 0; index < craftState.slots; index += 1) {
        const slot = document.createElement("div");
        slot.className = "freecube2-slot";
        slot.dataset.craftIndex = String(index);
        renderItemStack(slot, getCraftSlotType(index), getCraftSlotCount(index), true);
        ui.inventoryCraftGridEl.appendChild(slot);
      }
    }

    ui.inventoryCraftResultEl.dataset.craftOutput = isFurnace ? "" : "1";
    ui.inventoryCraftResultEl.style.display = isFurnace ? "none" : "grid";
    if (!isFurnace) {
      renderItemStack(ui.inventoryCraftResultEl, craftResult?.result.itemType || BLOCK.AIR, craftResult?.result.count || 0, true);
    } else {
      ui.inventoryCraftResultEl.innerHTML = "";
    }

    renderItemStack(ui.inventoryFurnaceInputEl, furnaceState?.inputType || BLOCK.AIR, furnaceState?.inputCount || 0, true, "Smeltable");
    ui.inventoryFurnaceInputEl.dataset.furnaceSlot = "input";
    renderItemStack(ui.inventoryFurnaceFuelEl, furnaceState?.fuelType || BLOCK.AIR, furnaceState?.fuelCount || 0, true, "Fuel");
    ui.inventoryFurnaceFuelEl.dataset.furnaceSlot = "fuel";
    renderItemStack(ui.inventoryFurnaceOutputEl, furnaceState?.outputType || BLOCK.AIR, furnaceState?.outputCount || 0, true, "Output");
    ui.inventoryFurnaceOutputEl.dataset.furnaceSlot = "output";
    ui.inventoryFurnaceBurnEl.style.height = `${Math.floor(getFurnaceBurnProgress(furnaceState) * 100)}%`;
    ui.inventoryFurnaceProgressEl.style.width = `${Math.floor(getFurnaceCookProgress(furnaceState) * 100)}%`;

    for (let index = MAIN_INVENTORY_START; index < INVENTORY_SLOTS; index += 1) {
      const slot = document.createElement("div");
      slot.className = "freecube2-slot";
      slot.dataset.inventoryIndex = String(index);
      renderSlotContents(slot, index, false);
      ui.inventoryMainEl.appendChild(slot);
    }

    for (let index = 0; index < HOTBAR_SLOTS; index += 1) {
      const slot = document.createElement("div");
      slot.className = "freecube2-slot" + (index === player.selectedHotbarSlot ? " sel" : "");
      slot.dataset.inventoryIndex = String(index);
      renderSlotContents(slot, index, true);
      ui.inventoryHotbarEl.appendChild(slot);
    }

    clearInventoryDragVisuals();
    updateInventoryCursorVisual();
  }

  function setInventoryOpen(open, context = inventoryContext) {
    ensureUI();
    if (open && inventoryOpen && inventoryContext !== context) {
      returnCraftItemsToInventory();
    }
    inventoryContext = context === "table" ? "table" : context === "furnace" ? "furnace" : "inventory";
    if (inventoryContext !== "furnace") {
      activeFurnaceKey = null;
    }
    inventoryOpen = !!open;
    ui.inventoryEl.style.display = inventoryOpen ? "block" : "none";
    ui.setHudVisible(mode === "playing" && hud.visible && !inventoryOpen);
    if (inventoryOpen) {
      input?.resetState?.(true);
      ui.root.classList.add("menu-open");
      input.pointerLockEnabled = false;
      if (document.exitPointerLock) document.exitPointerLock();
      renderInventoryUI();
      updateInventoryCursorPosition();
    } else {
      returnCraftItemsToInventory();
      if (inventoryCursor.type !== BLOCK.AIR && inventoryCursor.count > 0 && player) {
        const left = addToInventory(inventoryCursor.type, inventoryCursor.count, false);
        if (left > 0) {
          const eye = player.getEyePosition();
          spawnItemEntity(inventoryCursor.type, left, eye.x, eye.y - 0.35, eye.z, 0, 1.6, 0, 0.2);
        }
      }
      inventoryCursor.type = BLOCK.AIR;
      inventoryCursor.count = 0;
      inventoryDrag = { pending: false, active: false, button: 0, origin: null, targets: [], targetKeys: new Set() };
      clearInventoryDragVisuals();
      updateInventoryCursorVisual();
      inventoryContext = "inventory";
      activeFurnaceKey = null;
      setHotbarImages();
      if (!ui.menuEl.classList.contains("show")) {
        ui.root.classList.remove("menu-open");
      }
      if (mode === "playing") {
        input.pointerLockEnabled = true;
        input.requestPointerLock();
      }
    }
  }

  function moveCursorWithSlot(slotType, slotCount, setSlot) {
    if (inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      if (slotType === BLOCK.AIR || slotCount <= 0) return false;
      inventoryCursor.type = slotType;
      inventoryCursor.count = slotCount;
      setSlot(BLOCK.AIR, 0);
      return true;
    }
    if (slotType === BLOCK.AIR || slotCount <= 0) {
      setSlot(inventoryCursor.type, inventoryCursor.count);
      inventoryCursor.type = BLOCK.AIR;
      inventoryCursor.count = 0;
      return true;
    }
    const maxStack = getItemMaxStack(slotType);
    if (slotType === inventoryCursor.type && slotCount < maxStack) {
      const add = Math.min(maxStack - slotCount, inventoryCursor.count);
      setSlot(slotType, slotCount + add);
      inventoryCursor.count -= add;
      if (inventoryCursor.count <= 0) {
        inventoryCursor.type = BLOCK.AIR;
        inventoryCursor.count = 0;
      }
      return true;
    }
    const swapType = slotType;
    const swapCount = slotCount;
    setSlot(inventoryCursor.type, inventoryCursor.count);
    inventoryCursor.type = swapType;
    inventoryCursor.count = swapCount;
    return true;
  }

  function moveStackIntoInventoryRange(itemType, count, start, end, reverse = false) {
    if (!player || !itemType || itemType === BLOCK.AIR || count <= 0) {
      return count;
    }
    let left = Math.max(0, Math.floor(count));
    const step = reverse ? -1 : 1;
    const from = reverse ? end - 1 : start;
    const to = reverse ? start - 1 : end;
    const maxStack = getItemMaxStack(itemType);

    for (let index = from; index !== to && left > 0; index += step) {
      if ((player.inventoryCounts[index] || 0) <= 0 || player.inventoryTypes[index] !== itemType) continue;
      const slotCount = player.inventoryCounts[index] || 0;
      if (slotCount >= maxStack) continue;
      const add = Math.min(left, maxStack - slotCount);
      player.inventoryCounts[index] = slotCount + add;
      left -= add;
    }

    for (let index = from; index !== to && left > 0; index += step) {
      if ((player.inventoryCounts[index] || 0) > 0) continue;
      const add = Math.min(left, maxStack);
      player.inventoryTypes[index] = itemType;
      player.inventoryCounts[index] = add;
      left -= add;
    }

    return left;
  }

  function moveStackIntoFurnaceSlot(slot, itemType, count) {
    const state = getActiveFurnaceState(true);
    if (!state || !itemType || itemType === BLOCK.AIR || count <= 0) return count;
    if (slot === "input" && !isSmeltableItem(itemType)) return count;
    if (slot === "fuel" && !isFuelItem(itemType)) return count;
    const typeKey = slot === "input" ? "inputType" : "fuelType";
    const countKey = slot === "input" ? "inputCount" : "fuelCount";
    const slotType = state[typeKey] || BLOCK.AIR;
    const slotCount = state[countKey] || 0;
    if (slotCount > 0 && slotType !== itemType) return count;
    const maxStack = getItemMaxStack(itemType);
    const add = Math.min(count, maxStack - slotCount);
    if (add <= 0) return count;
    state[typeKey] = itemType;
    state[countKey] = slotCount + add;
    return count - add;
  }

  function moveStackIntoArmorSlot(itemType, count) {
    const slotKey = getItemArmorSlot(itemType);
    if (!slotKey || count <= 0) return count;
    const armorIndex = ARMOR_SLOT_KEYS.indexOf(slotKey);
    if (armorIndex < 0 || getArmorSlotCount(armorIndex) > 0) return count;
    setArmorSlot(armorIndex, itemType, 1);
    return count - 1;
  }

  function quickMoveInventorySlot(index) {
    if (!player || index < 0 || index >= INVENTORY_SLOTS) return false;
    const type = getInventorySlotType(index);
    const count = getInventorySlotCount(index);
    if (!type || type === BLOCK.AIR || count <= 0) return false;

    let left = count;
    if (inventoryContext === "furnace") {
      if (isSmeltableItem(type)) {
        left = moveStackIntoFurnaceSlot("input", type, left);
      }
      if (left > 0 && isFuelItem(type)) {
        left = moveStackIntoFurnaceSlot("fuel", type, left);
      }
    }

    if (left > 0) {
      const armorLeft = moveStackIntoArmorSlot(type, left);
      if (armorLeft !== left) {
        left = armorLeft;
      }
    }

    if (left > 0) {
      if (index < HOTBAR_SLOTS) {
        left = moveStackIntoInventoryRange(type, left, MAIN_INVENTORY_START, INVENTORY_SLOTS);
      } else {
        left = moveStackIntoInventoryRange(type, left, 0, HOTBAR_SLOTS, true);
      }
    }

    if (left === count) return false;
    setInventorySlot(index, type, left);
    return true;
  }

  function quickMoveArmorSlot(index) {
    const type = getArmorSlotType(index);
    const count = getArmorSlotCount(index);
    if (!type || type === BLOCK.AIR || count <= 0) return false;
    const left = addToInventory(type, count, false);
    if (left >= count) return false;
    setArmorSlot(index, BLOCK.AIR, 0);
    return true;
  }

  function getInventorySpaceForItem(itemType) {
    if (!player || !itemType || itemType === BLOCK.AIR) return 0;
    const maxStack = getItemMaxStack(itemType);
    let space = 0;
    for (let i = 0; i < INVENTORY_SLOTS; i += 1) {
      const count = player.inventoryCounts[i] || 0;
      if (count <= 0) {
        space += maxStack;
      } else if (player.inventoryTypes[i] === itemType) {
        space += Math.max(0, maxStack - count);
      }
    }
    return space;
  }

  function quickMoveCraftResult() {
    let crafted = false;
    while (true) {
      const recipe = getCraftingResult();
      if (!recipe) break;
      const count = recipe.result.count;
      if (getInventorySpaceForItem(recipe.result.itemType) < count) {
        break;
      }
      addToInventory(recipe.result.itemType, count, false);
      consumeCraftingIngredients(recipe);
      crafted = true;
    }
    return crafted;
  }

  function quickMoveFurnaceOutput() {
    const state = getActiveFurnaceState(false);
    if (!state || (state.outputCount || 0) <= 0 || !state.outputType) return false;
    const left = addToInventory(state.outputType, state.outputCount, false);
    if (left >= (state.outputCount || 0)) return false;
    state.outputCount = left;
    if (left <= 0) {
      state.outputType = BLOCK.AIR;
    }
    pruneFurnaceState(activeFurnaceKey);
    return true;
  }

  function quickMoveFurnaceSlot(slot) {
    const state = getActiveFurnaceState(false);
    if (!state) return false;
    const typeKey = slot === "input" ? "inputType" : "fuelType";
    const countKey = slot === "input" ? "inputCount" : "fuelCount";
    const type = state[typeKey] || BLOCK.AIR;
    const count = state[countKey] || 0;
    if (!type || type === BLOCK.AIR || count <= 0) return false;
    const left = addToInventory(type, count, false);
    if (left >= count) return false;
    state[countKey] = left;
    if (left <= 0) {
      state[typeKey] = BLOCK.AIR;
    }
    pruneFurnaceState(activeFurnaceKey);
    return true;
  }

  function handleInventorySlotClick(index, options = {}) {
    if (!player || index < 0 || index >= INVENTORY_SLOTS) return;
    if (options.shiftKey) {
      if (!quickMoveInventorySlot(index)) return;
      world.saveDirty = true;
      setHotbarImages();
      renderInventoryUI();
      return;
    }
    const changed = moveCursorWithSlot(getInventorySlotType(index), getInventorySlotCount(index), (type, count) => setInventorySlot(index, type, count));
    if (!changed) return;
    world.saveDirty = true;
    setHotbarImages();
    renderInventoryUI();
  }

  function handleArmorSlotClick(index, options = {}) {
    if (!player || index < 0 || index >= ARMOR_SLOTS) return;
    if (options.shiftKey) {
      if (!quickMoveArmorSlot(index)) return;
      world.saveDirty = true;
      setHotbarImages();
      renderInventoryUI();
      return;
    }
    const slotKey = ARMOR_SLOT_KEYS[index];
    const slotType = getArmorSlotType(index);
    const slotCount = getArmorSlotCount(index);

    if (inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      if (slotType === BLOCK.AIR || slotCount <= 0) return;
      inventoryCursor.type = slotType;
      inventoryCursor.count = slotCount;
      setArmorSlot(index, BLOCK.AIR, 0);
    } else {
      if (getItemArmorSlot(inventoryCursor.type) !== slotKey) return;
      const swapType = slotType;
      const swapCount = slotCount;
      setArmorSlot(index, inventoryCursor.type, 1);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        inventoryCursor.type = BLOCK.AIR;
        inventoryCursor.count = 0;
      }
      if (swapType !== BLOCK.AIR && swapCount > 0) {
        if (inventoryCursor.type === BLOCK.AIR) {
          inventoryCursor.type = swapType;
          inventoryCursor.count = swapCount;
        } else {
          const left = addToInventory(swapType, swapCount, false);
          if (left > 0 && player) {
            const eye = player.getEyePosition();
            spawnItemEntity(swapType, left, eye.x, eye.y - 0.35, eye.z, 0, 1.4, 0, 0.2);
          }
        }
      }
    }

    world.saveDirty = true;
    setHotbarImages();
    renderInventoryUI();
  }

  function handleCraftSlotClick(index) {
    const changed = moveCursorWithSlot(getCraftSlotType(index), getCraftSlotCount(index), (type, count) => setCraftSlot(index, type, count));
    if (!changed) return;
    world.saveDirty = true;
    renderInventoryUI();
  }

  function handleCraftResultClick(options = {}) {
    if (options.shiftKey) {
      if (!quickMoveCraftResult()) return;
      world.saveDirty = true;
      setHotbarImages();
      renderInventoryUI();
      return;
    }
    const recipe = getCraftingResult();
    if (!recipe) return;
    const resultType = recipe.result.itemType;
    const resultCount = recipe.result.count;
    const maxStack = getItemMaxStack(resultType);
    if (inventoryCursor.type !== BLOCK.AIR && inventoryCursor.type !== resultType) return;
    if (inventoryCursor.type === resultType && inventoryCursor.count + resultCount > maxStack) return;
    consumeCraftingIngredients(recipe);
    inventoryCursor.type = resultType;
    inventoryCursor.count = Math.min(maxStack, (inventoryCursor.count || 0) + resultCount);
    world.saveDirty = true;
    setHotbarImages();
    renderInventoryUI();
  }

  function handleFurnaceSlotClick(slot, options = {}) {
    if (slot === "output") {
      if (options.shiftKey) {
        if (!quickMoveFurnaceOutput()) return;
        world.saveDirty = true;
        setHotbarImages();
        renderInventoryUI();
        return;
      }
      const slotValue = getFurnaceSlotValue("output");
      if (slotValue.count <= 0 || slotValue.type === BLOCK.AIR) return;
      if (inventoryCursor.type !== BLOCK.AIR && inventoryCursor.type !== slotValue.type) return;
      const maxStack = getItemMaxStack(slotValue.type);
      if (inventoryCursor.type === slotValue.type && inventoryCursor.count >= maxStack) return;
      const add = Math.min(slotValue.count, maxStack - (inventoryCursor.type === slotValue.type ? inventoryCursor.count : 0));
      if (add <= 0) return;
      inventoryCursor.type = slotValue.type;
      inventoryCursor.count = (inventoryCursor.count || 0) + add;
      setFurnaceSlotValue("output", slotValue.type, slotValue.count - add);
      world.saveDirty = true;
      renderInventoryUI();
      return;
    }

    if (options.shiftKey) {
      if (!quickMoveFurnaceSlot(slot)) return;
      world.saveDirty = true;
      setHotbarImages();
      renderInventoryUI();
      return;
    }

    const slotValue = getFurnaceSlotValue(slot);
    const canAccept = slot === "input" ? isSmeltableItem(inventoryCursor.type) : isFuelItem(inventoryCursor.type);
    let changed = false;
    if (inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      if (slotValue.type === BLOCK.AIR || slotValue.count <= 0) return;
      inventoryCursor.type = slotValue.type;
      inventoryCursor.count = slotValue.count;
      setFurnaceSlotValue(slot, BLOCK.AIR, 0);
      changed = true;
    } else if (slotValue.type === BLOCK.AIR || slotValue.count <= 0) {
      if (!canAccept) return;
      setFurnaceSlotValue(slot, inventoryCursor.type, inventoryCursor.count);
      inventoryCursor.type = BLOCK.AIR;
      inventoryCursor.count = 0;
      changed = true;
    } else if (slotValue.type === inventoryCursor.type && slotValue.count < getItemMaxStack(slotValue.type)) {
      const add = Math.min(getItemMaxStack(slotValue.type) - slotValue.count, inventoryCursor.count);
      if (add <= 0) return;
      setFurnaceSlotValue(slot, slotValue.type, slotValue.count + add);
      inventoryCursor.count -= add;
      if (inventoryCursor.count <= 0) {
        inventoryCursor.type = BLOCK.AIR;
        inventoryCursor.count = 0;
      }
      changed = true;
    } else if (canAccept) {
      const swapType = slotValue.type;
      const swapCount = slotValue.count;
      setFurnaceSlotValue(slot, inventoryCursor.type, inventoryCursor.count);
      inventoryCursor.type = swapType;
      inventoryCursor.count = swapCount;
      changed = true;
    }
    if (!changed) return;
    world.saveDirty = true;
    renderInventoryUI();
  }

  function handleInventorySlotRightClick(index) {
    if (!player || index < 0 || index >= INVENTORY_SLOTS) return;
    const slotType = getInventorySlotType(index);
    const slotCount = getInventorySlotCount(index);

    if (inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      if (slotType === BLOCK.AIR || slotCount <= 0) return;
      const take = Math.ceil(slotCount / 2);
      inventoryCursor.type = slotType;
      inventoryCursor.count = take;
      setInventorySlot(index, slotType, slotCount - take);
    } else if (slotType === BLOCK.AIR || slotCount <= 0) {
      setInventorySlot(index, inventoryCursor.type, 1);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        inventoryCursor.type = BLOCK.AIR;
        inventoryCursor.count = 0;
      }
    } else if (slotType === inventoryCursor.type && slotCount < getItemMaxStack(slotType)) {
      setInventorySlot(index, slotType, slotCount + 1);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        inventoryCursor.type = BLOCK.AIR;
        inventoryCursor.count = 0;
      }
    } else {
      return;
    }

    world.saveDirty = true;
    setHotbarImages();
    renderInventoryUI();
  }

  function handleCraftSlotRightClick(index) {
    const slotType = getCraftSlotType(index);
    const slotCount = getCraftSlotCount(index);

    if (inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      if (slotType === BLOCK.AIR || slotCount <= 0) return;
      const take = Math.ceil(slotCount / 2);
      inventoryCursor.type = slotType;
      inventoryCursor.count = take;
      setCraftSlot(index, slotType, slotCount - take);
    } else if (slotType === BLOCK.AIR || slotCount <= 0) {
      setCraftSlot(index, inventoryCursor.type, 1);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        inventoryCursor.type = BLOCK.AIR;
        inventoryCursor.count = 0;
      }
    } else if (slotType === inventoryCursor.type && slotCount < getItemMaxStack(slotType)) {
      setCraftSlot(index, slotType, slotCount + 1);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        inventoryCursor.type = BLOCK.AIR;
        inventoryCursor.count = 0;
      }
    } else {
      return;
    }

    world.saveDirty = true;
    renderInventoryUI();
  }

  function handleFurnaceSlotRightClick(slot) {
    const slotValue = getFurnaceSlotValue(slot);
    if (slot === "output") {
      if (slotValue.type === BLOCK.AIR || slotValue.count <= 0) return;
      if (inventoryCursor.type !== BLOCK.AIR && inventoryCursor.type !== slotValue.type) return;
      const maxStack = getItemMaxStack(slotValue.type);
      if (inventoryCursor.type === slotValue.type && inventoryCursor.count >= maxStack) return;
      inventoryCursor.type = slotValue.type;
      inventoryCursor.count = Math.min(maxStack, (inventoryCursor.count || 0) + 1);
      setFurnaceSlotValue("output", slotValue.type, slotValue.count - 1);
      world.saveDirty = true;
      renderInventoryUI();
      return;
    }

    if (inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      if (slotValue.type === BLOCK.AIR || slotValue.count <= 0) return;
      const take = Math.ceil(slotValue.count / 2);
      inventoryCursor.type = slotValue.type;
      inventoryCursor.count = take;
      setFurnaceSlotValue(slot, slotValue.type, slotValue.count - take);
    } else {
      const canAccept = slot === "input" ? isSmeltableItem(inventoryCursor.type) : isFuelItem(inventoryCursor.type);
      if (!canAccept) return;
      if (slotValue.type === BLOCK.AIR || slotValue.count <= 0) {
        setFurnaceSlotValue(slot, inventoryCursor.type, 1);
        inventoryCursor.count -= 1;
      } else if (slotValue.type === inventoryCursor.type && slotValue.count < getItemMaxStack(slotValue.type)) {
        setFurnaceSlotValue(slot, slotValue.type, slotValue.count + 1);
        inventoryCursor.count -= 1;
      } else {
        return;
      }
      if (inventoryCursor.count <= 0) {
        inventoryCursor.type = BLOCK.AIR;
        inventoryCursor.count = 0;
      }
    }

    world.saveDirty = true;
    renderInventoryUI();
  }

  function handleArmorSlotRightClick(index) {
    if (!player || index < 0 || index >= ARMOR_SLOTS) return;
    const slotType = getArmorSlotType(index);
    const slotCount = getArmorSlotCount(index);
    const slotKey = ARMOR_SLOT_KEYS[index];

    if (inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      if (slotType === BLOCK.AIR || slotCount <= 0) return;
      inventoryCursor.type = slotType;
      inventoryCursor.count = 1;
      setArmorSlot(index, BLOCK.AIR, 0);
    } else {
      if (slotType !== BLOCK.AIR || getItemArmorSlot(inventoryCursor.type) !== slotKey) return;
      setArmorSlot(index, inventoryCursor.type, 1);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        inventoryCursor.type = BLOCK.AIR;
        inventoryCursor.count = 0;
      }
    }

    world.saveDirty = true;
    setHotbarImages();
    renderInventoryUI();
  }

  function getSlotDescriptorFromElement(target) {
    const inventorySlot = target?.closest?.("[data-inventory-index]");
    if (inventorySlot?.dataset.inventoryIndex) {
      return { kind: "inventory", index: Number(inventorySlot.dataset.inventoryIndex) };
    }
    const craftSlot = target?.closest?.("[data-craft-index]");
    if (craftSlot?.dataset.craftIndex) {
      return { kind: "craft", index: Number(craftSlot.dataset.craftIndex) };
    }
    const armorSlot = target?.closest?.("[data-armor-index]");
    if (armorSlot?.dataset.armorIndex) {
      return { kind: "armor", index: Number(armorSlot.dataset.armorIndex) };
    }
    const furnaceSlot = target?.closest?.("[data-furnace-slot]");
    if (furnaceSlot?.dataset.furnaceSlot) {
      return { kind: "furnace", slot: furnaceSlot.dataset.furnaceSlot };
    }
    return null;
  }

  function slotDescriptorKey(desc) {
    if (!desc) return "";
    return desc.kind === "furnace" ? `${desc.kind}:${desc.slot}` : `${desc.kind}:${desc.index}`;
  }

  function getSlotDescriptorElement(desc) {
    if (!ui || !desc) return null;
    if (desc.kind === "inventory") return ui.root.querySelector(`[data-inventory-index="${desc.index}"]`);
    if (desc.kind === "craft") return ui.root.querySelector(`[data-craft-index="${desc.index}"]`);
    if (desc.kind === "armor") return ui.root.querySelector(`[data-armor-index="${desc.index}"]`);
    if (desc.kind === "furnace") return ui.root.querySelector(`[data-furnace-slot="${desc.slot}"]`);
    return null;
  }

  function getSlotDescriptorValue(desc) {
    if (!desc) return { type: BLOCK.AIR, count: 0 };
    if (desc.kind === "inventory") return { type: getInventorySlotType(desc.index), count: getInventorySlotCount(desc.index) };
    if (desc.kind === "craft") return { type: getCraftSlotType(desc.index), count: getCraftSlotCount(desc.index) };
    if (desc.kind === "armor") return { type: getArmorSlotType(desc.index), count: getArmorSlotCount(desc.index) };
    if (desc.kind === "furnace") return getFurnaceSlotValue(desc.slot);
    return { type: BLOCK.AIR, count: 0 };
  }

  function setSlotDescriptorValue(desc, type, count) {
    if (!desc) return;
    if (desc.kind === "inventory") setInventorySlot(desc.index, type, count);
    else if (desc.kind === "craft") setCraftSlot(desc.index, type, count);
    else if (desc.kind === "armor") setArmorSlot(desc.index, type, count);
    else if (desc.kind === "furnace") setFurnaceSlotValue(desc.slot, type, count);
  }

  function canDescriptorAcceptItem(desc, itemType) {
    if (!desc || !itemType || itemType === BLOCK.AIR) return false;
    if (desc.kind === "inventory" || desc.kind === "craft") return true;
    if (desc.kind === "armor") return getItemArmorSlot(itemType) === ARMOR_SLOT_KEYS[desc.index];
    if (desc.kind === "furnace") {
      if (desc.slot === "output") return false;
      return desc.slot === "input" ? isSmeltableItem(itemType) : isFuelItem(itemType);
    }
    return false;
  }

  function applyDragDistribution() {
    if (!inventoryDrag.active || inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) return false;
    const descriptors = inventoryDrag.targets.filter((desc, index, arr) => arr.findIndex((candidate) => slotDescriptorKey(candidate) === slotDescriptorKey(desc)) === index);
    const eligible = descriptors.filter((desc) => canDescriptorAcceptItem(desc, inventoryCursor.type)).map((desc) => {
      const value = getSlotDescriptorValue(desc);
      const sameType = value.type === inventoryCursor.type;
      const empty = value.type === BLOCK.AIR || value.count <= 0;
      if (!empty && !sameType) return null;
      const maxStack = desc.kind === "armor" ? 1 : getItemMaxStack(inventoryCursor.type);
      const current = empty ? 0 : value.count;
      const capacity = Math.max(0, maxStack - current);
      if (capacity <= 0) return null;
      return { desc, current, capacity };
    }).filter(Boolean);

    if (eligible.length === 0) return false;

    let changed = false;
    if (inventoryDrag.button === 2) {
      for (const entry of eligible) {
        if (inventoryCursor.count <= 0) break;
        const nextCount = entry.current + 1;
        setSlotDescriptorValue(entry.desc, inventoryCursor.type, nextCount);
        inventoryCursor.count -= 1;
        changed = true;
      }
    } else {
      let remaining = Math.min(inventoryCursor.count, eligible.reduce((sum, entry) => sum + entry.capacity, 0));
      let remainingSlots = eligible.length;
      for (const entry of eligible) {
        if (remaining <= 0 || remainingSlots <= 0) break;
        const ideal = Math.max(1, Math.ceil(remaining / remainingSlots));
        const add = Math.min(entry.capacity, ideal);
        if (add > 0) {
          setSlotDescriptorValue(entry.desc, inventoryCursor.type, entry.current + add);
          inventoryCursor.count -= add;
          remaining -= add;
          changed = true;
        }
        remainingSlots -= 1;
      }
    }

    if (inventoryCursor.count <= 0) {
      inventoryCursor.type = BLOCK.AIR;
      inventoryCursor.count = 0;
    }
    return changed;
  }

  function pickupDescriptorIntoCursor(desc, split = false) {
    if (!desc || inventoryCursor.type !== BLOCK.AIR || inventoryCursor.count > 0) return false;
    if (desc.kind === "furnace" && desc.slot === "output") return false;

    const value = getSlotDescriptorValue(desc);
    if (!value.type || value.type === BLOCK.AIR || value.count <= 0) return false;

    const take = desc.kind === "armor" ? 1 : (split ? Math.ceil(value.count / 2) : value.count);
    inventoryCursor.type = value.type;
    inventoryCursor.count = take;
    setSlotDescriptorValue(desc, value.type, value.count - take);
    return true;
  }

  function resetInventoryDragState() {
    inventoryDrag = { pending: false, active: false, button: 0, origin: null, targets: [], targetKeys: new Set() };
    clearInventoryDragVisuals();
  }

  function beginInventoryDrag(desc, button) {
    inventoryDrag.pending = true;
    inventoryDrag.active = false;
    inventoryDrag.button = button;
    inventoryDrag.origin = desc;
    inventoryDrag.targets = [];
    inventoryDrag.targetKeys = new Set();
    clearInventoryDragVisuals();
  }

  function includeDragTarget(desc) {
    const key = slotDescriptorKey(desc);
    if (!key || inventoryDrag.targetKeys.has(key)) return;
    inventoryDrag.targetKeys.add(key);
    inventoryDrag.targets.push(desc);
    const el = getSlotDescriptorElement(desc);
    if (el) el.classList.add("drag-target");
  }

  function isCreativeMode() {
    return settings.gameMode === GAME_MODE.CREATIVE;
  }

  function getHotbarSlotItemType(index) {
    if (!player) return BLOCK.AIR;
    if (isCreativeMode()) {
      return HOTBAR_BLOCKS[index] || BLOCK.AIR;
    }
    const count = player.hotbarCounts[index] || 0;
    if (count <= 0) return BLOCK.AIR;
    return player.hotbarTypes[index] || BLOCK.AIR;
  }

  function getSelectedHeldItemType() {
    if (!player) return BLOCK.AIR;
    return getHotbarSlotItemType(player.selectedHotbarSlot);
  }

  function getSelectedHeldBlockType() {
    if (!player) return BLOCK.AIR;
    return getPlacedBlockType(getSelectedHeldItemType());
  }

  function getSelectedHeldCount() {
    if (!player) return 0;
    return isCreativeMode() ? 999 : (player.hotbarCounts[player.selectedHotbarSlot] || 0);
  }

  function addToInventory(itemType, count, refreshUi = true) {
    if (!itemType || itemType === BLOCK.AIR) return count;
    if (itemType === BLOCK.WATER || itemType === BLOCK.BEDROCK) return count;
    let left = Math.max(0, Math.floor(count));
    if (left === 0) return 0;

    const maxStack = getItemMaxStack(itemType);
    let changed = false;

    // First, stack onto existing slots.
    for (let i = 0; i < INVENTORY_SLOTS && left > 0; i += 1) {
      if (player.inventoryTypes[i] !== itemType) continue;
      const c = player.inventoryCounts[i] || 0;
      if (c >= maxStack) continue;
      const add = Math.min(left, maxStack - c);
      player.inventoryCounts[i] = c + add;
      left -= add;
      changed = true;
    }

    // Then, fill empty slots.
    for (let i = 0; i < INVENTORY_SLOTS && left > 0; i += 1) {
      const c = player.inventoryCounts[i] || 0;
      if (c > 0) continue;
      const add = Math.min(left, maxStack);
      player.inventoryTypes[i] = itemType;
      player.inventoryCounts[i] = add;
      left -= add;
      changed = true;
    }

    if (changed) {
      if (refreshUi) {
        setHotbarImages();
      }
      if (world) {
        world.saveDirty = true;
      }
    }
    return left;
  }

  function consumeFromSelectedSlot(amount = 1) {
    if (isCreativeMode()) return true;
    const idx = player.selectedHotbarSlot;
    const have = player.hotbarCounts[idx] || 0;
    if (have < amount) return false;
    const next = have - amount;
    player.hotbarCounts[idx] = next;
    if (next <= 0) {
      player.hotbarTypes[idx] = BLOCK.AIR;
      player.hotbarCounts[idx] = 0;
    }
    setHotbarImages();
    world.saveDirty = true;
    return true;
  }

  function spawnItemEntity(itemType, count, x, y, z, vx = 0, vy = 3.8, vz = 0, pickupDelay = 0.55) {
    items.push({
      kind: "item",
      itemType,
      count: clamp(Math.floor(count) || 1, 1, getItemMaxStack(itemType)),
      x,
      y,
      z,
      vx,
      vy,
      vz,
      age: 0,
      pickupDelay
    });
  }

  function dropSelectedItem() {
    if (isCreativeMode()) return;
    const type = getSelectedHeldItemType();
    const count = getSelectedHeldCount();
    if (!type || count <= 0) return;
    if (!consumeFromSelectedSlot(1)) return;
    const eye = player.getEyePosition();
    const dir = player.getLookVector();
    const x = eye.x + dir.x * 0.8;
    const y = eye.y + dir.y * 0.2;
    const z = eye.z + dir.z * 0.8;
    spawnItemEntity(type, 1, x, y, z, dir.x * 2.4, 2.6, dir.z * 2.4, 0.55);
  }

  function getMobTargetAABB(mob) {
    return {
      minX: mob.x - mob.radius,
      maxX: mob.x + mob.radius,
      minY: mob.y,
      maxY: mob.y + mob.height,
      minZ: mob.z - mob.radius,
      maxZ: mob.z + mob.radius
    };
  }

  function getHeldAttackDamage(itemType = getSelectedHeldItemType()) {
    if (isCreativeMode()) return 999;
    switch (itemType) {
      case ITEM.WOODEN_SWORD:
        return 4;
      case ITEM.WOODEN_AXE:
        return 3;
      case ITEM.WOODEN_PICKAXE:
        return 2;
      case ITEM.WOODEN_SHOVEL:
        return 1.5;
      default:
        return 1;
    }
  }

  function addXp(amount) {
    if (!player) return;
    let xp = Math.max(0, Number(amount) || 0);
    if (xp <= 0) return;
    player.xp += xp;
    while (player.xp >= 1) {
      player.xp -= 1;
      player.xpLevel += 1;
    }
    if (world) {
      world.saveDirty = true;
    }
    hud.last = null;
  }

  function findTargetMob(blockTarget = null) {
    if (!player || !mobs || mobs.length === 0) return null;
    const origin = player.getEyePosition();
    const direction = player.getLookVector();
    const maxDistance = clamp(blockTarget ? blockTarget.distance - 0.05 : MAX_REACH, 0, MAX_REACH);
    if (maxDistance <= 0.01) return null;

    let best = null;
    let bestDistance = maxDistance;
    for (const mob of mobs) {
      if (!mob || mob.health <= 0) continue;
      const hit = rayIntersectAABB(origin, direction, bestDistance, getMobTargetAABB(mob));
      if (hit === null) continue;
      bestDistance = hit;
      best = { mob, distance: hit };
    }
    return best;
  }

  function removeMob(mob) {
    const index = mobs.indexOf(mob);
    if (index >= 0) {
      mobs.splice(index, 1);
    }
  }

  function attackTargetMob() {
    if (!currentEntityTarget?.mob || !player) return false;
    const mob = currentEntityTarget.mob;
    const killed = mob.takeDamage(getHeldAttackDamage(), player.x, player.z);
    player.breakCooldown = Math.max(player.breakCooldown, isCreativeMode() ? 0.08 : 0.24);
    if (killed) {
      dropMobLoot(mob);
      addXp(getMobDef(mob.type).hostile ? 0.35 : 0.18);
      removeMob(mob);
    }
    if (world) {
      world.saveDirty = true;
    }
    return true;
  }

  function updateItems(dt) {
    if (!items || items.length === 0) return;
    const gravity = 18;
    const radius = 0.18;
    const height = 0.34;
    const bounce = 0.18;

    const resolveAxis = (item, axis, delta) => {
      let aabb = entityAABB(item.x, item.y, item.z, radius, height);
      const minX = Math.floor(aabb.minX);
      const maxX = Math.floor(aabb.maxX - 0.00001);
      const minY = Math.floor(aabb.minY);
      const maxY = Math.floor(aabb.maxY - 0.00001);
      const minZ = Math.floor(aabb.minZ);
      const maxZ = Math.floor(aabb.maxZ - 0.00001);

      for (let bx = minX; bx <= maxX; bx += 1) {
        for (let by = minY; by <= maxY; by += 1) {
          for (let bz = minZ; bz <= maxZ; bz += 1) {
            if (!isCollidable(world.getBlock(bx, by, bz))) continue;
            if (!entityIntersectsBlock(item.x, item.y, item.z, radius, height, bx, by, bz)) continue;

            if (axis === "x") {
              if (delta > 0) item.x = bx - radius - 0.0001;
              else item.x = bx + 1 + radius + 0.0001;
              item.vx = 0;
            } else if (axis === "z") {
              if (delta > 0) item.z = bz - radius - 0.0001;
              else item.z = bz + 1 + radius + 0.0001;
              item.vz = 0;
            } else if (axis === "y") {
              if (delta > 0) {
                item.y = by - height - 0.0001;
                item.vy = Math.min(0, item.vy);
              } else {
                item.y = by + 1 + 0.0001;
                if (Math.abs(item.vy) > 1.4) item.vy = -item.vy * bounce;
                else item.vy = 0;
              }
            }

            aabb = entityAABB(item.x, item.y, item.z, radius, height);
          }
        }
      }
    };

    const next = [];
    for (const item of items) {
      item.age += dt;

      // Pickup.
      const dx = item.x - player.x;
      const dy = (item.y + 0.15) - (player.y + 0.9);
      const dz = item.z - player.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1.25 && item.age > (item.pickupDelay ?? 0.55)) {
        const left = addToInventory(item.itemType ?? item.blockType, item.count);
        if (left <= 0) {
          continue;
        }
        item.count = left;
      }

      item.vy -= gravity * dt;
      item.vy = Math.max(item.vy, -18);

      item.x += item.vx * dt;
      resolveAxis(item, "x", item.vx * dt);
      item.z += item.vz * dt;
      resolveAxis(item, "z", item.vz * dt);
      item.y += item.vy * dt;
      resolveAxis(item, "y", item.vy * dt);

      if (item.y < 0.1) {
        item.y = 0.1;
        item.vy = 0;
      }

      const grounded = isCollidable(world.getBlock(Math.floor(item.x), Math.floor(item.y - 0.1), Math.floor(item.z)));
      if (grounded) {
        item.vx *= Math.pow(0.32, dt * 6);
        item.vz *= Math.pow(0.32, dt * 6);
      } else {
        item.vx *= Math.pow(0.92, dt * 60);
        item.vz *= Math.pow(0.92, dt * 60);
      }

      // Despawn after a while.
      if (item.age < 240) {
        next.push(item);
      }
    }
    items = next;
  }

  function dropMobLoot(mob) {
    if (!mob || !player) return;

    let itemType = BLOCK.AIR;
    let count = 0;
    switch (mob.type) {
      case "sheep":
        itemType = ITEM.RAW_MUTTON;
        count = 1;
        break;
      case "chicken":
        itemType = ITEM.RAW_CHICKEN;
        count = 1;
        break;
      case "zombie":
        itemType = ITEM.ROTTEN_FLESH;
        count = 1;
        break;
      default:
        return;
    }

    const seed = (world?.seed || 0) + Math.floor(mob.x * 17) + Math.floor(mob.z * 29);
    const vx = (random3(Math.floor(mob.x * 3), Math.floor(mob.y * 5), Math.floor(mob.z * 7), seed + 11) - 0.5) * 2.4;
    const vz = (random3(Math.floor(mob.z * 3), Math.floor(mob.y * 5), Math.floor(mob.x * 7), seed + 19) - 0.5) * 2.4;
    spawnItemEntity(itemType, count, mob.x, mob.y + Math.min(0.9, mob.height * 0.45), mob.z, vx, 3.2, vz, 0.45);
  }

  function dropFurnaceContentsAt(x, y, z) {
    const key = packBlockPositionKey(x, y, z);
    const state = getFurnaceStateByKey(key, false);
    if (!state) return;

    const stacks = [
      { type: state.inputType || BLOCK.AIR, count: state.inputCount || 0, ox: -0.13, oz: -0.04 },
      { type: state.fuelType || BLOCK.AIR, count: state.fuelCount || 0, ox: 0.12, oz: -0.02 },
      { type: state.outputType || BLOCK.AIR, count: state.outputCount || 0, ox: 0.02, oz: 0.11 }
    ];

    for (const stack of stacks) {
      if (!stack.type || stack.type === BLOCK.AIR || stack.count <= 0) continue;
      spawnItemEntity(
        stack.type,
        stack.count,
        x + 0.5 + stack.ox,
        y + 0.62,
        z + 0.5 + stack.oz,
        stack.ox * 5.2,
        2.9,
        stack.oz * 5.2,
        0.35
      );
    }

    furnaceStates.delete(key);
    if (activeFurnaceKey === key) {
      activeFurnaceKey = null;
      if (inventoryContext === "furnace") {
        inventoryContext = "inventory";
      }
    }
    if (world) {
      world.saveDirty = true;
    }
  }

  function canFurnaceSmelt(state) {
    if (!state) return false;
    const inputType = (state.inputCount || 0) > 0 ? (state.inputType || BLOCK.AIR) : BLOCK.AIR;
    if (!inputType || inputType === BLOCK.AIR) return false;

    const resultType = getSmeltingResult(inputType);
    if (!resultType || resultType === BLOCK.AIR) return false;

    const outputType = (state.outputCount || 0) > 0 ? (state.outputType || BLOCK.AIR) : BLOCK.AIR;
    const outputCount = state.outputCount || 0;
    if (outputType !== BLOCK.AIR && outputType !== resultType) return false;

    return outputCount < getItemMaxStack(resultType);
  }

  function updateFurnaces(dt) {
    if (!furnaceStates || furnaceStates.size === 0) {
      if (inventoryOpen && inventoryContext === "furnace") {
        renderInventoryUI();
      }
      return;
    }

    let changed = false;
    const staleKeys = [];

    for (const [key, state] of furnaceStates.entries()) {
      if (!state) {
        staleKeys.push(key);
        continue;
      }

      const [x, y, z] = key.split("|").map(Number);
      if (world.getBlock(x, y, z) !== BLOCK.FURNACE) {
        staleKeys.push(key);
        continue;
      }

      trimFurnaceSlot("inputType", "inputCount", state);
      trimFurnaceSlot("fuelType", "fuelCount", state);
      trimFurnaceSlot("outputType", "outputCount", state);

      const wasBurning = (state.burnTime || 0) > 0;
      if (wasBurning) {
        state.burnTime = Math.max(0, (state.burnTime || 0) - dt);
        changed = true;
      }

      if ((state.burnTime || 0) <= 0 && canFurnaceSmelt(state) && (state.fuelCount || 0) > 0 && isFuelItem(state.fuelType || BLOCK.AIR)) {
        state.burnTimeTotal = getFurnaceFuelTime(state.fuelType || BLOCK.AIR);
        state.burnTime = state.burnTimeTotal;
        state.fuelCount = Math.max(0, (state.fuelCount || 0) - 1);
        if ((state.fuelCount || 0) <= 0) {
          state.fuelType = BLOCK.AIR;
          state.fuelCount = 0;
        }
        changed = true;
      }

      if ((state.burnTime || 0) > 0 && canFurnaceSmelt(state)) {
        state.cookTime = Math.max(0, (state.cookTime || 0) + dt);
        changed = true;

        while ((state.cookTime || 0) >= FURNACE_SMELT_TIME && canFurnaceSmelt(state)) {
          state.cookTime -= FURNACE_SMELT_TIME;
          const resultType = getSmeltingResult(state.inputType || BLOCK.AIR);
          if (!resultType || resultType === BLOCK.AIR) {
            state.cookTime = 0;
            break;
          }

          state.inputCount = Math.max(0, (state.inputCount || 0) - 1);
          if ((state.inputCount || 0) <= 0) {
            state.inputType = BLOCK.AIR;
            state.inputCount = 0;
          }

          if ((state.outputCount || 0) <= 0 || (state.outputType || BLOCK.AIR) === BLOCK.AIR) {
            state.outputType = resultType;
            state.outputCount = 1;
          } else {
            state.outputCount += 1;
          }
          changed = true;
        }
      } else if ((state.cookTime || 0) > 0) {
        state.cookTime = Math.max(0, (state.cookTime || 0) - dt * 2.5);
        if ((state.cookTime || 0) < 0.0001) {
          state.cookTime = 0;
        }
        changed = true;
      }

      trimFurnaceSlot("inputType", "inputCount", state);
      trimFurnaceSlot("fuelType", "fuelCount", state);
      trimFurnaceSlot("outputType", "outputCount", state);

      if (isFurnaceEmpty(state)) {
        staleKeys.push(key);
      }
    }

    for (const key of staleKeys) {
      furnaceStates.delete(key);
      changed = true;
    }

    if (inventoryOpen && inventoryContext === "furnace") {
      renderInventoryUI();
    }

    if (changed && world) {
      world.saveDirty = true;
    }
  }

  function pushChatLine(text, cls = "") {
    chatLines.push({ text, cls, ttl: 10 });
    if (chatLines.length > 12) chatLines = chatLines.slice(chatLines.length - 12);
    chatNeedsRender = true;
  }

  function renderChatLines() {
    if (!ui) return;
    if (!chatNeedsRender) return;
    chatNeedsRender = false;

    ui.chatLogEl.innerHTML = "";
    for (const line of chatLines) {
      const el = document.createElement("div");
      el.className = "fc-chat-line" + (line.cls ? ` ${line.cls}` : "");
      el.textContent = line.text;
      ui.chatLogEl.appendChild(el);
    }
  }

  function updateChat(dt) {
    if (chatOpen) {
      renderChatLines();
      return;
    }
    let changed = false;
    for (const line of chatLines) {
      line.ttl -= dt;
    }
    const before = chatLines.length;
    chatLines = chatLines.filter((line) => line.ttl > 0);
    if (before !== chatLines.length) changed = true;
    if (changed) chatNeedsRender = true;
    renderChatLines();
  }

  function openChat(prefill = "") {
    ensureUI();
    chatOpen = true;
    input.pointerLockEnabled = false;
    if (document.exitPointerLock) document.exitPointerLock();
    ui.chatInputWrap.style.display = "block";
    ui.chatInput.value = prefill;
    ui.chatInput.focus();
    ui.chatInput.setSelectionRange(ui.chatInput.value.length, ui.chatInput.value.length);
    renderChatLines();
  }

  function closeChat(lockMouse = true) {
    if (!ui) return;
    chatOpen = false;
    ui.chatInputWrap.style.display = "none";
    ui.chatInput.value = "";
    if (lockMouse && mode === "playing") {
      input.pointerLockEnabled = true;
      input.requestPointerLock();
    }
  }

  function getMobCapRadius() {
    const renderDistance = settings?.renderDistanceChunks || DEFAULT_RENDER_DISTANCE;
    return Math.max(42, (renderDistance + 0.6) * CHUNK_SIZE);
  }

  function countVillagersNearVillage(center, radius = 18) {
    if (!center) return 0;
    const radius2 = radius * radius;
    let count = 0;
    for (const mob of mobs) {
      if (!mob || mob.type !== "villager" || mob.health <= 0) continue;
      const dx = mob.x - center.x;
      const dz = mob.z - center.z;
      if (dx * dx + dz * dz <= radius2) {
        count += 1;
      }
    }
    return count;
  }

  function pruneMobPopulation(limit = MAX_ACTIVE_MOBS, radius = getMobCapRadius()) {
    if (!mobs || mobs.length <= limit) return;

    const radius2 = radius * radius;
    const cycle = getDayCycleInfo(worldTime);
    const inRange = [];
    for (const mob of mobs) {
      const dx = mob.x - player.x;
      const dz = mob.z - player.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 <= radius2) {
        inRange.push({ mob, dist2 });
      }
    }
    if (inRange.length <= limit) return;

    const remove = [];
    const hostilesInDay = inRange
      .filter((entry) => getMobDef(entry.mob.type).hostile && !cycle.isNight)
      .sort((a, b) => b.dist2 - a.dist2);
    const loosePassives = inRange
      .filter((entry) => entry.mob.type !== "villager" && !getMobDef(entry.mob.type).hostile)
      .sort((a, b) => b.dist2 - a.dist2);
    const hostilesAnyTime = inRange
      .filter((entry) => getMobDef(entry.mob.type).hostile && (cycle.isNight || !hostilesInDay.includes(entry)))
      .sort((a, b) => b.dist2 - a.dist2);
    const villagers = inRange
      .filter((entry) => entry.mob.type === "villager")
      .sort((a, b) => b.dist2 - a.dist2);

    for (const group of [hostilesInDay, loosePassives, hostilesAnyTime, villagers]) {
      for (const entry of group) {
        if (inRange.length - remove.length <= limit) break;
        if (!remove.includes(entry.mob)) {
          remove.push(entry.mob);
        }
      }
    }

    if (remove.length > 0) {
      mobs = mobs.filter((mob) => !remove.includes(mob));
    }
  }

  function isMobInSunlight(mob) {
    if (!mob || !world) return false;
    const checkX = Math.floor(mob.x);
    const checkY = Math.floor(mob.y + Math.max(1, mob.height - 0.1));
    const checkZ = Math.floor(mob.z);
    const bodyBlock = world.getBlock(checkX, Math.floor(mob.y + 0.1), checkZ);
    if (bodyBlock === BLOCK.WATER) return false;

    for (let y = checkY; y < WORLD_HEIGHT; y += 1) {
      const block = world.getBlock(checkX, y, checkZ);
      if (block !== BLOCK.AIR && block !== BLOCK.WATER) {
        return false;
      }
    }
    return true;
  }

  function spawnMobNearPlayer(type = "zombie") {
    if (!world || !player) return false;
    const mob = new Mob(type);

    if (type === "villager") {
      const center = getNearestVillageCenter(player.x, player.z, world.seed, Math.max(96, getMobCapRadius() * 1.35));
      if (!center) return false;

      for (let tries = 0; tries < 16; tries += 1) {
        const angle = random2(tries + 41, tries * 7, center.seed + 1901) * Math.PI * 2;
        const dist = 2.5 + random2(tries + 17, tries * 11, center.seed + 1902) * 7.5;
        const x = center.x + Math.sin(angle) * dist;
        const z = center.z + Math.cos(angle) * dist;
        const y = findWalkableY(world, x, z, world.terrain.describeColumn(Math.floor(x), Math.floor(z)).height + 1, 2);
        if (!Number.isFinite(y)) continue;
        if (world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === BLOCK.WATER) continue;
        if (entityWouldCollide(world, x, y, z, mob.radius, mob.height)) continue;
        mob.setPosition(x, y, z);
        mob.homeX = center.x;
        mob.homeZ = center.z;
        mobs.push(mob);
        return true;
      }
      return false;
    }

    const base = world.findSpawn(Math.floor(player.x), Math.floor(player.z));
    for (let tries = 0; tries < 18; tries += 1) {
      const angle = random2(tries, tries * 9, world.seed + 1211) * Math.PI * 2;
      const dist = 6 + random2(tries, tries * 13, world.seed + 1212) * 10;
      const x = base.x + Math.sin(angle) * dist;
      const z = base.z + Math.cos(angle) * dist;
      const spawn = world.findSpawn(Math.floor(x), Math.floor(z));
      const y = findWalkableY(world, x, z, spawn.y + 1, mob.height > 1.2 ? 2 : 1);
      if (!Number.isFinite(y)) continue;
      if (world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === BLOCK.WATER) continue;
      if (!entityWouldCollide(world, x, y, z, mob.radius, mob.height)) {
        mob.setPosition(x, y, z);
        mobs.push(mob);
        return true;
      }
    }
    mob.setPosition(base.x + 6, base.y, base.z);
    mobs.push(mob);
    return true;
  }

  function updateSpawning(dt) {
    if (!world || !player) return;
    worldTime = (worldTime + dt * 10) % 600;

    const cycle = getDayCycleInfo(worldTime);
    const capRadius = getMobCapRadius();
    const capRadius2 = capRadius * capRadius;
    pruneMobPopulation(MAX_ACTIVE_MOBS, capRadius);

    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    let hostiles = 0;
    let passives = 0;
    let villagers = 0;
    let nearbyTotal = 0;
    for (const mob of mobs) {
      if (!mob || mob.health <= 0) continue;
      const dx = mob.x - player.x;
      const dz = mob.z - player.z;
      if (dx * dx + dz * dz > capRadius2) continue;
      nearbyTotal += 1;
      if (mob.type === "villager") villagers += 1;
      else if (getMobDef(mob.type).hostile) hostiles += 1;
      else passives += 1;
    }

    if (nearbyTotal >= MAX_ACTIVE_MOBS) {
      spawnTimer = cycle.isNight ? 1.4 : 2.2;
      return;
    }

    if (cycle.isNight) {
      spawnTimer = 2.1;
      if (hostiles < 7) {
        const hostileType =
          HOSTILE_MOB_TYPES[Math.floor(random3(Math.floor(player.x), Math.floor(worldTime * 10), Math.floor(player.z), world.seed + 809) * HOSTILE_MOB_TYPES.length)] ||
          "zombie";
        spawnMobNearPlayer(hostileType);
        if (hostiles < 4 && nearbyTotal < MAX_ACTIVE_MOBS - 1 && random2(Math.floor(player.x), Math.floor(player.z), world.seed + 811) > 0.62) {
          spawnMobNearPlayer(hostileType);
        }
      }
      return;
    }

    spawnTimer = 3.6;
    if (passives < 6) {
      const passiveType =
        PASSIVE_MOB_TYPES[Math.floor(random3(Math.floor(player.x), Math.floor(worldTime * 7), Math.floor(player.z), world.seed + 913) * PASSIVE_MOB_TYPES.length)] ||
        "sheep";
      spawnMobNearPlayer(passiveType);
    }

    const nearestVillage = getNearestVillageCenter(player.x, player.z, world.seed, Math.max(84, capRadius * 1.25));
    if (nearestVillage && villagers < 4 && countVillagersNearVillage(nearestVillage, 18) < 4) {
      const spawnRoll = random3(Math.floor(player.x * 0.5), Math.floor(worldTime * 5), Math.floor(player.z * 0.5), nearestVillage.seed + 2047);
      if (spawnRoll > 0.42) {
        spawnMobNearPlayer("villager");
      }
    }
  }

  function logMobRenderDiagnostics(reason = "runtime") {
    if (!player) return;
    const texturesKnown = !!(entityTextures?.ready || entityTextures?.failed);
    const modelsKnown = !!(objModels?.ready || objModels?.failed);
    const summary = {};
    for (const mob of mobs) {
      summary[mob.type] = (summary[mob.type] || 0) + 1;
    }
    console.log(`[MobRender:${reason}]`, {
      renderer: useWebGL ? "WebGL2" : "Canvas",
      modelsEnabled: settings.mobModels !== false,
      texturesKnown,
      modelsKnown,
      activeMobs: summary,
      itemEntities: items.length
    });
    for (const type of ENTITY_TEXTURE_NAMES) {
      const hasTexture = !!entityTextures?.getImage(type);
      const hasBillboard = !!entityTextures?.getBillboardImage(type);
      const hasModel = !!objModels?.hasModel(type);
      if (texturesKnown && !hasTexture) {
        const key = `missing-texture:${type}`;
        if (!mobRenderWarnings.has(key)) {
          mobRenderWarnings.add(key);
          console.warn(`[MobRender] Missing texture for ${type}; renderer will fall back or skip 3D for that mob.`);
        }
      }
      if ((type === "zombie" || hasModel) && settings.mobModels !== false && (texturesKnown || hasBillboard || hasTexture || modelsKnown)) {
        const renderMode = type === "zombie"
          ? (hasTexture ? "3d-zombie" : hasBillboard ? "billboard-fallback" : texturesKnown ? "missing" : "loading-assets")
          : hasModel && hasTexture ? "obj-model" : hasBillboard ? "billboard-fallback" : (texturesKnown || modelsKnown) ? "missing" : "loading-assets";
        const key = `mode:${type}:${renderMode}:${useWebGL ? "webgl" : "canvas"}`;
        if (!mobRenderWarnings.has(key)) {
          mobRenderWarnings.add(key);
          console.log(`[MobRender] ${type}: ${renderMode}`);
        }
      }
    }
  }

  function runCommand(line) {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    const cmd = (parts.shift() || "").toLowerCase();
    const args = parts;

    if (!cmd || cmd === "help") {
      pushChatLine("Commands: /help, /give <item> [count], /gm <survival|creative>, /tp x y z, /rd <2-6>, /summon <mob> [count], /boss <name> <0-1>, /boss off, /sysinfo, /clear", "sys");
      return;
    }

    if (cmd === "clear") {
      chatLines = [];
      chatNeedsRender = true;
      return;
    }

    if (cmd === "gm" || cmd === "gamemode") {
      const modeArg = (args[0] || "").toLowerCase();
      settings.gameMode = modeArg.startsWith("c") ? GAME_MODE.CREATIVE : GAME_MODE.SURVIVAL;
      setSettingsUI();
      setHotbarImages();
      world.saveDirty = true;
      pushChatLine(`Game mode: ${settings.gameMode}`, "sys");
      return;
    }

    if (cmd === "rd" || cmd === "renderdistance") {
      const rd = clamp(Number(args[0]) || settings.renderDistanceChunks, 2, 6);
      settings.renderDistanceChunks = rd;
      setSettingsUI();
      if (glRenderer) glRenderer.setRenderDistance(rd);
      if (canvasRenderer) canvasRenderer.setRenderDistance(rd);
      world.saveDirty = true;
      pushChatLine(`Render distance set to ${rd}`, "sys");
      return;
    }

    if (cmd === "give") {
      const itemType = resolveItemTypeByName(args[0]);
      const count = clamp(Number(args[1]) || 1, 1, 64);
      if (!itemType || itemType === BLOCK.AIR) {
        pushChatLine("Usage: /give <item> [count]", "err");
        return;
      }
      const left = addToInventory(itemType, count);
      const received = count - left;
      if (received > 0) {
        pushChatLine(`Given ${received} ${getItemName(itemType)}.`, "sys");
      } else {
        pushChatLine("Inventory full.", "err");
      }
      return;
    }

    if (cmd === "tp" || cmd === "teleport") {
      const x = Number(args[0]);
      const y = Number(args[1]);
      const z = Number(args[2]);
      if (![x, y, z].every(Number.isFinite)) {
        pushChatLine("Usage: /tp x y z", "err");
        return;
      }
      player.setPosition(x, clamp(y, 1, WORLD_HEIGHT - 2), z);
      player.ensureSafePosition(world);
      world.saveDirty = true;
      pushChatLine(`Teleported to ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`, "sys");
      return;
    }

    if (cmd === "heal") {
      player.health = player.maxHealth;
      player.hunger = player.maxHunger;
      world.saveDirty = true;
      pushChatLine("Healed.", "sys");
      return;
    }

    if (cmd === "damage") {
      const amt = clamp(Number(args[0]) || 1, 0, 20);
      player.health = Math.max(0, player.health - amt);
      player.hurtCooldown = 0.35;
      world.saveDirty = true;
      pushChatLine(`Damaged for ${amt}.`, "sys");
      return;
    }

    if (cmd === "sysinfo") {
      const info = {
        version: GAME_VERSION,
        renderer: useWebGL ? "WebGL2" : "Canvas",
        seed: world?.seed,
        time: worldTime.toFixed(1),
        mobs: mobs.length,
        items: items.length,
        chunks: world?.chunks?.size,
        furnaces: furnaceStates.size
      };
      console.log("SYSINFO", info);
      logMobRenderDiagnostics("sysinfo");
      pushChatLine(`SYSINFO: ${info.renderer}, mobs=${info.mobs}, items=${info.items}, chunks=${info.chunks}, furnaces=${info.furnaces}`, "sys");
      return;
    }

    if (cmd === "summon") {
      const type = (args[0] || "zombie").toLowerCase();
      const count = clamp(Number(args[1]) || 1, 1, 16);
      for (let i = 0; i < count; i += 1) spawnMobNearPlayer(type);
      pushChatLine(`Summoned ${count} ${type}(s).`, "sys");
      return;
    }

    if (cmd === "boss") {
      const sub = (args[0] || "").toLowerCase();
      if (sub === "off" || sub === "hide") {
        setBossBar(false);
        pushChatLine("Boss bar hidden.", "sys");
        return;
      }
      const name = args.slice(0, -1).join(" ").trim() || "Boss";
      const hp = Number(args[args.length - 1]);
      const health01 = Number.isFinite(hp) ? hp : 1;
      setBossBar(true, name, health01);
      pushChatLine(`Boss bar: "${name}" ${(clamp(health01, 0, 1) * 100).toFixed(0)}%`, "sys");
      return;
    }

    pushChatLine(`Unknown command: /${cmd} (try /help)`, "err");
  }

  function submitChat(text) {
    const msg = String(text || "").trim();
    if (!msg) return;
    if (msg.startsWith("/")) {
      runCommand(msg.slice(1));
    } else {
      pushChatLine(`You: ${msg}`);
    }
  }

  function setBossBar(active, name = "Boss", health01 = 1) {
    ensureUI();
    boss.active = !!active;
    boss.name = String(name || "Boss").slice(0, 64);
    boss.health = clamp(Number(health01) || 0, 0, 1);
    ui.bossEl.style.display = boss.active ? "block" : "none";
    ui.bossNameEl.textContent = boss.name;
    ui.bossFill.style.width = `${Math.floor(boss.health * 100)}%`;
  }

  function applyDamage(amount, reason = "") {
    if (!player) return;
    if (settings.gameMode === GAME_MODE.CREATIVE) return;
    if (player.hurtCooldown > 0) return;
    const base = Math.max(0, Number(amount) || 0);
    const armorPoints = player.getArmorPoints();
    const reduction = clamp(armorPoints * 0.04, 0, 0.8);
    const dmg = Math.max(0, Math.ceil(base * (1 - reduction)));
    if (dmg <= 0) return;
    player.health = Math.max(0, player.health - dmg);
    player.hurtCooldown = 0.45;
    world.saveDirty = true;
    if (reason) {
      pushChatLine(`Ouch (${reason})`, "sys");
    }
  }

  function respawnPlayer() {
    const spawn = world.findSpawn(0, 0);
    player.setPosition(spawn.x, spawn.y, spawn.z);
    player.health = player.maxHealth;
    player.hunger = player.maxHunger;
    player.hurtCooldown = 0;
    player.regenTimer = 0;
    player.starveTimer = 0;
    player.fallDistance = 0;
    player.pendingFallDamage = 0;
    mining.key = null;
    mining.progress = 0;
    setMiningProgress(0);
    world.saveDirty = true;
    pushChatLine("Respawned.", "sys");
  }

  function updatePlayerVitals(dt) {
    if (!player) return;
    player.hurtCooldown = Math.max(0, player.hurtCooldown - dt);

    // Only simulate vitals while the game is actively running.
    if (mode !== "playing") {
      return;
    }

    if (settings.gameMode === GAME_MODE.CREATIVE) {
      player.health = player.maxHealth;
      player.hunger = player.maxHunger;
      player.regenTimer = 0;
      player.starveTimer = 0;
      return;
    }

    // Hunger drains slowly when sprinting.
    const sprinting = !!player.isSprinting;
    if (sprinting) {
      player.hunger = Math.max(0, player.hunger - dt * 0.55);
    }

    // Passive regen if fed.
    if (player.hunger >= 18 && player.health < player.maxHealth) {
      player.regenTimer += dt;
      if (player.regenTimer >= 4.2) {
        player.regenTimer = 0;
        player.health = Math.min(player.maxHealth, player.health + 1);
        player.hunger = Math.max(0, player.hunger - 1);
        world.saveDirty = true;
      }
    } else {
      player.regenTimer = 0;
    }

    // Starvation.
    if (player.hunger <= 0) {
      player.starveTimer += dt;
      if (player.starveTimer >= 3.4) {
        player.starveTimer = 0;
        applyDamage(1, "starving");
      }
    } else {
      player.starveTimer = 0;
    }

    if (player.health <= 0) {
      respawnPlayer();
    }
  }

  function renderHearts(el, value, max) {
    const hearts = 10;
    const fullHearts = clamp(Math.floor(value / 2), 0, hearts);
    const hasHalf = value % 2 === 1 && fullHearts < hearts;
    el.innerHTML = "";
    for (let i = 0; i < hearts; i += 1) {
      const d = document.createElement("div");
      d.className = "fc-heart";
      if (i < fullHearts) d.classList.add("full");
      else if (i === fullHearts && hasHalf) d.classList.add("half");
      else d.classList.add("empty");
      el.appendChild(d);
    }
  }

  function renderArmor(el, value) {
    const icons = 10;
    const full = clamp(Math.floor(value / 2), 0, icons);
    const hasHalf = value % 2 === 1 && full < icons;
    el.innerHTML = "";
    for (let i = 0; i < icons; i += 1) {
      const d = document.createElement("div");
      d.className = "fc-armor-icon";
      if (i < full) d.classList.add("full");
      else if (i === full && hasHalf) d.classList.add("half");
      else d.classList.add("empty");
      el.appendChild(d);
    }
  }

  function renderHunger(el, value, max) {
    const foods = 10;
    const full = clamp(Math.floor(value / 2), 0, foods);
    const hasHalf = value % 2 === 1 && full < foods;
    el.innerHTML = "";
    for (let i = 0; i < foods; i += 1) {
      const d = document.createElement("div");
      d.className = "fc-food";
      if (i < full) d.classList.add("full");
      else if (i === full && hasHalf) d.classList.add("half");
      else d.classList.add("empty");
      el.appendChild(d);
    }
  }

  function updateHud(dt) {
    ensureUI();
    if (!hud.visible) {
      ui.setHudVisible(false);
      ui.bossEl.style.display = "none";
      ui.timeChipEl.style.display = "none";
      ui.timeTintEl.style.opacity = "0";
      return;
    }

    ui.setHudVisible(mode === "playing" && !inventoryOpen);
    const cycle = getDayCycleInfo(worldTime);
    ui.timeChipEl.style.display = mode === "playing" ? "block" : "none";
    ui.timeChipEl.textContent = `${cycle.phase}${cycle.isNight ? " - Hostiles Active" : ""}`;
    ui.timeChipEl.style.background = cycle.isNight ? "rgba(14,22,42,0.72)" : cycle.phase === "Sunset" ? "rgba(66,38,18,0.68)" : "rgba(0,0,0,0.32)";
    ui.timeTintEl.style.background = cycle.isNight ? "rgba(18,32,74,1)" : cycle.phase === "Sunset" ? "rgba(94,54,24,1)" : "rgba(18,32,74,1)";
    ui.timeTintEl.style.opacity = mode === "playing" ? String(cycle.darkness * 0.34) : "0";

    hud.timer += dt;
    if (hud.timer < 0.1) {
      // Still update boss bar smoothly even if throttled.
      if (boss.active) {
        ui.bossEl.style.display = "block";
        ui.bossNameEl.textContent = boss.name;
        ui.bossFill.style.width = `${Math.floor(boss.health * 100)}%`;
      } else {
        ui.bossEl.style.display = "none";
      }
      return;
    }
    hud.timer = 0;

    if (!player) return;
    const snap = `${player.getArmorPoints()}|${player.health}|${player.hunger}|${player.xpLevel}|${player.xp}|${settings.gameMode}|${mode}|${boss.active}|${boss.health}|${boss.name}`;
    if (hud.last === snap) return;
    hud.last = snap;

    if (mode === "playing") {
      renderArmor(ui.armorEl, player.getArmorPoints());
      renderHearts(ui.heartsEl, Math.round(player.health), player.maxHealth);
      renderHunger(ui.hungerEl, Math.round(player.hunger), player.maxHunger);
      ui.xpFill.style.width = `${Math.floor(clamp(player.xp, 0, 1) * 100)}%`;
      ui.xpLevelEl.textContent = String(player.xpLevel || 0);
    }

    if (boss.active) {
      ui.bossEl.style.display = "block";
      ui.bossNameEl.textContent = boss.name;
      ui.bossFill.style.width = `${Math.floor(boss.health * 100)}%`;
    } else {
      ui.bossEl.style.display = "none";
    }
  }

  function refreshWorldList(selectedId) {
    ensureUI();
    const worlds = store.listWorlds();
    let resolvedSelectedId = selectedId;
    if (!worlds.some((worldMeta) => worldMeta.id === resolvedSelectedId)) {
      resolvedSelectedId = worlds[0]?.id || null;
    }
    if (resolvedSelectedId) {
      store.selectWorld(resolvedSelectedId);
    }
    ui.worldListEl.innerHTML = "";
    if (worlds.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fc-card";
      empty.innerHTML = `<div class="fc-small">No worlds yet. Create your first world to start playing.</div>`;
      ui.worldListEl.appendChild(empty);
    }
    worlds.forEach((worldMeta) => {
      const row = document.createElement("div");
      row.className = "fc-world" + (worldMeta.id === resolvedSelectedId ? " sel" : "");
      row.dataset.worldId = worldMeta.id;
      row.innerHTML = `
        <div>
          <b>${worldMeta.name}</b><br/>
          <span>Seed ${worldMeta.seed}</span>
        </div>
        <span>${worldMeta.lastPlayedAt ? new Date(worldMeta.lastPlayedAt).toLocaleDateString() : "Never played"}</span>
      `;
      ui.worldListEl.appendChild(row);
    });
    const canUseSelection = !!resolvedSelectedId && worlds.some((worldMeta) => worldMeta.id === resolvedSelectedId);
    ui.playWorldBtn.disabled = !canUseSelection;
    ui.playWorldBtn.classList.toggle("disabled", !canUseSelection);
    ui.deleteWorldBtn.disabled = !canUseSelection;
    ui.deleteWorldBtn.classList.toggle("disabled", !canUseSelection);
  }

  function setSettingsUI() {
    ensureUI();
    ui.rdSlider.value = String(settings.renderDistanceChunks);
    ui.rdLabel.textContent = String(settings.renderDistanceChunks);
    ui.msSlider.value = String(settings.mouseSensitivity);
    ui.msLabel.textContent = String(settings.mouseSensitivity.toFixed(4));
    ui.fovSlider.value = String(settings.fovDegrees);
    ui.fovLabel.textContent = String(settings.fovDegrees);
    ui.showFpsCheck.checked = settings.showFps !== false;
    ui.viewBobCheck.checked = settings.viewBobbing !== false;
    ui.pack32Check.checked = settings.texturePack !== "default";
    ui.resourcePackCurrentEl.textContent = `Current: ${getResourcePackMeta(settings.texturePack).name}`;
    ui.mobModelsCheck.checked = settings.mobModels !== false;
    ui.invCheck.checked = !!settings.invertY;
    ui.gmCheck.checked = settings.gameMode === GAME_MODE.CREATIVE;
    ui.fpsEl.style.display = settings.showFps === false ? "none" : "block";
  }

  function renderResourcePackEntry(packName, selected = false) {
    const meta = getResourcePackMeta(packName);
    const entry = document.createElement("div");
    entry.className = `fc-pack-entry${selected ? " selected" : ""}`;
    entry.dataset.packId = packName;
    if (!selected) {
      entry.dataset.packSelect = packName;
    }

    const icon = document.createElement("img");
    icon.className = "fc-pack-icon";
    icon.alt = meta.name;
    icon.src = getBlockTexturePath(meta.iconBlock || BLOCK.GRASS, "top", { texturePack: packName }) || getBlockTexturePath(BLOCK.GRASS, "top", DEFAULT_SETTINGS);
    entry.appendChild(icon);

    const copy = document.createElement("div");
    copy.className = "fc-pack-copy";
    copy.innerHTML = `<div class="fc-pack-name">${meta.name}</div><div class="fc-pack-desc">${meta.description}</div>`;
    entry.appendChild(copy);
    return entry;
  }

  function renderResourcePackUI() {
    ensureUI();
    const selectedPack = settings.texturePack === "default" ? "default" : DEFAULT_SETTINGS.texturePack;
    const packNames = Object.keys(RESOURCE_PACK_META);

    ui.resourcePackAvailableEl.innerHTML = "";
    ui.resourcePackSelectedEl.innerHTML = "";
    ui.resourcePackSelectedEl.appendChild(renderResourcePackEntry(selectedPack, true));

    const available = packNames.filter((name) => name !== selectedPack);
    if (available.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fc-pack-empty";
      empty.textContent = "No other built-in packs available.";
      ui.resourcePackAvailableEl.appendChild(empty);
    } else {
      for (const packName of available) {
        ui.resourcePackAvailableEl.appendChild(renderResourcePackEntry(packName, false));
      }
    }
  }

  function markWorldDirty() {
    if (world) {
      world.saveDirty = true;
    }
  }

  function invalidateAllChunkMeshes() {
    if (!world) return;
    for (const chunk of world.chunks.values()) {
      chunk.meshDirty = true;
    }
    if (glRenderer) {
      for (const record of glRenderer.chunkMeshes.values()) {
        record.opaque.destroy();
        record.transparent.destroy();
      }
      glRenderer.chunkMeshes.clear();
      glRenderer.meshQueue = [];
    }
  }

  function applyTexturePackSetting() {
    if (textures) {
      textures.settings = settings;
    }
    if (atlas) {
      atlas.settings = settings;
    }
    setHotbarImages();
    if (useWebGL && glRenderer) {
      invalidateAllChunkMeshes();
    } else if (canvasRenderer) {
      canvasRenderer.setSettings(settings);
    }
    if (ui?.resourcePackCurrentEl) {
      ui.resourcePackCurrentEl.textContent = `Current: ${getResourcePackMeta(settings.texturePack).name}`;
    }
    if (ui?.resourcePackAvailableEl && ui?.resourcePackSelectedEl) {
      renderResourcePackUI();
    }
  }

  function saveWorld(force = false) {
    if (!activeWorldId || !world || !player) return;
    if (!force && (!world.saveDirty || saveTimer < AUTOSAVE_INTERVAL_SECONDS)) return;

    const payload = {
      version: GAME_VERSION,
      seed: world.seed,
      modifiedChunks: serializeModifiedChunks(world.modifiedChunks),
      furnaces: serializeFurnaceStates(furnaceStates),
      player: player.serialize(),
      settings
    };
    store.saveWorld(activeWorldId, payload);
    world.saveDirty = false;
    saveTimer = 0;
  }

  function loadWorldFromStore(worldId) {
    const meta = store.getWorldMeta(worldId);
    const save = store.loadWorld(worldId);
    const seed = normalizeWorldSeed(save?.seed ?? meta?.seed, generateRandomWorldSeed());

    world = new World(seed);
    world.modifiedChunks = deserializeModifiedChunks(save?.modifiedChunks || {});
    world.loadedFromStorage = !!save;
    furnaceStates = deserializeFurnaceStates(save?.furnaces || {});
    settings = { ...DEFAULT_SETTINGS, ...settings, ...(save?.settings || {}) };
    settings.renderDistanceChunks = clamp(settings.renderDistanceChunks || DEFAULT_RENDER_DISTANCE, 2, 6);
    settings.mouseSensitivity = clamp(settings.mouseSensitivity || DEFAULT_SETTINGS.mouseSensitivity, 0.0012, 0.006);
    settings.fovDegrees = clamp(Math.round(settings.fovDegrees || DEFAULT_SETTINGS.fovDegrees), 55, 95);
    settings.showFps = settings.showFps !== false;
    settings.viewBobbing = settings.viewBobbing !== false;
    settings.texturePack = settings.texturePack === "default" ? "default" : DEFAULT_SETTINGS.texturePack;
    settings.mobModels = settings.mobModels !== false;
    settings.invertY = !!settings.invertY;
    settings.gameMode = settings.gameMode === GAME_MODE.CREATIVE ? GAME_MODE.CREATIVE : GAME_MODE.SURVIVAL;
    if (textures) {
      textures.settings = settings;
    }
    if (atlas) {
      atlas.settings = settings;
    }

    player = new Player();
    const spawn = world.findSpawn(0, 0);
    player.setPosition(spawn.x, spawn.y, spawn.z);
    if (save?.player) {
      player.restore(save.player);
    }
    player.ensureSafePosition(world);
    activeFurnaceKey = null;
    setBossBar(false);
  }

  function ensureActiveRenderer() {
    if (!world || !player) return;

    if (useWebGL) {
      if (!glRenderer) {
        glRenderer = new WebGLVoxelRenderer(gl, world, player, atlas, settings);
      }
      atlas.settings = settings;
      for (const record of glRenderer.chunkMeshes.values()) {
        record.opaque.destroy();
        record.transparent.destroy();
      }
      glRenderer.world = world;
      glRenderer.player = player;
      glRenderer.settings = settings;
      glRenderer.textureLibrary = textures;
      glRenderer.entityTextures = entityTextures;
      glRenderer.objModelLibrary = objModels;
      glRenderer.setRenderDistance(settings.renderDistanceChunks);
      glRenderer.chunkMeshes.clear();
      glRenderer.chunkGenQueue = [];
      glRenderer.meshQueue = [];
      glRenderer.mesher = new GreedyChunkMesher(world, atlas);
      canvasRenderer = null;
      return;
    }

    canvasRenderer = new VoxelRenderer(engine.canvas, engine.ctx2d, world, player, textures, settings);
    canvasRenderer.entityTextures = entityTextures;
    canvasRenderer.setRenderDistance(settings.renderDistanceChunks);
  }

  function startWorld(worldId) {
    activeWorldId = worldId;
    store.selectWorld(worldId);
    store.markPlayed(worldId);

    loadWorldFromStore(worldId);
    mobs = [];
    items = [];
    worldTime = 0;
    spawnTimer = 0;
    for (let i = 0; i < 4; i += 1) {
      spawnMobNearPlayer("sheep");
    }
    mining.key = null;
    mining.progress = 0;
    input.pointerLockEnabled = false;
    currentTarget = null;
    currentEntityTarget = null;
    inventoryOpen = false;
    inventoryContext = "inventory";
    inventoryCursor.type = BLOCK.AIR;
    inventoryCursor.count = 0;
    activeFurnaceKey = null;
    inventoryCraftTypes.fill(0);
    inventoryCraftCounts.fill(0);
    tableCraftTypes.fill(0);
    tableCraftCounts.fill(0);
    resetInventoryDragState();
    mobRenderWarnings.clear();
    lastMobRenderSummaryAt = 0;
    saveTimer = 0;
    loadingStartChunk = { x: Math.floor(player.x / CHUNK_SIZE), z: Math.floor(player.z / CHUNK_SIZE) };
    ensureActiveRenderer();
    logMobRenderDiagnostics("world-start");

    setHotbarImages();
    setSettingsUI();
    mode = "loading";
    ensureUI();
    ui.showScreen("loading");
    ui.setHudVisible(false);
    ui.inventoryEl.style.display = "none";
    closeChat(false);
  }

  function createAndStartWorld() {
    if (!store) {
      ensureStore();
    }
    const name = ui.worldNameInput.value.trim() || "New World";
    const seedValue = ui.worldSeedInput.value.trim();
    const id = store.createWorld({ name, seed: seedValue, select: true });
    selectedWorldId = id;
    ui.newWorldCard.style.display = "none";
    ui.worldNameInput.value = "";
    ui.worldSeedInput.value = "";
    refreshWorldList(selectedWorldId);
    startWorld(id);
  }

  function quitToTitle() {
    saveWorld(true);
    activeWorldId = null;
    mode = "menu";
    input.pointerLockEnabled = false;
    mobs = [];
    items = [];
    mining.key = null;
    mining.progress = 0;
    currentTarget = null;
    currentEntityTarget = null;
    inventoryOpen = false;
    inventoryContext = "inventory";
    inventoryCursor.type = BLOCK.AIR;
    inventoryCursor.count = 0;
    activeFurnaceKey = null;
    inventoryCraftTypes.fill(0);
    inventoryCraftCounts.fill(0);
    tableCraftTypes.fill(0);
    tableCraftCounts.fill(0);
    resetInventoryDragState();
    ensureUI();
    ui.showScreen("title");
    ui.setHudVisible(false);
    ui.inventoryEl.style.display = "none";
    closeChat(false);
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  function updateSelectedSlotFromInput() {
    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      player.selectedHotbarSlot = mod(player.selectedHotbarSlot + wheel, HOTBAR_SLOTS);
      updateHotbarSelection();
    }
    for (let index = 0; index < HOTBAR_SLOTS; index += 1) {
      if (input.consumePress(String(index + 1))) {
        player.selectedHotbarSlot = index;
        updateHotbarSelection();
      }
    }
  }

  function breakCurrentTarget() {
    if (!currentTarget || player.breakCooldown > 0) return false;
    if (currentTarget.type === BLOCK.BEDROCK || currentTarget.type === BLOCK.WATER) return false;
    if (world.setBlock(currentTarget.x, currentTarget.y, currentTarget.z, BLOCK.AIR)) {
      if (!isCreativeMode()) {
        if (currentTarget.type === BLOCK.FURNACE) {
          dropFurnaceContentsAt(currentTarget.x, currentTarget.y, currentTarget.z);
        }
        const jx = (random3(currentTarget.x, currentTarget.y, currentTarget.z, world.seed + 2001) - 0.5) * 2.2;
        const jz = (random3(currentTarget.z, currentTarget.y, currentTarget.x, world.seed + 2002) - 0.5) * 2.2;
        spawnItemEntity(
          currentTarget.type,
          1,
          currentTarget.x + 0.5,
          currentTarget.y + 0.55,
          currentTarget.z + 0.5,
          jx,
          3.4,
          jz,
          0.55
        );
      }
      player.breakCooldown = settings.gameMode === GAME_MODE.CREATIVE ? 0.06 : 0.12;
      return true;
    }
    return false;
  }

  function setMiningProgress(progress) {
    ensureUI();
    const p = clamp(progress, 0, 1);
    ui.miningEl.style.display = p > 0.001 ? "block" : "none";
    ui.miningBar.style.width = `${Math.floor(p * 100)}%`;
  }

  function updateMining(dt) {
    if (!input.locked || performance.now() < input.actionUnlockAt) {
      mining.key = null;
      mining.progress = 0;
      setMiningProgress(0);
      return;
    }

    if (currentEntityTarget) {
      mining.key = null;
      mining.progress = 0;
      setMiningProgress(0);
      return;
    }

    if (settings.gameMode === GAME_MODE.CREATIVE) {
      mining.key = null;
      mining.progress = 0;
      setMiningProgress(0);
      if (input.consumeMousePress(0)) {
        breakCurrentTarget();
      }
      return;
    }

    // Survival: hold-to-break.
    if (!currentTarget || !input.buttonsDown[0] || player.breakCooldown > 0) {
      mining.key = null;
      mining.progress = 0;
      setMiningProgress(0);
      return;
    }

    if (currentTarget.type === BLOCK.BEDROCK || currentTarget.type === BLOCK.WATER) {
      mining.key = null;
      mining.progress = 0;
      setMiningProgress(0);
      return;
    }

    const key = `${currentTarget.x}|${currentTarget.y}|${currentTarget.z}`;
    if (mining.key !== key) {
      mining.key = key;
      mining.progress = 0;
      mining.type = currentTarget.type;
    }

    const toolMultiplier = getToolBreakMultiplier(getSelectedHeldItemType(), mining.type);
    const time = getBreakTime(mining.type) / Math.max(1, toolMultiplier);
    mining.progress += dt / time;
    setMiningProgress(mining.progress);

    if (mining.progress >= 1) {
      const ok = breakCurrentTarget();
      mining.key = null;
      mining.progress = 0;
      setMiningProgress(0);
      if (!ok) {
        // If something changed, don't keep holding progress.
      }
    }
  }

  function tryPlaceBlock() {
    if (!currentTarget || player.placeCooldown > 0) return;
    const place = currentTarget.place;
    if (!place || place.y <= 0 || place.y >= WORLD_HEIGHT) return;
    const existing = world.getBlock(place.x, place.y, place.z);
    if (existing !== BLOCK.AIR && existing !== BLOCK.WATER) return;
    if (player.intersectsBlock(place.x, place.y, place.z)) return;
    const type = getSelectedHeldBlockType();
    if (!type || type === BLOCK.AIR) return;
    if (!isCreativeMode() && getSelectedHeldCount() <= 0) return;
    if (world.setBlock(place.x, place.y, place.z, type)) {
      if (!isCreativeMode()) {
        consumeFromSelectedSlot(1);
      }
      player.placeCooldown = 0.14;
    }
  }

  function consumeHeldFood() {
    const itemType = getSelectedHeldItemType();
    const food = getItemFoodValue(itemType);
    if (!itemType || food <= 0 || isCreativeMode()) return false;
    if (!player || player.hunger >= player.maxHunger) return false;
    if (!consumeFromSelectedSlot(1)) return false;
    player.hunger = Math.min(player.maxHunger, player.hunger + food);
    player.regenTimer = 0;
    world.saveDirty = true;
    setHotbarImages();
    renderInventoryUI();
    return true;
  }

  function openFurnaceAtTarget(target) {
    if (!target || target.type !== BLOCK.FURNACE) return false;
    activeFurnaceKey = packBlockPositionKey(target.x, target.y, target.z);
    getActiveFurnaceState(true);
    setInventoryOpen(true, "furnace");
    return true;
  }

  function updateInteractions() {
    if (!input.locked || performance.now() < input.actionUnlockAt) return;
    if (input.consumeMousePress(1) && currentTarget) {
      if (isCreativeMode()) {
        const hotbarIndex = HOTBAR_BLOCKS.indexOf(currentTarget.type);
        if (hotbarIndex >= 0) {
          player.selectedHotbarSlot = hotbarIndex;
          updateHotbarSelection();
        }
      } else {
        for (let i = 0; i < HOTBAR_SLOTS; i += 1) {
          if (player.hotbarCounts[i] > 0 && player.hotbarTypes[i] === currentTarget.type) {
            player.selectedHotbarSlot = i;
            updateHotbarSelection();
            break;
          }
        }
      }
    }
    if (input.consumeMousePress(2)) {
      if (currentTarget?.type === BLOCK.CRAFTING_TABLE) {
        setInventoryOpen(true, "table");
        return;
      }
      if (currentTarget?.type === BLOCK.FURNACE && openFurnaceAtTarget(currentTarget)) {
        return;
      }
      if (consumeHeldFood()) {
        return;
      }
    }
    if (input.buttonsDown[2]) tryPlaceBlock();
  }

  function updateCombat() {
    if (!input.locked || performance.now() < input.actionUnlockAt) return;
    if (!currentEntityTarget?.mob) return;
    if (input.consumeMousePress(0)) {
      attackTargetMob();
    }
  }

  function updateLoading(dt) {
    if (!useWebGL) {
      // Canvas fallback: just build a few chunks via old helper.
      const candidates = buildChunkLoadList(loadingStartChunk.x, loadingStartChunk.z, settings.renderDistanceChunks + 1);
      for (let i = 0; i < 2 && i < candidates.length; i += 1) {
        world.getChunk(candidates[i].x, candidates[i].z);
      }
      if (textures.ready || textures.failed) {
        mode = "playing";
        input.pointerLockEnabled = true;
        ui.hideMenu();
        ui.setHudVisible(true);
      }
      return;
    }

    // WebGL: wait for the GPU texture array before meshing, otherwise every block
    // would end up sampling layer 0 until we rebuild everything again.
    const textureProgress = atlas.texture ? 1 : textures.progress || 0;
    if (!atlas.texture) {
      const progress = clamp(textureProgress * 0.25, 0, 0.25);
      ui.loadBar.style.width = `${Math.floor(progress * 100)}%`;
      ui.loadSub.textContent = `${Math.floor(progress * 100)}% (textures)`;
      ui.loadText.textContent = textures.ready ? "Uploading textures to GPU" : "Loading textures";
      return;
    }

    glRenderer.ensureVisibleChunks(LOADING_CHUNK_GEN_LIMIT);
    glRenderer.updateQueue(LOADING_CHUNK_MESH_LIMIT, LOADING_CHUNK_MESH_BUDGET_MS);

    const wanted = (() => {
      const rd = settings.renderDistanceChunks;
      const r = rd + 0.5;
      const r2 = r * r;
      let count = 0;
      for (let dx = -rd; dx <= rd; dx += 1) {
        for (let dz = -rd; dz <= rd; dz += 1) {
          if (dx * dx + dz * dz <= r2) count += 1;
        }
      }
      return count;
    })();
    const built = glRenderer.chunkMeshes.size;
    const progress = clamp((built / Math.max(1, wanted)) * 0.8 + textureProgress * 0.2, 0, 1);

    ui.loadBar.style.width = `${Math.floor(progress * 100)}%`;
    ui.loadSub.textContent = `${Math.floor(progress * 100)}% (${built}/${wanted} chunks)`;
    ui.loadText.textContent = atlas.texture ? "Building chunk meshes" : "Uploading textures to GPU";

    if (progress > 0.98 && atlas.texture) {
      mode = "playing";
      input.pointerLockEnabled = true;
      ui.hideMenu();
      ui.setHudVisible(true);
    }
  }

  function updateFps(dt) {
    const instantaneous = dt > 0 ? 1 / dt : 0;
    fpsSmoothed = fpsSmoothed ? lerp(fpsSmoothed, instantaneous, 0.08) : instantaneous;
    fpsTimer += dt;
    if (ui) {
      ui.fpsEl.style.display = settings.showFps === false ? "none" : "block";
    }
    if (fpsTimer >= 0.2) {
      fps = fpsSmoothed;
      ensureUI();
      const backend = useWebGL ? "WebGL2" : "Canvas";
      ui.fpsEl.textContent = `FPS: ${fps.toFixed(0)} (${backend})`;
      fpsTimer = 0;
    }
  }

  function wireUiEvents() {
    ensureUI();
    if (ui.root.dataset.wired === "1") return;
    ui.root.dataset.wired = "1";

    selectedWorldId = store.getSelectedWorldId();

    ui.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitChat(ui.chatInput.value);
        closeChat(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeChat(true);
      }
      event.stopPropagation();
    });

    window.addEventListener("mousemove", () => {
      updateInventoryCursorPosition();
    });

    ui.root.addEventListener("mousedown", (event) => {
      if (!inventoryOpen) return;
      if (event.button !== 0 && event.button !== 2) return;
      const desc = getSlotDescriptorFromElement(event.target);
      if (!desc) return;

      if (inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
        return;
      }
      if (desc.kind === "furnace" && desc.slot === "output") {
        event.preventDefault();
        return;
      }
      beginInventoryDrag(desc, event.button);
      event.preventDefault();
    });

    ui.root.addEventListener("dragstart", (event) => {
      if (!inventoryOpen) return;
      if (!event.target.closest("#freecube2-inventory")) return;
      event.preventDefault();
    });

    ui.root.addEventListener("dragover", (event) => {
      if (!inventoryOpen) return;
      if (!event.target.closest("#freecube2-inventory")) return;
      event.preventDefault();
    });

    ui.root.addEventListener("drop", (event) => {
      if (!inventoryOpen) return;
      if (!event.target.closest("#freecube2-inventory")) return;
      event.preventDefault();
    });

    ui.root.addEventListener("mouseover", (event) => {
      if (!inventoryOpen || !inventoryDrag.pending) return;
      const buttonMask = inventoryDrag.button === 2 ? 2 : 1;
      if (!(event.buttons & buttonMask)) return;
      const desc = getSlotDescriptorFromElement(event.target);
      if (!desc) return;
      const originKey = slotDescriptorKey(inventoryDrag.origin);
      const key = slotDescriptorKey(desc);
      if (!inventoryDrag.active) {
        if (!originKey || key === originKey) return;
        inventoryDrag.active = true;
        suppressInventoryClick = true;
        includeDragTarget(inventoryDrag.origin);
      }
      includeDragTarget(desc);
    });

    window.addEventListener("mouseup", () => {
      if (!inventoryOpen) {
        resetInventoryDragState();
        return;
      }
      if (inventoryDrag.active) {
        const changed = applyDragDistribution();
        resetInventoryDragState();
        suppressInventoryClick = true;
        setTimeout(() => {
          suppressInventoryClick = false;
        }, 0);
        if (changed) {
          world.saveDirty = true;
          setHotbarImages();
          renderInventoryUI();
        } else {
          updateInventoryCursorVisual();
        }
        return;
      }
      if (inventoryDrag.pending) {
        resetInventoryDragState();
        if (suppressInventoryClick) {
          setTimeout(() => {
            suppressInventoryClick = false;
          }, 0);
        }
      }
    });

    ui.root.addEventListener("click", (event) => {
      if (inventoryOpen && suppressInventoryClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressInventoryClick = false;
        return;
      }
      const inventorySlot = event.target.closest("[data-inventory-index]");
      const armorSlot = event.target.closest("[data-armor-index]");
      const craftSlot = event.target.closest("[data-craft-index]");
      const craftOutput = event.target.closest("[data-craft-output]");
      const furnaceSlot = event.target.closest("[data-furnace-slot]");
      if (inventoryOpen && inventorySlot?.dataset.inventoryIndex) {
        handleInventorySlotClick(Number(inventorySlot.dataset.inventoryIndex), { shiftKey: event.shiftKey });
        return;
      }
      if (inventoryOpen && armorSlot?.dataset.armorIndex) {
        handleArmorSlotClick(Number(armorSlot.dataset.armorIndex), { shiftKey: event.shiftKey });
        return;
      }
      if (inventoryOpen && craftSlot?.dataset.craftIndex) {
        handleCraftSlotClick(Number(craftSlot.dataset.craftIndex));
        return;
      }
      if (inventoryOpen && craftOutput?.dataset.craftOutput) {
        handleCraftResultClick({ shiftKey: event.shiftKey });
        return;
      }
      if (inventoryOpen && furnaceSlot?.dataset.furnaceSlot) {
        handleFurnaceSlotClick(furnaceSlot.dataset.furnaceSlot, { shiftKey: event.shiftKey });
        return;
      }

      const worldRow = event.target.closest(".fc-world");
      if (worldRow?.dataset.worldId) {
        selectedWorldId = worldRow.dataset.worldId;
        store.selectWorld(selectedWorldId);
        refreshWorldList(selectedWorldId);
        return;
      }

      const packEntry = event.target.closest("[data-pack-select]");
      if (packEntry?.dataset.packSelect) {
        settings.texturePack = packEntry.dataset.packSelect === "default" ? "default" : DEFAULT_SETTINGS.texturePack;
        applyTexturePackSetting();
        markWorldDirty();
        setSettingsUI();
        return;
      }

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;

      if (action === "singleplayer") {
        ui.showScreen("worlds");
        selectedWorldId = store.getSelectedWorldId() || store.listWorlds()[0]?.id || null;
        ui.newWorldCard.style.display = selectedWorldId ? "none" : "block";
        if (!selectedWorldId) {
          ui.worldNameInput.value = "";
          ui.worldSeedInput.value = "";
          ui.worldNameInput.focus();
        }
        refreshWorldList(selectedWorldId);
      } else if (action === "back-title") {
        ui.showScreen("title");
      } else if (action === "open-settings") {
        ui.showScreen("settings");
        setSettingsUI();
      } else if (action === "open-resource-packs-screen") {
        ui.showScreen("resourcePacks");
        renderResourcePackUI();
      } else if (action === "done-resource-packs") {
        ui.showScreen("settings");
        setSettingsUI();
      } else if (action === "open-resource-packs") {
        alert("Built-in packs are available here already. Custom pack folders are not wired in yet.");
      } else if (action === "back-settings") {
        ui.showScreen(mode === "paused" ? "pause" : "title");
      } else if (action === "play-world") {
        if (!selectedWorldId) return;
        startWorld(selectedWorldId);
      } else if (action === "new-world") {
        ui.newWorldCard.style.display = "block";
        ui.worldNameInput.value = "";
        ui.worldSeedInput.value = "";
        ui.worldNameInput.focus();
      } else if (action === "cancel-new-world") {
        ui.newWorldCard.style.display = "none";
      } else if (action === "create-world") {
        createAndStartWorld();
      } else if (action === "delete-world") {
        if (!selectedWorldId) return;
        const meta = store.getWorldMeta(selectedWorldId);
        const ok = confirm(`Delete world "${meta?.name || selectedWorldId}"? This cannot be undone.`);
        if (!ok) return;
        store.deleteWorld(selectedWorldId);
        selectedWorldId = store.getSelectedWorldId();
        refreshWorldList(selectedWorldId);
      } else if (action === "resume") {
        mode = "playing";
        ui.hideMenu();
        input.pointerLockEnabled = true;
        input.requestPointerLock();
      } else if (action === "save-now") {
        saveWorld(true);
      } else if (action === "quit-title") {
        mode = "menu";
        quitToTitle();
      } else if (action === "reload") {
        location.reload();
      }
    });

    [ui.worldNameInput, ui.worldSeedInput].forEach((inputEl) => {
      inputEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        if (ui.newWorldCard.style.display === "none") return;
        event.preventDefault();
        createAndStartWorld();
      });
    });

    ui.root.addEventListener("contextmenu", (event) => {
      if (!inventoryOpen) return;
      if (suppressInventoryClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressInventoryClick = false;
        return;
      }
      const inventorySlot = event.target.closest("[data-inventory-index]");
      const armorSlot = event.target.closest("[data-armor-index]");
      const craftSlot = event.target.closest("[data-craft-index]");
      const furnaceSlot = event.target.closest("[data-furnace-slot]");
      if (!inventorySlot && !armorSlot && !craftSlot && !furnaceSlot) return;
      event.preventDefault();
      if (inventorySlot?.dataset.inventoryIndex) {
        handleInventorySlotRightClick(Number(inventorySlot.dataset.inventoryIndex));
      } else if (armorSlot?.dataset.armorIndex) {
        handleArmorSlotRightClick(Number(armorSlot.dataset.armorIndex));
      } else if (craftSlot?.dataset.craftIndex) {
        handleCraftSlotRightClick(Number(craftSlot.dataset.craftIndex));
      } else if (furnaceSlot?.dataset.furnaceSlot) {
        handleFurnaceSlotRightClick(furnaceSlot.dataset.furnaceSlot);
      }
    });

    ui.rdSlider.addEventListener("input", () => {
      settings.renderDistanceChunks = clamp(Number(ui.rdSlider.value), 2, 6);
      ui.rdLabel.textContent = String(settings.renderDistanceChunks);
      if (glRenderer) glRenderer.setRenderDistance(settings.renderDistanceChunks);
      if (canvasRenderer) canvasRenderer.setRenderDistance(settings.renderDistanceChunks);
      markWorldDirty();
    });

    ui.msSlider.addEventListener("input", () => {
      settings.mouseSensitivity = clamp(Number(ui.msSlider.value), 0.0012, 0.006);
      ui.msLabel.textContent = settings.mouseSensitivity.toFixed(4);
      markWorldDirty();
    });

    ui.fovSlider.addEventListener("input", () => {
      settings.fovDegrees = clamp(Math.round(Number(ui.fovSlider.value) || DEFAULT_SETTINGS.fovDegrees), 55, 95);
      ui.fovLabel.textContent = String(settings.fovDegrees);
      markWorldDirty();
    });

    ui.showFpsCheck.addEventListener("change", () => {
      settings.showFps = !!ui.showFpsCheck.checked;
      ui.fpsEl.style.display = settings.showFps ? "block" : "none";
      markWorldDirty();
    });

    ui.viewBobCheck.addEventListener("change", () => {
      settings.viewBobbing = !!ui.viewBobCheck.checked;
      markWorldDirty();
    });

    ui.pack32Check.addEventListener("change", () => {
      settings.texturePack = ui.pack32Check.checked ? "gigantopack32" : "default";
      applyTexturePackSetting();
      markWorldDirty();
    });

    ui.mobModelsCheck.addEventListener("change", () => {
      settings.mobModels = !!ui.mobModelsCheck.checked;
      logMobRenderDiagnostics("toggle");
      markWorldDirty();
    });

    ui.invCheck.addEventListener("change", () => {
      settings.invertY = !!ui.invCheck.checked;
      markWorldDirty();
    });

    ui.gmCheck.addEventListener("change", () => {
      settings.gameMode = ui.gmCheck.checked ? GAME_MODE.CREATIVE : GAME_MODE.SURVIVAL;
      markWorldDirty();
      setHotbarImages();
    });
  }

  function ensureStore() {
    if (!store) {
      store = new WorldStore();
      store.loadIndex();
    }
    return store;
  }

  return {
    start() {
      ensureStore();
      input = new BrowserInput(engine);
      input.pointerLockEnabled = false;

      textures = new TextureLibrary(engine);
      textures.settings = settings;
      textures.startLoading();
      entityTextures = new EntityTextureLibrary(engine);
      entityTextures.startLoading();
      objModels = new ObjModelLibrary(engine);
      objModels.startLoading();

      useWebGL = setupWebGL();
      if (useWebGL) {
        atlas = new TextureArrayAtlas(gl, textures);
        atlas.settings = settings;
        atlas.build().catch((error) => console.warn("Atlas build failed:", error.message));
      }

      ensureUI();
      wireUiEvents();
      ui.showScreen("title");
      ui.setHudVisible(false);
      setSettingsUI();
      // Hotbar thumbnails depend on PNG textures; refresh once they're loaded.
      textures.readyPromise?.then(() => setHotbarImages());

      window.FreeCube2 = { engine, store, textures, entityTextures, objModels };
      console.log("FreeCube2 boot:", {
        version: GAME_VERSION,
        renderer: useWebGL ? "WebGL2" : "Canvas",
        seed: world?.seed,
        settings
      });
      console.log("Debug Console: Ctrl+Shift+Alt+Z (Sirco). DevTools: Ctrl+Shift+D (Sirco).");

      window.addEventListener("beforeunload", () => {
        saveWorld(true);
      });
    },

    update(dt) {
      if (!input || !textures) return;
      updateFps(dt);
      ensureStore();
      updateChat(dt);
      updateHud(dt);

      if (document.hidden) {
        input.resetState?.(true);
        if (player) {
          player.isSprinting = false;
        }
        setMiningProgress(0);
        saveWorld(false);
        return;
      }

      // When pointer lock is active, ESC may only exit pointer lock (no keydown).
      // Treat that as "pause".
      if (mode === "playing" && input.consumeLostPointerLock()) {
        mode = "paused";
        input.pointerLockEnabled = false;
        input.resetState?.(true);
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        ui.showScreen("pause");
      }

      if (input.consumePress("Escape")) {
        if (chatOpen) {
          closeChat(true);
          return;
        }
        if (inventoryOpen) {
          setInventoryOpen(false);
          return;
        }
        if (mode === "playing") {
          mode = "paused";
          input.pointerLockEnabled = false;
          input.resetState?.(true);
          if (document.exitPointerLock) document.exitPointerLock();
          if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
          ui.showScreen("pause");
        } else if (mode === "paused") {
          mode = "playing";
          ui.hideMenu();
          input.pointerLockEnabled = true;
          input.requestPointerLock();
        }
      }

      if (mode === "menu") {
        input.consumeLook();
        setMiningProgress(0);
        return;
      }

      if (!world || !player) return;

      if (input.consumePress("F1")) {
        hud.visible = !hud.visible;
        hud.last = null;
        updateHud(0);
      }
      if (input.consumePress("F3")) {
        if (canvasRenderer) {
          canvasRenderer.showDebug = !canvasRenderer.showDebug;
          console.log("Canvas debug:", canvasRenderer.showDebug);
          pushChatLine(`Debug: ${canvasRenderer.showDebug ? "ON" : "OFF"}`, "sys");
        } else {
          console.log("Debug: (WebGL) open Sirco Debug Console for logs");
          pushChatLine("Debug: use Sirco console (Ctrl+Shift+Alt+Z)", "sys");
        }
      }

      saveTimer += dt;

      if (mode === "loading") {
        updateLoading(dt);
        updatePlayerVitals(dt);
        saveWorld(false);
        return;
      }

      if (mode === "paused") {
        input.consumeLook();
        player.isSprinting = false;
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        setMiningProgress(0);
        updatePlayerVitals(dt);
        saveWorld(false);
        return;
      }

      // playing
      if (!chatOpen && !inventoryOpen && (input.consumePress("t") || input.consumePress("T"))) {
        openChat("");
        return;
      }
      if (!chatOpen && !inventoryOpen && (input.consumePress("/") || input.consumePress("?"))) {
        openChat("/");
        return;
      }
      if (!chatOpen && input.consumePress("e", "E")) {
        setInventoryOpen(!inventoryOpen);
        return;
      }

      if (chatOpen) {
        input.consumeLook();
        player.isSprinting = false;
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        setMiningProgress(0);
        player.breakCooldown = Math.max(0, player.breakCooldown - dt);
        player.placeCooldown = Math.max(0, player.placeCooldown - dt);
        updateFurnaces(dt);
        updatePlayerVitals(dt);
        saveWorld(false);
        return;
      }

      if (inventoryOpen) {
        input.consumeLook();
        player.isSprinting = false;
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        setMiningProgress(0);
        player.breakCooldown = Math.max(0, player.breakCooldown - dt);
        player.placeCooldown = Math.max(0, player.placeCooldown - dt);
        updateInventoryCursorPosition();
        updateFurnaces(dt);
        updatePlayerVitals(dt);
        saveWorld(false);
        return;
      }

      updateSelectedSlotFromInput();
      if (input.consumePress("q") || input.consumePress("Q")) {
        dropSelectedItem();
      }

      if (input.locked) {
        const look = input.consumeLook();
        player.applyLook(look.x, look.y, settings);
        player.update(dt, input, world);
        if (player.pendingFallDamage > 0) {
          applyDamage(player.pendingFallDamage, "fell");
          player.pendingFallDamage = 0;
        }
      } else {
        input.consumeLook();
        player.isSprinting = false;
      }

      player.ensureSafePosition(world);
      updatePlayerVitals(dt);

      if (useWebGL && glRenderer && atlas.texture) {
        glRenderer.ensureVisibleChunks(PLAY_CHUNK_GEN_LIMIT);
        glRenderer.updateQueue(PLAY_CHUNK_MESH_LIMIT, PLAY_CHUNK_MESH_BUDGET_MS);
        glRenderer.updateCamera();
      }

      const blockTarget = input.locked ? world.raycast(player.getEyePosition(), player.getLookVector(), MAX_REACH) : null;
      currentEntityTarget = input.locked ? findTargetMob(blockTarget) : null;
      currentTarget = currentEntityTarget ? null : blockTarget;
      if (useWebGL && glRenderer) glRenderer.setTargetBlock(currentTarget);
      updateCombat();
      updateMining(dt);
      updateInteractions();
      updateItems(dt);
      updateFurnaces(dt);
      updateSpawning(dt);

      // Mobs update + render feed.
      const cycle = getDayCycleInfo(worldTime);
      const nextMobs = [];
      let removedMob = false;
      for (const mob of mobs) {
        mob.update(dt, world, player);
        if (mob.health <= 0) {
          removedMob = true;
          continue;
        }

        const def = getMobDef(mob.type);
        if (!cycle.isNight && def.hostile && isMobInSunlight(mob)) {
          mob.sunBurnTimer += dt;
          if (mob.sunBurnTimer >= 0.85) {
            mob.sunBurnTimer = 0;
            const burnedUp = mob.takeDamage(1, mob.x, mob.z);
            if (burnedUp) {
              dropMobLoot(mob);
              addXp(def.hostile ? 0.35 : 0.18);
              removedMob = true;
              continue;
            }
          }
        } else {
          mob.sunBurnTimer = 0;
        }

        const dx = mob.x - player.x;
        const dz = mob.z - player.z;
        const dist = Math.hypot(dx, dz);
        const withinHeight = player.y < mob.y + mob.height && player.y + PLAYER_HEIGHT > mob.y;
        const minDist = PLAYER_RADIUS + mob.radius;
        if (withinHeight && dist < minDist) {
          const nx = dist > 0.001 ? dx / dist : Math.sin(player.yaw || 0);
          const nz = dist > 0.001 ? dz / dist : Math.cos(player.yaw || 0);
          const push = minDist - dist + 0.001;
          const nextX = mob.x + nx * push;
          const nextZ = mob.z + nz * push;
          if (!entityWouldCollide(world, nextX, mob.y, nextZ, mob.radius, mob.height)) {
            mob.x = nextX;
            mob.z = nextZ;
          }
        }
        if (def.hostile && withinHeight && dist < (def.attackReach || 1.15) && mob.attackCooldown <= 0) {
          mob.attackCooldown = mob.type === "spider" ? 0.75 : mob.type === "creeper" ? 1.05 : 0.9;
          applyDamage(def.attackDamage || 2, "");
        }
        nextMobs.push(mob);
      }
      if (removedMob) {
        mobs = nextMobs;
        world.saveDirty = true;
      }
      if (useWebGL && glRenderer) {
        glRenderer.entities = mobs.concat(items);
      }
      if (canvasRenderer) {
        canvasRenderer.mobs = mobs;
        canvasRenderer.items = items;
      }

      if (performance.now() - lastMobRenderSummaryAt > 12000) {
        logMobRenderDiagnostics("periodic");
        lastMobRenderSummaryAt = performance.now();
      }

      saveWorld(false);
    },

    render(dt) {
      if (!world || !player) return;

      if (useWebGL && glRenderer && atlas?.texture) {
        const cycle = getDayCycleInfo(worldTime);
        const clear = mixRgb(rgb(99, 183, 255), rgb(18, 24, 56), cycle.darkness * 0.92);
        gl.clearColor(clear[0] / 255, clear[1] / 255, clear[2] / 255, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        glRenderer.updateCamera();
        glRenderer.renderFrame();
      } else if (canvasRenderer) {
        canvasRenderer.setSettings(settings);
        canvasRenderer.renderFrame(dt, mode === "paused" ? "paused" : mode === "loading" ? "loading" : "playing", {
          loadingInfo: { progress: textures.progress || 0, loaded: 0, total: 1, textureProgress: textures.progress || 0 },
          selectedSlot: player.selectedHotbarSlot,
          notices: [],
          locked: input.locked,
          buttons: [],
          hoveredButton: null,
          settings,
          hasSave: true
        }, currentTarget);
      }
    }
  };
}
