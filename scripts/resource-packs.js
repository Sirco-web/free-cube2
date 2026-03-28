export function normalizeAssetPath(path) {
  if (typeof path !== "string" || !path) {
    return path;
  }
  if (/^(data:|blob:|https?:|\.\/|\.\.\/)/i.test(path)) {
    return path;
  }
  return `./${path.replace(/^\/+/, "")}`;
}

export function createResourcePackSupport({
  gameTitle,
  defaultSettings,
  block,
  item,
  blockInfo,
  blockTexturePaths,
  texturePacks,
  itemTextureSources,
  specialTextureSources
}) {
  const RESOURCE_PACK_META = {
    default: {
      name: "Default",
      description: `The default look and feel of ${gameTitle}.`,
      iconBlock: block.GRASS
    },
    gigantopack32: {
      name: "Gigantopack 32",
      description: "Sharper 32px textures for a cleaner, richer block look.",
      iconBlock: block.STONE
    },
    "mcassets-online": {
      name: "Online Resource Pack",
      description: "Downloads Minecraft textures from mc-assets the first time you use it. Internet required.",
      iconBlock: block.GRASS
    }
  };

  const CUSTOM_RESOURCE_PACK_PREFIX = "custom:";
  const MC_ASSETS_ONLINE_PACK_ID = "mcassets-online";
  const MC_ASSETS_ONLINE_VERSION = "0.2.74";
  const MC_ASSETS_ONLINE_BASE_URL = `https://unpkg.com/mc-assets@${MC_ASSETS_ONLINE_VERSION}/dist`;
  const ONLINE_RESOURCE_PACK_IDS = new Set([MC_ASSETS_ONLINE_PACK_ID]);

  const {
    torchTextureSource,
    whiteWoolTextureSource,
    bedTopTextureSource,
    bedSideTextureSource,
    bedBottomTextureSource,
    redstoneWireTextureSource,
    leverTextureSource,
    redstoneTorchTextureSource,
    repeaterTextureSource,
    pistonTextureSource,
    stickyPistonTextureSource,
    pistonHeadTextureSource
  } = specialTextureSources;

  const mcAssetsOnlineBlockTextureMap = [
    { path: "assets/PNG/Tiles/grass_top.png", atlas: "blocks", texture: "grass_block_top" },
    { path: "assets/PNG/Tiles/dirt_grass.png", atlas: "blocks", texture: "grass_block_side" },
    { path: "assets/PNG/Tiles/dirt.png", atlas: "blocks", texture: "dirt" },
    { path: "assets/PNG/Tiles/stone.png", atlas: "blocks", texture: "stone" },
    { path: "assets/PNG/Tiles/trunk_top.png", atlas: "blocks", texture: "oak_log_top" },
    { path: "assets/PNG/Tiles/trunk_side.png", atlas: "blocks", texture: "oak_log" },
    { path: "assets/32px Seamless MC Texture Gigantopack/all textures/leaves_oak_opaque.png", atlas: "blocks", texture: "oak_leaves" },
    { path: "assets/PNG/Tiles/water.png", atlas: "blocks", texture: "water_still" },
    { path: "assets/PNG/Tiles/lava.png", atlas: "blocks", texture: "lava_still" },
    { path: "assets/PNG/Tiles/sand.png", atlas: "blocks", texture: "sand" },
    { path: "assets/PNG/Tiles/wood.png", atlas: "blocks", texture: "oak_planks" },
    { path: "assets/PNG/Tiles/brick_red.png", atlas: "blocks", texture: "bricks" },
    { path: "assets/PNG/Tiles/greystone.png", atlas: "blocks", texture: "bedrock" },
    { path: "assets/PNG/Tiles/glass.png", atlas: "blocks", texture: "glass" },
    { path: "assets/PNG/Tiles/stone_coal.png", atlas: "blocks", texture: "coal_ore" },
    { path: "assets/PNG/Tiles/stone_iron.png", atlas: "blocks", texture: "iron_ore" },
    { path: "assets/PNG/Tiles/stone_gold.png", atlas: "blocks", texture: "gold_ore" },
    { path: "assets/PNG/Tiles/stone_diamond.png", atlas: "blocks", texture: "diamond_ore" },
    { path: "assets/PNG/Tiles/redstone.png", atlas: "blocks", texture: "redstone_ore" },
    { path: "assets/PNG/Tiles/redstone_emerald.png", atlas: "blocks", texture: "emerald_ore" },
    { path: "assets/PNG/Tiles/gravel_stone.png", atlas: "blocks", texture: "cobblestone" },
    { path: "assets/32px Seamless MC Texture Gigantopack/all textures/obsidian.png", atlas: "blocks", texture: "obsidian" },
    { path: torchTextureSource, atlas: "blocks", texture: "torch" },
    { path: whiteWoolTextureSource, atlas: "blocks", texture: "white_wool" },
    { path: bedTopTextureSource, atlas: "blocks", texture: "bed_head_top" },
    { path: bedSideTextureSource, atlas: "blocks", texture: "bed_head_side" },
    { path: bedBottomTextureSource, atlas: "blocks", texture: "oak_planks" },
    { path: redstoneWireTextureSource, atlas: "blocks", texture: "redstone_dust_dot" },
    { path: leverTextureSource, atlas: "blocks", texture: "lever" },
    { path: redstoneTorchTextureSource, atlas: "blocks", texture: "redstone_torch" },
    { path: repeaterTextureSource, atlas: "blocks", texture: "repeater" },
    { path: pistonTextureSource, atlas: "blocks", texture: "piston_top_normal" },
    { path: stickyPistonTextureSource, atlas: "blocks", texture: "piston_top_sticky" },
    { path: pistonHeadTextureSource, atlas: "blocks", texture: "piston_inner" },
    { path: "assets/online/mc-assets/blocks/crafting_table_top.png", atlas: "blocks", texture: "crafting_table_top" },
    { path: "assets/online/mc-assets/blocks/crafting_table_side.png", atlas: "blocks", texture: "crafting_table_side" },
    { path: "assets/online/mc-assets/blocks/oak_planks.png", atlas: "blocks", texture: "oak_planks" },
    { path: "assets/online/mc-assets/blocks/furnace_top.png", atlas: "blocks", texture: "furnace_top" },
    { path: "assets/online/mc-assets/blocks/furnace_side.png", atlas: "blocks", texture: "furnace_side" },
    { path: "assets/online/mc-assets/blocks/furnace_front.png", atlas: "blocks", texture: "furnace_front_off" },
    { path: "assets/online/mc-assets/blocks/bed_top.png", atlas: "blocks", texture: "bed_head_top" },
    { path: "assets/online/mc-assets/blocks/bed_side.png", atlas: "blocks", texture: "bed_head_side" },
    { path: "assets/online/mc-assets/blocks/bed_bottom.png", atlas: "blocks", texture: "oak_planks" },
    { path: "assets/online/mc-assets/blocks/piston_top.png", atlas: "blocks", texture: "piston_top_normal" },
    { path: "assets/online/mc-assets/blocks/sticky_piston_top.png", atlas: "blocks", texture: "piston_top_sticky" },
    { path: "assets/online/mc-assets/blocks/piston_side.png", atlas: "blocks", texture: "piston_side" },
    { path: "assets/online/mc-assets/blocks/piston_bottom.png", atlas: "blocks", texture: "piston_bottom" },
    { path: "assets/online/mc-assets/blocks/piston_inner.png", atlas: "blocks", texture: "piston_inner" },
    { path: "assets/online/mc-assets/blocks/piston_head_top.png", atlas: "blocks", texture: "piston_top_normal" }
  ];

  const mcAssetsOnlineItemTextureMap = [
    { path: itemTextureSources[item.STICK], atlas: "items", texture: "stick" },
    { path: itemTextureSources[item.WOODEN_PICKAXE], atlas: "items", texture: "wooden_pickaxe" },
    { path: itemTextureSources[item.WOODEN_AXE], atlas: "items", texture: "wooden_axe" },
    { path: itemTextureSources[item.WOODEN_SHOVEL], atlas: "items", texture: "wooden_shovel" },
    { path: itemTextureSources[item.WOODEN_SWORD], atlas: "items", texture: "wooden_sword" },
    { path: itemTextureSources[item.WOODEN_HOE], atlas: "items", texture: "wooden_hoe" },
    { path: itemTextureSources[item.LEATHER_HELMET], atlas: "items", texture: "leather_helmet" },
    { path: itemTextureSources[item.LEATHER_CHESTPLATE], atlas: "items", texture: "leather_chestplate" },
    { path: itemTextureSources[item.LEATHER_LEGGINGS], atlas: "items", texture: "leather_leggings" },
    { path: itemTextureSources[item.LEATHER_BOOTS], atlas: "items", texture: "leather_boots" },
    { path: itemTextureSources[item.IRON_HELMET], atlas: "items", texture: "iron_helmet" },
    { path: itemTextureSources[item.IRON_CHESTPLATE], atlas: "items", texture: "iron_chestplate" },
    { path: itemTextureSources[item.IRON_LEGGINGS], atlas: "items", texture: "iron_leggings" },
    { path: itemTextureSources[item.IRON_BOOTS], atlas: "items", texture: "iron_boots" },
    { path: itemTextureSources[item.RAW_CHICKEN], atlas: "items", texture: "chicken" },
    { path: itemTextureSources[item.COOKED_CHICKEN], atlas: "items", texture: "cooked_chicken" },
    { path: itemTextureSources[item.RAW_MUTTON], atlas: "items", texture: "mutton" },
    { path: itemTextureSources[item.COOKED_MUTTON], atlas: "items", texture: "cooked_mutton" },
    { path: itemTextureSources[item.ROTTEN_FLESH], atlas: "items", texture: "rotten_flesh" },
    { path: itemTextureSources[item.COAL], atlas: "items", texture: "coal" },
    { path: itemTextureSources[item.DIAMOND], atlas: "items", texture: "diamond" },
    { path: itemTextureSources[item.EMERALD], atlas: "items", texture: "emerald" },
    { path: itemTextureSources[item.IRON_INGOT], atlas: "items", texture: "iron_ingot" },
    { path: itemTextureSources[item.GOLD_INGOT], atlas: "items", texture: "gold_ingot" },
    { path: itemTextureSources[item.IRON_PICKAXE], atlas: "items", texture: "iron_pickaxe" },
    { path: itemTextureSources[item.IRON_AXE], atlas: "items", texture: "iron_axe" },
    { path: itemTextureSources[item.IRON_SHOVEL], atlas: "items", texture: "iron_shovel" },
    { path: itemTextureSources[item.IRON_SWORD], atlas: "items", texture: "iron_sword" },
    { path: itemTextureSources[item.IRON_HOE], atlas: "items", texture: "iron_hoe" },
    { path: itemTextureSources[item.DIAMOND_PICKAXE], atlas: "items", texture: "diamond_pickaxe" },
    { path: itemTextureSources[item.DIAMOND_AXE], atlas: "items", texture: "diamond_axe" },
    { path: itemTextureSources[item.DIAMOND_SHOVEL], atlas: "items", texture: "diamond_shovel" },
    { path: itemTextureSources[item.DIAMOND_SWORD], atlas: "items", texture: "diamond_sword" },
    { path: itemTextureSources[item.DIAMOND_HOE], atlas: "items", texture: "diamond_hoe" },
    { path: itemTextureSources[item.REDSTONE_DUST], atlas: "items", texture: "redstone" }
  ];

  function isCustomResourcePackId(packName) {
    return typeof packName === "string" && packName.startsWith(CUSTOM_RESOURCE_PACK_PREFIX);
  }

  function getCustomResourcePacks(settingsState = defaultSettings) {
    return Array.isArray(settingsState?.customResourcePacks)
      ? settingsState.customResourcePacks.filter((pack) => pack && typeof pack === "object" && typeof pack.id === "string")
      : [];
  }

  function getCustomResourcePack(settingsState = defaultSettings, packId = settingsState?.texturePack) {
    if (typeof packId !== "string" || !packId) {
      return null;
    }
    return getCustomResourcePacks(settingsState).find((pack) => pack.id === packId) || null;
  }

  function getAvailableResourcePackNames(settingsState = defaultSettings) {
    const packNames = new Set(Object.keys(RESOURCE_PACK_META));
    for (const pack of getCustomResourcePacks(settingsState)) {
      packNames.add(pack.id);
    }
    return Array.from(packNames);
  }

  function resolveResourcePackAsset(path, settingsState = defaultSettings) {
    const normalized = normalizeAssetPath(path);
    const customPack = getCustomResourcePack(settingsState);
    if (customPack?.assets && typeof customPack.assets === "object") {
      const override = customPack.assets[normalized];
      if (typeof override === "string" && override) {
        return override;
      }
    }
    return normalized;
  }

  function getBlockTextureEntry(blockType, settingsState = defaultSettings) {
    const packName = settingsState?.texturePack || defaultSettings.texturePack;
    const packReady = !ONLINE_RESOURCE_PACK_IDS.has(packName) || !!getCustomResourcePack(settingsState, packName);
    const override = packReady ? texturePacks[packName]?.[blockType] : null;
    return override || blockTexturePaths[blockType] || null;
  }

  function getBlockTextureCandidates(blockType, faceId, settingsState = defaultSettings) {
    const candidates = [];
    const add = (path) => {
      if (typeof path === "string" && path && !candidates.includes(path)) {
        candidates.push(path);
      }
    };

    const entry = getBlockTextureEntry(blockType, settingsState);
    if (entry) {
      const rawPath = faceId === "top" ? entry.top : faceId === "bottom" ? entry.bottom : entry.side;
      add(resolveResourcePackAsset(rawPath, settingsState));
      add(normalizeAssetPath(rawPath));
    }

    const builtinEntry = blockTexturePaths[blockType];
    if (builtinEntry) {
      const rawPath = faceId === "top" ? builtinEntry.top : faceId === "bottom" ? builtinEntry.bottom : builtinEntry.side;
      add(normalizeAssetPath(rawPath));
    }

    return candidates;
  }

  function getBlockTexturePath(blockType, faceId, settingsState = defaultSettings) {
    return getBlockTextureCandidates(blockType, faceId, settingsState)[0] || null;
  }

  function getAllBlockTexturePaths(settingsState = defaultSettings) {
    const paths = new Set();
    for (const blockType of Object.keys(blockInfo).map(Number)) {
      if (!Number.isFinite(blockType) || blockType === block.AIR) continue;
      for (const faceId of ["top", "side", "bottom"]) {
        for (const path of getBlockTextureCandidates(blockType, faceId, settingsState)) {
          if (path) {
            paths.add(path);
          }
        }
      }
    }
    return Array.from(paths);
  }

  function getResourcePackMeta(packName, settingsState = defaultSettings) {
    const customPack = getCustomResourcePack(settingsState, packName);
    if (customPack) {
      return {
        name: customPack.name || "Custom Pack",
        description: customPack.description || "Imported custom textures, sounds, and mob assets.",
        iconBlock: customPack.iconBlock || block.GRASS
      };
    }
    return RESOURCE_PACK_META[packName] || {
      name: packName === "default" ? "Default" : String(packName || "Unknown Pack"),
      description: "Built-in resource pack.",
      iconBlock: block.GRASS
    };
  }

  return {
    RESOURCE_PACK_META,
    CUSTOM_RESOURCE_PACK_PREFIX,
    MC_ASSETS_ONLINE_PACK_ID,
    MC_ASSETS_ONLINE_VERSION,
    MC_ASSETS_ONLINE_BASE_URL,
    ONLINE_RESOURCE_PACK_IDS,
    mcAssetsOnlineBlockTextureMap,
    mcAssetsOnlineItemTextureMap,
    isCustomResourcePackId,
    getCustomResourcePacks,
    getCustomResourcePack,
    getAvailableResourcePackNames,
    resolveResourcePackAsset,
    getBlockTextureEntry,
    getBlockTextureCandidates,
    getBlockTexturePath,
    getAllBlockTexturePaths,
    getResourcePackMeta
  };
}

export function createResourcePackRuntime({
  support,
  engine,
  block,
  defaultSettings,
  blockTexturePaths,
  entityTextureFilePaths,
  settingsRef,
  uiRef,
  modeRef,
  useWebGLRef,
  texturesRef,
  entityTexturesRef,
  atlasRef,
  glRendererRef,
  canvasRendererRef,
  ensureUI,
  saveGlobalSettings,
  setHotbarImages,
  invalidateAllChunkMeshes,
  pushToast,
  setSettingsUI
}) {
  let onlineResourcePackLoadPromise = null;

  const {
    MC_ASSETS_ONLINE_PACK_ID,
    MC_ASSETS_ONLINE_BASE_URL,
    mcAssetsOnlineBlockTextureMap,
    mcAssetsOnlineItemTextureMap,
    getAvailableResourcePackNames,
    getCustomResourcePack,
    getCustomResourcePacks,
    getResourcePackMeta,
    getBlockTexturePath
  } = support;

  const getSettings = () => settingsRef();
  const getUi = () => uiRef();

  function renderResourcePackEntry(packName, selected = false) {
    const settings = getSettings();
    const meta = getResourcePackMeta(packName, settings);
    const customPack = getCustomResourcePack(settings, packName);
    const entry = document.createElement("div");
    entry.className = `fc-pack-entry${selected ? " selected" : ""}`;
    entry.dataset.packId = packName;
    if (!selected) {
      entry.dataset.packSelect = packName;
    }

    const icon = document.createElement("img");
    icon.className = "fc-pack-icon";
    icon.alt = meta.name;
    icon.src = customPack?.iconDataUrl
      || getBlockTexturePath(meta.iconBlock || block.GRASS, "top", { ...settings, texturePack: packName })
      || getBlockTexturePath(block.GRASS, "top", defaultSettings);
    entry.appendChild(icon);

    const copy = document.createElement("div");
    copy.className = "fc-pack-copy";
    copy.innerHTML = `<div class="fc-pack-name">${meta.name}</div><div class="fc-pack-desc">${meta.description}</div>`;
    entry.appendChild(copy);
    return entry;
  }

  function renderResourcePackUI() {
    ensureUI();
    const ui = getUi();
    const settings = getSettings();
    const selectedPack = getAvailableResourcePackNames(settings).includes(settings.texturePack) ? settings.texturePack : defaultSettings.texturePack;
    const packNames = getAvailableResourcePackNames(settings);

    ui.resourcePackAvailableEl.innerHTML = "";
    ui.resourcePackSelectedEl.innerHTML = "";
    ui.resourcePackSelectedEl.appendChild(renderResourcePackEntry(selectedPack, true));

    const available = packNames.filter((name) => name !== selectedPack);
    if (available.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fc-pack-empty";
      empty.textContent = "No other packs imported yet.";
      ui.resourcePackAvailableEl.appendChild(empty);
    } else {
      for (const packName of available) {
        ui.resourcePackAvailableEl.appendChild(renderResourcePackEntry(packName, false));
      }
    }
  }

  function upsertCachedResourcePack(pack) {
    if (!pack || typeof pack.id !== "string") {
      return null;
    }
    const settings = getSettings();
    settings.customResourcePacks = [
      ...getCustomResourcePacks(settings).filter((existing) => existing.id !== pack.id),
      pack
    ];
    return pack;
  }

  function applyTexturePackSetting() {
    const settings = getSettings();
    const finishApply = () => {
      const textures = texturesRef();
      const entityTextures = entityTexturesRef();
      const atlas = atlasRef();
      const canvasRenderer = canvasRendererRef();
      const ui = getUi();

      if (textures) {
        textures.settings = settings;
      }
      if (entityTextures) {
        entityTextures.settings = settings;
      }
      if (atlas) {
        atlas.settings = settings;
        atlas.build().catch((error) => console.warn("Atlas rebuild failed:", error.message));
      }
      setHotbarImages();
      if (useWebGLRef() && glRendererRef()) {
        invalidateAllChunkMeshes();
      } else if (canvasRenderer) {
        canvasRenderer.setSettings(settings);
      }
      if (ui?.resourcePackCurrentEl) {
        ui.resourcePackCurrentEl.textContent = `Current: ${getResourcePackMeta(settings.texturePack, settings).name}`;
      }
      if (ui?.resourcePackAvailableEl && ui?.resourcePackSelectedEl) {
        renderResourcePackUI();
      }
      saveGlobalSettings();
    };

    if (settings.texturePack === MC_ASSETS_ONLINE_PACK_ID) {
      const ui = getUi();
      if (ui?.resourcePackCurrentEl) {
        ui.resourcePackCurrentEl.textContent = "Current: Loading Online Resource Pack...";
      }
      ensureOnlineResourcePackLoaded()
        .then(() => {
          finishApply();
        })
        .catch((error) => {
          console.warn("Online resource pack failed:", error.message);
          settings.texturePack = defaultSettings.texturePack;
          finishApply();
          pushToast("Online resource pack failed", error.message, 5, "bad");
          if (modeRef() === "menu") {
            alert(`Online resource pack failed.\n\n${error.message}`);
          }
        });
      return;
    }
    finishApply();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read ${file?.name || "file"}.`));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  function normalizeResourcePackRelativePath(relativePath = "") {
    const cleaned = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!cleaned) return "";
    const parts = cleaned.split("/").filter(Boolean);
    const assetsIndex = parts.findIndex((part) => part.toLowerCase() === "assets");
    if (assetsIndex >= 0) {
      return normalizeAssetPath(parts.slice(assetsIndex).join("/"));
    }
    if (parts.length > 1 && /^pack\.(json|mcmeta)$/i.test(parts[1])) {
      return normalizeAssetPath(parts.slice(1).join("/"));
    }
    return normalizeAssetPath(cleaned);
  }

  function getMimeTypeForPath(path = "") {
    const lowerPath = String(path || "").toLowerCase();
    if (lowerPath.endsWith(".png")) return "image/png";
    if (lowerPath.endsWith(".webp")) return "image/webp";
    if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg";
    if (lowerPath.endsWith(".svg")) return "image/svg+xml";
    if (lowerPath.endsWith(".gif")) return "image/gif";
    if (lowerPath.endsWith(".ogg")) return "audio/ogg";
    if (lowerPath.endsWith(".wav")) return "audio/wav";
    if (lowerPath.endsWith(".mp3")) return "audio/mpeg";
    if (lowerPath.endsWith(".json") || lowerPath.endsWith(".mcmeta")) return "application/json";
    if (lowerPath.endsWith(".txt") || lowerPath.endsWith(".obj")) return "text/plain";
    return "application/octet-stream";
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not encode imported resource-pack asset."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchOnlineResourcePackJson(url) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Could not download ${url}.`);
    }
    return response.json();
  }

  async function fetchOnlineResourcePackImage(url) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Could not download ${url}.`);
    }
    const dataUrl = await blobToDataUrl(await response.blob());
    return {
      dataUrl,
      image: await engine.resources.loadImage(dataUrl)
    };
  }

  function createAtlasTextureDataUrl(atlas, textureName, cache) {
    const cacheKey = `${atlas.kind}:${textureName}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const info = atlas.meta?.textures?.[textureName];
    if (!info) {
      throw new Error(`Missing mc-assets texture: ${textureName}`);
    }
    const tileRatio = Number(atlas.meta?.suSv) || (1 / 16);
    const sourceWidth = Math.max(1, Math.round(atlas.image.width * tileRatio));
    const sourceHeight = Math.max(1, Math.round(atlas.image.height * tileRatio));
    const sourceX = Math.max(0, Math.round((Number(info.u) || 0) * atlas.image.width));
    const sourceY = Math.max(0, Math.round((Number(info.v) || 0) * atlas.image.height));
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create the online resource-pack canvas.");
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    cache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  async function buildOnlineMcAssetsResourcePack() {
    const [blocksMeta, itemsMeta, blocksAtlasImage, itemsAtlasImage] = await Promise.all([
      fetchOnlineResourcePackJson(`${MC_ASSETS_ONLINE_BASE_URL}/blocksAtlases.json`),
      fetchOnlineResourcePackJson(`${MC_ASSETS_ONLINE_BASE_URL}/itemsAtlases.json`),
      fetchOnlineResourcePackImage(`${MC_ASSETS_ONLINE_BASE_URL}/blocksAtlasLatest.png`),
      fetchOnlineResourcePackImage(`${MC_ASSETS_ONLINE_BASE_URL}/itemsAtlasLatest.png`)
    ]);
    const atlases = {
      blocks: {
        kind: "blocks",
        meta: blocksMeta?.latest || blocksMeta,
        image: blocksAtlasImage.image
      },
      items: {
        kind: "items",
        meta: itemsMeta?.latest || itemsMeta,
        image: itemsAtlasImage.image
      }
    };
    const textureCache = new Map();
    const assets = {};
    const mappings = [...mcAssetsOnlineBlockTextureMap, ...mcAssetsOnlineItemTextureMap];
    for (const mapping of mappings) {
      const atlas = atlases[mapping.atlas];
      const dataUrl = createAtlasTextureDataUrl(atlas, mapping.texture, textureCache);
      assets[normalizeAssetPath(mapping.path)] = dataUrl;
    }
    return {
      id: MC_ASSETS_ONLINE_PACK_ID,
      name: support.RESOURCE_PACK_META[MC_ASSETS_ONLINE_PACK_ID].name,
      description: support.RESOURCE_PACK_META[MC_ASSETS_ONLINE_PACK_ID].description,
      iconBlock: block.GRASS,
      iconDataUrl: assets[normalizeAssetPath("assets/PNG/Tiles/grass_top.png")] || "",
      assets
    };
  }

  async function ensureOnlineResourcePackLoaded(packId = getSettings().texturePack) {
    if (packId !== MC_ASSETS_ONLINE_PACK_ID) {
      return getCustomResourcePack(getSettings(), packId);
    }
    const cached = getCustomResourcePack(getSettings(), packId);
    if (cached?.assets && Object.keys(cached.assets).length >= 20) {
      return cached;
    }
    if (onlineResourcePackLoadPromise) {
      return onlineResourcePackLoadPromise;
    }
    onlineResourcePackLoadPromise = buildOnlineMcAssetsResourcePack()
      .then(async (pack) => {
        upsertCachedResourcePack(pack);
        await preloadCustomResourcePackAssets(pack);
        return pack;
      })
      .finally(() => {
        onlineResourcePackLoadPromise = null;
      });
    return onlineResourcePackLoadPromise;
  }

  function decodeZipEntryName(bytes) {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      let fallback = "";
      for (const byte of bytes) {
        fallback += String.fromCharCode(byte);
      }
      return fallback;
    }
  }

  async function inflateZipBytes(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser does not support ZIP resource-pack importing yet.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const inflated = await new Response(stream).arrayBuffer();
    return new Uint8Array(inflated);
  }

  async function extractZipEntries(file) {
    const archiveBuffer = await file.arrayBuffer();
    const view = new DataView(archiveBuffer);
    const bytes = new Uint8Array(archiveBuffer);
    const EOCD_SIGNATURE = 0x06054b50;
    const CENTRAL_SIGNATURE = 0x02014b50;
    const LOCAL_SIGNATURE = 0x04034b50;
    let eocdOffset = -1;
    const searchStart = Math.max(0, view.byteLength - 0xffff - 22);

    for (let offset = view.byteLength - 22; offset >= searchStart; offset -= 1) {
      if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
        eocdOffset = offset;
        break;
      }
    }

    if (eocdOffset < 0) {
      throw new Error("That ZIP file is missing a valid central directory.");
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    const entries = [];
    let cursor = centralDirectoryOffset;

    for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
      if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
        throw new Error("That ZIP file has an invalid central directory entry.");
      }

      const compressionMethod = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localHeaderOffset = view.getUint32(cursor + 42, true);
      const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength);
      const relativePath = decodeZipEntryName(nameBytes).replace(/\\/g, "/");
      cursor += 46 + nameLength + extraLength + commentLength;

      if (!relativePath || relativePath.endsWith("/")) {
        continue;
      }
      if (view.getUint32(localHeaderOffset, true) !== LOCAL_SIGNATURE) {
        throw new Error(`ZIP entry "${relativePath}" has an invalid local header.`);
      }

      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);

      let fileBytes = null;
      if (compressionMethod === 0) {
        fileBytes = compressedBytes;
      } else if (compressionMethod === 8) {
        fileBytes = await inflateZipBytes(compressedBytes);
      } else {
        throw new Error(`ZIP entry "${relativePath}" uses unsupported compression method ${compressionMethod}.`);
      }

      entries.push({ relativePath, bytes: fileBytes });
    }

    return entries;
  }

  function parseResourcePackMetadata(rawMeta, fallbackName) {
    if (!rawMeta || typeof rawMeta !== "object") {
      return {
        name: fallbackName,
        description: "Imported custom pack."
      };
    }
    const packSection = rawMeta.pack && typeof rawMeta.pack === "object" ? rawMeta.pack : null;
    const descriptionValue = packSection?.description ?? rawMeta.description;
    let description = "Imported custom pack.";
    if (typeof descriptionValue === "string") {
      description = descriptionValue.trim() || description;
    } else if (descriptionValue && typeof descriptionValue === "object") {
      description = String(descriptionValue.text || descriptionValue.translate || description).trim() || description;
    }
    return {
      name: String(rawMeta.name || fallbackName).trim() || fallbackName,
      description
    };
  }

  function inferIconBlockFromAssets(assets = {}) {
    const entries = Object.entries(blockTexturePaths);
    for (const [blockId, faces] of entries) {
      for (const sourcePath of Object.values(faces || {})) {
        if (assets[normalizeAssetPath(sourcePath)]) {
          return Number(blockId);
        }
      }
    }
    return block.GRASS;
  }

  async function importResourcePackEntries(entries, defaultNameHint = "") {
    const settings = getSettings();
    const normalizedEntries = Array.from(entries || []).filter((entry) => entry && typeof entry.relativePath === "string");
    if (normalizedEntries.length === 0) {
      throw new Error("Choose a resource pack first.");
    }

    let packMeta = null;
    let packIconDataUrl = "";
    const assets = {};
    let rootFolderName = "";

    for (const entry of normalizedEntries) {
      const relativePath = String(entry.relativePath || "");
      if (!rootFolderName && relativePath) {
        rootFolderName = relativePath.split("/").filter(Boolean)[0] || "";
      }
      const normalizedPath = normalizeResourcePackRelativePath(relativePath);
      if (!normalizedPath) continue;

      const lowerNormalizedPath = normalizedPath.toLowerCase();
      if (lowerNormalizedPath.endsWith("/pack.json") || lowerNormalizedPath === "./pack.json" || lowerNormalizedPath.endsWith("/pack.mcmeta") || lowerNormalizedPath === "./pack.mcmeta") {
        try {
          const text = typeof entry.text === "string"
            ? entry.text
            : entry.file
              ? await entry.file.text()
              : new TextDecoder("utf-8").decode(entry.bytes || new Uint8Array());
          packMeta = JSON.parse(text);
        } catch (error) {
          console.warn("Custom pack metadata parse failed:", error.message);
        }
        continue;
      }

      if (lowerNormalizedPath.endsWith("/pack.png") || lowerNormalizedPath === "./pack.png") {
        if (typeof entry.dataUrl === "string" && entry.dataUrl) {
          packIconDataUrl = entry.dataUrl;
        } else if (entry.file) {
          packIconDataUrl = await readFileAsDataUrl(entry.file);
        } else if (entry.bytes instanceof Uint8Array) {
          packIconDataUrl = await blobToDataUrl(new Blob([entry.bytes], { type: getMimeTypeForPath(relativePath) }));
        }
        continue;
      }

      if (typeof entry.dataUrl === "string" && entry.dataUrl) {
        assets[normalizedPath] = entry.dataUrl;
      } else if (entry.file) {
        assets[normalizedPath] = await readFileAsDataUrl(entry.file);
      } else if (entry.bytes instanceof Uint8Array) {
        assets[normalizedPath] = await blobToDataUrl(new Blob([entry.bytes], { type: getMimeTypeForPath(relativePath) }));
      }
    }

    const defaultName = defaultNameHint || rootFolderName || `Custom Pack ${getCustomResourcePacks(settings).length + 1}`;
    const meta = parseResourcePackMetadata(packMeta, defaultName);
    const packIdBase = meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || crypto.randomUUID?.() || String(Date.now());
    let packId = `${support.CUSTOM_RESOURCE_PACK_PREFIX}${packIdBase}`;
    let duplicateIndex = 2;
    const existingIds = new Set(getCustomResourcePacks(settings).map((existing) => existing.id));
    while (existingIds.has(packId)) {
      packId = `${support.CUSTOM_RESOURCE_PACK_PREFIX}${packIdBase}-${duplicateIndex}`;
      duplicateIndex += 1;
    }
    const pack = {
      id: packId,
      name: meta.name,
      description: meta.description,
      iconBlock: Number.isFinite(packMeta?.iconBlock) ? Number(packMeta.iconBlock) : inferIconBlockFromAssets(assets),
      iconDataUrl: packIconDataUrl,
      assets
    };

    settings.customResourcePacks = [
      ...getCustomResourcePacks(settings).filter((existing) => existing.id !== pack.id),
      pack
    ];
    settings.texturePack = pack.id;
    await preloadCustomResourcePackAssets(pack);
    applyTexturePackSetting();
    saveGlobalSettings();
    setSettingsUI();
  }

  async function preloadCustomResourcePackAssets(pack) {
    if (!pack?.assets) return;
    const textures = texturesRef();
    const entityTextures = entityTexturesRef();
    const imageTasks = [];
    for (const [path, dataUrl] of Object.entries(pack.assets)) {
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        continue;
      }
      imageTasks.push(
        engine.resources.loadImage(dataUrl)
          .then((image) => {
            textures?.images?.set?.(dataUrl, image);
            const match = Object.entries(entityTextureFilePaths).find(([, entityPath]) => entityPath === path);
            if (match) {
              const [entityType] = match;
              entityTextures?.images?.set?.(entityType, image);
              entityTextures?.billboardImages?.delete?.(entityType);
              entityTextures?.glTextures?.delete?.(entityType);
            }
          })
          .catch((error) => {
            console.warn(`Custom pack image failed for ${path}: ${error.message}`);
          })
      );
    }
    await Promise.all(imageTasks);
  }

  async function importResourcePackFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) {
      throw new Error("Choose a resource-pack folder first.");
    }
    await importResourcePackEntries(
      files.map((file) => ({
        relativePath: String(file.webkitRelativePath || file.name || ""),
        file
      }))
    );
  }

  async function importResourcePackZip(file) {
    if (!file) {
      throw new Error("Choose a resource-pack ZIP first.");
    }
    const entries = await extractZipEntries(file);
    const defaultName = String(file.name || "").replace(/\.zip$/i, "").trim();
    await importResourcePackEntries(entries, defaultName || "");
  }

  return {
    renderResourcePackEntry,
    renderResourcePackUI,
    applyTexturePackSetting,
    readFileAsDataUrl,
    normalizeResourcePackRelativePath,
    getMimeTypeForPath,
    blobToDataUrl,
    upsertCachedResourcePack,
    fetchOnlineResourcePackJson,
    fetchOnlineResourcePackImage,
    createAtlasTextureDataUrl,
    buildOnlineMcAssetsResourcePack,
    ensureOnlineResourcePackLoaded,
    decodeZipEntryName,
    inflateZipBytes,
    extractZipEntries,
    parseResourcePackMetadata,
    importResourcePackEntries,
    inferIconBlockFromAssets,
    preloadCustomResourcePackAssets,
    importResourcePackFiles,
    importResourcePackZip
  };
}
