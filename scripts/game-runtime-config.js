export const GAME_TITLE = "Cubes and Caves";
export const GAME_SHORT_TITLE = "Cubes & Caves";
export const GAME_STORAGE_SLUG = "cubes-and-caves";
export const GAME_EXPORT_SLUG = "cubes-and-caves-world";
export const GAME_VERSION = "9.0.4 (beta)";
export const STORAGE_NAMESPACE_VERSION = 6;
export const STORAGE_KEY = `${GAME_STORAGE_SLUG}-static-save-v${STORAGE_NAMESPACE_VERSION}`;
export const GLOBAL_SETTINGS_KEY = `${GAME_STORAGE_SLUG}-global-settings-v${STORAGE_NAMESPACE_VERSION}`;
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 112;
export const SEA_LEVEL = 30;
export const LAVA_LEVEL = 8;
export const LIGHT_LEVEL_MAX = 15;
export const TORCH_LIGHT_LEVEL = 14;
export const WEATHER_TYPES = {
  CLEAR: "clear",
  RAIN: "rain",
  THUNDER: "thunder"
};
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_RADIUS = 0.32;
export const MAX_REACH = 6;
export const DEFAULT_RENDER_DISTANCE = 3;
export const MINECRAFT_DAY_LENGTH_SECONDS = 20 * 60;
export const DEFAULT_SETTINGS = {
  renderDistanceChunks: DEFAULT_RENDER_DISTANCE,
  mouseSensitivity: 0.0026,
  invertY: false,
  gameMode: "survival", // "survival" | "creative"
  fovDegrees: 70,
  showFps: true,
  viewBobbing: true,
  graphicsMode: "fast",
  shadows: false,
  chunkLagFix: true,
  fullscreen: false,
  masterVolume: 1,
  musicVolume: 0.65,
  texturePack: "default",
  mobModels: true,
  performancePreset: "boost",
  playerSkinPreset: "steve",
  playerSkinDataUrl: "",
  customResourcePacks: []
};
export const DEFAULT_GAMERULES = {
  doDaylightCycle: true,
  doWeatherCycle: true,
  keepInventory: true
};

export const PERFORMANCE_PRESETS = ["balanced", "boost", "turbo"];

export function normalizePerformancePreset(value, fallback = DEFAULT_SETTINGS.performancePreset) {
  return PERFORMANCE_PRESETS.includes(value) ? value : fallback;
}

export function getPerformancePresetLabel(value = DEFAULT_SETTINGS.performancePreset) {
  switch (normalizePerformancePreset(value)) {
    case "turbo":
      return "Max FPS";
    case "boost":
      return "Boost";
    default:
      return "Balanced";
  }
}

export function getPerformancePresetConfig(value = DEFAULT_SETTINGS.performancePreset) {
  switch (normalizePerformancePreset(value)) {
    case "turbo":
      return {
        entityDistance: 24,
        waterSteps: 10,
        lavaSteps: 3,
        cleanupBias: 1
      };
    case "boost":
      return {
        entityDistance: 32,
        waterSteps: 14,
        lavaSteps: 4,
        cleanupBias: 0.5
      };
    default:
      return {
        entityDistance: 44,
        waterSteps: 18,
        lavaSteps: 5,
        cleanupBias: 0
      };
  }
}

export const LOADING_CHUNK_GEN_LIMIT = 4;
export const LOADING_CHUNK_MESH_LIMIT = 4;
export const LOADING_CHUNK_GEN_BUDGET_MS = 9;
export const LOADING_CHUNK_MESH_BUDGET_MS = 7;
export const PLAY_CHUNK_GEN_LIMIT = 1;
export const PLAY_CHUNK_MESH_LIMIT = 2;
export const PLAY_CHUNK_GEN_BUDGET_MS = 1.5;
export const PLAY_CHUNK_MESH_BUDGET_MS = 2.25;
export const AUTOSAVE_INTERVAL_SECONDS = 8;
export const RANDOM_BLOCK_TICK_INTERVAL = 0.16;
export const RANDOM_BLOCK_TICKS_PER_STEP = 6;
export const WATER_FLOW_TICK_SECONDS = 0.12;
export const LAVA_FLOW_TICK_SECONDS = 0.62;
export const MAX_WATER_FLOW_LEVEL = 7;
export const MAX_LAVA_FLOW_LEVEL = 4;
export const BLOCK_TICK_STEP_SECONDS = 0.05;
export const MAX_BLOCK_TICK_STEPS_PER_FRAME = 2;
export const TARGET_SCAN_INTERVAL_SECONDS = 1 / 30;
export const REDSTONE_MAX_SIGNAL = 15;
export const REDSTONE_REPEATER_MIN_DELAY = 1;
export const REDSTONE_REPEATER_MAX_DELAY = 4;
export const REDSTONE_REPEATER_DELAY_STEPS = 2;
export const REDSTONE_UPDATE_LIMIT_PER_STEP = 256;
export const REDSTONE_SCHEDULE_LIMIT_PER_STEP = 96;
export const PISTON_PUSH_LIMIT = 12;
export const ITEM_MERGE_RADIUS = 1.5;
export const ITEM_MAX_PER_CHUNK = 96;
export const ITEM_FAR_SIM_DISTANCE = 30;
export const ITEM_VERY_FAR_SIM_DISTANCE = 54;
export const VILLAGE_REGION_CHUNKS = 6;

export const GAME_MODE = {
  SURVIVAL: "survival",
  CREATIVE: "creative"
};

export const MULTIPLAYER_ENABLED = true;
export const DEFAULT_MULTIPLAYER_SERVER_URL = (() => {
  const fallback = "ws://localhost:3000";
  const locationRef = globalThis?.location;
  if (!locationRef || locationRef.protocol === "file:") {
    return fallback;
  }
  const hostname = String(locationRef.hostname || "localhost").trim() || "localhost";
  const protocol = locationRef.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${hostname}:3000`;
})();
export const DEFAULT_MULTIPLAYER_STUN_SERVERS = [{
  urls: [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
    "stun:stun2.l.google.com:19302",
    "stun:stun3.l.google.com:19302",
    "stun:stun4.l.google.com:19302"
  ]
}];
export const MULTIPLAYER_PLAYER_SYNC_INTERVAL = 0.08;
export const MULTIPLAYER_WORLD_SYNC_INTERVAL = 0.35;
export const MULTIPLAYER_MAX_MOVE_SPEED = 11.5;
export const MULTIPLAYER_MAX_REACH = 7.5;
export const LEGACY_SAVE_KEYS = [
  `freecube2-static-save-v${STORAGE_NAMESPACE_VERSION}`,
  "freecube2-static-save-v4",
  "freecube2-static-save-v5"
];

export const HOTBAR_SLOTS = 9;
export const INVENTORY_ROWS = 4;
export const INVENTORY_COLS = 9;
export const INVENTORY_SLOTS = INVENTORY_ROWS * INVENTORY_COLS;
export const MAIN_INVENTORY_START = HOTBAR_SLOTS;
export const ARMOR_SLOTS = 4;
export const CRAFT_GRID_SMALL = 4;
export const CRAFT_GRID_LARGE = 9;
