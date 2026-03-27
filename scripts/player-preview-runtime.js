export function createPlayerPreviewRuntime(deps) {
  const {
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
  } = deps;

function getArmorPreviewColor(itemType) {
  switch (itemType) {
    case ITEM.LEATHER_HELMET:
    case ITEM.LEATHER_CHESTPLATE:
    case ITEM.LEATHER_LEGGINGS:
    case ITEM.LEATHER_BOOTS:
      return "rgba(144, 98, 62, 0.86)";
    case ITEM.IRON_HELMET:
    case ITEM.IRON_CHESTPLATE:
    case ITEM.IRON_LEGGINGS:
    case ITEM.IRON_BOOTS:
      return "rgba(219, 226, 236, 0.88)";
    default:
      return "rgba(219, 226, 236, 0.82)";
  }
}

const PLAYER_PREVIEW_GL_CACHE = new WeakMap();
const PLAYER_PREVIEW_MESH_CACHE = new WeakMap();

function getPlayerPreviewGlRenderer(canvas) {
  let cached = PLAYER_PREVIEW_GL_CACHE.get(canvas);
  if (cached) {
    return cached;
  }
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });
  if (!gl) {
    return null;
  }

  const program = createProgram(
    gl,
    `
      attribute vec3 aPos;
      attribute vec2 aUV;
      attribute float aShade;
      uniform mat4 uProj;
      uniform mat4 uView;
      varying vec2 vUV;
      varying float vShade;
      void main() {
        vUV = aUV;
        vShade = aShade;
        gl_Position = uProj * uView * vec4(aPos, 1.0);
      }
    `,
    `
      precision mediump float;
      uniform sampler2D uTex;
      varying vec2 vUV;
      varying float vShade;
      void main() {
        vec4 tex = texture2D(uTex, vUV);
        if (tex.a < 0.06) discard;
        gl_FragColor = vec4(tex.rgb * vShade, tex.a);
      }
    `
  );

  const vaoExt = gl.getExtension("OES_vertex_array_object");
  const vao = vaoExt?.createVertexArrayOES?.() || null;
  const vbo = gl.createBuffer();
  const ibo = gl.createBuffer();
  const texture = gl.createTexture();
  const uProj = gl.getUniformLocation(program, "uProj");
  const uView = gl.getUniformLocation(program, "uView");
  const uTex = gl.getUniformLocation(program, "uTex");
  const aPos = gl.getAttribLocation(program, "aPos");
  const aUV = gl.getAttribLocation(program, "aUV");
  const aShade = gl.getAttribLocation(program, "aShade");

  const bindVao = () => {
    if (vaoExt && vao) {
      vaoExt.bindVertexArrayOES(vao);
    }
  };
  const unbindVao = () => {
    if (vaoExt) {
      vaoExt.bindVertexArrayOES(null);
    }
  };

  bindVao();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  const stride = 6 * 4;
  if (aPos >= 0) {
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
  }
  if (aUV >= 0) {
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 3 * 4);
  }
  if (aShade >= 0) {
    gl.enableVertexAttribArray(aShade);
    gl.vertexAttribPointer(aShade, 1, gl.FLOAT, false, stride, 5 * 4);
  }
  unbindVao();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  cached = {
    gl,
    program,
    vaoExt,
    vao,
    vbo,
    ibo,
    texture,
    uProj,
    uView,
    uTex,
    bindVao,
    unbindVao,
    lastSkin: null
  };
  PLAYER_PREVIEW_GL_CACHE.set(canvas, cached);
  return cached;
}

function buildPlayerPreviewMesh(skin, pose = {}) {
  const model = getPlayerSkinModel(skin);
  const headYaw = clamp(Number.isFinite(pose.headYaw) ? pose.headYaw : 0, -0.75, 0.75);
  const headPitch = clamp(Number.isFinite(pose.headPitch) ? pose.headPitch : 0, -0.45, 0.45);
  const usesDynamicPose = Math.abs(headYaw) > 0.001 || Math.abs(headPitch) > 0.001;
  const cached = PLAYER_PREVIEW_MESH_CACHE.get(skin);
  if (!usesDynamicPose && cached?.model === model) {
    return cached.mesh;
  }

  const verts = [];
  const idx = [];
  let baseIndex = 0;
  const texW = skin.width || 64;
  const texH = skin.height || 64;
  const scale = 1 / 16;
  const yaw = -Math.PI / 5.35;
  const headTilt = -0.08;
  const armSwing = 0.2;
  const legSwing = -0.14;
  const armWidth = model === "slim" ? 3 : 4;

  const pushFace = (p0, p1, p2, p3, uv0, uv1, uv2, uv3, shade = 1) => {
    verts.push(
      p0[0], p0[1], p0[2], uv0[0], uv0[1], shade,
      p1[0], p1[1], p1[2], uv1[0], uv1[1], shade,
      p2[0], p2[1], p2[2], uv2[0], uv2[1], shade,
      p3[0], p3[1], p3[2], uv3[0], uv3[1], shade
    );
    idx.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
    baseIndex += 4;
  };

  const rotatePoint = (x, y, z, rotX, pivotY, rotY = 0, pivotX = 0, pivotZ = 0) => {
    const dx = x - pivotX;
    const dz = z - pivotZ;
    const yx = dx * Math.cos(rotY) - dz * Math.sin(rotY);
    const yz = dx * Math.sin(rotY) + dz * Math.cos(rotY);
    const dy = y - pivotY;
    const ry = dy * Math.cos(rotX) - yz * Math.sin(rotX);
    const rz = dy * Math.sin(rotX) + yz * Math.cos(rotX);
    const lx = pivotX + yx;
    const ly = pivotY + ry;
    const lz = pivotZ + rz;
    const wx = (lx * Math.cos(yaw) - lz * Math.sin(yaw)) * scale;
    const wz = (lx * Math.sin(yaw) + lz * Math.cos(yaw)) * scale;
    const wy = ly * scale;
    return [wx, wy, wz];
  };

  const addBox = (x0, y0, z0, x1, y1, z1, u, v, w, h, d, rotX = 0, pivotY = y0, shade = {}, rotY = 0, pivotX = 0, pivotZ = 0) => {
    const points = [
      rotatePoint(x0, y0, z0, rotX, pivotY, rotY, pivotX, pivotZ),
      rotatePoint(x1, y0, z0, rotX, pivotY, rotY, pivotX, pivotZ),
      rotatePoint(x1, y1, z0, rotX, pivotY, rotY, pivotX, pivotZ),
      rotatePoint(x0, y1, z0, rotX, pivotY, rotY, pivotX, pivotZ),
      rotatePoint(x0, y0, z1, rotX, pivotY, rotY, pivotX, pivotZ),
      rotatePoint(x1, y0, z1, rotX, pivotY, rotY, pivotX, pivotZ),
      rotatePoint(x1, y1, z1, rotX, pivotY, rotY, pivotX, pivotZ),
      rotatePoint(x0, y1, z1, rotX, pivotY, rotY, pivotX, pivotZ)
    ];

    const scaleX = texW / 64;
    const scaleY = texH / 64;
    const rects = getSkinBoxFaceRects(u, v, w, h, d);
    const topUv = getSkinRectUvQuad(rects.top, texW, texH, scaleX, scaleY);
    const bottomUv = getSkinRectUvQuad(rects.bottom, texW, texH, scaleX, scaleY);
    const frontUv = getSkinRectUvQuad(rects.front, texW, texH, scaleX, scaleY);
    const backUv = getSkinRectUvQuad(rects.back, texW, texH, scaleX, scaleY);
    const leftUv = getSkinRectUvQuad(rects.left, texW, texH, scaleX, scaleY);
    const rightUv = getSkinRectUvQuad(rects.right, texW, texH, scaleX, scaleY);

    pushFace(points[7], points[6], points[2], points[3], topUv[0], topUv[1], topUv[2], topUv[3], shade.top || 1.04);
    pushFace(points[0], points[1], points[5], points[4], bottomUv[0], bottomUv[1], bottomUv[2], bottomUv[3], shade.bottom || 0.62);
    pushFace(points[4], points[5], points[6], points[7], frontUv[0], frontUv[1], frontUv[2], frontUv[3], shade.front || 1);
    pushFace(points[1], points[0], points[3], points[2], backUv[0], backUv[1], backUv[2], backUv[3], shade.back || 0.74);
    pushFace(points[0], points[4], points[7], points[3], leftUv[0], leftUv[1], leftUv[2], leftUv[3], shade.left || 0.82);
    pushFace(points[5], points[1], points[2], points[6], rightUv[0], rightUv[1], rightUv[2], rightUv[3], shade.right || 0.9);
  };

  const overlay = 0.25;
  const rightArmX0 = -4 - armWidth;
  const rightArmX1 = -4;
  const leftArmX0 = 4;
  const leftArmX1 = 4 + armWidth;

  addBox(-4, 24, -4, 4, 32, 4, 0, 0, 8, 8, 8, headTilt + headPitch, 28, { front: 1.06, top: 1.12 }, headYaw, 0, 0);
  addBox(-4 - overlay, 24 - overlay, -4 - overlay, 4 + overlay, 32 + overlay, 4 + overlay, 32, 0, 8, 8, 8, headTilt + headPitch, 28, { front: 1.08, top: 1.13, left: 0.86, right: 0.92, back: 0.78 }, headYaw, 0, 0);

  addBox(-4, 12, -2, 4, 24, 2, 16, 16, 8, 12, 4, 0, 12, { front: 1, top: 1.06 });
  addBox(-4 - overlay, 12 - overlay, -2 - overlay, 4 + overlay, 24 + overlay, 2 + overlay, 16, 32, 8, 12, 4, 0, 12, { front: 1.02, top: 1.08 });

  addBox(rightArmX0, 12, -2, rightArmX1, 24, 2, 40, 16, armWidth, 12, 4, armSwing, 24, { front: 0.99, top: 1.04 });
  addBox(rightArmX0 - overlay, 12 - overlay, -2 - overlay, rightArmX1 + overlay, 24 + overlay, 2 + overlay, 40, 32, armWidth, 12, 4, armSwing, 24, { front: 1, top: 1.05 });

  addBox(leftArmX0, 12, -2, leftArmX1, 24, 2, 32, 48, armWidth, 12, 4, -armSwing, 24, { front: 0.99, top: 1.04 });
  addBox(leftArmX0 - overlay, 12 - overlay, -2 - overlay, leftArmX1 + overlay, 24 + overlay, 2 + overlay, 48, 48, armWidth, 12, 4, -armSwing, 24, { front: 1, top: 1.05 });

  addBox(-4, 0, -2, 0, 12, 2, 0, 16, 4, 12, 4, legSwing, 12, { front: 0.97, top: 1.02 });
  addBox(-4 - overlay, 0 - overlay, -2 - overlay, 0 + overlay, 12 + overlay, 2 + overlay, 0, 32, 4, 12, 4, legSwing, 12, { front: 0.99, top: 1.04 });

  addBox(0, 0, -2, 4, 12, 2, 16, 48, 4, 12, 4, -legSwing, 12, { front: 0.97, top: 1.02 });
  addBox(0 - overlay, 0 - overlay, -2 - overlay, 4 + overlay, 12 + overlay, 2 + overlay, 0, 48, 4, 12, 4, -legSwing, 12, { front: 0.99, top: 1.04 });

  const mesh = {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(idx)
  };
  if (!usesDynamicPose) {
    PLAYER_PREVIEW_MESH_CACHE.set(skin, { model, mesh });
  }
  return mesh;
}

function renderPlayerPreviewWebGL(canvas, skinOverride = null) {
  if (!canvas) return false;
  const renderer = getPlayerPreviewGlRenderer(canvas);
  if (!renderer) {
    return false;
  }

  const skin = skinOverride || getDefaultPlayerSkinCanvas();
  canvas.width = 160;
  canvas.height = 240;
  const { gl } = renderer;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  if (renderer.lastSkin !== skin) {
    gl.bindTexture(gl.TEXTURE_2D, renderer.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skin);
    renderer.lastSkin = skin;
  }

  const lookX = clamp(Number(canvas.dataset.lookX) || 0, -1, 1);
  const lookY = clamp(Number(canvas.dataset.lookY) || 0, -1, 1);
  const mesh = buildPlayerPreviewMesh(skin, {
    headYaw: lookX * 0.48,
    headPitch: -lookY * 0.32
  });
  renderer.bindVao();
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, renderer.ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  const proj = mat4Identity();
  const view = mat4Identity();
  mat4Perspective(proj, Math.PI / 4.2, canvas.width / canvas.height, 0.1, 100);
  mat4LookAt(
    view,
    [1.45 + lookX * 0.16, 1.55 - lookY * 0.1, 3.15],
    [lookX * 0.22, 1.1 + lookY * 0.16, 0],
    [0, 1, 0]
  );

  gl.useProgram(renderer.program);
  gl.uniformMatrix4fv(renderer.uProj, false, proj);
  gl.uniformMatrix4fv(renderer.uView, false, view);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderer.texture);
  gl.uniform1i(renderer.uTex, 0);
  gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  renderer.unbindVao();
  return true;
}

function renderPlayerPreviewCanvas(canvas, armorItems = {}, skinOverride = null) {
  if (!canvas) return;
  if (canvas.dataset.previewMode !== "2d" && renderPlayerPreviewWebGL(canvas, skinOverride)) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const skin = skinOverride || getDefaultPlayerSkinCanvas();
  const hasOverlayLayers = (skin.height || 64) >= 64;
  const model = getPlayerSkinModel(skin);
  const armWidth = model === "slim" ? 3 : 4;

  canvas.width = 96;
  canvas.height = 176;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(18, 150, 60, 10);
  const faceCanvasCache = new Map();
  const solidFaceCache = new Map();

  const getFaceCanvas = (uv) => {
    if (!uv) return null;
    const key = uv.join(",");
    if (faceCanvasCache.has(key)) {
      return faceCanvasCache.get(key);
    }
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = uv[2];
    faceCanvas.height = uv[3];
    const faceCtx = faceCanvas.getContext("2d");
    faceCtx.imageSmoothingEnabled = false;
    faceCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
    faceCtx.drawImage(skin, uv[0], uv[1], uv[2], uv[3], 0, 0, uv[2], uv[3]);
    faceCanvasCache.set(key, faceCanvas);
    return faceCanvas;
  };

  const getSolidFace = (color) => {
    if (!color) return null;
    if (solidFaceCache.has(color)) {
      return solidFaceCache.get(color);
    }
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = 4;
    faceCanvas.height = 4;
    const faceCtx = faceCanvas.getContext("2d");
    faceCtx.imageSmoothingEnabled = false;
    faceCtx.fillStyle = color;
    faceCtx.fillRect(0, 0, faceCanvas.width, faceCanvas.height);
    faceCtx.strokeStyle = "rgba(255,255,255,0.18)";
    faceCtx.strokeRect(0, 0, faceCanvas.width, faceCanvas.height);
    solidFaceCache.set(color, faceCanvas);
    return faceCanvas;
  };

  const drawTexturedTriangle = (img, p0, p1, p2, u0, v0, u1, v1, u2, v2, alpha = 1) => {
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
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.setTransform(a, b, c, d, e, f);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  };

  const drawTexturedQuad = (img, points, alpha = 1) => {
    const w = img.width || 1;
    const h = img.height || 1;
    drawTexturedTriangle(img, points[0], points[1], points[2], 0, 0, w, 0, w, h, alpha);
    drawTexturedTriangle(img, points[0], points[2], points[3], 0, 0, w, h, 0, h, alpha);
  };

  const rotatePoint = (x, y, z, yaw, pitch) => {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const yawX = x * cosYaw - z * sinYaw;
    const yawZ = x * sinYaw + z * cosYaw;
    return {
      x: yawX,
      y: y * cosPitch - yawZ * sinPitch,
      z: y * sinPitch + yawZ * cosPitch
    };
  };

  const projectPoint = (point) => {
    const distance = point.z + 86;
    if (distance <= 4) return null;
    const perspective = 276 / distance;
    return {
      x: canvas.width * 0.5 + point.x * perspective,
      y: 110 - point.y * perspective,
      depth: distance
    };
  };

  const pushCuboid = (target, x, y, z, w, h, d, uvSet, inflate = 0, solidColor = null) => {
    if (!uvSet && !solidColor) return;
    const minX = x - inflate;
    const minY = y - inflate;
    const minZ = z - inflate;
    const maxX = x + w + inflate;
    const maxY = y + h + inflate;
    const maxZ = z + d + inflate;
    const imageFor = (uv) => solidColor ? getSolidFace(solidColor) : getFaceCanvas(uv);
    target.push(
      { normal: { x: 0, y: 0, z: -1 }, points: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ]], image: imageFor(uvSet?.front), light: 0.96 },
      { normal: { x: 1, y: 0, z: 0 }, points: [[maxX, minY, minZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ]], image: imageFor(uvSet?.right), light: 0.84 },
      { normal: { x: 0, y: 1, z: 0 }, points: [[minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]], image: imageFor(uvSet?.top), light: 1.04 }
    );
  };

  const headBaseRects = getSkinBoxFaceRects(0, 0, 8, 8, 8);
  const headOverlayRects = hasOverlayLayers ? getSkinBoxFaceRects(32, 0, 8, 8, 8) : null;
  const bodyBaseRects = getSkinBoxFaceRects(16, 16, 8, 12, 4);
  const bodyOverlayRects = hasOverlayLayers ? getSkinBoxFaceRects(16, 32, 8, 12, 4) : null;
  const rightArmBaseRects = getSkinBoxFaceRects(40, 16, armWidth, 12, 4);
  const rightArmOverlayRects = hasOverlayLayers ? getSkinBoxFaceRects(40, 32, armWidth, 12, 4) : null;
  const leftArmBaseRects = hasOverlayLayers ? getSkinBoxFaceRects(32, 48, armWidth, 12, 4) : rightArmBaseRects;
  const leftArmOverlayRects = hasOverlayLayers ? getSkinBoxFaceRects(48, 48, armWidth, 12, 4) : null;
  const rightLegBaseRects = getSkinBoxFaceRects(0, 16, 4, 12, 4);
  const rightLegOverlayRects = hasOverlayLayers ? getSkinBoxFaceRects(0, 32, 4, 12, 4) : null;
  const leftLegBaseRects = hasOverlayLayers ? getSkinBoxFaceRects(16, 48, 4, 12, 4) : rightLegBaseRects;
  const leftLegOverlayRects = hasOverlayLayers ? getSkinBoxFaceRects(0, 48, 4, 12, 4) : null;

  const headBase = { top: headBaseRects.top, front: headBaseRects.front, right: headBaseRects.right };
  const headOverlay = headOverlayRects ? { top: headOverlayRects.top, front: headOverlayRects.front, right: headOverlayRects.right } : null;
  const bodyBase = { top: bodyBaseRects.top, front: bodyBaseRects.front, right: bodyBaseRects.right };
  const bodyOverlay = bodyOverlayRects ? { top: bodyOverlayRects.top, front: bodyOverlayRects.front, right: bodyOverlayRects.right } : null;
  const rightArmBase = { top: rightArmBaseRects.top, front: rightArmBaseRects.front, right: rightArmBaseRects.right };
  const rightArmOverlay = rightArmOverlayRects ? { top: rightArmOverlayRects.top, front: rightArmOverlayRects.front, right: rightArmOverlayRects.right } : null;
  const leftArmBase = { top: leftArmBaseRects.top, front: leftArmBaseRects.front, right: leftArmBaseRects.right };
  const leftArmOverlay = leftArmOverlayRects ? { top: leftArmOverlayRects.top, front: leftArmOverlayRects.front, right: leftArmOverlayRects.right } : null;
  const rightLegBase = { top: rightLegBaseRects.top, front: rightLegBaseRects.front, right: rightLegBaseRects.right };
  const rightLegOverlay = rightLegOverlayRects ? { top: rightLegOverlayRects.top, front: rightLegOverlayRects.front, right: rightLegOverlayRects.right } : null;
  const leftLegBase = { top: leftLegBaseRects.top, front: leftLegBaseRects.front, right: leftLegBaseRects.right };
  const leftLegOverlay = leftLegOverlayRects ? { top: leftLegOverlayRects.top, front: leftLegOverlayRects.front, right: leftLegOverlayRects.right } : null;

  const faces = [];
  pushCuboid(faces, -4, 24, -4, 8, 8, 8, headBase);
  pushCuboid(faces, -4, 24, -4, 8, 8, 8, headOverlay, 0.5);
  pushCuboid(faces, -4, 12, -2, 8, 12, 4, bodyBase);
  pushCuboid(faces, -4, 12, -2, 8, 12, 4, bodyOverlay, 0.35);
  pushCuboid(faces, -8, 12, -2, armWidth, 12, 4, rightArmBase);
  pushCuboid(faces, -8, 12, -2, armWidth, 12, 4, rightArmOverlay, 0.28);
  pushCuboid(faces, 4, 12, -2, armWidth, 12, 4, leftArmBase);
  pushCuboid(faces, 4, 12, -2, armWidth, 12, 4, leftArmOverlay, 0.28);
  pushCuboid(faces, -4, 0, -2, 4, 12, 4, rightLegBase);
  pushCuboid(faces, -4, 0, -2, 4, 12, 4, rightLegOverlay, 0.22);
  pushCuboid(faces, 0, 0, -2, 4, 12, 4, leftLegBase);
  pushCuboid(faces, 0, 0, -2, 4, 12, 4, leftLegOverlay, 0.22);

  if (armorItems.head) {
    pushCuboid(faces, -4, 24, -4, 8, 8, 8, null, 0.8, getArmorPreviewColor(armorItems.head));
  }
  if (armorItems.chest) {
    const chestColor = getArmorPreviewColor(armorItems.chest);
    pushCuboid(faces, -4, 12, -2, 8, 12, 4, null, 0.6, chestColor);
    pushCuboid(faces, -8, 12, -2, armWidth, 12, 4, null, 0.4, chestColor);
    pushCuboid(faces, 4, 12, -2, armWidth, 12, 4, null, 0.4, chestColor);
  }
  if (armorItems.legs) {
    pushCuboid(faces, -4, 0, -2, 8, 12, 4, null, 0.4, getArmorPreviewColor(armorItems.legs));
  }
  if (armorItems.feet) {
    const bootsColor = getArmorPreviewColor(armorItems.feet);
    pushCuboid(faces, -4, 0, -2, 4, 4, 4, null, 0.25, bootsColor);
    pushCuboid(faces, 0, 0, -2, 4, 4, 4, null, 0.25, bootsColor);
  }

  const yaw = -0.56;
  const pitch = -0.36;
  const projectedFaces = [];
  for (const face of faces) {
    if (!face.image) continue;
    const rotatedNormal = rotatePoint(face.normal.x, face.normal.y, face.normal.z, yaw, pitch);
    if (rotatedNormal.z >= -0.02) continue;
    const points = [];
    let depth = 0;
    let visible = true;
    for (const point of face.points) {
      const rotated = rotatePoint(point[0], point[1] - 16, point[2], yaw, pitch);
      const projected = projectPoint(rotated);
      if (!projected) {
        visible = false;
        break;
      }
      depth += projected.depth;
      points.push(projected);
    }
    if (!visible) continue;
    projectedFaces.push({
      points,
      depth: depth / points.length,
      image: face.image,
      light: face.light
    });
  }

  projectedFaces.sort((a, b) => b.depth - a.depth);
  for (const face of projectedFaces) {
    drawTexturedQuad(face.image, face.points, 1);
    if (face.light < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(face.points[0].x, face.points[0].y);
      ctx.lineTo(face.points[1].x, face.points[1].y);
      ctx.lineTo(face.points[2].x, face.points[2].y);
      ctx.lineTo(face.points[3].x, face.points[3].y);
      ctx.closePath();
      ctx.fillStyle = `rgba(0,0,0,${(1 - face.light) * 0.34})`;
      ctx.fill();
      ctx.restore();
    } else if (face.light > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(face.points[0].x, face.points[0].y);
      ctx.lineTo(face.points[1].x, face.points[1].y);
      ctx.lineTo(face.points[2].x, face.points[2].y);
      ctx.lineTo(face.points[3].x, face.points[3].y);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${(face.light - 1) * 0.2})`;
      ctx.fill();
      ctx.restore();
    }
  }
}

function getOrCreatePlayerPreviewCanvas(container) {
  if (!container) return null;
  let canvas = container.querySelector("canvas.fc-inv-player-canvas");
  if (!canvas) {
    container.innerHTML = "";
    canvas = document.createElement("canvas");
    canvas.className = "fc-inv-player-canvas";
    container.appendChild(canvas);
  }
  canvas.dataset.previewMode = "2d";
  return canvas;
}

  return {
    getArmorPreviewColor,
    getOrCreatePlayerPreviewCanvas,
    renderPlayerPreviewCanvas,
    renderPlayerPreviewWebGL
  };
}
