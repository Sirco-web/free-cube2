import { createPlayerSkinPresets } from "./player-skins.js";
import { normalizeAssetPath } from "./resource-packs.js";
import { DEFAULT_SETTINGS } from "./game-runtime-config.js";

export const PLAYER_SKIN_PRESETS = createPlayerSkinPresets(normalizeAssetPath);

const playerSkinCanvasCache = new Map();
const builtInPlayerSkinLoadState = new Map();

let playerSkinRefreshHandler = null;
let customPlayerSkinCache = {
  dataUrl: "",
  canvas: null,
  loading: false,
  failed: false
};

function fillCanvasRects(ctx, color, rects) {
  ctx.fillStyle = color;
  for (const rect of rects) {
    const [x, y, w = 1, h = 1] = rect;
    ctx.fillRect(x, y, w, h);
  }
}

function setCanvasPlayerModel(canvas, model = "classic") {
  if (canvas?.dataset) {
    canvas.dataset.playerModel = model === "slim" ? "slim" : "classic";
  }
  return canvas;
}

function fillSkinBoxTexture(ctx, u, v, w, h, d, faces = {}) {
  const fill = (x, y, width, height, color) => {
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  };

  fill(u + d, v, w, d, faces.top);
  fill(u + d + w, v, w, d, faces.bottom);
  fill(u, v + d, d, h, faces.left);
  fill(u + d, v + d, w, h, faces.front);
  fill(u + d + w, v + d, d, h, faces.right);
  fill(u + d + w + d, v + d, w, h, faces.back);
}

export function getSkinBoxFaceRects(u, v, w, h, d) {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    left: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    right: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h]
  };
}

export function getSkinRectUvQuad(rect, texW, texH, scaleX = 1, scaleY = scaleX) {
  if (!rect) {
    return null;
  }
  const [u, v, w, h] = rect;
  const left = (u * scaleX) / texW;
  const right = ((u + w) * scaleX) / texW;
  const top = 1 - ((v * scaleY) / texH);
  const bottom = 1 - (((v + h) * scaleY) / texH);
  return [
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top]
  ];
}

function buildPlayerSkinCanvas(paletteOverrides = {}) {
  const palette = {
    skin: "#e3c7aa",
    skinShade: "#cfae90",
    hair: "#352316",
    hairShade: "#21150c",
    shirt: "#22c6d8",
    shirtShade: "#148998",
    shirtAccent: "#0d5f69",
    arm: null,
    armShade: null,
    pants: "#39d3e2",
    pantsShade: "#2293a3",
    leg: null,
    legShade: null,
    shoes: "#f0f0f0",
    belt: "#2c241d",
    eyeWhite: "#ffffff",
    eye: "#5c3f28",
    mouth: "#5c3f28",
    ...paletteOverrides
  };
  const model = palette.model === "slim" ? "slim" : "classic";
  const armWidth = model === "slim" ? 3 : 4;
  const canvas = setCanvasPlayerModel(document.createElement("canvas"), model);
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  fillSkinBoxTexture(ctx, 0, 0, 8, 8, 8, {
    top: palette.skin,
    bottom: palette.skinShade,
    left: palette.skinShade,
    front: palette.skin,
    right: palette.skinShade,
    back: palette.skinShade
  });
  fillSkinBoxTexture(ctx, 32, 0, 8, 8, 8, {
    top: palette.hair,
    bottom: null,
    left: palette.hairShade || palette.hair,
    front: palette.hair,
    right: palette.hairShade || palette.hair,
    back: palette.hairShade || palette.hair
  });
  fillCanvasRects(ctx, palette.eyeWhite, [
    [9, 12, 2, 1],
    [13, 12, 2, 1]
  ]);
  fillCanvasRects(ctx, palette.eye, [
    [10, 12, 1, 1],
    [14, 12, 1, 1]
  ]);
  fillCanvasRects(ctx, palette.mouth, [
    [11, 14, 3, 1]
  ]);
  fillCanvasRects(ctx, palette.hair, [
    [40, 8, 8, 2],
    [32, 8, 2, 7],
    [46, 8, 2, 7],
    [41, 10, 6, 2]
  ]);

  fillSkinBoxTexture(ctx, 16, 16, 8, 12, 4, {
    top: palette.shirtShade,
    bottom: palette.belt,
    left: palette.shirtShade,
    front: palette.shirt,
    right: palette.shirtShade,
    back: palette.shirtShade
  });
  fillSkinBoxTexture(ctx, 16, 32, 8, 12, 4, {
    top: palette.shirtAccent || palette.shirtShade,
    bottom: null,
    left: palette.shirtShade,
    front: palette.shirtAccent || palette.shirt,
    right: palette.shirtShade,
    back: palette.shirtShade
  });
  fillCanvasRects(ctx, palette.shirtAccent || palette.eyeWhite, [
    [21, 22, 2, 6],
    [25, 22, 2, 6],
    [23, 22, 2, 2],
    [22, 28, 4, 1]
  ]);
  fillCanvasRects(ctx, palette.belt, [
    [20, 30, 8, 2],
    [16, 30, 4, 2],
    [28, 30, 4, 2],
    [32, 30, 8, 2]
  ]);

  const paintArm = (u, v) => {
    fillSkinBoxTexture(ctx, u, v, armWidth, 12, 4, {
      top: palette.arm || palette.shirt,
      bottom: palette.skinShade,
      left: palette.armShade || palette.shirtShade,
      front: palette.skin,
      right: palette.armShade || palette.shirtShade,
      back: palette.skinShade
    });
    fillCanvasRects(ctx, palette.arm || palette.shirt, [
      [u + 4, v + 4, armWidth, 4],
      [u, v + 4, 4, 4],
      [u + 4 + armWidth, v + 4, 4, 4],
      [u + 8 + armWidth, v + 4, armWidth, 4]
    ]);
    fillCanvasRects(ctx, palette.armShade || palette.shirtShade, [
      [u + 4, v + 4, armWidth, 1]
    ]);
  };

  paintArm(40, 16);
  paintArm(32, 48);
  fillSkinBoxTexture(ctx, 40, 32, armWidth, 12, 4, {
    top: palette.shirtAccent,
    bottom: null,
    left: palette.shirtShade,
    front: palette.shirtAccent,
    right: palette.shirtShade,
    back: palette.shirtShade
  });
  fillSkinBoxTexture(ctx, 48, 48, armWidth, 12, 4, {
    top: palette.shirtAccent,
    bottom: null,
    left: palette.shirtShade,
    front: palette.shirtAccent,
    right: palette.shirtShade,
    back: palette.shirtShade
  });

  const paintLeg = (u, v, overlayU = null, overlayV = null) => {
    fillSkinBoxTexture(ctx, u, v, 4, 12, 4, {
      top: palette.pantsShade,
      bottom: palette.shoes,
      left: palette.legShade || palette.pantsShade,
      front: palette.leg || palette.pants,
      right: palette.legShade || palette.pantsShade,
      back: palette.pantsShade
    });
    fillCanvasRects(ctx, palette.shoes, [
      [u + 4, v + 14, 4, 2],
      [u, v + 14, 4, 2],
      [u + 8, v + 14, 4, 2],
      [u + 12, v + 14, 4, 2]
    ]);
    if (overlayU !== null && overlayV !== null) {
      fillSkinBoxTexture(ctx, overlayU, overlayV, 4, 12, 4, {
        top: palette.pantsShade,
        bottom: null,
        left: palette.pantsShade,
        front: palette.pantsShade,
        right: palette.pantsShade,
        back: palette.pantsShade
      });
    }
  };

  paintLeg(0, 16, 0, 32);
  paintLeg(16, 48, 0, 48);

  return canvas;
}

export function isValidPlayerSkinPreset(preset) {
  return preset === "custom" || Object.prototype.hasOwnProperty.call(PLAYER_SKIN_PRESETS, preset);
}

export function getPresetPlayerSkinCanvas(preset = DEFAULT_SETTINGS.playerSkinPreset) {
  const resolvedPreset = Object.prototype.hasOwnProperty.call(PLAYER_SKIN_PRESETS, preset) ? preset : DEFAULT_SETTINGS.playerSkinPreset;
  const presetMeta = PLAYER_SKIN_PRESETS[resolvedPreset];
  if (presetMeta?.source) {
    if (!playerSkinCanvasCache.has(resolvedPreset)) {
      const fallbackPreset = presetMeta.fallbackPreset && PLAYER_SKIN_PRESETS[presetMeta.fallbackPreset]
        ? presetMeta.fallbackPreset
        : "steve";
      playerSkinCanvasCache.set(
        resolvedPreset,
        setCanvasPlayerModel(
          buildPlayerSkinCanvas(PLAYER_SKIN_PRESETS[fallbackPreset]),
          presetMeta.model || PLAYER_SKIN_PRESETS[fallbackPreset]?.model || "classic"
        )
      );
    }
    const state = builtInPlayerSkinLoadState.get(resolvedPreset);
    if (!state?.loading && !state?.loaded) {
      builtInPlayerSkinLoadState.set(resolvedPreset, { loading: true, loaded: false });
      const image = new Image();
      image.onload = () => {
        playerSkinCanvasCache.set(
          resolvedPreset,
          setCanvasPlayerModel(normalizeImportedPlayerSkinCanvas(image), presetMeta.model || "classic")
        );
        builtInPlayerSkinLoadState.set(resolvedPreset, { loading: false, loaded: true });
        triggerPlayerSkinRefresh();
      };
      image.onerror = () => {
        console.warn(`Failed to load built-in player skin: ${presetMeta.source}`);
        builtInPlayerSkinLoadState.set(resolvedPreset, { loading: false, loaded: false, failed: true });
      };
      image.src = presetMeta.source;
    }
    return playerSkinCanvasCache.get(resolvedPreset);
  }
  if (!playerSkinCanvasCache.has(resolvedPreset)) {
    playerSkinCanvasCache.set(resolvedPreset, buildPlayerSkinCanvas(PLAYER_SKIN_PRESETS[resolvedPreset]));
  }
  return playerSkinCanvasCache.get(resolvedPreset);
}

export function getDefaultPlayerSkinCanvas() {
  return getPresetPlayerSkinCanvas(DEFAULT_SETTINGS.playerSkinPreset);
}

function getNormalizedSkinDimensions(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return null;
  }
  if (w % 64 !== 0) {
    return null;
  }
  const scale = w / 64;
  if (scale < 1 || !Number.isInteger(scale)) {
    return null;
  }
  if (h === 64 * scale) {
    return { width: 64, height: 64, scale, legacy: false };
  }
  if (h === 32 * scale) {
    return { width: 64, height: 32, scale, legacy: true };
  }
  return null;
}

function normalizeImportedPlayerSkinCanvas(image) {
  const dimensions = getNormalizedSkinDimensions(image.width, image.height);
  const canvas = setCanvasPlayerModel(document.createElement("canvas"), "classic");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 64, 64);
  if (dimensions) {
    ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);
  } else {
    ctx.drawImage(image, 0, 0, 64, 64);
  }
  if (dimensions?.legacy) {
    // Classic 64x32 skins don't have the second leg/arm textures in the bottom half.
    // Duplicate the visible front faces so the preview still renders cleanly.
    ctx.drawImage(canvas, 4, 20, 4, 12, 20, 52, 4, 12);
    ctx.drawImage(canvas, 44, 20, 4, 12, 36, 52, 4, 12);
  }
  return canvas;
}

export function buildPlayerBillboardCanvas(skinSource = null) {
  const skin = skinSource || getPresetPlayerSkinCanvas("steve");
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!skin) {
    return canvas;
  }
  ctx.drawImage(skin, 8, 8, 8, 8, 4, 0, 8, 8);
  ctx.drawImage(skin, 20, 20, 8, 12, 4, 8, 8, 12);
  ctx.drawImage(skin, 44, 20, 4, 12, 0, 8, 4, 12);
  ctx.drawImage(skin, 36, 52, 4, 12, 12, 8, 4, 12);
  ctx.drawImage(skin, 4, 20, 4, 12, 4, 20, 4, 12);
  ctx.drawImage(skin, 20, 52, 4, 12, 8, 20, 4, 12);
  return canvas;
}

function triggerPlayerSkinRefresh() {
  playerSkinRefreshHandler?.();
}

export function setPlayerSkinRefreshHandler(handler) {
  playerSkinRefreshHandler = typeof handler === "function" ? handler : null;
}

function queueCustomPlayerSkinLoad(dataUrl) {
  if (!dataUrl || customPlayerSkinCache.loading) return;
  customPlayerSkinCache.loading = true;
  const image = new Image();
  image.onload = () => {
    if (!getNormalizedSkinDimensions(image.width, image.height)) {
      console.warn("Unsupported player skin size:", image.width, image.height);
      if (customPlayerSkinCache.dataUrl === dataUrl) {
        customPlayerSkinCache.canvas = null;
        customPlayerSkinCache.failed = true;
      }
      customPlayerSkinCache.loading = false;
      triggerPlayerSkinRefresh();
      return;
    }
    customPlayerSkinCache = {
      dataUrl,
      canvas: normalizeImportedPlayerSkinCanvas(image),
      loading: false,
      failed: false
    };
    triggerPlayerSkinRefresh();
  };
  image.onerror = () => {
    console.warn("Failed to load custom player skin.");
    if (customPlayerSkinCache.dataUrl === dataUrl) {
      customPlayerSkinCache.canvas = null;
      customPlayerSkinCache.loading = false;
      customPlayerSkinCache.failed = true;
    } else {
      customPlayerSkinCache.loading = false;
    }
    triggerPlayerSkinRefresh();
  };
  image.src = dataUrl;
}

export function getCustomPlayerSkinCanvas(dataUrl) {
  if (!dataUrl) return null;
  if (customPlayerSkinCache.dataUrl !== dataUrl) {
    customPlayerSkinCache = {
      dataUrl,
      canvas: null,
      loading: false,
      failed: false
    };
  }
  if (!customPlayerSkinCache.canvas && !customPlayerSkinCache.loading && !customPlayerSkinCache.failed) {
    queueCustomPlayerSkinLoad(dataUrl);
  }
  return customPlayerSkinCache.canvas;
}

export function getSelectedPlayerSkinCanvas(settingsState = DEFAULT_SETTINGS) {
  const preset = isValidPlayerSkinPreset(settingsState?.playerSkinPreset) ? settingsState.playerSkinPreset : DEFAULT_SETTINGS.playerSkinPreset;
  if (preset === "custom") {
    return getCustomPlayerSkinCanvas(settingsState?.playerSkinDataUrl) || getPresetPlayerSkinCanvas(DEFAULT_SETTINGS.playerSkinPreset);
  }
  return getPresetPlayerSkinCanvas(preset);
}

export function getSelectedPlayerSkinLabel(settingsState = DEFAULT_SETTINGS) {
  const preset = isValidPlayerSkinPreset(settingsState?.playerSkinPreset) ? settingsState.playerSkinPreset : DEFAULT_SETTINGS.playerSkinPreset;
  if (preset === "custom") {
    return settingsState?.playerSkinDataUrl ? "Custom" : PLAYER_SKIN_PRESETS[DEFAULT_SETTINGS.playerSkinPreset].label;
  }
  return PLAYER_SKIN_PRESETS[preset]?.label || PLAYER_SKIN_PRESETS[DEFAULT_SETTINGS.playerSkinPreset].label;
}

export function readPlayerSkinFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Choose a PNG or WebP skin first."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That skin file could not be read."));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const image = new Image();
      image.onload = () => {
        if (!getNormalizedSkinDimensions(image.width, image.height)) {
          reject(new Error("Skin must be 64x64 or 64x32, or a scaled multiple like 128x128 or 256x256."));
          return;
        }
        const canvas = normalizeImportedPlayerSkinCanvas(image);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => reject(new Error("That skin file could not be loaded."));
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function getPlayerSkinModel(canvas) {
  return canvas?.dataset?.playerModel === "slim" ? "slim" : "classic";
}
