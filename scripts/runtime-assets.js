import { normalizeAssetPath } from "./resource-packs.js";
import { DEFAULT_SETTINGS } from "./game-runtime-config.js";

export function createRuntimeAssets({
  getAllBlockTexturePaths,
  getAllItemTexturePaths,
  getBlockTextureCandidates,
  getItemInfo,
  resolveResourcePackAsset
}) {
  const ENTITY_TEXTURE_CATALOG_PATH = normalizeAssetPath("assets/entity/externalTextures.json");
  const ENTITY_MOB_NAMES = [
    "allay",
    "axolotl",
    "blaze",
    "camel",
    "cat",
    "chicken",
    "cod",
    "creeper",
    "dolphin",
    "ender_dragon",
    "enderman",
    "endermite",
    "fox",
    "frog",
    "ghast",
    "goat",
    "guardian",
    "horse",
    "llama",
    "parrot",
    "piglin",
    "pillager",
    "rabbit",
    "sheep",
    "shulker",
    "sniffer",
    "spider",
    "tadpole",
    "turtle",
    "vex",
    "villager",
    "warden",
    "witch",
    "wolf",
    "zombie",
    "zombie_villager"
  ];
  const ENTITY_TEXTURE_NAMES = new Set(ENTITY_MOB_NAMES);
  const ENTITY_TEXTURE_FILE_PATHS = Object.fromEntries(
    ENTITY_MOB_NAMES.map((name) => [name, normalizeAssetPath(`assets/entity/textures/${name}.png`)])
  );
  const OBJ_ENTITY_MODEL_NAMES = [
    "allay",
    "axolotl",
    "blaze",
    "camel",
    "cat",
    "chicken",
    "cod",
    "creeper",
    "dolphin",
    "ender_dragon",
    "enderman",
    "endermite",
    "fox",
    "frog",
    "ghast",
    "goat",
    "guardian",
    "horse",
    "llama",
    "parrot",
    "piglin",
    "pillager",
    "rabbit",
    "sheep",
    "shulker",
    "sniffer",
    "spider",
    "tadpole",
    "turtle",
    "vex",
    "villager",
    "warden",
    "witch",
    "wolf",
    "zombie_villager"
  ];
  const OBJ_ENTITY_MODEL_PATHS = Object.fromEntries(
    OBJ_ENTITY_MODEL_NAMES.map((name) => [name, normalizeAssetPath(`assets/entity/models/${name}.obj`)])
  );

  const MUSIC_TRACKS = {
    title: normalizeAssetPath("assets/Wav/music/welcome.wav"),
    pause: normalizeAssetPath("assets/Wav/music/pausescreen.mp3"),
    gameplay: {
      cave: normalizeAssetPath("assets/Wav/music/caves.mp3"),
      village: normalizeAssetPath("assets/Wav/music/village.mp3"),
      forest: normalizeAssetPath("assets/Wav/music/Forest_Ambience.mp3")
    }
  };

  class TextureLibrary {
    constructor(engine) {
      this.engine = engine;
      this.images = new Map();
      this.pending = new Set();
      this.failedPaths = new Set();
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
      const uniquePaths = [...new Set([...getAllBlockTexturePaths(this.settings), ...getAllItemTexturePaths(this.settings)])];

      this.total = uniquePaths.length;
      let loaded = 0;

      this.readyPromise = Promise.all(
        uniquePaths.map(async (path) => {
          try {
            const image = await this.engine.resources.loadImage(path);
            this.images.set(path, image);
            this.failedPaths.delete(path);
            loaded += 1;
            this.progress = loaded / Math.max(1, this.total);
          } catch (error) {
            this.failedPaths.add(path);
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

    ensureImage(path) {
      if (!path || this.images.has(path) || this.pending.has(path) || this.failedPaths.has(path)) {
        return;
      }
      this.pending.add(path);
      this.engine.resources.loadImage(path)
        .then((image) => {
          this.images.set(path, image);
          this.failedPaths.delete(path);
        })
        .catch((error) => {
          this.failedPaths.add(path);
          console.warn(`Texture load failed for ${path}: ${error.message}`);
        })
        .finally(() => {
          this.pending.delete(path);
        });
    }

    getBlockFaceTexture(blockType, faceId, settingsState = this.settings) {
      for (const path of getBlockTextureCandidates(blockType, faceId, settingsState)) {
        this.ensureImage(path);
        const image = this.images.get(path);
        if (image) {
          return image;
        }
      }
      return null;
    }

    getItemTexture(itemType, settingsState = this.settings) {
      const info = getItemInfo(itemType);
      if (!info) {
        return null;
      }
      if (info.blockType) {
        return this.getBlockFaceTexture(info.blockType, "top", settingsState);
      }
      const path = resolveResourcePackAsset(info.texture, settingsState);
      this.ensureImage(path);
      return this.images.get(path) || this.images.get(normalizeAssetPath(info.texture)) || null;
    }
  }

  class EntityTextureLibrary {
    constructor(engine) {
      this.engine = engine;
      this.images = new Map();
      this.billboardImages = new Map();
      this.glTextures = new Map();
      this.settings = { ...DEFAULT_SETTINGS };
      this.pendingLoads = new Set();
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
      const overridePath = resolveResourcePackAsset(ENTITY_TEXTURE_FILE_PATHS[type], this.settings);
      if (
        overridePath &&
        overridePath !== ENTITY_TEXTURE_FILE_PATHS[type] &&
        !this.images.has(type) &&
        !this.pendingLoads.has(type)
      ) {
        this.pendingLoads.add(type);
        this.engine.resources.loadImage(overridePath)
          .then((image) => {
            this.images.set(type, image);
            this.billboardImages.delete(type);
            this.glTextures.delete(type);
          })
          .catch((error) => {
            console.warn(`Entity texture override failed for ${type}: ${error.message}`);
          })
          .finally(() => {
            this.pendingLoads.delete(type);
          });
      }
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

  return {
    ENTITY_TEXTURE_CATALOG_PATH,
    ENTITY_MOB_NAMES,
    ENTITY_TEXTURE_FILE_PATHS,
    MUSIC_TRACKS,
    TextureLibrary,
    EntityTextureLibrary,
    ObjModelLibrary
  };
}
