import { createGameplayData } from "./scripts/game-data.js";
import { hash4, random2, random3, createSeededRng, PerlinNoise, FractalNoise, ValueNoise3D, FractalNoise3D } from "./scripts/noise.js";
import { createWorldModule } from "./scripts/world.js";
import { BrowserInput } from "./scripts/input.js";
import { normalizeAssetPath, createResourcePackSupport, createResourcePackRuntime } from "./scripts/resource-packs.js";
import {
  AUTOSAVE_INTERVAL_SECONDS,
  ARMOR_SLOTS,
  BLOCK_TICK_STEP_SECONDS,
  CHUNK_SIZE,
  CRAFT_GRID_LARGE,
  CRAFT_GRID_SMALL,
  DEFAULT_GAMERULES,
  DEFAULT_MULTIPLAYER_SERVER_URL,
  DEFAULT_MULTIPLAYER_STUN_SERVERS,
  DEFAULT_RENDER_DISTANCE,
  DEFAULT_SETTINGS,
  GAME_EXPORT_SLUG,
  GAME_MODE,
  GAME_SHORT_TITLE,
  GAME_STORAGE_SLUG,
  GAME_TITLE,
  GAME_VERSION,
  GLOBAL_SETTINGS_KEY,
  HOTBAR_SLOTS,
  INVENTORY_SLOTS,
  ITEM_FAR_SIM_DISTANCE,
  ITEM_MERGE_RADIUS,
  ITEM_MAX_PER_CHUNK,
  ITEM_VERY_FAR_SIM_DISTANCE,
  LAVA_LEVEL,
  LAVA_FLOW_TICK_SECONDS,
  LEGACY_SAVE_KEYS,
  LIGHT_LEVEL_MAX,
  LOADING_CHUNK_GEN_BUDGET_MS,
  LOADING_CHUNK_GEN_LIMIT,
  LOADING_CHUNK_MESH_BUDGET_MS,
  LOADING_CHUNK_MESH_LIMIT,
  MAIN_INVENTORY_START,
  MAX_BLOCK_TICK_STEPS_PER_FRAME,
  MAX_LAVA_FLOW_LEVEL,
  MAX_REACH,
  MAX_WATER_FLOW_LEVEL,
  MINECRAFT_DAY_LENGTH_SECONDS,
  MULTIPLAYER_ENABLED,
  MULTIPLAYER_MAX_MOVE_SPEED,
  MULTIPLAYER_MAX_REACH,
  MULTIPLAYER_PLAYER_SYNC_INTERVAL,
  MULTIPLAYER_WORLD_SYNC_INTERVAL,
  PERFORMANCE_PRESETS,
  PISTON_PUSH_LIMIT,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAY_CHUNK_GEN_BUDGET_MS,
  PLAY_CHUNK_GEN_LIMIT,
  PLAY_CHUNK_MESH_BUDGET_MS,
  PLAY_CHUNK_MESH_LIMIT,
  RANDOM_BLOCK_TICK_INTERVAL,
  RANDOM_BLOCK_TICKS_PER_STEP,
  REDSTONE_MAX_SIGNAL,
  REDSTONE_REPEATER_DELAY_STEPS,
  REDSTONE_REPEATER_MAX_DELAY,
  REDSTONE_REPEATER_MIN_DELAY,
  REDSTONE_SCHEDULE_LIMIT_PER_STEP,
  REDSTONE_UPDATE_LIMIT_PER_STEP,
  SEA_LEVEL,
  STORAGE_KEY,
  STORAGE_NAMESPACE_VERSION,
  TARGET_SCAN_INTERVAL_SECONDS,
  TORCH_LIGHT_LEVEL,
  WATER_FLOW_TICK_SECONDS,
  WEATHER_TYPES,
  WORLD_HEIGHT,
  getPerformancePresetConfig,
  getPerformancePresetLabel
} from "./scripts/game-runtime-config.js";
import {
  buildWeatherParticlePass,
  createWeatherState,
  getColumnPrecipitationType,
  getDayCycleInfo,
  getEffectiveDaylight,
  getRandomWeatherDurationSeconds,
  getTimeSecondsFromMinecraftTicks,
  getWeatherBaseIntensity,
  getWeatherLabel,
  getWeatherSkyDarkness,
  getWorldTimePreset,
  isNightTime,
  normalizeGamerules,
  normalizeSavedWorldState,
  normalizeSpawnPoint,
  normalizeWeatherType,
  normalizeWorldTimeSeconds
} from "./scripts/game-weather.js";
import { buildChunkLoadList, getChunkLoadOffsets } from "./scripts/chunk-loading.js";
import { createRuntimeAssets } from "./scripts/runtime-assets.js";
import { createMusicRuntime } from "./scripts/music-runtime.js";
import { createChatRuntime } from "./scripts/chat-runtime.js";
import { createSleepRuntime } from "./scripts/sleep-runtime.js";
import { createTradingRuntime } from "./scripts/trading-runtime.js";
import { createGameRegistry } from "./scripts/game-registry.js";
import { createBlockInteractionsRuntime } from "./scripts/block-interactions-runtime.js";
import { createCombatRuntime } from "./scripts/combat-runtime.js";
import { createCommandRuntime } from "./scripts/command-runtime.js";
import { createWebGLCore } from "./scripts/webgl-core.js";
import { createWebglRuntime } from "./scripts/webgl-runtime.js";
import { createPlayerPreviewRuntime } from "./scripts/player-preview-runtime.js";
import { createEntityRuntime } from "./scripts/entity-runtime.js";
import { createCanvasRendererRuntime } from "./scripts/canvas-renderer.js";
import { createWebGLRendererRuntime } from "./scripts/webgl-renderer.js";
import {
  PLAYER_SKIN_PRESETS,
  buildPlayerBillboardCanvas,
  getCustomPlayerSkinCanvas,
  getDefaultPlayerSkinCanvas,
  getPlayerSkinModel,
  getPresetPlayerSkinCanvas,
  getSelectedPlayerSkinCanvas,
  getSelectedPlayerSkinLabel,
  getSkinBoxFaceRects,
  getSkinRectUvQuad,
  isValidPlayerSkinPreset,
  readPlayerSkinFile,
  setPlayerSkinRefreshHandler
} from "./scripts/player-skin-runtime.js";
import {
  clamp,
  downloadTextFile,
  generateId,
  generateRandomWorldSeed,
  getWebSocketURL,
  lerp,
  makeSafeFileName,
  mixRgb,
  mod,
  packBlockPositionKey,
  packChunkKey,
  packLocalKey,
  rgba,
  rgb,
  scaleRgb,
  normalizeWorldSeed,
  unpackLocalKey
} from "./scripts/core-utils.js";
import { createRedstoneRuntime } from "./scripts/redstone.js";
import { createStorageRuntime } from "./scripts/storage.js";
import {
  buildManualLanRoomCode,
  decodeMultiplayerSignalPayload,
  encodeMultiplayerSignalPayload,
  readManualMultiplayerCode,
  showManualMultiplayerCode,
  waitForIceGatheringComplete
} from "./scripts/manual-multiplayer-signal.js";

const VILLAGE_REGION_CHUNKS = 6;

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
  FURNACE: 13,
  COAL_ORE: 14,
  IRON_ORE: 15,
  GOLD_ORE: 16,
  DIAMOND_ORE: 17,
  REDSTONE_ORE: 18,
  EMERALD_ORE: 19,
  LAVA: 20,
  COBBLESTONE: 21,
  OBSIDIAN: 22,
  TORCH: 23,
  WHITE_WOOL: 24,
  BED: 25,
  REDSTONE_WIRE: 69,
  LEVER: 70,
  REDSTONE_TORCH: 71,
  REPEATER: 72,
  PISTON: 73,
  STICKY_PISTON: 74,
  PISTON_HEAD: 75
};

const {
  REDSTONE_DIRECTIONS,
  REDSTONE_HORIZONTAL_FACINGS,
  REDSTONE_NEIGHBOR_OFFSETS,
  cloneRedstoneState,
  isRedstoneWireBlock,
  isLeverBlock,
  isRedstoneTorchBlock,
  isRepeaterBlock,
  isPistonBaseBlock,
  isPistonHeadBlock,
  usesRedstoneState,
  isRedstoneRelevantBlock,
  getOppositeFacing,
  getFacingVector,
  normalizeHorizontalFacing,
  getFacingFromYaw,
  buildDefaultRedstoneState,
  normalizeSerializedRedstoneState
} = createRedstoneRuntime({
  block: BLOCK,
  clamp,
  redstoneMaxSignal: REDSTONE_MAX_SIGNAL,
  redstoneRepeaterMinDelay: REDSTONE_REPEATER_MIN_DELAY,
  redstoneRepeaterMaxDelay: REDSTONE_REPEATER_MAX_DELAY
});

const ITEM = {
  STICK: 32,
  WOODEN_PICKAXE: 33,
  WOODEN_AXE: 34,
  WOODEN_SHOVEL: 35,
  WOODEN_SWORD: 36,
  WOODEN_HOE: 37,
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
  ROTTEN_FLESH: 52,
  COAL: 53,
  DIAMOND: 54,
  EMERALD: 55,
  REDSTONE_DUST: 56,
  IRON_INGOT: 57,
  GOLD_INGOT: 58,
  IRON_PICKAXE: 59,
  IRON_AXE: 60,
  IRON_SHOVEL: 61,
  IRON_SWORD: 62,
  IRON_HOE: 63,
  DIAMOND_PICKAXE: 64,
  DIAMOND_AXE: 65,
  DIAMOND_SHOVEL: 66,
  DIAMOND_SWORD: 67,
  DIAMOND_HOE: 68
};

const BLOCK_BREAK_TIME = {
  [BLOCK.GRASS]: 0.45,
  [BLOCK.DIRT]: 0.5,
  [BLOCK.SAND]: 0.45,
  [BLOCK.STONE]: 1.4,
  [BLOCK.COAL_ORE]: 1.65,
  [BLOCK.IRON_ORE]: 1.8,
  [BLOCK.GOLD_ORE]: 1.95,
  [BLOCK.DIAMOND_ORE]: 2.2,
  [BLOCK.REDSTONE_ORE]: 2.05,
  [BLOCK.EMERALD_ORE]: 2.25,
  [BLOCK.COBBLESTONE]: 1.6,
  [BLOCK.OBSIDIAN]: 8.5,
  [BLOCK.TORCH]: 0.12,
  [BLOCK.WHITE_WOOL]: 0.52,
  [BLOCK.BED]: 0.42,
  [BLOCK.REDSTONE_WIRE]: 0.05,
  [BLOCK.LEVER]: 0.12,
  [BLOCK.REDSTONE_TORCH]: 0.12,
  [BLOCK.REPEATER]: 0.15,
  [BLOCK.PISTON]: 0.72,
  [BLOCK.STICKY_PISTON]: 0.76,
  [BLOCK.PISTON_HEAD]: 0.05,
  [BLOCK.WOOD]: 1.05,
  [BLOCK.PLANKS]: 0.85,
  [BLOCK.CRAFTING_TABLE]: 0.95,
  [BLOCK.FURNACE]: 1.25,
  [BLOCK.LEAVES]: 0.2,
  [BLOCK.BRICK]: 1.9,
  [BLOCK.GLASS]: 0.28,
  [BLOCK.WATER]: Infinity,
  [BLOCK.LAVA]: Infinity,
  [BLOCK.BEDROCK]: Infinity
};

function getBreakTime(blockType) {
  const t = BLOCK_BREAK_TIME[blockType];
  return Number.isFinite(t) ? Math.max(0.08, t) : 0.8;
}

function isFluidBlock(blockType) {
  return blockType === BLOCK.WATER || blockType === BLOCK.LAVA;
}

const {
  LEGACY_GLOBAL_SETTINGS_KEYS,
  WORLD_EXPORT_FORMAT,
  WORLD_EXPORT_FORMAT_VERSION,
  serializeChunkSnapshots,
  deserializeChunkSnapshots,
  getFirstStoredValue,
  getStoredCubeCraftUsername,
  normalizeCubeCraftUsername,
  setStoredCubeCraftUsername,
  serializeModifiedChunks,
  deserializeModifiedChunks,
  serializeFluidStates,
  deserializeFluidStates,
  serializeRedstoneStates,
  deserializeRedstoneStates,
  serializeFurnaceStates,
  deserializeFurnaceStates,
  WorldStore
} = createStorageRuntime({
  gameStorageSlug: GAME_STORAGE_SLUG,
  storageNamespaceVersion: STORAGE_NAMESPACE_VERSION,
  gameExportSlug: GAME_EXPORT_SLUG,
  gameVersion: GAME_VERSION,
  worldHeight: WORLD_HEIGHT,
  chunkSize: CHUNK_SIZE,
  maxWaterFlowLevel: MAX_WATER_FLOW_LEVEL,
  legacySaveKeys: LEGACY_SAVE_KEYS,
  generateId,
  generateRandomWorldSeed,
  normalizeWorldSeed,
  clamp,
  isFluidBlock,
  usesRedstoneState,
  normalizeSerializedRedstoneState
});

function getToolBreakMultiplier(itemType, blockType) {
  const tool = getItemToolType(itemType);
  if (!tool) {
    return 1;
  }
  const tier = clamp(Number(getItemInfo(itemType)?.tier) || 1, 1, 3);
  const tierBoost = tier === 3 ? 1.75 : tier === 2 ? 1.35 : 1;
  if (tool === "shovel" && (blockType === BLOCK.DIRT || blockType === BLOCK.GRASS || blockType === BLOCK.SAND)) {
    return 2.4 * tierBoost;
  }
  if (tool === "axe" && (blockType === BLOCK.WOOD || blockType === BLOCK.PLANKS || blockType === BLOCK.CRAFTING_TABLE)) {
    return 2.2 * tierBoost;
  }
  if (
    tool === "pickaxe" &&
    (
      blockType === BLOCK.STONE ||
      blockType === BLOCK.BRICK ||
      blockType === BLOCK.FURNACE ||
      blockType === BLOCK.COBBLESTONE ||
      blockType === BLOCK.OBSIDIAN ||
      blockType === BLOCK.COAL_ORE ||
      blockType === BLOCK.IRON_ORE ||
      blockType === BLOCK.GOLD_ORE ||
      blockType === BLOCK.DIAMOND_ORE ||
      blockType === BLOCK.REDSTONE_ORE ||
      blockType === BLOCK.EMERALD_ORE
    )
  ) {
    return 2.6 * tierBoost;
  }
  if (tool === "sword" && blockType === BLOCK.LEAVES) {
    return 2 * tierBoost;
  }
  return 1;
}

function getToolTier(itemType) {
  if (!getItemToolType(itemType)) {
    return 0;
  }
  return clamp(Number(getItemInfo(itemType)?.tier) || 1, 1, 3);
}

function getRequiredToolForBlock(blockType) {
  switch (blockType) {
    case BLOCK.STONE:
    case BLOCK.COBBLESTONE:
    case BLOCK.BRICK:
    case BLOCK.FURNACE:
    case BLOCK.COAL_ORE:
      return { tool: "pickaxe", tier: 1 };
    case BLOCK.IRON_ORE:
    case BLOCK.GOLD_ORE:
    case BLOCK.REDSTONE_ORE:
    case BLOCK.DIAMOND_ORE:
    case BLOCK.EMERALD_ORE:
      return { tool: "pickaxe", tier: 2 };
    case BLOCK.OBSIDIAN:
      return { tool: "pickaxe", tier: 3 };
    default:
      return null;
  }
}

function canHarvestBlock(itemType, blockType) {
  const requirement = getRequiredToolForBlock(blockType);
  if (!requirement) {
    return true;
  }
  return getItemToolType(itemType) === requirement.tool && getToolTier(itemType) >= requirement.tier;
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
  [BLOCK.LAVA]: {
    name: "Lava",
    collidable: false,
    transparent: true,
    alpha: 0.72,
    palette: {
      top: rgb(255, 142, 40),
      side: rgb(224, 92, 22),
      bottom: rgb(168, 46, 16)
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
  },
  [BLOCK.COAL_ORE]: {
    name: "Coal Ore",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(123, 127, 135),
      side: rgb(112, 116, 124),
      bottom: rgb(94, 97, 104)
    }
  },
  [BLOCK.IRON_ORE]: {
    name: "Iron Ore",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(151, 129, 112),
      side: rgb(135, 116, 102),
      bottom: rgb(112, 97, 88)
    }
  },
  [BLOCK.GOLD_ORE]: {
    name: "Gold Ore",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(176, 154, 86),
      side: rgb(160, 139, 77),
      bottom: rgb(133, 116, 65)
    }
  },
  [BLOCK.DIAMOND_ORE]: {
    name: "Diamond Ore",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(92, 182, 196),
      side: rgb(78, 162, 176),
      bottom: rgb(64, 135, 146)
    }
  },
  [BLOCK.REDSTONE_ORE]: {
    name: "Redstone Ore",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(176, 74, 74),
      side: rgb(156, 62, 62),
      bottom: rgb(130, 48, 48)
    }
  },
  [BLOCK.EMERALD_ORE]: {
    name: "Emerald Ore",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(74, 182, 122),
      side: rgb(60, 160, 105),
      bottom: rgb(48, 132, 86)
    }
  },
  [BLOCK.COBBLESTONE]: {
    name: "Cobblestone",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(123, 126, 132),
      side: rgb(111, 114, 120),
      bottom: rgb(92, 95, 101)
    }
  },
  [BLOCK.OBSIDIAN]: {
    name: "Obsidian",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(53, 34, 78),
      side: rgb(42, 26, 64),
      bottom: rgb(31, 20, 47)
    }
  },
  [BLOCK.TORCH]: {
    name: "Torch",
    collidable: false,
    transparent: true,
    alpha: 1,
    palette: {
      top: rgb(255, 205, 92),
      side: rgb(194, 124, 48),
      bottom: rgb(120, 82, 34)
    }
  },
  [BLOCK.WHITE_WOOL]: {
    name: "White Wool",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(232, 232, 232),
      side: rgb(216, 216, 216),
      bottom: rgb(198, 198, 198)
    }
  },
  [BLOCK.BED]: {
    name: "Bed",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(196, 46, 46),
      side: rgb(154, 88, 58),
      bottom: rgb(118, 72, 44)
    }
  },
  [BLOCK.REDSTONE_WIRE]: {
    name: "Redstone Wire",
    collidable: false,
    transparent: true,
    alpha: 1,
    palette: {
      top: rgb(196, 42, 42),
      side: rgb(130, 28, 28),
      bottom: rgb(90, 18, 18)
    }
  },
  [BLOCK.LEVER]: {
    name: "Lever",
    collidable: false,
    transparent: true,
    alpha: 1,
    palette: {
      top: rgb(182, 182, 182),
      side: rgb(132, 132, 132),
      bottom: rgb(96, 96, 96)
    }
  },
  [BLOCK.REDSTONE_TORCH]: {
    name: "Redstone Torch",
    collidable: false,
    transparent: true,
    alpha: 1,
    palette: {
      top: rgb(255, 94, 94),
      side: rgb(188, 58, 58),
      bottom: rgb(122, 34, 34)
    }
  },
  [BLOCK.REPEATER]: {
    name: "Repeater",
    collidable: false,
    transparent: true,
    alpha: 1,
    palette: {
      top: rgb(214, 214, 214),
      side: rgb(164, 164, 164),
      bottom: rgb(118, 118, 118)
    }
  },
  [BLOCK.PISTON]: {
    name: "Piston",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(160, 134, 94),
      side: rgb(124, 112, 96),
      bottom: rgb(96, 96, 96)
    }
  },
  [BLOCK.STICKY_PISTON]: {
    name: "Sticky Piston",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(116, 168, 94),
      side: rgb(112, 122, 96),
      bottom: rgb(96, 96, 96)
    }
  },
  [BLOCK.PISTON_HEAD]: {
    name: "Piston Head",
    collidable: true,
    transparent: false,
    alpha: 1,
    palette: {
      top: rgb(182, 156, 112),
      side: rgb(128, 118, 100),
      bottom: rgb(104, 104, 104)
    }
  }
};

const TORCH_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="none"/>
    <rect x="7" y="5" width="2" height="8" fill="#7a4d1f"/>
    <rect x="6" y="4" width="4" height="2" fill="#c78335"/>
    <rect x="5" y="2" width="6" height="3" fill="#ffd66c"/>
    <rect x="6" y="1" width="4" height="2" fill="#fff1a8"/>
  </svg>
`)}`;
const WHITE_WOOL_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#dadada"/>
    <rect x="0" y="0" width="16" height="4" fill="#efefef"/>
    <rect x="0" y="4" width="16" height="4" fill="#dedede"/>
    <rect x="0" y="8" width="16" height="4" fill="#d2d2d2"/>
    <rect x="0" y="12" width="16" height="4" fill="#c6c6c6"/>
    <rect x="2" y="2" width="4" height="2" fill="#f7f7f7"/>
    <rect x="9" y="5" width="5" height="2" fill="#ebebeb"/>
    <rect x="3" y="10" width="6" height="2" fill="#e3e3e3"/>
    <rect x="10" y="12" width="4" height="2" fill="#d8d8d8"/>
  </svg>
`)}`;
const BED_TOP_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#8e4f2c"/>
    <rect x="0" y="0" width="7" height="16" fill="#f4f4f4"/>
    <rect x="7" y="0" width="9" height="16" fill="#bf3131"/>
    <rect x="0" y="0" width="16" height="2" fill="#fefefe" opacity="0.45"/>
    <rect x="0" y="13" width="16" height="3" fill="#6f3e22"/>
    <rect x="2" y="3" width="3" height="8" fill="#ffffff"/>
    <rect x="9" y="3" width="5" height="8" fill="#d84343"/>
    <rect x="8" y="11" width="7" height="2" fill="#962626"/>
  </svg>
`)}`;
const BED_SIDE_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#7a4728"/>
    <rect x="0" y="0" width="16" height="4" fill="#c43a3a"/>
    <rect x="0" y="4" width="16" height="2" fill="#e15a5a"/>
    <rect x="0" y="6" width="16" height="5" fill="#915c36"/>
    <rect x="0" y="11" width="3" height="5" fill="#5f351f"/>
    <rect x="13" y="11" width="3" height="5" fill="#5f351f"/>
    <rect x="3" y="11" width="10" height="2" fill="#744225"/>
  </svg>
`)}`;
const BED_BOTTOM_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#7a4728"/>
    <rect x="0" y="0" width="16" height="2" fill="#95603b"/>
    <rect x="1" y="2" width="14" height="12" fill="#84512f"/>
    <rect x="0" y="14" width="16" height="2" fill="#60361f"/>
  </svg>
`)}`;
const REDSTONE_WIRE_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#331010"/>
    <rect x="0" y="7" width="16" height="2" fill="#8c1f1f"/>
    <rect x="7" y="0" width="2" height="16" fill="#8c1f1f"/>
    <rect x="2" y="7" width="12" height="2" fill="#d93e3e"/>
    <rect x="7" y="2" width="2" height="12" fill="#d93e3e"/>
    <rect x="6" y="6" width="4" height="4" fill="#ff9d9d"/>
  </svg>
`)}`;
const LEVER_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#777777"/>
    <rect x="2" y="10" width="12" height="4" fill="#a5a5a5"/>
    <rect x="4" y="8" width="8" height="2" fill="#d8d8d8"/>
    <rect x="7" y="2" width="2" height="8" fill="#7f5729"/>
    <rect x="6" y="1" width="4" height="2" fill="#e7d8b8"/>
  </svg>
`)}`;
const REDSTONE_TORCH_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="none"/>
    <rect x="7" y="5" width="2" height="8" fill="#6b3a26"/>
    <rect x="6" y="4" width="4" height="2" fill="#8f4234"/>
    <rect x="5" y="2" width="6" height="3" fill="#cf3232"/>
    <rect x="6" y="1" width="4" height="2" fill="#ff8e8e"/>
  </svg>
`)}`;
const REPEATER_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#bdbdbd"/>
    <rect x="1" y="1" width="14" height="14" fill="#d8d8d8"/>
    <rect x="4" y="3" width="2" height="4" fill="#a22424"/>
    <rect x="10" y="3" width="2" height="4" fill="#a22424"/>
    <rect x="5" y="9" width="6" height="2" fill="#be2f2f"/>
    <rect x="11" y="8" width="3" height="4" fill="#6e6e6e"/>
    <rect x="13" y="7" width="2" height="6" fill="#8e8e8e"/>
  </svg>
`)}`;
const PISTON_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#747474"/>
    <rect x="0" y="0" width="16" height="4" fill="#c5ab79"/>
    <rect x="0" y="4" width="16" height="3" fill="#9b855d"/>
    <rect x="0" y="7" width="16" height="9" fill="#8a8a8a"/>
    <rect x="2" y="9" width="12" height="5" fill="#686868"/>
    <rect x="5" y="4" width="6" height="2" fill="#d7c59f"/>
  </svg>
`)}`;
const STICKY_PISTON_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#747474"/>
    <rect x="0" y="0" width="16" height="4" fill="#6dbb56"/>
    <rect x="0" y="4" width="16" height="3" fill="#a5d68a"/>
    <rect x="0" y="7" width="16" height="9" fill="#8a8a8a"/>
    <rect x="2" y="9" width="12" height="5" fill="#686868"/>
    <rect x="5" y="4" width="6" height="2" fill="#d7f1c4"/>
  </svg>
`)}`;
const PISTON_HEAD_TEXTURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
    <rect width="16" height="16" fill="#8d8d8d"/>
    <rect x="0" y="0" width="16" height="6" fill="#d1b582"/>
    <rect x="4" y="6" width="8" height="10" fill="#7a7a7a"/>
    <rect x="5" y="8" width="6" height="6" fill="#606060"/>
  </svg>
`)}`;

const BLOCK_TEXTURE_PATHS = {
  [BLOCK.GRASS]: {
    top: "assets/PNG/Tiles/grass_top.png",
    side: "assets/PNG/Tiles/dirt_grass.png",
    bottom: "assets/PNG/Tiles/dirt.png"
  },
  [BLOCK.DIRT]: {
    top: "assets/PNG/Tiles/dirt.png",
    side: "assets/PNG/Tiles/dirt.png",
    bottom: "assets/PNG/Tiles/dirt.png"
  },
  [BLOCK.STONE]: {
    top: "assets/PNG/Tiles/stone.png",
    side: "assets/PNG/Tiles/stone.png",
    bottom: "assets/PNG/Tiles/stone.png"
  },
  [BLOCK.WOOD]: {
    top: "assets/PNG/Tiles/trunk_top.png",
    side: "assets/PNG/Tiles/trunk_side.png",
    bottom: "assets/PNG/Tiles/trunk_top.png"
  },
  [BLOCK.LEAVES]: {
    top: "assets/PNG/Tiles/leaves.png",
    side: "assets/PNG/Tiles/leaves.png",
    bottom: "assets/PNG/Tiles/leaves.png"
  },
  [BLOCK.WATER]: {
    top: "assets/PNG/Tiles/water.png",
    side: "assets/PNG/Tiles/water.png",
    bottom: "assets/PNG/Tiles/water.png"
  },
  [BLOCK.LAVA]: {
    top: "assets/PNG/Tiles/lava.png",
    side: "assets/PNG/Tiles/lava.png",
    bottom: "assets/PNG/Tiles/lava.png"
  },
  [BLOCK.SAND]: {
    top: "assets/PNG/Tiles/sand.png",
    side: "assets/PNG/Tiles/sand.png",
    bottom: "assets/PNG/Tiles/sand.png"
  },
  [BLOCK.PLANKS]: {
    top: "assets/PNG/Tiles/wood.png",
    side: "assets/PNG/Tiles/wood.png",
    bottom: "assets/PNG/Tiles/wood.png"
  },
  [BLOCK.BRICK]: {
    top: "assets/PNG/Tiles/brick_red.png",
    side: "assets/PNG/Tiles/brick_red.png",
    bottom: "assets/PNG/Tiles/brick_red.png"
  },
  [BLOCK.BEDROCK]: {
    top: "assets/PNG/Tiles/greystone.png",
    side: "assets/PNG/Tiles/greystone.png",
    bottom: "assets/PNG/Tiles/greystone.png"
  },
  [BLOCK.GLASS]: {
    top: "assets/PNG/Tiles/glass.png",
    side: "assets/PNG/Tiles/glass.png",
    bottom: "assets/PNG/Tiles/glass.png"
  },
  [BLOCK.CRAFTING_TABLE]: {
    top: "assets/PNG/Tiles/table.png",
    side: "assets/PNG/Tiles/table.png",
    bottom: "assets/PNG/Tiles/table.png"
  },
  [BLOCK.FURNACE]: {
    top: "assets/PNG/Tiles/oven.png",
    side: "assets/PNG/Tiles/oven.png",
    bottom: "assets/PNG/Tiles/oven.png"
  },
  [BLOCK.COAL_ORE]: {
    top: "assets/PNG/Tiles/stone_coal.png",
    side: "assets/PNG/Tiles/stone_coal.png",
    bottom: "assets/PNG/Tiles/stone_coal.png"
  },
  [BLOCK.IRON_ORE]: {
    top: "assets/PNG/Tiles/stone_iron.png",
    side: "assets/PNG/Tiles/stone_iron.png",
    bottom: "assets/PNG/Tiles/stone_iron.png"
  },
  [BLOCK.GOLD_ORE]: {
    top: "assets/PNG/Tiles/stone_gold.png",
    side: "assets/PNG/Tiles/stone_gold.png",
    bottom: "assets/PNG/Tiles/stone_gold.png"
  },
  [BLOCK.DIAMOND_ORE]: {
    top: "assets/PNG/Tiles/stone_diamond.png",
    side: "assets/PNG/Tiles/stone_diamond.png",
    bottom: "assets/PNG/Tiles/stone_diamond.png"
  },
  [BLOCK.REDSTONE_ORE]: {
    top: "assets/PNG/Tiles/redstone.png",
    side: "assets/PNG/Tiles/redstone.png",
    bottom: "assets/PNG/Tiles/redstone.png"
  },
  [BLOCK.EMERALD_ORE]: {
    top: "assets/PNG/Tiles/redstone_emerald.png",
    side: "assets/PNG/Tiles/redstone_emerald.png",
    bottom: "assets/PNG/Tiles/redstone_emerald.png"
  },
  [BLOCK.COBBLESTONE]: {
    top: "assets/PNG/Tiles/gravel_stone.png",
    side: "assets/PNG/Tiles/gravel_stone.png",
    bottom: "assets/PNG/Tiles/gravel_stone.png"
  },
  [BLOCK.OBSIDIAN]: {
    top: "assets/32px Seamless MC Texture Gigantopack/all textures/obsidian.png",
    side: "assets/32px Seamless MC Texture Gigantopack/all textures/obsidian.png",
    bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/obsidian.png"
  },
  [BLOCK.TORCH]: {
    top: TORCH_TEXTURE_SOURCE,
    side: TORCH_TEXTURE_SOURCE,
    bottom: TORCH_TEXTURE_SOURCE
  },
  [BLOCK.WHITE_WOOL]: {
    top: WHITE_WOOL_TEXTURE_SOURCE,
    side: WHITE_WOOL_TEXTURE_SOURCE,
    bottom: WHITE_WOOL_TEXTURE_SOURCE
  },
  [BLOCK.BED]: {
    top: BED_TOP_TEXTURE_SOURCE,
    side: BED_SIDE_TEXTURE_SOURCE,
    bottom: BED_BOTTOM_TEXTURE_SOURCE
  },
  [BLOCK.REDSTONE_WIRE]: {
    top: REDSTONE_WIRE_TEXTURE_SOURCE,
    side: REDSTONE_WIRE_TEXTURE_SOURCE,
    bottom: REDSTONE_WIRE_TEXTURE_SOURCE
  },
  [BLOCK.LEVER]: {
    top: LEVER_TEXTURE_SOURCE,
    side: LEVER_TEXTURE_SOURCE,
    bottom: LEVER_TEXTURE_SOURCE
  },
  [BLOCK.REDSTONE_TORCH]: {
    top: REDSTONE_TORCH_TEXTURE_SOURCE,
    side: REDSTONE_TORCH_TEXTURE_SOURCE,
    bottom: REDSTONE_TORCH_TEXTURE_SOURCE
  },
  [BLOCK.REPEATER]: {
    top: REPEATER_TEXTURE_SOURCE,
    side: REPEATER_TEXTURE_SOURCE,
    bottom: REPEATER_TEXTURE_SOURCE
  },
  [BLOCK.PISTON]: {
    top: PISTON_TEXTURE_SOURCE,
    side: PISTON_TEXTURE_SOURCE,
    bottom: PISTON_TEXTURE_SOURCE
  },
  [BLOCK.STICKY_PISTON]: {
    top: STICKY_PISTON_TEXTURE_SOURCE,
    side: STICKY_PISTON_TEXTURE_SOURCE,
    bottom: STICKY_PISTON_TEXTURE_SOURCE
  },
  [BLOCK.PISTON_HEAD]: {
    top: PISTON_HEAD_TEXTURE_SOURCE,
    side: PISTON_HEAD_TEXTURE_SOURCE,
    bottom: PISTON_HEAD_TEXTURE_SOURCE
  }
};

const TEXTURE_PACKS = {
  default: {},
  gigantopack32: {
    [BLOCK.GRASS]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/grass_top (13).png",
      side: "assets/PNG/Tiles/dirt_grass.png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/dirt4.png"
    },
    [BLOCK.DIRT]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/dirt4.png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/dirt4.png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/dirt4.png"
    },
    [BLOCK.STONE]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/stone (45).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/stone (45).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/stone (45).png"
    },
    [BLOCK.WOOD]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/log_oak_top (45).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/log_oak (46).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/log_oak_top (45).png"
    },
    [BLOCK.LEAVES]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/leaves_oak_opaque.png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/leaves_oak_opaque.png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/leaves_oak_opaque.png"
    },
    [BLOCK.WATER]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/water_still (12).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/water_still (12).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/water_still (12).png"
    },
    [BLOCK.LAVA]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/lava_still (12).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/lava_still (12).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/lava_still (12).png"
    },
    [BLOCK.SAND]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/sand (7).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/sand (7).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/sand (7).png"
    },
    [BLOCK.PLANKS]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/planks_oak (35).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/planks_oak (35).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/planks_oak (35).png"
    },
    [BLOCK.BRICK]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/brick.png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/brick.png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/brick.png"
    },
    [BLOCK.BEDROCK]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/bedrock.png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/bedrock.png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/bedrock.png"
    },
    [BLOCK.GLASS]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/glass_light_blue.png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/glass_light_blue.png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/glass_light_blue.png"
    },
    [BLOCK.CRAFTING_TABLE]: {
      top: "assets/PNG/Tiles/table.png",
      side: "assets/PNG/Tiles/table.png",
      bottom: "assets/PNG/Tiles/table.png"
    },
    [BLOCK.FURNACE]: {
      top: "assets/PNG/Tiles/oven.png",
      side: "assets/PNG/Tiles/oven.png",
      bottom: "assets/PNG/Tiles/oven.png"
    },
    [BLOCK.COAL_ORE]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/coal_ore (52).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/coal_ore (52).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/coal_ore (52).png"
    },
    [BLOCK.IRON_ORE]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/iron_ore (52).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/iron_ore (52).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/iron_ore (52).png"
    },
    [BLOCK.GOLD_ORE]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/gold_ore (35).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/gold_ore (35).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/gold_ore (35).png"
    },
    [BLOCK.DIAMOND_ORE]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/diamond_ore (23).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/diamond_ore (23).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/diamond_ore (23).png"
    },
    [BLOCK.REDSTONE_ORE]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/redstone_ore (34).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/redstone_ore (34).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/redstone_ore (34).png"
    },
    [BLOCK.EMERALD_ORE]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/emerald_ore (16).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/emerald_ore (16).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/emerald_ore (16).png"
    },
    [BLOCK.COBBLESTONE]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/cobblestone.png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/cobblestone.png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/cobblestone.png"
    },
    [BLOCK.OBSIDIAN]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/obsidian.png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/obsidian.png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/obsidian.png"
    },
    [BLOCK.WHITE_WOOL]: {
      top: "assets/32px Seamless MC Texture Gigantopack/all textures/wool_colored_white (48).png",
      side: "assets/32px Seamless MC Texture Gigantopack/all textures/wool_colored_white (48).png",
      bottom: "assets/32px Seamless MC Texture Gigantopack/all textures/wool_colored_white (48).png"
    },
    [BLOCK.BED]: {
      top: BED_TOP_TEXTURE_SOURCE,
      side: BED_SIDE_TEXTURE_SOURCE,
      bottom: BED_BOTTOM_TEXTURE_SOURCE
    }
  },
  "mcassets-online": {
    [BLOCK.CRAFTING_TABLE]: {
      top: "assets/online/mc-assets/blocks/crafting_table_top.png",
      side: "assets/online/mc-assets/blocks/crafting_table_side.png",
      bottom: "assets/online/mc-assets/blocks/oak_planks.png"
    },
    [BLOCK.FURNACE]: {
      top: "assets/online/mc-assets/blocks/furnace_top.png",
      side: "assets/online/mc-assets/blocks/furnace_side.png",
      bottom: "assets/online/mc-assets/blocks/furnace_front.png"
    },
    [BLOCK.BED]: {
      top: "assets/online/mc-assets/blocks/bed_top.png",
      side: "assets/online/mc-assets/blocks/bed_side.png",
      bottom: "assets/online/mc-assets/blocks/bed_bottom.png"
    },
    [BLOCK.PISTON]: {
      top: "assets/online/mc-assets/blocks/piston_top.png",
      side: "assets/online/mc-assets/blocks/piston_side.png",
      bottom: "assets/online/mc-assets/blocks/piston_bottom.png"
    },
    [BLOCK.STICKY_PISTON]: {
      top: "assets/online/mc-assets/blocks/sticky_piston_top.png",
      side: "assets/online/mc-assets/blocks/piston_side.png",
      bottom: "assets/online/mc-assets/blocks/piston_bottom.png"
    },
    [BLOCK.PISTON_HEAD]: {
      top: "assets/online/mc-assets/blocks/piston_head_top.png",
      side: "assets/online/mc-assets/blocks/piston_inner.png",
      bottom: "assets/online/mc-assets/blocks/piston_bottom.png"
    }
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
  [ITEM.WOODEN_PICKAXE]: "assets/PNG/Items/pick_bronze.png",
  [ITEM.WOODEN_AXE]: "assets/PNG/Items/axe_bronze.png",
  [ITEM.WOODEN_SHOVEL]: "assets/PNG/Items/shovel_bronze.png",
  [ITEM.WOODEN_SWORD]: "assets/PNG/Items/sword_bronze.png",
  [ITEM.WOODEN_HOE]: "assets/PNG/Items/hoe_bronze.png",
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
  `),
  [ITEM.COAL]: "assets/PNG/Items/ore_coal.png",
  [ITEM.DIAMOND]: "assets/PNG/Items/ore_diamond.png",
  [ITEM.EMERALD]: "assets/PNG/Items/ore_emerald.png",
  [ITEM.IRON_INGOT]: "assets/PNG/Items/ore_iron.png",
  [ITEM.GOLD_INGOT]: "assets/PNG/Items/ore_gold.png",
  [ITEM.IRON_PICKAXE]: "assets/PNG/Items/pick_iron.png",
  [ITEM.IRON_AXE]: "assets/PNG/Items/axe_iron.png",
  [ITEM.IRON_SHOVEL]: "assets/PNG/Items/shovel_iron.png",
  [ITEM.IRON_SWORD]: "assets/PNG/Items/sword_iron.png",
  [ITEM.IRON_HOE]: "assets/PNG/Items/hoe_iron.png",
  [ITEM.DIAMOND_PICKAXE]: "assets/PNG/Items/pick_diamond.png",
  [ITEM.DIAMOND_AXE]: "assets/PNG/Items/axe_diamond.png",
  [ITEM.DIAMOND_SHOVEL]: "assets/PNG/Items/shovel_diamond.png",
  [ITEM.DIAMOND_SWORD]: "assets/PNG/Items/sword_diamond.png",
  [ITEM.DIAMOND_HOE]: "assets/PNG/Items/hoe_diamond.png",
  [ITEM.REDSTONE_DUST]: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" fill="none"/>
      <rect x="6" y="2" width="4" height="2" fill="#ff6b6b"/>
      <rect x="4" y="5" width="3" height="2" fill="#e04b4b"/>
      <rect x="8" y="5" width="4" height="2" fill="#ff5a5a"/>
      <rect x="2" y="8" width="4" height="2" fill="#d43737"/>
      <rect x="6" y="8" width="3" height="2" fill="#ff7070"/>
      <rect x="10" y="8" width="3" height="2" fill="#c72b2b"/>
      <rect x="5" y="11" width="2" height="2" fill="#ef5555"/>
      <rect x="8" y="11" width="3" height="2" fill="#b91f1f"/>
    </svg>
  `)
};

const ResourcePackSupport = createResourcePackSupport({
  gameTitle: GAME_TITLE,
  defaultSettings: DEFAULT_SETTINGS,
  block: BLOCK,
  item: ITEM,
  blockInfo: BLOCK_INFO,
  blockTexturePaths: BLOCK_TEXTURE_PATHS,
  texturePacks: TEXTURE_PACKS,
  itemTextureSources: ITEM_TEXTURE_SOURCES,
  specialTextureSources: {
    torchTextureSource: TORCH_TEXTURE_SOURCE,
    whiteWoolTextureSource: WHITE_WOOL_TEXTURE_SOURCE,
    bedTopTextureSource: BED_TOP_TEXTURE_SOURCE,
    bedSideTextureSource: BED_SIDE_TEXTURE_SOURCE,
    bedBottomTextureSource: BED_BOTTOM_TEXTURE_SOURCE,
    redstoneWireTextureSource: REDSTONE_WIRE_TEXTURE_SOURCE,
    leverTextureSource: LEVER_TEXTURE_SOURCE,
    redstoneTorchTextureSource: REDSTONE_TORCH_TEXTURE_SOURCE,
    repeaterTextureSource: REPEATER_TEXTURE_SOURCE,
    pistonTextureSource: PISTON_TEXTURE_SOURCE,
    stickyPistonTextureSource: STICKY_PISTON_TEXTURE_SOURCE,
    pistonHeadTextureSource: PISTON_HEAD_TEXTURE_SOURCE
  }
});

const {
  RESOURCE_PACK_META,
  CUSTOM_RESOURCE_PACK_PREFIX,
  MC_ASSETS_ONLINE_PACK_ID,
  ONLINE_RESOURCE_PACK_IDS,
  getCustomResourcePacks,
  getCustomResourcePack,
  getAvailableResourcePackNames,
  resolveResourcePackAsset,
  getBlockTextureEntry,
  getBlockTextureCandidates,
  getBlockTexturePath,
  getAllBlockTexturePaths,
  getResourcePackMeta
} = ResourcePackSupport;

const ITEM_INFO = {
  [ITEM.STICK]: { name: "Stick", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.STICK] },
  [ITEM.WOODEN_PICKAXE]: { name: "Wooden Pickaxe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.WOODEN_PICKAXE], tool: "pickaxe" },
  [ITEM.WOODEN_AXE]: { name: "Wooden Axe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.WOODEN_AXE], tool: "axe" },
  [ITEM.WOODEN_SHOVEL]: { name: "Wooden Shovel", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.WOODEN_SHOVEL], tool: "shovel" },
  [ITEM.WOODEN_SWORD]: { name: "Wooden Sword", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.WOODEN_SWORD], tool: "sword" },
  [ITEM.WOODEN_HOE]: { name: "Wooden Hoe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.WOODEN_HOE], tool: "hoe", tier: 1 },
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
  [ITEM.ROTTEN_FLESH]: { name: "Rotten Flesh", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.ROTTEN_FLESH], food: 4 },
  [ITEM.COAL]: { name: "Coal", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.COAL] },
  [ITEM.DIAMOND]: { name: "Diamond", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.DIAMOND] },
  [ITEM.EMERALD]: { name: "Emerald", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.EMERALD] },
  [ITEM.IRON_INGOT]: { name: "Iron Ingot", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_INGOT] },
  [ITEM.GOLD_INGOT]: { name: "Gold Ingot", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.GOLD_INGOT] },
  [ITEM.IRON_PICKAXE]: { name: "Iron Pickaxe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_PICKAXE], tool: "pickaxe", tier: 2 },
  [ITEM.IRON_AXE]: { name: "Iron Axe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_AXE], tool: "axe", tier: 2 },
  [ITEM.IRON_SHOVEL]: { name: "Iron Shovel", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_SHOVEL], tool: "shovel", tier: 2 },
  [ITEM.IRON_SWORD]: { name: "Iron Sword", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_SWORD], tool: "sword", tier: 2 },
  [ITEM.IRON_HOE]: { name: "Iron Hoe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.IRON_HOE], tool: "hoe", tier: 2 },
  [ITEM.DIAMOND_PICKAXE]: { name: "Diamond Pickaxe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.DIAMOND_PICKAXE], tool: "pickaxe", tier: 3 },
  [ITEM.DIAMOND_AXE]: { name: "Diamond Axe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.DIAMOND_AXE], tool: "axe", tier: 3 },
  [ITEM.DIAMOND_SHOVEL]: { name: "Diamond Shovel", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.DIAMOND_SHOVEL], tool: "shovel", tier: 3 },
  [ITEM.DIAMOND_SWORD]: { name: "Diamond Sword", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.DIAMOND_SWORD], tool: "sword", tier: 3 },
  [ITEM.DIAMOND_HOE]: { name: "Diamond Hoe", maxStack: 1, texture: ITEM_TEXTURE_SOURCES[ITEM.DIAMOND_HOE], tool: "hoe", tier: 3 },
  [ITEM.REDSTONE_DUST]: { name: "Redstone Dust", maxStack: 64, texture: ITEM_TEXTURE_SOURCES[ITEM.REDSTONE_DUST], placeBlock: BLOCK.REDSTONE_WIRE }
};

const ITEM_DURABILITY = {
  [ITEM.WOODEN_PICKAXE]: 59,
  [ITEM.WOODEN_AXE]: 59,
  [ITEM.WOODEN_SHOVEL]: 59,
  [ITEM.WOODEN_SWORD]: 59,
  [ITEM.WOODEN_HOE]: 59,
  [ITEM.LEATHER_HELMET]: 55,
  [ITEM.LEATHER_CHESTPLATE]: 80,
  [ITEM.LEATHER_LEGGINGS]: 75,
  [ITEM.LEATHER_BOOTS]: 65,
  [ITEM.IRON_HELMET]: 165,
  [ITEM.IRON_CHESTPLATE]: 240,
  [ITEM.IRON_LEGGINGS]: 225,
  [ITEM.IRON_BOOTS]: 195,
  [ITEM.IRON_PICKAXE]: 250,
  [ITEM.IRON_AXE]: 250,
  [ITEM.IRON_SHOVEL]: 250,
  [ITEM.IRON_SWORD]: 250,
  [ITEM.IRON_HOE]: 250,
  [ITEM.DIAMOND_PICKAXE]: 1561,
  [ITEM.DIAMOND_AXE]: 1561,
  [ITEM.DIAMOND_SHOVEL]: 1561,
  [ITEM.DIAMOND_SWORD]: 1561,
  [ITEM.DIAMOND_HOE]: 1561
};

const PLAYER_STAT_ORDER = [
  "blocksMined",
  "blocksPlaced",
  "itemsCrafted",
  "itemsSmelted",
  "mobsKilled",
  "villagerTrades",
  "damageDealt",
  "damageTaken",
  "distanceWalked",
  "jumps",
  "playTime",
  "foodsEaten",
  "effectsUsed"
];

const PLAYER_STAT_LABELS = {
  blocksMined: "Blocks mined",
  blocksPlaced: "Blocks placed",
  itemsCrafted: "Items crafted",
  itemsSmelted: "Items smelted",
  mobsKilled: "Mobs killed",
  villagerTrades: "Villager trades",
  damageDealt: "Damage dealt",
  damageTaken: "Damage taken",
  distanceWalked: "Distance walked",
  jumps: "Jumps",
  playTime: "Play time",
  foodsEaten: "Foods eaten",
  effectsUsed: "Potion effects used"
};

const ACHIEVEMENT_DEFS = {
  get_wood: {
    title: "Getting Wood",
    desc: "Break your first log block."
  },
  benchmarking: {
    title: "Benchmarking",
    desc: "Craft a wooden tool.",
    parent: "get_wood"
  },
  hot_stuff: {
    title: "Hot Stuff",
    desc: "Use a furnace to smelt something."
  },
  suit_up: {
    title: "Suit Up",
    desc: "Equip any piece of armor."
  },
  shiny_stones: {
    title: "Shiny Stones",
    desc: "Find diamonds or emeralds."
  },
  monster_hunter: {
    title: "Monster Hunter",
    desc: "Defeat a hostile mob."
  },
  village_social: {
    title: "Village Social",
    desc: "Trade with a villager."
  },
  local_brewery: {
    title: "Local Brewery",
    desc: "Gain a potion effect."
  },
  enchanter: {
    title: "Enchanter",
    desc: "Apply an enchantment upgrade."
  },
  bodyguard: {
    title: "Bodyguard",
    desc: "See an iron golem defending a village."
  }
};

const EFFECT_DEFS = {
  speed: { label: "Speed", positive: true },
  strength: { label: "Strength", positive: true },
  regeneration: { label: "Regeneration", positive: true },
  jump_boost: { label: "Jump Boost", positive: true },
  resistance: { label: "Resistance", positive: true },
  poison: { label: "Poison", positive: false }
};

const ENCHANTMENT_DEFS = {
  sharpness: { label: "Sharpness", maxLevel: 5 },
  efficiency: { label: "Efficiency", maxLevel: 5 },
  unbreaking: { label: "Unbreaking", maxLevel: 3 },
  protection: { label: "Protection", maxLevel: 4 }
};

function getItemMaxDurability(itemType) {
  return Math.max(0, Number(ITEM_DURABILITY[itemType]) || 0);
}

function normalizeDurabilityValue(itemType, value) {
  const maxDurability = getItemMaxDurability(itemType);
  if (maxDurability <= 0) {
    return 0;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return maxDurability;
  }
  return clamp(Math.floor(value), 1, maxDurability);
}

function createDefaultPlayerStats() {
  return {
    blocksMined: 0,
    blocksPlaced: 0,
    itemsCrafted: 0,
    itemsSmelted: 0,
    mobsKilled: 0,
    villagerTrades: 0,
    damageDealt: 0,
    damageTaken: 0,
    distanceWalked: 0,
    jumps: 0,
    playTime: 0,
    foodsEaten: 0,
    effectsUsed: 0
  };
}

function normalizePlayerStats(value) {
  const base = createDefaultPlayerStats();
  if (!value || typeof value !== "object") {
    return base;
  }
  for (const key of PLAYER_STAT_ORDER) {
    base[key] = Math.max(0, Number(value[key]) || 0);
  }
  return base;
}

function createDefaultAchievementState() {
  const state = {};
  for (const key of Object.keys(ACHIEVEMENT_DEFS)) {
    state[key] = {
      done: false,
      unlockedAt: 0
    };
  }
  return state;
}

function normalizeAchievementState(value) {
  const state = createDefaultAchievementState();
  if (!value || typeof value !== "object") {
    return state;
  }
  for (const key of Object.keys(ACHIEVEMENT_DEFS)) {
    state[key] = {
      done: !!value[key]?.done,
      unlockedAt: Math.max(0, Number(value[key]?.unlockedAt) || 0)
    };
  }
  return state;
}

function sanitizeEffectKey(name) {
  const key = String(name || "").trim().toLowerCase().replace(/\s+/g, "_");
  return Object.prototype.hasOwnProperty.call(EFFECT_DEFS, key) ? key : "";
}

function normalizePlayerEffects(value) {
  const result = {};
  if (!value || typeof value !== "object") {
    return result;
  }
  for (const [rawKey, effect] of Object.entries(value)) {
    const key = sanitizeEffectKey(rawKey);
    if (!key || !effect || typeof effect !== "object") continue;
    const level = clamp(Math.floor(Number(effect.level) || 0), 0, 10);
    const time = Math.max(0, Number(effect.time) || 0);
    const maxTime = Math.max(time, Number(effect.maxTime) || time);
    if (level <= 0 || time <= 0) continue;
    result[key] = {
      level,
      time,
      maxTime
    };
  }
  return result;
}

function createDefaultEnchantmentState() {
  return {
    held: {
      sharpness: 0,
      efficiency: 0,
      unbreaking: 0
    },
    armor: {
      protection: 0,
      unbreaking: 0
    }
  };
}

function normalizeEnchantmentState(value) {
  const state = createDefaultEnchantmentState();
  if (!value || typeof value !== "object") {
    return state;
  }
  for (const section of ["held", "armor"]) {
    const source = value[section];
    if (!source || typeof source !== "object") continue;
    for (const key of Object.keys(state[section])) {
      const maxLevel = ENCHANTMENT_DEFS[key]?.maxLevel || 5;
      state[section][key] = clamp(Math.floor(Number(source[key]) || 0), 0, maxLevel);
    }
  }
  return state;
}

function getPlayerEffectLevel(player, key) {
  if (!player?.effects) return 0;
  const normalized = sanitizeEffectKey(key);
  return Math.max(0, Math.floor(Number(player.effects[normalized]?.level) || 0));
}

function formatStatValue(key, value) {
  const numeric = Math.max(0, Number(value) || 0);
  if (key === "distanceWalked") {
    return `${numeric.toFixed(1)} m`;
  }
  if (key === "playTime") {
    const totalSeconds = Math.floor(numeric);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }
  if (numeric % 1 !== 0) {
    return numeric.toFixed(1);
  }
  return String(Math.floor(numeric));
}

function getAllItemTexturePaths(settingsState = DEFAULT_SETTINGS) {
  const paths = new Set();
  for (const path of Object.values(ITEM_TEXTURE_SOURCES)) {
    const normalized = normalizeAssetPath(path);
    const resolved = resolveResourcePackAsset(path, settingsState);
    if (resolved) {
      paths.add(resolved);
    }
    if (normalized) {
      paths.add(normalized);
    }
  }
  return Array.from(paths);
}

function getItemInfo(itemType) {
  if (!Number.isFinite(itemType) || itemType <= 0) {
    return null;
  }
  if (BLOCK_INFO[itemType]) {
    return {
      id: itemType,
      name: BLOCK_INFO[itemType].name,
      maxStack: itemType === BLOCK.BEDROCK ? 1 : 64,
      placeBlock: itemType !== BLOCK.AIR ? itemType : null,
      blockType: itemType,
      armor: 0,
      armorSlot: null,
      tool: null
    };
  }
  return ITEM_INFO[itemType] || null;
}

const {
  ENTITY_MOB_NAMES,
  ENTITY_TEXTURE_FILE_PATHS,
  MUSIC_TRACKS,
  TextureLibrary,
  EntityTextureLibrary,
  ObjModelLibrary
} = createRuntimeAssets({
  getAllBlockTexturePaths,
  getAllItemTexturePaths,
  getBlockTextureCandidates,
  getItemInfo,
  resolveResourcePackAsset
});

function getItemName(itemType) {
  return getItemInfo(itemType)?.name || "Unknown Item";
}

function getItemMaxStack(itemType) {
  return getItemInfo(itemType)?.maxStack || 64;
}

function buildCreativeMenuItems() {
  const blockItems = Object.keys(BLOCK_INFO)
    .map(Number)
    .filter((itemType) => Number.isFinite(itemType) && itemType !== BLOCK.AIR && itemType !== BLOCK.PISTON_HEAD)
    .sort((a, b) => a - b);
  const itemItems = Object.keys(ITEM_INFO)
    .map(Number)
    .filter((itemType) => Number.isFinite(itemType))
    .sort((a, b) => a - b);
  return [...blockItems, ...itemItems];
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

function getBlockDrop(blockType, x = 0, y = 0, z = 0, seed = 0) {
  switch (blockType) {
    case BLOCK.STONE:
      return { itemType: BLOCK.COBBLESTONE, count: 1 };
    case BLOCK.COAL_ORE:
      return { itemType: ITEM.COAL, count: 1 + Math.floor(random3(x, y, z, seed + 611) * 2) };
    case BLOCK.DIAMOND_ORE:
      return { itemType: ITEM.DIAMOND, count: 1 };
    case BLOCK.REDSTONE_ORE:
      return { itemType: ITEM.REDSTONE_DUST, count: 4 + Math.floor(random3(z, y, x, seed + 617) * 2) };
    case BLOCK.EMERALD_ORE:
      return { itemType: ITEM.EMERALD, count: 1 };
    case BLOCK.REDSTONE_WIRE:
      return { itemType: ITEM.REDSTONE_DUST, count: 1 };
    case BLOCK.PISTON_HEAD:
      return { itemType: BLOCK.AIR, count: 0 };
    default:
      return { itemType: blockType, count: 1 };
  }
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
    coal_ore: BLOCK.COAL_ORE,
    iron_ore: BLOCK.IRON_ORE,
    gold_ore: BLOCK.GOLD_ORE,
    diamond_ore: BLOCK.DIAMOND_ORE,
    redstone_ore: BLOCK.REDSTONE_ORE,
    emerald_ore: BLOCK.EMERALD_ORE,
    plank: BLOCK.PLANKS,
    planks: BLOCK.PLANKS,
    stick: ITEM.STICK,
    wooden_pickaxe: ITEM.WOODEN_PICKAXE,
    wooden_axe: ITEM.WOODEN_AXE,
    wooden_shovel: ITEM.WOODEN_SHOVEL,
    wooden_sword: ITEM.WOODEN_SWORD,
    wooden_hoe: ITEM.WOODEN_HOE,
    iron_ingot: ITEM.IRON_INGOT,
    gold_ingot: ITEM.GOLD_INGOT,
    iron_pickaxe: ITEM.IRON_PICKAXE,
    iron_axe: ITEM.IRON_AXE,
    iron_shovel: ITEM.IRON_SHOVEL,
    iron_sword: ITEM.IRON_SWORD,
    iron_hoe: ITEM.IRON_HOE,
    diamond_pickaxe: ITEM.DIAMOND_PICKAXE,
    diamond_axe: ITEM.DIAMOND_AXE,
    diamond_shovel: ITEM.DIAMOND_SHOVEL,
    diamond_sword: ITEM.DIAMOND_SWORD,
    diamond_hoe: ITEM.DIAMOND_HOE,
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
    rotten_flesh: ITEM.ROTTEN_FLESH,
    coal: ITEM.COAL,
    diamond: ITEM.DIAMOND,
    emerald: ITEM.EMERALD,
    redstone: ITEM.REDSTONE_DUST,
    redstone_dust: ITEM.REDSTONE_DUST,
    redstone_wire: BLOCK.REDSTONE_WIRE,
    lever: BLOCK.LEVER,
    redstone_torch: BLOCK.REDSTONE_TORCH,
    repeater: BLOCK.REPEATER,
    piston: BLOCK.PISTON,
    sticky_piston: BLOCK.STICKY_PISTON,
    piston_head: BLOCK.PISTON_HEAD,
    torch: BLOCK.TORCH,
    wool: BLOCK.WHITE_WOOL,
    white_wool: BLOCK.WHITE_WOOL,
    bed: BLOCK.BED
  };
  return aliases[key] || BLOCK.AIR;
}

const {
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
} = createGameplayData(BLOCK, ITEM, buildCreativeMenuItems);

const {
  HOSTILE_MOB_TYPES,
  MAX_ACTIVE_MOBS,
  PASSIVE_MOB_TYPES,
  getMobDef,
  getNearbyVillageCenters,
  getNearestVillageCenter,
  getVillagePlanFromCenter,
  getVillageStructurePlan,
  getVillagerProfessionLabel,
  getVillagerTradeTable,
  isKnownMobType
} = createGameRegistry({
  BLOCK,
  ITEM,
  CHUNK_SIZE,
  SEA_LEVEL,
  VILLAGE_REGION_CHUNKS
});

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

function getBlockLightEmission(blockType) {
  if (blockType === BLOCK.TORCH) {
    return TORCH_LIGHT_LEVEL;
  }
  if (blockType === BLOCK.REDSTONE_TORCH) {
    return 9;
  }
  if (blockType === BLOCK.LAVA) {
    return LIGHT_LEVEL_MAX;
  }
  return 0;
}

function blocksLightPropagation(blockType) {
  if (blockType === BLOCK.AIR || isFluidBlock(blockType)) {
    return false;
  }
  if (blockType === BLOCK.TORCH || blockType === BLOCK.REDSTONE_TORCH) {
    return false;
  }
  const info = BLOCK_INFO[blockType];
  if (!info) {
    return true;
  }
  return info.collidable && !info.transparent;
}

function shouldRenderFace(blockType, neighborType) {
  if (isFluidBlock(blockType)) {
    if (neighborType === blockType) {
      return false;
    }
    if (neighborType === BLOCK.AIR) {
      return true;
    }
    const neighbor = BLOCK_INFO[neighborType];
    if (!neighbor) {
      return true;
    }
    if (isFluidBlock(neighborType)) {
      return true;
    }
    if (!neighbor.collidable) {
      return true;
    }
    return !!neighbor.transparent;
  }
  if (neighborType === BLOCK.AIR) {
    return true;
  }
  const block = BLOCK_INFO[blockType];
  const neighbor = BLOCK_INFO[neighborType];
  if (!neighbor) {
    return true;
  }
  if (!neighbor.collidable && !isFluidBlock(neighborType)) {
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

const {
  mat4Identity,
  mat4Perspective,
  mat4LookAt,
  compileShader,
  createProgram,
  TextureArrayAtlas,
  GreedyChunkMesher,
  WebGLChunkMesh
} = createWebGLCore({
  DEFAULT_SETTINGS,
  BLOCK,
  BLOCK_INFO,
  CHUNK_SIZE,
  WORLD_HEIGHT,
  FACE_BY_ID,
  clamp,
  isFluidBlock,
  shouldRenderFace,
  getAllBlockTexturePaths,
  getBlockTextureCandidates
});

const {
  getArmorPreviewColor,
  getOrCreatePlayerPreviewCanvas,
  renderPlayerPreviewCanvas,
  renderPlayerPreviewWebGL
} = createPlayerPreviewRuntime({
  ITEM,
  clamp,
  createProgram,
  mat4Identity,
  mat4Perspective,
  mat4LookAt,
  getPlayerSkinModel,
  getDefaultPlayerSkinCanvas,
  getSkinBoxFaceRects,
  getSkinRectUvQuad
});

const { World } = createWorldModule({
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
});

const {
  Player,
  Mob,
  entityAABB,
  entityIntersectsBlock,
  entityWouldCollide,
  findWalkableY,
  findLoadedWalkableY,
  rayIntersectAABB,
  restockVillagerOffers,
  ensureVillageMobData,
  updateVillageMobPath,
  findNearestVillageThreat,
  getVillageMobSteering,
  lerpAngle,
  shortestAngleDelta
} = createEntityRuntime({
  SEA_LEVEL,
  WORLD_HEIGHT,
  CHUNK_SIZE,
  DEFAULT_SETTINGS,
  GAME_MODE,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  INVENTORY_SLOTS,
  HOTBAR_SLOTS,
  ARMOR_SLOTS,
  BLOCK,
  BLOCK_INFO,
  ARMOR_SLOT_KEYS,
  clamp,
  lerp,
  random2,
  random3,
  isCollidable,
  isFluidBlock,
  getMobDef,
  getItemArmorPoints,
  getPlayerEffectLevel,
  getItemMaxStack,
  getItemArmorSlot,
  normalizeDurabilityValue,
  normalizeSpawnPoint,
  normalizePlayerStats,
  normalizeAchievementState,
  normalizePlayerEffects,
  normalizeEnchantmentState,
  createDefaultPlayerStats,
  createDefaultAchievementState,
  createDefaultEnchantmentState,
  getNearestVillageCenter,
  getVillageStructurePlan,
  getVillagerTradeTable
});

const { VoxelRenderer } = createCanvasRendererRuntime({
  DEFAULT_RENDER_DISTANCE,
  PLAYER_EYE_HEIGHT,
  LIGHT_LEVEL_MAX,
  CHUNK_SIZE,
  GAME_TITLE,
  GAME_VERSION,
  BLOCK,
  BLOCK_INFO,
  HOTBAR_BLOCKS,
  FACE_BY_ID,
  clamp,
  rgb,
  rgba,
  mixRgb,
  scaleRgb,
  random3,
  createWeatherState,
  getDayCycleInfo,
  getEffectiveDaylight,
  getWeatherSkyDarkness,
  buildWeatherParticlePass,
  getFaceColor
});

const { WebGLVoxelRenderer } = createWebGLRendererRuntime({
  DEFAULT_RENDER_DISTANCE,
  PLAY_CHUNK_GEN_LIMIT,
  CHUNK_SIZE,
  PLAYER_EYE_HEIGHT,
  DEFAULT_SETTINGS,
  clamp,
  packChunkKey,
  createWeatherState,
  buildWeatherParticlePass,
  getPerformancePresetConfig,
  mat4Identity,
  mat4Perspective,
  mat4LookAt,
  createProgram,
  GreedyChunkMesher,
  WebGLChunkMesh,
  getChunkLoadOffsets,
  getSkinBoxFaceRects,
  getSkinRectUvQuad,
  getPlayerSkinModel,
  getMobDef
});

export default function CubesAndCavesGame(engine) {
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
  let playerUsername = "";
  let activeWorldId = null;
  let selectedWorldId = null;
  let mode = "menu"; // menu | loading | playing | paused
  let chatOpen = false;
  let inventoryOpen = false;
  let tradeOpen = false;
  let chatLines = [];
  let chatNeedsRender = false;
  let mobs = [];
  let items = [];
  let mining = { key: null, progress: 0, type: BLOCK.AIR };
  let hud = { visible: true, last: null, timer: 0 };
  let boss = { active: false, name: "Boss", health: 1 };
  let worldTime = 0; // seconds, loops
  let weather = createWeatherState();
  let weatherVisualIntensity = 0;
  let gamerules = normalizeGamerules();
  let worldSpawnPoint = null;
  let sleepState = { active: false, timer: 0, duration: 5, bedKey: "", bedPosition: null };
  let spawnTimer = 0;
  let worldTickTimer = 0;
  let blockTickAccumulator = 0;
  let saveTimer = 0;
  let fps = 0;
  let fpsTimer = 0;
  let fpsSmoothed = 0;
  let caveCheckTimer = 0;
  let runtimePlayerInCave = false;
  let villageCheckTimer = 0;
  let runtimePlayerInVillage = false;
  let targetScanTimer = 0;
  let currentTarget = null;
  let currentEntityTarget = null;
  let renderEntities = [];
  let inventoryCursor = { type: BLOCK.AIR, count: 0, durability: 0 };
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
  let toastQueue = [];
  let activeTradeVillager = null;
  let villageLifeTimer = 0;

  let ui = null;
  let loadingStartChunk = null;
  let webglContextLost = false;
  let webglContextRestored = false;
  let runtimeFault = null;
  let runtimeRepairPromise = null;
  let resourcePackRuntime = null;
  const musicState = {
    pool: new Map(),
    currentAudio: null,
    currentGain: 0,
    fadingVoices: [],
    currentTrack: "",
    currentState: "",
    unlocked: false
  };
  let runtimeLowFpsTimer = 0;
  let runtimeCompactCooldown = 0;
  let runtimeMaintenanceTimer = 0;
  let runtimeLastChunkX = Number.NaN;
  let runtimeLastChunkZ = Number.NaN;
  let waterFlowTimer = 0;
  let lavaFlowTimer = 0;
  let randomTickChunkCache = [];
  let randomTickChunkCacheTimer = 0;
  let randomTickCacheChunkX = Number.NaN;
  let randomTickCacheChunkZ = Number.NaN;
  let debugState = {
    visible: false,
    chunkBorders: false,
    hitboxes: false,
    advancedTooltips: false,
    frameGraph: false,
    pieChart: false,
    helpUntil: 0,
    chordUntil: 0,
    metrics: {
      frameMs: 16.7,
      updateMs: 0,
      renderMs: 0,
      chunkMs: 0,
      uiMs: 0,
      worldMs: 0
    },
    frameSamples: Array.from({ length: 90 }, () => 16.7)
  };
  let multiplayerState = {
    directConnectUrl: DEFAULT_MULTIPLAYER_SERVER_URL,
    selectedServerId: "",
    selectedRoomCode: "",
    signalRooms: [],
    dedicatedServers: [],
    savedServers: [
    ]
  };
  let multiplayerSession = {
    sessionKind: "manual",
    signalMode: "manual",
    signalingUrl: "",
    socket: null,
    socketState: "offline",
    clientId: "",
    dedicatedServerId: "",
    dedicatedServerName: "",
    roomCode: "",
    roomName: "",
    roomPrivate: false,
    cheatDetection: false,
    isHost: false,
    hostPeerId: "",
    joinPending: false,
    peers: new Map(),
    remotePlayers: new Map(),
    selectedRoomName: "",
    lastPlayerSyncAt: 0,
    lastWorldSyncAt: 0
  };

  setPlayerSkinRefreshHandler(() => {
    if (!ui) return;
    setSettingsUI();
    setProfileSetupUI();
    if (inventoryOpen) {
      renderInventoryUI();
    }
  });

  const VOLUME_PRESETS = [0, 0.25, 0.5, 0.75, 1];
  const MUSIC_FADE_SECONDS = 2.8;
  const AUTO_REPAIR_DELAY_MS = 2000;

  const chatState = {
    get open() {
      return chatOpen;
    },
    set open(value) {
      chatOpen = !!value;
    },
    get lines() {
      return chatLines;
    },
    set lines(value) {
      chatLines = Array.isArray(value) ? value : [];
    },
    get needsRender() {
      return chatNeedsRender;
    },
    set needsRender(value) {
      chatNeedsRender = !!value;
    }
  };

  const tradeState = {
    get open() {
      return tradeOpen;
    },
    set open(value) {
      tradeOpen = !!value;
    },
    get activeVillager() {
      return activeTradeVillager;
    },
    set activeVillager(value) {
      activeTradeVillager = value || null;
    }
  };

  const interactionState = {
    mining,
    get currentTarget() {
      return currentTarget;
    },
    set currentTarget(value) {
      currentTarget = value;
    },
    get currentEntityTarget() {
      return currentEntityTarget;
    },
    set currentEntityTarget(value) {
      currentEntityTarget = value;
    },
    get activeFurnaceKey() {
      return activeFurnaceKey;
    },
    set activeFurnaceKey(value) {
      activeFurnaceKey = value;
    }
  };

  const combatState = {
    get world() {
      return world;
    },
    set world(value) {
      world = value;
    },
    get player() {
      return player;
    },
    set player(value) {
      player = value;
    },
    get mobs() {
      return mobs;
    },
    set mobs(value) {
      mobs = Array.isArray(value) ? value : [];
    },
    get currentEntityTarget() {
      return currentEntityTarget;
    },
    set currentEntityTarget(value) {
      currentEntityTarget = value;
    },
    get hud() {
      return hud;
    },
    get mining() {
      return mining;
    },
    get inventoryCraftTypes() {
      return inventoryCraftTypes;
    },
    get inventoryCraftCounts() {
      return inventoryCraftCounts;
    },
    get tableCraftTypes() {
      return tableCraftTypes;
    },
    get tableCraftCounts() {
      return tableCraftCounts;
    },
    get inventoryOpen() {
      return inventoryOpen;
    },
    get gamerules() {
      return gamerules;
    },
    get settings() {
      return settings;
    },
    get mode() {
      return mode;
    }
  };
  const commandState = {
    get world() {
      return world;
    },
    get player() {
      return player;
    },
    get settings() {
      return settings;
    },
    get worldTime() {
      return worldTime;
    },
    set worldTime(value) {
      worldTime = value;
    },
    get weather() {
      return weather;
    },
    get mobs() {
      return mobs;
    },
    set mobs(value) {
      mobs = Array.isArray(value) ? value : [];
    },
    get items() {
      return items;
    },
    set items(value) {
      items = Array.isArray(value) ? value : [];
    },
    get renderEntities() {
      return renderEntities;
    },
    get furnaceStates() {
      return furnaceStates;
    },
    get useWebGL() {
      return useWebGL;
    },
    get glRenderer() {
      return glRenderer;
    },
    get canvasRenderer() {
      return canvasRenderer;
    },
    get gamerules() {
      return gamerules;
    },
    getDayCycleInfo
  };
  const webglState = {
    get gl() {
      return gl;
    },
    set gl(value) {
      gl = value;
    },
    get atlas() {
      return atlas;
    },
    set atlas(value) {
      atlas = value;
    },
    get textures() {
      return textures;
    },
    get settings() {
      return settings;
    },
    get world() {
      return world;
    },
    get player() {
      return player;
    },
    get useWebGL() {
      return useWebGL;
    },
    set useWebGL(value) {
      useWebGL = !!value;
    },
    get input() {
      return input;
    },
    get currentTarget() {
      return currentTarget;
    },
    set currentTarget(value) {
      currentTarget = value;
    },
    get currentEntityTarget() {
      return currentEntityTarget;
    },
    set currentEntityTarget(value) {
      currentEntityTarget = value;
    },
    get mining() {
      return mining;
    },
    get inventoryOpen() {
      return inventoryOpen;
    },
    set inventoryOpen(value) {
      inventoryOpen = !!value;
    },
    get chatOpen() {
      return chatOpen;
    },
    get inventoryContext() {
      return inventoryContext;
    },
    set inventoryContext(value) {
      inventoryContext = value;
    },
    get activeFurnaceKey() {
      return activeFurnaceKey;
    },
    set activeFurnaceKey(value) {
      activeFurnaceKey = value;
    },
    get renderEntities() {
      return renderEntities;
    },
    get targetScanTimer() {
      return targetScanTimer;
    },
    set targetScanTimer(value) {
      targetScanTimer = Number(value) || 0;
    },
    get webglContextLost() {
      return webglContextLost;
    },
    set webglContextLost(value) {
      webglContextLost = !!value;
    },
    get webglContextRestored() {
      return webglContextRestored;
    },
    set webglContextRestored(value) {
      webglContextRestored = !!value;
    },
    get runtimeFault() {
      return runtimeFault;
    },
    set runtimeFault(value) {
      runtimeFault = value;
    },
    get runtimeRepairPromise() {
      return runtimeRepairPromise;
    },
    set runtimeRepairPromise(value) {
      runtimeRepairPromise = value;
    },
    get mode() {
      return mode;
    }
  };
  let runCommand = () => {};

  const {
    clearChatLines,
    closeChat,
    openChat,
    pushChatLine,
    renderChatLines,
    submitChat,
    updateChat
  } = createChatRuntime({
    state: chatState,
    ensureUI,
    getUi: () => ui,
    getInput: () => input,
    getMode: () => mode,
    runCommand: (...args) => runCommand(...args)
  });

  const {
    stopSleeping,
    tryUseBed,
    updateSleeping
  } = createSleepRuntime({
    sleepState,
    block: BLOCK,
    weatherTypes: WEATHER_TYPES,
    clamp,
    ensureUI,
    getUi: () => ui,
    getMode: () => mode,
    getWorld: () => world,
    getPlayer: () => player,
    getMobs: () => mobs,
    getInput: () => input,
    getInventoryOpen: () => inventoryOpen,
    getChatOpen: () => chatOpen,
    getMobDef,
    getRandomWeatherDurationSeconds,
    getWorldTimePreset,
    packBlockPositionKey,
    canSleepNow,
    setPlayerSpawnPoint,
    setWeatherState,
    pushChatLine,
    closeChat,
    setInventoryOpen,
    setWorldTime: (value) => {
      worldTime = value;
    }
  });

  const {
    closeTrade,
    executeVillagerTrade,
    isVillagerTradeValid,
    openVillagerTrade,
    renderVillagerTradeUi
  } = createTradingRuntime({
    state: tradeState,
    block: BLOCK,
    item: ITEM,
    effectDefs: EFFECT_DEFS,
    enchantmentDefs: ENCHANTMENT_DEFS,
    clamp,
    getMode: () => mode,
    getInventoryOpen: () => inventoryOpen,
    getChatOpen: () => chatOpen,
    getInput: () => input,
    getUi: () => ui,
    getWorld: () => world,
    getPlayer: () => player,
    ensureVillageMobData,
    getVillagerProfessionLabel,
    getItemName,
    countInventoryItem,
    getInventorySpaceForItem,
    removeInventoryItem,
    addToInventory,
    spawnItemEntity,
    applyPlayerEffect,
    addEnchantmentLevel,
    addPlayerStat,
    unlockPlayerAchievement,
    queueToast,
    setHotbarImages,
    renderInventoryUI,
    closeChat,
    setInventoryOpen
  });

  const {
    isPlayerInCave,
    isPlayerInVillage,
    preloadMusicTracks,
    syncMusicVolume,
    unlockMusicPlayback,
    updateMusicState
  } = createMusicRuntime({
    state: musicState,
    musicTracks: MUSIC_TRACKS,
    musicFadeSeconds: MUSIC_FADE_SECONDS,
    block: BLOCK,
    playerEyeHeight: PLAYER_EYE_HEIGHT,
    worldHeight: WORLD_HEIGHT,
    clamp,
    resolveResourcePackAsset,
    getMode: () => mode,
    getSettings: () => settings,
    getPlayer: () => player,
    getWorld: () => world,
    getRuntimePlayerInCave: () => runtimePlayerInCave,
    getRuntimePlayerInVillage: () => runtimePlayerInVillage,
    getNearestVillageCenter,
    isFluidBlock
  });

  const {
    addXp,
    applyDamage,
    attackTargetMob,
    clearPlayerInventory,
    dropMobLoot,
    findTargetMob,
    renderArmor,
    renderHearts,
    renderHunger,
    respawnPlayer,
    updatePlayerVitals
  } = createCombatRuntime({
    state: combatState,
    BLOCK,
    ITEM,
    GAME_MODE,
    MAX_REACH,
    MOB_LOOT_TABLES,
    clamp,
    random3,
    getSelectedHeldItemType,
    getHeldEnchantmentLevel,
    isCreativeMode,
    addPlayerStat,
    damageSelectedHeldItem,
    getMobDef,
    unlockPlayerAchievement,
    spawnItemEntity,
    setHotbarImages,
    renderInventoryUI,
    clearInventoryCursor,
    setMiningProgress: (...args) => setMiningProgress(...args),
    getRespawnPoint,
    pushChatLine,
    damageArmorFromHit,
    getArmorEnchantmentLevel,
    rayIntersectAABB
  });

  runCommand = createCommandRuntime({
    state: commandState,
    block: BLOCK,
    blockInfo: BLOCK_INFO,
    defaultGamerules: DEFAULT_GAMERULES,
    effectDefs: EFFECT_DEFS,
    enchantmentDefs: ENCHANTMENT_DEFS,
    gameMode: GAME_MODE,
    gameVersion: GAME_VERSION,
    worldHeight: WORLD_HEIGHT,
    clamp,
    getTimeSecondsFromMinecraftTicks,
    getWorldTimePreset,
    normalizeWorldTimeSeconds,
    normalizeWeatherType,
    sanitizeEffectKey,
    normalizeItemName,
    resolveItemTypeByName,
    getPlacedBlockType,
    getItemName,
    isCollidable,
    isMultiplayerGuest,
    addToInventory,
    getSelectedHeldItemType,
    getSelectedHeldCount,
    addEnchantmentLevel,
    applyPlayerEffect,
    setWeatherState,
    setPlayerSpawnPoint,
    setWorldSpawn,
    setWorldBlockWithChecks,
    getNearestVillageCenter,
    isKnownMobType,
    summonMobNearPlayer,
    setBossBar,
    pushChatLine: (...args) => pushChatLine(...args),
    clearChatLines: (...args) => clearChatLines(...args),
    logMobRenderDiagnostics,
    setSettingsUI,
    setHotbarImages,
    respawnPlayer
  }).runCommand;

  const {
    breakCurrentTarget,
    setMiningProgress,
    tryPlaceBlock,
    updateCombat,
    updateInteractions,
    updateMining
  } = createBlockInteractionsRuntime({
    state: interactionState,
    block: BLOCK,
    worldHeight: WORLD_HEIGHT,
    hotbarSlots: HOTBAR_SLOTS,
    hotbarBlocks: HOTBAR_BLOCKS,
    gameMode: GAME_MODE,
    redstoneRepeaterMinDelay: REDSTONE_REPEATER_MIN_DELAY,
    redstoneRepeaterMaxDelay: REDSTONE_REPEATER_MAX_DELAY,
    clamp,
    random3,
    ensureUI,
    getUi: () => ui,
    getWorld: () => world,
    getPlayer: () => player,
    getInput: () => input,
    getSettings: () => settings,
    getInventoryOpen: () => inventoryOpen,
    getMultiplayerSession: () => multiplayerSession,
    isFluidBlock,
    getSelectedHeldItemType,
    getSelectedHeldBlockType,
    getSelectedHeldCount,
    getItemFoodValue,
    isCreativeMode,
    damageSelectedHeldItem,
    consumeFromSelectedSlot,
    addPlayerStat,
    unlockPlayerAchievement,
    dropFurnaceContentsAt,
    canHarvestBlock,
    getBlockDrop,
    spawnItemEntity,
    setWorldBlockWithChecks,
    isMultiplayerGuest,
    isMultiplayerHost,
    isDedicatedMultiplayerSession,
    sendMultiplayerSignal,
    sendMultiplayerPeerMessage,
    broadcastMultiplayerPeerMessage,
    getToolBreakMultiplier,
    getHeldEnchantmentLevel,
    getRequiredToolForBlock,
    getBreakTime,
    isCollidable,
    renderInventoryUI,
    getActiveFurnaceState,
    setInventoryOpen,
    getOrCreateRedstoneStateAt,
    setRedstoneStateAtPosition,
    openVillagerTrade,
    tryUseBed,
    attackTargetMob,
    setHotbarImages,
    updateHotbarSelection,
    packBlockPositionKey
  });

  const {
    beginAutoRepair,
    handleWebGLContextLost,
    handleWebGLContextRestored,
    handleWindowRuntimeError,
    handleWindowRuntimeRejection,
    reportRuntimeFault,
    setAutoRepairUi,
    setRuntimeErrorOverlay,
    setupWebGL,
    updateRuntimeFaultState
  } = createWebglRuntime({
    state: webglState,
    gameTitle: GAME_TITLE,
    autoRepairDelayMs: AUTO_REPAIR_DELAY_MS,
    TextureArrayAtlas,
    ensureUI,
    getUi: () => ui,
    getEngine: () => engine,
    setMiningProgress: (...args) => setMiningProgress(...args),
    closeChat,
    closeTrade,
    clearInventoryCursor,
    resetInventoryDragState,
    updateInventoryCursorVisual,
    ensureActiveRenderer,
    invalidateAllChunkMeshes,
    setHotbarImages,
    updateHud,
    setSettingsUI,
    renderChatLines
  });

  function isMultiplayerSessionActive() {
    return !!(multiplayerSession.roomCode || multiplayerSession.dedicatedServerId);
  }

  function isMultiplayerHost() {
    return isMultiplayerSessionActive() && !isDedicatedMultiplayerSession() && multiplayerSession.isHost;
  }

  function isMultiplayerGuest() {
    return isMultiplayerSessionActive() && (isDedicatedMultiplayerSession() || !multiplayerSession.isHost);
  }

  function isDedicatedMultiplayerSession() {
    return multiplayerSession.sessionKind === "dedicated" || !!multiplayerSession.dedicatedServerId;
  }

  function isManualMultiplayerSession() {
    return !isDedicatedMultiplayerSession() && multiplayerSession.signalMode !== "socket";
  }

  function getManualLanPeerId() {
    return isMultiplayerHost() ? "manual-peer" : (multiplayerSession.hostPeerId || "host");
  }

  function getMultiplayerSocketUrl(rawUrl = multiplayerState.directConnectUrl || DEFAULT_MULTIPLAYER_SERVER_URL) {
    return getWebSocketURL(rawUrl) || DEFAULT_MULTIPLAYER_SERVER_URL;
  }

  function getLocalMultiplayerProfile() {
    return {
      username: normalizeCubeCraftUsername(playerUsername || getStoredCubeCraftUsername() || "Player", "Player"),
      skinPreset: isValidPlayerSkinPreset(settings.playerSkinPreset) ? settings.playerSkinPreset : DEFAULT_SETTINGS.playerSkinPreset,
      skinDataUrl: typeof settings.playerSkinDataUrl === "string" ? settings.playerSkinDataUrl : ""
    };
  }

  function getPlayerActionLabel() {
    if (!player) return "idle";
    if (!player.onGround) return player.vy > 0.2 ? "jump" : "fall";
    if (Math.hypot(player.vx, player.vz) > 0.16) return player.isSprinting ? "sprint" : "walk";
    return "idle";
  }

  function getLocalMultiplayerPlayerState() {
    const profile = getLocalMultiplayerProfile();
    return {
      id: multiplayerSession.clientId || "host",
      username: profile.username,
      skinPreset: profile.skinPreset,
      skinDataUrl: profile.skinDataUrl,
      x: Number(player?.x || 0),
      y: Number(player?.y || 0),
      z: Number(player?.z || 0),
      yaw: Number(player?.yaw || 0),
      pitch: Number(player?.pitch || 0),
      onGround: !!player?.onGround,
      action: getPlayerActionLabel(),
      animation: getPlayerActionLabel()
    };
  }

  function getPlayerSkinCanvasForProfile(profile = {}) {
    if (profile?.skinDataUrl) {
      return getCustomPlayerSkinCanvas(profile.skinDataUrl) || getPresetPlayerSkinCanvas(profile.skinPreset || "steve");
    }
    return getPresetPlayerSkinCanvas(profile?.skinPreset || "steve");
  }

  function buildRemotePlayerEntity(state = {}) {
    const skinCanvas = getPlayerSkinCanvasForProfile(state);
    return {
      entityKind: "remote_player",
      type: "remote_player",
      id: String(state.id || generateId()),
      username: String(state.username || "Player"),
      skinPreset: state.skinPreset || "steve",
      skinDataUrl: state.skinDataUrl || "",
      skinCanvas,
      billboardCanvas: buildPlayerBillboardCanvas(skinCanvas),
      x: Number(state.x || 0),
      y: Number(state.y || 0),
      z: Number(state.z || 0),
      yaw: Number(state.yaw || 0),
      pitch: Number(state.pitch || 0),
      onGround: state.onGround !== false,
      action: String(state.action || "idle"),
      animation: String(state.animation || state.action || "idle"),
      radius: 0.34,
      height: 1.8,
      lastUpdateAt: performance.now()
    };
  }

  function upsertRemotePlayerEntity(state = {}) {
    const peerId = String(state.id || "");
    if (!peerId || peerId === multiplayerSession.clientId) {
      return;
    }
    const existing = multiplayerSession.remotePlayers.get(peerId);
    const next = existing || buildRemotePlayerEntity(state);
    next.username = String(state.username || next.username || "Player");
    next.skinPreset = state.skinPreset || next.skinPreset || "steve";
    next.skinDataUrl = typeof state.skinDataUrl === "string" ? state.skinDataUrl : (next.skinDataUrl || "");
    next.x = Number.isFinite(state.x) ? Number(state.x) : next.x;
    next.y = Number.isFinite(state.y) ? Number(state.y) : next.y;
    next.z = Number.isFinite(state.z) ? Number(state.z) : next.z;
    next.yaw = Number.isFinite(state.yaw) ? Number(state.yaw) : next.yaw;
    next.pitch = Number.isFinite(state.pitch) ? Number(state.pitch) : next.pitch;
    next.onGround = state.onGround !== false;
    next.action = String(state.action || next.action || "idle");
    next.animation = String(state.animation || next.animation || next.action || "idle");
    next.lastUpdateAt = performance.now();
    const refreshedSkin = !existing
      || existing.skinPreset !== next.skinPreset
      || existing.skinDataUrl !== next.skinDataUrl;
    if (refreshedSkin) {
      next.skinCanvas = getPlayerSkinCanvasForProfile(next);
      next.billboardCanvas = buildPlayerBillboardCanvas(next.skinCanvas);
    }
    multiplayerSession.remotePlayers.set(peerId, next);
  }

  function removeRemotePlayerEntity(peerId) {
    if (!peerId) return;
    multiplayerSession.remotePlayers.delete(String(peerId));
  }

  function resetRemotePlayerEntities() {
    multiplayerSession.remotePlayers.clear();
  }

  function sendMultiplayerSignal(payload) {
    const socket = multiplayerSession.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(payload));
    return true;
  }

  function closeMultiplayerPeer(peerId, keepRemoteEntity = false) {
    const key = String(peerId || "");
    const record = multiplayerSession.peers.get(key);
    if (!record) {
      if (!keepRemoteEntity) {
        removeRemotePlayerEntity(key);
      }
      return;
    }
    try {
      record.channel?.close?.();
    } catch (error) {
      console.warn("Peer channel close failed:", error.message);
    }
    try {
      record.pc?.close?.();
    } catch (error) {
      console.warn("Peer connection close failed:", error.message);
    }
    multiplayerSession.peers.delete(key);
    if (!keepRemoteEntity) {
      removeRemotePlayerEntity(key);
    }
  }

  function teardownMultiplayerSession({ keepSocket = false, preserveBrowser = false } = {}) {
    for (const peerId of Array.from(multiplayerSession.peers.keys())) {
      closeMultiplayerPeer(peerId);
    }
    resetRemotePlayerEntities();
    if (!keepSocket && multiplayerSession.socket) {
      try {
        multiplayerSession.socket.close();
      } catch (error) {
        console.warn("Signaling socket close failed:", error.message);
      }
    }
    multiplayerSession = {
      sessionKind: "manual",
      signalMode: "manual",
      signalingUrl: keepSocket ? multiplayerSession.signalingUrl : "",
      socket: keepSocket ? multiplayerSession.socket : null,
      socketState: keepSocket ? multiplayerSession.socketState : "offline",
      clientId: keepSocket ? multiplayerSession.clientId : "",
      dedicatedServerId: "",
      dedicatedServerName: "",
      roomCode: "",
      roomName: "",
      roomPrivate: false,
      cheatDetection: false,
      isHost: false,
      hostPeerId: "",
      joinPending: false,
      peers: new Map(),
      remotePlayers: new Map(),
      selectedRoomName: "",
      lastPlayerSyncAt: 0,
      lastWorldSyncAt: 0
    };
    if (!preserveBrowser) {
      multiplayerState.selectedRoomCode = "";
    }
    syncRenderEntityList();
  }

  function buildMultiplayerWorldSnapshot() {
    if (!world) {
      return null;
    }
    return {
      format: WORLD_EXPORT_FORMAT,
      formatVersion: WORLD_EXPORT_FORMAT_VERSION,
      gameVersion: GAME_VERSION,
      exportedAt: Date.now(),
      meta: {
        name: store?.getWorldMeta(activeWorldId)?.name || multiplayerSession.roomName || `${GAME_SHORT_TITLE} LAN World`,
        seed: world.seed
      },
      payload: {
        version: GAME_VERSION,
        seed: world.seed,
        chunkSnapshots: serializeChunkSnapshots(world.serializeChunkSnapshots()),
        modifiedChunks: serializeModifiedChunks(world.modifiedChunks),
        fluidStates: serializeFluidStates(world.fluidStates),
        furnaces: serializeFurnaceStates(furnaceStates),
        worldState: serializeCurrentWorldState()
      }
    };
  }

  function startMultiplayerWorldFromSnapshot(snapshot) {
    const payload = snapshot?.payload && typeof snapshot.payload === "object" ? snapshot.payload : snapshot;
    if (!payload || typeof payload !== "object") {
      throw new Error("Host did not send a valid world snapshot.");
    }

    activeWorldId = null;
    const seed = normalizeWorldSeed(payload.seed, generateRandomWorldSeed());
    world = new World(seed);
    world.setChunkSnapshots(deserializeChunkSnapshots(payload.chunkSnapshots || {}));
    world.modifiedChunks = deserializeModifiedChunks(payload.modifiedChunks || {});
    world.fluidStates = deserializeFluidStates(payload.fluidStates || {});
    world.loadedFromStorage = false;
    furnaceStates = deserializeFurnaceStates(payload.furnaces || {});
    const defaultSpawn = world.findSpawn(0, 0);
    const savedWorldState = normalizeSavedWorldState(payload.worldState, {
      x: defaultSpawn.x,
      y: defaultSpawn.y,
      z: defaultSpawn.z,
      source: "world"
    }, deserializeRedstoneStates);
    world.redstoneStates = savedWorldState.redstoneStates || new Map();
    world.redstoneDirty = new Set();
    world.redstoneScheduledTicks = new Map();
    world.redstoneTickCounter = 0;
    worldTime = savedWorldState.time;
    weather = savedWorldState.weather;
    weatherVisualIntensity = getWeatherBaseIntensity(weather.type);
    gamerules = savedWorldState.gamerules;
    worldSpawnPoint = savedWorldState.worldSpawnPoint || { x: defaultSpawn.x, y: defaultSpawn.y, z: defaultSpawn.z, source: "world" };
    settings = normalizeSettingsState(settings);
    if (settings.playerSkinPreset === "custom") {
      getCustomPlayerSkinCanvas(settings.playerSkinDataUrl);
    }
    const activeCustomPack = getCustomResourcePack(settings);
    if (activeCustomPack) {
      preloadCustomResourcePackAssets(activeCustomPack).then(() => {
        applyTexturePackSetting();
      });
    }
    syncMusicVolume();
    if (textures) {
      textures.settings = settings;
    }
    if (entityTextures) {
      entityTextures.settings = settings;
    }
    if (atlas) {
      atlas.settings = settings;
    }

    player = new Player();
    player.setPosition(defaultSpawn.x, defaultSpawn.y, defaultSpawn.z);
    player.ensureSafePosition(world);
    mobs = [];
    items = [];
    spawnTimer = 0;
    mining.key = null;
    mining.progress = 0;
    currentTarget = null;
    currentEntityTarget = null;
    inventoryOpen = false;
    closeTrade(false);
    inventoryContext = "inventory";
    clearInventoryCursor();
    activeFurnaceKey = null;
    inventoryCraftTypes.fill(0);
    inventoryCraftCounts.fill(0);
    tableCraftTypes.fill(0);
    tableCraftCounts.fill(0);
    resetInventoryDragState();
    mobRenderWarnings.clear();
    lastMobRenderSummaryAt = 0;
    saveTimer = 0;
    runtimeLowFpsTimer = 0;
    runtimeCompactCooldown = 0;
    runtimeMaintenanceTimer = 0;
    runtimeLastChunkX = Math.floor(player.x / CHUNK_SIZE);
    runtimeLastChunkZ = Math.floor(player.z / CHUNK_SIZE);
    caveCheckTimer = 0;
    runtimePlayerInCave = false;
    villageCheckTimer = 0;
    runtimePlayerInVillage = false;
    targetScanTimer = 0;
    randomTickChunkCache = [];
    randomTickChunkCacheTimer = 0;
    randomTickCacheChunkX = Number.NaN;
    randomTickCacheChunkZ = Number.NaN;
    renderEntities.length = 0;
    stopSleeping(false);
    runtimeFault = null;
    runtimeRepairPromise = null;
    webglContextLost = false;
    webglContextRestored = false;
    loadingStartChunk = { x: Math.floor(player.x / CHUNK_SIZE), z: Math.floor(player.z / CHUNK_SIZE) };
    ensureActiveRenderer();
    queueAllKnownRedstoneDirty();
    setHotbarImages();
    setSettingsUI();
    mode = "loading";
    ensureUI();
    setAutoRepairUi(false);
    setRuntimeErrorOverlay(false);
    ui.showScreen("loading");
    ui.setHudVisible(false);
    ui.inventoryEl.style.display = "none";
    closeChat(false);
  }

  function serializeDedicatedModifiedBlocksToChunks(blocks = []) {
    const modifiedChunks = {};
    for (const blockUpdate of Array.isArray(blocks) ? blocks : []) {
      const x = Math.floor(Number(blockUpdate?.x) || 0);
      const y = Math.floor(Number(blockUpdate?.y) || 0);
      const z = Math.floor(Number(blockUpdate?.z) || 0);
      if (!Number.isFinite(x + y + z) || y < 0 || y >= WORLD_HEIGHT) {
        continue;
      }
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkZ = Math.floor(z / CHUNK_SIZE);
      const chunkKey = packChunkKey(chunkX, chunkZ);
      if (!modifiedChunks[chunkKey]) {
        modifiedChunks[chunkKey] = {};
      }
      modifiedChunks[chunkKey][packLocalKey(mod(x, CHUNK_SIZE), y, mod(z, CHUNK_SIZE))] = Number(blockUpdate?.blockType) || BLOCK.AIR;
    }
    return modifiedChunks;
  }

  function startDedicatedMultiplayerWorld(payload = {}) {
    const server = payload?.server && typeof payload.server === "object" ? payload.server : {};
    const worldData = payload?.world && typeof payload.world === "object" ? payload.world : {};
    const players = Array.isArray(payload?.players) ? payload.players : [];
    const worldSeed = normalizeWorldSeed(worldData.seed ?? server.seed, generateRandomWorldSeed());
    const worldState = {
      time: normalizeWorldTimeSeconds(worldData.worldTime),
      weather: createWeatherState(normalizeWeatherType(worldData.weather, WEATHER_TYPES.CLEAR)),
      gamerules: normalizeGamerules()
    };

    startMultiplayerWorldFromSnapshot({
      seed: worldSeed,
      modifiedChunks: serializeDedicatedModifiedBlocksToChunks(worldData.modifiedBlocks),
      fluidStates: {},
      furnaces: {},
      worldState
    });

    multiplayerSession.sessionKind = "dedicated";
    multiplayerSession.signalMode = "socket";
    multiplayerSession.dedicatedServerId = String(server.id || multiplayerSession.dedicatedServerId || "default");
    multiplayerSession.dedicatedServerName = String(server.name || multiplayerSession.dedicatedServerName || "Dedicated Server");
    multiplayerSession.roomCode = multiplayerSession.dedicatedServerId;
    multiplayerSession.roomName = multiplayerSession.dedicatedServerName;
    multiplayerSession.roomPrivate = false;
    multiplayerSession.cheatDetection = false;
    multiplayerSession.isHost = false;
    multiplayerSession.hostPeerId = "";
    multiplayerSession.joinPending = false;
    multiplayerState.selectedRoomCode = multiplayerSession.dedicatedServerId;

    if (payload.clientId) {
      multiplayerSession.clientId = String(payload.clientId);
    }

    resetRemotePlayerEntities();
    for (const playerState of players) {
      upsertRemotePlayerEntity(playerState);
    }
    removeRemotePlayerEntity(multiplayerSession.clientId);
    syncRenderEntityList();
    pushToast(`Joined ${multiplayerSession.dedicatedServerName}`);
  }

  function buildMultiplayerWorldStatePacket() {
    return {
      worldTime,
      weather: {
        type: weather.type,
        timer: weather.timer,
        lightningTimer: weather.lightningTimer,
        flash: weather.flash
      },
      gamerules: { ...gamerules },
      redstoneStates: serializeRedstoneStates(world?.redstoneStates)
    };
  }

  function applyMultiplayerWorldStatePacket(packet = {}) {
    if (!packet || typeof packet !== "object") return;
    if (Number.isFinite(packet.worldTime)) {
      worldTime = normalizeWorldTimeSeconds(packet.worldTime);
    }
    if (packet.weather && typeof packet.weather === "object") {
      const nextType = normalizeWeatherType(packet.weather.type, weather.type);
      weather.type = nextType;
      weather.timer = Math.max(1, Number(packet.weather.timer) || weather.timer || getRandomWeatherDurationSeconds(nextType));
      weather.lightningTimer = nextType === WEATHER_TYPES.THUNDER
        ? Math.max(0.2, Number(packet.weather.lightningTimer) || weather.lightningTimer || 2 + Math.random() * 6)
        : 0;
      weather.flash = Math.max(0, Number(packet.weather.flash) || 0);
    }
    gamerules = normalizeGamerules(packet.gamerules || gamerules);
    if (world) {
      world.redstoneStates = deserializeRedstoneStates(packet.redstoneStates);
      queueAllKnownRedstoneDirty();
    }
  }

  function sendMultiplayerPeerMessage(peerId, payload) {
    const record = multiplayerSession.peers.get(String(peerId || ""));
    const channel = record?.channel || null;
    if (!channel || channel.readyState !== "open") {
      return false;
    }
    channel.send(JSON.stringify(payload));
    return true;
  }

  function broadcastMultiplayerPeerMessage(payload, excludePeerId = "") {
    for (const [peerId, record] of multiplayerSession.peers.entries()) {
      if (excludePeerId && peerId === excludePeerId) continue;
      if (record.channel?.readyState === "open") {
        record.channel.send(JSON.stringify(payload));
      }
    }
  }

  async function handleMultiplayerRelay(fromPeerId, relayData) {
    if (!fromPeerId || !relayData || typeof relayData !== "object") {
      return;
    }
    const key = String(fromPeerId);
    let record = multiplayerSession.peers.get(key) || null;
    const ensureRecord = (initiator = false) => {
      if (record) return record;
      record = createMultiplayerPeerConnection(key, initiator);
      return record;
    };

    if (relayData.kind === "offer") {
      record = ensureRecord(false);
      await record.pc.setRemoteDescription(new RTCSessionDescription(relayData.sdp));
      const answer = await record.pc.createAnswer();
      await record.pc.setLocalDescription(answer);
      sendMultiplayerSignal({
        type: "signal_relay",
        roomCode: multiplayerSession.roomCode,
        to: key,
        data: { kind: "answer", sdp: answer }
      });
      return;
    }

    if (relayData.kind === "answer") {
      record = ensureRecord(true);
      await record.pc.setRemoteDescription(new RTCSessionDescription(relayData.sdp));
      return;
    }

    if (relayData.kind === "ice" && relayData.candidate) {
      record = ensureRecord(false);
      try {
        await record.pc.addIceCandidate(new RTCIceCandidate(relayData.candidate));
      } catch (error) {
        console.warn("ICE candidate failed:", error.message);
      }
    }
  }

  function bindMultiplayerDataChannel(peerId, channel) {
    if (!channel) return;
    const key = String(peerId);
    const record = multiplayerSession.peers.get(key);
    if (record) {
      record.channel = channel;
    }
    channel.onopen = () => {
      const current = multiplayerSession.peers.get(key);
      if (current) {
        current.connected = true;
      }
      if (isMultiplayerHost()) {
        sendMultiplayerPeerMessage(key, {
          type: "snapshot",
          roomCode: multiplayerSession.roomCode,
          hostId: multiplayerSession.clientId,
          world: buildMultiplayerWorldSnapshot(),
          worldState: buildMultiplayerWorldStatePacket(),
          players: [
            getLocalMultiplayerPlayerState(),
            ...Array.from(multiplayerSession.remotePlayers.values()).map((remote) => ({
              id: remote.id,
              username: remote.username,
              skinPreset: remote.skinPreset,
              skinDataUrl: remote.skinDataUrl,
              x: remote.x,
              y: remote.y,
              z: remote.z,
              yaw: remote.yaw,
              pitch: remote.pitch,
              onGround: remote.onGround,
              action: remote.action,
              animation: remote.animation
            }))
          ]
        });
      } else {
        sendMultiplayerPeerMessage(key, {
          type: "player_state",
          player: getLocalMultiplayerPlayerState()
        });
      }
      pushToast(`Peer connected: ${key}`);
    };
    channel.onclose = () => {
      const current = multiplayerSession.peers.get(key);
      if (current) {
        current.connected = false;
      }
      if (isMultiplayerGuest() && key === multiplayerSession.hostPeerId) {
        pushToast("The host disconnected.");
        teardownMultiplayerSession();
        mode = "menu";
        showHomeScreen();
        return;
      }
      removeRemotePlayerEntity(key);
      syncRenderEntityList();
    };
    channel.onerror = (error) => {
      console.warn(`Peer data channel error (${key}):`, error?.message || error);
    };
    channel.onmessage = (event) => {
      let payload = null;
      try {
        payload = JSON.parse(String(event.data || ""));
      } catch (error) {
        console.warn("Peer message parse failed:", error.message);
        return;
      }
      handleMultiplayerPeerPacket(key, payload);
    };
  }

  function createMultiplayerPeerConnection(peerId, initiator = false) {
    const key = String(peerId || "");
    const existing = multiplayerSession.peers.get(key);
    if (existing) {
      return existing;
    }
    const pc = new RTCPeerConnection({
      iceServers: DEFAULT_MULTIPLAYER_STUN_SERVERS
    });
    const record = {
      id: key,
      pc,
      channel: null,
      connected: false,
      lastAcceptedAt: 0
    };
    multiplayerSession.peers.set(key, record);
    if (isManualMultiplayerSession()) {
      pc.onicecandidate = () => {};
    } else {
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendMultiplayerSignal({
          type: "signal_relay",
          roomCode: multiplayerSession.roomCode,
          to: key,
          data: {
            kind: "ice",
            candidate: event.candidate
          }
        });
      };
    }
    pc.ondatachannel = (event) => {
      bindMultiplayerDataChannel(key, event.channel);
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        if (pc.connectionState !== "closed") {
          console.warn(`Peer connection ${key} changed to ${pc.connectionState}.`);
        }
      }
    };
    if (initiator) {
      const channel = pc.createDataChannel("freecube2");
      bindMultiplayerDataChannel(key, channel);
      if (isManualMultiplayerSession()) {
        return record;
      }
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          sendMultiplayerSignal({
            type: "signal_relay",
            roomCode: multiplayerSession.roomCode,
            to: key,
            data: {
              kind: "offer",
              sdp: pc.localDescription
            }
          });
        })
        .catch((error) => {
          console.warn("Peer offer failed:", error.message);
        });
    }
    return record;
  }

  function applyMultiplayerBlockUpdate(x, y, z, blockType) {
    if (!world) return false;
    if (blockType === BLOCK.AIR) {
      return setWorldBlockWithChecks(x, y, z, BLOCK.AIR, true);
    }
    return setWorldBlockWithChecks(x, y, z, blockType, false);
  }

  function maybeRejectPeerMove(record, nextState) {
    if (!isMultiplayerHost() || !multiplayerSession.cheatDetection) {
      return false;
    }
    const previous = multiplayerSession.remotePlayers.get(record.id);
    if (!previous) {
      return false;
    }
    const now = performance.now();
    const dtSeconds = Math.max(0.05, (now - (previous.lastUpdateAt || now)) / 1000);
    const distance = Math.hypot(
      (nextState.x || 0) - previous.x,
      (nextState.y || 0) - previous.y,
      (nextState.z || 0) - previous.z
    );
    const allowed = MULTIPLAYER_MAX_MOVE_SPEED * dtSeconds + 1.35;
    return distance > allowed;
  }

  function handleMultiplayerPeerPacket(peerId, payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }
    if (payload.type === "snapshot" && isMultiplayerGuest()) {
      startMultiplayerWorldFromSnapshot(payload.world);
      applyMultiplayerWorldStatePacket(payload.worldState);
      multiplayerSession.hostPeerId = String(payload.hostId || peerId);
      for (const playerState of payload.players || []) {
        upsertRemotePlayerEntity(playerState);
      }
      removeRemotePlayerEntity(multiplayerSession.clientId);
      syncRenderEntityList();
      pushToast(`Joined room ${multiplayerSession.roomCode}`);
      return;
    }

    if (payload.type === "players_state") {
      applyMultiplayerWorldStatePacket(payload.worldState);
      const seen = new Set();
      for (const playerState of payload.players || []) {
        const id = String(playerState?.id || "");
        if (!id || id === multiplayerSession.clientId) continue;
        seen.add(id);
        upsertRemotePlayerEntity(playerState);
      }
      for (const remoteId of Array.from(multiplayerSession.remotePlayers.keys())) {
        if (!seen.has(remoteId)) {
          removeRemotePlayerEntity(remoteId);
        }
      }
      syncRenderEntityList();
      return;
    }

    if (payload.type === "player_join") {
      upsertRemotePlayerEntity(payload.player || {});
      syncRenderEntityList();
      return;
    }

    if (payload.type === "player_leave") {
      closeMultiplayerPeer(payload.id, true);
      removeRemotePlayerEntity(payload.id);
      syncRenderEntityList();
      return;
    }

    if (payload.type === "block_update") {
      applyMultiplayerBlockUpdate(
        Math.floor(Number(payload.x) || 0),
        Math.floor(Number(payload.y) || 0),
        Math.floor(Number(payload.z) || 0),
        Number(payload.blockType)
      );
      return;
    }

    if (payload.type === "correction" && isMultiplayerGuest() && player) {
      player.setPosition(Number(payload.x) || player.x, Number(payload.y) || player.y, Number(payload.z) || player.z);
      player.yaw = Number.isFinite(payload.yaw) ? payload.yaw : player.yaw;
      player.pitch = Number.isFinite(payload.pitch) ? payload.pitch : player.pitch;
      return;
    }

    if (!isMultiplayerHost()) {
      return;
    }

    if (payload.type === "player_state") {
      const record = multiplayerSession.peers.get(String(peerId || ""));
      const nextState = payload.player && typeof payload.player === "object" ? payload.player : {};
      if (!record) return;
      if (maybeRejectPeerMove(record, nextState)) {
        sendMultiplayerPeerMessage(peerId, {
          type: "correction",
          x: multiplayerSession.remotePlayers.get(String(peerId))?.x || 0,
          y: multiplayerSession.remotePlayers.get(String(peerId))?.y || 0,
          z: multiplayerSession.remotePlayers.get(String(peerId))?.z || 0,
          yaw: multiplayerSession.remotePlayers.get(String(peerId))?.yaw || 0,
          pitch: multiplayerSession.remotePlayers.get(String(peerId))?.pitch || 0
        });
        return;
      }
      upsertRemotePlayerEntity({
        ...nextState,
        id: peerId
      });
      broadcastMultiplayerPeerMessage({
        type: "player_join",
        player: {
          ...nextState,
          id: peerId
        }
      }, String(peerId));
      syncRenderEntityList();
      return;
    }

    if (payload.type === "break_block_request") {
      const remote = multiplayerSession.remotePlayers.get(String(peerId || ""));
      const x = Math.floor(Number(payload.x) || 0);
      const y = Math.floor(Number(payload.y) || 0);
      const z = Math.floor(Number(payload.z) || 0);
      if (!remote || !world || !Number.isFinite(x + y + z)) return;
      const targetType = world.peekBlock(x, y, z);
      if (targetType === BLOCK.AIR || targetType === BLOCK.BEDROCK || isFluidBlock(targetType)) return;
      if (multiplayerSession.cheatDetection) {
        const distance = Math.hypot(remote.x - (x + 0.5), remote.y + PLAYER_EYE_HEIGHT - (y + 0.5), remote.z - (z + 0.5));
        if (distance > MULTIPLAYER_MAX_REACH) return;
      }
      if (!applyMultiplayerBlockUpdate(x, y, z, BLOCK.AIR)) return;
      broadcastMultiplayerPeerMessage({
        type: "block_update",
        x,
        y,
        z,
        blockType: BLOCK.AIR
      });
      return;
    }

    if (payload.type === "place_block_request") {
      const remote = multiplayerSession.remotePlayers.get(String(peerId || ""));
      const x = Math.floor(Number(payload.x) || 0);
      const y = Math.floor(Number(payload.y) || 0);
      const z = Math.floor(Number(payload.z) || 0);
      const blockType = Number(payload.blockType) || BLOCK.AIR;
      if (!remote || !world || !blockType || blockType === BLOCK.AIR) return;
      if (multiplayerSession.cheatDetection) {
        const distance = Math.hypot(remote.x - (x + 0.5), remote.y + PLAYER_EYE_HEIGHT - (y + 0.5), remote.z - (z + 0.5));
        if (distance > MULTIPLAYER_MAX_REACH) return;
      }
      if (world.peekBlock(x, y, z) !== BLOCK.AIR) return;
      if (!applyMultiplayerBlockUpdate(x, y, z, blockType)) return;
      broadcastMultiplayerPeerMessage({
        type: "block_update",
        x,
        y,
        z,
        blockType
      });
    }
  }

  function handleMultiplayerSignalMessage(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }
    switch (payload.type) {
      case "connected":
        if (payload.id) {
          multiplayerSession.clientId = String(payload.id);
        }
        break;
      case "signal_registered":
        multiplayerSession.clientId = String(payload.clientId || multiplayerSession.clientId || "");
        multiplayerSession.socketState = "online";
        requestMultiplayerRoomList();
        sendMultiplayerSignal({ type: "ping" });
        if (ui?.multiplayerDirectInputEl && !ui.multiplayerDirectInputEl.value.trim()) {
          ui.multiplayerDirectInputEl.value = multiplayerState.directConnectUrl;
        }
        break;
      case "pong":
        multiplayerState.dedicatedServers = Array.isArray(payload.dedicatedServers)
          ? payload.dedicatedServers.map((server) => ({
              id: `dedicated-${String(server.id || generateId())}`,
              kind: "dedicated",
              code: String(server.id || ""),
              serverId: String(server.id || ""),
              name: String(server.name || "Dedicated Server"),
              subtitle: String(server.motd || "Dedicated multiplayer world"),
              address: multiplayerSession.signalingUrl || getMultiplayerSocketUrl(),
              statusText: `Server ${String(server.id || "default")}`,
              playersLabel: `${Math.max(0, Number(server.playerCount) || 0)}/${Math.max(2, Number(server.maxPlayers) || 8)}`,
              signalLabel: "DEDI",
              healthy: true
            }))
          : [];
        renderMultiplayerMenu();
        break;
      case "signal_room_list":
        multiplayerState.signalRooms = Array.isArray(payload.rooms)
          ? payload.rooms.map((room) => ({
              id: `room-${String(room.code || generateId())}`,
              kind: "signal_room",
              code: String(room.code || ""),
              serverId: "",
              name: String(room.name || `${GAME_SHORT_TITLE} LAN World`),
              subtitle: room.private ? "Private LAN world" : "LAN world on this network",
              address: multiplayerSession.signalingUrl || getMultiplayerSocketUrl(),
              statusText: room.cheatDetection ? "Cheat detection on" : "Cheat detection off",
              playersLabel: `${Math.max(0, Number(room.playerCount) || 0)}/${Math.max(2, Number(room.maxPlayers) || 8)}`,
              signalLabel: "LAN",
              healthy: true
            }))
          : [];
        renderMultiplayerMenu();
        break;
      case "signal_room_created":
        multiplayerSession.roomCode = String(payload.room?.code || "");
        multiplayerSession.roomName = String(payload.room?.name || multiplayerSession.roomName || `${GAME_SHORT_TITLE} LAN World`);
        multiplayerSession.roomPrivate = !!payload.room?.private;
        multiplayerSession.cheatDetection = !!payload.room?.cheatDetection;
        multiplayerSession.isHost = true;
        multiplayerSession.hostPeerId = multiplayerSession.clientId;
        multiplayerSession.joinPending = false;
        multiplayerState.selectedRoomCode = multiplayerSession.roomCode;
        renderMultiplayerMenu();
        pushToast(`LAN room code: ${multiplayerSession.roomCode}`);
        alert(multiplayerSession.roomPrivate
          ? `LAN world open.\n\nShort code: ${multiplayerSession.roomCode}\nPrivate: Yes\nGive this code to friends on your network.\nNo reply code is needed.`
          : `LAN world open.\n\nVisible in Multiplayer on this network.\nShort code: ${multiplayerSession.roomCode}\nNo reply code is needed.`);
        break;
      case "signal_room_joined":
        multiplayerSession.roomCode = String(payload.room?.code || multiplayerSession.roomCode || "");
        multiplayerSession.roomName = String(payload.room?.name || multiplayerSession.roomName || `${GAME_SHORT_TITLE} LAN World`);
        multiplayerSession.roomPrivate = !!payload.room?.private;
        multiplayerSession.cheatDetection = !!payload.room?.cheatDetection;
        multiplayerSession.isHost = !!payload.isHost;
        multiplayerSession.hostPeerId = String(payload.hostPeerId || "");
        multiplayerSession.joinPending = false;
        multiplayerState.selectedRoomCode = multiplayerSession.roomCode;
        renderMultiplayerMenu();
        if (!multiplayerSession.isHost && multiplayerSession.hostPeerId) {
          createMultiplayerPeerConnection(multiplayerSession.hostPeerId, false);
          ensureUI();
          ui.showScreen("loading");
          ui.loadText.textContent = `Joining room ${multiplayerSession.roomCode}`;
          ui.loadSub.textContent = "Waiting for host snapshot...";
        }
        break;
      case "signal_room_peer_joined":
        if (isMultiplayerHost() && payload.peer?.id) {
          const spawn = getPreferredRespawnPoint();
          upsertRemotePlayerEntity({
            id: payload.peer.id,
            username: payload.peer.username,
            skinPreset: payload.peer.skinPreset,
            skinDataUrl: payload.peer.skinDataUrl,
            x: spawn.x,
            y: spawn.y,
            z: spawn.z,
            yaw: 0,
            pitch: 0
          });
          createMultiplayerPeerConnection(String(payload.peer.id), true);
          syncRenderEntityList();
        }
        break;
      case "signal_room_peer_left":
        closeMultiplayerPeer(payload.peerId, true);
        removeRemotePlayerEntity(payload.peerId);
        broadcastMultiplayerPeerMessage({
          type: "player_leave",
          id: String(payload.peerId || "")
        });
        syncRenderEntityList();
        break;
      case "signal_relay":
        handleMultiplayerRelay(payload.from, payload.data).catch((error) => {
          console.warn("Relay handling failed:", error.message);
        });
        break;
      case "signal_room_closed":
        if (payload.roomCode && payload.roomCode === multiplayerSession.roomCode) {
          pushToast("The multiplayer room closed.");
          teardownMultiplayerSession({ preserveBrowser: true });
          if (mode !== "menu") {
            mode = "menu";
            showHomeScreen();
          }
        }
        requestMultiplayerRoomList();
        break;
      case "signal_error":
        alert(String(payload.message || "Can't connect."));
        multiplayerSession.joinPending = false;
        break;
      default:
        break;
    }
  }

  function handleDedicatedServerMessage(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }
    switch (payload.type) {
      case "welcome":
        startDedicatedMultiplayerWorld(payload);
        break;
      case "player_join":
        upsertRemotePlayerEntity(payload.player || {});
        syncRenderEntityList();
        break;
      case "player_state":
        upsertRemotePlayerEntity(payload.player || {});
        syncRenderEntityList();
        break;
      case "player_leave":
        removeRemotePlayerEntity(payload.id);
        syncRenderEntityList();
        break;
      case "block_update":
        applyMultiplayerBlockUpdate(
          Math.floor(Number(payload.x) || 0),
          Math.floor(Number(payload.y) || 0),
          Math.floor(Number(payload.z) || 0),
          Number(payload.blockType)
        );
        break;
      case "chunk_data":
        for (const chunk of payload.chunks || []) {
          for (const blockUpdate of chunk.blocks || []) {
            applyMultiplayerBlockUpdate(
              Math.floor(Number(blockUpdate.x) || 0),
              Math.floor(Number(blockUpdate.y) || 0),
              Math.floor(Number(blockUpdate.z) || 0),
              Number(blockUpdate.blockType)
            );
          }
        }
        break;
      case "server_error":
        alert(String(payload.message || "Can't connect."));
        multiplayerSession.joinPending = false;
        break;
      default:
        break;
    }
  }

  function handleMultiplayerSocketMessage(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }
    if (payload.type === "connected" || payload.type === "pong" || String(payload.type || "").startsWith("signal_")) {
      handleMultiplayerSignalMessage(payload);
      return;
    }
    handleDedicatedServerMessage(payload);
  }

  function ensureMultiplayerSignalingConnection(rawUrl = multiplayerState.directConnectUrl || DEFAULT_MULTIPLAYER_SERVER_URL) {
    const targetUrl = getMultiplayerSocketUrl(rawUrl);
    multiplayerState.directConnectUrl = targetUrl;
    if (multiplayerSession.socket && multiplayerSession.socket.readyState === WebSocket.OPEN && multiplayerSession.signalingUrl === targetUrl) {
      sendMultiplayerSignal({
        type: "signal_register",
        ...getLocalMultiplayerProfile()
      });
      return Promise.resolve(multiplayerSession.socket);
    }
    if (multiplayerSession.socket) {
      teardownMultiplayerSession();
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(targetUrl);
      multiplayerSession.signalingUrl = targetUrl;
      multiplayerSession.socket = socket;
      multiplayerSession.socketState = "connecting";
      socket.addEventListener("open", () => {
        multiplayerSession.socketState = "online";
        sendMultiplayerSignal({
          type: "signal_register",
          ...getLocalMultiplayerProfile()
        });
        settled = true;
        resolve(socket);
      });
      socket.addEventListener("message", (event) => {
        let payload = null;
        try {
          payload = JSON.parse(String(event.data || ""));
        } catch (error) {
          console.warn("Signaling message parse failed:", error.message);
          return;
        }
        handleMultiplayerSocketMessage(payload);
      });
      socket.addEventListener("close", () => {
        multiplayerSession.socketState = "offline";
        multiplayerSession.socket = null;
        if (isMultiplayerSessionActive()) {
          pushToast("Multiplayer signaling disconnected.");
          teardownMultiplayerSession({ preserveBrowser: true });
          if (mode !== "menu") {
            mode = "menu";
            showHomeScreen();
          }
        }
      });
      socket.addEventListener("error", (event) => {
        if (!settled) {
          reject(new Error("Can't connect."));
        }
      });
    });
  }

  function requestMultiplayerRoomList() {
    if (!MULTIPLAYER_ENABLED) return;
    if (isManualMultiplayerSession()) {
      multiplayerState.signalRooms = [];
      multiplayerState.dedicatedServers = [];
      renderMultiplayerMenu();
      return;
    }
    if (!multiplayerSession.socket || multiplayerSession.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    sendMultiplayerSignal({ type: "signal_list_rooms" });
  }

  async function joinManualLanSession(offerCode = "") {
    const response = offerCode
      ? { rawValue: offerCode, payload: await decodeMultiplayerSignalPayload(offerCode) }
      : await readManualMultiplayerCode("Paste the host LAN code:");
    if (!response) {
      return false;
    }
    const payload = response.payload;
    if (!payload || payload.type !== "freecube2_lan_offer" || !payload.sdp) {
      throw new Error("Can't connect.");
    }
    teardownMultiplayerSession({ preserveBrowser: true });
    multiplayerSession.signalMode = "manual";
    multiplayerSession.clientId = generateId();
    multiplayerSession.roomCode = String(payload.roomCode || buildManualLanRoomCode(generateId)).slice(0, 7).toUpperCase();
    multiplayerSession.roomName = `${GAME_SHORT_TITLE} LAN World`;
    multiplayerSession.roomPrivate = true;
    multiplayerSession.cheatDetection = !!payload.cheatDetection;
    multiplayerSession.isHost = false;
    multiplayerSession.hostPeerId = "manual-peer";
    multiplayerSession.joinPending = true;
    multiplayerState.selectedRoomCode = multiplayerSession.roomCode;
    const record = createMultiplayerPeerConnection(multiplayerSession.hostPeerId, false);
    await record.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await record.pc.createAnswer();
    await record.pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(record.pc);
    ensureUI();
    ui.showScreen("loading");
    ui.loadText.textContent = `Joining room ${multiplayerSession.roomCode}`;
    ui.loadSub.textContent = "Waiting for the host to finish linking...";
    showManualMultiplayerCode(
      "Send this reply code to the host:",
      await encodeMultiplayerSignalPayload({
        type: "freecube2_lan_answer",
        version: 2,
        roomCode: multiplayerSession.roomCode,
        sdp: record.pc.localDescription
      }),
      {
        onCopy() {
          pushToast("Code copied", "Paste it for the other player.");
        }
      }
    );
    return true;
  }

  async function joinSignalMultiplayerRoom(rawUrl = multiplayerState.directConnectUrl || DEFAULT_MULTIPLAYER_SERVER_URL, roomCode = "") {
    const normalizedCode = String(roomCode || multiplayerState.selectedRoomCode || "").trim().toUpperCase();
    if (!normalizedCode) {
      throw new Error("Can't connect.");
    }
    const socketUrl = getMultiplayerSocketUrl(rawUrl);
    await ensureMultiplayerSignalingConnection(socketUrl);
    multiplayerSession.sessionKind = "manual";
    multiplayerSession.signalMode = "socket";
    multiplayerSession.roomCode = normalizedCode;
    multiplayerSession.roomName = "";
    multiplayerSession.roomPrivate = false;
    multiplayerSession.cheatDetection = false;
    multiplayerSession.isHost = false;
    multiplayerSession.hostPeerId = "";
    multiplayerSession.joinPending = true;
    multiplayerState.directConnectUrl = socketUrl;
    multiplayerState.selectedRoomCode = normalizedCode;
    ensureUI();
    ui.showScreen("loading");
    ui.loadText.textContent = `Joining room ${normalizedCode}`;
    ui.loadSub.textContent = socketUrl;
    sendMultiplayerSignal({
      type: "signal_join_room",
      roomCode: normalizedCode
    });
    return true;
  }

  async function hostWorldOnLan() {
    if (!world || !player || !activeWorldId) {
      alert("Load a local world before opening it to LAN.");
      return false;
    }
    if (isMultiplayerHost()) {
      const shouldClose = confirm(`Close LAN room ${multiplayerSession.roomCode}?`);
      if (shouldClose) {
        sendMultiplayerSignal({
          type: "signal_close_room",
          roomCode: multiplayerSession.roomCode
        });
        teardownMultiplayerSession({ preserveBrowser: true });
        renderMultiplayerMenu();
      }
      return shouldClose;
    }
    if (isMultiplayerGuest()) {
      alert("Leave the current multiplayer world before opening a local world to LAN.");
      return false;
    }
    const roomName = String(prompt("LAN world name:", store?.getWorldMeta(activeWorldId)?.name || `${GAME_SHORT_TITLE} LAN World`) || "").trim() || `${GAME_SHORT_TITLE} LAN World`;
    const privateRoom = confirm("Make this LAN world private?\n\nOK = private short code only\nCancel = visible in the LAN browser");
    const cheatDetection = confirm("Enable cheat detection? This uses more resources, but validates movement and block reach.");
    const socketUrl = getMultiplayerSocketUrl(multiplayerState.directConnectUrl || DEFAULT_MULTIPLAYER_SERVER_URL);
    await ensureMultiplayerSignalingConnection(socketUrl);
    teardownMultiplayerSession({ keepSocket: true, preserveBrowser: true });
    multiplayerSession.sessionKind = "manual";
    multiplayerSession.signalMode = "socket";
    multiplayerSession.signalingUrl = socketUrl;
    multiplayerSession.roomName = roomName;
    multiplayerSession.roomPrivate = privateRoom;
    multiplayerSession.cheatDetection = cheatDetection;
    multiplayerSession.isHost = false;
    multiplayerSession.hostPeerId = "";
    multiplayerSession.joinPending = false;
    multiplayerState.directConnectUrl = socketUrl;
    renderMultiplayerMenu();
    sendMultiplayerSignal({
      type: "signal_create_room",
      name: roomName,
      private: privateRoom,
      cheatDetection
    });
    return true;
  }

  async function refreshDedicatedServerBrowser(rawUrl = multiplayerState.directConnectUrl || DEFAULT_MULTIPLAYER_SERVER_URL) {
    try {
      await ensureMultiplayerSignalingConnection(rawUrl);
      sendMultiplayerSignal({ type: "ping" });
      return true;
    } catch (error) {
      multiplayerState.signalRooms = [];
      multiplayerState.dedicatedServers = [];
      renderMultiplayerMenu();
      throw error;
    }
  }

  async function joinDedicatedMultiplayerServer(rawUrl = multiplayerState.directConnectUrl || DEFAULT_MULTIPLAYER_SERVER_URL, serverId = "") {
    const socketUrl = getMultiplayerSocketUrl(rawUrl);
    await ensureMultiplayerSignalingConnection(socketUrl);
    multiplayerSession.sessionKind = "dedicated";
    multiplayerSession.signalMode = "socket";
    multiplayerSession.dedicatedServerId = String(serverId || multiplayerState.selectedRoomCode || "default").trim() || "default";
    multiplayerSession.dedicatedServerName = "";
    multiplayerSession.roomCode = multiplayerSession.dedicatedServerId;
    multiplayerSession.roomName = "";
    multiplayerSession.roomPrivate = false;
    multiplayerSession.cheatDetection = false;
    multiplayerSession.isHost = false;
    multiplayerSession.hostPeerId = "";
    multiplayerSession.joinPending = true;
    multiplayerState.directConnectUrl = socketUrl;
    ensureUI();
    ui.showScreen("loading");
    ui.loadText.textContent = `Joining server ${multiplayerSession.dedicatedServerId}`;
    ui.loadSub.textContent = socketUrl;
    sendMultiplayerSignal({
      type: "hello",
      serverId: multiplayerSession.dedicatedServerId,
      ...getLocalMultiplayerProfile(),
      ...(player ? getLocalMultiplayerPlayerState() : {})
    });
    return true;
  }

  async function joinMultiplayerRoom(roomCode = "") {
    const requestedCode = String(roomCode || multiplayerState.selectedRoomCode || "").trim();
    const manualPayload = requestedCode ? await decodeMultiplayerSignalPayload(requestedCode) : null;
    if (manualPayload?.type === "freecube2_lan_offer") {
      return joinManualLanSession(requestedCode);
    }
    if (isLikelySignalRoomCode(requestedCode)) {
      return joinSignalMultiplayerRoom(multiplayerState.directConnectUrl || DEFAULT_MULTIPLAYER_SERVER_URL, requestedCode);
    }
    return joinDedicatedMultiplayerServer(requestedCode || multiplayerState.directConnectUrl || DEFAULT_MULTIPLAYER_SERVER_URL, "");
  }

  function updateMultiplayerSession(dt) {
    if (!isMultiplayerSessionActive() || !player || mode !== "playing") {
      return;
    }
    multiplayerSession.lastPlayerSyncAt += dt;
    multiplayerSession.lastWorldSyncAt += dt;
    if (isMultiplayerGuest()) {
      if (multiplayerSession.lastPlayerSyncAt >= MULTIPLAYER_PLAYER_SYNC_INTERVAL) {
        multiplayerSession.lastPlayerSyncAt = 0;
        if (isDedicatedMultiplayerSession()) {
          sendMultiplayerSignal({
            type: "player_state",
            player: getLocalMultiplayerPlayerState()
          });
        } else {
          sendMultiplayerPeerMessage(multiplayerSession.hostPeerId, {
            type: "player_state",
            player: getLocalMultiplayerPlayerState()
          });
        }
      }
      return;
    }
    if (multiplayerSession.lastPlayerSyncAt >= MULTIPLAYER_PLAYER_SYNC_INTERVAL) {
      multiplayerSession.lastPlayerSyncAt = 0;
      broadcastMultiplayerPeerMessage({
        type: "players_state",
        players: [
          getLocalMultiplayerPlayerState(),
          ...Array.from(multiplayerSession.remotePlayers.values()).map((remote) => ({
            id: remote.id,
            username: remote.username,
            skinPreset: remote.skinPreset,
            skinDataUrl: remote.skinDataUrl,
            x: remote.x,
            y: remote.y,
            z: remote.z,
            yaw: remote.yaw,
            pitch: remote.pitch,
            onGround: remote.onGround,
            action: remote.action,
            animation: remote.animation
          }))
        ],
        worldState: buildMultiplayerWorldStatePacket()
      });
    } else if (multiplayerSession.lastWorldSyncAt >= MULTIPLAYER_WORLD_SYNC_INTERVAL) {
      multiplayerSession.lastWorldSyncAt = 0;
      broadcastMultiplayerPeerMessage({
        type: "players_state",
        players: [
          getLocalMultiplayerPlayerState(),
          ...Array.from(multiplayerSession.remotePlayers.values()).map((remote) => ({
            id: remote.id,
            username: remote.username,
            skinPreset: remote.skinPreset,
            skinDataUrl: remote.skinDataUrl,
            x: remote.x,
            y: remote.y,
            z: remote.z,
            yaw: remote.yaw,
            pitch: remote.pitch,
            onGround: remote.onGround,
            action: remote.action,
            animation: remote.animation
          }))
        ],
        worldState: buildMultiplayerWorldStatePacket()
      });
    }
  }

  function formatVolumeLabel(value) {
    return `${Math.round(clamp(value, 0, 1) * 100)}%`;
  }

  function cycleVolumePreset(value) {
    const rounded = Math.round(clamp(value, 0, 1) * 100) / 100;
    const currentIndex = Math.max(0, VOLUME_PRESETS.findIndex((preset) => Math.abs(preset - rounded) < 0.001));
    return VOLUME_PRESETS[(currentIndex + 1) % VOLUME_PRESETS.length];
  }

  function normalizeSettingsState(value = {}, previousState = {}) {
    const next = { ...DEFAULT_SETTINGS, ...previousState, ...(value && typeof value === "object" ? value : {}) };
    next.renderDistanceChunks = clamp(next.renderDistanceChunks || DEFAULT_RENDER_DISTANCE, 2, 6);
    next.mouseSensitivity = clamp(next.mouseSensitivity || DEFAULT_SETTINGS.mouseSensitivity, 0.0012, 0.006);
    next.fovDegrees = clamp(Math.round(next.fovDegrees || DEFAULT_SETTINGS.fovDegrees), 55, 95);
    next.showFps = next.showFps !== false;
    next.viewBobbing = next.viewBobbing !== false;
    next.shadows = next.shadows !== false;
    next.graphicsMode = next.graphicsMode === "fancy" ? "fancy" : DEFAULT_SETTINGS.graphicsMode;
    next.chunkLagFix = next.chunkLagFix !== false;
    next.fullscreen = !!next.fullscreen;
    next.masterVolume = clamp(Number.isFinite(next.masterVolume) ? next.masterVolume : DEFAULT_SETTINGS.masterVolume, 0, 1);
    next.musicVolume = clamp(Number.isFinite(next.musicVolume) ? next.musicVolume : DEFAULT_SETTINGS.musicVolume, 0, 1);
    next.performancePreset = PERFORMANCE_PRESETS.includes(next.performancePreset) ? next.performancePreset : DEFAULT_SETTINGS.performancePreset;
    next.customResourcePacks = getCustomResourcePacks(next);
    next.texturePack = getAvailableResourcePackNames(next).includes(next.texturePack) ? next.texturePack : DEFAULT_SETTINGS.texturePack;
    next.playerSkinPreset = isValidPlayerSkinPreset(next.playerSkinPreset) ? next.playerSkinPreset : DEFAULT_SETTINGS.playerSkinPreset;
    next.playerSkinDataUrl = typeof next.playerSkinDataUrl === "string" ? next.playerSkinDataUrl : "";
    if (next.playerSkinPreset === "custom" && !next.playerSkinDataUrl) {
      next.playerSkinPreset = DEFAULT_SETTINGS.playerSkinPreset;
    }
    next.mobModels = next.mobModels !== false;
    next.invertY = !!next.invertY;
    next.gameMode = next.gameMode === GAME_MODE.CREATIVE ? GAME_MODE.CREATIVE : GAME_MODE.SURVIVAL;
    return next;
  }

  function saveGlobalSettings() {
    settings = normalizeSettingsState(settings);
    try {
      localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.warn("Global settings save failed:", error.message);
      return false;
    }
  }

  function loadGlobalSettings() {
    try {
      const raw = getFirstStoredValue([GLOBAL_SETTINGS_KEY, ...LEGACY_GLOBAL_SETTINGS_KEYS]);
      if (!raw) {
        settings = normalizeSettingsState(DEFAULT_SETTINGS);
        return settings;
      }
      settings = normalizeSettingsState(JSON.parse(raw), settings);
    } catch (error) {
      console.warn("Global settings load failed:", error.message);
      settings = normalizeSettingsState(DEFAULT_SETTINGS);
    }
    return settings;
  }

  function buildWeatherRenderState() {
    return {
      timeSeconds: worldTime,
      intensity: weatherVisualIntensity,
      runtimeLowFps: fpsSmoothed > 0 && fpsSmoothed < 42,
      weather: {
        type: weather.type,
        flash: weather.flash || 0,
        lightningTimer: weather.lightningTimer || 0
      }
    };
  }

  function clearInventoryCursor() {
    inventoryCursor.type = BLOCK.AIR;
    inventoryCursor.count = 0;
    inventoryCursor.durability = 0;
  }

  function getHeldEnchantmentLevel(name) {
    const maxLevel = ENCHANTMENT_DEFS[name]?.maxLevel || 5;
    return clamp(Math.floor(Number(player?.enchantments?.held?.[name]) || 0), 0, maxLevel);
  }

  function getArmorEnchantmentLevel(name) {
    const maxLevel = ENCHANTMENT_DEFS[name]?.maxLevel || 5;
    return clamp(Math.floor(Number(player?.enchantments?.armor?.[name]) || 0), 0, maxLevel);
  }

  function getDurabilityPercent(itemType, durability) {
    const maxDurability = getItemMaxDurability(itemType);
    if (maxDurability <= 0) return 0;
    return clamp((normalizeDurabilityValue(itemType, durability) / maxDurability) * 100, 0, 100);
  }

  function addPlayerStat(key, amount = 1) {
    if (!player?.stats || !Object.prototype.hasOwnProperty.call(player.stats, key)) return;
    player.stats[key] = Math.max(0, (player.stats[key] || 0) + (Number(amount) || 0));
    if (world) {
      world.saveDirty = true;
    }
  }

  function queueToast(title, detail = "", duration = 4.5, kind = "sys") {
    toastQueue.push({
      id: generateId(),
      title: String(title || "").slice(0, 80),
      detail: String(detail || "").slice(0, 120),
      duration: Math.max(1, Number(duration) || 4.5),
      ttl: Math.max(1, Number(duration) || 4.5),
      kind
    });
    if (toastQueue.length > 5) {
      toastQueue = toastQueue.slice(toastQueue.length - 5);
    }
  }

  function pushToast(title, detail = "", duration = 4.5, kind = "sys") {
    queueToast(title, detail, duration, kind);
  }

  function updateToasts(dt) {
    if (!ui?.toastEl) return;
    toastQueue = toastQueue
      .map((toast) => ({ ...toast, ttl: toast.ttl - dt }))
      .filter((toast) => toast.ttl > 0);
    ui.toastEl.innerHTML = "";
    for (const toast of toastQueue) {
      const el = document.createElement("div");
      el.className = `fc-toast ${toast.kind}`;
      const fade = clamp(toast.ttl / toast.duration, 0, 1);
      el.style.opacity = String(clamp(fade * 1.15, 0, 1));
      el.innerHTML = `<div class="fc-toast-title">${toast.title}</div>${toast.detail ? `<div class="fc-toast-detail">${toast.detail}</div>` : ""}`;
      ui.toastEl.appendChild(el);
    }
  }

  function updateEffectsHud() {
    if (!ui?.effectsEl || !player) return;
    const entries = Object.entries(player.effects || {})
      .filter(([, effect]) => effect && effect.time > 0 && effect.level > 0)
      .sort((a, b) => a[1].time - b[1].time);
    if (entries.length === 0 || mode !== "playing" || inventoryOpen || sleepState.active) {
      ui.effectsEl.style.display = "none";
      ui.effectsEl.innerHTML = "";
      return;
    }
    ui.effectsEl.style.display = "flex";
    ui.effectsEl.innerHTML = "";
    for (const [key, effect] of entries) {
      const chip = document.createElement("div");
      chip.className = `fc-effect-chip${EFFECT_DEFS[key]?.positive === false ? " bad" : ""}`;
      chip.textContent = `${EFFECT_DEFS[key]?.label || key} ${effect.level} (${Math.ceil(effect.time)}s)`;
      ui.effectsEl.appendChild(chip);
    }
  }

  function unlockPlayerAchievement(id) {
    if (!player?.achievements || !ACHIEVEMENT_DEFS[id]) {
      return false;
    }
    const achievement = player.achievements[id] || { done: false, unlockedAt: 0 };
    if (achievement.done) {
      return false;
    }
    const parent = ACHIEVEMENT_DEFS[id].parent;
    if (parent && !player.achievements[parent]?.done) {
      return false;
    }
    achievement.done = true;
    achievement.unlockedAt = Date.now();
    player.achievements[id] = achievement;
    queueToast(ACHIEVEMENT_DEFS[id].title, ACHIEVEMENT_DEFS[id].desc, 5.6, "adv");
    pushChatLine(`Advancement made! ${ACHIEVEMENT_DEFS[id].title}`, "sys");
    if (world) {
      world.saveDirty = true;
    }
    return true;
  }

  function applyPlayerEffect(name, level = 1, durationSeconds = 30, announce = true) {
    if (!player) return false;
    const key = sanitizeEffectKey(name);
    if (!key) return false;
    const nextLevel = clamp(Math.floor(Number(level) || 1), 1, 10);
    const nextTime = Math.max(1, Number(durationSeconds) || 1);
    const current = player.effects[key];
    player.effects[key] = {
      level: current ? Math.max(current.level, nextLevel) : nextLevel,
      time: current ? Math.max(current.time, nextTime) : nextTime,
      maxTime: current ? Math.max(current.maxTime || 0, nextTime) : nextTime
    };
    addPlayerStat("effectsUsed", 1);
    unlockPlayerAchievement("local_brewery");
    if (announce) {
      queueToast(EFFECT_DEFS[key]?.label || key, `Level ${nextLevel} for ${Math.ceil(nextTime)}s`, 4.2, EFFECT_DEFS[key]?.positive === false ? "bad" : "buff");
      pushChatLine(`Effect applied: ${EFFECT_DEFS[key]?.label || key} ${nextLevel}`, "sys");
    }
    return true;
  }

  function addEnchantmentLevel(slotKey, enchantKey, levels = 1, announce = true) {
    if (!player || !player.enchantments || !ENCHANTMENT_DEFS[enchantKey]) {
      return false;
    }
    const section = slotKey === "armor" ? "armor" : "held";
    const maxLevel = ENCHANTMENT_DEFS[enchantKey].maxLevel || 5;
    const current = Math.max(0, Number(player.enchantments[section][enchantKey]) || 0);
    const next = clamp(current + Math.max(1, Math.floor(Number(levels) || 1)), 0, maxLevel);
    if (next === current) {
      return false;
    }
    player.enchantments[section][enchantKey] = next;
    unlockPlayerAchievement("enchanter");
    if (world) {
      world.saveDirty = true;
    }
    if (announce) {
      queueToast(ENCHANTMENT_DEFS[enchantKey].label, `${section === "armor" ? "Armor" : "Held"} gear ${next}`, 4.6, "adv");
      pushChatLine(`${ENCHANTMENT_DEFS[enchantKey].label} ${next} applied to ${section}.`, "sys");
    }
    return true;
  }

  function countInventoryItem(itemType) {
    if (!player || !itemType || itemType === BLOCK.AIR) return 0;
    let total = 0;
    for (let i = 0; i < INVENTORY_SLOTS; i += 1) {
      if ((player.inventoryCounts[i] || 0) > 0 && player.inventoryTypes[i] === itemType) {
        total += player.inventoryCounts[i] || 0;
      }
    }
    return total;
  }

  function removeInventoryItem(itemType, count) {
    if (!player || !itemType || itemType === BLOCK.AIR || count <= 0) return 0;
    let remaining = Math.max(0, Math.floor(count));
    for (let i = 0; i < INVENTORY_SLOTS && remaining > 0; i += 1) {
      if (player.inventoryTypes[i] !== itemType || (player.inventoryCounts[i] || 0) <= 0) continue;
      const take = Math.min(remaining, player.inventoryCounts[i] || 0);
      player.inventoryCounts[i] -= take;
      remaining -= take;
      if ((player.inventoryCounts[i] || 0) <= 0) {
        player.inventoryTypes[i] = BLOCK.AIR;
        player.inventoryCounts[i] = 0;
        player.inventoryDurability[i] = 0;
      }
    }
    if (remaining < count) {
      setHotbarImages();
      if (inventoryOpen) renderInventoryUI();
      if (world) world.saveDirty = true;
    }
    return count - remaining;
  }

  function damageSelectedHeldItem(amount = 1) {
    if (!player || isCreativeMode()) return false;
    const index = player.selectedHotbarSlot;
    const itemType = player.hotbarTypes[index] || BLOCK.AIR;
    const maxDurability = getItemMaxDurability(itemType);
    if (maxDurability <= 0 || (player.hotbarCounts[index] || 0) <= 0) {
      return false;
    }
    const unbreaking = getHeldEnchantmentLevel("unbreaking");
    for (let i = 0; i < Math.max(1, Math.floor(amount)); i += 1) {
      if (unbreaking > 0 && Math.random() < unbreaking / (unbreaking + 1)) {
        continue;
      }
      const nextDurability = Math.max(0, (player.inventoryDurability[index] || maxDurability) - 1);
      player.inventoryDurability[index] = nextDurability;
      if (nextDurability <= 0) {
        player.hotbarTypes[index] = BLOCK.AIR;
        player.hotbarCounts[index] = 0;
        player.inventoryDurability[index] = 0;
        queueToast(`${getItemName(itemType)} broke`, "Your tool ran out of durability.", 3.5, "bad");
        break;
      }
    }
    setHotbarImages();
    if (inventoryOpen) renderInventoryUI();
    if (world) world.saveDirty = true;
    return true;
  }

  function damageArmorFromHit(amount = 1) {
    if (!player || isCreativeMode()) return;
    const hits = Math.max(1, Math.ceil((Number(amount) || 1) / 4));
    const unbreaking = getArmorEnchantmentLevel("unbreaking");
    for (let index = 0; index < ARMOR_SLOTS; index += 1) {
      if ((player.armorCounts[index] || 0) <= 0) continue;
      const itemType = player.armorTypes[index] || BLOCK.AIR;
      const maxDurability = getItemMaxDurability(itemType);
      if (maxDurability <= 0) continue;
      for (let step = 0; step < hits; step += 1) {
        if (unbreaking > 0 && Math.random() < unbreaking / (unbreaking + 1)) {
          continue;
        }
        player.armorDurability[index] = Math.max(0, (player.armorDurability[index] || maxDurability) - 1);
        if (player.armorDurability[index] <= 0) {
          const brokenName = getItemName(itemType);
          player.armorTypes[index] = BLOCK.AIR;
          player.armorCounts[index] = 0;
          player.armorDurability[index] = 0;
          queueToast(`${brokenName} broke`, "Your armor could not take another hit.", 3.5, "bad");
          break;
        }
      }
    }
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
        #freecube2-effects{position:fixed;right:14px;top:64px;display:none;flex-direction:column;gap:8px;z-index:1001;pointer-events:none}
        .fc-effect-chip{padding:8px 10px;background:rgba(10,22,18,0.72);border:1px solid rgba(126,229,178,0.34);border-radius:10px;color:#dfffea;font:700 12px/1.1 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 8px 20px rgba(0,0,0,0.22)}
        .fc-effect-chip.bad{background:rgba(30,12,12,0.76);border-color:rgba(255,120,120,0.38);color:#ffdada}
        #freecube2-toast{position:fixed;right:14px;top:14px;display:flex;flex-direction:column;gap:8px;z-index:1002;pointer-events:none}
        .fc-toast{min-width:min(280px,78vw);max-width:min(360px,82vw);padding:10px 12px;background:rgba(10,18,28,0.86);border:1px solid rgba(255,255,255,0.16);border-left:4px solid rgba(148,233,255,0.9);border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,0.34);color:#f2fbff;backdrop-filter:blur(8px)}
        .fc-toast.adv{border-left-color:rgba(255,226,116,0.95)}
        .fc-toast.bad{border-left-color:rgba(255,112,112,0.95)}
        .fc-toast.buff{border-left-color:rgba(126,229,178,0.95)}
        .fc-toast.sys{border-left-color:rgba(148,233,255,0.95)}
        .fc-toast-title{font:900 13px/1.1 ui-monospace,Menlo,Consolas,monospace}
        .fc-toast-detail{margin-top:4px;color:rgba(226,238,255,0.86);font:12px/1.3 ui-monospace,Menlo,Consolas,monospace}
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
        #freecube2-weather-overlay{position:fixed;inset:0;display:none;pointer-events:none;opacity:0;transition:opacity 0.35s ease;z-index:999}
        #freecube2-weather-overlay.rain{display:block;background-image:repeating-linear-gradient(115deg, rgba(174,216,255,0.16) 0 2px, transparent 2px 16px);background-size:260px 260px;animation:fc-rain-fall 0.42s linear infinite}
        #freecube2-weather-overlay.thunder{display:block;background-image:repeating-linear-gradient(115deg, rgba(210,232,255,0.22) 0 2px, transparent 2px 14px);background-size:220px 220px;animation:fc-rain-fall 0.28s linear infinite}
        #freecube2-lightning-flash{position:fixed;inset:0;display:none;background:#eef7ff;opacity:0;pointer-events:none;transition:opacity 0.15s linear;z-index:1001}
        #freecube2-debug-canvas{position:fixed;inset:0;width:100%;height:100%;display:none;pointer-events:none;z-index:1001}
        #freecube2-debug-panel{position:fixed;left:10px;top:42px;display:none;max-width:min(440px,64vw);padding:10px 12px;background:rgba(8,12,20,0.76);border:1px solid rgba(255,255,255,0.14);border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,0.28);color:#dbf7db;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;z-index:1002}
        #freecube2-debug-graphs{display:none;grid-template-columns:1fr 140px;gap:10px;margin-top:10px}
        #freecube2-debug-graph{width:100%;height:72px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px}
        #freecube2-debug-pie{display:none;align-items:center;justify-content:center;flex-direction:column;gap:8px}
        #freecube2-debug-pie-chart{width:98px;height:98px;border-radius:999px;background:conic-gradient(#7fe1ff 0deg 120deg,#63b4ff 120deg 220deg,#9cf2ba 220deg 300deg,#f5dc86 300deg 360deg);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.1)}
        #freecube2-debug-pie-legend{display:grid;gap:4px;color:rgba(234,245,255,0.9);font:11px/1.25 ui-monospace,Menlo,Consolas,monospace}
        #freecube2-debug-help{position:fixed;right:10px;top:42px;display:none;max-width:min(420px,72vw);padding:10px 12px;background:rgba(8,12,20,0.82);border:1px solid rgba(255,255,255,0.12);border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,0.3);color:rgba(236,245,255,0.96);font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;z-index:1002}
        #freecube2-sleep-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(6,10,20,0.58);z-index:1004;pointer-events:none}
        .fc-sleep-card{display:flex;flex-direction:column;align-items:center;gap:12px;min-width:min(340px,84vw);padding:24px 28px;border-radius:20px;background:rgba(9,14,28,0.92);border:1px solid rgba(255,255,255,0.15);box-shadow:0 18px 48px rgba(0,0,0,0.38)}
        .fc-sleep-title{color:#f4f8ff;font:900 22px/1 ui-monospace,Menlo,Consolas,monospace}
        .fc-sleep-copy{color:rgba(220,233,255,0.88);font:13px/1.35 ui-monospace,Menlo,Consolas,monospace;text-align:center}
        .fc-sleep-bar{width:min(260px,72vw);height:12px;border-radius:999px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);overflow:hidden}
        .fc-sleep-bar > div{height:100%;width:0%;background:linear-gradient(90deg, rgba(148,226,255,0.96), rgba(255,244,166,0.96))}
        @keyframes fc-rain-fall{0%{background-position:0 0}100%{background-position:-42px 112px}}
        #freecube2-hotbar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:8px;padding:10px 12px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.14);border-radius:10px}
        #freecube2-inventory{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);display:none;pointer-events:auto;z-index:1002}
        .fc-inv-panel{min-width:min(664px,94vw);padding:18px;background:#c6c6c6;border:4px solid #1f1f1f;box-shadow:inset 4px 4px 0 #ffffff,inset -4px -4px 0 #555555,0 18px 48px rgba(0,0,0,0.42);image-rendering:pixelated}
        .fc-inv-panel.context-table{min-width:min(536px,92vw)}
        .fc-inv-panel.context-furnace{min-width:min(470px,88vw)}
        .fc-inv-title{margin-bottom:12px;color:#3a3a3a;font:900 20px/1 ui-monospace,Menlo,Consolas,monospace;text-align:center;text-shadow:none}
        .fc-inv-top{display:grid;grid-template-columns:56px 152px auto;justify-content:center;gap:18px;align-items:start;margin-bottom:16px}
        .fc-inv-panel.context-table .fc-inv-top,.fc-inv-panel.context-furnace .fc-inv-top{grid-template-columns:auto}
        .fc-inv-pane{display:flex;flex-direction:column;gap:8px;min-width:0}
        .fc-inv-preview-pane{min-width:152px}
        .fc-inv-subtitle{color:#3a3a3a;font:700 13px/1 ui-monospace,Menlo,Consolas,monospace;text-align:center;text-shadow:none}
        .fc-inv-column{display:grid;grid-template-columns:repeat(1,44px);gap:8px;justify-content:center}
        .fc-inv-crafting-row{display:flex;align-items:center;justify-content:center;gap:12px}
        .fc-inv-crafting-row.table{gap:18px}
        .fc-inv-grid{display:grid;gap:8px;justify-content:center;grid-auto-flow:row;grid-auto-rows:44px}
        .fc-inv-grid.fc-inv-grid-2{grid-template-columns:repeat(2,44px)}
        .fc-inv-grid.fc-inv-grid-3{grid-template-columns:repeat(3,44px)}
        #freecube2-inventory-main,#freecube2-inventory-hotbar{grid-template-columns:repeat(9,44px)}
        #freecube2-inventory-hotbar{margin-top:18px}
        #freecube2-inventory-main.creative{max-height:min(308px,42vh);overflow-y:auto;align-content:start;padding-right:6px}
        .fc-inv-arrow{color:#8a8a8a;font:900 28px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:none}
        .fc-inv-cursor{position:fixed;left:0;top:0;transform:translate(-50%,-50%);display:none;pointer-events:none;z-index:1003}
        .freecube2-slot{position:relative;width:44px;height:44px;background:#8b8b8b;border:2px solid #373737;box-shadow:inset 2px 2px 0 #ffffff,inset -2px -2px 0 #555555;display:grid;place-items:center}
        .freecube2-slot.drag-target{border-color:#f6de69;box-shadow:inset 2px 2px 0 #fff7c6,inset -2px -2px 0 #8d7422}
        .freecube2-slot.sel{border-color:#ffffff;box-shadow:inset 2px 2px 0 #ffffff,inset -2px -2px 0 #2a2a2a}
        .freecube2-slot img{width:32px;height:32px;image-rendering:pixelated;pointer-events:none;-webkit-user-drag:none;user-select:none}
        .freecube2-slot .fc-count{position:absolute;right:6px;bottom:4px;color:rgba(255,255,255,0.95);font:900 12px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 0 rgba(0,0,0,0.75)}
        .freecube2-slot .fc-durability{position:absolute;left:5px;right:5px;bottom:3px;height:5px;background:rgba(0,0,0,0.7);border:1px solid rgba(0,0,0,0.82)}
        .freecube2-slot .fc-durability > div{height:100%;background:linear-gradient(90deg, rgba(255,92,92,0.96), rgba(255,226,116,0.96), rgba(126,229,178,0.96))}
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
        #freecube2-autorepair-banner{position:fixed;left:50%;top:14px;transform:translateX(-50%);display:none;align-items:center;gap:10px;padding:10px 16px;border-radius:999px;background:rgba(12,20,34,0.92);border:1px solid rgba(148,233,255,0.4);box-shadow:0 16px 40px rgba(0,0,0,0.34);color:#eefcff;font:800 13px/1 ui-monospace,Menlo,Consolas,monospace;z-index:1005;pointer-events:auto}
        #freecube2-autorepair-banner .fc-repair-dot{width:10px;height:10px;border-radius:999px;background:#91ecff;box-shadow:0 0 12px rgba(145,236,255,0.9)}
        #freecube2-autorepair-center{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(7,12,20,0.22);z-index:1005;pointer-events:auto}
        .fc-repair-shell{display:flex;flex-direction:column;align-items:center;gap:14px;min-width:min(340px,84vw);padding:22px 24px;border-radius:18px;background:rgba(9,14,26,0.9);border:1px solid rgba(148,233,255,0.24);box-shadow:0 22px 54px rgba(0,0,0,0.38)}
        .fc-repair-spinner{width:60px;height:60px;border-radius:999px;border:5px solid rgba(255,255,255,0.14);border-top-color:#8fe9ff;border-right-color:#59b9ff;animation:fc-repair-spin 0.9s linear infinite}
        .fc-repair-title{color:#f4fbff;font:900 20px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 2px 10px rgba(0,0,0,0.45)}
        .fc-repair-copy{max-width:min(420px,82vw);text-align:center;color:rgba(223,239,255,0.9);font:13px/1.4 ui-monospace,Menlo,Consolas,monospace}
        @keyframes fc-repair-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        #freecube2-menu{position:fixed;inset:0;display:none;align-items:stretch;justify-content:center;overflow:auto;pointer-events:auto;background:#2b2b2b url('./assets/PNG/Tiles/dirt.png') repeat; background-size:256px 256px; image-rendering:pixelated; animation:fc-menu-pan 32s linear infinite}
        @keyframes fc-menu-pan{0%{background-position:0 0}100%{background-position:-256px -256px}}
        #freecube2-menu::before{content:'';position:fixed;inset:0;background:radial-gradient(circle at 50% 20%, rgba(255,255,255,0.06), transparent 52%),linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.55));pointer-events:none}
        #freecube2-menu.show{display:flex}
        #freecube2-panel{position:relative;width:min(920px,96vw);min-height:calc(100dvh - 24px);margin:auto;padding:12px 0;background:transparent;border:none;box-shadow:none;text-align:center;display:flex;flex-direction:column;justify-content:center}
        #fc-screen-profile,#fc-screen-title,#fc-screen-multiplayer,#fc-screen-worlds,#fc-screen-settings,#fc-screen-resource-packs,#fc-screen-loading,#fc-screen-pause{width:min(860px,100%);margin:0 auto}
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
        .fc-video-shell{width:min(940px,96vw);max-height:min(78vh,700px);padding:14px 14px 16px 14px}
        .fc-video-scroll{max-height:min(74vh,640px);overflow-y:auto;padding-right:6px}
        .fc-video-grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:12px;align-items:stretch}
        .fc-video-btn{min-width:0 !important;width:100%;height:40px}
        .fc-video-meta{display:grid;gap:4px;margin-top:12px}
        .fc-video-subcard{margin-top:14px;padding:12px;background:rgba(0,0,0,0.42);border:2px solid #000;box-shadow:inset 0 2px 0 rgba(255,255,255,0.08)}
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
        .fc-skin-shell{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
        .fc-skin-preview{width:152px;min-height:192px;padding:12px;background:#1a1a1a;border:2px solid #000;box-shadow:inset 0 2px 0 rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
        .fc-skin-controls{display:flex;flex-direction:column;gap:8px;flex:1 1 240px}
        .fc-skin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px}
        .fc-profile-shell{display:grid;grid-template-columns:minmax(184px,220px) minmax(0,380px);gap:18px;align-items:start;justify-content:center;margin:0 auto;padding:18px;background:rgba(0,0,0,0.56);border:2px solid #000;box-shadow:inset 0 2px 0 rgba(255,255,255,0.08)}
        .fc-profile-preview-card{padding:12px;background:#111;border:2px solid #000;box-shadow:inset 0 2px 0 rgba(255,255,255,0.08)}
        .fc-profile-preview-card .fc-skin-preview{width:100%;min-height:236px;padding:14px}
        .fc-profile-side{display:flex;flex-direction:column;gap:12px;text-align:left}
        .fc-profile-title{font:900 18px/1.1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7)}
        .fc-profile-label{font:12px/1 ui-monospace,Menlo,Consolas,monospace;color:rgba(255,255,255,0.88)}
        .fc-profile-input,.fc-profile-select{all:unset;box-sizing:border-box;height:38px;padding:0 10px;background:#111;border:2px solid #000;color:#fff;font:14px/1.2 ui-monospace,Menlo,Consolas,monospace}
        .fc-profile-input:focus,.fc-profile-select:focus{outline:2px solid rgba(255,255,255,0.9)}
        .fc-profile-note{color:rgba(230,230,230,0.88);font:12px/1.35 ui-monospace,Menlo,Consolas,monospace}
        .fc-profile-actions{display:flex;flex-wrap:wrap;gap:10px}
        .fc-mp-shell{display:grid;gap:14px;width:min(700px,100%);margin:0 auto}
        .fc-mp-browser{min-height:min(388px,54dvh);padding:0;background:rgba(0,0,0,0.7);border:3px solid #050505;box-shadow:inset 0 0 0 2px rgba(255,255,255,0.06),0 18px 40px rgba(0,0,0,0.4);display:grid;grid-template-rows:auto 1fr}
        .fc-mp-title{padding:10px 14px 8px 14px;font:900 20px/1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,0.75)}
        .fc-mp-status,.fc-mp-note,.fc-mp-section{display:none}
        .fc-mp-list{display:flex;flex-direction:column;gap:2px;padding:6px;background:rgba(0,0,0,0.32);overflow:auto}
        .fc-mp-entry{position:relative;display:grid;grid-template-columns:64px 1fr auto;gap:12px;align-items:center;min-height:64px;padding:6px 12px;background:rgba(0,0,0,0.78);border:1px solid rgba(255,255,255,0.08);text-align:left;cursor:pointer}
        .fc-mp-entry:hover{background:rgba(16,16,16,0.92)}
        .fc-mp-entry.sel{outline:2px solid rgba(255,255,255,0.95);outline-offset:-2px}
        .fc-mp-entry.locked{opacity:0.72}
        .fc-mp-thumb{width:56px;height:56px;border:2px solid #2a2a2a;background:
          linear-gradient(180deg, rgba(164,164,164,0.85) 0 48%, rgba(116,116,116,0.85) 48% 62%, rgba(72,72,72,0.95) 62% 100%),
          url('./assets/PNG/Tiles/dirt.png');background-size:cover,112px 112px;image-rendering:pixelated;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.18)}
        .fc-mp-copy{display:grid;gap:2px;min-width:0}
        .fc-mp-head{font:900 15px/1.1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,0.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .fc-mp-sub{font:12px/1.15 ui-monospace,Menlo,Consolas,monospace;color:rgba(196,196,196,0.95);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .fc-mp-sub.error{color:#ff3d32}
        .fc-mp-meta{display:grid;justify-items:end;align-content:start;gap:4px;min-width:72px}
        .fc-mp-players{font:900 12px/1 ui-monospace,Menlo,Consolas,monospace;color:#f1f1f1}
        .fc-mp-bars{display:flex;gap:2px;align-items:flex-end;height:14px}
        .fc-mp-bars span{display:block;width:3px;background:#40d84d;box-shadow:0 0 6px rgba(64,216,77,0.45)}
        .fc-mp-bars span:nth-child(1){height:5px}
        .fc-mp-bars span:nth-child(2){height:8px}
        .fc-mp-bars span:nth-child(3){height:11px}
        .fc-mp-bars span:nth-child(4){height:14px}
        .fc-mp-bad{font:900 18px/1 ui-monospace,Menlo,Consolas,monospace;color:#ff3d32}
        .fc-mp-empty{display:grid;place-items:center;min-height:120px;color:rgba(230,230,230,0.82);font:13px/1.2 ui-monospace,Menlo,Consolas,monospace;background:rgba(0,0,0,0.62);border:1px solid rgba(255,255,255,0.06)}
        .fc-mp-controls{display:grid;gap:10px}
        .fc-mp-direct{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}
        .fc-mp-input{all:unset;box-sizing:border-box;height:38px;padding:0 10px;background:#0f0f0f;border:2px solid #000;box-shadow:inset 2px 2px 0 rgba(255,255,255,0.08),inset -2px -2px 0 rgba(0,0,0,0.55);color:#fff;font:14px/1.2 ui-monospace,Menlo,Consolas,monospace;text-align:left}
        .fc-mp-input:focus{outline:2px solid rgba(255,255,255,0.92)}
        .fc-mp-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .fc-mp-action-grid .fc-btn{min-width:0;width:100%}
        #freecube2-trade{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);display:none;pointer-events:auto;z-index:1003}
        .fc-trade-panel{width:min(720px,94vw);max-height:min(82vh,720px);padding:18px;background:#c6c6c6;border:4px solid #1f1f1f;box-shadow:inset 4px 4px 0 #ffffff,inset -4px -4px 0 #555555,0 18px 48px rgba(0,0,0,0.42);display:grid;gap:12px}
        .fc-trade-head{display:grid;gap:4px;text-align:center}
        .fc-trade-title{font:900 20px/1 ui-monospace,Menlo,Consolas,monospace;color:#303030}
        .fc-trade-sub{font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#4a4a4a}
        .fc-trade-list{display:grid;gap:8px;max-height:min(54vh,420px);overflow:auto;padding-right:4px}
        .fc-trade-offer{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px;background:#8b8b8b;border:2px solid #373737;box-shadow:inset 2px 2px 0 #ffffff,inset -2px -2px 0 #555555}
        .fc-trade-main{display:grid;gap:6px;text-align:left}
        .fc-trade-name{font:900 14px/1.1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,0.55)}
        .fc-trade-meta{font:12px/1.25 ui-monospace,Menlo,Consolas,monospace;color:rgba(236,241,255,0.92)}
        .fc-trade-costs{display:flex;flex-wrap:wrap;gap:6px}
        .fc-trade-chip{padding:4px 6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);border-radius:999px;color:#fff;font:700 11px/1 ui-monospace,Menlo,Consolas,monospace}
        .fc-trade-chip.missing{border-color:rgba(255,112,112,0.55);color:#ffd8d8}
        .fc-trade-chip.reward{border-color:rgba(126,229,178,0.55);color:#dcfff0}
        .fc-trade-actions{display:grid;justify-items:end;gap:6px}
        .fc-trade-actions .fc-btn{min-width:140px}
        .fc-trade-status{font:11px/1.25 ui-monospace,Menlo,Consolas,monospace;color:#f3f6ff;text-align:right}
        .fc-trade-status.bad{color:#ffd0d0}
        .fc-prog-list{display:grid;gap:8px;text-align:left}
        .fc-prog-entry{padding:10px;background:rgba(0,0,0,0.48);border:2px solid #000;display:grid;gap:4px}
        .fc-prog-entry.done{outline:2px solid rgba(126,229,178,0.7)}
        .fc-prog-entry.locked{opacity:0.66}
        .fc-prog-title{font:900 15px/1.1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.55)}
        .fc-prog-desc,.fc-prog-time,.fc-stat-row{font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;color:rgba(233,239,250,0.9)}
        .fc-stat-row{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;background:rgba(0,0,0,0.42);border:2px solid #000}
        #freecube2-error-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(8,12,18,0.78);pointer-events:auto;z-index:1004}
        .fc-error-panel{width:min(560px,92vw);padding:18px;background:rgba(0,0,0,0.82);border:3px solid #000;box-shadow:inset 0 2px 0 rgba(255,255,255,0.12),0 18px 48px rgba(0,0,0,0.42);display:grid;gap:10px;text-align:center}
        .fc-error-title{font:900 24px/1.1 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.7)}
        .fc-error-copy{font:14px/1.4 ui-monospace,Menlo,Consolas,monospace;color:rgba(236,242,255,0.94)}
        .fc-error-detail{font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;color:rgba(196,210,230,0.82)}
        @media (max-width: 760px){
          #freecube2-panel{width:min(96vw,96vw);min-height:calc(100dvh - 12px);padding:6px 0}
          .fc-title{font-size:clamp(42px,12vw,64px);letter-spacing:2px}
          .fc-sub{font-size:14px;margin-bottom:18px}
          .fc-grid{grid-template-columns:1fr}
          .fc-video-grid{grid-template-columns:1fr}
          .fc-profile-shell{grid-template-columns:1fr}
          .fc-mp-direct{grid-template-columns:1fr}
          .fc-inv-top{grid-template-columns:1fr}
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
      <div id="freecube2-toast"></div>
      <div id="freecube2-effects"></div>
      <div id="freecube2-chat">
        <div id="freecube2-chat-log"></div>
        <div id="freecube2-chat-input-wrap">
          <input id="freecube2-chat-input" autocomplete="off" spellcheck="false" placeholder="Type chat... (/help)" />
        </div>
      </div>
      <div id="freecube2-crosshair"></div>
      <div id="freecube2-mining"><div id="freecube2-mining-bar"></div></div>
      <div id="freecube2-weather-overlay"></div>
      <div id="freecube2-lightning-flash"></div>
      <canvas id="freecube2-debug-canvas"></canvas>
      <div id="freecube2-debug-panel">
        <div id="freecube2-debug-lines"></div>
        <div id="freecube2-debug-graphs">
          <canvas id="freecube2-debug-graph"></canvas>
          <div id="freecube2-debug-pie">
            <div id="freecube2-debug-pie-chart"></div>
            <div id="freecube2-debug-pie-legend"></div>
          </div>
        </div>
      </div>
      <div id="freecube2-debug-help"></div>
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
      <div id="freecube2-trade">
        <div class="fc-trade-panel">
          <div class="fc-trade-head">
            <div id="freecube2-trade-title" class="fc-trade-title">Villager Trades</div>
            <div id="freecube2-trade-sub" class="fc-trade-sub">Trade goods, enchantments, and blessings.</div>
          </div>
          <div id="freecube2-trade-status" class="fc-small">Step close to a villager to trade.</div>
          <div id="freecube2-trade-list" class="fc-trade-list"></div>
          <div class="fc-row">
            <button class="fc-btn" data-action="close-trade">Done</button>
          </div>
        </div>
      </div>
      <div id="freecube2-inventory">
        <div id="freecube2-inventory-panel" class="fc-inv-panel">
          <div id="freecube2-inventory-title" class="fc-inv-title">Inventory</div>
          <div id="freecube2-inventory-top" class="fc-inv-top">
            <div id="freecube2-inventory-armor-pane" class="fc-inv-pane">
              <div class="fc-inv-subtitle">Armor</div>
              <div id="freecube2-inventory-armor" class="fc-inv-column"></div>
            </div>
            <div id="freecube2-inventory-preview-pane" class="fc-inv-pane fc-inv-preview-pane">
              <div class="fc-inv-subtitle">Player</div>
              <div id="freecube2-inventory-preview" class="fc-inv-preview"></div>
            </div>
            <div id="freecube2-inventory-craft-pane" class="fc-inv-pane">
              <div id="freecube2-crafting-label" class="fc-inv-subtitle">Crafting</div>
              <div id="freecube2-crafting-row" class="fc-inv-crafting-row">
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
      <div id="freecube2-sleep-overlay">
        <div class="fc-sleep-card">
          <div class="fc-sleep-title">Sleeping...</div>
          <div id="freecube2-sleep-copy" class="fc-sleep-copy">Stay in bed a few seconds to skip the night.</div>
          <div class="fc-sleep-bar"><div id="freecube2-sleep-progress"></div></div>
        </div>
      </div>
      <div id="freecube2-autorepair-banner">
        <div class="fc-repair-dot"></div>
        <div id="freecube2-autorepair-banner-copy">Auto Repair</div>
      </div>
      <div id="freecube2-autorepair-center">
        <div class="fc-repair-shell">
          <div class="fc-repair-spinner"></div>
          <div class="fc-repair-title">Auto Repair</div>
          <div id="freecube2-autorepair-detail" class="fc-repair-copy">Diagnosing the problem.</div>
        </div>
      </div>
      <div id="freecube2-error-overlay">
        <div class="fc-error-panel">
          <div id="freecube2-error-title" class="fc-error-title">Graphics Error</div>
          <div id="freecube2-error-message" class="fc-error-copy">The WebGL renderer stopped responding.</div>
          <div id="freecube2-error-detail" class="fc-error-detail">Reload the game to rebuild graphics resources.</div>
          <div class="fc-row" style="margin-top:10px">
            <button class="fc-btn half" data-action="run-auto-repair">Try Auto Repair</button>
            <button class="fc-btn half" data-action="reload">Reload Game</button>
          </div>
        </div>
      </div>
      <div id="freecube2-menu" class="show">
        <div id="freecube2-panel">
          <div id="fc-screen-profile" style="display:none">
            <div style="font:900 22px ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 12px auto">Create Profile</div>
            <div class="fc-profile-shell">
              <div class="fc-profile-preview-card">
                <div id="fc-profile-skin-preview" class="fc-skin-preview"></div>
              </div>
              <div class="fc-profile-side">
                <div class="fc-profile-title">Screen Name</div>
                <label class="fc-profile-label" for="fc-profile-name">Username</label>
                <input id="fc-profile-name" class="fc-profile-input" maxlength="16" placeholder="Name" autocomplete="nickname" spellcheck="false" />
                <label class="fc-profile-label" for="fc-profile-skin-preset">Player Skin</label>
                <select id="fc-profile-skin-preset" class="fc-profile-select">
                  <option value="steve">Steve</option>
                  <option value="steve_large">Steve HD</option>
                  <option value="alex">Alex</option>
                  <option value="zombie">Zombie</option>
                  <option value="freecube">${GAME_SHORT_TITLE}</option>
                  <option value="custom">Custom</option>
                </select>
                <div id="fc-profile-skin-current" class="fc-profile-note">Current skin: Steve</div>
                <div class="fc-profile-actions">
                  <button class="fc-btn half" data-action="profile-import-skin">Add Skin</button>
                  <button class="fc-btn half" data-action="profile-clear-skin">Clear Skin</button>
                </div>
                <div class="fc-profile-note">Choose a screen name and skin before entering the title screen. Your name is stored locally in this browser.</div>
                <div class="fc-row" style="margin-top:4px">
                  <button class="fc-btn" data-action="complete-profile">Continue</button>
                </div>
              </div>
            </div>
          </div>
          <div id="fc-screen-title" style="display:none">
            <div class="fc-title">FREECUBE</div>
            <div class="fc-sub">Also try digging straight down</div>
            <div class="fc-stack">
              <button class="fc-btn" data-action="singleplayer">Singleplayer</button>
              <button class="fc-btn${MULTIPLAYER_ENABLED ? "" : " disabled"}" data-action="open-multiplayer" ${MULTIPLAYER_ENABLED ? "" : "disabled"}>Multiplayer</button>
              <button class="fc-btn" data-action="open-settings">Options...</button>
              <button class="fc-btn" data-action="reload">Quit Game</button>
            </div>
            <div class="fc-footer" style="margin-top:18px">
              <span>${GAME_TITLE} ${GAME_VERSION}</span>
              <span>Static. Local saves.</span>
            </div>
          </div>
          <div id="fc-screen-multiplayer" style="display:none">
            <div class="fc-mp-shell">
              <div class="fc-mp-browser">
                <div class="fc-mp-title">Play Multiplayer</div>
                <div id="fc-multiplayer-list" class="fc-mp-list"></div>
              </div>
              <div class="fc-mp-controls">
                <div class="fc-mp-direct">
                  <input id="fc-multiplayer-direct-input" class="fc-mp-input" value="" placeholder="Join with code" spellcheck="false" />
                  <button id="fc-multiplayer-direct-btn" class="fc-btn half disabled" type="button" disabled>Join with Code</button>
                </div>
                <div class="fc-mp-action-grid">
                  <button id="fc-multiplayer-join-btn" class="fc-btn small disabled" type="button" disabled>Join Server</button>
                  <button id="fc-multiplayer-add-btn" class="fc-btn small disabled" type="button" disabled>Add Server</button>
                  <button id="fc-multiplayer-delete-btn" class="fc-btn small disabled" type="button" disabled>Delete</button>
                  <button id="fc-multiplayer-refresh-btn" class="fc-btn small disabled" type="button" disabled>Refresh</button>
                  <button class="fc-btn small" data-action="back-title">Cancel</button>
                </div>
              </div>
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
              <button class="fc-btn small" data-action="import-world">Import</button>
              <button class="fc-btn small" data-action="export-world">Export</button>
              <button class="fc-btn small danger" data-action="delete-world">Delete</button>
              <button class="fc-btn small" data-action="back-title">Cancel</button>
            </div>
            <input id="fc-import-world-file" type="file" accept=".json,application/json" style="display:none" />
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
            <div style="font:900 22px ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 10px auto">Video Settings</div>
            <div class="fc-card fc-video-shell" style="margin:0 auto">
              <div class="fc-video-scroll">
                <div class="fc-video-grid">
                  <button id="fc-video-graphics" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-rd" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-fov" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-ms" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-bob" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-shadows" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-fps" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-mastervol" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-musicvol" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-mobs" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-perf" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-fullscreen" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-lagfix" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-video-inv" class="fc-btn fc-video-btn" type="button"></button>
                  <button id="fc-resource-packs-btn" class="fc-btn fc-video-btn" type="button" data-action="open-resource-packs-screen">Resource Packs...</button>
                  <button id="fc-video-gm" class="fc-btn fc-video-btn" type="button"></button>
                </div>
                <div class="fc-video-meta">
                  <div id="fc-resource-pack-current" class="fc-small">Current: Default</div>
                  <div class="fc-small">Sprint key: R. Sneak/Crouch key: Shift.</div>
                  <div class="fc-small">Minecraft-length day and night cycle enabled.</div>
                </div>
                <div class="fc-video-subcard">
                  <div class="fc-pack-head" style="margin-bottom:10px">Player Skin</div>
                  <div class="fc-skin-shell">
                    <div id="fc-skin-preview" class="fc-skin-preview"></div>
                    <div class="fc-skin-controls">
                      <div id="fc-skin-current" class="fc-small">Current: ${GAME_SHORT_TITLE}</div>
                      <div class="fc-skin-grid">
                        <button class="fc-btn small" data-action="skin-freecube">${GAME_SHORT_TITLE}</button>
                        <button class="fc-btn small" data-action="skin-steve">Steve</button>
                        <button class="fc-btn small" data-action="skin-alex">Alex</button>
                        <button class="fc-btn small" data-action="skin-zombie">Zombie</button>
                      </div>
                      <div class="fc-row" style="margin-top:2px">
                        <button class="fc-btn half" data-action="skin-import">Import Skin</button>
                        <button class="fc-btn half" data-action="skin-reset">Reset Skin</button>
                      </div>
                    </div>
                  </div>
                  <input id="fc-skin-file" type="file" accept="image/png,image/webp" style="display:none" />
                </div>
                <div class="fc-small" style="margin-top:10px">Tip: ESC opens Game Menu. T opens chat. F1 hides HUD.</div>
              </div>
            </div>
            <div class="fc-row" style="margin-top:10px">
              <button class="fc-btn" data-action="back-settings">Done</button>
            </div>
          </div>
          <div id="fc-screen-resource-packs" style="display:none">
            <div style="font:900 22px ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 6px auto">Select Resource Packs</div>
            <div class="fc-small" style="margin-bottom:10px">Import a pack folder or ZIP to override textures, sounds, music, and supported mob skins.</div>
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
              <button class="fc-btn half" data-action="open-resource-packs">Import Pack Folder</button>
              <button class="fc-btn half" data-action="done-resource-packs">Done</button>
            </div>
            <div class="fc-row" style="margin-top:10px">
              <button class="fc-btn" data-action="open-resource-packs-zip">Import Pack ZIP</button>
            </div>
            <input id="fc-resource-pack-folder" type="file" multiple webkitdirectory directory style="display:none" />
            <input id="fc-resource-pack-zip" type="file" accept=".zip,application/zip" style="display:none" />
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
                <button class="fc-btn half" data-action="open-advancements">Advancements</button>
                <button class="fc-btn half" data-action="open-statistics">Statistics</button>
              </div>
              <div class="fc-row" style="max-width:min(420px,86vw)">
                <button class="fc-btn half" data-action="open-settings">Options...</button>
                <button class="fc-btn half" data-action="open-lan">Open to LAN</button>
              </div>
              <button class="fc-btn" data-action="quit-title">Save and Quit to Title</button>
            </div>
          </div>
          <div id="fc-screen-advancements" style="display:none">
            <div style="font:900 22px ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 10px auto">Advancements</div>
            <div class="fc-card" style="margin:0 auto">
              <div id="fc-advancement-list" class="fc-prog-list"></div>
            </div>
            <div class="fc-row" style="margin-top:10px">
              <button class="fc-btn" data-action="back-pause">Done</button>
            </div>
          </div>
          <div id="fc-screen-statistics" style="display:none">
            <div style="font:900 22px ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,0.7);margin:0 auto 10px auto">Statistics</div>
            <div class="fc-card" style="margin:0 auto">
              <div id="fc-statistics-list" class="fc-prog-list"></div>
            </div>
            <div class="fc-row" style="margin-top:10px">
              <button class="fc-btn" data-action="back-pause">Done</button>
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
    const toastEl = root.querySelector("#freecube2-toast");
    const effectsEl = root.querySelector("#freecube2-effects");
    const chatLogEl = root.querySelector("#freecube2-chat-log");
    const chatInputWrap = root.querySelector("#freecube2-chat-input-wrap");
    const chatInput = root.querySelector("#freecube2-chat-input");
    const crosshairEl = root.querySelector("#freecube2-crosshair");
    const miningEl = root.querySelector("#freecube2-mining");
    const miningBar = root.querySelector("#freecube2-mining-bar");
    const weatherOverlayEl = root.querySelector("#freecube2-weather-overlay");
    const lightningFlashEl = root.querySelector("#freecube2-lightning-flash");
    const debugCanvasEl = root.querySelector("#freecube2-debug-canvas");
    const debugPanelEl = root.querySelector("#freecube2-debug-panel");
    const debugLinesEl = root.querySelector("#freecube2-debug-lines");
    const debugGraphsEl = root.querySelector("#freecube2-debug-graphs");
    const debugGraphEl = root.querySelector("#freecube2-debug-graph");
    const debugPieEl = root.querySelector("#freecube2-debug-pie");
    const debugPieChartEl = root.querySelector("#freecube2-debug-pie-chart");
    const debugPieLegendEl = root.querySelector("#freecube2-debug-pie-legend");
    const debugHelpEl = root.querySelector("#freecube2-debug-help");
    const statusEl = root.querySelector("#freecube2-status");
    const armorEl = root.querySelector("#freecube2-armor");
    const heartsEl = root.querySelector("#freecube2-hearts");
    const hungerEl = root.querySelector("#freecube2-hunger");
    const xpEl = root.querySelector("#freecube2-xp");
    const xpFill = root.querySelector("#freecube2-xp-bar > div");
    const xpLevelEl = root.querySelector("#freecube2-xp-level");
    const hotbarEl = root.querySelector("#freecube2-hotbar");
    const tradeEl = root.querySelector("#freecube2-trade");
    const tradeTitleEl = root.querySelector("#freecube2-trade-title");
    const tradeSubEl = root.querySelector("#freecube2-trade-sub");
    const tradeStatusEl = root.querySelector("#freecube2-trade-status");
    const tradeListEl = root.querySelector("#freecube2-trade-list");
    const inventoryEl = root.querySelector("#freecube2-inventory");
    const inventoryPanelEl = root.querySelector("#freecube2-inventory-panel");
    const inventoryTitleEl = root.querySelector("#freecube2-inventory-title");
    const inventoryTopEl = root.querySelector("#freecube2-inventory-top");
    const inventoryArmorPaneEl = root.querySelector("#freecube2-inventory-armor-pane");
    const inventoryPreviewPaneEl = root.querySelector("#freecube2-inventory-preview-pane");
    const inventoryCraftPaneEl = root.querySelector("#freecube2-inventory-craft-pane");
    const inventoryArmorEl = root.querySelector("#freecube2-inventory-armor");
    const inventoryPreviewEl = root.querySelector("#freecube2-inventory-preview");
    const inventoryCraftLabelEl = root.querySelector("#freecube2-crafting-label");
    const inventoryCraftRowEl = root.querySelector("#freecube2-crafting-row");
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
    const sleepOverlayEl = root.querySelector("#freecube2-sleep-overlay");
    const sleepCopyEl = root.querySelector("#freecube2-sleep-copy");
    const sleepProgressEl = root.querySelector("#freecube2-sleep-progress");
    const autoRepairBannerEl = root.querySelector("#freecube2-autorepair-banner");
    const autoRepairBannerCopyEl = root.querySelector("#freecube2-autorepair-banner-copy");
    const autoRepairCenterEl = root.querySelector("#freecube2-autorepair-center");
    const autoRepairDetailEl = root.querySelector("#freecube2-autorepair-detail");
    const errorOverlayEl = root.querySelector("#freecube2-error-overlay");
    const errorTitleEl = root.querySelector("#freecube2-error-title");
    const errorMessageEl = root.querySelector("#freecube2-error-message");
    const errorDetailEl = root.querySelector("#freecube2-error-detail");
    const menuEl = root.querySelector("#freecube2-menu");

    const screens = {
      profile: root.querySelector("#fc-screen-profile"),
      title: root.querySelector("#fc-screen-title"),
      multiplayer: root.querySelector("#fc-screen-multiplayer"),
      worlds: root.querySelector("#fc-screen-worlds"),
      settings: root.querySelector("#fc-screen-settings"),
      resourcePacks: root.querySelector("#fc-screen-resource-packs"),
      loading: root.querySelector("#fc-screen-loading"),
      pause: root.querySelector("#fc-screen-pause"),
      advancements: root.querySelector("#fc-screen-advancements"),
      statistics: root.querySelector("#fc-screen-statistics")
    };

    const profileNameInput = root.querySelector("#fc-profile-name");
    const profileSkinPreviewEl = root.querySelector("#fc-profile-skin-preview");
    const profileSkinPresetEl = root.querySelector("#fc-profile-skin-preset");
    const profileSkinCurrentEl = root.querySelector("#fc-profile-skin-current");
    const multiplayerStatusEl = root.querySelector("#fc-multiplayer-status");
    const multiplayerListEl = root.querySelector("#fc-multiplayer-list");
    const multiplayerDirectInputEl = root.querySelector("#fc-multiplayer-direct-input");
    const multiplayerDirectBtn = root.querySelector("#fc-multiplayer-direct-btn");
    const multiplayerJoinBtn = root.querySelector("#fc-multiplayer-join-btn");
    const multiplayerAddBtn = root.querySelector("#fc-multiplayer-add-btn");
    const multiplayerDeleteBtn = root.querySelector("#fc-multiplayer-delete-btn");
    const multiplayerRefreshBtn = root.querySelector("#fc-multiplayer-refresh-btn");
    const multiplayerNoteEl = root.querySelector("#fc-multiplayer-note");

    const worldListEl = root.querySelector("#fc-world-list");
    const newWorldCard = root.querySelector("#fc-new-world");
    const worldNameInput = root.querySelector("#fc-world-name");
    const worldSeedInput = root.querySelector("#fc-world-seed");
    const playWorldBtn = root.querySelector('[data-action="play-world"]');
    const exportWorldBtn = root.querySelector('[data-action="export-world"]');
    const deleteWorldBtn = root.querySelector('[data-action="delete-world"]');
    const importWorldFileInput = root.querySelector("#fc-import-world-file");

    const videoGraphicsBtn = root.querySelector("#fc-video-graphics");
    const videoRenderDistanceBtn = root.querySelector("#fc-video-rd");
    const videoFovBtn = root.querySelector("#fc-video-fov");
    const videoMouseBtn = root.querySelector("#fc-video-ms");
    const videoViewBobBtn = root.querySelector("#fc-video-bob");
    const videoShadowsBtn = root.querySelector("#fc-video-shadows");
    const videoFpsBtn = root.querySelector("#fc-video-fps");
    const videoMasterVolumeBtn = root.querySelector("#fc-video-mastervol");
    const videoMusicVolumeBtn = root.querySelector("#fc-video-musicvol");
    const videoMobModelsBtn = root.querySelector("#fc-video-mobs");
    const videoPerformanceBtn = root.querySelector("#fc-video-perf");
    const videoFullscreenBtn = root.querySelector("#fc-video-fullscreen");
    const videoChunkLagBtn = root.querySelector("#fc-video-lagfix");
    const videoInvertYBtn = root.querySelector("#fc-video-inv");
    const videoGameModeBtn = root.querySelector("#fc-video-gm");
    const resourcePacksBtn = root.querySelector("#fc-resource-packs-btn");
    const resourcePackCurrentEl = root.querySelector("#fc-resource-pack-current");
    const skinPreviewEl = root.querySelector("#fc-skin-preview");
    const skinCurrentEl = root.querySelector("#fc-skin-current");
    const skinFileInput = root.querySelector("#fc-skin-file");
    const resourcePackFileInput = root.querySelector("#fc-resource-pack-folder");
    const resourcePackZipInput = root.querySelector("#fc-resource-pack-zip");
    const resourcePackAvailableEl = root.querySelector("#fc-resource-pack-available");
    const resourcePackSelectedEl = root.querySelector("#fc-resource-pack-selected");

    const loadBar = root.querySelector("#fc-load-bar");
    const loadSub = root.querySelector("#fc-load-sub");
    const loadText = root.querySelector("#fc-load-text");
    const advancementListEl = root.querySelector("#fc-advancement-list");
    const statisticsListEl = root.querySelector("#fc-statistics-list");

    const showScreen = (screen) => {
      Object.values(screens).forEach((el) => { el.style.display = "none"; });
      screens[screen].style.display = "block";
      root.classList.add("menu-open");
      menuEl.classList.add("show");
      crosshairEl.style.display = "none";
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
      toastEl,
      effectsEl,
      chatLogEl,
      chatInputWrap,
      chatInput,
      hotbarEl,
      tradeEl,
      tradeTitleEl,
      tradeSubEl,
      tradeStatusEl,
      tradeListEl,
      menuEl,
      miningEl,
      miningBar,
      weatherOverlayEl,
      lightningFlashEl,
      debugCanvasEl,
      debugPanelEl,
      debugLinesEl,
      debugGraphsEl,
      debugGraphEl,
      debugPieEl,
      debugPieChartEl,
      debugPieLegendEl,
      debugHelpEl,
      statusEl,
      armorEl,
      heartsEl,
      hungerEl,
      xpEl,
      xpFill,
      xpLevelEl,
      worldListEl,
      inventoryEl,
      inventoryPanelEl,
      inventoryTitleEl,
      inventoryTopEl,
      inventoryArmorPaneEl,
      inventoryPreviewPaneEl,
      inventoryCraftPaneEl,
      inventoryArmorEl,
      inventoryPreviewEl,
      inventoryCraftLabelEl,
      inventoryCraftRowEl,
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
      sleepOverlayEl,
      sleepCopyEl,
      sleepProgressEl,
      autoRepairBannerEl,
      autoRepairBannerCopyEl,
      autoRepairCenterEl,
      autoRepairDetailEl,
      errorOverlayEl,
      errorTitleEl,
      errorMessageEl,
      errorDetailEl,
      screens,
      profileNameInput,
      profileSkinPreviewEl,
      profileSkinPresetEl,
      profileSkinCurrentEl,
      multiplayerStatusEl,
      multiplayerListEl,
      multiplayerDirectInputEl,
      multiplayerDirectBtn,
      multiplayerJoinBtn,
      multiplayerAddBtn,
      multiplayerDeleteBtn,
      multiplayerRefreshBtn,
      multiplayerNoteEl,
      newWorldCard,
      worldNameInput,
      worldSeedInput,
      playWorldBtn,
      exportWorldBtn,
      deleteWorldBtn,
      importWorldFileInput,
      videoGraphicsBtn,
      videoRenderDistanceBtn,
      videoFovBtn,
      videoMouseBtn,
      videoViewBobBtn,
      videoShadowsBtn,
      videoFpsBtn,
      videoMasterVolumeBtn,
      videoMusicVolumeBtn,
      videoMobModelsBtn,
      videoPerformanceBtn,
      videoFullscreenBtn,
      videoChunkLagBtn,
      videoInvertYBtn,
      videoGameModeBtn,
      resourcePacksBtn,
      resourcePackCurrentEl,
      skinPreviewEl,
      skinCurrentEl,
      skinFileInput,
      resourcePackFileInput,
      resourcePackZipInput,
      resourcePackAvailableEl,
      resourcePackSelectedEl,
      loadBar,
      loadSub,
      loadText,
      advancementListEl,
      statisticsListEl,
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
    if (inventoryOpen) {
      renderInventoryUI();
    }
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

  function getInventorySlotDurability(index) {
    if (!player || index < 0 || index >= INVENTORY_SLOTS) return 0;
    return player.inventoryDurability[index] || 0;
  }

  function setInventorySlot(index, type, count, durability = null) {
    if (!player || index < 0 || index >= INVENTORY_SLOTS) return;
    if (!type || type === BLOCK.AIR || count <= 0) {
      player.inventoryTypes[index] = BLOCK.AIR;
      player.inventoryCounts[index] = 0;
      player.inventoryDurability[index] = 0;
      return;
    }
    player.inventoryTypes[index] = type;
    player.inventoryCounts[index] = clamp(Math.floor(count), 0, getItemMaxStack(type));
    player.inventoryDurability[index] = getItemMaxDurability(type) > 0
      ? normalizeDurabilityValue(type, durability)
      : 0;
  }

  function getArmorSlotType(index) {
    if (!player || index < 0 || index >= ARMOR_SLOTS) return BLOCK.AIR;
    return (player.armorCounts[index] || 0) > 0 ? (player.armorTypes[index] || BLOCK.AIR) : BLOCK.AIR;
  }

  function getArmorSlotCount(index) {
    if (!player || index < 0 || index >= ARMOR_SLOTS) return 0;
    return player.armorCounts[index] || 0;
  }

  function getArmorSlotDurability(index) {
    if (!player || index < 0 || index >= ARMOR_SLOTS) return 0;
    return player.armorDurability[index] || 0;
  }

  function setArmorSlot(index, type, count, durability = null) {
    if (!player || index < 0 || index >= ARMOR_SLOTS) return;
    const slotKey = ARMOR_SLOT_KEYS[index];
    if (!type || type === BLOCK.AIR || count <= 0 || getItemArmorSlot(type) !== slotKey) {
      player.armorTypes[index] = BLOCK.AIR;
      player.armorCounts[index] = 0;
      player.armorDurability[index] = 0;
      return;
    }
    player.armorTypes[index] = type;
    player.armorCounts[index] = 1;
    player.armorDurability[index] = normalizeDurabilityValue(type, durability);
    unlockPlayerAchievement("suit_up");
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
      ? { types: tableCraftTypes, counts: tableCraftCounts, size: 3, slots: CRAFT_GRID_LARGE, title: "Crafting", label: "Crafting" }
      : { types: inventoryCraftTypes, counts: inventoryCraftCounts, size: 2, slots: CRAFT_GRID_SMALL, title: "Inventory", label: "Crafting" };
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

  function renderItemStack(slot, itemType, count = 0, showCount = true, placeholder = "", durability = 0) {
    slot.innerHTML = "";
    slot.draggable = false;
    if (placeholder) {
      slot.title = placeholder;
    } else {
      slot.removeAttribute("title");
    }
    if (!itemType || itemType === BLOCK.AIR || count <= 0) return;
    const baseTitle = placeholder ? `${placeholder}: ${getItemName(itemType)}` : getItemName(itemType);
    slot.title = debugState.advancedTooltips
      ? `${baseTitle} [id=${itemType}]${count > 1 ? ` x${count}` : ""}`
      : baseTitle;
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
    const maxDurability = getItemMaxDurability(itemType);
    if (maxDurability > 0 && durability > 0) {
      const wrap = document.createElement("div");
      wrap.className = "fc-durability";
      const fill = document.createElement("div");
      fill.style.width = `${getDurabilityPercent(itemType, durability)}%`;
      wrap.appendChild(fill);
      slot.appendChild(wrap);
    }
  }

  function renderSlotContents(slot, inventoryIndex, isHotbar = false) {
    if (!player) {
      slot.innerHTML = "";
      return;
    }
    const isCreative = settings.gameMode === GAME_MODE.CREATIVE;
    const itemType = isCreative && isHotbar ? getHotbarSlotItemType(inventoryIndex) : getInventorySlotType(inventoryIndex);
    const count = isCreative && isHotbar ? (itemType === BLOCK.AIR ? 0 : 1) : getInventorySlotCount(inventoryIndex);
    renderItemStack(slot, itemType, count, !isCreative, "", getInventorySlotDurability(inventoryIndex));
  }

  function updateInventoryCursorVisual() {
    if (!ui) return;
    ui.inventoryCursorEl.innerHTML = "";
    if (!inventoryOpen || inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      ui.inventoryCursorEl.style.display = "none";
      return;
    }
    ui.inventoryCursorEl.style.display = "grid";
    renderItemStack(ui.inventoryCursorEl, inventoryCursor.type, inventoryCursor.count, true, "", inventoryCursor.durability || 0);
  }

  function updateInventoryCursorPosition() {
    if (!ui || !inventoryOpen) return;
    const mouse = input?.getMousePosition?.() || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (ui.inventoryCursorEl.style.display !== "none") {
      ui.inventoryCursorEl.style.left = `${mouse.x}px`;
      ui.inventoryCursorEl.style.top = `${mouse.y}px`;
    }
    updateMenuPreviewLookTargets(mouse);
  }

  function clearInventoryDragVisuals() {
    if (!ui) return;
    ui.root.querySelectorAll(".freecube2-slot.drag-target").forEach((slot) => slot.classList.remove("drag-target"));
  }

  function renderInventoryPreview() {
    if (!ui) return;
    const canvas = getOrCreatePlayerPreviewCanvas(ui.inventoryPreviewEl);
    if (!canvas) return;
    renderPlayerPreviewCanvas(canvas, {
      head: getArmorSlotType(0),
      chest: getArmorSlotType(1),
      legs: getArmorSlotType(2),
      feet: getArmorSlotType(3)
    }, getSelectedPlayerSkinCanvas(settings));
  }

  function renderSettingsSkinPreview() {
    if (!ui?.skinPreviewEl) return;
    const canvas = getOrCreatePlayerPreviewCanvas(ui.skinPreviewEl);
    if (!canvas) return;
    renderPlayerPreviewCanvas(canvas, {}, getSelectedPlayerSkinCanvas(settings));
  }

  function renderProfileSkinPreview() {
    if (!ui?.profileSkinPreviewEl) return;
    const canvas = getOrCreatePlayerPreviewCanvas(ui.profileSkinPreviewEl);
    if (!canvas) return;
    renderPlayerPreviewCanvas(canvas, {}, getSelectedPlayerSkinCanvas(settings));
  }

  function setProfileSkinPreset(preset) {
    const nextPreset = isValidPlayerSkinPreset(preset) ? preset : DEFAULT_SETTINGS.playerSkinPreset;
    settings.playerSkinPreset = nextPreset;
    if (nextPreset !== "custom") {
      settings.playerSkinDataUrl = "";
      customPlayerSkinCache = { dataUrl: "", canvas: null, loading: false, failed: false };
    } else if (!settings.playerSkinDataUrl) {
      settings.playerSkinPreset = DEFAULT_SETTINGS.playerSkinPreset;
    }
    markWorldDirty();
    setProfileSetupUI();
    setSettingsUI();
    if (inventoryOpen) {
      renderInventoryUI();
    }
  }

  function setProfileSetupUI() {
    if (!ui) return;
    const usernameValue = playerUsername || getStoredCubeCraftUsername() || "";
    if (ui.profileNameInput && document.activeElement !== ui.profileNameInput) {
      ui.profileNameInput.value = usernameValue;
    }
    if (ui.profileSkinPresetEl) {
      ui.profileSkinPresetEl.value = settings.playerSkinPreset === "custom" && settings.playerSkinDataUrl
        ? "custom"
        : (isValidPlayerSkinPreset(settings.playerSkinPreset) ? settings.playerSkinPreset : DEFAULT_SETTINGS.playerSkinPreset);
    }
    if (ui.profileSkinCurrentEl) {
      ui.profileSkinCurrentEl.textContent = `Current skin: ${getSelectedPlayerSkinLabel(settings)}`;
    }
    renderProfileSkinPreview();
    renderMultiplayerMenu();
  }

  function needsProfileSetup() {
    return !normalizeCubeCraftUsername(playerUsername || getStoredCubeCraftUsername(), "");
  }

  function openProfileSetupScreen() {
    ensureUI();
    ui.showScreen("profile");
    ui.setHudVisible(false);
    setProfileSetupUI();
    ui.profileNameInput?.focus();
    ui.profileNameInput?.select?.();
  }

  function showHomeScreen() {
    if (needsProfileSetup()) {
      openProfileSetupScreen();
      return;
    }
    ensureUI();
    renderMultiplayerMenu();
    ui.showScreen("title");
  }

  function getMultiplayerBrowserEntries() {
    return [
      ...multiplayerState.signalRooms,
      ...multiplayerState.dedicatedServers,
      ...multiplayerState.savedServers
    ];
  }

  function findSelectedMultiplayerEntry() {
    return getMultiplayerBrowserEntries().find((entry) => entry.id === multiplayerState.selectedServerId) || null;
  }

  function isLikelySignalRoomCode(value = "") {
    const normalized = String(value || "").trim().toUpperCase();
    return /^[A-Z2-9]{5,6}$/.test(normalized);
  }

  function createMultiplayerEntryMarkup(server, section = "saved") {
    const name = String(server?.name || "Unnamed Server");
    const subtitle = String(server?.subtitle || "Saved invite");
    const statusText = String(server?.statusText || "");
    const playersLabel = String(server?.playersLabel || server?.roomCode || "");
    const selected = !!(server?.id && server.id === multiplayerState.selectedServerId);
    const lockedClass = MULTIPLAYER_ENABLED ? "" : " locked";
    const healthy = server?.healthy !== false;
    return `
      <div class="fc-mp-entry${lockedClass}${selected ? " sel" : ""}" data-mp-code="${server?.code || server?.address || ""}" data-mp-server-id="${server?.id || ""}" data-mp-address="${server?.address || ""}" data-mp-dedicated-id="${server?.serverId || server?.code || ""}">
        <div class="fc-mp-thumb" aria-hidden="true"></div>
        <div class="fc-mp-copy">
          <div class="fc-mp-head">${name}</div>
          <div class="fc-mp-sub">${subtitle}</div>
          ${statusText ? `<div class="fc-mp-sub${healthy ? "" : " error"}">${statusText}</div>` : ""}
        </div>
        <div class="fc-mp-meta">
          <div class="fc-mp-players">${playersLabel}</div>
          ${healthy
            ? `<div class="fc-mp-bars" aria-hidden="true"><span></span><span></span><span></span><span></span></div>`
            : `<div class="fc-mp-bad" aria-hidden="true">×</div>`}
        </div>
      </div>
    `;
  }

  function renderMultiplayerMenu() {
    if (!ui?.multiplayerListEl) return;
    const serverEntries = [...multiplayerState.signalRooms, ...multiplayerState.dedicatedServers]
      .map((server) => createMultiplayerEntryMarkup(server, "live"))
      .join("");
    const savedEntries = multiplayerState.savedServers.map((server) => createMultiplayerEntryMarkup(server, "saved")).join("");
    ui.multiplayerListEl.innerHTML = (serverEntries || savedEntries)
      ? `${serverEntries}${savedEntries}`
      : `<div class="fc-mp-empty">No LAN servers found yet. Press Refresh.</div>`;

    if (ui.multiplayerDirectInputEl) {
      if (!ui.multiplayerDirectInputEl.value.trim()) {
        ui.multiplayerDirectInputEl.value = multiplayerState.directConnectUrl || DEFAULT_MULTIPLAYER_SERVER_URL;
      }
      ui.multiplayerDirectInputEl.placeholder = "Same-network server or LAN code";
    }
    if (ui.multiplayerDirectBtn) {
      ui.multiplayerDirectBtn.textContent = "Connect";
    }
    if (ui.multiplayerJoinBtn) {
      ui.multiplayerJoinBtn.textContent = "Join Selected";
    }
    if (ui.multiplayerAddBtn) {
      ui.multiplayerAddBtn.textContent = "Save Server";
    }

    if (ui.multiplayerStatusEl) {
      ui.multiplayerStatusEl.textContent = "";
      ui.multiplayerStatusEl.style.display = "none";
    }
    if (ui.multiplayerNoteEl) {
      ui.multiplayerNoteEl.textContent = "";
      ui.multiplayerNoteEl.style.display = "none";
    }
    for (const button of [ui.multiplayerDirectBtn, ui.multiplayerJoinBtn, ui.multiplayerAddBtn, ui.multiplayerDeleteBtn, ui.multiplayerRefreshBtn]) {
      if (!button) continue;
      button.disabled = !MULTIPLAYER_ENABLED;
      button.classList.toggle("disabled", !MULTIPLAYER_ENABLED);
    }
    if (ui.multiplayerDirectBtn && MULTIPLAYER_ENABLED) {
      ui.multiplayerDirectBtn.disabled = false;
      ui.multiplayerDirectBtn.classList.remove("disabled");
    }
    if (ui.multiplayerJoinBtn && MULTIPLAYER_ENABLED) {
      const canJoin = !!multiplayerState.selectedServerId;
      ui.multiplayerJoinBtn.disabled = !canJoin;
      ui.multiplayerJoinBtn.classList.toggle("disabled", !canJoin);
    }
    if (ui.multiplayerDeleteBtn && MULTIPLAYER_ENABLED) {
      const selectedEntry = findSelectedMultiplayerEntry();
      const canDelete = !!selectedEntry && !selectedEntry.kind;
      ui.multiplayerDeleteBtn.disabled = !canDelete;
      ui.multiplayerDeleteBtn.classList.toggle("disabled", !canDelete);
    }
  }

  function completeProfileSetup() {
    const nextName = normalizeCubeCraftUsername(ui?.profileNameInput?.value || playerUsername || "", "");
    if (!nextName) {
      alert("Enter a username before continuing.");
      ui?.profileNameInput?.focus();
      return false;
    }
    playerUsername = setStoredCubeCraftUsername(nextName) || nextName;
    if (!settings.playerSkinDataUrl && settings.playerSkinPreset === "custom") {
      settings.playerSkinPreset = DEFAULT_SETTINGS.playerSkinPreset;
    }
    showHomeScreen();
    return true;
  }

  function renderAdvancementsScreen() {
    if (!ui?.advancementListEl || !player) return;
    ui.advancementListEl.innerHTML = "";
    for (const [id, def] of Object.entries(ACHIEVEMENT_DEFS)) {
      const state = player.achievements?.[id] || { done: false, unlockedAt: 0 };
      const row = document.createElement("div");
      row.className = `fc-prog-entry${state.done ? " done" : def.parent && !player.achievements?.[def.parent]?.done ? " locked" : ""}`;
      row.innerHTML = `
        <div class="fc-prog-title">${state.done ? "[x]" : "[ ]"} ${def.title}</div>
        <div class="fc-prog-desc">${def.desc}</div>
        <div class="fc-prog-time">${state.done ? `Unlocked ${new Date(state.unlockedAt || Date.now()).toLocaleString()}` : def.parent && !player.achievements?.[def.parent]?.done ? `Locked until ${ACHIEVEMENT_DEFS[def.parent]?.title || "parent"} is complete.` : "Not unlocked yet."}</div>
      `;
      ui.advancementListEl.appendChild(row);
    }
  }

  function renderStatisticsScreen() {
    if (!ui?.statisticsListEl || !player?.stats) return;
    ui.statisticsListEl.innerHTML = "";
    for (const key of PLAYER_STAT_ORDER) {
      const row = document.createElement("div");
      row.className = "fc-stat-row";
      row.innerHTML = `<span>${PLAYER_STAT_LABELS[key] || key}</span><strong>${formatStatValue(key, player.stats[key] || 0)}</strong>`;
      ui.statisticsListEl.appendChild(row);
    }
  }

  function countVillageGolemsNearVillage(center, radius = 20) {
    if (!center) return 0;
    const radius2 = radius * radius;
    let count = 0;
    for (const mob of mobs) {
      if (!mob || mob.type !== "iron_golem" || mob.health <= 0) continue;
      const dx = mob.x - center.x;
      const dz = mob.z - center.z;
      if (dx * dx + dz * dz <= radius2) {
        count += 1;
      }
    }
    return count;
  }

  function spawnVillageVillager(center) {
    if (!world || !center) return false;
    const plan = getVillagePlanFromCenter(center, world.seed);
    if (!plan || !plan.houses?.length) return false;
    const mob = new Mob("villager");
    const houseIndex = countVillagersNearVillage(center, 20) % plan.houses.length;
    const house = plan.houses[houseIndex] || plan.houses[0];
    const spawnX = house.originX + Math.floor(house.width * 0.5) + 0.5;
    const spawnZ = house.originZ + Math.floor(house.depth * 0.5) + 0.5;
    const spawnY = findLoadedWalkableY(world, spawnX, spawnZ, world.terrain.describeColumn(Math.floor(spawnX), Math.floor(spawnZ)).height + 1, 2);
    if (!Number.isFinite(spawnY)) return false;
    if (!isValidMobSpawnLocation("villager", spawnX, spawnY, spawnZ, getDayCycleInfo(worldTime), mob)) return false;
    mob.setPosition(spawnX, spawnY, spawnZ);
    mob.homeX = center.x;
    mob.homeZ = center.z;
    mob.villageSeed = center.seed || world.seed;
    mob.profession = house.profession;
    mob.bedTarget = { x: house.bed.x + 0.5, z: house.bed.z + 0.5 };
    mob.jobTarget = { x: house.jobSite.x + 0.5, z: house.jobSite.z + 0.5, type: house.jobSite.type };
    mob.offers = getVillagerTradeTable(mob.profession, (center.seed || world.seed) + houseIndex * 17);
    mob.willingness = 0.1;
    mobs.push(mob);
    return true;
  }

  function spawnVillageGolem(center) {
    if (!world || !center) return false;
    const plan = getVillagePlanFromCenter(center, world.seed);
    if (!plan) return false;
    const mob = new Mob("iron_golem");
    const candidates = [plan.gatherPoint, ...(plan.pathNodes || [])];
    for (const node of candidates) {
      const x = (node.x || center.x) + 0.5;
      const z = (node.z || center.z) + 0.5;
      const y = findLoadedWalkableY(world, x, z, world.terrain.describeColumn(Math.floor(x), Math.floor(z)).height + 1, 3);
      if (!Number.isFinite(y)) continue;
      if (!isValidMobSpawnLocation("iron_golem", x, y, z, getDayCycleInfo(worldTime), mob)) continue;
      mob.setPosition(x, y, z);
      mob.homeX = center.x;
      mob.homeZ = center.z;
      mob.villageSeed = center.seed || world.seed;
      mob.patrolPoints = plan.pathNodes.map((pathNode) => ({ x: pathNode.x + 0.5, z: pathNode.z + 0.5 }));
      mobs.push(mob);
      return true;
    }
    return false;
  }

  function updateVillageLife(dt) {
    if (!world || !player || mobs.length === 0) return;
    villageLifeTimer += dt;
    if (villageLifeTimer < 1) return;
    villageLifeTimer = 0;
    const cycle = getDayCycleInfo(worldTime);

    for (const mob of mobs) {
      if (!mob || mob.health <= 0 || mob.type !== "villager") continue;
      ensureVillageMobData(mob, world);
      if (cycle.phase === "Sunrise") {
        mob.workedToday = false;
      }
      mob.willingness = clamp((mob.willingness || 0) + (mob.workedToday ? 0.03 : -0.01), 0, 1);
    }

    const villageRadius = Math.max(96, getMobCapRadius() * 1.2);
    const centers = getNearbyVillageCenters(player.x, player.z, world.seed, villageRadius);
    for (const center of centers) {
      const plan = getVillagePlanFromCenter(center, world.seed);
      if (!plan) continue;
      const villagers = mobs.filter((mob) => mob?.type === "villager" && mob.health > 0 && (mob.x - center.x) ** 2 + (mob.z - center.z) ** 2 <= 20 * 20);
      const hostileNearby = mobs.some((mob) => mob && mob.health > 0 && getMobDef(mob.type).hostile && (mob.x - center.x) ** 2 + (mob.z - center.z) ** 2 <= 18 * 18);
      const golems = countVillageGolemsNearVillage(center, 22);
      if (hostileNearby && golems > 0 && (player.x - center.x) ** 2 + (player.z - center.z) ** 2 <= 24 * 24) {
        unlockPlayerAchievement("bodyguard");
      }
      if (golems < 1 && (hostileNearby || villagers.length >= 4)) {
        spawnVillageGolem(center);
      }
      const freeBeds = Math.max(0, plan.houses.length - villagers.length);
      const willingVillagers = villagers.filter((mob) => (mob.willingness || 0) >= 0.62);
      if (!cycle.isNight && cycle.phase !== "Sunset" && freeBeds > 0 && willingVillagers.length >= 2 && Math.random() > 0.72) {
        if (spawnVillageVillager(center)) {
          willingVillagers[0].willingness = clamp((willingVillagers[0].willingness || 0) - 0.36, 0, 1);
          willingVillagers[1].willingness = clamp((willingVillagers[1].willingness || 0) - 0.36, 0, 1);
          queueToast("Village grew", "A new villager joined the settlement.", 4.5, "sys");
        }
      }
    }

    if (tradeOpen) {
      renderVillagerTradeUi();
    }
  }

  function updatePreviewCanvasLook(canvas, armorItems = null, skinOverride = null, mouse = null) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return;
    const pointer = mouse || input?.getMousePosition?.() || { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 };
    const nx = clamp(((pointer.x - rect.left) / rect.width - 0.5) * 2, -1, 1);
    const ny = clamp(((pointer.y - rect.top) / rect.height - 0.45) * 2, -1, 1);
    const prevX = Number(canvas.dataset.lookX) || 0;
    const prevY = Number(canvas.dataset.lookY) || 0;
    if (Math.abs(prevX - nx) < 0.025 && Math.abs(prevY - ny) < 0.025) {
      return;
    }
    canvas.dataset.lookX = String(nx);
    canvas.dataset.lookY = String(ny);
    renderPlayerPreviewCanvas(canvas, armorItems || {}, skinOverride);
  }

  function updateMenuPreviewLookTargets(mouse = null) {
    if (!ui) return;
    const inventoryCanvas = ui.inventoryPreviewEl?.querySelector?.("canvas");
    if (inventoryOpen && inventoryCanvas) {
      updatePreviewCanvasLook(inventoryCanvas, {
        head: getArmorSlotType(0),
        chest: getArmorSlotType(1),
        legs: getArmorSlotType(2),
        feet: getArmorSlotType(3)
      }, getSelectedPlayerSkinCanvas(settings), mouse);
    }
    const settingsCanvas = ui.skinPreviewEl?.querySelector?.("canvas");
    const settingsVisible = ui.screens?.settings?.style?.display !== "none";
    if (settingsVisible && settingsCanvas) {
      updatePreviewCanvasLook(settingsCanvas, {}, getSelectedPlayerSkinCanvas(settings), mouse);
    }
    const profileCanvas = ui.profileSkinPreviewEl?.querySelector?.("canvas");
    const profileVisible = ui.screens?.profile?.style?.display !== "none";
    if (profileVisible && profileCanvas) {
      updatePreviewCanvasLook(profileCanvas, {}, getSelectedPlayerSkinCanvas(settings), mouse);
    }
  }

  function renderInventoryUI() {
    if (!ui || !player) return;
    const craftState = getActiveCraftState();
    const craftResult = getCraftingResult();
    const isTable = inventoryContext === "table";
    const isFurnace = inventoryContext === "furnace";
    const showCreativePalette = settings.gameMode === GAME_MODE.CREATIVE && !isTable && !isFurnace;
    const furnaceState = getActiveFurnaceState(false);
    ui.inventoryTitleEl.textContent = isFurnace ? "Furnace" : showCreativePalette ? "Creative Inventory" : craftState.title;
    ui.inventoryCraftLabelEl.textContent = showCreativePalette ? "Creative" : craftState.label;
    ui.inventoryCraftGridEl.classList.toggle("fc-inv-grid-2", craftState.size === 2);
    ui.inventoryCraftGridEl.classList.toggle("fc-inv-grid-3", craftState.size === 3);
    ui.inventoryCraftRowEl.classList.toggle("table", isTable);
    ui.inventoryPanelEl.classList.toggle("context-table", isTable);
    ui.inventoryPanelEl.classList.toggle("context-furnace", isFurnace);
    ui.inventoryArmorPaneEl.style.display = isTable || isFurnace || showCreativePalette ? "none" : "flex";
    ui.inventoryPreviewPaneEl.style.display = isTable || isFurnace || showCreativePalette ? "none" : "flex";
    ui.inventoryCraftPaneEl.style.display = isFurnace || showCreativePalette ? "none" : "flex";
    ui.inventoryCraftRowEl.style.display = isFurnace || showCreativePalette ? "none" : "flex";
    ui.inventoryCraftLabelEl.style.display = isFurnace || showCreativePalette ? "none" : "block";
    ui.inventoryFurnacePaneEl.classList.toggle("show", isFurnace);
    ui.inventoryMainEl.classList.toggle("creative", showCreativePalette);

    ui.inventoryArmorEl.innerHTML = "";
    ui.inventoryCraftGridEl.innerHTML = "";
    ui.inventoryMainEl.innerHTML = "";
    ui.inventoryHotbarEl.innerHTML = "";

    for (let index = 0; index < ARMOR_SLOTS; index += 1) {
      const slot = document.createElement("div");
      slot.className = "freecube2-slot";
      slot.dataset.armorIndex = String(index);
      renderItemStack(slot, getArmorSlotType(index), getArmorSlotCount(index), true, ARMOR_SLOT_LABELS[index], getArmorSlotDurability(index));
      ui.inventoryArmorEl.appendChild(slot);
    }
    if (!showCreativePalette) {
      renderInventoryPreview();
    } else {
      ui.inventoryPreviewEl.innerHTML = "";
    }

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

    if (showCreativePalette) {
      for (let index = 0; index < CREATIVE_MENU_ITEMS.length; index += 1) {
        const slot = document.createElement("div");
        slot.className = "freecube2-slot";
        slot.dataset.creativeIndex = String(index);
        const itemType = CREATIVE_MENU_ITEMS[index] || BLOCK.AIR;
        renderItemStack(slot, itemType, itemType === BLOCK.AIR ? 0 : getItemMaxStack(itemType), false);
        ui.inventoryMainEl.appendChild(slot);
      }
    } else {
      for (let index = MAIN_INVENTORY_START; index < INVENTORY_SLOTS; index += 1) {
        const slot = document.createElement("div");
        slot.className = "freecube2-slot";
        slot.dataset.inventoryIndex = String(index);
        renderSlotContents(slot, index, false);
        ui.inventoryMainEl.appendChild(slot);
      }
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
        const left = addToInventory(inventoryCursor.type, inventoryCursor.count, false, inventoryCursor.durability || 0);
        if (left > 0) {
          const eye = player.getEyePosition();
          spawnItemEntity(inventoryCursor.type, left, eye.x, eye.y - 0.35, eye.z, 0, 1.6, 0, 0.2, inventoryCursor.durability || 0);
        }
      }
      clearInventoryCursor();
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

  function moveCursorWithSlot(slotType, slotCount, slotDurability, setSlot) {
    if (inventoryCursor.type === BLOCK.AIR || inventoryCursor.count <= 0) {
      if (slotType === BLOCK.AIR || slotCount <= 0) return false;
      inventoryCursor.type = slotType;
      inventoryCursor.count = slotCount;
      inventoryCursor.durability = slotDurability || 0;
      setSlot(BLOCK.AIR, 0, 0);
      return true;
    }
    if (slotType === BLOCK.AIR || slotCount <= 0) {
      setSlot(inventoryCursor.type, inventoryCursor.count, inventoryCursor.durability || 0);
      clearInventoryCursor();
      return true;
    }
    const maxStack = getItemMaxStack(slotType);
    if (slotType === inventoryCursor.type && slotCount < maxStack) {
      const add = Math.min(maxStack - slotCount, inventoryCursor.count);
      setSlot(slotType, slotCount + add, slotDurability || inventoryCursor.durability || 0);
      inventoryCursor.count -= add;
      if (inventoryCursor.count <= 0) {
        clearInventoryCursor();
      }
      return true;
    }
    const swapType = slotType;
    const swapCount = slotCount;
    const swapDurability = slotDurability || 0;
    setSlot(inventoryCursor.type, inventoryCursor.count, inventoryCursor.durability || 0);
    inventoryCursor.type = swapType;
    inventoryCursor.count = swapCount;
    inventoryCursor.durability = swapDurability;
    return true;
  }

  function moveStackIntoInventoryRange(itemType, count, start, end, reverse = false, durability = 0) {
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
      player.inventoryDurability[index] = getItemMaxDurability(itemType) > 0
        ? normalizeDurabilityValue(itemType, durability)
        : 0;
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

  function moveStackIntoArmorSlot(itemType, count, durability = 0) {
    const slotKey = getItemArmorSlot(itemType);
    if (!slotKey || count <= 0) return count;
    const armorIndex = ARMOR_SLOT_KEYS.indexOf(slotKey);
    if (armorIndex < 0 || getArmorSlotCount(armorIndex) > 0) return count;
    setArmorSlot(armorIndex, itemType, 1, durability || 0);
    return count - 1;
  }

  function quickMoveInventorySlot(index) {
    if (!player || index < 0 || index >= INVENTORY_SLOTS) return false;
    const type = getInventorySlotType(index);
    const count = getInventorySlotCount(index);
    const durability = getInventorySlotDurability(index);
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
      const armorLeft = moveStackIntoArmorSlot(type, left, durability);
      if (armorLeft !== left) {
        left = armorLeft;
      }
    }

    if (left > 0) {
      if (index < HOTBAR_SLOTS) {
        left = moveStackIntoInventoryRange(type, left, MAIN_INVENTORY_START, INVENTORY_SLOTS, false, durability);
      } else {
        left = moveStackIntoInventoryRange(type, left, 0, HOTBAR_SLOTS, true, durability);
      }
    }

    if (left === count) return false;
    setInventorySlot(index, type, left, left > 0 ? durability : 0);
    return true;
  }

  function quickMoveArmorSlot(index) {
    const type = getArmorSlotType(index);
    const count = getArmorSlotCount(index);
    const durability = getArmorSlotDurability(index);
    if (!type || type === BLOCK.AIR || count <= 0) return false;
    const left = addToInventory(type, count, false, durability);
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
      addPlayerStat("itemsCrafted", count);
      if (
        recipe.result.itemType === ITEM.WOODEN_PICKAXE ||
        recipe.result.itemType === ITEM.WOODEN_AXE ||
        recipe.result.itemType === ITEM.WOODEN_SHOVEL ||
        recipe.result.itemType === ITEM.WOODEN_SWORD ||
        recipe.result.itemType === ITEM.WOODEN_HOE
      ) {
        unlockPlayerAchievement("benchmarking");
      }
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
    const changed = moveCursorWithSlot(
      getInventorySlotType(index),
      getInventorySlotCount(index),
      getInventorySlotDurability(index),
      (type, count, durability) => setInventorySlot(index, type, count, durability)
    );
    if (!changed) return;
    world.saveDirty = true;
    setHotbarImages();
    renderInventoryUI();
  }

  function handleCreativeSlotClick(index, options = {}) {
    const itemType = getCreativePaletteItem(index);
    if (!itemType || itemType === BLOCK.AIR || !player) return;
    const durability = normalizeDurabilityValue(itemType, getItemMaxDurability(itemType));

    if (options.shiftKey) {
      player.hotbarTypes[player.selectedHotbarSlot] = itemType;
      player.hotbarCounts[player.selectedHotbarSlot] = 1;
      player.inventoryDurability[player.selectedHotbarSlot] = durability;
    } else {
      inventoryCursor.type = itemType;
      inventoryCursor.count = options.single ? 1 : getItemMaxStack(itemType);
      inventoryCursor.durability = durability;
    }

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
      inventoryCursor.durability = getArmorSlotDurability(index);
      setArmorSlot(index, BLOCK.AIR, 0);
    } else {
      if (getItemArmorSlot(inventoryCursor.type) !== slotKey) return;
      const swapType = slotType;
      const swapCount = slotCount;
      const swapDurability = getArmorSlotDurability(index);
      setArmorSlot(index, inventoryCursor.type, 1, inventoryCursor.durability || 0);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        clearInventoryCursor();
      }
      if (swapType !== BLOCK.AIR && swapCount > 0) {
        if (inventoryCursor.type === BLOCK.AIR) {
          inventoryCursor.type = swapType;
          inventoryCursor.count = swapCount;
          inventoryCursor.durability = swapDurability;
        } else {
          const left = addToInventory(swapType, swapCount, false, swapDurability);
          if (left > 0 && player) {
            const eye = player.getEyePosition();
            spawnItemEntity(swapType, left, eye.x, eye.y - 0.35, eye.z, 0, 1.4, 0, 0.2, swapDurability);
          }
        }
      }
    }

    world.saveDirty = true;
    setHotbarImages();
    renderInventoryUI();
  }

  function handleCraftSlotClick(index) {
    const changed = moveCursorWithSlot(getCraftSlotType(index), getCraftSlotCount(index), 0, (type, count) => setCraftSlot(index, type, count));
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
    inventoryCursor.durability = normalizeDurabilityValue(resultType, getItemMaxDurability(resultType));
    addPlayerStat("itemsCrafted", resultCount);
    if (
      resultType === ITEM.WOODEN_PICKAXE ||
      resultType === ITEM.WOODEN_AXE ||
      resultType === ITEM.WOODEN_SHOVEL ||
      resultType === ITEM.WOODEN_SWORD ||
      resultType === ITEM.WOODEN_HOE
    ) {
      unlockPlayerAchievement("benchmarking");
    }
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
      inventoryCursor.durability = 0;
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
      inventoryCursor.durability = 0;
      setFurnaceSlotValue(slot, BLOCK.AIR, 0);
      changed = true;
    } else if (slotValue.type === BLOCK.AIR || slotValue.count <= 0) {
      if (!canAccept) return;
      setFurnaceSlotValue(slot, inventoryCursor.type, inventoryCursor.count);
      clearInventoryCursor();
      changed = true;
    } else if (slotValue.type === inventoryCursor.type && slotValue.count < getItemMaxStack(slotValue.type)) {
      const add = Math.min(getItemMaxStack(slotValue.type) - slotValue.count, inventoryCursor.count);
      if (add <= 0) return;
      setFurnaceSlotValue(slot, slotValue.type, slotValue.count + add);
      inventoryCursor.count -= add;
      if (inventoryCursor.count <= 0) {
        clearInventoryCursor();
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
      inventoryCursor.durability = getInventorySlotDurability(index);
      setInventorySlot(index, slotType, slotCount - take, slotCount - take > 0 ? getInventorySlotDurability(index) : 0);
    } else if (slotType === BLOCK.AIR || slotCount <= 0) {
      setInventorySlot(index, inventoryCursor.type, 1, inventoryCursor.durability || 0);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        clearInventoryCursor();
      }
    } else if (slotType === inventoryCursor.type && slotCount < getItemMaxStack(slotType)) {
      setInventorySlot(index, slotType, slotCount + 1, getInventorySlotDurability(index) || inventoryCursor.durability || 0);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        clearInventoryCursor();
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
      inventoryCursor.durability = 0;
      setCraftSlot(index, slotType, slotCount - take);
    } else if (slotType === BLOCK.AIR || slotCount <= 0) {
      setCraftSlot(index, inventoryCursor.type, 1);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        clearInventoryCursor();
      }
    } else if (slotType === inventoryCursor.type && slotCount < getItemMaxStack(slotType)) {
      setCraftSlot(index, slotType, slotCount + 1);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        clearInventoryCursor();
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
      inventoryCursor.durability = 0;
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
      inventoryCursor.durability = 0;
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
        clearInventoryCursor();
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
      inventoryCursor.durability = getArmorSlotDurability(index);
      setArmorSlot(index, BLOCK.AIR, 0);
    } else {
      if (slotType !== BLOCK.AIR || getItemArmorSlot(inventoryCursor.type) !== slotKey) return;
      setArmorSlot(index, inventoryCursor.type, 1, inventoryCursor.durability || 0);
      inventoryCursor.count -= 1;
      if (inventoryCursor.count <= 0) {
        clearInventoryCursor();
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
    if (!desc) return { type: BLOCK.AIR, count: 0, durability: 0 };
    if (desc.kind === "inventory") return { type: getInventorySlotType(desc.index), count: getInventorySlotCount(desc.index), durability: getInventorySlotDurability(desc.index) };
    if (desc.kind === "craft") return { type: getCraftSlotType(desc.index), count: getCraftSlotCount(desc.index), durability: 0 };
    if (desc.kind === "armor") return { type: getArmorSlotType(desc.index), count: getArmorSlotCount(desc.index), durability: getArmorSlotDurability(desc.index) };
    if (desc.kind === "furnace") return { ...getFurnaceSlotValue(desc.slot), durability: 0 };
    return { type: BLOCK.AIR, count: 0, durability: 0 };
  }

  function setSlotDescriptorValue(desc, type, count, durability = 0) {
    if (!desc) return;
    if (desc.kind === "inventory") setInventorySlot(desc.index, type, count, durability);
    else if (desc.kind === "craft") setCraftSlot(desc.index, type, count);
    else if (desc.kind === "armor") setArmorSlot(desc.index, type, count, durability);
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
        setSlotDescriptorValue(entry.desc, inventoryCursor.type, nextCount, inventoryCursor.durability || 0);
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
          setSlotDescriptorValue(entry.desc, inventoryCursor.type, entry.current + add, inventoryCursor.durability || 0);
          inventoryCursor.count -= add;
          remaining -= add;
          changed = true;
        }
        remainingSlots -= 1;
      }
    }

    if (inventoryCursor.count <= 0) {
      clearInventoryCursor();
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
    inventoryCursor.durability = value.durability || 0;
    setSlotDescriptorValue(desc, value.type, value.count - take, value.count - take > 0 ? (value.durability || 0) : 0);
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

  function getCreativePaletteItem(index) {
    return CREATIVE_MENU_ITEMS[index] || BLOCK.AIR;
  }

  function getHotbarSlotItemType(index) {
    if (!player) return BLOCK.AIR;
    if (isCreativeMode()) {
      const assignedType = player.hotbarTypes[index] || BLOCK.AIR;
      const assignedCount = player.hotbarCounts[index] || 0;
      return assignedCount > 0 && assignedType !== BLOCK.AIR
        ? assignedType
        : (HOTBAR_BLOCKS[index] || BLOCK.AIR);
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

  function addToInventory(itemType, count, refreshUi = true, durability = 0) {
    if (!itemType || itemType === BLOCK.AIR) return count;
    if (isFluidBlock(itemType) || itemType === BLOCK.BEDROCK) return count;
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
      player.inventoryDurability[i] = getItemMaxDurability(itemType) > 0
        ? normalizeDurabilityValue(itemType, durability)
        : 0;
      left -= add;
      changed = true;
    }

    if (changed) {
      if (itemType === ITEM.DIAMOND || itemType === ITEM.EMERALD) {
        unlockPlayerAchievement("shiny_stones");
      }
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
      player.inventoryDurability[idx] = 0;
    }
    setHotbarImages();
    world.saveDirty = true;
    return true;
  }

  function canMergeItemEntities(a, b) {
    if (!a || !b) return false;
    return (
      a.itemType === b.itemType
      && (a.durability || 0) === (b.durability || 0)
      && (a.itemType || BLOCK.AIR) !== BLOCK.AIR
    );
  }

  function mergeItemEntityStack(target, source, amount) {
    const maxStack = getItemMaxStack(target.itemType);
    const room = Math.max(0, maxStack - (target.count || 0));
    const take = Math.min(room, Math.max(0, Math.floor(amount || source?.count || 0)));
    if (take <= 0) return 0;
    target.count = (target.count || 0) + take;
    target.age = Math.min(target.age || 0, source?.age || 0);
    target.pickupDelay = Math.max(target.pickupDelay ?? 0, source?.pickupDelay ?? 0);
    target.updateLag = Math.max(target.updateLag || 0, source?.updateLag || 0);
    target.vx = ((target.vx || 0) + (source?.vx || 0)) * 0.5;
    target.vy = Math.max(target.vy || 0, source?.vy || 0);
    target.vz = ((target.vz || 0) + (source?.vz || 0)) * 0.5;
    return take;
  }

  function compactItemEntities(list) {
    if (!Array.isArray(list) || list.length <= 1) {
      return Array.isArray(list) ? list : [];
    }
    const mergeRadiusSq = ITEM_MERGE_RADIUS * ITEM_MERGE_RADIUS;
    const cellSize = ITEM_MERGE_RADIUS;
    const cells = new Map();
    const merged = [];
    const getCellKey = (item) => {
      const cx = Math.floor(item.x / cellSize);
      const cy = Math.floor(item.y);
      const cz = Math.floor(item.z / cellSize);
      return `${cx}|${cy}|${cz}`;
    };

    for (const item of list) {
      let remaining = Math.max(0, Math.floor(item?.count || 0));
      if (!item || remaining <= 0) continue;
      const baseCx = Math.floor(item.x / cellSize);
      const baseCy = Math.floor(item.y);
      const baseCz = Math.floor(item.z / cellSize);

      outer: for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const bucket = cells.get(`${baseCx + dx}|${baseCy + dy}|${baseCz + dz}`);
            if (!bucket) continue;
            for (const candidate of bucket) {
              if (!canMergeItemEntities(item, candidate)) continue;
              const distSq = ((candidate.x - item.x) ** 2) + ((candidate.y - item.y) ** 2) + ((candidate.z - item.z) ** 2);
              if (distSq > mergeRadiusSq) continue;
              remaining -= mergeItemEntityStack(candidate, item, remaining);
              if (remaining <= 0) {
                break outer;
              }
            }
          }
        }
      }

      if (remaining <= 0) {
        continue;
      }

      const nextItem = { ...item, count: remaining };
      merged.push(nextItem);
      const cellKey = getCellKey(nextItem);
      const bucket = cells.get(cellKey);
      if (bucket) {
        bucket.push(nextItem);
      } else {
        cells.set(cellKey, [nextItem]);
      }
    }

    const chunkBuckets = new Map();
    for (const item of merged) {
      const chunkKey = `${Math.floor(item.x / CHUNK_SIZE)}|${Math.floor(item.z / CHUNK_SIZE)}`;
      const bucket = chunkBuckets.get(chunkKey);
      if (bucket) {
        bucket.push(item);
      } else {
        chunkBuckets.set(chunkKey, [item]);
      }
    }

    const limited = [];
    for (const bucket of chunkBuckets.values()) {
      if (bucket.length <= ITEM_MAX_PER_CHUNK) {
        limited.push(...bucket);
        continue;
      }
      bucket.sort((a, b) => (a.age || 0) - (b.age || 0));
      limited.push(...bucket.slice(0, ITEM_MAX_PER_CHUNK));
    }
    return limited;
  }

  function spawnItemEntity(itemType, count, x, y, z, vx = 0, vy = 3.8, vz = 0, pickupDelay = 0.55, durability = 0) {
    let remaining = Math.max(1, Math.floor(count) || 1);
    const maxStack = getItemMaxStack(itemType);
    const normalizedDurability = getItemMaxDurability(itemType) > 0 ? normalizeDurabilityValue(itemType, durability) : 0;
    const mergeRadiusSq = ITEM_MERGE_RADIUS * ITEM_MERGE_RADIUS;

    for (let index = items.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const existing = items[index];
      if (!canMergeItemEntities({ itemType, durability: normalizedDurability }, existing)) continue;
      const distSq = ((existing.x - x) ** 2) + ((existing.y - y) ** 2) + ((existing.z - z) ** 2);
      if (distSq > mergeRadiusSq) continue;
      remaining -= mergeItemEntityStack(existing, {
        itemType,
        durability: normalizedDurability,
        count: remaining,
        age: 0,
        pickupDelay,
        vx,
        vy,
        vz
      }, remaining);
    }

    while (remaining > 0) {
      const stackCount = clamp(remaining, 1, maxStack);
      items.push({
        kind: "item",
        itemType,
        count: stackCount,
        durability: normalizedDurability,
        x,
        y,
        z,
        vx,
        vy,
        vz,
        age: 0,
        pickupDelay,
        updateLag: 0,
        grounded: false
      });
      remaining -= stackCount;
    }
  }

  function dropSelectedItem() {
    if (isCreativeMode()) return;
    const type = getSelectedHeldItemType();
    const count = getSelectedHeldCount();
    const durability = getInventorySlotDurability(player.selectedHotbarSlot);
    if (!type || count <= 0) return;
    if (!consumeFromSelectedSlot(1)) return;
    const eye = player.getEyePosition();
    const dir = player.getLookVector();
    const x = eye.x + dir.x * 0.8;
    const y = eye.y + dir.y * 0.2;
    const z = eye.z + dir.z * 0.8;
    spawnItemEntity(type, 1, x, y, z, dir.x * 2.4, 2.6, dir.z * 2.4, 0.55, durability);
  }

  function updateItems(dt) {
    if (!items || items.length === 0) return;
    const gravity = 18;
    const radius = 0.18;
    const height = 0.34;
    const bounce = 0.18;
    const farDistanceSq = (runtimePlayerInCave ? ITEM_FAR_SIM_DISTANCE * 0.8 : ITEM_FAR_SIM_DISTANCE) ** 2;
    const veryFarDistanceSq = (runtimePlayerInCave ? ITEM_VERY_FAR_SIM_DISTANCE * 0.8 : ITEM_VERY_FAR_SIM_DISTANCE) ** 2;

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
      item.updateLag = (item.updateLag || 0) + dt;

      // Pickup.
      const dx = item.x - player.x;
      const dy = (item.y + 0.15) - (player.y + 0.9);
      const dz = item.z - player.z;
      const distSq = (dx * dx) + (dy * dy) + (dz * dz);
      const dist = Math.sqrt(distSq);
      if (dist < 1.25 && item.age > (item.pickupDelay ?? 0.55)) {
        const left = addToInventory(item.itemType ?? item.blockType, item.count, true, item.durability || 0);
        if (left <= 0) {
          continue;
        }
        item.count = left;
      }

      let stepInterval = 0;
      if (distSq > veryFarDistanceSq) {
        stepInterval = item.grounded ? 0.24 : 0.18;
      } else if (distSq > farDistanceSq) {
        stepInterval = fpsSmoothed > 0 && fpsSmoothed < 48 ? 0.14 : 0.1;
      }
      if (stepInterval > 0 && item.updateLag < stepInterval) {
        if (item.age < 240) {
          next.push(item);
        }
        continue;
      }

      const stepDt = stepInterval > 0 ? Math.min(0.24, item.updateLag) : dt;
      item.updateLag = 0;
      item.vy -= gravity * stepDt;
      item.vy = Math.max(item.vy, -18);

      item.x += item.vx * stepDt;
      resolveAxis(item, "x", item.vx * stepDt);
      item.z += item.vz * stepDt;
      resolveAxis(item, "z", item.vz * stepDt);
      item.y += item.vy * stepDt;
      resolveAxis(item, "y", item.vy * stepDt);

      if (item.y < 0.1) {
        item.y = 0.1;
        item.vy = 0;
      }

      const grounded = isCollidable(world.peekBlock(Math.floor(item.x), Math.floor(item.y - 0.1), Math.floor(item.z)));
      item.grounded = grounded;
      if (grounded) {
        item.vx *= Math.pow(0.32, stepDt * 6);
        item.vz *= Math.pow(0.32, stepDt * 6);
        if (Math.abs(item.vx) < 0.01) item.vx = 0;
        if (Math.abs(item.vz) < 0.01) item.vz = 0;
      } else {
        item.vx *= Math.pow(0.92, stepDt * 60);
        item.vz *= Math.pow(0.92, stepDt * 60);
      }

      // Despawn after a while.
      if (item.age < 240) {
        next.push(item);
      }
    }
    items = compactItemEntities(next);
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
          addPlayerStat("itemsSmelted", 1);
          unlockPlayerAchievement("hot_stuff");
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

  function blocksSkyLight(blockType) {
    if (blockType === BLOCK.AIR || isFluidBlock(blockType)) {
      return false;
    }
    const info = BLOCK_INFO[blockType];
    if (!info) {
      return true;
    }
    return info.collidable && !info.transparent;
  }

  function hasSkyExposureAt(x, y, z) {
    if (!world) return false;
    const blockX = Math.floor(x);
    const blockZ = Math.floor(z);
    const startY = clamp(Math.floor(y) + 1, 1, WORLD_HEIGHT - 1);
    for (let by = startY; by < WORLD_HEIGHT; by += 1) {
      if (blocksSkyLight(world.peekBlock(blockX, by, blockZ))) {
        return false;
      }
    }
    return true;
  }

  function getApproxSkyLightLevel(x, y, z, cycle = getDayCycleInfo(worldTime)) {
    if (!world) {
      return 0;
    }
    const sky = world.getSkyLightAt(Math.floor(x), Math.floor(y), Math.floor(z));
    if (sky <= 0) {
      return 0;
    }
    return clamp(Math.round(sky * getEffectiveDaylight(cycle, weather.type)), 0, LIGHT_LEVEL_MAX);
  }

  function getApproxBlockLightLevel(x, y, z) {
    if (!world) {
      return 0;
    }
    return clamp(world.getBlockLightAt(Math.floor(x), Math.floor(y), Math.floor(z)), 0, LIGHT_LEVEL_MAX);
  }

  function getApproxLightLevel(x, y, z, cycle = getDayCycleInfo(worldTime)) {
    return Math.max(getApproxSkyLightLevel(x, y, z, cycle), getApproxBlockLightLevel(x, y, z));
  }

  function canGrassStayAt(x, y, z, cycle = getDayCycleInfo(worldTime)) {
    if (!world) return false;
    const above = world.peekBlock(x, y + 1, z);
    if (blocksSkyLight(above)) {
      return false;
    }
    return getApproxSkyLightLevel(x, y + 1, z, cycle) >= 4;
  }

  function canGrassSpreadTo(x, y, z, cycle = getDayCycleInfo(worldTime)) {
    if (!world || world.peekBlock(x, y, z) !== BLOCK.DIRT) {
      return false;
    }
    const above = world.peekBlock(x, y + 1, z);
    if (blocksSkyLight(above)) {
      return false;
    }
    return getApproxSkyLightLevel(x, y + 1, z, cycle) >= 9;
  }

  function hasNearbyGrass(x, y, z) {
    if (!world) return false;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          if (world.peekBlock(x + dx, y + dy, z + dz) === BLOCK.GRASS) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function tickGrassBlockAt(x, y, z, cycle = getDayCycleInfo(worldTime)) {
    if (!world) return;
    const blockType = world.peekBlock(x, y, z);
    if (blockType === BLOCK.GRASS) {
      if (!canGrassStayAt(x, y, z, cycle)) {
        world.setBlock(x, y, z, BLOCK.DIRT);
      }
      return;
    }
    if (blockType === BLOCK.DIRT && canGrassSpreadTo(x, y, z, cycle) && hasNearbyGrass(x, y, z) && Math.random() < 0.2) {
      world.setBlock(x, y, z, BLOCK.GRASS);
    }
  }

  function updateWorldRandomTicks(dt) {
    if (!world || !player) return;
    if (gamerules.doDaylightCycle !== false) {
      worldTime = (worldTime + dt) % MINECRAFT_DAY_LENGTH_SECONDS;
    }
    worldTickTimer += dt;
    if (worldTickTimer < RANDOM_BLOCK_TICK_INTERVAL) {
      return;
    }

    const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);
    const maxChunkDistance = (settings?.renderDistanceChunks || DEFAULT_RENDER_DISTANCE) + 1;
    randomTickChunkCacheTimer -= dt;
    if (
      randomTickChunkCacheTimer <= 0 ||
      playerChunkX !== randomTickCacheChunkX ||
      playerChunkZ !== randomTickCacheChunkZ ||
      randomTickChunkCache.length === 0
    ) {
      randomTickChunkCache = [];
      for (const chunk of world.chunks.values()) {
        if (!chunk?.generated) continue;
        const dist = Math.max(Math.abs(chunk.chunkX - playerChunkX), Math.abs(chunk.chunkZ - playerChunkZ));
        if (dist <= maxChunkDistance) {
          randomTickChunkCache.push(chunk);
        }
      }
      randomTickCacheChunkX = playerChunkX;
      randomTickCacheChunkZ = playerChunkZ;
      randomTickChunkCacheTimer = runtimePlayerInCave || (fpsSmoothed > 0 && fpsSmoothed < 48) ? 0.85 : 0.45;
    }
    if (randomTickChunkCache.length === 0) {
      worldTickTimer = 0;
      return;
    }

    const cycle = getDayCycleInfo(worldTime);
    while (worldTickTimer >= RANDOM_BLOCK_TICK_INTERVAL) {
      worldTickTimer -= RANDOM_BLOCK_TICK_INTERVAL;
      for (let i = 0; i < RANDOM_BLOCK_TICKS_PER_STEP; i += 1) {
        const chunk = randomTickChunkCache[(Math.random() * randomTickChunkCache.length) | 0];
        const localX = (Math.random() * CHUNK_SIZE) | 0;
        const localZ = (Math.random() * CHUNK_SIZE) | 0;
        const worldX = chunk.chunkX * CHUNK_SIZE + localX;
        const worldZ = chunk.chunkZ * CHUNK_SIZE + localZ;
        const surfaceY = clamp(world.terrain.describeColumn(worldX, worldZ).height, 1, WORLD_HEIGHT - 2);
        tickGrassBlockAt(worldX, surfaceY, worldZ, cycle);
        tickGrassBlockAt(worldX, surfaceY - 1, worldZ, cycle);
      }
    }
  }

  function updateFluids(dt) {
    if (!world) return;
    if (world.activeWaterUpdates.size === 0 && world.activeLavaUpdates.size === 0) {
      return;
    }
    const preset = getPerformancePresetConfig(settings.performancePreset);
    const runtimeLowFps = fpsSmoothed > 0 && fpsSmoothed < (runtimePlayerInCave ? 50 : 44);
    const waterStepLimit = runtimePlayerInCave ? 1 : runtimeLowFps ? 2 : 3;
    const lavaStepLimit = runtimePlayerInCave ? 1 : runtimeLowFps ? 1 : 2;
    const waterFlowSteps = Math.max(4, Math.round(preset.waterSteps * (runtimePlayerInCave ? (runtimeLowFps ? 0.35 : 0.55) : runtimeLowFps ? 0.72 : 1)));
    const lavaFlowSteps = Math.max(2, Math.round(preset.lavaSteps * (runtimePlayerInCave ? 0.7 : runtimeLowFps ? 0.82 : 1)));
    waterFlowTimer += dt;
    lavaFlowTimer += dt;

    let waterSteps = 0;
    while (waterFlowTimer >= WATER_FLOW_TICK_SECONDS && waterSteps < waterStepLimit) {
      waterFlowTimer -= WATER_FLOW_TICK_SECONDS;
      world.stepFluidSimulation(BLOCK.WATER, waterFlowSteps);
      waterSteps += 1;
    }

    let lavaSteps = 0;
    while (lavaFlowTimer >= LAVA_FLOW_TICK_SECONDS && lavaSteps < lavaStepLimit) {
      lavaFlowTimer -= LAVA_FLOW_TICK_SECONDS;
      world.stepFluidSimulation(BLOCK.LAVA, lavaFlowSteps);
      lavaSteps += 1;
    }
  }

  function queueAllKnownRedstoneDirty() {
    if (!world) return;
    for (const key of world.redstoneStates.keys()) {
      const [x, y, z] = key.split("|").map(Number);
      world.queueRedstoneDirtyAround(x, y, z);
    }
  }

  function flushPendingMultiplayerBlockUpdates() {
    if (!world) return;
    if (!isMultiplayerHost()) {
      world.consumePendingBlockBroadcasts(512);
      return;
    }
    for (const update of world.consumePendingBlockBroadcasts(128)) {
      broadcastMultiplayerPeerMessage({
        type: "block_update",
        x: update.x,
        y: update.y,
        z: update.z,
        blockType: update.type
      });
    }
  }

  function canSupportFloorMountedRedstone(x, y, z) {
    if (!world || y <= 0) return false;
    return isCollidable(world.peekBlock(x, y - 1, z));
  }

  function getExistingRedstoneStateAt(x, y, z) {
    return world?.getRedstoneStateAt(x, y, z) || null;
  }

  function getOrCreateRedstoneStateAt(x, y, z, blockType = world?.peekBlock(x, y, z), overrides = {}) {
    if (!world || !usesRedstoneState(blockType)) {
      return null;
    }
    const existing = world.getRedstoneStateAt(x, y, z);
    if (existing?.blockType === blockType) {
      return existing;
    }
    const created = buildDefaultRedstoneState(blockType, overrides);
    if (!created) {
      return null;
    }
    world.setRedstoneStateAt(x, y, z, blockType, created);
    return world.getRedstoneStateAt(x, y, z);
  }

  function setRedstoneStateAtPosition(x, y, z, blockType, nextState) {
    if (!world || !usesRedstoneState(blockType)) {
      return false;
    }
    return world.setRedstoneStateAt(x, y, z, blockType, nextState);
  }

  function getRedstoneOutputPowerAt(fromX, fromY, fromZ, toX, toY, toZ) {
    if (!world) return 0;
    const blockType = world.peekBlock(fromX, fromY, fromZ);
    const state = getExistingRedstoneStateAt(fromX, fromY, fromZ);
    if (blockType === BLOCK.REDSTONE_WIRE) {
      return clamp(Math.floor(Number(state?.power) || 0), 0, REDSTONE_MAX_SIGNAL);
    }
    if (blockType === BLOCK.LEVER) {
      return state?.powered ? REDSTONE_MAX_SIGNAL : 0;
    }
    if (blockType === BLOCK.REDSTONE_TORCH) {
      return state?.lit !== false ? REDSTONE_MAX_SIGNAL : 0;
    }
    if (blockType === BLOCK.REPEATER) {
      if (!state?.powered) return 0;
      const vec = getFacingVector(state.facing);
      return fromX + vec.x === toX && fromY + vec.y === toY && fromZ + vec.z === toZ
        ? REDSTONE_MAX_SIGNAL
        : 0;
    }
    return 0;
  }

  function isBlockIndirectlyPowered(x, y, z) {
    if (!world) return false;
    for (const offset of REDSTONE_NEIGHBOR_OFFSETS) {
      const fromX = x + offset.x;
      const fromY = y + offset.y;
      const fromZ = z + offset.z;
      if (getRedstoneOutputPowerAt(fromX, fromY, fromZ, x, y, z) > 0) {
        return true;
      }
    }
    return false;
  }

  function getRepeaterInputPowerAt(x, y, z, facing) {
    const rear = getFacingVector(getOppositeFacing(facing));
    const fromX = x + rear.x;
    const fromY = y + rear.y;
    const fromZ = z + rear.z;
    return getRedstoneOutputPowerAt(fromX, fromY, fromZ, x, y, z);
  }

  function computeWirePowerAt(x, y, z) {
    if (!world) return 0;
    let best = 0;
    for (const offset of REDSTONE_NEIGHBOR_OFFSETS) {
      const nx = x + offset.x;
      const ny = y + offset.y;
      const nz = z + offset.z;
      const neighborType = world.peekBlock(nx, ny, nz);
      if (neighborType === BLOCK.REDSTONE_WIRE) {
        const state = getOrCreateRedstoneStateAt(nx, ny, nz, neighborType);
        best = Math.max(best, Math.max(0, (state?.power || 0) - 1));
        continue;
      }
      best = Math.max(best, getRedstoneOutputPowerAt(nx, ny, nz, x, y, z));
    }
    return clamp(best, 0, REDSTONE_MAX_SIGNAL);
  }

  function canPistonMoveBlock(blockType) {
    if (!blockType || blockType === BLOCK.AIR) return true;
    if (isFluidBlock(blockType)) return false;
    if (blockType === BLOCK.BEDROCK || blockType === BLOCK.OBSIDIAN || blockType === BLOCK.PISTON_HEAD) {
      return false;
    }
    return true;
  }

  function moveBlockPreservingState(fromX, fromY, fromZ, toX, toY, toZ) {
    if (!world) return false;
    const blockType = world.peekBlock(fromX, fromY, fromZ);
    if (!blockType || blockType === BLOCK.AIR) {
      return false;
    }
    const movedState = getExistingRedstoneStateAt(fromX, fromY, fromZ);
    if (!world.setBlock(toX, toY, toZ, blockType)) {
      return false;
    }
    if (movedState && usesRedstoneState(blockType)) {
      setRedstoneStateAtPosition(toX, toY, toZ, blockType, movedState);
    }
    world.setBlock(fromX, fromY, fromZ, BLOCK.AIR);
    world.queueRedstoneDirtyAround(fromX, fromY, fromZ);
    world.queueRedstoneDirtyAround(toX, toY, toZ);
    return true;
  }

  function extendPistonAt(x, y, z, blockType, state) {
    if (!world || state?.extended) return false;
    const vec = getFacingVector(state?.facing);
    const chain = [];
    let foundAir = false;
    for (let step = 1; step <= PISTON_PUSH_LIMIT + 1; step += 1) {
      const tx = x + vec.x * step;
      const ty = y + vec.y * step;
      const tz = z + vec.z * step;
      const type = world.peekBlock(tx, ty, tz);
      if (type === BLOCK.AIR) {
        foundAir = true;
        break;
      }
      if (!canPistonMoveBlock(type) || step > PISTON_PUSH_LIMIT) {
        return false;
      }
      chain.push({ x: tx, y: ty, z: tz, type });
    }
    if (!foundAir) {
      return false;
    }

    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const entry = chain[index];
      if (!moveBlockPreservingState(entry.x, entry.y, entry.z, entry.x + vec.x, entry.y + vec.y, entry.z + vec.z)) {
        return false;
      }
    }

    const headX = x + vec.x;
    const headY = y + vec.y;
    const headZ = z + vec.z;
    if (world.peekBlock(headX, headY, headZ) !== BLOCK.AIR) {
      return false;
    }
    world.setBlock(headX, headY, headZ, BLOCK.PISTON_HEAD);
    setRedstoneStateAtPosition(headX, headY, headZ, BLOCK.PISTON_HEAD, {
      facing: state.facing,
      sticky: blockType === BLOCK.STICKY_PISTON,
      baseKey: packBlockPositionKey(x, y, z)
    });
    setRedstoneStateAtPosition(x, y, z, blockType, { ...state, extended: true });
    world.queueRedstoneDirtyAround(x, y, z);
    return true;
  }

  function retractPistonAt(x, y, z, blockType, state) {
    if (!world || !state?.extended) return false;
    const vec = getFacingVector(state.facing);
    const headX = x + vec.x;
    const headY = y + vec.y;
    const headZ = z + vec.z;
    if (world.peekBlock(headX, headY, headZ) === BLOCK.PISTON_HEAD) {
      world.setBlock(headX, headY, headZ, BLOCK.AIR);
    }
    if (blockType === BLOCK.STICKY_PISTON) {
      const pullX = x + vec.x * 2;
      const pullY = y + vec.y * 2;
      const pullZ = z + vec.z * 2;
      const pulledType = world.peekBlock(pullX, pullY, pullZ);
      if (pulledType !== BLOCK.AIR && canPistonMoveBlock(pulledType) && world.peekBlock(headX, headY, headZ) === BLOCK.AIR) {
        moveBlockPreservingState(pullX, pullY, pullZ, headX, headY, headZ);
      }
    }
    setRedstoneStateAtPosition(x, y, z, blockType, { ...state, extended: false });
    world.queueRedstoneDirtyAround(x, y, z);
    return true;
  }

  function processRedstoneScheduledTick(entry) {
    if (!world || !entry) return false;
    const blockType = world.peekBlock(entry.x, entry.y, entry.z);
    if (blockType !== BLOCK.REPEATER) {
      return false;
    }
    const state = getOrCreateRedstoneStateAt(entry.x, entry.y, entry.z, blockType);
    if (!state || typeof state.pendingPowered !== "boolean") {
      return false;
    }
    const changed = setRedstoneStateAtPosition(entry.x, entry.y, entry.z, blockType, {
      ...state,
      powered: state.pendingPowered,
      pendingPowered: null
    });
    if (changed) {
      world.queueRedstoneDirtyAround(entry.x, entry.y, entry.z);
    }
    return changed;
  }

  function updateRedstoneBlockAt(x, y, z) {
    if (!world || y <= 0 || y >= WORLD_HEIGHT) {
      return false;
    }
    const blockType = world.peekBlock(x, y, z);
    if (blockType === BLOCK.AIR) {
      world.clearRedstoneStateAt(x, y, z);
      return false;
    }

    if (
      (blockType === BLOCK.REDSTONE_WIRE || blockType === BLOCK.LEVER || blockType === BLOCK.REDSTONE_TORCH || blockType === BLOCK.REPEATER)
      && !canSupportFloorMountedRedstone(x, y, z)
    ) {
      return world.setBlock(x, y, z, BLOCK.AIR);
    }

    if (blockType === BLOCK.PISTON_HEAD) {
      const headState = getOrCreateRedstoneStateAt(x, y, z, blockType);
      if (!headState?.baseKey) {
        return world.setBlock(x, y, z, BLOCK.AIR);
      }
      const [baseX, baseY, baseZ] = headState.baseKey.split("|").map(Number);
      const baseType = world.peekBlock(baseX, baseY, baseZ);
      const baseState = getExistingRedstoneStateAt(baseX, baseY, baseZ);
      if (!isPistonBaseBlock(baseType) || !baseState?.extended) {
        return world.setBlock(x, y, z, BLOCK.AIR);
      }
      return false;
    }

    if (blockType === BLOCK.REDSTONE_WIRE) {
      const state = getOrCreateRedstoneStateAt(x, y, z, blockType);
      const nextPower = computeWirePowerAt(x, y, z);
      if ((state?.power || 0) !== nextPower) {
        return setRedstoneStateAtPosition(x, y, z, blockType, { ...state, power: nextPower });
      }
      return false;
    }

    if (blockType === BLOCK.REDSTONE_TORCH) {
      const state = getOrCreateRedstoneStateAt(x, y, z, blockType);
      const nextLit = !isBlockIndirectlyPowered(x, y - 1, z);
      if ((state?.lit !== false) !== nextLit) {
        return setRedstoneStateAtPosition(x, y, z, blockType, { ...state, lit: nextLit });
      }
      return false;
    }

    if (blockType === BLOCK.REPEATER) {
      const state = getOrCreateRedstoneStateAt(x, y, z, blockType, { facing: getFacingFromYaw(player?.yaw || 0), delay: 1 });
      const wantsPowered = getRepeaterInputPowerAt(x, y, z, state.facing) > 0;
      const currentPending = typeof state.pendingPowered === "boolean" ? state.pendingPowered : null;
      if (currentPending !== wantsPowered || (state.powered !== wantsPowered && currentPending === null)) {
        setRedstoneStateAtPosition(x, y, z, blockType, { ...state, pendingPowered: wantsPowered });
        world.queueRedstoneTick(
          x,
          y,
          z,
          clamp(state.delay, REDSTONE_REPEATER_MIN_DELAY, REDSTONE_REPEATER_MAX_DELAY) * REDSTONE_REPEATER_DELAY_STEPS,
          "repeater"
        );
      }
      return false;
    }

    if (isPistonBaseBlock(blockType)) {
      const state = getOrCreateRedstoneStateAt(x, y, z, blockType, { facing: getFacingFromYaw(player?.yaw || 0) });
      const wantsExtended = isBlockIndirectlyPowered(x, y, z);
      if (wantsExtended && !state?.extended) {
        return extendPistonAt(x, y, z, blockType, state);
      }
      if (!wantsExtended && state?.extended) {
        return retractPistonAt(x, y, z, blockType, state);
      }
      return false;
    }

    return false;
  }

  function updateRedstoneSimulationStep() {
    if (!world) return;
    world.advanceRedstoneTicks();
    for (const entry of world.consumeDueRedstoneTicks(REDSTONE_SCHEDULE_LIMIT_PER_STEP)) {
      processRedstoneScheduledTick(entry);
    }

    let processed = 0;
    while (processed < REDSTONE_UPDATE_LIMIT_PER_STEP) {
      const batch = world.consumeQueuedRedstoneDirty(REDSTONE_UPDATE_LIMIT_PER_STEP - processed);
      if (batch.length === 0) {
        break;
      }
      for (const key of batch) {
        const [x, y, z] = key.split("|").map(Number);
        if (updateRedstoneBlockAt(x, y, z)) {
          world.queueRedstoneDirtyAround(x, y, z);
        }
        processed += 1;
        if (processed >= REDSTONE_UPDATE_LIMIT_PER_STEP) {
          break;
        }
      }
    }
  }

  function initializePlacedRedstoneBlock(x, y, z, blockType) {
    if (!world || !usesRedstoneState(blockType)) {
      return false;
    }
    const facing = getFacingFromYaw(player?.yaw || 0);
    setRedstoneStateAtPosition(x, y, z, blockType, buildDefaultRedstoneState(blockType, { facing }));
    world.queueRedstoneDirtyAround(x, y, z);
    return true;
  }

  function updateBlockTicks(dt) {
    if (!world) return;
    blockTickAccumulator = Math.min(
      blockTickAccumulator + dt,
      BLOCK_TICK_STEP_SECONDS * MAX_BLOCK_TICK_STEPS_PER_FRAME
    );
    let steps = 0;
    while (blockTickAccumulator >= BLOCK_TICK_STEP_SECONDS && steps < MAX_BLOCK_TICK_STEPS_PER_FRAME) {
      updateWorldRandomTicks(BLOCK_TICK_STEP_SECONDS);
      updateRedstoneSimulationStep();
      updateFluids(BLOCK_TICK_STEP_SECONDS);
      blockTickAccumulator -= BLOCK_TICK_STEP_SECONDS;
      steps += 1;
    }
    flushPendingMultiplayerBlockUpdates();
  }

  function serializeCurrentWorldState() {
    return {
      time: normalizeWorldTimeSeconds(worldTime),
      weather: {
        type: weather.type,
        timer: Math.max(1, weather.timer || 1)
      },
      gamerules: { ...gamerules },
      worldSpawnPoint: worldSpawnPoint ? { ...worldSpawnPoint } : null,
      redstoneStates: serializeRedstoneStates(world?.redstoneStates)
    };
  }

  function setWorldSpawn(point, announce = false) {
    worldSpawnPoint = normalizeSpawnPoint(point, worldSpawnPoint || (world ? world.findSpawn(0, 0) : null));
    if (world) {
      world.saveDirty = true;
    }
    if (announce && worldSpawnPoint) {
      pushChatLine(`World spawn set to ${worldSpawnPoint.x.toFixed(1)} ${worldSpawnPoint.y.toFixed(1)} ${worldSpawnPoint.z.toFixed(1)}.`, "sys");
    }
  }

  function setPlayerSpawnPoint(point, announce = false) {
    if (!player) return;
    player.spawnPoint = normalizeSpawnPoint(point, null);
    if (world) {
      world.saveDirty = true;
    }
    if (announce && player.spawnPoint) {
      pushChatLine("Respawn point set.", "sys");
    }
  }

  function isPlayerBedSpawnValid(spawnPoint = player?.spawnPoint) {
    if (!world || !spawnPoint) return false;
    if (spawnPoint.bedKey) {
      const [x, y, z] = spawnPoint.bedKey.split("|").map(Number);
      return world.peekBlock(x, y, z) === BLOCK.BED;
    }
    return true;
  }

  function clearPlayerBedSpawnIfNeeded(x, y, z, announce = false) {
    if (!player?.spawnPoint?.bedKey) return false;
    const key = packBlockPositionKey(x, y, z);
    if (player.spawnPoint.bedKey !== key) return false;
    player.spawnPoint = null;
    if (world) {
      world.saveDirty = true;
    }
    if (announce) {
      pushChatLine("Your bed was destroyed, so your respawn point reset to world spawn.", "sys");
    }
    return true;
  }

  function getRespawnPoint() {
    if (player?.spawnPoint && isPlayerBedSpawnValid(player.spawnPoint)) {
      return { x: player.spawnPoint.x, y: player.spawnPoint.y, z: player.spawnPoint.z };
    }
    if (player?.spawnPoint?.bedKey && !isPlayerBedSpawnValid(player.spawnPoint)) {
      player.spawnPoint = null;
    }
    if (worldSpawnPoint) {
      return { x: worldSpawnPoint.x, y: worldSpawnPoint.y, z: worldSpawnPoint.z };
    }
    return world ? world.findSpawn(0, 0) : { x: 0.5, y: SEA_LEVEL + 2, z: 0.5 };
  }

  function getPreferredRespawnPoint() {
    return getRespawnPoint();
  }

  function getPlayerCurrentBiome() {
    if (!player || !world) return "plains";
    return world.terrain.describeColumn(Math.floor(player.x), Math.floor(player.z)).biome;
  }

  function biomeGetsRain(biome = getPlayerCurrentBiome()) {
    return biome !== "desert";
  }

  function canSleepNow() {
    return isNightTime(worldTime) || weather.type === WEATHER_TYPES.THUNDER;
  }

  function setWeatherState(type, durationSeconds = null, announce = false) {
    const normalizedType = normalizeWeatherType(type);
    weather.type = normalizedType;
    weather.timer = Math.max(1, Number(durationSeconds) || getRandomWeatherDurationSeconds(normalizedType));
    weather.flash = 0;
    weather.lightningTimer = normalizedType === WEATHER_TYPES.THUNDER ? 2 + Math.random() * 6 : 0;
    if (normalizedType === WEATHER_TYPES.CLEAR) {
      weatherVisualIntensity = Math.min(weatherVisualIntensity, 0.28);
    }
    if (world) {
      world.saveDirty = true;
    }
    if (announce) {
      pushChatLine(`Weather set to ${getWeatherLabel(normalizedType)}.`, "sys");
    }
  }

  function advanceWeatherState() {
    const roll = Math.random();
    if (weather.type === WEATHER_TYPES.CLEAR) {
      setWeatherState(roll > 0.74 ? WEATHER_TYPES.THUNDER : WEATHER_TYPES.RAIN);
      return;
    }
    if (weather.type === WEATHER_TYPES.RAIN) {
      setWeatherState(roll > 0.58 ? WEATHER_TYPES.CLEAR : WEATHER_TYPES.THUNDER);
      return;
    }
    setWeatherState(roll > 0.42 ? WEATHER_TYPES.CLEAR : WEATHER_TYPES.RAIN);
  }

  function updateWeather(dt) {
    const targetIntensity = getWeatherBaseIntensity(weather.type);
    weatherVisualIntensity = lerp(weatherVisualIntensity, targetIntensity, clamp(dt * 2, 0, 1));
    weather.flash = Math.max(0, (weather.flash || 0) - dt * 3.2);
    if (weather.type === WEATHER_TYPES.THUNDER) {
      weather.lightningTimer -= dt;
      if (weather.lightningTimer <= 0) {
        weather.flash = 1;
        weather.lightningTimer = 2 + Math.random() * 7;
      }
    } else {
      weather.lightningTimer = 0;
    }

    if (!isMultiplayerGuest() && gamerules.doWeatherCycle !== false) {
      weather.timer -= dt;
      if (weather.timer <= 0) {
        advanceWeatherState();
      }
    }

    if (!ui) return;
    const showWeather = !!world && (mode === "playing" || mode === "paused" || mode === "loading" || sleepState.active);
    if (!showWeather) {
      ui.weatherOverlayEl.style.opacity = "0";
      ui.weatherOverlayEl.style.display = "none";
      ui.lightningFlashEl.style.display = "none";
      ui.lightningFlashEl.style.opacity = "0";
      return;
    }
    ui.weatherOverlayEl.style.opacity = "0";
    ui.weatherOverlayEl.style.display = "none";
    ui.lightningFlashEl.style.display = weather.flash > 0.01 ? "block" : "none";
    ui.lightningFlashEl.style.opacity = weather.flash > 0.01 ? String(clamp(weather.flash * 0.55, 0, 0.55)) : "0";
  }

  function isHostileSpawnWindow(cycle = getDayCycleInfo(worldTime)) {
    return cycle.isNight || getEffectiveDaylight(cycle, weather.type) <= 0.4 || weather.type === WEATHER_TYPES.THUNDER;
  }

  function isWetWeatherAt(x, z) {
    if (!world || weather.type === WEATHER_TYPES.CLEAR) {
      return false;
    }
    const biome = world.terrain.describeColumn(Math.floor(x), Math.floor(z)).biome;
    return biomeGetsRain(biome);
  }

  function isSpawnDistanceValid(x, z) {
    if (!player) return false;
    const dx = x - player.x;
    const dz = z - player.z;
    const dist2 = dx * dx + dz * dz;
    return dist2 >= 24 * 24 && dist2 <= 128 * 128;
  }

  function hasMobSpawnSpace(x, y, z, mob) {
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    const clearance = Math.max(2, Math.ceil(mob.height));
    for (let i = 0; i < clearance; i += 1) {
      const block = world.peekBlock(blockX, blockY + i, blockZ);
      if (block !== BLOCK.AIR && (isCollidable(block) || isFluidBlock(block))) {
        return false;
      }
    }
    return true;
  }

  function isValidSpawnGround(blockType, requireGrass = false) {
    if (!isCollidable(blockType) || isFluidBlock(blockType)) {
      return false;
    }
    const info = BLOCK_INFO[blockType];
    if (!info || info.transparent) {
      return false;
    }
    return requireGrass ? blockType === BLOCK.GRASS : true;
  }

  function isValidMobSpawnLocation(type, x, y, z, cycle = getDayCycleInfo(worldTime), mob = new Mob(type)) {
    if (!world || !Number.isFinite(y) || !isSpawnDistanceValid(x, z)) {
      return false;
    }
    const groundY = Math.floor(y) - 1;
    const groundBlock = world.peekBlock(Math.floor(x), groundY, Math.floor(z));
    const light = getApproxLightLevel(x, y, z, cycle);
    const hostile = !!getMobDef(type).hostile;
    const requireGrass = !hostile && type !== "villager" && type !== "iron_golem";
    if (!isValidSpawnGround(groundBlock, requireGrass)) {
      return false;
    }
    if (!hasMobSpawnSpace(x, y, z, mob)) {
      return false;
    }
    if (entityWouldCollide(world, x, y, z, mob.radius, mob.height)) {
      return false;
    }
    if (hostile) {
      return light <= 7;
    }
    if (type === "villager") {
      return light >= 8;
    }
    return light >= 9;
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
    const hostileWindow = isHostileSpawnWindow(cycle);
    const hostilesInDay = inRange
      .filter((entry) => getMobDef(entry.mob.type).hostile && !hostileWindow)
      .sort((a, b) => b.dist2 - a.dist2);
    const loosePassives = inRange
      .filter((entry) => entry.mob.type !== "villager" && entry.mob.type !== "iron_golem" && !getMobDef(entry.mob.type).hostile)
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
    const bodyBlock = world.peekBlock(checkX, Math.floor(mob.y + 0.1), checkZ);
    if (isFluidBlock(bodyBlock)) return false;

    for (let y = checkY; y < WORLD_HEIGHT; y += 1) {
      const block = world.peekBlock(checkX, y, checkZ);
      if (block !== BLOCK.AIR && !isFluidBlock(block)) {
        return false;
      }
    }
    return true;
  }

  function spawnMobNearPlayer(type = "zombie") {
    if (!world || !player) return false;
    const mob = new Mob(type);
    const cycle = getDayCycleInfo(worldTime);
    const hostile = !!getMobDef(type).hostile;

    if (type === "villager") {
      const center = getNearestVillageCenter(player.x, player.z, world.seed, Math.max(96, getMobCapRadius() * 1.35));
      if (!center) return false;

      for (let tries = 0; tries < 16; tries += 1) {
        const angle = random2(tries + 41, tries * 7, center.seed + 1901) * Math.PI * 2;
        const dist = 2.5 + random2(tries + 17, tries * 11, center.seed + 1902) * 7.5;
        const x = center.x + Math.sin(angle) * dist;
        const z = center.z + Math.cos(angle) * dist;
        const y = findLoadedWalkableY(world, x, z, world.terrain.describeColumn(Math.floor(x), Math.floor(z)).height + 1, 2);
        if (!Number.isFinite(y)) continue;
        if (!isValidMobSpawnLocation(type, x, y, z, cycle, mob)) continue;
        mob.setPosition(x, y, z);
        mob.homeX = center.x;
        mob.homeZ = center.z;
        mobs.push(mob);
        ensureVillageMobData(mob, world);
        return true;
      }
      return false;
    }

    const maxDist = Math.min(128, Math.max(42, getMobCapRadius() * 1.9));
    const minDist = hostile ? 24 : 28;
    for (let tries = 0; tries < 28; tries += 1) {
      const angle = random2(tries, tries * 9, world.seed + 1211) * Math.PI * 2;
      const dist = minDist + random2(tries, tries * 13, world.seed + 1212) * (maxDist - minDist);
      const x = player.x + Math.sin(angle) * dist;
      const z = player.z + Math.cos(angle) * dist;
      const surfaceHint = world.terrain.describeColumn(Math.floor(x), Math.floor(z)).height + 1;
      const caveHint = clamp(player.y + (random2(tries, tries * 17, world.seed + 1227) - 0.5) * 26, 3, surfaceHint + 1);
      const hintY = hostile ? caveHint : surfaceHint;
      const y = findLoadedWalkableY(world, x, z, hintY, mob.height > 1.2 ? 2 : 1);
      if (!Number.isFinite(y)) continue;
      if (!isValidMobSpawnLocation(type, x, y, z, cycle, mob)) continue;
      mob.setPosition(x, y, z);
      mobs.push(mob);
      return true;
    }
    return false;
  }

  function summonMobNearPlayer(type = "zombie") {
    if (!world || !player) return false;
    const mob = new Mob(type);
    for (let tries = 0; tries < 16; tries += 1) {
      const angle = ((Math.PI * 2) / 16) * tries + (Math.random() - 0.5) * 0.45;
      const dist = 3 + tries * 0.45;
      const x = player.x + Math.sin(angle) * dist;
      const z = player.z + Math.cos(angle) * dist;
      const terrainY = world.terrain.describeColumn(Math.floor(x), Math.floor(z)).height + 1;
      const y = findLoadedWalkableY(world, x, z, Math.max(player.y + 3, terrainY), mob.height > 1.2 ? 2 : 1);
      if (!Number.isFinite(y)) continue;
      if (!hasMobSpawnSpace(x, y, z, mob)) continue;
      if (entityWouldCollide(world, x, y, z, mob.radius, mob.height)) continue;
      mob.setPosition(x, y, z);
      if (type === "villager") {
        mob.homeX = x;
        mob.homeZ = z;
        ensureVillageMobData(mob, world);
      }
      mobs.push(mob);
      return true;
    }

    const fallbackY = findWalkableY(world, player.x + 2, player.z + 2, player.y + 3, mob.height > 1.2 ? 2 : 1);
    if (!Number.isFinite(fallbackY)) {
      return false;
    }
    mob.setPosition(player.x + 2, fallbackY, player.z + 2);
    if (type === "villager") {
      mob.homeX = mob.x;
      mob.homeZ = mob.z;
      ensureVillageMobData(mob, world);
    }
    mobs.push(mob);
    return true;
  }

  function updateSpawning(dt) {
    if (!world || !player) return;
    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    const cycle = getDayCycleInfo(worldTime);
    const hostileWindow = isHostileSpawnWindow(cycle);
    const capRadius = getMobCapRadius();
    const capRadius2 = capRadius * capRadius;
    pruneMobPopulation(MAX_ACTIVE_MOBS, capRadius);

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
      spawnTimer = hostileWindow ? 1.4 : 2.2;
      return;
    }

    if (hostileWindow) {
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
    for (const type of ENTITY_MOB_NAMES) {
      const hasTexture = !!entityTextures?.getImage(type);
      const hasBillboard = !!entityTextures?.getBillboardImage(type);
      const hasModel = !!objModels?.hasModel(type);
      const hasModelFallback = type === "sheep" && hasModel;
      if (texturesKnown && !hasTexture && !hasModelFallback) {
        const key = `missing-texture:${type}`;
        if (!mobRenderWarnings.has(key)) {
          mobRenderWarnings.add(key);
          console.warn(`[MobRender] Missing texture for ${type}; renderer will fall back or skip 3D for that mob.`);
        }
      }
      if ((type === "zombie" || hasModel) && settings.mobModels !== false && (texturesKnown || hasBillboard || hasTexture || modelsKnown)) {
        const renderMode = type === "zombie"
          ? (hasTexture ? "3d-zombie" : hasBillboard ? "billboard-fallback" : texturesKnown ? "missing" : "loading-assets")
          : hasModel && hasTexture ? "obj-model" : hasModelFallback ? "obj-color-fallback" : hasBillboard ? "billboard-fallback" : (texturesKnown || modelsKnown) ? "missing" : "loading-assets";
        const key = `mode:${type}:${renderMode}:${useWebGL ? "webgl" : "canvas"}`;
        if (!mobRenderWarnings.has(key)) {
          mobRenderWarnings.add(key);
          console.log(`[MobRender] ${type}: ${renderMode}`);
        }
      }
    }
  }

  function syncRenderEntityList() {
    renderEntities.length = 0;
    for (const mob of mobs) {
      renderEntities.push(mob);
    }
    for (const remotePlayer of multiplayerSession.remotePlayers.values()) {
      renderEntities.push(remotePlayer);
    }
    for (const item of items) {
      renderEntities.push(item);
    }
    if (glRenderer) {
      glRenderer.entities = renderEntities;
    }
  }

  function setWorldBlockWithChecks(x, y, z, blockType, announceBedReset = false) {
    if (!world || y <= 0 || y >= WORLD_HEIGHT) {
      return false;
    }
    const previous = world.peekBlock(x, y, z);
    if (previous === BLOCK.PISTON_HEAD && blockType !== BLOCK.PISTON_HEAD) {
      const headState = getExistingRedstoneStateAt(x, y, z);
      if (headState?.baseKey) {
        const [baseX, baseY, baseZ] = headState.baseKey.split("|").map(Number);
        const baseType = world.peekBlock(baseX, baseY, baseZ);
        const baseState = getExistingRedstoneStateAt(baseX, baseY, baseZ);
        if (isPistonBaseBlock(baseType) && baseState?.extended) {
          setRedstoneStateAtPosition(baseX, baseY, baseZ, baseType, { ...baseState, extended: false });
        }
      }
    }
    if (isPistonBaseBlock(previous) && blockType !== previous) {
      const pistonState = getExistingRedstoneStateAt(x, y, z);
      if (pistonState?.extended) {
        const vec = getFacingVector(pistonState.facing);
        if (world.peekBlock(x + vec.x, y + vec.y, z + vec.z) === BLOCK.PISTON_HEAD) {
          world.setBlock(x + vec.x, y + vec.y, z + vec.z, BLOCK.AIR);
        }
      }
    }
    if (previous === BLOCK.BED && blockType !== BLOCK.BED) {
      clearPlayerBedSpawnIfNeeded(x, y, z, announceBedReset);
    }
    const changed = world.setBlock(x, y, z, blockType);
    if (!changed) {
      return false;
    }
    if (usesRedstoneState(blockType)) {
      initializePlacedRedstoneBlock(x, y, z, blockType);
    } else {
      world.queueRedstoneDirtyAround(x, y, z);
    }
    return true;
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

  function updateHud(dt) {
    ensureUI();
    if (!hud.visible) {
      ui.setHudVisible(false);
      ui.bossEl.style.display = "none";
      ui.timeChipEl.style.display = "none";
      ui.timeTintEl.style.opacity = "0";
      return;
    }

    ui.setHudVisible(mode === "playing" && !inventoryOpen && !sleepState.active);
    const cycle = getDayCycleInfo(worldTime);
    const effectiveDaylight = getEffectiveDaylight(cycle, weather.type);
    const effectiveDarkness = 1 - effectiveDaylight;
    const currentColumn = world ? world.terrain.describeColumn(Math.floor(player?.x || 0), Math.floor(player?.z || 0)) : null;
    const snowyWeather = weather.type !== WEATHER_TYPES.CLEAR && getColumnPrecipitationType(currentColumn) === "snow";
    const weatherLabel = snowyWeather
      ? (weather.type === WEATHER_TYPES.THUNDER ? "Snowstorm" : "Snow")
      : getWeatherLabel(weather.type);
    ui.timeChipEl.style.display = mode === "playing" && !sleepState.active ? "block" : "none";
    ui.timeChipEl.textContent = `${cycle.phase} - ${weatherLabel}${isHostileSpawnWindow(cycle) ? " - Hostiles Active" : ""}`;
    ui.timeChipEl.style.background = snowyWeather
      ? "rgba(76, 98, 126, 0.78)"
      : weather.type === WEATHER_TYPES.THUNDER
      ? "rgba(18,20,34,0.82)"
      : weather.type === WEATHER_TYPES.RAIN
        ? "rgba(24,42,62,0.76)"
        : cycle.isNight
          ? "rgba(14,22,42,0.72)"
          : cycle.phase === "Sunset"
            ? "rgba(66,38,18,0.68)"
            : "rgba(0,0,0,0.32)";
    ui.timeTintEl.style.background = snowyWeather
      ? "rgba(82, 106, 132, 1)"
      : weather.type === WEATHER_TYPES.THUNDER
      ? "rgba(16,20,36,1)"
      : weather.type === WEATHER_TYPES.RAIN
        ? "rgba(24,44,76,1)"
        : cycle.isNight
          ? "rgba(18,32,74,1)"
          : cycle.phase === "Sunset"
            ? "rgba(94,54,24,1)"
            : "rgba(18,32,74,1)";
    ui.timeTintEl.style.opacity = mode === "playing" ? String(clamp(effectiveDarkness * 0.34 + getWeatherSkyDarkness(weather.type) * 0.42, 0, 0.42)) : "0";

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
    const snap = `${player.getArmorPoints()}|${player.health}|${player.hunger}|${player.xpLevel}|${player.xp}|${settings.gameMode}|${mode}|${weather.type}|${Math.round(effectiveDaylight * 100)}|${boss.active}|${boss.health}|${boss.name}|${sleepState.active}`;
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

      const left = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = worldMeta.name;
      const br = document.createElement("br");
      const seed = document.createElement("span");
      seed.textContent = `Seed ${worldMeta.seed}`;
      left.appendChild(title);
      left.appendChild(br);
      left.appendChild(seed);

      const right = document.createElement("span");
      right.textContent = worldMeta.lastPlayedAt ? new Date(worldMeta.lastPlayedAt).toLocaleDateString() : "Never played";

      row.appendChild(left);
      row.appendChild(right);
      ui.worldListEl.appendChild(row);
    });
    const canUseSelection = !!resolvedSelectedId && worlds.some((worldMeta) => worldMeta.id === resolvedSelectedId);
    ui.playWorldBtn.disabled = !canUseSelection;
    ui.playWorldBtn.classList.toggle("disabled", !canUseSelection);
    ui.exportWorldBtn.disabled = !canUseSelection;
    ui.exportWorldBtn.classList.toggle("disabled", !canUseSelection);
    ui.deleteWorldBtn.disabled = !canUseSelection;
    ui.deleteWorldBtn.classList.toggle("disabled", !canUseSelection);
  }

  const FOV_PRESETS = [60, 70, 80, 90, 95];
  const MOUSE_SENSITIVITY_PRESETS = [0.0015, 0.0021, 0.0026, 0.0032, 0.004, 0.005];

  function formatMouseSensitivityLabel(value) {
    const min = MOUSE_SENSITIVITY_PRESETS[0];
    const max = MOUSE_SENSITIVITY_PRESETS[MOUSE_SENSITIVITY_PRESETS.length - 1];
    const ratio = clamp((value - min) / Math.max(0.0001, max - min), 0, 1);
    return `${Math.round(ratio * 100)}%`;
  }

  function applyFullscreenSetting(nextFullscreen) {
    settings.fullscreen = !!nextFullscreen;
    const rootEl = document.documentElement;
    if (settings.fullscreen) {
      if (!document.fullscreenElement && rootEl.requestFullscreen) {
        rootEl.requestFullscreen().catch(() => {
          settings.fullscreen = false;
          setSettingsUI();
        });
      }
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    markWorldDirty();
    setSettingsUI();
  }

  function getChunkRuntimeConfig(loading = false) {
    const lagFix = settings.chunkLagFix !== false;
    const preset = getPerformancePresetConfig(settings.performancePreset);
    if (loading) {
      return lagFix
        ? { genLimit: LOADING_CHUNK_GEN_LIMIT, genBudgetMs: LOADING_CHUNK_GEN_BUDGET_MS, meshLimit: LOADING_CHUNK_MESH_LIMIT, meshBudgetMs: LOADING_CHUNK_MESH_BUDGET_MS }
        : { genLimit: LOADING_CHUNK_GEN_LIMIT * 2, genBudgetMs: LOADING_CHUNK_GEN_BUDGET_MS * 2.2, meshLimit: LOADING_CHUNK_MESH_LIMIT * 2, meshBudgetMs: LOADING_CHUNK_MESH_BUDGET_MS * 1.9 };
    }
    const cleanupBias = preset.cleanupBias || 0;
    if (!lagFix) {
      return {
        genLimit: PLAY_CHUNK_GEN_LIMIT + 2,
        genBudgetMs: PLAY_CHUNK_GEN_BUDGET_MS * 2.4,
        meshLimit: PLAY_CHUNK_MESH_LIMIT + 2,
        meshBudgetMs: PLAY_CHUNK_MESH_BUDGET_MS * 2.1
      };
    }

    let genLimit = Math.max(1, Math.round(PLAY_CHUNK_GEN_LIMIT - cleanupBias * 0.25));
    let genBudgetMs = Math.max(0.9, PLAY_CHUNK_GEN_BUDGET_MS - cleanupBias * 0.3);
    let meshLimit = Math.max(1, Math.round(PLAY_CHUNK_MESH_LIMIT - cleanupBias * 0.5));
    let meshBudgetMs = Math.max(1.1, PLAY_CHUNK_MESH_BUDGET_MS - cleanupBias * 0.35);

    // Back chunk work off dynamically when frame rate dips to reduce visible hitching.
    if (fpsSmoothed > 0 && fpsSmoothed < 58) {
      genBudgetMs *= 0.8;
      meshBudgetMs *= 0.72;
      meshLimit = Math.max(1, meshLimit - 1);
    }
    if (fpsSmoothed > 0 && fpsSmoothed < 50) {
      genBudgetMs *= 0.82;
      meshBudgetMs *= 0.78;
      genLimit = 1;
      meshLimit = 1;
    }
    if (fpsSmoothed > 0 && fpsSmoothed < 42) {
      genBudgetMs *= 0.75;
      meshBudgetMs *= 0.75;
    }
    if (runtimePlayerInCave) {
      const caveLowFps = fpsSmoothed > 0 && fpsSmoothed < 56;
      genBudgetMs *= caveLowFps ? 0.6 : 0.78;
      meshBudgetMs *= caveLowFps ? 0.56 : 0.72;
      genLimit = Math.min(genLimit, caveLowFps ? 1 : 2);
      meshLimit = Math.min(meshLimit, caveLowFps ? 1 : 2);
    }
    if (fpsSmoothed > 0 && fpsSmoothed < 36) {
      genBudgetMs *= 0.72;
      meshBudgetMs *= 0.68;
      genLimit = 1;
      meshLimit = 1;
    }

    return {
      genLimit,
      genBudgetMs: Math.max(0.55, genBudgetMs),
      meshLimit,
      meshBudgetMs: Math.max(0.75, meshBudgetMs)
    };
  }

  function setSettingsUI() {
    ensureUI();
    ui.videoGraphicsBtn.textContent = `Graphics: ${settings.graphicsMode === "fancy" ? "Fancy" : "Fast"}`;
    ui.videoRenderDistanceBtn.textContent = `Render Distance: ${settings.renderDistanceChunks} chunks`;
    ui.videoFovBtn.textContent = `FOV: ${settings.fovDegrees}`;
    ui.videoMouseBtn.textContent = `Mouse Sensitivity: ${formatMouseSensitivityLabel(settings.mouseSensitivity)}`;
    ui.videoViewBobBtn.textContent = `View Bobbing: ${settings.viewBobbing !== false ? "ON" : "OFF"}`;
    ui.videoShadowsBtn.textContent = `Shadows: ${settings.shadows !== false ? "ON" : "OFF"}`;
    ui.videoFpsBtn.textContent = `Show FPS: ${settings.showFps !== false ? "ON" : "OFF"}`;
    ui.videoMasterVolumeBtn.textContent = `Master Volume: ${formatVolumeLabel(settings.masterVolume)}`;
    ui.videoMusicVolumeBtn.textContent = `Music Volume: ${formatVolumeLabel(settings.musicVolume)}`;
    ui.videoMobModelsBtn.textContent = `3D Mob Models: ${settings.mobModels !== false ? "ON" : "OFF"}`;
    ui.videoPerformanceBtn.textContent = `Performance: ${getPerformancePresetLabel(settings.performancePreset)}`;
    ui.videoFullscreenBtn.textContent = `Fullscreen: ${(settings.fullscreen || !!document.fullscreenElement) ? "ON" : "OFF"}`;
    ui.videoChunkLagBtn.textContent = `Chunk Lag Fix: ${settings.chunkLagFix !== false ? "ON" : "OFF"}`;
    ui.videoInvertYBtn.textContent = `Invert Y: ${settings.invertY ? "ON" : "OFF"}`;
    ui.videoGameModeBtn.textContent = `Game Mode: ${settings.gameMode === GAME_MODE.CREATIVE ? "Creative" : "Survival"}`;
    ui.resourcePackCurrentEl.textContent = `Current: ${getResourcePackMeta(settings.texturePack, settings).name}`;
    ui.skinCurrentEl.textContent = `Current: ${getSelectedPlayerSkinLabel(settings)}`;
    if (ui.profileSkinPresetEl) {
      ui.profileSkinPresetEl.value = settings.playerSkinPreset === "custom" && settings.playerSkinDataUrl
        ? "custom"
        : (isValidPlayerSkinPreset(settings.playerSkinPreset) ? settings.playerSkinPreset : DEFAULT_SETTINGS.playerSkinPreset);
    }
    if (ui.profileSkinCurrentEl) {
      ui.profileSkinCurrentEl.textContent = `Current skin: ${getSelectedPlayerSkinLabel(settings)}`;
    }
    if (ui.screens?.settings?.style?.display !== "none") {
      renderSettingsSkinPreview();
    }
    if (ui.screens?.profile?.style?.display !== "none") {
      renderProfileSkinPreview();
    }
    renderMultiplayerMenu();
    ui.fpsEl.style.display = settings.showFps === false ? "none" : "block";
  }

  function getResourcePackRuntime() {
    if (!resourcePackRuntime) {
      resourcePackRuntime = createResourcePackRuntime({
        support: ResourcePackSupport,
        engine,
        block: BLOCK,
        defaultSettings: DEFAULT_SETTINGS,
        blockTexturePaths: BLOCK_TEXTURE_PATHS,
        entityTextureFilePaths: ENTITY_TEXTURE_FILE_PATHS,
        settingsRef: () => settings,
        uiRef: () => ui,
        modeRef: () => mode,
        useWebGLRef: () => useWebGL,
        texturesRef: () => textures,
        entityTexturesRef: () => entityTextures,
        atlasRef: () => atlas,
        glRendererRef: () => glRenderer,
        canvasRendererRef: () => canvasRenderer,
        ensureUI,
        saveGlobalSettings,
        setHotbarImages,
        invalidateAllChunkMeshes,
        pushToast,
        setSettingsUI
      });
    }
    return resourcePackRuntime;
  }

  function renderResourcePackEntry(packName, selected = false) {
    return getResourcePackRuntime().renderResourcePackEntry(packName, selected);
  }

  function renderResourcePackUI() {
    return getResourcePackRuntime().renderResourcePackUI();
  }

  function markWorldDirty() {
    saveGlobalSettings();
  }

  function applyLightingSetting() {
    if (glRenderer) {
      invalidateAllChunkMeshes();
    } else if (canvasRenderer) {
      canvasRenderer.setSettings(settings);
    }
    markWorldDirty();
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
      glRenderer.meshQueuedKeys = new Set();
      glRenderer.chunkGenQueue = [];
      glRenderer.chunkGenQueuedKeys = new Set();
    }
  }

  function applyTexturePackSetting() {
    return getResourcePackRuntime().applyTexturePackSetting();
  }

  function saveWorld(force = false) {
    if (!activeWorldId || !world || !player) return;
    if (!force && (!world.saveDirty || saveTimer < AUTOSAVE_INTERVAL_SECONDS)) return;

    const payload = {
      version: GAME_VERSION,
      seed: world.seed,
      chunkSnapshots: serializeChunkSnapshots(world.serializeChunkSnapshots()),
      modifiedChunks: serializeModifiedChunks(world.modifiedChunks),
      fluidStates: serializeFluidStates(world.fluidStates),
      furnaces: serializeFurnaceStates(furnaceStates),
      player: player.serialize(),
      worldState: serializeCurrentWorldState()
    };
    store.saveWorld(activeWorldId, payload);
    world.saveDirty = false;
    saveTimer = 0;
  }

  function exportSelectedWorld() {
    ensureStore();
    if (!selectedWorldId) {
      alert("Select a world to export first.");
      return;
    }
    if (activeWorldId === selectedWorldId) {
      saveWorld(true);
    }
    const exported = store.exportWorld(selectedWorldId);
    if (!exported) {
      alert("That world could not be exported.");
      return;
    }
    const meta = store.getWorldMeta(selectedWorldId);
    const filename = `${makeSafeFileName(meta?.name || "world")}.${GAME_EXPORT_SLUG}.json`;
    downloadTextFile(filename, JSON.stringify(exported, null, 2));
  }

  async function importWorldFile(file) {
    ensureStore();
    const text = await file.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error("That file is not valid JSON.");
    }
    const importedId = store.importWorld(parsed, { select: true });
    if (!importedId) {
      throw new Error(`That file is not a supported ${GAME_TITLE} world export.`);
    }
    selectedWorldId = importedId;
    ui.newWorldCard.style.display = "none";
    refreshWorldList(selectedWorldId);
  }

  function readFileAsDataUrl(file) {
    return getResourcePackRuntime().readFileAsDataUrl(file);
  }

  function normalizeResourcePackRelativePath(relativePath = "") {
    return getResourcePackRuntime().normalizeResourcePackRelativePath(relativePath);
  }

  function getMimeTypeForPath(path = "") {
    return getResourcePackRuntime().getMimeTypeForPath(path);
  }

  function blobToDataUrl(blob) {
    return getResourcePackRuntime().blobToDataUrl(blob);
  }

  function upsertCachedResourcePack(pack) {
    return getResourcePackRuntime().upsertCachedResourcePack(pack);
  }

  async function fetchOnlineResourcePackJson(url) {
    return getResourcePackRuntime().fetchOnlineResourcePackJson(url);
  }

  async function fetchOnlineResourcePackImage(url) {
    return getResourcePackRuntime().fetchOnlineResourcePackImage(url);
  }

  function createAtlasTextureDataUrl(atlasInfo, textureName, cache) {
    return getResourcePackRuntime().createAtlasTextureDataUrl(atlasInfo, textureName, cache);
  }

  async function buildOnlineMcAssetsResourcePack() {
    return getResourcePackRuntime().buildOnlineMcAssetsResourcePack();
  }

  async function ensureOnlineResourcePackLoaded(packId = settings.texturePack) {
    return getResourcePackRuntime().ensureOnlineResourcePackLoaded(packId);
  }

  function decodeZipEntryName(bytes) {
    return getResourcePackRuntime().decodeZipEntryName(bytes);
  }

  async function inflateZipBytes(bytes) {
    return getResourcePackRuntime().inflateZipBytes(bytes);
  }

  async function extractZipEntries(file) {
    return getResourcePackRuntime().extractZipEntries(file);
  }

  function parseResourcePackMetadata(rawMeta, fallbackName) {
    return getResourcePackRuntime().parseResourcePackMetadata(rawMeta, fallbackName);
  }

  async function importResourcePackEntries(entries, defaultNameHint = "") {
    return getResourcePackRuntime().importResourcePackEntries(entries, defaultNameHint);
  }

  function inferIconBlockFromAssets(assets = {}) {
    return getResourcePackRuntime().inferIconBlockFromAssets(assets);
  }

  async function preloadCustomResourcePackAssets(pack) {
    return getResourcePackRuntime().preloadCustomResourcePackAssets(pack);
  }

  async function importResourcePackFiles(fileList) {
    return getResourcePackRuntime().importResourcePackFiles(fileList);
  }

  async function importResourcePackZip(file) {
    return getResourcePackRuntime().importResourcePackZip(file);
  }

  function loadWorldFromStore(worldId) {
    const meta = store.getWorldMeta(worldId);
    const save = store.loadWorld(worldId);
    const seed = normalizeWorldSeed(save?.seed ?? meta?.seed, generateRandomWorldSeed());

    world = new World(seed);
    world.setChunkSnapshots(deserializeChunkSnapshots(save?.chunkSnapshots || {}));
    world.modifiedChunks = deserializeModifiedChunks(save?.modifiedChunks || {});
    world.fluidStates = deserializeFluidStates(save?.fluidStates || {});
    world.loadedFromStorage = !!save;
    furnaceStates = deserializeFurnaceStates(save?.furnaces || {});
    const defaultSpawn = world.findSpawn(0, 0);
    const savedWorldState = normalizeSavedWorldState(save?.worldState, {
      x: defaultSpawn.x,
      y: defaultSpawn.y,
      z: defaultSpawn.z,
      source: "world"
    }, deserializeRedstoneStates);
    world.redstoneStates = savedWorldState.redstoneStates || new Map();
    world.redstoneDirty = new Set();
    world.redstoneScheduledTicks = new Map();
    world.redstoneTickCounter = 0;
    worldTime = savedWorldState.time;
    weather = savedWorldState.weather;
    weatherVisualIntensity = getWeatherBaseIntensity(weather.type);
    gamerules = savedWorldState.gamerules;
    worldSpawnPoint = savedWorldState.worldSpawnPoint || { x: defaultSpawn.x, y: defaultSpawn.y, z: defaultSpawn.z, source: "world" };
    settings = normalizeSettingsState(settings);
    if (settings.playerSkinPreset === "custom") {
      getCustomPlayerSkinCanvas(settings.playerSkinDataUrl);
    }
    const activeCustomPack = getCustomResourcePack(settings);
    if (activeCustomPack) {
      preloadCustomResourcePackAssets(activeCustomPack).then(() => {
        applyTexturePackSetting();
      });
    }
    syncMusicVolume();
    if (textures) {
      textures.settings = settings;
    }
    if (entityTextures) {
      entityTextures.settings = settings;
    }
    if (atlas) {
      atlas.settings = settings;
    }

    player = new Player();
    player.setPosition(defaultSpawn.x, defaultSpawn.y, defaultSpawn.z);
    if (save?.player) {
      player.restore(save.player);
    }
    if (player.spawnPoint && !isPlayerBedSpawnValid(player.spawnPoint)) {
      player.spawnPoint = null;
    }
    player.ensureSafePosition(world);
    activeFurnaceKey = null;
    waterFlowTimer = 0;
    lavaFlowTimer = 0;
    blockTickAccumulator = 0;
    caveCheckTimer = 0;
    runtimePlayerInCave = false;
    villageCheckTimer = 0;
    runtimePlayerInVillage = false;
    targetScanTimer = 0;
    randomTickChunkCache = [];
    randomTickChunkCacheTimer = 0;
    randomTickCacheChunkX = Number.NaN;
    randomTickCacheChunkZ = Number.NaN;
    renderEntities.length = 0;
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
      glRenderer.chunkGenQueuedKeys = new Set();
      glRenderer.meshQueuedKeys = new Set();
      glRenderer.mesher = new GreedyChunkMesher(world, atlas);
      canvasRenderer = null;
      return;
    }

    canvasRenderer = new VoxelRenderer(engine.canvas, engine.ctx2d, world, player, textures, settings);
    canvasRenderer.entityTextures = entityTextures;
    canvasRenderer.setRenderDistance(settings.renderDistanceChunks);
  }

  function startWorld(worldId) {
    if (isMultiplayerSessionActive()) {
      teardownMultiplayerSession({ preserveBrowser: true });
    }
    activeWorldId = worldId;
    store.selectWorld(worldId);
    store.markPlayed(worldId);

    loadWorldFromStore(worldId);
    mobs = [];
    items = [];
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
    closeTrade(false);
    inventoryContext = "inventory";
    clearInventoryCursor();
    activeFurnaceKey = null;
    inventoryCraftTypes.fill(0);
    inventoryCraftCounts.fill(0);
    tableCraftTypes.fill(0);
    tableCraftCounts.fill(0);
    resetInventoryDragState();
    mobRenderWarnings.clear();
    lastMobRenderSummaryAt = 0;
    saveTimer = 0;
    runtimeLowFpsTimer = 0;
    runtimeCompactCooldown = 0;
    runtimeMaintenanceTimer = 0;
    runtimeLastChunkX = Math.floor(player.x / CHUNK_SIZE);
    runtimeLastChunkZ = Math.floor(player.z / CHUNK_SIZE);
    caveCheckTimer = 0;
    runtimePlayerInCave = false;
    villageCheckTimer = 0;
    runtimePlayerInVillage = false;
    targetScanTimer = 0;
    randomTickChunkCache = [];
    randomTickChunkCacheTimer = 0;
    randomTickCacheChunkX = Number.NaN;
    randomTickCacheChunkZ = Number.NaN;
    renderEntities.length = 0;
    stopSleeping(false);
    runtimeFault = null;
    runtimeRepairPromise = null;
    webglContextLost = false;
    webglContextRestored = false;
    loadingStartChunk = { x: Math.floor(player.x / CHUNK_SIZE), z: Math.floor(player.z / CHUNK_SIZE) };
    ensureActiveRenderer();
    logMobRenderDiagnostics("world-start");
    queueAllKnownRedstoneDirty();

    setHotbarImages();
    setSettingsUI();
    mode = "loading";
    ensureUI();
    setAutoRepairUi(false);
    setRuntimeErrorOverlay(false);
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
    if (isMultiplayerSessionActive()) {
      if (isDedicatedMultiplayerSession()) {
        sendMultiplayerSignal({
          type: "leave_server",
          serverId: multiplayerSession.dedicatedServerId
        });
      } else {
        sendMultiplayerSignal({
          type: isMultiplayerHost() ? "signal_close_room" : "signal_leave_room",
          roomCode: multiplayerSession.roomCode
        });
      }
      teardownMultiplayerSession({ preserveBrowser: true });
    }
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
    closeTrade(false);
    inventoryContext = "inventory";
    clearInventoryCursor();
    activeFurnaceKey = null;
    inventoryCraftTypes.fill(0);
    inventoryCraftCounts.fill(0);
    tableCraftTypes.fill(0);
    tableCraftCounts.fill(0);
    runtimeLowFpsTimer = 0;
    runtimeCompactCooldown = 0;
    runtimeMaintenanceTimer = 0;
    runtimeLastChunkX = Number.NaN;
    runtimeLastChunkZ = Number.NaN;
    caveCheckTimer = 0;
    runtimePlayerInCave = false;
    villageCheckTimer = 0;
    runtimePlayerInVillage = false;
    targetScanTimer = 0;
    randomTickChunkCache = [];
    randomTickChunkCacheTimer = 0;
    randomTickCacheChunkX = Number.NaN;
    randomTickCacheChunkZ = Number.NaN;
    renderEntities.length = 0;
    runtimeFault = null;
    runtimeRepairPromise = null;
    webglContextLost = false;
    webglContextRestored = false;
    resetInventoryDragState();
    ensureUI();
    setAutoRepairUi(false);
    setRuntimeErrorOverlay(false);
    showHomeScreen();
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

    const loadingChunkConfig = getChunkRuntimeConfig(true);
    glRenderer.ensureVisibleChunks(loadingChunkConfig.genLimit, loadingChunkConfig.genBudgetMs);
    glRenderer.updateQueue(loadingChunkConfig.meshLimit, loadingChunkConfig.meshBudgetMs);

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

  function setDebugVisible(visible) {
    debugState.visible = !!visible;
    if (!debugState.visible) {
      debugState.frameGraph = false;
      debugState.pieChart = false;
    }
    if (canvasRenderer) {
      canvasRenderer.showDebug = false;
    }
    updateDebugUi();
  }

  function pushDebugFrameSample(frameMs) {
    const samples = debugState.frameSamples;
    samples.push(clamp(frameMs, 0, 80));
    while (samples.length > 90) {
      samples.shift();
    }
  }

  function getDebugProjectionState() {
    if (!player || !engine?.canvas) return null;
    const width = engine.canvas.width || Math.max(1, window.innerWidth);
    const height = engine.canvas.height || Math.max(1, window.innerHeight);
    const centerX = width / 2;
    const centerY = height / 2;
    const cameraX = player.x;
    const cameraY = player.y + PLAYER_EYE_HEIGHT;
    const cameraZ = player.z;
    const yaw = player.yaw || 0;
    const pitch = player.pitch || 0;
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const sinPitch = Math.sin(pitch);
    const cosPitch = Math.cos(pitch);
    const fov = ((settings?.fovDegrees || DEFAULT_SETTINGS.fovDegrees) * Math.PI) / 180;
    const focalLength = (height * 0.5) / Math.tan(fov / 2);
    return { width, height, centerX, centerY, cameraX, cameraY, cameraZ, sinYaw, cosYaw, sinPitch, cosPitch, focalLength };
  }

  function projectDebugPoint(state, x, y, z, clampNear = true) {
    if (!state) return null;
    const dx = x - state.cameraX;
    const dy = y - state.cameraY;
    const dz = z - state.cameraZ;
    const localX = dx * state.cosYaw - dz * state.sinYaw;
    const localZ = dx * state.sinYaw + dz * state.cosYaw;
    const rotatedY = dy * state.cosPitch - localZ * state.sinPitch;
    const rotatedZ = dy * state.sinPitch + localZ * state.cosPitch;
    if (rotatedZ <= (clampNear ? -0.12 : 0.02)) {
      return null;
    }
    const depth = Math.max(rotatedZ, 0.02);
    return {
      x: state.centerX + (localX / depth) * state.focalLength,
      y: state.centerY - (rotatedY / depth) * state.focalLength,
      depth
    };
  }

  function drawDebugBoxLines(ctx, state, x0, y0, z0, x1, y1, z1, strokeStyle, lineWidth = 1.5) {
    const corners = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
    ];
    const projected = corners.map((corner) => projectDebugPoint(state, corner[0], corner[1], corner[2], true));
    if (projected.some((point) => !point)) {
      return;
    }
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    for (const edge of edges) {
      ctx.beginPath();
      ctx.moveTo(projected[edge[0]].x, projected[edge[0]].y);
      ctx.lineTo(projected[edge[1]].x, projected[edge[1]].y);
      ctx.stroke();
    }
  }

  function renderDebugWorldOverlay() {
    if (!ui?.debugCanvasEl) return;
    const shouldShow = debugState.visible && !!world && !!player && (debugState.chunkBorders || debugState.hitboxes);
    ui.debugCanvasEl.style.display = shouldShow ? "block" : "none";
    if (!shouldShow) {
      const ctx = ui.debugCanvasEl.getContext("2d");
      ctx?.clearRect?.(0, 0, ui.debugCanvasEl.width || 0, ui.debugCanvasEl.height || 0);
      return;
    }

    const canvas = ui.debugCanvasEl;
    if (canvas.width !== engine.canvas.width || canvas.height !== engine.canvas.height) {
      canvas.width = engine.canvas.width;
      canvas.height = engine.canvas.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const state = getDebugProjectionState();
    if (!state) return;

    ctx.save();
    ctx.shadowBlur = 0;
    if (debugState.chunkBorders) {
      const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
      const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const chunkX = playerChunkX + dx;
          const chunkZ = playerChunkZ + dz;
          const x0 = chunkX * CHUNK_SIZE;
          const z0 = chunkZ * CHUNK_SIZE;
          const color = dx === 0 && dz === 0 ? "rgba(255,92,92,0.95)" : "rgba(246,222,105,0.82)";
          drawDebugBoxLines(ctx, state, x0, 0, z0, x0 + CHUNK_SIZE, WORLD_HEIGHT, z0 + CHUNK_SIZE, color, dx === 0 && dz === 0 ? 2 : 1.25);
        }
      }
    }

    if (debugState.hitboxes) {
      const entityDistance = 32;
      const entityDistanceSq = entityDistance * entityDistance;
      for (const mob of mobs) {
        if (!mob || mob.health <= 0) continue;
        const dx = mob.x - player.x;
        const dy = mob.y - player.y;
        const dz = mob.z - player.z;
        if (dx * dx + dy * dy + dz * dz > entityDistanceSq) continue;
        drawDebugBoxLines(
          ctx,
          state,
          mob.x - mob.radius,
          mob.y,
          mob.z - mob.radius,
          mob.x + mob.radius,
          mob.y + mob.height,
          mob.z + mob.radius,
          getMobDef(mob.type).hostile ? "rgba(255,120,120,0.92)" : "rgba(120,255,170,0.88)",
          1.35
        );
      }
      for (const item of items) {
        const dx = item.x - player.x;
        const dy = item.y - player.y;
        const dz = item.z - player.z;
        if (dx * dx + dy * dy + dz * dz > entityDistanceSq) continue;
        drawDebugBoxLines(ctx, state, item.x - 0.16, item.y - 0.02, item.z - 0.16, item.x + 0.16, item.y + 0.3, item.z + 0.16, "rgba(132,208,255,0.85)", 1.1);
      }
    }
    ctx.restore();
  }

  function updateDebugUi() {
    if (!ui) return;
    const visible = debugState.visible && !!world && !!player && mode !== "menu";
    ui.debugPanelEl.style.display = visible ? "block" : "none";
    ui.debugHelpEl.style.display = debugState.helpUntil > performance.now() ? "block" : "none";
    if (!visible) {
      ui.debugGraphsEl.style.display = "none";
      ui.debugPieEl.style.display = "none";
      ui.debugCanvasEl.style.display = "none";
      return;
    }

    const cycle = getDayCycleInfo(worldTime);
    const column = world.terrain.describeColumn(Math.floor(player.x), Math.floor(player.z));
    const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);
    const skyLight = getApproxSkyLightLevel(player.x, player.y + PLAYER_EYE_HEIGHT, player.z, cycle);
    const blockLight = getApproxBlockLightLevel(player.x, player.y + PLAYER_EYE_HEIGHT, player.z);
    const lines = [
      `${GAME_TITLE} ${GAME_VERSION} (${useWebGL ? "WebGL2" : "Canvas"})`,
      `XYZ ${player.x.toFixed(2)} / ${player.y.toFixed(2)} / ${player.z.toFixed(2)}`,
      `Chunk ${playerChunkX}, ${playerChunkZ} | Biome ${column.biome}`,
      `Facing ${Math.round((player.yaw * 180) / Math.PI)}  Pitch ${Math.round((player.pitch * 180) / Math.PI)}`,
      `FPS ${fps.toFixed(0)} | Frame ${debugState.metrics.frameMs.toFixed(1)} ms`,
      `Time ${getDayCycleInfo(worldTime).phase} | Weather ${getWeatherLabel(weather.type)}`,
      `Light sky ${skyLight} / block ${blockLight} | Loaded chunks ${world.chunks.size}`,
      `Toggles: borders=${debugState.chunkBorders ? "on" : "off"} hitboxes=${debugState.hitboxes ? "on" : "off"} tips=${debugState.advancedTooltips ? "on" : "off"}`
    ];
    if (currentTarget) {
      lines.push(`Block ${getItemName(currentTarget.type)} @ ${currentTarget.x}, ${currentTarget.y}, ${currentTarget.z}`);
    }
    if (currentEntityTarget?.mob) {
      lines.push(`Entity ${currentEntityTarget.mob.type} hp=${Math.ceil(currentEntityTarget.mob.health)}`);
    }
    ui.debugLinesEl.textContent = lines.join("\n");

    ui.debugGraphsEl.style.display = debugState.frameGraph || debugState.pieChart ? "grid" : "none";
    ui.debugPieEl.style.display = debugState.pieChart ? "flex" : "none";

    if (debugState.frameGraph) {
      const canvas = ui.debugGraphEl;
      const width = 240;
      const height = 72;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "rgba(10,14,20,0.92)";
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath();
        ctx.moveTo(0, height - 16);
        ctx.lineTo(width, height - 16);
        ctx.stroke();
        const samples = debugState.frameSamples;
        ctx.strokeStyle = "rgba(126,229,255,0.96)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        samples.forEach((sample, index) => {
          const x = (index / Math.max(1, samples.length - 1)) * width;
          const y = height - clamp(sample / 40, 0, 1) * (height - 8);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }

    if (debugState.pieChart) {
      const metrics = debugState.metrics;
      const updateMs = Math.max(0, metrics.updateMs || 0);
      const renderMs = Math.max(0, metrics.renderMs || 0);
      const chunkMs = Math.max(0, Math.min(metrics.chunkMs || 0, updateMs));
      const uiMs = Math.max(0, Math.min(metrics.uiMs || 0, updateMs));
      const worldMs = Math.max(0, metrics.worldMs || Math.max(0, updateMs - chunkMs - uiMs));
      const total = Math.max(1, chunkMs + worldMs + uiMs + renderMs);
      const chunkDeg = (chunkMs / total) * 360;
      const worldDeg = (worldMs / total) * 360;
      const uiDeg = (uiMs / total) * 360;
      const renderDeg = 360 - chunkDeg - worldDeg - uiDeg;
      ui.debugPieChartEl.style.background = `conic-gradient(#7fe1ff 0deg ${chunkDeg}deg,#63b4ff ${chunkDeg}deg ${chunkDeg + worldDeg}deg,#9cf2ba ${chunkDeg + worldDeg}deg ${chunkDeg + worldDeg + uiDeg}deg,#f5dc86 ${chunkDeg + worldDeg + uiDeg}deg ${360 - renderDeg}deg)`;
      ui.debugPieLegendEl.innerHTML = [
        `Chunk ${chunkMs.toFixed(1)} ms`,
        `World ${worldMs.toFixed(1)} ms`,
        `UI ${uiMs.toFixed(1)} ms`,
        `Render ${renderMs.toFixed(1)} ms`
      ].join("<br />");
    }

    if (debugState.helpUntil > performance.now()) {
      ui.debugHelpEl.textContent = [
        "F + 1: Toggle HUD",
        "F + 3: Toggle debug overlay",
        "F + 3 + Q: Show shortcut help",
        "F + 3 + A: Reload chunks",
        "F + 3 + T: Reload textures/resources",
        "F + 3 + G: Toggle chunk borders",
        "F + 3 + B: Toggle hitboxes",
        "F + 3 + H: Toggle advanced tooltips",
        "F + 3 + C: Copy coordinates",
        "F + 3 + I: Copy target block/entity data",
        "F + 3 + D: Clear chat",
        "F + 3 + R: Increase render distance",
        "Shift + F + 3 + R: Decrease render distance",
        "F + 3 + N: Toggle creative/survival",
        "Shift + F + 3: Toggle performance pie",
        "Alt + F + 3: Toggle frame graph"
      ].join("\n");
    }
  }

  function showDebugShortcutHelp() {
    debugState.helpUntil = performance.now() + 10000;
    pushChatLine("Debug shortcut help opened.", "sys");
    updateDebugUi();
  }

  function toggleDebugFlag(key, label) {
    debugState[key] = !debugState[key];
    debugState.visible = debugState.visible || debugState[key];
    if (inventoryOpen) {
      renderInventoryUI();
    }
    updateDebugUi();
    pushChatLine(`${label}: ${debugState[key] ? "ON" : "OFF"}`, "sys");
  }

  async function copyDebugText(text, successMessage, failureMessage = "Copy failed.") {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        pushChatLine(successMessage, "sys");
      } else {
        throw new Error("Clipboard unavailable");
      }
    } catch {
      pushChatLine(failureMessage, "err");
    }
  }

  function reloadDebugChunks() {
    if (!world) return;
    compactRuntimeState(true);
    invalidateAllChunkMeshes();
    for (const chunk of world.chunks.values()) {
      chunk.meshDirty = true;
    }
    world.saveDirty = true;
    pushChatLine("Chunks reloaded.", "sys");
  }

  function reloadDebugResources() {
    if (!textures || !entityTextures || !objModels) return;
    textures.images.clear();
    textures.pending.clear();
    textures.failedPaths.clear();
    textures.ready = false;
    textures.failed = false;
    textures.readyPromise = null;
    textures.progress = 0;
    entityTextures.images.clear();
    entityTextures.billboardImages.clear();
    entityTextures.glTextures.clear();
    entityTextures.pendingLoads.clear();
    entityTextures.ready = false;
    entityTextures.failed = false;
    entityTextures.readyPromise = null;
    objModels.models.clear();
    objModels.ready = false;
    objModels.failed = false;
    objModels.readyPromise = null;
    textures.startLoading().then(() => {
      if (atlas) {
        atlas.texture = null;
        atlas.build().catch((error) => console.warn("Atlas rebuild failed:", error.message));
      }
      setHotbarImages();
    });
    entityTextures.startLoading();
    objModels.startLoading();
    applyTexturePackSetting();
    pushChatLine("Textures and resources reloaded.", "sys");
  }

  function handleDebugShortcutAction(action) {
    switch (action) {
      case "toggle_hud":
        hud.visible = !hud.visible;
        hud.last = null;
        updateHud(0);
        pushChatLine(`HUD: ${hud.visible ? "ON" : "OFF"}`, "sys");
        return true;
      case "toggle_debug":
        setDebugVisible(!debugState.visible);
        pushChatLine(`Debug overlay: ${debugState.visible ? "ON" : "OFF"}`, "sys");
        return true;
      case "help":
        showDebugShortcutHelp();
        return true;
      case "reload_chunks":
        reloadDebugChunks();
        return true;
      case "reload_resources":
        reloadDebugResources();
        return true;
      case "toggle_chunk_borders":
        toggleDebugFlag("chunkBorders", "Chunk Borders");
        return true;
      case "toggle_hitboxes":
        toggleDebugFlag("hitboxes", "Hitboxes");
        return true;
      case "toggle_tooltips":
        toggleDebugFlag("advancedTooltips", "Advanced Tooltips");
        return true;
      case "toggle_pie":
        debugState.pieChart = !debugState.pieChart;
        debugState.visible = debugState.visible || debugState.pieChart;
        updateDebugUi();
        pushChatLine(`Performance pie: ${debugState.pieChart ? "ON" : "OFF"}`, "sys");
        return true;
      case "toggle_graph":
        debugState.frameGraph = !debugState.frameGraph;
        debugState.visible = debugState.visible || debugState.frameGraph;
        updateDebugUi();
        pushChatLine(`Frame graph: ${debugState.frameGraph ? "ON" : "OFF"}`, "sys");
        return true;
      case "copy_coords":
        copyDebugText(
          `${player.x.toFixed(2)} ${player.y.toFixed(2)} ${player.z.toFixed(2)}`,
          "Coordinates copied.",
          "Could not copy coordinates."
        );
        return true;
      case "copy_target":
        if (currentTarget) {
          copyDebugText(
            JSON.stringify({ block: getItemName(currentTarget.type), x: currentTarget.x, y: currentTarget.y, z: currentTarget.z }),
            "Target block data copied.",
            "Could not copy target block data."
          );
          return true;
        }
        if (currentEntityTarget?.mob) {
          copyDebugText(
            JSON.stringify({ type: currentEntityTarget.mob.type, x: currentEntityTarget.mob.x, y: currentEntityTarget.mob.y, z: currentEntityTarget.mob.z, health: currentEntityTarget.mob.health }),
            "Target entity data copied.",
            "Could not copy target entity data."
          );
          return true;
        }
        pushChatLine("Nothing targeted to copy.", "err");
        return true;
      case "clear_chat":
        clearChatLines();
        pushChatLine("Chat cleared.", "sys");
        return true;
      case "increase_rd":
        settings.renderDistanceChunks = clamp(settings.renderDistanceChunks + 1, 2, 6);
        if (glRenderer) glRenderer.setRenderDistance(settings.renderDistanceChunks);
        if (canvasRenderer) canvasRenderer.setRenderDistance(settings.renderDistanceChunks);
        setSettingsUI();
        world.saveDirty = true;
        pushChatLine(`Render distance: ${settings.renderDistanceChunks}`, "sys");
        return true;
      case "decrease_rd":
        settings.renderDistanceChunks = clamp(settings.renderDistanceChunks - 1, 2, 6);
        if (glRenderer) glRenderer.setRenderDistance(settings.renderDistanceChunks);
        if (canvasRenderer) canvasRenderer.setRenderDistance(settings.renderDistanceChunks);
        setSettingsUI();
        world.saveDirty = true;
        pushChatLine(`Render distance: ${settings.renderDistanceChunks}`, "sys");
        return true;
      case "cycle_gamemode":
        settings.gameMode = settings.gameMode === GAME_MODE.CREATIVE ? GAME_MODE.SURVIVAL : GAME_MODE.CREATIVE;
        setHotbarImages();
        setSettingsUI();
        world.saveDirty = true;
        pushChatLine(`Game mode: ${settings.gameMode}`, "sys");
        return true;
      default:
        return false;
    }
  }

  function handleCustomDebugShortcuts() {
    const debugModifierDown = input.isDown("f") || input.isDown("F");
    const shiftDown = input.isDown("Shift");
    const altDown = input.isDown("Alt");
    let used = false;

    if (debugModifierDown && input.consumePress("1")) {
      handleDebugShortcutAction("toggle_hud");
      used = true;
    }

    if (debugModifierDown && input.consumePress("3")) {
      if (shiftDown) {
        handleDebugShortcutAction("toggle_pie");
      } else if (altDown) {
        handleDebugShortcutAction("toggle_graph");
      } else {
        handleDebugShortcutAction("toggle_debug");
      }
      debugState.chordUntil = performance.now() + 1500;
      used = true;
    }

    const f3ChordActive = debugModifierDown && (input.isDown("3") || debugState.chordUntil > performance.now());
    if (!f3ChordActive) {
      return used;
    }

    if (input.consumePress("q", "Q")) {
      handleDebugShortcutAction("help");
      return true;
    }
    if (input.consumePress("a", "A")) {
      handleDebugShortcutAction("reload_chunks");
      return true;
    }
    if (input.consumePress("t", "T")) {
      handleDebugShortcutAction("reload_resources");
      return true;
    }
    if (input.consumePress("g", "G")) {
      handleDebugShortcutAction("toggle_chunk_borders");
      return true;
    }
    if (input.consumePress("b", "B")) {
      handleDebugShortcutAction("toggle_hitboxes");
      return true;
    }
    if (input.consumePress("h", "H")) {
      handleDebugShortcutAction("toggle_tooltips");
      return true;
    }
    if (input.consumePress("c", "C")) {
      handleDebugShortcutAction("copy_coords");
      return true;
    }
    if (input.consumePress("i", "I")) {
      handleDebugShortcutAction("copy_target");
      return true;
    }
    if (input.consumePress("d", "D")) {
      handleDebugShortcutAction("clear_chat");
      return true;
    }
    if (input.consumePress("r", "R", "=", "+", "-")) {
      handleDebugShortcutAction(shiftDown ? "decrease_rd" : "increase_rd");
      return true;
    }
    if (input.consumePress("n", "N")) {
      handleDebugShortcutAction("cycle_gamemode");
      return true;
    }
    return used;
  }

  function finalizeDebugUpdateMetrics(updateStartMs, uiMs = 0, chunkMs = 0, frameBudgetMs = debugState.metrics.frameMs) {
    const updateMs = Math.max(0, performance.now() - updateStartMs);
    debugState.metrics.frameMs = Math.max(0.1, frameBudgetMs);
    debugState.metrics.updateMs = updateMs;
    debugState.metrics.uiMs = Math.max(0, uiMs);
    debugState.metrics.chunkMs = Math.max(0, chunkMs);
    debugState.metrics.worldMs = Math.max(0, updateMs - uiMs - chunkMs);
    updateDebugUi();
  }

  function compactRuntimeState(forceMeshReset = false) {
    if (world?.terrain) {
      world.terrain.heightCache.clear();
      world.terrain.columnCache.clear();
    }
    if (!glRenderer || !world || !player) {
      return;
    }

    const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);
    const preset = getPerformancePresetConfig(settings.performancePreset);
    const keepRadius = settings.chunkLagFix === false
      ? settings.renderDistanceChunks + 2
      : settings.renderDistanceChunks + (preset.cleanupBias >= 1 ? 0 : 1);
    world.unloadFarChunks(playerChunkX, playerChunkZ, keepRadius);

    for (const [key, record] of glRenderer.chunkMeshes) {
      if (!world.chunks.has(key) || forceMeshReset) {
        record.opaque.destroy();
        record.transparent.destroy();
        glRenderer.chunkMeshes.delete(key);
      }
    }

    if (forceMeshReset) {
      glRenderer.chunkGenQueue = [];
      glRenderer.meshQueue = [];
      glRenderer.chunkGenQueuedKeys = new Set();
      glRenderer.meshQueuedKeys = new Set();
      for (const offset of glRenderer.visibleOffsets) {
        const chunkX = playerChunkX + offset.dx;
        const chunkZ = playerChunkZ + offset.dz;
        if (glRenderer._withinDistance(offset.dx, offset.dz)) {
          if (world.peekChunk(chunkX, chunkZ)) {
            glRenderer.queueChunk(chunkX, chunkZ);
          } else {
            glRenderer.queueChunkGeneration(chunkX, chunkZ);
          }
        }
      }
      return;
    }

    glRenderer.chunkGenQueue = glRenderer.chunkGenQueue.filter((entry) => {
      const dx = entry.chunkX - playerChunkX;
      const dz = entry.chunkZ - playerChunkZ;
      return glRenderer._withinDistance(dx, dz) && !glRenderer.chunkMeshes.has(entry.key);
    });
    glRenderer.chunkGenQueuedKeys = new Set(glRenderer.chunkGenQueue.map((entry) => entry.key));

    glRenderer.meshQueue = glRenderer.meshQueue.filter((entry) => {
      const dx = entry.chunkX - playerChunkX;
      const dz = entry.chunkZ - playerChunkZ;
      return glRenderer._withinDistance(dx, dz) && world.chunks.has(entry.key);
    });
    glRenderer.meshQueuedKeys = new Set(glRenderer.meshQueue.map((entry) => entry.key));
  }

  function updateRuntimePerformance(dt) {
    runtimeCompactCooldown = Math.max(0, runtimeCompactCooldown - dt);
    runtimeMaintenanceTimer += dt;

    if (mode !== "playing" || !useWebGL || !world || !player || !glRenderer) {
      runtimeLowFpsTimer = 0;
      return;
    }

    if (runtimeMaintenanceTimer >= 30) {
      compactRuntimeState(false);
      runtimeMaintenanceTimer = 0;
    }

    const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);
    if (playerChunkX !== runtimeLastChunkX || playerChunkZ !== runtimeLastChunkZ) {
      const movedChunks = Number.isFinite(runtimeLastChunkX) && Number.isFinite(runtimeLastChunkZ)
        ? Math.max(Math.abs(playerChunkX - runtimeLastChunkX), Math.abs(playerChunkZ - runtimeLastChunkZ))
        : 0;
      runtimeLastChunkX = playerChunkX;
      runtimeLastChunkZ = playerChunkZ;
      if (movedChunks > 0 && settings.chunkLagFix !== false) {
        compactRuntimeState(runtimePlayerInCave && fpsSmoothed > 0 && fpsSmoothed < 40);
        runtimeCompactCooldown = Math.max(runtimeCompactCooldown, movedChunks >= 2 ? 1.6 : 0.8);
        runtimeMaintenanceTimer = 0;
      }
    }

    const preset = getPerformancePresetConfig(settings.performancePreset);
    const lowFpsThreshold = (settings.chunkLagFix === false ? 34 : 48) + Math.round(preset.cleanupBias * 6);
    const queueBacklog = (glRenderer.chunkGenQueue?.length || 0) + (glRenderer.meshQueue?.length || 0);
    if (settings.chunkLagFix !== false && queueBacklog > Math.max(20, settings.renderDistanceChunks * 12) && runtimeCompactCooldown <= 0) {
      compactRuntimeState(runtimePlayerInCave && fpsSmoothed > 0 && fpsSmoothed < 42);
      runtimeCompactCooldown = 5;
      runtimeMaintenanceTimer = 0;
    }
    if (fpsSmoothed > 0 && fpsSmoothed < lowFpsThreshold) {
      runtimeLowFpsTimer += dt;
    } else {
      runtimeLowFpsTimer = Math.max(0, runtimeLowFpsTimer - dt * 1.4);
    }

    if (runtimeLowFpsTimer >= 6 && runtimeCompactCooldown <= 0) {
      compactRuntimeState(fpsSmoothed < 34);
      runtimeLowFpsTimer = 0;
      runtimeCompactCooldown = 18;
    } else if (runtimePlayerInCave && fpsSmoothed > 0 && fpsSmoothed < 50 && runtimeCompactCooldown <= 0) {
      runtimeLowFpsTimer += dt * 0.6;
      if (runtimeLowFpsTimer >= 3.5) {
        compactRuntimeState(fpsSmoothed < 40);
        runtimeLowFpsTimer = 0;
        runtimeCompactCooldown = 10;
      }
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
      const mouse = input?.getMousePosition?.() || null;
      updateInventoryCursorPosition();
      updateMenuPreviewLookTargets(mouse);
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
      const creativeSlot = event.target.closest("[data-creative-index]");
      const armorSlot = event.target.closest("[data-armor-index]");
      const craftSlot = event.target.closest("[data-craft-index]");
      const craftOutput = event.target.closest("[data-craft-output]");
      const furnaceSlot = event.target.closest("[data-furnace-slot]");
      if (inventoryOpen && creativeSlot?.dataset.creativeIndex) {
        handleCreativeSlotClick(Number(creativeSlot.dataset.creativeIndex), { shiftKey: event.shiftKey, single: false });
        return;
      }
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
        settings.texturePack = packEntry.dataset.packSelect;
        applyTexturePackSetting();
        markWorldDirty();
        setSettingsUI();
        return;
      }

      const tradeOffer = event.target.closest("[data-trade-offer]");
      if (tradeOffer?.dataset.tradeOffer) {
        executeVillagerTrade(Number(tradeOffer.dataset.tradeOffer));
        return;
      }

      const multiplayerEntry = event.target.closest("[data-mp-code],[data-mp-server-id]");
      if (multiplayerEntry && multiplayerEntry.dataset.mpCode !== undefined) {
        multiplayerState.selectedRoomCode = String(multiplayerEntry.dataset.mpCode || "");
        multiplayerState.selectedServerId = String(multiplayerEntry.dataset.mpServerId || "");
        if (ui?.multiplayerDirectInputEl && multiplayerEntry.dataset.mpAddress) {
          ui.multiplayerDirectInputEl.value = multiplayerEntry.dataset.mpAddress;
        }
        renderMultiplayerMenu();
        return;
      }

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;

      if (action === "complete-profile") {
        completeProfileSetup();
      } else if (action === "open-multiplayer") {
        if (!MULTIPLAYER_ENABLED) return;
        renderMultiplayerMenu();
        ui.showScreen("multiplayer");
        refreshDedicatedServerBrowser(ui.multiplayerDirectInputEl?.value || multiplayerState.directConnectUrl).catch(() => {});
      } else if (action === "profile-import-skin") {
        ui.skinFileInput.value = "";
        ui.skinFileInput.click();
      } else if (action === "profile-clear-skin") {
        setProfileSkinPreset(DEFAULT_SETTINGS.playerSkinPreset);
      } else if (action === "singleplayer") {
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
        showHomeScreen();
      } else if (action === "open-settings") {
        ui.showScreen("settings");
        setSettingsUI();
      } else if (action === "open-advancements") {
        renderAdvancementsScreen();
        ui.showScreen("advancements");
      } else if (action === "open-statistics") {
        renderStatisticsScreen();
        ui.showScreen("statistics");
      } else if (action === "back-pause") {
        ui.showScreen("pause");
      } else if (action === "open-resource-packs-screen") {
        ui.showScreen("resourcePacks");
        renderResourcePackUI();
      } else if (action === "done-resource-packs") {
        ui.showScreen("settings");
        setSettingsUI();
      } else if (action === "open-resource-packs") {
        ui.resourcePackFileInput.value = "";
        ui.resourcePackFileInput.click();
      } else if (action === "open-resource-packs-zip") {
        ui.resourcePackZipInput.value = "";
        ui.resourcePackZipInput.click();
      } else if (action === "skin-import") {
        ui.skinFileInput.value = "";
        ui.skinFileInput.click();
      } else if (action === "skin-reset") {
        settings.playerSkinPreset = DEFAULT_SETTINGS.playerSkinPreset;
        settings.playerSkinDataUrl = "";
        customPlayerSkinCache = { dataUrl: "", canvas: null, loading: false, failed: false };
        markWorldDirty();
        setSettingsUI();
        if (inventoryOpen) renderInventoryUI();
      } else if (action === "skin-freecube" || action === "skin-steve" || action === "skin-alex" || action === "skin-zombie") {
        const preset = action.replace("skin-", "");
        settings.playerSkinPreset = preset;
        settings.playerSkinDataUrl = "";
        customPlayerSkinCache = { dataUrl: "", canvas: null, loading: false, failed: false };
        markWorldDirty();
        setSettingsUI();
        if (inventoryOpen) renderInventoryUI();
      } else if (action === "back-settings") {
        if (mode === "paused") {
          ui.showScreen("pause");
        } else {
          showHomeScreen();
        }
      } else if (action === "play-world") {
        if (!selectedWorldId) return;
        startWorld(selectedWorldId);
      } else if (action === "new-world") {
        ui.newWorldCard.style.display = "block";
        ui.worldNameInput.value = "";
        ui.worldSeedInput.value = "";
        ui.worldNameInput.focus();
      } else if (action === "import-world") {
        ui.importWorldFileInput.value = "";
        ui.importWorldFileInput.click();
      } else if (action === "export-world") {
        exportSelectedWorld();
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
      } else if (action === "open-lan") {
        hostWorldOnLan().catch((error) => {
          alert(String(error?.message || "Can't connect."));
        });
      } else if (action === "save-now") {
        saveWorld(true);
      } else if (action === "close-trade") {
        closeTrade(true);
      } else if (action === "quit-title") {
        mode = "menu";
        quitToTitle();
      } else if (action === "run-auto-repair") {
        if (!runtimeFault?.active) {
          reportRuntimeFault(
            useWebGL ? "manual-graphics-repair" : "manual-runtime-repair",
            "Manual Repair",
            useWebGL ? "Trying to rebuild the graphics renderer." : "Trying to rebuild the game state.",
            "Auto Repair was started manually from the error screen."
          );
        }
        beginAutoRepair(true);
      } else if (action === "reload") {
        location.reload();
      }
    });

    if (ui.profileNameInput) {
      ui.profileNameInput.addEventListener("input", () => {
        playerUsername = normalizeCubeCraftUsername(ui.profileNameInput.value, "");
      });
      ui.profileNameInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        completeProfileSetup();
      });
    }

    if (ui.profileSkinPresetEl) {
      ui.profileSkinPresetEl.addEventListener("change", () => {
        const nextPreset = ui.profileSkinPresetEl.value;
        if (nextPreset === "custom") {
          if (settings.playerSkinDataUrl) {
            settings.playerSkinPreset = "custom";
            setProfileSetupUI();
            setSettingsUI();
            return;
          }
          ui.skinFileInput.value = "";
          ui.skinFileInput.click();
          ui.profileSkinPresetEl.value = isValidPlayerSkinPreset(settings.playerSkinPreset) ? settings.playerSkinPreset : DEFAULT_SETTINGS.playerSkinPreset;
          return;
        }
        setProfileSkinPreset(nextPreset);
      });
    }

    if (ui.multiplayerDirectInputEl) {
      ui.multiplayerDirectInputEl.addEventListener("input", () => {
        const nextValue = String(ui.multiplayerDirectInputEl.value || "").trim();
        if (!nextValue || nextValue.includes("://") || nextValue.includes(".") || nextValue.includes(":") || nextValue.includes("/")) {
          multiplayerState.directConnectUrl = nextValue;
          multiplayerState.selectedRoomCode = "";
        } else {
          multiplayerState.selectedRoomCode = nextValue.toUpperCase();
        }
        multiplayerState.selectedServerId = "";
        renderMultiplayerMenu();
      });
    }

    if (ui.multiplayerDirectBtn) {
      ui.multiplayerDirectBtn.addEventListener("click", async () => {
        if (!MULTIPLAYER_ENABLED) return;
        try {
          const joined = await joinMultiplayerRoom(ui.multiplayerDirectInputEl?.value || "");
          if (!joined) {
            alert("Can't connect.");
          }
        } catch (error) {
          alert("Can't connect.");
        }
      });
    }

    if (ui.multiplayerJoinBtn) {
      ui.multiplayerJoinBtn.addEventListener("click", async () => {
        if (!MULTIPLAYER_ENABLED) return;
        const selected = findSelectedMultiplayerEntry();
        try {
          const joined = selected?.kind === "signal_room"
            ? await joinSignalMultiplayerRoom(
                selected.address || multiplayerState.directConnectUrl,
                selected.code || multiplayerState.selectedRoomCode
              )
            : await joinDedicatedMultiplayerServer(
                selected?.address || ui.multiplayerDirectInputEl?.value || multiplayerState.directConnectUrl,
                selected?.serverId || selected?.code || "default"
              );
          if (!joined) {
            alert("Can't connect.");
          }
        } catch (error) {
          alert("Can't connect.");
        }
      });
    }

    if (ui.multiplayerAddBtn) {
      ui.multiplayerAddBtn.addEventListener("click", async () => {
        const address = String(ui.multiplayerDirectInputEl?.value || "").trim();
        if (!address) {
          alert("Can't connect.");
          return;
        }
        const label = String(prompt("Saved server name:", "New Server") || "").trim() || "New Server";
        const savedEntry = {
          id: `saved-${generateId()}`,
          name: label,
          subtitle: "Saved multiplayer server",
          address,
          statusText: "Dedicated server",
          roomCode: "",
          serverId: "",
          playersLabel: "",
          healthy: true
        };
        multiplayerState.savedServers = [
          ...multiplayerState.savedServers.filter((server) => server.address !== address),
          savedEntry
        ];
        multiplayerState.selectedServerId = savedEntry.id;
        multiplayerState.selectedRoomCode = address;
        renderMultiplayerMenu();
      });
    }

    if (ui.multiplayerDeleteBtn) {
      ui.multiplayerDeleteBtn.addEventListener("click", () => {
        if (!MULTIPLAYER_ENABLED || !multiplayerState.selectedServerId) return;
        multiplayerState.savedServers = multiplayerState.savedServers.filter((server) => server.id !== multiplayerState.selectedServerId);
        multiplayerState.selectedServerId = "";
        multiplayerState.selectedRoomCode = "";
        renderMultiplayerMenu();
      });
    }

    if (ui.multiplayerRefreshBtn) {
      ui.multiplayerRefreshBtn.addEventListener("click", () => {
        if (!MULTIPLAYER_ENABLED) return;
        refreshDedicatedServerBrowser(ui.multiplayerDirectInputEl?.value || multiplayerState.directConnectUrl).catch(() => {
          alert("Can't connect.");
        });
      });
    }

    [ui.worldNameInput, ui.worldSeedInput].forEach((inputEl) => {
      inputEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        if (ui.newWorldCard.style.display === "none") return;
        event.preventDefault();
        createAndStartWorld();
      });
    });

    ui.importWorldFileInput.addEventListener("change", async () => {
      const file = ui.importWorldFileInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        await importWorldFile(file);
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      } finally {
        ui.importWorldFileInput.value = "";
      }
    });

    ui.skinFileInput.addEventListener("change", async () => {
      const file = ui.skinFileInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        const dataUrl = await readPlayerSkinFile(file);
        settings.playerSkinPreset = "custom";
        settings.playerSkinDataUrl = dataUrl;
        customPlayerSkinCache = {
          dataUrl,
          canvas: null,
          loading: false,
          failed: false
        };
        getCustomPlayerSkinCanvas(dataUrl);
        markWorldDirty();
        setProfileSetupUI();
        setSettingsUI();
        if (inventoryOpen) renderInventoryUI();
      } catch (error) {
        alert(`Skin import failed: ${error.message}`);
      } finally {
        ui.skinFileInput.value = "";
      }
    });

    ui.resourcePackFileInput.addEventListener("change", async () => {
      const files = ui.resourcePackFileInput.files;
      if (!files?.length) {
        return;
      }
      try {
        await importResourcePackFiles(files);
        renderResourcePackUI();
      } catch (error) {
        alert(`Resource-pack import failed: ${error.message}`);
      } finally {
        ui.resourcePackFileInput.value = "";
      }
    });

    ui.resourcePackZipInput.addEventListener("change", async () => {
      const file = ui.resourcePackZipInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        await importResourcePackZip(file);
        renderResourcePackUI();
      } catch (error) {
        alert(`Resource-pack ZIP import failed: ${error.message}`);
      } finally {
        ui.resourcePackZipInput.value = "";
      }
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
      const creativeSlot = event.target.closest("[data-creative-index]");
      const armorSlot = event.target.closest("[data-armor-index]");
      const craftSlot = event.target.closest("[data-craft-index]");
      const furnaceSlot = event.target.closest("[data-furnace-slot]");
      if (!inventorySlot && !creativeSlot && !armorSlot && !craftSlot && !furnaceSlot) return;
      event.preventDefault();
      if (creativeSlot?.dataset.creativeIndex) {
        handleCreativeSlotClick(Number(creativeSlot.dataset.creativeIndex), { single: true });
      } else if (inventorySlot?.dataset.inventoryIndex) {
        handleInventorySlotRightClick(Number(inventorySlot.dataset.inventoryIndex));
      } else if (armorSlot?.dataset.armorIndex) {
        handleArmorSlotRightClick(Number(armorSlot.dataset.armorIndex));
      } else if (craftSlot?.dataset.craftIndex) {
        handleCraftSlotRightClick(Number(craftSlot.dataset.craftIndex));
      } else if (furnaceSlot?.dataset.furnaceSlot) {
        handleFurnaceSlotRightClick(furnaceSlot.dataset.furnaceSlot);
      }
    });

    ui.videoGraphicsBtn.addEventListener("click", () => {
      settings.graphicsMode = settings.graphicsMode === "fancy" ? "fast" : "fancy";
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoRenderDistanceBtn.addEventListener("click", () => {
      settings.renderDistanceChunks = settings.renderDistanceChunks >= 6 ? 2 : settings.renderDistanceChunks + 1;
      if (glRenderer) glRenderer.setRenderDistance(settings.renderDistanceChunks);
      if (canvasRenderer) canvasRenderer.setRenderDistance(settings.renderDistanceChunks);
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoFovBtn.addEventListener("click", () => {
      const currentIndex = Math.max(0, FOV_PRESETS.indexOf(settings.fovDegrees));
      settings.fovDegrees = FOV_PRESETS[(currentIndex + 1) % FOV_PRESETS.length];
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoMouseBtn.addEventListener("click", () => {
      const currentIndex = Math.max(0, MOUSE_SENSITIVITY_PRESETS.indexOf(settings.mouseSensitivity));
      settings.mouseSensitivity = MOUSE_SENSITIVITY_PRESETS[(currentIndex + 1) % MOUSE_SENSITIVITY_PRESETS.length];
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoViewBobBtn.addEventListener("click", () => {
      settings.viewBobbing = !(settings.viewBobbing !== false);
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoShadowsBtn.addEventListener("click", () => {
      settings.shadows = !(settings.shadows !== false);
      applyLightingSetting();
      setSettingsUI();
    });

    ui.videoFpsBtn.addEventListener("click", () => {
      settings.showFps = !(settings.showFps !== false);
      ui.fpsEl.style.display = settings.showFps ? "block" : "none";
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoMasterVolumeBtn.addEventListener("click", () => {
      settings.masterVolume = cycleVolumePreset(settings.masterVolume);
      syncMusicVolume();
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoMusicVolumeBtn.addEventListener("click", () => {
      settings.musicVolume = cycleVolumePreset(settings.musicVolume);
      syncMusicVolume();
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoMobModelsBtn.addEventListener("click", () => {
      settings.mobModels = !(settings.mobModels !== false);
      logMobRenderDiagnostics("toggle");
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoPerformanceBtn.addEventListener("click", () => {
      const currentIndex = Math.max(0, PERFORMANCE_PRESETS.indexOf(settings.performancePreset));
      settings.performancePreset = PERFORMANCE_PRESETS[(currentIndex + 1) % PERFORMANCE_PRESETS.length];
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoFullscreenBtn.addEventListener("click", () => {
      applyFullscreenSetting(!(settings.fullscreen || !!document.fullscreenElement));
    });

    ui.videoChunkLagBtn.addEventListener("click", () => {
      settings.chunkLagFix = !(settings.chunkLagFix !== false);
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoInvertYBtn.addEventListener("click", () => {
      settings.invertY = !settings.invertY;
      markWorldDirty();
      setSettingsUI();
    });

    ui.videoGameModeBtn.addEventListener("click", () => {
      settings.gameMode = settings.gameMode === GAME_MODE.CREATIVE ? GAME_MODE.SURVIVAL : GAME_MODE.CREATIVE;
      markWorldDirty();
      setHotbarImages();
      setSettingsUI();
    });

    document.addEventListener("fullscreenchange", () => {
      settings.fullscreen = !!document.fullscreenElement;
      saveGlobalSettings();
      setSettingsUI();
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
      loadGlobalSettings();
      input = new BrowserInput(engine);
      input.pointerLockEnabled = false;

      textures = new TextureLibrary(engine);
      textures.settings = settings;
      textures.startLoading();
      entityTextures = new EntityTextureLibrary(engine);
      entityTextures.settings = settings;
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
      engine.canvas.addEventListener("webglcontextlost", handleWebGLContextLost);
      engine.canvas.addEventListener("webglcontextrestored", handleWebGLContextRestored);
      window.addEventListener("error", handleWindowRuntimeError);
      window.addEventListener("unhandledrejection", handleWindowRuntimeRejection);
      playerUsername = getStoredCubeCraftUsername();
      showHomeScreen();
      ui.setHudVisible(false);
      setSettingsUI();
      if (settings.texturePack === MC_ASSETS_ONLINE_PACK_ID && !getCustomResourcePack(settings, MC_ASSETS_ONLINE_PACK_ID)) {
        ensureOnlineResourcePackLoaded()
          .then(() => {
            applyTexturePackSetting();
          })
          .catch((error) => {
            console.warn("Online resource pack bootstrap failed:", error.message);
          });
      }
      preloadMusicTracks();
      window.addEventListener("pointerdown", unlockMusicPlayback, { once: true });
      window.addEventListener("keydown", unlockMusicPlayback, { once: true });
      // Hotbar thumbnails depend on PNG textures; refresh once they're loaded.
      textures.readyPromise?.then(() => setHotbarImages());

      window.CubesAndCaves = { engine, store, textures, entityTextures, objModels };
      window.FreeCube2 = window.CubesAndCaves;
      console.log(`${GAME_TITLE} boot:`, {
        version: GAME_VERSION,
        renderer: useWebGL ? "WebGL2" : "Canvas",
        seed: world?.seed,
        settings
      });
      console.log("Debug Console: Ctrl+Shift+Alt+Z (Sirco). DevTools: Ctrl+Shift+D (Sirco).");

      window.addEventListener("beforeunload", () => {
        saveGlobalSettings();
        saveWorld(true);
      });
    },

    update(dt) {
      if (!input || !textures) return;
      const updateStartMs = performance.now();
      let debugUiMs = 0;
      let debugChunkMs = 0;
      ensureStore();
      if (updateRuntimeFaultState()) {
        if (player) {
          player.isSprinting = false;
          player.isCrouching = false;
        }
        setMiningProgress(0);
        saveWorld(false);
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }
      updateFps(dt);
      updateRuntimePerformance(dt);
      const uiStartMs = performance.now();
      updateChat(dt);
      updateWeather(dt);
      updateHud(dt);
      updateToasts(dt);
      updateEffectsHud();
      updateMusicState(dt);
      debugUiMs += performance.now() - uiStartMs;
      debugState.metrics.frameMs = dt * 1000;
      pushDebugFrameSample(dt * 1000);

      if (document.hidden) {
        input.resetState?.(true);
        if (player) {
          player.isSprinting = false;
          player.isCrouching = false;
        }
        setMiningProgress(0);
        saveWorld(false);
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      // When pointer lock is active, ESC may only exit pointer lock (no keydown).
      // Treat that as "pause".
      if (mode === "playing" && !sleepState.active && input.consumeLostPointerLock()) {
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
        if (tradeOpen) {
          closeTrade(true);
          finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
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
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      if (!world || !player) {
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      if (!chatOpen && handleCustomDebugShortcuts()) {
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      if (input.consumePress("F1")) {
        handleDebugShortcutAction("toggle_hud");
      }
      if (input.consumePress("F3")) {
        if (input.isDown("Shift")) {
          handleDebugShortcutAction("toggle_pie");
        } else if (input.isDown("Alt")) {
          handleDebugShortcutAction("toggle_graph");
        } else {
          handleDebugShortcutAction("toggle_debug");
        }
      }

      saveTimer += dt;

      if (mode === "loading") {
        updateLoading(dt);
        updatePlayerVitals(dt);
        saveWorld(false);
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      if (mode === "paused") {
        input.consumeLook();
        player.isSprinting = false;
        player.isCrouching = false;
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        setMiningProgress(0);
        updatePlayerVitals(dt);
        saveWorld(false);
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      // playing
      if (sleepState.active) {
        input.consumeLostPointerLock();
        input.consumeLook();
        player.isSprinting = false;
        player.isCrouching = false;
        player.breakCooldown = Math.max(0, player.breakCooldown - dt);
        player.placeCooldown = Math.max(0, player.placeCooldown - dt);
        updateSleeping(dt);
        saveWorld(false);
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      if (tradeOpen) {
        if (!isVillagerTradeValid()) {
          closeTrade(true);
          finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
          return;
        }
        renderVillagerTradeUi();
        input.consumeLook();
        player.isSprinting = false;
        player.isCrouching = false;
        currentTarget = null;
        currentEntityTarget = null;
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        setMiningProgress(0);
        player.breakCooldown = Math.max(0, player.breakCooldown - dt);
        player.placeCooldown = Math.max(0, player.placeCooldown - dt);
        if (!isMultiplayerGuest()) {
          updateBlockTicks(dt);
          updateFurnaces(dt);
        }
        updatePlayerVitals(dt);
        saveWorld(false);
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      if (!chatOpen && !inventoryOpen && (input.consumePress("t") || input.consumePress("T"))) {
        openChat("");
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }
      if (!chatOpen && !inventoryOpen && (input.consumePress("/") || input.consumePress("?"))) {
        openChat("/");
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }
      if (!chatOpen && input.consumePress("e", "E")) {
        setInventoryOpen(!inventoryOpen);
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      if (chatOpen) {
        input.consumeLook();
        player.isSprinting = false;
        player.isCrouching = false;
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        setMiningProgress(0);
        player.breakCooldown = Math.max(0, player.breakCooldown - dt);
        player.placeCooldown = Math.max(0, player.placeCooldown - dt);
        if (!isMultiplayerGuest()) {
          updateBlockTicks(dt);
          updateFurnaces(dt);
        }
        updatePlayerVitals(dt);
        saveWorld(false);
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      if (inventoryOpen) {
        input.consumeLook();
        player.isSprinting = false;
        player.isCrouching = false;
        if (useWebGL && glRenderer) glRenderer.setTargetBlock(null);
        setMiningProgress(0);
        player.breakCooldown = Math.max(0, player.breakCooldown - dt);
        player.placeCooldown = Math.max(0, player.placeCooldown - dt);
        updateInventoryCursorPosition();
        if (!isMultiplayerGuest()) {
          updateBlockTicks(dt);
          updateFurnaces(dt);
        }
        updatePlayerVitals(dt);
        saveWorld(false);
        finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
        return;
      }

      addPlayerStat("playTime", dt);
      updateSelectedSlotFromInput();
      if (input.consumePress("q") || input.consumePress("Q")) {
        dropSelectedItem();
      }

      let look = { x: 0, y: 0 };
      if (input.locked) {
        const prevX = player.x;
        const prevZ = player.z;
        look = input.consumeLook();
        player.applyLook(look.x, look.y, settings);
        player.update(dt, input, world, settings);
        addPlayerStat("distanceWalked", Math.hypot(player.x - prevX, player.z - prevZ));
        if (player.pendingFallDamage > 0) {
          applyDamage(player.pendingFallDamage, "fell");
          player.pendingFallDamage = 0;
        }
      } else {
        look = input.consumeLook();
        player.isSprinting = false;
        player.isCrouching = false;
      }

      const multiplayerGuest = isMultiplayerGuest();
      updateMultiplayerSession(dt);
      if (!multiplayerGuest) {
        updateBlockTicks(dt);
      }
      player.ensureSafePosition(world);
      updatePlayerVitals(dt);

      caveCheckTimer = Math.max(0, caveCheckTimer - dt);
      villageCheckTimer = Math.max(0, villageCheckTimer - dt);
      if (caveCheckTimer <= 0) {
        runtimePlayerInCave = isPlayerInCave();
        caveCheckTimer = fpsSmoothed > 0 && fpsSmoothed < 48 ? 0.5 : 0.25;
      }
      if (villageCheckTimer <= 0) {
        runtimePlayerInVillage = isPlayerInVillage();
        villageCheckTimer = fpsSmoothed > 0 && fpsSmoothed < 48 ? 0.9 : 0.45;
      }

      if (useWebGL && glRenderer && atlas.texture) {
        const chunkStartMs = performance.now();
        glRenderer.runtimeInCave = runtimePlayerInCave;
        glRenderer.runtimeLowFps = fpsSmoothed > 0 && fpsSmoothed < (runtimePlayerInCave ? 56 : 50);
        const chunkConfig = getChunkRuntimeConfig(false);
        glRenderer.ensureVisibleChunks(chunkConfig.genLimit, chunkConfig.genBudgetMs);
        glRenderer.updateQueue(chunkConfig.meshLimit, chunkConfig.meshBudgetMs);
        glRenderer.updateCamera();
        debugChunkMs += performance.now() - chunkStartMs;
      }

      targetScanTimer = Math.max(0, targetScanTimer - dt);
      if (!input.locked) {
        currentTarget = null;
        currentEntityTarget = null;
      } else {
        const targetScanInterval = runtimePlayerInCave
          ? (fpsSmoothed > 0 && fpsSmoothed < 52 ? 1 / 12 : 1 / 18)
          : (fpsSmoothed > 0 && fpsSmoothed < 48 ? 1 / 18 : TARGET_SCAN_INTERVAL_SECONDS);
        const shouldRefreshTargets =
          targetScanTimer <= 0 ||
          input.buttonsDown[0] ||
          input.buttonsDown[2] ||
          Math.abs(look.x) > 0.0001 ||
          Math.abs(look.y) > 0.0001;
        if (shouldRefreshTargets) {
          const blockTarget = world.raycast(player.getEyePosition(), player.getLookVector(), MAX_REACH);
          currentEntityTarget = findTargetMob(blockTarget);
          currentTarget = currentEntityTarget ? null : blockTarget;
          targetScanTimer = targetScanInterval;
        }
      }
      if (useWebGL && glRenderer) glRenderer.setTargetBlock(currentTarget);
      updateCombat();
      updateMining(dt);
      updateInteractions();
      if (!multiplayerGuest) {
        updateItems(dt);
        updateFurnaces(dt);
        updateSpawning(dt);
      }

      // Mobs update + render feed.
      const cycle = getDayCycleInfo(worldTime);
      const nextMobs = [];
      let removedMob = false;
      for (const mob of multiplayerGuest ? [] : mobs) {
        mob.update(dt, world, player, cycle, mobs, weather);
        if (mob.health <= 0) {
          removedMob = true;
          continue;
        }

        const def = getMobDef(mob.type);
        const activeHostile = !!def.hostile && !(mob.type === "spider" && !cycle.isNight && (mob.provokedTimer || 0) <= 0);

        if (mob.type === "creeper" && activeHostile && (mob.fuseTimer || 0) >= (def.fuseTime || 1.2)) {
          const blastRadius = def.explosionRadius || 3.6;
          const dxBlast = player.x - mob.x;
          const dyBlast = (player.y + PLAYER_HEIGHT * 0.45) - (mob.y + mob.height * 0.45);
          const dzBlast = player.z - mob.z;
          const blastDist = Math.hypot(dxBlast, dyBlast, dzBlast);
          if (blastDist < blastRadius) {
            const blastScale = 1 - blastDist / blastRadius;
            const blastNorm = Math.hypot(dxBlast, dzBlast) || 1;
            player.vx += (dxBlast / blastNorm) * 5.2 * blastScale;
            player.vz += (dzBlast / blastNorm) * 5.2 * blastScale;
            player.vy = Math.max(player.vy, 4.6 * blastScale);
            applyDamage(Math.max(2, Math.ceil(11 * blastScale)), "");
          }
          removedMob = true;
          world.saveDirty = true;
          continue;
        }

        if (!cycle.isNight && def.burnsInSunlight && !isWetWeatherAt(mob.x, mob.z) && isMobInSunlight(mob)) {
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
        if (activeHostile && mob.type !== "creeper" && withinHeight && dist < (def.attackReach || 1.15) && mob.attackCooldown <= 0) {
          mob.attackCooldown = mob.type === "spider" ? 0.75 : 0.9;
          applyDamage(def.attackDamage || 2, "");
        }
        nextMobs.push(mob);
      }

      for (const mob of nextMobs) {
        if (!mob || mob.type !== "iron_golem" || mob.health <= 0) continue;
        const golemDef = getMobDef(mob.type);
        const threat = findNearestVillageThreat(mob, nextMobs, 3.5);
        if (!threat) continue;
        const dxThreat = threat.x - mob.x;
        const dzThreat = threat.z - mob.z;
        const distThreat = Math.hypot(dxThreat, dzThreat);
        if (distThreat > (golemDef.attackReach || 1.8) + threat.radius || mob.attackCooldown > 0) {
          continue;
        }
        mob.attackCooldown = 1.15;
        const killed = threat.takeDamage(golemDef.meleeDamage || 7, mob.x, mob.z);
        if (killed && !threat._droppedLoot) {
          threat._droppedLoot = true;
          dropMobLoot(threat);
          world.saveDirty = true;
          if ((player.x - mob.x) ** 2 + (player.z - mob.z) ** 2 <= 24 * 24) {
            unlockPlayerAchievement("bodyguard");
          }
        }
      }

      const livingMobs = nextMobs.filter((mob) => mob && mob.health > 0);
      if (livingMobs.length !== nextMobs.length) {
        removedMob = true;
      }
      if (removedMob) {
        mobs = livingMobs;
        world.saveDirty = true;
      }
      if (!multiplayerGuest) {
        updateVillageLife(dt);
      }
      syncRenderEntityList();
      if (canvasRenderer) {
        canvasRenderer.mobs = multiplayerGuest ? Array.from(multiplayerSession.remotePlayers.values()) : [...mobs, ...Array.from(multiplayerSession.remotePlayers.values())];
        canvasRenderer.items = items;
      }

      if (performance.now() - lastMobRenderSummaryAt > 12000) {
        logMobRenderDiagnostics("periodic");
        lastMobRenderSummaryAt = performance.now();
      }

      saveWorld(false);
      finalizeDebugUpdateMetrics(updateStartMs, debugUiMs, debugChunkMs, dt * 1000);
    },

    render(dt) {
      const renderStartMs = performance.now();
      if (document.hidden || runtimeFault?.active || webglContextLost || !world || !player) {
        debugState.metrics.renderMs = 0;
        renderDebugWorldOverlay();
        return;
      }

      if (useWebGL && glRenderer && atlas?.texture) {
        glRenderer.setWeatherState(buildWeatherRenderState());
        const cycle = getDayCycleInfo(worldTime);
        const effectiveDarkness = clamp((1 - getEffectiveDaylight(cycle, weather.type)) + getWeatherSkyDarkness(weather.type) * 0.25, 0, 1);
        const clear = mixRgb(rgb(99, 183, 255), rgb(18, 24, 56), effectiveDarkness * 0.92);
        const flash = clamp(weather.flash || 0, 0, 1);
        const clearRgb = flash > 0.001 ? mixRgb(clear, rgb(232, 238, 255), flash * 0.5) : clear;
        gl.clearColor(clearRgb[0] / 255, clearRgb[1] / 255, clearRgb[2] / 255, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        glRenderer.updateCamera();
        glRenderer.renderFrame();
      } else if (canvasRenderer) {
        canvasRenderer.setSettings(settings);
        canvasRenderer.setWeatherState(buildWeatherRenderState());
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
      debugState.metrics.renderMs = Math.max(0, performance.now() - renderStartMs);
      renderDebugWorldOverlay();
    }
  };
}
