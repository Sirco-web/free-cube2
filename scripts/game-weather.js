import { hash4 } from "./noise.js";
import { clamp, mod } from "./core-utils.js";
import {
  DEFAULT_RENDER_DISTANCE,
  DEFAULT_SETTINGS,
  MINECRAFT_DAY_LENGTH_SECONDS,
  PLAYER_EYE_HEIGHT,
  SEA_LEVEL,
  WEATHER_TYPES,
  WORLD_HEIGHT,
  normalizePerformancePreset
} from "./game-runtime-config.js";

export function getDayCycleInfo(time = 0) {
  const dayLength = MINECRAFT_DAY_LENGTH_SECONDS;
  const t = ((time % dayLength) + dayLength) % dayLength / dayLength;
  const sunriseEnd = 1000 / 24000;
  const dayEnd = 12000 / 24000;
  const sunsetEnd = 13000 / 24000;
  const sunriseStart = 23000 / 24000;

  let daylight = 1;
  let phase = "Day";
  if (t >= dayEnd && t < sunsetEnd) {
    daylight = 1 - (t - dayEnd) / Math.max(0.0001, sunsetEnd - dayEnd) * 0.82;
    phase = "Sunset";
  } else if (t >= sunsetEnd && t < sunriseStart) {
    daylight = 0.18;
    phase = "Night";
  } else if (t >= sunriseStart || t < sunriseEnd) {
    const sunriseT = t >= sunriseStart
      ? (t - sunriseStart) / Math.max(0.0001, 1 - sunriseStart + sunriseEnd)
      : (t + (1 - sunriseStart)) / Math.max(0.0001, 1 - sunriseStart + sunriseEnd);
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

export function isNightTime(time = 0) {
  return getDayCycleInfo(time).isNight;
}

export function normalizeGamerules(value) {
  return {
    doDaylightCycle: value?.doDaylightCycle !== false,
    doWeatherCycle: value?.doWeatherCycle !== false,
    keepInventory: value?.keepInventory !== false
  };
}

export function getTimeSecondsFromMinecraftTicks(ticks = 0) {
  return (Number(ticks) || 0) / 24000 * MINECRAFT_DAY_LENGTH_SECONDS;
}

export function getWorldTimePreset(name = "day") {
  const key = String(name || "").trim().toLowerCase();
  switch (key) {
    case "day":
      return getTimeSecondsFromMinecraftTicks(1000);
    case "noon":
      return getTimeSecondsFromMinecraftTicks(6000);
    case "night":
      return getTimeSecondsFromMinecraftTicks(13000);
    case "midnight":
      return getTimeSecondsFromMinecraftTicks(18000);
    case "sunrise":
      return getTimeSecondsFromMinecraftTicks(23000);
    default:
      return null;
  }
}

export function normalizeWorldTimeSeconds(value = 0) {
  return mod(Number(value) || 0, MINECRAFT_DAY_LENGTH_SECONDS);
}

export function normalizeWeatherType(value, fallback = WEATHER_TYPES.CLEAR) {
  const lower = String(value || "").trim().toLowerCase();
  if (lower === WEATHER_TYPES.RAIN || lower === WEATHER_TYPES.THUNDER || lower === WEATHER_TYPES.CLEAR) {
    return lower;
  }
  return fallback;
}

export function getRandomWeatherDurationSeconds(type = WEATHER_TYPES.CLEAR) {
  switch (normalizeWeatherType(type)) {
    case WEATHER_TYPES.THUNDER:
      return 180 + Math.random() * 600;
    case WEATHER_TYPES.RAIN:
      return 600 + Math.random() * 600;
    default:
      return 600 + Math.random() * 8400;
  }
}

export function createWeatherState(type = WEATHER_TYPES.CLEAR, durationSeconds = null) {
  const normalizedType = normalizeWeatherType(type);
  return {
    type: normalizedType,
    timer: Math.max(1, Number(durationSeconds) || getRandomWeatherDurationSeconds(normalizedType)),
    flash: 0,
    lightningTimer: normalizedType === WEATHER_TYPES.THUNDER ? 2 + Math.random() * 6 : 0
  };
}

export function createDefaultWorldState() {
  return {
    time: 0,
    weather: createWeatherState(WEATHER_TYPES.CLEAR),
    gamerules: normalizeGamerules(),
    worldSpawnPoint: null,
    redstoneStates: new Map()
  };
}

export function normalizeSpawnPoint(value, fallback = null) {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    return fallback;
  }
  return {
    x: Number(value.x),
    y: Number(value.y),
    z: Number(value.z),
    bedKey: typeof value.bedKey === "string" ? value.bedKey : "",
    source: typeof value.source === "string" ? value.source : ""
  };
}

export function normalizeSavedWorldState(value, fallbackSpawn = null, deserializeRedstoneStates = (states) => states) {
  const state = value && typeof value === "object" ? value : {};
  const weather = state.weather && typeof state.weather === "object"
    ? createWeatherState(state.weather.type, state.weather.timer)
    : createWeatherState();
  weather.flash = 0;
  weather.lightningTimer = weather.type === WEATHER_TYPES.THUNDER
    ? Math.max(0.2, Number(state.weather?.lightningTimer) || 2 + Math.random() * 6)
    : 0;
  return {
    time: normalizeWorldTimeSeconds(state.time || 0),
    weather,
    gamerules: normalizeGamerules(state.gamerules),
    worldSpawnPoint: normalizeSpawnPoint(state.worldSpawnPoint, fallbackSpawn),
    redstoneStates: deserializeRedstoneStates(state.redstoneStates)
  };
}

export function getWeatherSkyDarkness(type) {
  switch (normalizeWeatherType(type)) {
    case WEATHER_TYPES.THUNDER:
      return 0.3;
    case WEATHER_TYPES.RAIN:
      return 0.16;
    default:
      return 0;
  }
}

export function getEffectiveDaylight(cycle, weatherType = WEATHER_TYPES.CLEAR) {
  return clamp((cycle?.daylight ?? 1) - getWeatherSkyDarkness(weatherType), 0.08, 1);
}

export function getWeatherLabel(type) {
  switch (normalizeWeatherType(type)) {
    case WEATHER_TYPES.RAIN:
      return "Rain";
    case WEATHER_TYPES.THUNDER:
      return "Thunder";
    default:
      return "Clear";
  }
}

export function getColumnPrecipitationType(column) {
  if (!column || typeof column !== "object") {
    return "none";
  }
  const biome = String(column.biome || "").toLowerCase();
  if (biome === "desert") {
    return "none";
  }
  const temperature = Number(column.temperature);
  const height = Number(column.height) || 0;
  const coldBiome = biome === "mountains" || biome === "cliff";
  return coldBiome || temperature < 0.34 || height >= SEA_LEVEL + 28 ? "snow" : "rain";
}

export function getWeatherBaseIntensity(type) {
  switch (normalizeWeatherType(type)) {
    case WEATHER_TYPES.THUNDER:
      return 1;
    case WEATHER_TYPES.RAIN:
      return 0.72;
    default:
      return 0;
  }
}

export function getWeatherParticleBudget(settingsState = DEFAULT_SETTINGS, weatherState = null) {
  const preset = normalizePerformancePreset(settingsState?.performancePreset);
  let count = preset === "turbo" ? 42 : preset === "boost" ? 68 : 96;
  if ((settingsState?.renderDistanceChunks || DEFAULT_RENDER_DISTANCE) <= 2) {
    count = Math.max(28, Math.floor(count * 0.8));
  }
  if (weatherState?.runtimeLowFps) {
    count = Math.max(22, Math.floor(count * 0.62));
  }
  if (settingsState?.graphicsMode !== "fancy") {
    count = Math.max(20, Math.floor(count * 0.88));
  }
  return count;
}

export function buildWeatherParticlePass(world, player, weatherState, settingsState = DEFAULT_SETTINGS) {
  const intensity = clamp(Number(weatherState?.intensity) || 0, 0, 1);
  const weatherType = normalizeWeatherType(weatherState?.weather?.type);
  if (!world || !player || weatherType === WEATHER_TYPES.CLEAR || intensity <= 0.02) {
    return { drops: [], splashes: [] };
  }

  const timeSeconds = Number(weatherState?.timeSeconds) || 0;
  const renderDistance = clamp(Number(settingsState?.renderDistanceChunks) || DEFAULT_RENDER_DISTANCE, 2, 6);
  const radius = clamp(6 + renderDistance * 1.8 + (weatherType === WEATHER_TYPES.THUNDER ? 1.5 : 0), 7, 18);
  const budget = Math.max(18, Math.floor(getWeatherParticleBudget(settingsState, weatherState) * intensity));
  const drops = [];
  const splashes = [];
  const eyeY = player.y + PLAYER_EYE_HEIGHT;
  const playerColumn = world.terrain.describeColumn(Math.floor(player.x), Math.floor(player.z));
  const playerUnderCover = playerColumn && playerColumn.height > eyeY + 1.4;

  for (let index = 0; index < budget; index += 1) {
    const angleSeed = hash4(Math.floor(player.x), index, Math.floor(player.z), Math.floor(timeSeconds * 6) + 4103);
    const radialSeed = hash4(Math.floor(player.z), index, Math.floor(player.x), Math.floor(timeSeconds * 4) + 7117);
    const angle = index * 2.399963229728653 + timeSeconds * 0.28 + ((angleSeed & 1023) / 1023) * 0.8;
    const radial = radius * (0.18 + 0.82 * Math.sqrt(((radialSeed >>> 10) & 1023) / 1023));
    const jitterX = (((radialSeed >>> 20) & 255) / 255 - 0.5) * 1.1;
    const jitterZ = (((angleSeed >>> 20) & 255) / 255 - 0.5) * 1.1;
    const worldX = Math.floor(player.x + Math.cos(angle) * radial + jitterX);
    const worldZ = Math.floor(player.z + Math.sin(angle) * radial + jitterZ);
    const column = world.terrain.describeColumn(worldX, worldZ);
    const precipitationType = getColumnPrecipitationType(column);
    if (precipitationType === "none") {
      continue;
    }

    const surfaceY = clamp((Number(column?.height) || SEA_LEVEL) + 1.02, 1, WORLD_HEIGHT - 1);
    if (playerUnderCover && radial < 3.4 && surfaceY > eyeY + 0.9) {
      continue;
    }

    const topY = Math.min(WORLD_HEIGHT + 12, Math.max(surfaceY + 6, eyeY + 8));
    const fallSpan = Math.max(4.5, topY - surfaceY);
    const phaseSeed = ((angleSeed >>> 8) & 1023) / 1023;
    const speed = precipitationType === "snow" ? 2.3 : weatherType === WEATHER_TYPES.THUNDER ? 16.5 : 12.6;
    const travel = mod(timeSeconds * speed + phaseSeed * fallSpan, fallSpan);
    const y = topY - travel;
    if (y < player.y - 8 || y > player.y + 22) {
      continue;
    }

    const driftX = precipitationType === "snow" ? Math.sin(timeSeconds * 0.8 + angle) * 0.15 : 0.02;
    const driftZ = precipitationType === "snow" ? Math.cos(timeSeconds * 0.72 + angle * 1.14) * 0.15 : -0.02;
    const length = precipitationType === "snow" ? 0.2 + phaseSeed * 0.16 : 0.9 + phaseSeed * 0.5 + intensity * 0.25;
    const alpha = precipitationType === "snow" ? 0.4 + intensity * 0.2 : 0.26 + intensity * 0.3;
    drops.push({
      type: precipitationType,
      x: worldX + 0.5 + driftX,
      y,
      z: worldZ + 0.5 + driftZ,
      endX: worldX + 0.5 + driftX * 0.35,
      endY: y - length,
      endZ: worldZ + 0.5 + driftZ * 0.35,
      alpha,
      depthHint: radial
    });

    if (precipitationType === "rain" && y - length <= surfaceY + 0.18 && radial < radius * 0.86) {
      splashes.push({
        x: worldX + 0.5,
        y: surfaceY,
        z: worldZ + 0.5,
        size: 0.06 + phaseSeed * 0.06,
        alpha: 0.08 + intensity * 0.16
      });
    }
  }

  return { drops, splashes };
}
