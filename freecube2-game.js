const GAME_VERSION = "4.2.0-static";
const STORAGE_KEY = "freecube2-static-save-v5";
const WORLD_SEED = 124578;
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 112;
const SEA_LEVEL = 30;
const PLAYER_HEIGHT = 1.8;
const PLAYER_EYE_HEIGHT = 1.62;
const PLAYER_RADIUS = 0.32;
const MAX_REACH = 6;
const DEFAULT_RENDER_DISTANCE = 4;
const DEFAULT_SETTINGS = {
  renderDistanceChunks: DEFAULT_RENDER_DISTANCE,
  mouseSensitivity: 0.0026,
  invertY: false,
  gameMode: "survival" // "survival" | "creative"
};

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
        const seed = Number(data.seed) || WORLD_SEED;
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
      seed: Number.isFinite(seed) ? Number(seed) : WORLD_SEED,
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
  GLASS: 11
};

const BLOCK_BREAK_TIME = {
  [BLOCK.GRASS]: 0.45,
  [BLOCK.DIRT]: 0.5,
  [BLOCK.SAND]: 0.45,
  [BLOCK.STONE]: 1.4,
  [BLOCK.WOOD]: 1.05,
  [BLOCK.PLANKS]: 0.85,
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
    transparent: true,
    alpha: 0.84,
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
    bottom: "PNG/Tiles/trunk_bottom.png"
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
  }
};

const ENTITY_TEXTURE_CATALOG_PATH = "assets/entity/externalTextures.json";
const ENTITY_TEXTURE_NAMES = new Set(["sheep", "zombie", "creeper", "spider", "villager", "chicken", "wolf"]);

class TextureLibrary {
  constructor(engine) {
    this.engine = engine;
    this.images = new Map();
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
    const uniquePaths = Array.from(
      new Set(
        Object.values(BLOCK_TEXTURE_PATHS)
          .flatMap((entry) => Object.values(entry))
          .filter(Boolean)
      )
    );

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

  getBlockFaceTexture(blockType, faceId) {
    const entry = BLOCK_TEXTURE_PATHS[blockType];
    if (!entry) {
      return null;
    }
    const path = faceId === "top" ? entry.top : faceId === "bottom" ? entry.bottom : entry.side;
    return this.images.get(path) || null;
  }
}

class EntityTextureLibrary {
  constructor(engine) {
    this.engine = engine;
    this.images = new Map();
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

const HOTBAR_SLOTS = 9;

const HOTBAR_BLOCKS = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.WOOD,
  BLOCK.PLANKS,
  BLOCK.LEAVES,
  BLOCK.SAND,
  BLOCK.BRICK,
  BLOCK.GLASS
];

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

          this.setLocalRaw(lx, y, lz, type);
        }

      }
    }

    this.decorateTrees(baseX, baseZ);

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
    this.markChunkAndNeighborsDirty(chunkX, chunkZ);
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
      const blockType = this.getBlock(x, y, z);
      if (blockType !== BLOCK.AIR && traveled > 0) {
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

    this.canvas.style.cursor = "pointer";
    this.canvas.setAttribute("tabindex", "0");

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
      this.buttonsDown = [false, false, false];
    };

    this.onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.canvas.style.cursor = this.locked ? "none" : "pointer";
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
    // Survival inventory hotbar. Creative uses HOTBAR_BLOCKS palette instead.
    this.hotbarTypes = new Uint8Array(HOTBAR_SLOTS);
    this.hotbarCounts = new Uint16Array(HOTBAR_SLOTS);
    this.maxHealth = 20;
    this.health = 20;
    this.maxHunger = 20;
    this.hunger = 20;
    this.xp = 0;
    this.xpLevel = 0;
    this.hurtCooldown = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
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
    // PointerLock movementX is positive when moving mouse right, so yaw+ should turn right.
    this.yaw += deltaX * sensitivity;
    this.pitch = clamp(this.pitch - deltaY * sensitivity * 0.84 * invertY, -1.5, 1.5);
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

    const forward = (input.isDown("w") || input.isDown("W") ? 1 : 0) - (input.isDown("s") || input.isDown("S") ? 1 : 0);
    const strafe = (input.isDown("d") || input.isDown("D") ? 1 : 0) - (input.isDown("a") || input.isDown("A") ? 1 : 0);
    const wantsSprint = input.isDown("Shift");

    const speed = wantsSprint ? 6.2 : 4.6;
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

    const targetVX = moveX * speed;
    const targetVZ = moveZ * speed;
    const accel = this.onGround ? 16 : 5;
    const blend = clamp(accel * dt, 0, 1);

    this.vx = lerp(this.vx, targetVX, blend);
    this.vz = lerp(this.vz, targetVZ, blend);

    if (length === 0 && this.onGround) {
      this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1));
      this.vz = lerp(this.vz, 0, clamp(12 * dt, 0, 1));
    }

    if (this.onGround && input.consumePress(" ")) {
      this.vy = 8.5;
      this.onGround = false;
    }

    this.vy -= 24 * dt;
    this.vy = Math.max(this.vy, -32);
    this.onGround = false;

    this.x += this.vx * dt;
    this.resolveAxisCollisions(world, "x", this.vx * dt);

    this.z += this.vz * dt;
    this.resolveAxisCollisions(world, "z", this.vz * dt);

    this.y += this.vy * dt;
    this.resolveAxisCollisions(world, "y", this.vy * dt);

    if (this.y < -20) {
      const spawn = world.findSpawn(Math.floor(this.x), Math.floor(this.z));
      this.setPosition(spawn.x, spawn.y, spawn.z);
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
      this.hotbarTypes = new Uint8Array(HOTBAR_SLOTS);
      this.hotbarCounts = new Uint16Array(HOTBAR_SLOTS);
      if (Array.isArray(data.hotbarTypes) && Array.isArray(data.hotbarCounts)) {
        for (let i = 0; i < HOTBAR_SLOTS; i += 1) {
          const t = Number(data.hotbarTypes[i]) || 0;
          const c = Number(data.hotbarCounts[i]) || 0;
          if (t > 0 && c > 0) {
            this.hotbarTypes[i] = t;
            this.hotbarCounts[i] = clamp(Math.floor(c), 0, 65535);
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
    this.wanderTimer = 0;
    this.wanderYaw = 0;
    this.attackCooldown = 0;
  }

  get radius() {
    return 0.32;
  }

  get height() {
    return 1.8;
  }

  setPosition(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
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
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      const rx = Math.floor(this.x);
      const rz = Math.floor(this.z);
      this.wanderTimer = 1.2 + random3(rx, Math.floor(this.y), rz, world.seed + 900) * 2.2;
      this.wanderYaw = random2(rx, rz, world.seed + 901) * Math.PI * 2;
    }

    // Mild bias toward the player if close, just to feel alive.
    const dxp = player.x - this.x;
    const dzp = player.z - this.z;
    const dist = Math.hypot(dxp, dzp);
    const chase = this.type === "zombie" && dist < 12 ? 0.55 : 0;
    const targetYaw = chase > 0 ? Math.atan2(dxp, dzp) : this.wanderYaw;
    this.yaw = lerpAngle(this.yaw, targetYaw, clamp(dt * 3, 0, 1));

    const speed = chase > 0 ? 2.2 : this.type === "sheep" ? 1.05 : 1.35;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const mvx = sin * speed;
    const mvz = cos * speed;

    const accel = this.onGround ? 10 : 3;
    this.vx = lerp(this.vx, mvx, clamp(accel * dt, 0, 1));
    this.vz = lerp(this.vz, mvz, clamp(accel * dt, 0, 1));

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

    // Small step-up attempt if we're blocked and grounded.
    if (this.onGround && (Math.abs(this.vx) + Math.abs(this.vz)) > 0.2) {
      const tryY = this.y + 0.35;
      if (!entityWouldCollide(world, this.x, tryY, this.z, this.radius, this.height)) {
        this.y = tryY;
      }
    }

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

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#63b7ff");
    sky.addColorStop(0.56, "#8fd1ff");
    sky.addColorStop(1, "#d8f3ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, horizon);

    const haze = ctx.createLinearGradient(0, horizon, 0, this.height);
    haze.addColorStop(0, "rgba(204, 228, 216, 0.96)");
    haze.addColorStop(1, "rgba(92, 156, 106, 0.92)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon, this.width, this.height - horizon);

    const sunX = this.width * 0.84;
    const sunY = this.height * 0.18;
    const sunSize = 20 * this.uiScale();
    ctx.fillStyle = rgba(this.sunColor, 0.18);
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunSize * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(this.sunColor, 0.98);
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunSize, 0, Math.PI * 2);
    ctx.fill();

    for (let index = 0; index < 7; index += 1) {
      const offset = ((this.cloudTime * (16 + index * 3) + index * 220) % (this.width + 480)) - 260;
      const y = this.height * (0.16 + index * 0.044);
      const width = (80 + index * 18) * this.uiScale();
      const height = (18 + index * 4) * this.uiScale();
      ctx.fillStyle = "rgba(255,255,255,0.42)";
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
    const texture = this.textures?.getBlockFaceTexture(face.type, face.faceId) || null;
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
      const tex = this.textures?.getBlockFaceTexture(item.blockType, "top") || null;
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
    const texture = this.textures?.getBlockFaceTexture(blockType, "top");
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
    this.texture = null;
    this.pathToLayer = new Map();
    this.layerCount = 0;
  }

  getLayerForPath(path) {
    return this.pathToLayer.get(path) ?? 0;
  }

  getLayerForBlockFace(blockType, faceId) {
    const entry = BLOCK_TEXTURE_PATHS[blockType];
    if (!entry) {
      return 0;
    }
    const path = faceId === "top" ? entry.top : faceId === "bottom" ? entry.bottom : entry.side;
    return this.getLayerForPath(path);
  }

  async build() {
    const gl = this.gl;
    await this.textures.startLoading();
    await this.textures.readyPromise;

    const uniquePaths = Array.from(
      new Set(
        Object.values(BLOCK_TEXTURE_PATHS)
          .flatMap((entry) => Object.values(entry))
          .filter(Boolean)
      )
    ).sort();

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
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, image);
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
    this.meshQueue = [];
    this.proj = mat4Identity();
    this.view = mat4Identity();
    this.fov = Math.PI / 3;
    this.targetBlock = null;
    this.textureLibrary = null;
    this.entityTextures = null;
    this._spriteTextures = new WeakMap();
    this._outline = this._createOutlineRenderer();
    this.entities = [];
    this._entities = this._createEntityRenderer();

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
      uniform sampler2DArray uTex;
      in vec2 vUV;
      flat in int vLayer;
      in float vLight;
      out vec4 outColor;
      void main(){
        vec2 uv = fract(vUV);
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
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
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

  updateQueue(limit = 1) {
    for (let i = 0; i < limit && this.meshQueue.length > 0; i += 1) {
      const next = this.meshQueue.shift();
      this.rebuildChunk(next.chunkX, next.chunkZ);
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

  ensureVisibleChunks() {
    const playerChunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(this.player.z / CHUNK_SIZE);
    for (let cx = playerChunkX - this.renderDistanceChunks; cx <= playerChunkX + this.renderDistanceChunks; cx += 1) {
      for (let cz = playerChunkZ - this.renderDistanceChunks; cz <= playerChunkZ + this.renderDistanceChunks; cz += 1) {
        if (!this._withinDistance(cx - playerChunkX, cz - playerChunkZ)) continue;
        const chunk = this.world.getChunk(cx, cz);
        if (chunk.meshDirty || !this.chunkMeshes.has(packChunkKey(cx, cz))) {
          this.queueChunk(cx, cz);
        }
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
  }

  updateCamera() {
    const gl = this.gl;
    const aspect = gl.canvas.width / gl.canvas.height;
    mat4Perspective(this.proj, this.fov, aspect, 0.02, 1200);
    const eye = [this.player.x, this.player.y + PLAYER_EYE_HEIGHT, this.player.z];
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
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
        const isItem = Number.isFinite(e.blockType);
        const image = isItem
          ? this.textureLibrary?.getBlockFaceTexture(e.blockType, "top") || null
          : this.entityTextures?.getImage(e.type) || null;
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
  let mode = "menu"; // menu | loading | playing | paused
  let chatOpen = false;
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
        #freecube2-fps{position:fixed;left:10px;top:8px;padding:6px 8px;background:rgba(0,0,0,0.35);color:#eaffea;font:12px/1.1 monospace;border:1px solid rgba(255,255,255,0.12);border-radius:6px}
        #freecube2-boss{position:fixed;left:50%;top:14px;transform:translateX(-50%);width:min(520px,86vw);display:none}
        #freecube2-boss-name{margin-bottom:6px;text-align:center;color:rgba(255,255,255,0.95);font:700 13px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 10px rgba(0,0,0,0.6)}
        #freecube2-boss-bar{height:14px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.14);overflow:hidden}
        #freecube2-boss-bar > div{height:100%;width:50%;background:linear-gradient(90deg, rgba(255,92,210,0.96), rgba(182,72,255,0.96))}
        #freecube2-xp{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);width:min(520px,86vw);display:none}
        #freecube2-xp-bar{height:10px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.14);overflow:hidden}
        #freecube2-xp-bar > div{height:100%;width:0%;background:linear-gradient(90deg, rgba(94,236,171,0.96), rgba(72,162,255,0.96))}
        #freecube2-xp-level{margin-top:6px;text-align:center;color:rgba(220,235,255,0.9);font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 10px rgba(0,0,0,0.6)}
        #freecube2-status{position:fixed;left:50%;bottom:122px;transform:translateX(-50%);width:min(760px,92vw);display:none;justify-content:space-between;gap:14px}
        .fc-hearts,.fc-hunger{display:flex;gap:4px;align-items:center}
        .fc-heart,.fc-food{width:14px;height:14px;border-radius:4px;border:1px solid rgba(255,255,255,0.18);background:rgba(0,0,0,0.25);box-shadow:0 4px 12px rgba(0,0,0,0.25)}
        .fc-heart.full{background:linear-gradient(180deg, rgba(255,90,90,0.98), rgba(185,25,25,0.98))}
        .fc-heart.half{background:linear-gradient(90deg, rgba(255,90,90,0.98) 50%, rgba(0,0,0,0.25) 50%)}
        .fc-food.full{background:linear-gradient(180deg, rgba(255,208,92,0.98), rgba(170,92,20,0.98))}
        .fc-food.half{background:linear-gradient(90deg, rgba(255,208,92,0.98) 50%, rgba(0,0,0,0.25) 50%)}
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
        .freecube2-slot{position:relative;width:44px;height:44px;border-radius:8px;background:rgba(18,24,35,0.92);border:2px solid rgba(255,255,255,0.12);display:grid;place-items:center}
        .freecube2-slot.sel{border-color:rgba(255,255,255,0.9);box-shadow:0 0 0 3px rgba(90,200,255,0.25) inset}
        .freecube2-slot img{width:36px;height:36px;image-rendering:pixelated}
        .freecube2-slot .fc-count{position:absolute;right:6px;bottom:4px;color:rgba(255,255,255,0.95);font:900 12px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 0 rgba(0,0,0,0.75)}
        #freecube2-menu{position:fixed;inset:0;display:none;pointer-events:auto;background:#2b2b2b url('PNG/Tiles/dirt.png') repeat; background-size:256px 256px; image-rendering:pixelated; animation:fc-menu-pan 32s linear infinite}
        @keyframes fc-menu-pan{0%{background-position:0 0}100%{background-position:-256px -256px}}
        #freecube2-menu::before{content:'';position:fixed;inset:0;background:radial-gradient(circle at 50% 20%, rgba(255,255,255,0.06), transparent 52%),linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.55));pointer-events:none}
        #freecube2-menu.show{display:block}
        #freecube2-panel{position:relative;width:min(700px,92vw);margin:6vh auto 0 auto;padding:0;background:transparent;border:none;box-shadow:none;text-align:center}
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
        #fc-world-list{height:min(320px,46vh);overflow:auto}
        .fc-world{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 10px;background:rgba(0,0,0,0.45);border:2px solid #000;cursor:pointer}
        .fc-world.sel{outline:2px solid rgba(255,255,255,0.95)}
        .fc-world b{font:900 16px/1.1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.7)}
        .fc-world span{font:13px/1.2 ui-monospace,Menlo,Consolas,monospace;color:rgba(230,230,230,0.9)}
        .fc-field{display:flex;flex-direction:column;gap:6px;margin-top:10px}
        .fc-field label{font:12px/1 ui-monospace,Menlo,Consolas,monospace;color:rgba(255,255,255,0.9)}
        .fc-field input{all:unset;height:34px;padding:0 10px;background:#111;border:2px solid #000;color:#fff;font:14px/1.2 ui-monospace,Menlo,Consolas,monospace}
        .fc-field input:focus{outline:2px solid rgba(255,255,255,0.9)}
        .fc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .fc-small{font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;color:rgba(255,255,255,0.82);text-shadow:0 2px 8px rgba(0,0,0,0.6)}
        .fc-slider{width:100%}
        .fc-check{display:flex;align-items:center;gap:10px}
        .fc-check input{width:18px;height:18px}
        .fc-footer{display:flex;justify-content:space-between;gap:10px;margin-top:16px;color:rgba(255,255,255,0.85);font:12px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 10px rgba(0,0,0,0.7)}
      `;
      document.head.appendChild(style);
    }

    const root = document.getElementById("freecube2-ui-root") || document.createElement("div");
    root.id = "freecube2-ui-root";
    root.innerHTML = `
      <div id="freecube2-fps">FPS: --</div>
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
        <div class="fc-hearts" id="freecube2-hearts"></div>
        <div class="fc-hunger" id="freecube2-hunger"></div>
      </div>
      <div id="freecube2-xp">
        <div id="freecube2-xp-bar"><div></div></div>
        <div id="freecube2-xp-level">0</div>
      </div>
      <div id="freecube2-hotbar"></div>
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
                  <input id="fc-world-seed" placeholder="${WORLD_SEED}" />
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
    const bossNameEl = root.querySelector("#freecube2-boss-name");
    const bossFill = root.querySelector("#freecube2-boss-bar > div");
    const chatLogEl = root.querySelector("#freecube2-chat-log");
    const chatInputWrap = root.querySelector("#freecube2-chat-input-wrap");
    const chatInput = root.querySelector("#freecube2-chat-input");
    const crosshairEl = root.querySelector("#freecube2-crosshair");
    const miningEl = root.querySelector("#freecube2-mining");
    const miningBar = root.querySelector("#freecube2-mining-bar");
    const statusEl = root.querySelector("#freecube2-status");
    const heartsEl = root.querySelector("#freecube2-hearts");
    const hungerEl = root.querySelector("#freecube2-hunger");
    const xpEl = root.querySelector("#freecube2-xp");
    const xpFill = root.querySelector("#freecube2-xp-bar > div");
    const xpLevelEl = root.querySelector("#freecube2-xp-level");
    const hotbarEl = root.querySelector("#freecube2-hotbar");
    const menuEl = root.querySelector("#freecube2-menu");

    const screens = {
      title: root.querySelector("#fc-screen-title"),
      worlds: root.querySelector("#fc-screen-worlds"),
      settings: root.querySelector("#fc-screen-settings"),
      loading: root.querySelector("#fc-screen-loading"),
      pause: root.querySelector("#fc-screen-pause")
    };

    const worldListEl = root.querySelector("#fc-world-list");
    const newWorldCard = root.querySelector("#fc-new-world");
    const worldNameInput = root.querySelector("#fc-world-name");
    const worldSeedInput = root.querySelector("#fc-world-seed");

    const rdSlider = root.querySelector("#fc-rd");
    const rdLabel = root.querySelector("#fc-rd-label");
    const msSlider = root.querySelector("#fc-ms");
    const msLabel = root.querySelector("#fc-ms-label");
    const invCheck = root.querySelector("#fc-inv");
    const gmCheck = root.querySelector("#fc-gm");

    const loadBar = root.querySelector("#fc-load-bar");
    const loadSub = root.querySelector("#fc-load-sub");
    const loadText = root.querySelector("#fc-load-text");

    const showScreen = (screen) => {
      Object.values(screens).forEach((el) => { el.style.display = "none"; });
      screens[screen].style.display = "block";
      menuEl.classList.add("show");
      crosshairEl.style.display = screen === "loading" || screen === "menu" || screen === "title" || screen === "worlds" || screen === "settings" || screen === "pause" ? "none" : "";
    };

    const hideMenu = () => {
      menuEl.classList.remove("show");
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
      heartsEl,
      hungerEl,
      xpEl,
      xpFill,
      xpLevelEl,
      worldListEl,
      newWorldCard,
      worldNameInput,
      worldSeedInput,
      rdSlider,
      rdLabel,
      msSlider,
      msLabel,
      invCheck,
      gmCheck,
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
    for (let i = 0; i < HOTBAR_SLOTS; i += 1) {
      const slot = document.createElement("div");
      slot.className = "freecube2-slot" + (i === player.selectedHotbarSlot ? " sel" : "");
      const img = document.createElement("img");
      const isCreative = settings.gameMode === GAME_MODE.CREATIVE;
      const blockType = isCreative ? HOTBAR_BLOCKS[i] : player.hotbarTypes[i];
      const count = isCreative ? 0 : player.hotbarCounts[i];
      const path = blockType ? BLOCK_TEXTURE_PATHS[blockType]?.top : null;
      const image = path ? textures?.images?.get(path) : null;
      img.src = image?.src || "";
      img.alt = blockType ? (BLOCK_INFO[blockType]?.name || "block") : "empty";
      slot.appendChild(img);
      if (!isCreative && count > 1) {
        const c = document.createElement("div");
        c.className = "fc-count";
        c.textContent = String(count);
        slot.appendChild(c);
      }
      ui.hotbarEl.appendChild(slot);
    }
  }

  function updateHotbarSelection() {
    if (!ui) return;
    const slots = Array.from(ui.hotbarEl.querySelectorAll(".freecube2-slot"));
    slots.forEach((slot, idx) => {
      slot.classList.toggle("sel", idx === player.selectedHotbarSlot);
    });
  }

  function isCreativeMode() {
    return settings.gameMode === GAME_MODE.CREATIVE;
  }

  function getHotbarSlotType(index) {
    if (isCreativeMode()) {
      return HOTBAR_BLOCKS[index] || BLOCK.AIR;
    }
    const count = player.hotbarCounts[index] || 0;
    if (count <= 0) return BLOCK.AIR;
    return player.hotbarTypes[index] || BLOCK.AIR;
  }

  function getSelectedHeldBlockType() {
    return getHotbarSlotType(player.selectedHotbarSlot);
  }

  function getSelectedHeldCount() {
    return isCreativeMode() ? 999 : (player.hotbarCounts[player.selectedHotbarSlot] || 0);
  }

  function addToInventory(blockType, count) {
    if (!blockType || blockType === BLOCK.AIR) return count;
    if (blockType === BLOCK.WATER || blockType === BLOCK.BEDROCK) return count;
    let left = Math.max(0, Math.floor(count));
    if (left === 0) return 0;

    const maxStack = 64;
    let changed = false;

    // First, stack onto existing slots.
    for (let i = 0; i < HOTBAR_SLOTS && left > 0; i += 1) {
      if (player.hotbarTypes[i] !== blockType) continue;
      const c = player.hotbarCounts[i] || 0;
      if (c >= maxStack) continue;
      const add = Math.min(left, maxStack - c);
      player.hotbarCounts[i] = c + add;
      left -= add;
      changed = true;
    }

    // Then, fill empty slots.
    for (let i = 0; i < HOTBAR_SLOTS && left > 0; i += 1) {
      const c = player.hotbarCounts[i] || 0;
      if (c > 0) continue;
      const add = Math.min(left, maxStack);
      player.hotbarTypes[i] = blockType;
      player.hotbarCounts[i] = add;
      left -= add;
      changed = true;
    }

    if (changed) {
      setHotbarImages();
      world.saveDirty = true;
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

  function spawnItemEntity(blockType, count, x, y, z, vx = 0, vy = 3.8, vz = 0) {
    items.push({
      kind: "item",
      blockType,
      count: clamp(Math.floor(count) || 1, 1, 64),
      x,
      y,
      z,
      vx,
      vy,
      vz,
      age: 0
    });
  }

  function dropSelectedItem() {
    if (isCreativeMode()) return;
    const type = getSelectedHeldBlockType();
    const count = getSelectedHeldCount();
    if (!type || count <= 0) return;
    if (!consumeFromSelectedSlot(1)) return;
    const eye = player.getEyePosition();
    const dir = player.getLookVector();
    const x = eye.x + dir.x * 0.8;
    const y = eye.y + dir.y * 0.2;
    const z = eye.z + dir.z * 0.8;
    spawnItemEntity(type, 1, x, y, z, dir.x * 2.4, 2.6, dir.z * 2.4);
  }

  function updateItems(dt) {
    if (!items || items.length === 0) return;
    const gravity = 18;
    const next = [];
    for (const item of items) {
      item.age += dt;

      // Pickup.
      const dx = item.x - player.x;
      const dy = (item.y + 0.15) - (player.y + 0.9);
      const dz = item.z - player.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1.25 && item.age > 0.2) {
        const left = addToInventory(item.blockType, item.count);
        if (left <= 0) {
          continue;
        }
        item.count = left;
      }

      item.vy -= gravity * dt;
      item.vy = Math.max(item.vy, -18);

      item.x += item.vx * dt;
      item.z += item.vz * dt;
      item.y += item.vy * dt;

      // Ground collision (simple).
      if (item.y < 0.1) {
        item.y = 0.1;
        item.vy = 0;
      }
      const below = world.getBlock(Math.floor(item.x), Math.floor(item.y - 0.12), Math.floor(item.z));
      if (isCollidable(below) && item.vy <= 0) {
        item.y = Math.floor(item.y - 0.12) + 1.12;
        item.vy = 0;
        item.vx *= Math.pow(0.25, dt * 6);
        item.vz *= Math.pow(0.25, dt * 6);
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

  function spawnMobNearPlayer(type = "zombie") {
    if (!world || !player) return;
    const mob = new Mob(type);
    const base = world.findSpawn(Math.floor(player.x), Math.floor(player.z));
    for (let tries = 0; tries < 18; tries += 1) {
      const angle = random2(tries, tries * 9, world.seed + 1211) * Math.PI * 2;
      const dist = 6 + random2(tries, tries * 13, world.seed + 1212) * 10;
      const x = base.x + Math.sin(angle) * dist;
      const z = base.z + Math.cos(angle) * dist;
      const col = world.terrain.describeColumn(Math.floor(x), Math.floor(z));
      const y = col.height + 1.001;
      if (!entityWouldCollide(world, x, y, z, mob.radius, mob.height)) {
        mob.setPosition(x, y, z);
        mobs.push(mob);
        return;
      }
    }
    mob.setPosition(base.x + 6, base.y, base.z);
    mobs.push(mob);
  }

  function isNight() {
    const dayLength = 600; // seconds per full cycle (fast)
    const t = (worldTime % dayLength) / dayLength; // 0..1
    return t > 0.55 && t < 0.9;
  }

  function updateSpawning(dt) {
    if (!world || !player) return;
    // Advance time faster than real-time so you can see day/night quickly.
    worldTime = (worldTime + dt * 10) % 600;

    spawnTimer -= dt;
    if (spawnTimer > 0) return;
    spawnTimer = isNight() ? 2.2 : 4.0;

    let hostiles = 0;
    let passives = 0;
    for (const m of mobs) {
      if (m.type === "zombie") hostiles += 1;
      else passives += 1;
    }

    if (isNight()) {
      if (hostiles < 10) {
        spawnMobNearPlayer("zombie");
        if (hostiles < 6 && random2(Math.floor(player.x), Math.floor(player.z), world.seed + 811) > 0.6) {
          spawnMobNearPlayer("zombie");
        }
      }
    } else {
      if (passives < 8) {
        spawnMobNearPlayer("sheep");
      }
      // Despawn far hostiles during the day.
      mobs = mobs.filter((m) => {
        if (m.type !== "zombie") return true;
        const dx = m.x - player.x;
        const dz = m.z - player.z;
        return dx * dx + dz * dz < 46 * 46;
      });
    }
  }

  function runCommand(line) {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    const cmd = (parts.shift() || "").toLowerCase();
    const args = parts;

    if (!cmd || cmd === "help") {
      pushChatLine("Commands: /help, /gm <survival|creative>, /tp x y z, /rd <2-6>, /summon <zombie> [count], /boss <name> <0-1>, /boss off, /clear", "sys");
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
        chunks: world?.chunks?.size
      };
      console.log("SYSINFO", info);
      pushChatLine(`SYSINFO: ${info.renderer}, mobs=${info.mobs}, items=${info.items}, chunks=${info.chunks}`, "sys");
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
    const dmg = Math.max(0, Number(amount) || 0);
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
    const moving =
      input &&
      input.locked &&
      ((input.isDown("w") || input.isDown("W") || input.isDown("a") || input.isDown("A") || input.isDown("s") || input.isDown("S") || input.isDown("d") || input.isDown("D")));
    const sprinting = !!(moving && input && input.locked && input.isDown("Shift"));
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
    const hearts = Math.ceil(max / 2);
    const fullHearts = Math.floor(value / 2);
    const hasHalf = value % 2 === 1;
    el.innerHTML = "";
    for (let i = 0; i < hearts; i += 1) {
      const d = document.createElement("div");
      d.className = "fc-heart";
      if (i < fullHearts) d.classList.add("full");
      else if (i === fullHearts && hasHalf) d.classList.add("half");
      el.appendChild(d);
    }
  }

  function renderHunger(el, value, max) {
    const foods = Math.ceil(max / 2);
    const full = Math.floor(value / 2);
    const hasHalf = value % 2 === 1;
    el.innerHTML = "";
    for (let i = 0; i < foods; i += 1) {
      const d = document.createElement("div");
      d.className = "fc-food";
      if (i < full) d.classList.add("full");
      else if (i === full && hasHalf) d.classList.add("half");
      el.appendChild(d);
    }
  }

  function updateHud(dt) {
    ensureUI();
    if (!hud.visible) {
      ui.setHudVisible(false);
      ui.bossEl.style.display = "none";
      return;
    }

    ui.setHudVisible(mode === "playing");

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
    const snap = `${player.health}|${player.hunger}|${player.xpLevel}|${player.xp}|${settings.gameMode}|${mode}|${boss.active}|${boss.health}|${boss.name}`;
    if (hud.last === snap) return;
    hud.last = snap;

    if (mode === "playing") {
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
    ui.worldListEl.innerHTML = "";
    worlds.forEach((worldMeta) => {
      const row = document.createElement("div");
      row.className = "fc-world" + (worldMeta.id === selectedId ? " sel" : "");
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
  }

  function setSettingsUI() {
    ensureUI();
    ui.rdSlider.value = String(settings.renderDistanceChunks);
    ui.rdLabel.textContent = String(settings.renderDistanceChunks);
    ui.msSlider.value = String(settings.mouseSensitivity);
    ui.msLabel.textContent = String(settings.mouseSensitivity.toFixed(4));
    ui.invCheck.checked = !!settings.invertY;
    ui.gmCheck.checked = settings.gameMode === GAME_MODE.CREATIVE;
  }

  function saveWorld(force = false) {
    if (!activeWorldId || !world || !player) return;
    if (!force && !world.saveDirty && saveTimer < 3) return;

    const payload = {
      version: GAME_VERSION,
      seed: world.seed,
      modifiedChunks: serializeModifiedChunks(world.modifiedChunks),
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
    const seed = Number(save?.seed ?? meta?.seed ?? WORLD_SEED);

    world = new World(seed);
    world.modifiedChunks = deserializeModifiedChunks(save?.modifiedChunks || {});
    world.loadedFromStorage = !!save;
    settings = { ...DEFAULT_SETTINGS, ...(save?.settings || {}) };
    settings.renderDistanceChunks = clamp(settings.renderDistanceChunks || DEFAULT_RENDER_DISTANCE, 2, 6);
    settings.mouseSensitivity = clamp(settings.mouseSensitivity || DEFAULT_SETTINGS.mouseSensitivity, 0.0012, 0.006);
    settings.invertY = !!settings.invertY;
    settings.gameMode = settings.gameMode === GAME_MODE.CREATIVE ? GAME_MODE.CREATIVE : GAME_MODE.SURVIVAL;

    player = new Player();
    const spawn = world.findSpawn(0, 0);
    player.setPosition(spawn.x, spawn.y, spawn.z);
    if (save?.player) {
      player.restore(save.player);
    }
    player.ensureSafePosition(world);
    setBossBar(false);
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
    saveTimer = 0;
    loadingStartChunk = { x: Math.floor(player.x / CHUNK_SIZE), z: Math.floor(player.z / CHUNK_SIZE) };

    if (useWebGL) {
      glRenderer.world = world;
      glRenderer.player = player;
      glRenderer.settings = settings;
      glRenderer.textureLibrary = textures;
      glRenderer.entityTextures = entityTextures;
      glRenderer.setRenderDistance(settings.renderDistanceChunks);
      glRenderer.chunkMeshes.clear();
      glRenderer.meshQueue = [];
      glRenderer.mesher = new GreedyChunkMesher(world, atlas);
    } else {
      canvasRenderer = new VoxelRenderer(engine.canvas, engine.ctx2d, world, player, textures, settings);
      canvasRenderer.entityTextures = entityTextures;
      canvasRenderer.setRenderDistance(settings.renderDistanceChunks);
    }

    setHotbarImages();
    setSettingsUI();
    mode = "loading";
    ensureUI();
    ui.showScreen("loading");
    ui.setHudVisible(false);
    closeChat(false);
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
    ensureUI();
    ui.showScreen("title");
    ui.setHudVisible(false);
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
        const jitter = (random3(currentTarget.x, currentTarget.y, currentTarget.z, world.seed + 2001) - 0.5) * 1.2;
        spawnItemEntity(
          currentTarget.type,
          1,
          currentTarget.x + 0.5,
          currentTarget.y + 0.3,
          currentTarget.z + 0.5,
          jitter,
          4.2,
          -jitter
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

    const time = getBreakTime(mining.type);
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
    if (input.buttonsDown[2]) tryPlaceBlock();
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

    glRenderer.ensureVisibleChunks();
    glRenderer.updateQueue(2);

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

    let selectedWorldId = store.getSelectedWorldId();

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

    ui.root.addEventListener("click", (event) => {
      const worldRow = event.target.closest(".fc-world");
      if (worldRow?.dataset.worldId) {
        selectedWorldId = worldRow.dataset.worldId;
        store.selectWorld(selectedWorldId);
        refreshWorldList(selectedWorldId);
        return;
      }

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;

      if (action === "singleplayer") {
        ui.showScreen("worlds");
        ui.newWorldCard.style.display = "none";
        selectedWorldId = store.getSelectedWorldId();
        refreshWorldList(selectedWorldId);
      } else if (action === "back-title") {
        ui.showScreen("title");
      } else if (action === "open-settings") {
        ui.showScreen("settings");
        setSettingsUI();
      } else if (action === "back-settings") {
        ui.showScreen(mode === "paused" ? "pause" : "title");
      } else if (action === "play-world") {
        if (!selectedWorldId) return;
        startWorld(selectedWorldId);
      } else if (action === "new-world") {
        ui.newWorldCard.style.display = "block";
        ui.worldNameInput.value = "";
        ui.worldSeedInput.value = String(WORLD_SEED);
      } else if (action === "cancel-new-world") {
        ui.newWorldCard.style.display = "none";
      } else if (action === "create-world") {
        const name = ui.worldNameInput.value.trim() || "New World";
        const seed = Number(ui.worldSeedInput.value) || WORLD_SEED;
        const id = store.createWorld({ name, seed, select: true });
        selectedWorldId = id;
        ui.newWorldCard.style.display = "none";
        refreshWorldList(selectedWorldId);
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

    ui.rdSlider.addEventListener("input", () => {
      settings.renderDistanceChunks = clamp(Number(ui.rdSlider.value), 2, 6);
      ui.rdLabel.textContent = String(settings.renderDistanceChunks);
      if (glRenderer) glRenderer.setRenderDistance(settings.renderDistanceChunks);
      if (canvasRenderer) canvasRenderer.setRenderDistance(settings.renderDistanceChunks);
      world.saveDirty = true;
    });

    ui.msSlider.addEventListener("input", () => {
      settings.mouseSensitivity = clamp(Number(ui.msSlider.value), 0.0012, 0.006);
      ui.msLabel.textContent = settings.mouseSensitivity.toFixed(4);
      world.saveDirty = true;
    });

    ui.invCheck.addEventListener("change", () => {
      settings.invertY = !!ui.invCheck.checked;
      world.saveDirty = true;
    });

    ui.gmCheck.addEventListener("change", () => {
      settings.gameMode = ui.gmCheck.checked ? GAME_MODE.CREATIVE : GAME_MODE.SURVIVAL;
      world.saveDirty = true;
      setHotbarImages();
    });
  }

  function ensureStore() {
    if (!store) {
      store = new WorldStore();
      store.loadIndex();
      if (store.listWorlds().length === 0) {
        store.createWorld({ name: "New World", seed: WORLD_SEED, select: true });
      }
    }
    return store;
  }

  return {
    start() {
      ensureStore();
      input = new BrowserInput(engine);
      input.pointerLockEnabled = false;

      textures = new TextureLibrary(engine);
      textures.startLoading();
      entityTextures = new EntityTextureLibrary(engine);
      entityTextures.startLoading();

      useWebGL = setupWebGL();
      if (useWebGL) {
        atlas = new TextureArrayAtlas(gl, textures);
        atlas.build().catch((error) => console.warn("Atlas build failed:", error.message));
        const selected = store.getSelectedWorldId() || store.listWorlds()[0]?.id;
        loadWorldFromStore(selected);
        glRenderer = new WebGLVoxelRenderer(gl, world, player, atlas, settings);
        glRenderer.textureLibrary = textures;
        glRenderer.entityTextures = entityTextures;
        glRenderer.setRenderDistance(settings.renderDistanceChunks);
      } else {
        // Canvas fallback (slower, but still playable).
        const selected = store.getSelectedWorldId() || store.listWorlds()[0]?.id;
        loadWorldFromStore(selected);
        canvasRenderer = new VoxelRenderer(engine.canvas, engine.ctx2d, world, player, textures, settings);
        canvasRenderer.entityTextures = entityTextures;
        canvasRenderer.setRenderDistance(settings.renderDistanceChunks);
      }

      ensureUI();
      wireUiEvents();
      ui.showScreen("title");
      ui.setHudVisible(false);
      setSettingsUI();
      // Hotbar thumbnails depend on PNG textures; refresh once they're loaded.
      textures.readyPromise?.then(() => setHotbarImages());

      window.FreeCube2 = { engine, store, textures, entityTextures };
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

      if (input.consumePress("Escape")) {
        if (chatOpen) {
          closeChat(true);
          return;
        }
        if (mode === "playing") {
          mode = "paused";
          input.pointerLockEnabled = false;
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
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        setMiningProgress(0);
        updatePlayerVitals(dt);
        saveWorld(false);
        return;
      }

      // playing
      if (!chatOpen && (input.consumePress("t") || input.consumePress("T"))) {
        openChat("");
        return;
      }
      if (!chatOpen && (input.consumePress("/") || input.consumePress("?"))) {
        openChat("/");
        return;
      }

      if (chatOpen) {
        input.consumeLook();
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        setMiningProgress(0);
        player.breakCooldown = Math.max(0, player.breakCooldown - dt);
        player.placeCooldown = Math.max(0, player.placeCooldown - dt);
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
      } else {
        input.consumeLook();
      }

      player.ensureSafePosition(world);
      updatePlayerVitals(dt);

      if (useWebGL && glRenderer && atlas.texture) {
        glRenderer.ensureVisibleChunks();
        glRenderer.updateQueue(1);
        glRenderer.updateCamera();
      }

      currentTarget = input.locked ? world.raycast(player.getEyePosition(), player.getLookVector(), MAX_REACH) : null;
      if (useWebGL && glRenderer) glRenderer.setTargetBlock(currentTarget);
      updateMining(dt);
      updateInteractions();
      updateItems(dt);
      updateSpawning(dt);

      // Mobs update + render feed.
      for (const mob of mobs) {
        mob.update(dt, world, player);
        const dx = mob.x - player.x;
        const dz = mob.z - player.z;
        const dist = Math.hypot(dx, dz);
        if (mob.type === "zombie" && dist < 1.15 && mob.attackCooldown <= 0) {
          mob.attackCooldown = 0.9;
          applyDamage(2, "");
        }
      }
      if (useWebGL && glRenderer) {
        glRenderer.entities = mobs.concat(items);
      }
      if (canvasRenderer) {
        canvasRenderer.mobs = mobs;
        canvasRenderer.items = items;
      }

      saveWorld(false);
    },

    render(dt) {
      if (!world || !player) return;

      if (useWebGL && glRenderer && atlas?.texture) {
        gl.clearColor(0.62, 0.82, 1.0, 1);
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
