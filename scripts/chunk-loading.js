import { clamp } from "./core-utils.js";

const CHUNK_LOAD_OFFSET_CACHE = new Map();

export function getChunkLoadOffsets(radius) {
  const safeRadius = clamp(Math.floor(radius) || 0, 0, 12);
  const cached = CHUNK_LOAD_OFFSET_CACHE.get(safeRadius);
  if (cached) {
    return cached;
  }
  const offsets = [];
  for (let dx = -safeRadius; dx <= safeRadius; dx += 1) {
    for (let dz = -safeRadius; dz <= safeRadius; dz += 1) {
      offsets.push({
        dx,
        dz,
        distance: Math.max(Math.abs(dx), Math.abs(dz)) + Math.hypot(dx, dz) * 0.001
      });
    }
  }
  offsets.sort((a, b) => a.distance - b.distance);
  CHUNK_LOAD_OFFSET_CACHE.set(safeRadius, offsets);
  return offsets;
}

export function buildChunkLoadList(centerChunkX, centerChunkZ, radius) {
  return getChunkLoadOffsets(radius).map((offset) => ({
    x: centerChunkX + offset.dx,
    z: centerChunkZ + offset.dz,
    distance: offset.distance
  }));
}
