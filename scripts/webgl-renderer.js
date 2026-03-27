export function createWebGLRendererRuntime(deps) {
  const {
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
  } = deps;

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
    this.chunkGenQueuedKeys = new Set();
    this.meshQueuedKeys = new Set();
    this.proj = mat4Identity();
    this.view = mat4Identity();
    this.fov = Math.PI / 3;
    this.targetBlock = null;
    this.textureLibrary = null;
    this.entityTextures = null;
    this.objModelLibrary = null;
    this._spriteTextures = new WeakMap();
    this.weatherState = {
      timeSeconds: 0,
      intensity: 0,
      runtimeLowFps: false,
      weather: createWeatherState()
    };
    this._outline = this._createOutlineRenderer();
    this._precipitation = this._createPrecipitationRenderer();
    this.entities = [];
    this.visibleOffsets = getChunkLoadOffsets(this.renderDistanceChunks);
    this.runtimeInCave = false;
    this.runtimeLowFps = false;
    this._entities = this._createEntityRenderer();
    this._zombie = this._createZombieRenderer();
    this._players3d = this._createPlayerEntityRenderer();
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
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  setRenderDistance(distance) {
    this.renderDistanceChunks = clamp(distance, 1, 6);
    this.settings.renderDistanceChunks = this.renderDistanceChunks;
    this.visibleOffsets = getChunkLoadOffsets(this.renderDistanceChunks);
  }

  setWeatherState(weatherState) {
    this.weatherState = weatherState || this.weatherState;
  }

  _getEffectiveRenderDistance() {
    let distance = this.renderDistanceChunks;
    if (this.runtimeInCave) {
      distance -= this.runtimeLowFps ? 3 : 2;
    } else if (this.runtimeLowFps && distance >= 4) {
      distance -= 1;
    }
    return clamp(distance, 1, this.renderDistanceChunks);
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
    const r = this._getEffectiveRenderDistance() + 0.5;
    return dx * dx + dz * dz <= r * r;
  }

  _getLookDirXZ() {
    const look = this.player?.getLookVector?.();
    const len = Math.hypot(look?.x || 0, look?.z || 0);
    if (len < 0.0001) {
      return null;
    }
    return { x: look.x / len, z: look.z / len };
  }

  _getChunkViewDot(chunkX, chunkZ, lookDirXZ = this._getLookDirXZ()) {
    if (!lookDirXZ) {
      return 1;
    }
    const toChunkX = (chunkX + 0.5) * CHUNK_SIZE - this.player.x;
    const toChunkZ = (chunkZ + 0.5) * CHUNK_SIZE - this.player.z;
    const len = Math.hypot(toChunkX, toChunkZ);
    if (len < 0.0001) {
      return 1;
    }
    return (toChunkX / len) * lookDirXZ.x + (toChunkZ / len) * lookDirXZ.z;
  }

  _shouldRenderChunk(chunkX, chunkZ, playerChunkX, playerChunkZ, lookDirXZ = this._getLookDirXZ()) {
    const dx = chunkX - playerChunkX;
    const dz = chunkZ - playerChunkZ;
    if (!this._withinDistance(dx, dz)) {
      return false;
    }
    const distSq = dx * dx + dz * dz;
    if (distSq <= 4) {
      return true;
    }
    let visibilityThreshold = -0.18;
    if (this.runtimeInCave) {
      visibilityThreshold = this.runtimeLowFps ? 0.22 : 0.06;
    } else if (this.runtimeLowFps) {
      visibilityThreshold = -0.04;
    }
    return this._getChunkViewDot(chunkX, chunkZ, lookDirXZ) >= visibilityThreshold;
  }

  _getMaxEntityRenderDistance() {
    const preset = getPerformancePresetConfig(this.settings?.performancePreset);
    let distance = preset.entityDistance;
    if (this.settings?.graphicsMode === "fancy") {
      distance += 4;
    }
    if (this.runtimeInCave) {
      distance -= this.runtimeLowFps ? 14 : 8;
    } else if (this.runtimeLowFps) {
      distance -= 6;
    }
    return distance;
  }

  _takeNearest(queue, keySet, playerChunkX, playerChunkZ) {
    if (queue.length === 0) {
      return null;
    }

    const lookDirXZ = this._getLookDirXZ();
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < queue.length; index += 1) {
      const entry = queue[index];
      const dx = entry.chunkX - playerChunkX;
      const dz = entry.chunkZ - playerChunkZ;
      const distanceScore = Math.max(Math.abs(dx), Math.abs(dz)) + Math.hypot(dx, dz) * 0.001;
      const viewDot = this._getChunkViewDot(entry.chunkX, entry.chunkZ, lookDirXZ);
      const directionalPenalty = viewDot >= 0 ? -Math.min(0.2, viewDot * 0.16) : Math.abs(viewDot) * 0.8;
      const score = distanceScore + directionalPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
        if (score <= 0) {
          break;
        }
      }
    }

    const [entry] = queue.splice(bestIndex, 1);
    if (entry) {
      keySet.delete(entry.key);
    }
    return entry || null;
  }

  queueChunk(chunkX, chunkZ) {
    const key = packChunkKey(chunkX, chunkZ);
    if (this.meshQueuedKeys.has(key)) {
      return;
    }
    this.meshQueuedKeys.add(key);
    this.meshQueue.push({ key, chunkX, chunkZ });
  }

  queueChunkGeneration(chunkX, chunkZ) {
    const key = packChunkKey(chunkX, chunkZ);
    if (this.chunkGenQueuedKeys.has(key)) {
      return;
    }
    this.chunkGenQueuedKeys.add(key);
    this.chunkGenQueue.push({ key, chunkX, chunkZ });
  }

  updateQueue(limit = 1, budgetMs = 4) {
    const start = performance.now();
    const playerChunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(this.player.z / CHUNK_SIZE);
    for (let i = 0; i < limit && this.meshQueue.length > 0; i += 1) {
      const next = this._takeNearest(this.meshQueue, this.meshQueuedKeys, playerChunkX, playerChunkZ);
      if (!next) {
        break;
      }
      const dx = next.chunkX - playerChunkX;
      const dz = next.chunkZ - playerChunkZ;
      if (!this._withinDistance(dx, dz)) {
        continue;
      }
      const chunk = this.world.peekChunk(next.chunkX, next.chunkZ);
      if (!chunk) {
        continue;
      }
      if (!chunk.meshDirty && this.chunkMeshes.has(next.key)) {
        continue;
      }
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

  ensureVisibleChunks(generateLimit = PLAY_CHUNK_GEN_LIMIT, generateBudgetMs = Infinity) {
    const playerChunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(this.player.z / CHUNK_SIZE);
    const lookDirXZ = this._getLookDirXZ();
    const maxQueuedGenerations = this.runtimeInCave ? 18 : this.runtimeLowFps ? 28 : 42;
    const maxQueuedMeshes = this.runtimeInCave ? 16 : this.runtimeLowFps ? 24 : 36;

    for (const offset of this.visibleOffsets) {
      const candidateX = playerChunkX + offset.dx;
      const candidateZ = playerChunkZ + offset.dz;
      if (!this._withinDistance(offset.dx, offset.dz)) continue;
      const key = packChunkKey(candidateX, candidateZ);
      const important = this._shouldRenderChunk(candidateX, candidateZ, playerChunkX, playerChunkZ, lookDirXZ);
      const chunk = this.world.peekChunk(candidateX, candidateZ);
      if (!chunk) {
        if (important || this.chunkGenQueue.length < maxQueuedGenerations) {
          this.queueChunkGeneration(candidateX, candidateZ);
        }
        continue;
      }
      if (chunk.meshDirty || !this.chunkMeshes.has(key)) {
        if (important || this.meshQueue.length < maxQueuedMeshes) {
          this.queueChunk(candidateX, candidateZ);
        }
      }
    }

    const start = performance.now();
    for (let i = 0; i < generateLimit && this.chunkGenQueue.length > 0; i += 1) {
      const next = this._takeNearest(this.chunkGenQueue, this.chunkGenQueuedKeys, playerChunkX, playerChunkZ);
      if (!next) {
        break;
      }
      const dx = next.chunkX - playerChunkX;
      const dz = next.chunkZ - playerChunkZ;
      if (!this._withinDistance(dx, dz)) continue;
      const chunk = this.world.getChunk(next.chunkX, next.chunkZ);
      if (chunk.meshDirty || !this.chunkMeshes.has(next.key)) {
        this.queueChunk(next.chunkX, next.chunkZ);
      }
      if (performance.now() - start >= generateBudgetMs) {
        break;
      }
    }
    const preset = getPerformancePresetConfig(this.settings?.performancePreset);
    const keepRadius = this.settings?.chunkLagFix === false
      ? this.renderDistanceChunks + 2
      : this.renderDistanceChunks + (preset.cleanupBias >= 1 ? 0 : 1);
    this.world.unloadFarChunks(playerChunkX, playerChunkZ, keepRadius);

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
    if (this.chunkGenQueue.length > maxQueuedGenerations) {
      this.chunkGenQueue.length = maxQueuedGenerations;
    }
    this.chunkGenQueuedKeys = new Set(this.chunkGenQueue.map((entry) => entry.key));
    this.meshQueue = this.meshQueue.filter((entry) => {
      const dx = entry.chunkX - playerChunkX;
      const dz = entry.chunkZ - playerChunkZ;
      return this._withinDistance(dx, dz) && this.world.chunks.has(entry.key);
    });
    if (this.meshQueue.length > maxQueuedMeshes) {
      this.meshQueue.length = maxQueuedMeshes;
    }
    this.meshQueuedKeys = new Set(this.meshQueue.map((entry) => entry.key));
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

  _getOrCreateSpriteTexture(image, flipY = true) {
    if (!image) {
      return null;
    }
    let variants = this._spriteTextures.get(image);
    if (!variants) {
      variants = new Map();
      this._spriteTextures.set(image, variants);
    }
    const variantKey = flipY ? "flip" : "upright";
    const existing = variants.get(variantKey);
    if (existing) {
      return existing;
    }
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    variants.set(variantKey, tex);
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

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    const playerChunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(this.player.z / CHUNK_SIZE);
    const lookDirXZ = this._getLookDirXZ();

    for (const offset of this.visibleOffsets) {
      const cx = playerChunkX + offset.dx;
      const cz = playerChunkZ + offset.dz;
      if (!this._shouldRenderChunk(cx, cz, playerChunkX, playerChunkZ, lookDirXZ)) continue;
      const record = this.chunkMeshes.get(packChunkKey(cx, cz));
      if (!record) continue;
      record.opaque.draw();
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    // Draw transparent chunks sorted back-to-front (chunk-level sort)
    if (this.settings?.graphicsMode === "fancy" && !this.runtimeInCave && !this.runtimeLowFps) {
      const transparentDraw = [];
      for (const offset of this.visibleOffsets) {
        const cx = playerChunkX + offset.dx;
        const cz = playerChunkZ + offset.dz;
        if (!this._shouldRenderChunk(cx, cz, playerChunkX, playerChunkZ, lookDirXZ)) continue;
        const record = this.chunkMeshes.get(packChunkKey(cx, cz));
        if (!record) continue;
        const dx = (cx + 0.5) * CHUNK_SIZE - this.player.x;
        const dz = (cz + 0.5) * CHUNK_SIZE - this.player.z;
        transparentDraw.push({ record, dist: dx * dx + dz * dz });
      }
      transparentDraw.sort((a, b) => b.dist - a.dist);
      for (const item of transparentDraw) {
        item.record.transparent.draw();
      }
    } else {
      for (const offset of this.visibleOffsets) {
        const cx = playerChunkX + offset.dx;
        const cz = playerChunkZ + offset.dz;
        if (!this._shouldRenderChunk(cx, cz, playerChunkX, playerChunkZ, lookDirXZ)) continue;
        const record = this.chunkMeshes.get(packChunkKey(cx, cz));
        if (!record) continue;
        record.transparent.draw();
      }
    }

    this._precipitation.draw(this.proj, this.view, this.weatherState);

    if (this.settings?.mobModels !== false) {
      this._objEntities.draw(this.proj, this.view, this.entities || []);
      this._players3d.draw(this.proj, this.view, this.entities || []);
    }
    this._entities.draw(this.proj, this.view, this.entities || []);

    // Outline is drawn last so it stays readable.
    this._outline.draw(this.proj, this.view);

    gl.disable(gl.CULL_FACE);
    gl.depthMask(true);
  }

  _createPrecipitationRenderer() {
    const gl = this.gl;
    const program = createProgram(
      gl,
      `#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPos;
      layout(location=1) in vec4 aColor;
      uniform mat4 uProj;
      uniform mat4 uView;
      out vec4 vColor;
      void main(){
        gl_Position = uProj * uView * vec4(aPos, 1.0);
        vColor = aColor;
      }`,
      `#version 300 es
      precision highp float;
      in vec4 vColor;
      out vec4 outColor;
      void main(){
        outColor = vColor;
      }`
    );

    const uProj = gl.getUniformLocation(program, "uProj");
    const uView = gl.getUniformLocation(program, "uView");
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 7 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 7 * 4, 3 * 4);
    gl.bindVertexArray(null);

    const draw = (proj, view) => {
      const weatherPass = buildWeatherParticlePass(this.world, this.player, this.weatherState, this.settings);
      if (weatherPass.drops.length === 0 && weatherPass.splashes.length === 0) {
        return;
      }

      const vertices = [];
      const pushVertex = (x, y, z, r, g, b, a) => {
        vertices.push(x, y, z, r, g, b, a);
      };

      for (const drop of weatherPass.drops) {
        if (drop.type === "snow") {
          pushVertex(drop.x - 0.03, drop.y, drop.z, 0.95, 0.97, 1, drop.alpha * 0.92);
          pushVertex(drop.endX + 0.03, drop.endY, drop.endZ, 0.95, 0.97, 1, drop.alpha * 0.8);
        } else {
          pushVertex(drop.x, drop.y, drop.z, 0.68, 0.84, 1, drop.alpha);
          pushVertex(drop.endX, drop.endY, drop.endZ, 0.68, 0.84, 1, drop.alpha * 0.72);
        }
      }

      for (const splash of weatherPass.splashes) {
        const size = splash.size;
        pushVertex(splash.x - size, splash.y, splash.z, 0.79, 0.91, 1, splash.alpha);
        pushVertex(splash.x + size, splash.y, splash.z, 0.79, 0.91, 1, splash.alpha);
        pushVertex(splash.x, splash.y, splash.z - size, 0.79, 0.91, 1, splash.alpha * 0.9);
        pushVertex(splash.x, splash.y, splash.z + size, 0.79, 0.91, 1, splash.alpha * 0.9);
      }

      if (vertices.length === 0) {
        return;
      }

      gl.useProgram(program);
      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.LINES, 0, vertices.length / 7);
      gl.depthMask(true);
      gl.bindVertexArray(null);
    };

    return { draw };
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
      const maxEntityDistance = this._getMaxEntityRenderDistance();
      const maxEntityDistSq = maxEntityDistance * maxEntityDistance;
      const visibleEntities = entities.filter((entity) => {
        const dx = entity.x - this.player.x;
        const dy = entity.y - this.player.y;
        const dz = entity.z - this.player.z;
        return dx * dx + dy * dy + dz * dz <= maxEntityDistSq;
      });
      const sorted = visibleEntities.length > 1 ? [...visibleEntities].sort((a, b) => {
        const dax = a.x - this.player.x;
        const day = a.y - this.player.y;
        const daz = a.z - this.player.z;
        const dbx = b.x - this.player.x;
        const dby = b.y - this.player.y;
        const dbz = b.z - this.player.z;
        return dbx * dbx + dby * dby + dbz * dbz - (dax * dax + day * day + daz * daz);
      }) : visibleEntities;
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
        const isRemotePlayer = e.entityKind === "remote_player";
        const isZombie = !isItem && e.type === "zombie";
        const hasObjModel = !isItem && !isRemotePlayer && this.objModelLibrary?.hasModel(e.type);
        const hasEntityTexture = !isItem && !isRemotePlayer && !!(this.entityTextures?.getBillboardImage(e.type) || this.entityTextures?.getImage(e.type));
        const canUseObjModel = hasObjModel && hasEntityTexture;
        const canUseModelFallback = hasObjModel && e.type === "sheep";
        const canUseZombieModel = isZombie && !!this.entityTextures?.getImage("zombie");
        if ((canUseObjModel || canUseModelFallback || isRemotePlayer) && this.settings?.mobModels !== false) {
          continue;
        }
        // Keep zombies on the billboard path for now; it is more reliable than the
        // experimental box-model renderer and avoids invisible mobs.

        const image = isRemotePlayer
          ? (e.billboardCanvas || null)
          : isItem
          ? this.textureLibrary?.getItemTexture(e.itemType ?? e.blockType, this.settings) || null
          : this.entityTextures?.getBillboardImage(e.type) || this.entityTextures?.getImage(e.type) || null;
        const tex = image ? this._getOrCreateSpriteTexture(image) : null;
        const faceYaw = Math.atan2(this.player.x - e.x, this.player.z - e.z);
        const bob = isItem ? Math.sin((e.age || 0) * 6) * 0.08 : 0;
        const width = isItem ? 0.48 : isRemotePlayer ? 0.8 : 0.9;
        const height = isItem ? 0.48 : isRemotePlayer ? 1.8 : 1.8;
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
      const scaleX = texW / 64;
      const scaleY = texH / 64;
      const rects = getSkinBoxFaceRects(u, v, w, h, d);
      const topUv = getSkinRectUvQuad(rects.top, texW, texH, scaleX, scaleY);
      const bottomUv = getSkinRectUvQuad(rects.bottom, texW, texH, scaleX, scaleY);
      const frontUv = getSkinRectUvQuad(rects.front, texW, texH, scaleX, scaleY);
      const backUv = getSkinRectUvQuad(rects.back, texW, texH, scaleX, scaleY);
      const leftUv = getSkinRectUvQuad(rects.left, texW, texH, scaleX, scaleY);
      const rightUv = getSkinRectUvQuad(rects.right, texW, texH, scaleX, scaleY);

      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[7],
        corners[6],
        corners[2],
        corners[3],
        topUv[0],
        topUv[1],
        topUv[2],
        topUv[3]
      );
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[0],
        corners[1],
        corners[5],
        corners[4],
        bottomUv[0],
        bottomUv[1],
        bottomUv[2],
        bottomUv[3]
      );
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[4],
        corners[5],
        corners[6],
        corners[7],
        frontUv[0],
        frontUv[1],
        frontUv[2],
        frontUv[3]
      );
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[1],
        corners[0],
        corners[3],
        corners[2],
        backUv[0],
        backUv[1],
        backUv[2],
        backUv[3]
      );
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[0],
        corners[4],
        corners[7],
        corners[3],
        leftUv[0],
        leftUv[1],
        leftUv[2],
        leftUv[3]
      );
      baseIndex = pushFace(
        verts,
        idx,
        baseIndex,
        corners[5],
        corners[1],
        corners[2],
        corners[6],
        rightUv[0],
        rightUv[1],
        rightUv[2],
        rightUv[3]
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
        // Left Arm (4x12x4), proper left-arm UV (32,48)
        baseIndex = addBox(
          verts,
          idx,
          baseIndex,
          makeCorners(4, 12, -2, 8, 24, 2, -swing, 24, yaw, ox, oy, oz),
          texW,
          texH,
          32,
          48,
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
        // Left Leg (4x12x4), proper left-leg UV (16,48)
        baseIndex = addBox(
          verts,
          idx,
          baseIndex,
          makeCorners(0, 0, -2, 4, 12, 2, swing, 12, yaw, ox, oy, oz),
          texW,
          texH,
          16,
          48,
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

  _createPlayerEntityRenderer() {
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
      const scaleX = texW / 64;
      const scaleY = texH / 64;
      const rects = getSkinBoxFaceRects(u, v, w, h, d);
      const topUv = getSkinRectUvQuad(rects.top, texW, texH, scaleX, scaleY);
      const bottomUv = getSkinRectUvQuad(rects.bottom, texW, texH, scaleX, scaleY);
      const frontUv = getSkinRectUvQuad(rects.front, texW, texH, scaleX, scaleY);
      const backUv = getSkinRectUvQuad(rects.back, texW, texH, scaleX, scaleY);
      const leftUv = getSkinRectUvQuad(rects.left, texW, texH, scaleX, scaleY);
      const rightUv = getSkinRectUvQuad(rects.right, texW, texH, scaleX, scaleY);

      baseIndex = pushFace(verts, idx, baseIndex, corners[7], corners[6], corners[2], corners[3], topUv[0], topUv[1], topUv[2], topUv[3]);
      baseIndex = pushFace(verts, idx, baseIndex, corners[0], corners[1], corners[5], corners[4], bottomUv[0], bottomUv[1], bottomUv[2], bottomUv[3]);
      baseIndex = pushFace(verts, idx, baseIndex, corners[4], corners[5], corners[6], corners[7], frontUv[0], frontUv[1], frontUv[2], frontUv[3]);
      baseIndex = pushFace(verts, idx, baseIndex, corners[1], corners[0], corners[3], corners[2], backUv[0], backUv[1], backUv[2], backUv[3]);
      baseIndex = pushFace(verts, idx, baseIndex, corners[0], corners[4], corners[7], corners[3], leftUv[0], leftUv[1], leftUv[2], leftUv[3]);
      baseIndex = pushFace(verts, idx, baseIndex, corners[5], corners[1], corners[2], corners[6], rightUv[0], rightUv[1], rightUv[2], rightUv[3]);
      return baseIndex;
    };

    const makeCorners = (x0, y0, z0, x1, y1, z1, rotX, pivotY, yaw, ox, oy, oz) => {
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const sinX = Math.sin(rotX);
      const cosX = Math.cos(rotX);
      const s = 1 / 16;
      const rotVertex = (x, y, z) => {
        const dy = y - pivotY;
        const ry = dy * cosX - z * sinX;
        const rz = dy * sinX + z * cosX;
        const lx = x;
        const ly = pivotY + ry;
        const lz = rz;
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
      gl.useProgram(program);
      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uTex, 0);
      gl.bindVertexArray(vao);

      for (const e of entities) {
        if (!e || e.entityKind !== "remote_player") continue;
        const skin = e.skinCanvas || null;
        const tex = skin ? this._getOrCreateSpriteTexture(skin, false) : null;
        if (!tex) continue;

        const texW = skin.width || 64;
        const texH = skin.height || 64;
        const slim = getPlayerSkinModel(skin) === "slim";
        const armWidth = slim ? 3 : 4;
        const walk = clamp(Math.hypot(e.vx || 0, e.vz || 0) / 0.16, 0, 1);
        const phase = performance.now() * 0.008 + (e.x * 0.3 + e.z * 0.17);
        const swing = Math.sin(phase) * 0.65 * walk;
        const yaw = (e.yaw || 0) + Math.PI;
        const ox = e.x;
        const oy = e.y;
        const oz = e.z;
        const verts = [];
        const idx = [];
        let baseIndex = 0;
        const overlay = 0.25;

        baseIndex = addBox(verts, idx, baseIndex, makeCorners(-4, 24, -4, 4, 32, 4, 0, 24, yaw, ox, oy, oz), texW, texH, 0, 0, 8, 8, 8);
        if (texH >= 64) {
          baseIndex = addBox(verts, idx, baseIndex, makeCorners(-4 - overlay, 24 - overlay, -4 - overlay, 4 + overlay, 32 + overlay, 4 + overlay, 0, 24, yaw, ox, oy, oz), texW, texH, 32, 0, 8, 8, 8);
        }
        baseIndex = addBox(verts, idx, baseIndex, makeCorners(-4, 12, -2, 4, 24, 2, 0, 12, yaw, ox, oy, oz), texW, texH, 16, 16, 8, 12, 4);
        if (texH >= 64) {
          baseIndex = addBox(verts, idx, baseIndex, makeCorners(-4 - overlay, 12 - overlay, -2 - overlay, 4 + overlay, 24 + overlay, 2 + overlay, 0, 12, yaw, ox, oy, oz), texW, texH, 16, 32, 8, 12, 4);
        }
        baseIndex = addBox(verts, idx, baseIndex, makeCorners(-4 - armWidth, 12, -2, -4, 24, 2, swing, 24, yaw, ox, oy, oz), texW, texH, 40, 16, armWidth, 12, 4);
        baseIndex = addBox(verts, idx, baseIndex, makeCorners(4, 12, -2, 4 + armWidth, 24, 2, -swing, 24, yaw, ox, oy, oz), texW, texH, texH >= 64 ? 32 : 40, texH >= 64 ? 48 : 16, armWidth, 12, 4);
        if (texH >= 64) {
          baseIndex = addBox(verts, idx, baseIndex, makeCorners(-4 - armWidth - overlay, 12 - overlay, -2 - overlay, -4 + overlay, 24 + overlay, 2 + overlay, swing, 24, yaw, ox, oy, oz), texW, texH, 40, 32, armWidth, 12, 4);
          baseIndex = addBox(verts, idx, baseIndex, makeCorners(4 - overlay, 12 - overlay, -2 - overlay, 4 + armWidth + overlay, 24 + overlay, 2 + overlay, -swing, 24, yaw, ox, oy, oz), texW, texH, 48, 48, armWidth, 12, 4);
        }
        baseIndex = addBox(verts, idx, baseIndex, makeCorners(-4, 0, -2, 0, 12, 2, -swing, 12, yaw, ox, oy, oz), texW, texH, 0, 16, 4, 12, 4);
        baseIndex = addBox(verts, idx, baseIndex, makeCorners(0, 0, -2, 4, 12, 2, swing, 12, yaw, ox, oy, oz), texW, texH, texH >= 64 ? 16 : 0, texH >= 64 ? 48 : 16, 4, 12, 4);
        if (texH >= 64) {
          baseIndex = addBox(verts, idx, baseIndex, makeCorners(-4 - overlay, 0 - overlay, -2 - overlay, 0 + overlay, 12 + overlay, 2 + overlay, -swing, 12, yaw, ox, oy, oz), texW, texH, 0, 32, 4, 12, 4);
          baseIndex = addBox(verts, idx, baseIndex, makeCorners(0 - overlay, 0 - overlay, -2 - overlay, 4 + overlay, 12 + overlay, 2 + overlay, swing, 12, yaw, ox, oy, oz), texW, texH, 0, 48, 4, 12, 4);
        }

        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.DYNAMIC_DRAW);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }

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
      uniform float uUseTex;
      in vec2 vUV;
      out vec4 outColor;
      void main(){
        vec4 col = uColor;
        if (uUseTex > 0.5) {
          col *= texture(uTex, vUV);
        }
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
    const uUseTex = gl.getUniformLocation(program, "uUseTex");

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
      gl.uniform1f(uUseTex, tex ? 1 : 0);
      gl.bindTexture(gl.TEXTURE_2D, tex || null);
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
      const maxEntityDistance = this._getMaxEntityRenderDistance();
      const maxEntityDistSq = maxEntityDistance * maxEntityDistance;
      gl.useProgram(program);
      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uTex, 0);
      gl.depthMask(true);

      for (const e of entities) {
        if (!e || Number.isFinite(e.itemType ?? e.blockType)) continue;
        const dxToPlayer = e.x - this.player.x;
        const dyToPlayer = e.y - this.player.y;
        const dzToPlayer = e.z - this.player.z;
        if (dxToPlayer * dxToPlayer + dyToPlayer * dyToPlayer + dzToPlayer * dzToPlayer > maxEntityDistSq) continue;
        const model = this.objModelLibrary?.getModel(e.type);
        if (!model) continue;
        const image = this.entityTextures?.getImage(e.type) || null;
        const tex = image ? this._getOrCreateSpriteTexture(image) : null;
        const buffer = getBuffer(e.type);
        if (!buffer) continue;
        if (!tex && e.type !== "sheep") continue;
        const def = getMobDef(e.type);
        const walkFactor = clamp(Math.hypot(e.vx || 0, e.vz || 0) / Math.max(0.1, def.speed || 1), 0, 1);
        const bob = Math.sin((e.age || 0) * 8) * 0.02 * walkFactor;
        const baseTint = e.type === "sheep" && !tex ? [0.97, 0.97, 0.95, 1] : [1, 1, 1, 1];
        const hurtTint = e.hurtTimer > 0 ? [1, 0.74, 0.74, 1] : baseTint;

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

  return {
    WebGLVoxelRenderer
  };
}
