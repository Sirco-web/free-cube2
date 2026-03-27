export function createWebGLCore({
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
}) {
  function mat4Identity() {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  function mat4Perspective(out, fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[15] = 0;

    if (far != null && far !== Infinity) {
      const nf = 1 / (near - far);
      out[10] = (far + near) * nf;
      out[14] = 2 * far * near * nf;
    } else {
      out[10] = -1;
      out[14] = -2 * near;
    }
    return out;
  }

  function mat4LookAt(out, eye, center, up) {
    let zx = eye[0] - center[0];
    let zy = eye[1] - center[1];
    let zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz);
    if (len === 0) {
      zz = 1;
      len = 1;
    }
    zx /= len;
    zy /= len;
    zz /= len;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (len === 0) {
      xx = 1;
      len = 1;
    }
    xx /= len;
    xy /= len;
    xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx;
    out[1] = yx;
    out[2] = zx;
    out[3] = 0;
    out[4] = xy;
    out[5] = yy;
    out[6] = zy;
    out[7] = 0;
    out[8] = xz;
    out[9] = yz;
    out[10] = zz;
    out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || "Shader compile failed";
      gl.deleteShader(shader);
      throw new Error(log);
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();
    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || "Program link failed";
      gl.deleteProgram(program);
      throw new Error(log);
    }
    return program;
  }

  class TextureArrayAtlas {
    constructor(gl, textures) {
      this.gl = gl;
      this.textures = textures;
      this.settings = textures?.settings || { ...DEFAULT_SETTINGS };
      this.texture = null;
      this.pathToLayer = new Map();
      this.blockFaceLayerCache = new Map();
      this.layerCount = 0;
    }

    getLayerForPath(path) {
      return this.pathToLayer.get(path) ?? 0;
    }

    getLayerForBlockFace(blockType, faceId) {
      const cacheKey = `${blockType}:${faceId}`;
      const cached = this.blockFaceLayerCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
      for (const path of getBlockTextureCandidates(blockType, faceId, this.settings)) {
        if (this.pathToLayer.has(path)) {
          const layer = this.getLayerForPath(path);
          this.blockFaceLayerCache.set(cacheKey, layer);
          return layer;
        }
      }
      this.blockFaceLayerCache.set(cacheKey, 0);
      return 0;
    }

    async build() {
      const gl = this.gl;
      await this.textures.startLoading();
      await this.textures.readyPromise;

      const uniquePaths = getAllBlockTexturePaths(this.settings).sort();

      this.pathToLayer.clear();
      this.blockFaceLayerCache.clear();
      uniquePaths.forEach((path, index) => this.pathToLayer.set(path, index));
      this.layerCount = Math.max(1, uniquePaths.length);

      const width = 128;
      const height = 128;
      const levels = 1;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, width, height, this.layerCount);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      for (let layer = 0; layer < uniquePaths.length; layer += 1) {
        const path = uniquePaths[layer];
        const image = this.textures.images.get(path);
        if (!image) {
          continue;
        }
        const source = image.width === width && image.height === height
          ? image
          : (() => {
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              ctx.imageSmoothingEnabled = false;
              ctx.clearRect(0, 0, width, height);
              ctx.drawImage(image, 0, 0, width, height);
              return canvas;
            })();
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, source);
      }

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
      this.texture = tex;
      return true;
    }
  }

  class GreedyChunkMesher {
    constructor(world, atlas) {
      this.world = world;
      this.atlas = atlas;
    }

    buildChunk(chunkX, chunkZ) {
      const baseX = chunkX * CHUNK_SIZE;
      const baseZ = chunkZ * CHUNK_SIZE;
      const chunk = this.world.peekChunk(chunkX, chunkZ);
      const verticesOpaque = [];
      const indicesOpaque = [];
      const verticesTrans = [];
      const indicesTrans = [];

      if (!chunk) {
        return {
          opaque: {
            vertices: new Float32Array(0),
            indices: new Uint32Array(0)
          },
          transparent: {
            vertices: new Float32Array(0),
            indices: new Uint32Array(0)
          }
        };
      }

      const size = [CHUNK_SIZE, clamp((chunk.meshMaxY || 0) + 2, 1, WORLD_HEIGHT), CHUNK_SIZE];

      const pushQuad = (vertexArray, indexArray, quadVerts, normal, uv, layer, light) => {
        const startIndex = (vertexArray.length / 10) | 0;
        for (let i = 0; i < 4; i += 1) {
          const v = quadVerts[i];
          vertexArray.push(
            v[0], v[1], v[2],
            normal[0], normal[1], normal[2],
            uv[i][0], uv[i][1],
            layer,
            light
          );
        }
        const edgeAX = quadVerts[1][0] - quadVerts[0][0];
        const edgeAY = quadVerts[1][1] - quadVerts[0][1];
        const edgeAZ = quadVerts[1][2] - quadVerts[0][2];
        const edgeBX = quadVerts[2][0] - quadVerts[0][0];
        const edgeBY = quadVerts[2][1] - quadVerts[0][1];
        const edgeBZ = quadVerts[2][2] - quadVerts[0][2];
        const faceNX = edgeAY * edgeBZ - edgeAZ * edgeBY;
        const faceNY = edgeAZ * edgeBX - edgeAX * edgeBZ;
        const faceNZ = edgeAX * edgeBY - edgeAY * edgeBX;
        const windingMatchesNormal = faceNX * normal[0] + faceNY * normal[1] + faceNZ * normal[2] >= 0;
        if (windingMatchesNormal) {
          indexArray.push(
            startIndex, startIndex + 1, startIndex + 2,
            startIndex, startIndex + 2, startIndex + 3
          );
        } else {
          indexArray.push(
            startIndex, startIndex + 2, startIndex + 1,
            startIndex, startIndex + 3, startIndex + 2
          );
        }
      };

      const getBlock = (lx, y, lz) => {
        if (y < 0 || y >= WORLD_HEIGHT) {
          return BLOCK.AIR;
        }
        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
          return chunk.getLocal(lx, y, lz);
        }
        return this.world.peekBlock(baseX + lx, y, baseZ + lz);
      };

      const axisInfo = [
        { d: 0, u: 1, v: 2, posFace: "east", negFace: "west" },
        { d: 1, u: 2, v: 0, posFace: "top", negFace: "bottom" },
        { d: 2, u: 1, v: 0, posFace: "south", negFace: "north" }
      ];

      for (const info of axisInfo) {
        const d = info.d;
        const u = info.u;
        const v = info.v;
        const du = [0, 0, 0];
        const dv = [0, 0, 0];

        for (const dir of [-1, 1]) {
          const faceId = dir === 1 ? info.posFace : info.negFace;
          const normal = d === 0 ? [dir, 0, 0] : d === 1 ? [0, dir, 0] : [0, 0, dir];
          const light = FACE_BY_ID[faceId]?.light ?? 1;
          const maskSizeU = size[u];
          const maskSizeV = size[v];
          const mask = new Array(maskSizeU * maskSizeV);

          for (let slice = 0; slice <= size[d]; slice += 1) {
            for (let iu = 0; iu < maskSizeU; iu += 1) {
              for (let iv = 0; iv < maskSizeV; iv += 1) {
                const coord = [0, 0, 0];
                coord[d] = slice;
                coord[u] = iu;
                coord[v] = iv;

                const aCoord = [...coord];
                const bCoord = [...coord];
                aCoord[d] = slice - 1;
                bCoord[d] = slice;

                const aType = getBlock(aCoord[0], aCoord[1], aCoord[2]);
                const bType = getBlock(bCoord[0], bCoord[1], bCoord[2]);
                const blockType = dir === 1 ? aType : bType;
                const neighborType = dir === 1 ? bType : aType;
                const blockCoord = dir === 1 ? aCoord : bCoord;

                const index = iu * maskSizeV + iv;
                if (blockType !== BLOCK.AIR && shouldRenderFace(blockType, neighborType)) {
                  const useFaceLighting = this.atlas?.settings?.shadows !== false;
                  mask[index] = {
                    blockType,
                    layer: this.atlas.getLayerForBlockFace(blockType, faceId),
                    transparent: !!BLOCK_INFO[blockType]?.transparent,
                    light: useFaceLighting
                      ? this.world.getFaceLightScale(baseX + blockCoord[0], blockCoord[1], baseZ + blockCoord[2], faceId)
                      : 1
                  };
                } else {
                  mask[index] = null;
                }
              }
            }

            for (let iu = 0; iu < maskSizeU; iu += 1) {
              for (let iv = 0; iv < maskSizeV; iv += 1) {
                const index = iu * maskSizeV + iv;
                const cell = mask[index];
                if (!cell) {
                  continue;
                }

                let width = 1;
                while (iv + width < maskSizeV) {
                  const next = mask[index + width];
                  if (!next || next.blockType !== cell.blockType || next.layer !== cell.layer || next.transparent !== cell.transparent || Math.abs(next.light - cell.light) > 0.001) {
                    break;
                  }
                  width += 1;
                }

                let height = 1;
                outer: while (iu + height < maskSizeU) {
                  for (let k = 0; k < width; k += 1) {
                    const next = mask[index + k + height * maskSizeV];
                    if (!next || next.blockType !== cell.blockType || next.layer !== cell.layer || next.transparent !== cell.transparent || Math.abs(next.light - cell.light) > 0.001) {
                      break outer;
                    }
                  }
                  height += 1;
                }

                const x = [0, 0, 0];
                x[d] = slice;
                x[u] = iu;
                x[v] = iv;

                du[0] = 0; du[1] = 0; du[2] = 0;
                dv[0] = 0; dv[1] = 0; dv[2] = 0;
                du[u] = height;
                dv[v] = width;

                const quad = [
                  [baseX + x[0], x[1], baseZ + x[2]],
                  [baseX + x[0] + dv[0], x[1] + dv[1], baseZ + x[2] + dv[2]],
                  [baseX + x[0] + dv[0] + du[0], x[1] + dv[1] + du[1], baseZ + x[2] + dv[2] + du[2]],
                  [baseX + x[0] + du[0], x[1] + du[1], baseZ + x[2] + du[2]]
                ];

                if (isFluidBlock(cell.blockType)) {
                  const waterSurfaceY = x[1] + (faceId === "top" ? -0.08 : 0.92);
                  if (faceId === "top") {
                    for (const point of quad) {
                      point[1] += waterSurfaceY - x[1];
                    }
                  } else if (faceId !== "bottom") {
                    for (const point of quad) {
                      if (point[1] > x[1]) {
                        point[1] = waterSurfaceY;
                      }
                      point[0] -= normal[0] * 0.02;
                      point[2] -= normal[2] * 0.02;
                    }
                  }
                }

                if (dir === -1) {
                  [quad[1], quad[3]] = [quad[3], quad[1]];
                }

                const uv = [
                  [0, 0],
                  [width, 0],
                  [width, height],
                  [0, height]
                ];
                if (dir === -1) {
                  [uv[1], uv[3]] = [uv[3], uv[1]];
                }
                if (cell.blockType !== BLOCK.LEAVES && (faceId === "south" || faceId === "west")) {
                  for (let i = 0; i < 4; i += 1) {
                    uv[i][0] = width - uv[i][0];
                  }
                }

                const targetVertices = cell.transparent ? verticesTrans : verticesOpaque;
                const targetIndices = cell.transparent ? indicesTrans : indicesOpaque;
                pushQuad(targetVertices, targetIndices, quad, normal, uv, cell.layer, light * cell.light);

                for (let hu = 0; hu < height; hu += 1) {
                  for (let wv = 0; wv < width; wv += 1) {
                    mask[index + wv + hu * maskSizeV] = null;
                  }
                }

                iv += width - 1;
              }
            }
          }
        }
      }

      return {
        opaque: {
          vertices: new Float32Array(verticesOpaque),
          indices: new Uint32Array(indicesOpaque)
        },
        transparent: {
          vertices: new Float32Array(verticesTrans),
          indices: new Uint32Array(indicesTrans)
        }
      };
    }
  }

  class WebGLChunkMesh {
    constructor(gl) {
      this.gl = gl;
      this.vao = gl.createVertexArray();
      this.vbo = gl.createBuffer();
      this.ibo = gl.createBuffer();
      this.indexCount = 0;
    }

    update(mesh) {
      const gl = this.gl;
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      this.indexCount = mesh.indices.length;

      const stride = 10 * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 8 * 4);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 9 * 4);

      gl.bindVertexArray(null);
    }

    draw() {
      const gl = this.gl;
      if (!this.indexCount) {
        return;
      }
      gl.bindVertexArray(this.vao);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
    }

    destroy() {
      const gl = this.gl;
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.vbo) gl.deleteBuffer(this.vbo);
      if (this.ibo) gl.deleteBuffer(this.ibo);
      this.vao = null;
      this.vbo = null;
      this.ibo = null;
      this.indexCount = 0;
    }
  }

  return {
    TextureArrayAtlas,
    GreedyChunkMesher,
    WebGLChunkMesh,
    compileShader,
    createProgram,
    mat4Identity,
    mat4LookAt,
    mat4Perspective
  };
}
