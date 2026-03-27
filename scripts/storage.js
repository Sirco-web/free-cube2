export function createStorageRuntime({
  gameStorageSlug,
  storageNamespaceVersion,
  gameExportSlug,
  gameVersion,
  worldHeight,
  chunkSize,
  maxWaterFlowLevel,
  legacySaveKeys = [],
  generateId,
  generateRandomWorldSeed,
  normalizeWorldSeed,
  clamp,
  isFluidBlock,
  usesRedstoneState,
  normalizeSerializedRedstoneState
} = {}) {
  const WORLD_EXPORT_FORMAT = gameExportSlug;
  const WORLD_EXPORT_FORMAT_VERSION = 2;
  const WORLDS_INDEX_KEY = `${gameStorageSlug}-worlds-index-v${storageNamespaceVersion}`;
  const WORLD_SAVE_PREFIX = `${gameStorageSlug}-world-save-v${storageNamespaceVersion}:`;
  const LEGACY_WORLD_INDEX_KEYS = [
    `freecube2-worlds-index-v${storageNamespaceVersion}`,
    "freecube2-worlds-index-v1"
  ];
  const LEGACY_WORLD_SAVE_PREFIXES = [
    `freecube2-world-save-v${storageNamespaceVersion}:`,
    "freecube2-world-save-v1:"
  ];
  const LEGACY_WORLD_EXPORT_FORMATS = ["freecube2-world"];
  const LEGACY_PURGE_MARKER_KEY = `${gameStorageSlug}-storage-purge-complete-v${storageNamespaceVersion}`;
  const PLAYER_USERNAME_KEY = `${gameStorageSlug}-username`;
  const LEGACY_PLAYER_USERNAME_KEYS = ["cubecraft_username"];
  const LEGACY_GLOBAL_SETTINGS_KEYS = [
    `freecube2-global-settings-v${storageNamespaceVersion}`
  ];
  const CHUNK_VOLUME = Math.max(1, Number(worldHeight) * Number(chunkSize) * Number(chunkSize));

  function encodeBase64(bytes) {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  function decodeBase64(value = "") {
    const binary = atob(String(value || ""));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function encodeChunkBlocksRle(blocks) {
    if (!(blocks instanceof Uint8Array) || blocks.length === 0) {
      return "";
    }
    const bytes = [];
    let index = 0;
    while (index < blocks.length) {
      const value = blocks[index];
      let count = 1;
      while (index + count < blocks.length && blocks[index + count] === value && count < 65535) {
        count += 1;
      }
      bytes.push((count >> 8) & 0xff, count & 0xff, value & 0xff);
      index += count;
    }
    return encodeBase64(Uint8Array.from(bytes));
  }

  function decodeChunkBlocksRle(encoded = "", expectedLength = CHUNK_VOLUME) {
    if (!encoded) {
      return null;
    }
    try {
      const source = decodeBase64(encoded);
      const blocks = new Uint8Array(expectedLength);
      let writeIndex = 0;
      for (let i = 0; i + 2 < source.length; i += 3) {
        const count = (source[i] << 8) | source[i + 1];
        const value = source[i + 2];
        blocks.fill(value, writeIndex, Math.min(expectedLength, writeIndex + count));
        writeIndex += count;
        if (writeIndex >= expectedLength) {
          break;
        }
      }
      return writeIndex === expectedLength ? blocks : null;
    } catch (error) {
      console.warn("Chunk snapshot decode failed:", error.message);
      return null;
    }
  }

  function serializeChunkSnapshots(chunkSnapshots) {
    const result = {};
    for (const [chunkKey, blocks] of chunkSnapshots || []) {
      if (!(blocks instanceof Uint8Array) || blocks.length !== CHUNK_VOLUME) {
        continue;
      }
      const encoded = encodeChunkBlocksRle(blocks);
      if (encoded) {
        result[chunkKey] = encoded;
      }
    }
    return result;
  }

  function deserializeChunkSnapshots(obj) {
    const result = new Map();
    if (!obj || typeof obj !== "object") {
      return result;
    }
    for (const [chunkKey, encoded] of Object.entries(obj)) {
      const blocks = decodeChunkBlocksRle(String(encoded || ""), CHUNK_VOLUME);
      if (blocks) {
        result.set(chunkKey, blocks);
      }
    }
    return result;
  }

  function serializeRedstoneStates(redstoneStates) {
    const result = {};
    for (const [key, state] of redstoneStates || []) {
      if (!state || typeof state !== "object") continue;
      const blockType = Number(state.blockType) || 0;
      if (!usesRedstoneState(blockType)) continue;
      result[key] = { ...state, blockType };
    }
    return result;
  }

  function deserializeRedstoneStates(obj) {
    const result = new Map();
    if (!obj || typeof obj !== "object") {
      return result;
    }
    for (const [key, state] of Object.entries(obj)) {
      if (!state || typeof state !== "object") continue;
      const blockType = Number(state.blockType) || 0;
      const normalized = normalizeSerializedRedstoneState(blockType, state);
      if (!normalized) continue;
      result.set(key, { ...normalized, blockType });
    }
    return result;
  }

  function getFirstStoredValue(keys = []) {
    try {
      for (const key of keys) {
        if (!key) continue;
        const value = localStorage.getItem(key);
        if (value != null) {
          return value;
        }
      }
    } catch (error) {
      console.warn("Storage read failed:", error.message);
    }
    return null;
  }

  function getStoredJsonValue(keys = []) {
    for (const key of keys) {
      const raw = getFirstStoredValue([key]);
      if (!raw) continue;
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn(`Storage JSON parse failed for ${key}:`, error.message);
      }
    }
    return null;
  }

  function getWorldSaveStorageKeys(worldId) {
    return [
      `${WORLD_SAVE_PREFIX}${worldId}`,
      ...LEGACY_WORLD_SAVE_PREFIXES.map((prefix) => `${prefix}${worldId}`)
    ];
  }

  function normalizeCubeCraftUsername(value, fallback = "") {
    const trimmed = String(value ?? "").replace(/\s+/g, " ").trim();
    const compact = trimmed.slice(0, 16);
    return compact || fallback;
  }

  function getStoredCubeCraftUsername() {
    try {
      return normalizeCubeCraftUsername(getFirstStoredValue([PLAYER_USERNAME_KEY, ...LEGACY_PLAYER_USERNAME_KEYS]), "");
    } catch (error) {
      console.warn("Username storage read failed:", error.message);
      return "";
    }
  }

  function setStoredCubeCraftUsername(value) {
    const normalized = normalizeCubeCraftUsername(value, "");
    if (!normalized) return "";
    try {
      localStorage.setItem(PLAYER_USERNAME_KEY, normalized);
    } catch (error) {
      console.warn("Username storage write failed:", error.message);
    }
    return normalized;
  }

  function purgeLegacySaveNamespaces() {
    try {
      if (localStorage.getItem(LEGACY_PURGE_MARKER_KEY) === "1") {
        return;
      }

      const keysToRemove = new Set([...legacySaveKeys, ...LEGACY_WORLD_INDEX_KEYS]);
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (LEGACY_WORLD_SAVE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          keysToRemove.add(key);
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
      localStorage.setItem(LEGACY_PURGE_MARKER_KEY, "1");
    } catch (error) {
      console.warn("Legacy save purge failed:", error.message);
    }
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

  function serializeFluidStates(fluidStates) {
    const result = {};
    for (const [key, state] of fluidStates || []) {
      if (!state || !isFluidBlock(state.type)) continue;
      result[key] = {
        type: Number(state.type) || 0,
        level: clamp(Math.floor(Number(state.level) || 0), 0, maxWaterFlowLevel),
        source: !!state.source,
        falling: !!state.falling
      };
    }
    return result;
  }

  function deserializeFluidStates(obj) {
    const result = new Map();
    if (!obj || typeof obj !== "object") {
      return result;
    }
    for (const [key, state] of Object.entries(obj)) {
      if (!state || typeof state !== "object") continue;
      const type = Number(state.type) || 0;
      if (!isFluidBlock(type)) continue;
      result.set(key, {
        type,
        level: clamp(Math.floor(Number(state.level) || 0), 0, maxWaterFlowLevel),
        source: !!state.source,
        falling: !!state.falling
      });
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
      purgeLegacySaveNamespaces();
      const parsed = getStoredJsonValue([WORLDS_INDEX_KEY, ...LEGACY_WORLD_INDEX_KEYS]);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.worlds)) {
        this.index = parsed;
        return this.index;
      }
      this.index = { version: storageNamespaceVersion, worlds: [], selectedWorldId: null };
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

    migrateLegacySave() {}

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
      this.saveWorld(worldId, { seed: meta.seed, modifiedChunks: {}, fluidStates: {}, player: null, worldState: null });
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
        for (const key of getWorldSaveStorageKeys(worldId)) {
          localStorage.removeItem(key);
        }
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
      const parsed = getStoredJsonValue(getWorldSaveStorageKeys(worldId));
      return parsed && typeof parsed === "object" ? parsed : null;
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

    exportWorld(worldId) {
      const meta = this.getWorldMeta(worldId);
      const save = this.loadWorld(worldId);
      if (!meta || !save) {
        return null;
      }
      return {
        format: WORLD_EXPORT_FORMAT,
        formatVersion: WORLD_EXPORT_FORMAT_VERSION,
        gameVersion,
        exportedAt: Date.now(),
        meta: {
          name: meta.name,
          seed: meta.seed,
          createdAt: meta.createdAt || Date.now(),
          updatedAt: meta.updatedAt || Date.now(),
          lastPlayedAt: meta.lastPlayedAt || null
        },
        payload: {
          version: save.version || gameVersion,
        seed: normalizeWorldSeed(save.seed ?? meta.seed, meta.seed),
        chunkSnapshots: save.chunkSnapshots && typeof save.chunkSnapshots === "object" ? save.chunkSnapshots : {},
        modifiedChunks: save.modifiedChunks && typeof save.modifiedChunks === "object" ? save.modifiedChunks : {},
        fluidStates: save.fluidStates && typeof save.fluidStates === "object" ? save.fluidStates : {},
        furnaces: save.furnaces && typeof save.furnaces === "object" ? save.furnaces : {},
          player: save.player && typeof save.player === "object" ? save.player : null,
          worldState: save.worldState && typeof save.worldState === "object" ? save.worldState : null
        }
      };
    }

    importWorld(data, { select = true } = {}) {
      if (!data || typeof data !== "object") {
        return null;
      }
      if (data.format && data.format !== WORLD_EXPORT_FORMAT && !LEGACY_WORLD_EXPORT_FORMATS.includes(String(data.format))) {
        return null;
      }

      const exportedMeta = data.meta && typeof data.meta === "object" ? data.meta : {};
      const payloadCandidate = data.payload && typeof data.payload === "object"
        ? data.payload
        : (data.modifiedChunks || data.fluidStates || data.player || data.settings || data.furnaces || data.seed ? data : null);
      if (!payloadCandidate || typeof payloadCandidate !== "object") {
        return null;
      }

      const seed = normalizeWorldSeed(payloadCandidate.seed ?? exportedMeta.seed, generateRandomWorldSeed());
      const name = String(exportedMeta.name || "Imported World").trim() || "Imported World";
      const worldId = this.createWorld({ name, seed, select });
      const meta = this.getWorldMeta(worldId);
      if (meta) {
        meta.createdAt = Number.isFinite(exportedMeta.createdAt) ? exportedMeta.createdAt : meta.createdAt;
        meta.updatedAt = Date.now();
        meta.lastPlayedAt = null;
        this.saveIndex();
      }

      this.saveWorld(worldId, {
        version: payloadCandidate.version || data.gameVersion || gameVersion,
        seed,
        chunkSnapshots: payloadCandidate.chunkSnapshots && typeof payloadCandidate.chunkSnapshots === "object" ? payloadCandidate.chunkSnapshots : {},
        modifiedChunks: payloadCandidate.modifiedChunks && typeof payloadCandidate.modifiedChunks === "object" ? payloadCandidate.modifiedChunks : {},
        fluidStates: payloadCandidate.fluidStates && typeof payloadCandidate.fluidStates === "object" ? payloadCandidate.fluidStates : {},
        furnaces: payloadCandidate.furnaces && typeof payloadCandidate.furnaces === "object" ? payloadCandidate.furnaces : {},
        player: payloadCandidate.player && typeof payloadCandidate.player === "object" ? payloadCandidate.player : null,
        worldState: payloadCandidate.worldState && typeof payloadCandidate.worldState === "object" ? payloadCandidate.worldState : null
      });
      return worldId;
    }
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

  return {
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
  };
}
