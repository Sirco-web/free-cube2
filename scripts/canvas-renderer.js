export function createCanvasRendererRuntime(deps) {
  const {
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
  } = deps;

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
    this.weatherState = {
      timeSeconds: 0,
      intensity: 0,
      runtimeLowFps: false,
      weather: createWeatherState()
    };
  }

  setSettings(settings) {
    this.settings = settings;
  }

  setWeatherState(weatherState) {
    this.weatherState = weatherState || this.weatherState;
  }

  setRenderDistance(distance) {
    this.renderDistanceChunks = clamp(distance, 1, 12);
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
    const weatherState = this.weatherState || {};
    const weatherData = weatherState.weather || createWeatherState();
    const cycle = getDayCycleInfo(weatherState.timeSeconds || 0);
    const effectiveDaylight = getEffectiveDaylight(cycle, weatherData.type);
    const effectiveDarkness = 1 - effectiveDaylight;
    const weatherDarkness = getWeatherSkyDarkness(weatherData.type);
    const flash = clamp(weatherData.flash || 0, 0, 1);
    let skyTop = mixRgb(rgb(99, 183, 255), rgb(18, 24, 56), effectiveDarkness * 0.92);
    let skyMid = mixRgb(rgb(143, 209, 255), rgb(48, 72, 118), effectiveDarkness * 0.82);
    let skyBot = mixRgb(rgb(216, 243, 255), rgb(106, 118, 160), effectiveDarkness * 0.64);
    if (flash > 0.001) {
      skyTop = mixRgb(skyTop, rgb(232, 238, 255), flash * 0.5);
      skyMid = mixRgb(skyMid, rgb(228, 236, 255), flash * 0.42);
      skyBot = mixRgb(skyBot, rgb(220, 228, 248), flash * 0.32);
    }

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, rgba(skyTop, 1));
    sky.addColorStop(0.56, rgba(skyMid, 1));
    sky.addColorStop(1, rgba(skyBot, 1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, horizon);

    const haze = ctx.createLinearGradient(0, horizon, 0, this.height);
    haze.addColorStop(0, rgba(mixRgb(rgb(204, 228, 216), rgb(70, 86, 116), effectiveDarkness * 0.7 + weatherDarkness * 0.25), 0.96));
    haze.addColorStop(1, rgba(mixRgb(rgb(92, 156, 106), rgb(32, 44, 66), effectiveDarkness * 0.78 + weatherDarkness * 0.3), 0.92));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon, this.width, this.height - horizon);

    const sunX = this.width * 0.84;
    const sunY = this.height * 0.18;
    const sunSize = 20 * this.uiScale();
    if (!cycle.isNight || cycle.phase === "Sunrise" || cycle.phase === "Sunset") {
      ctx.fillStyle = rgba(this.sunColor, 0.18 * effectiveDaylight);
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunSize * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(this.sunColor, 0.98 * effectiveDaylight);
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunSize, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(226,232,255,0.14)";
      ctx.beginPath();
      ctx.arc(this.width * 0.78, this.height * 0.16, sunSize * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(240,244,255,0.88)";
      ctx.beginPath();
      ctx.arc(this.width * 0.78, this.height * 0.16, sunSize * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let index = 0; index < 7; index += 1) {
      const offset = ((this.cloudTime * (16 + index * 3) + index * 220) % (this.width + 480)) - 260;
      const y = this.height * (0.16 + index * 0.044);
      const width = (80 + index * 18) * this.uiScale();
      const height = (18 + index * 4) * this.uiScale();
      ctx.fillStyle = `rgba(255,255,255,${clamp(0.42 - effectiveDarkness * 0.18 - weatherDarkness * 0.24, 0.1, 0.42)})`;
      ctx.beginPath();
      ctx.ellipse(offset, y, width, height, 0, 0, Math.PI * 2);
      ctx.ellipse(offset + width * 0.46, y - height * 0.18, width * 0.76, height * 0.88, 0, 0, Math.PI * 2);
      ctx.ellipse(offset - width * 0.34, y + height * 0.07, width * 0.62, height * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPrecipitation() {
    const weatherPass = buildWeatherParticlePass(this.world, this.player, this.weatherState, this.settings);
    if (weatherPass.drops.length === 0 && weatherPass.splashes.length === 0) {
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "round";

    for (const drop of weatherPass.drops) {
      const start = this.projectPoint(drop.x, drop.y, drop.z) || this.projectPointClamped(drop.x, drop.y, drop.z);
      const end = this.projectPoint(drop.endX, drop.endY, drop.endZ) || this.projectPointClamped(drop.endX, drop.endY, drop.endZ);
      if (!start || !end) continue;
      const width = drop.type === "snow" ? Math.max(1, this.uiScale()) : Math.max(1, this.uiScale() * 0.9);
      ctx.strokeStyle = drop.type === "snow"
        ? `rgba(244, 248, 255, ${drop.alpha})`
        : `rgba(174, 216, 255, ${drop.alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    for (const splash of weatherPass.splashes) {
      const center = this.projectPoint(splash.x, splash.y, splash.z);
      if (!center) continue;
      const radius = Math.max(1.2, (200 / Math.max(0.4, center.depth)) * splash.size);
      ctx.strokeStyle = `rgba(202, 232, 255, ${splash.alpha})`;
      ctx.lineWidth = Math.max(1, this.uiScale() * 0.9);
      ctx.beginPath();
      ctx.moveTo(center.x - radius, center.y);
      ctx.lineTo(center.x + radius, center.y);
      ctx.moveTo(center.x, center.y - radius * 0.55);
      ctx.lineTo(center.x, center.y + radius * 0.55);
      ctx.stroke();
    }

    ctx.restore();
  }

  computeFaceStyle(face, depth) {
    const baseColor = getFaceColor(face.type, face.faceId);
    const faceDef = FACE_BY_ID[face.faceId];
    const shadowsEnabled = this.settings?.shadows !== false;
    const jitter = shadowsEnabled
      ? 0.95 + random3(face.x, face.y, face.z, face.type * 97 + face.faceId.length) * 0.1
      : 1;
    const dynamicLight = shadowsEnabled
      ? 0.22 + ((face.lightLevel || LIGHT_LEVEL_MAX) / LIGHT_LEVEL_MAX) * 0.78
      : 1;
    const lit = scaleRgb(baseColor, faceDef.light * dynamicLight * jitter);
    const fog = shadowsEnabled
      ? clamp((depth - 10) / ((this.renderDistanceChunks + 0.75) * CHUNK_SIZE), 0, 1) * 0.78
      : 0;
    const texture = this.textures?.getBlockFaceTexture(face.type, face.faceId, this.settings) || null;
    const alpha = BLOCK_INFO[face.type].alpha;
    const tintAlpha = texture ? (shadowsEnabled ? 0.18 : 0) : alpha;
    return {
      texture,
      tint: tintAlpha > 0 ? rgba(lit, tintAlpha) : "",
      fill: rgba(mixRgb(lit, this.skyFog, fog), alpha),
      stroke: rgba(scaleRgb(lit, 0.7), alpha < 1 ? Math.min(1, alpha + 0.18) : 0.34),
      shadowAlpha: shadowsEnabled ? clamp((1 - faceDef.light * jitter) * 0.45, 0.02, 0.28) : 0,
      fogAlpha: shadowsEnabled ? fog * 0.68 : 0,
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
      if (style.tint) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = style.tint;
        this.withQuadPath(points);
        ctx.fill();
      }
      if (style.shadowAlpha > 0.001) {
        ctx.fillStyle = `rgba(0,0,0,${style.shadowAlpha})`;
        this.withQuadPath(points);
        ctx.fill();
      }
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
      const width = height * (mob.entityKind === "remote_player" ? 0.5 : 0.6);
      const x = foot.x - width / 2;
      const y = Math.min(foot.y, head.y);
      const tex = mob.entityKind === "remote_player"
        ? (mob.billboardCanvas || null)
        : this.entityTextures?.getBillboardImage(mob.type) || this.entityTextures?.getImage(mob.type) || null;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (tex) {
        ctx.globalAlpha = 0.96;
        ctx.drawImage(tex, x, y, width, height);
      } else {
        ctx.fillStyle = mob.entityKind === "remote_player"
          ? "rgba(86, 164, 255, 0.92)"
          : mob.type === "zombie"
            ? "rgba(60,210,120,0.92)"
            : "rgba(240,240,240,0.92)";
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
      const tex = this.textures?.getItemTexture(item.itemType ?? item.blockType, this.settings) || null;
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
    const texture = this.textures?.getBlockFaceTexture(blockType, "top", this.settings);
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
      `${GAME_TITLE} ${GAME_VERSION}`,
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
    this.drawPrecipitation();
    if (currentTarget) {
      this.drawBlockOutline(currentTarget.x, currentTarget.y, currentTarget.z);
    }
    this.drawDebug(currentTarget);
  }
}

  return {
    VoxelRenderer
  };
}
