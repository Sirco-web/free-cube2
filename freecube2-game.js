// ============================================================================
// 🎮 FREECUBE2 GAME MODULE
// ============================================================================
// Completely separate from Sirco engine - can work with ANY engine
// Load with: index.html?game=/freecube2-game.js

// ============================================================================
// 🧠 TERRAIN GENERATION
// ============================================================================

class PerlinNoise {
  constructor(seed = 12345) {
    this.seed = seed;
    this.p = this._buildPermutation(seed);
  }

  _buildPermutation(seed) {
    const p = Array.from({length: 256}, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = Math.floor((seed / 2147483647) * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p.concat(p);
  }

  noise(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    
    const n00 = this._grad2d(xi, yi, xf, yf);
    const n10 = this._grad2d(xi + 1, yi, xf - 1, yf);
    const n01 = this._grad2d(xi, yi + 1, xf, yf - 1);
    const n11 = this._grad2d(xi + 1, yi + 1, xf - 1, yf - 1);
    
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return nx0 + v * (nx1 - nx0);
  }

  _grad2d(x, y, dx, dy) {
    const h = this.p[(this.p[x & 255] + y) & 255] & 3;
    const g = [[1,0], [-1,0], [0,1], [0,-1]][h];
    return g[0] * dx + g[1] * dy;
  }
}

class FractalNoise {
  constructor(seed = 12345) {
    this.noise = new PerlinNoise(seed);
    this.octaves = 4;
    this.persistence = 0.5;
    this.lacunarity = 2.0;
  }

  fractal(x, y) {
    let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
    for (let i = 0; i < this.octaves; i++) {
      value += this.noise.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }
    return value / maxValue;
  }
}

// Block system
const BlockTypes = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LEAVES: 5, WATER: 6, SAND: 7, LOG: 8, BEDROCK: 9 };
const BlockColors = {
  [BlockTypes.GRASS]: '#33aa33', [BlockTypes.DIRT]: '#8B6F47', [BlockTypes.STONE]: '#888888',
  [BlockTypes.WOOD]: '#8B4513', [BlockTypes.LEAVES]: '#228B22', [BlockTypes.WATER]: '#4488FF',
  [BlockTypes.SAND]: '#FFFF99', [BlockTypes.LOG]: '#654321', [BlockTypes.BEDROCK]: '#1a1a1a'
};

const CHUNK_SIZE = 16, WORLD_HEIGHT = 256;

class Chunk {
  constructor(chunkX, chunkZ, terrain) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.terrain = terrain;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.generated = false;
  }

  generate() {
    if (this.generated) return;
    this.generated = true;
    
    let solidBlockCount = 0;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const globalX = this.chunkX * CHUNK_SIZE + lx;
        const globalZ = this.chunkZ * CHUNK_SIZE + lz;
        const height = this.terrain.getHeight(globalX, globalZ);
        const riverVal = this.terrain.getRiver(globalX, globalZ);

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let blockType = BlockTypes.AIR;

          if (y === 0) blockType = BlockTypes.BEDROCK;
          else if (y < height - 3) blockType = BlockTypes.STONE;
          else if (y < height - 1) blockType = BlockTypes.DIRT;
          else if (y === Math.floor(height) - 1) {
            blockType = Math.abs(riverVal) < 0.02 && y <= this.terrain.seaLevel ? BlockTypes.WATER : BlockTypes.GRASS;
          } else if (y <= this.terrain.seaLevel) blockType = BlockTypes.WATER;

          this.setBlock(lx, y, lz, blockType);
          if (blockType !== BlockTypes.AIR) solidBlockCount++;
        }

        if (Math.random() < 0.05 && height > this.terrain.seaLevel) {
          this._generateTree(lx, Math.floor(height), lz);
        }
      }
    }
    
    if (this.chunkX === 0 && this.chunkZ === 0) {
      console.log(`📦 Chunk (0,0) generated with ${solidBlockCount} solid blocks`);
    }
  }

  _generateTree(x, y, z) {
    if (y + 5 >= WORLD_HEIGHT) return;
    const trunkHeight = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < trunkHeight; i++) this.setBlock(x, y + i, z, BlockTypes.LOG);
    const foliageStart = y + trunkHeight - 3;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy < 4; dy++) {
          const ly = foliageStart + dy;
          if (ly < WORLD_HEIGHT && Math.abs(dx) + Math.abs(dz) + dy * 0.5 < 4) {
            this.setBlock(x + dx, ly, z + dz, BlockTypes.LEAVES);
          }
        }
      }
    }
  }

  setBlock(x, y, z, type) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
    this.blocks[y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x] = type;
  }

  getBlock(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return BlockTypes.AIR;
    return this.blocks[y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x];
  }
}

class TerrainGenerator {
  constructor(seed) {
    this.heightNoise = new FractalNoise(seed);
    this.riverNoise = new FractalNoise(seed + 1000);
    this.seaLevel = 64;
  }

  getHeight(globalX, globalZ) {
    const mainHeight = this.heightNoise.fractal(globalX * 0.01, globalZ * 0.01) * 80;
    return Math.max(10, Math.min(120, 64 + mainHeight));
  }

  getRiver(globalX, globalZ) {
    return this.riverNoise.fractal(globalX * 0.005, globalZ * 0.005);
  }
}

class World {
  constructor(seed = 12345) {
    this.terrain = new TerrainGenerator(seed);
    this.chunks = new Map();
  }

  getChunk(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    if (!this.chunks.has(key)) {
      const chunk = new Chunk(chunkX, chunkZ, this.terrain);
      chunk.generate();
      this.chunks.set(key, chunk);
    }
    return this.chunks.get(key);
  }

  getBlock(x, y, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return this.getChunk(chunkX, chunkZ).getBlock(localX, y, localZ);
  }

  setBlock(x, y, z, type) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    this.getChunk(chunkX, chunkZ).setBlock(localX, y, localZ, type);
  }

  unloadFarChunks(playerChunkX, playerChunkZ, renderDistance = 4) {
    for (const key of this.chunks.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      const dist = Math.max(Math.abs(cx - playerChunkX), Math.abs(cz - playerChunkZ));
      if (dist > renderDistance) this.chunks.delete(key);
    }
  }
}

// ============================================================================
// 🎮 PLAYER
// ============================================================================

class GamePlayer {
  constructor() {
    // Position (eye height is 1.62 blocks above ground in Minecraft)
    this.x = 0; this.y = 100; this.z = 0;
    this.eyeHeight = 1.62;
    
    // Velocity
    this.vx = 0; this.vy = 0; this.vz = 0;
    
    // Rotation (yaw/pitch for first-person)
    this.yaw = 0; this.pitch = 0;
    
    // Jump state
    this.onGround = false;
    this.canJump = true;
    this.jumpPower = 0.42;
    this.gravity = 0.08;
    
    // Speed
    this.walkSpeed = 0.173; // blocks per update
    this.sprintSpeed = this.walkSpeed * 1.3;
    this.crouchSpeed = this.walkSpeed * 0.3;
    this.isSprinting = false;
    this.isCrouching = false;
    
    // Stats
    this.health = 20;
    this.maxHealth = 20;
    this.hunger = 20;
    this.maxHunger = 20;
    this.saturation = 5;
    this.exp = 0;
    this.armor = 0;
    
    // Inventory
    this.hotbar = [{type: BlockTypes.STONE, count: 64}];
    for (let i = 1; i < 9; i++) this.hotbar.push(null);
    this.selectedHotbarSlot = 0;
    this.inventory = [];
    
    // Interaction cooldown
    this.breakCooldown = 0;
    this.placeCooldown = 0;
  }

  update(dt, input, world) {
    // Mouse movement for camera
    const mouseSensitivity = 0.005;
    this.yaw += input.mouse.dx * mouseSensitivity;
    this.pitch += input.mouse.dy * mouseSensitivity;
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch)); // Clamp pitch

    // Movement input
    const moveDir = {x: 0, z: 0};
    const currentSpeed = this.isCrouching ? this.crouchSpeed : (this.isSprinting ? this.sprintSpeed : this.walkSpeed);

    if (input.isDown('w') || input.isDown('W')) {
      moveDir.x += Math.cos(this.yaw) * currentSpeed;
      moveDir.z += Math.sin(this.yaw) * currentSpeed;
    }
    if (input.isDown('s') || input.isDown('S')) {
      moveDir.x -= Math.cos(this.yaw) * currentSpeed;
      moveDir.z -= Math.sin(this.yaw) * currentSpeed;
    }
    if (input.isDown('a') || input.isDown('A')) {
      moveDir.x += Math.cos(this.yaw - Math.PI / 2) * currentSpeed;
      moveDir.z += Math.sin(this.yaw - Math.PI / 2) * currentSpeed;
    }
    if (input.isDown('d') || input.isDown('D')) {
      moveDir.x += Math.cos(this.yaw + Math.PI / 2) * currentSpeed;
      moveDir.z += Math.sin(this.yaw + Math.PI / 2) * currentSpeed;
    }

    this.vx = moveDir.x;
    this.vz = moveDir.z;

    // Jumping
    this.isSprinting = input.isDown('Shift') && !this.isCrouching && Math.sqrt(this.vx*this.vx + this.vz*this.vz) > 0;
    this.isCrouching = input.isDown('Shift');

    if (this.onGround && input.isDown(' ') && this.canJump) {
      this.vy = this.jumpPower;
      this.canJump = false;
    }

    // Gravity
    this.vy -= this.gravity;

    // Apply velocity
    this.x += this.vx;
    this.z += this.vz;
    this.y += this.vy;

    // Simple collision/ground detection
    if (world) {
      const groundLevel = Math.ceil(world.terrain.getHeight(this.x, this.z));
      const playerFeetY = this.y - this.eyeHeight;
      
      if (playerFeetY <= groundLevel) {
        this.y = groundLevel + this.eyeHeight;
        this.vy = Math.max(0, this.vy);
        this.onGround = true;
        this.canJump = true;
      } else {
        this.onGround = false;
      }
    }

    // Hotbar selection
    for (let i = 1; i <= 9; i++) {
      if (input.isDown(String(i))) this.selectedHotbarSlot = i - 1;
    }

    // Hunger/stamina
    if (this.isSprinting && this.hunger > 0) this.hunger -= 0.1;
    if (this.hunger <= 0) this.isSprinting = false;
    if (this.hunger > 0 && this.health < this.maxHealth) this.health += 0.01;

    // Cooldowns
    this.breakCooldown = Math.max(0, this.breakCooldown - 1);
    this.placeCooldown = Math.max(0, this.placeCooldown - 1);
  }

  getEyePosition() {
    return {x: this.x, y: this.y, z: this.z};
  }

  getDirection() {
    return {
      yaw: this.yaw,
      pitch: this.pitch,
      dirX: Math.cos(this.yaw) * Math.cos(this.pitch),
      dirY: Math.sin(this.pitch),
      dirZ: Math.sin(this.yaw) * Math.cos(this.pitch)
    };
  }
}

// ============================================================================
// 🎮 WEBGL VOXEL RENDERER (GPU-accelerated, much faster)
// ============================================================================

class WebGLVoxelRenderer {
  constructor(canvas, world, player) {
    this.canvas = canvas;
    this.world = world;
    this.player = player;
    
    // Try to get WebGL context (2 or 3)
    this.gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!this.gl) {
      console.warn('⚠️ WebGL not supported, falling back to raycasting');
      this.enabled = false;
      return;
    }
    
    this.enabled = true;
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.clearColor(0.53, 0.81, 0.92, 1.0); // Sky blue
    
    this.renderDistance = 4;
    this.chunkMeshes = new Map(); // chunkKey -> { vertexBuffer, indexBuffer, indexCount }
    
    this._initShaders();
    this._createCubeMesh();
  }

  _initShaders() {
    const gl = this.gl;
    
    // Vertex shader
    const vsSource = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec3 aColor;
      
      uniform mat4 uProjection;
      uniform mat4 uView;
      uniform mat4 uModel;
      
      varying vec3 vNormal;
      varying vec3 vColor;
      
      void main() {
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
        vNormal = normalize(aNormal);
        vColor = aColor;
      }
    `;
    
    // Fragment shader
    const fsSource = `
      precision mediump float;
      varying vec3 vNormal;
      varying vec3 vColor;
      
      void main() {
        vec3 light = normalize(vec3(1.0, 1.0, 1.0));
        float brightness = max(dot(vNormal, light), 0.3);
        gl_FragColor = vec4(vColor * brightness, 1.0);
      }
    `;
    
    const program = this._createProgram(vsSource, fsSource);
    this.program = program;
    this.aPosition = gl.getAttribLocation(program, 'aPosition');
    this.aNormal = gl.getAttribLocation(program, 'aNormal');
    this.aColor = gl.getAttribLocation(program, 'aColor');
    this.uProjection = gl.getUniformLocation(program, 'uProjection');
    this.uView = gl.getUniformLocation(program, 'uView');
    this.uModel = gl.getUniformLocation(program, 'uModel');
  }

  _createProgram(vsSource, fsSource) {
    const gl = this.gl;
    const program = gl.createProgram();
    
    const vs = this._compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = this._compileShader(fsSource, gl.FRAGMENT_SHADER);
    
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader program failed to link:', gl.getProgramInfoLog(program));
    }
    
    return program;
  }

  _compileShader(source, type) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
    }
    
    return shader;
  }

  _createCubeMesh() {
    // Unit cube vertices (-0.5 to 0.5)
    const vertices = [
      // Front face
      -0.5, -0.5, 0.5,   0.5, -0.5, 0.5,   0.5, 0.5, 0.5,   -0.5, 0.5, 0.5,
      // Back face
      -0.5, -0.5, -0.5,   -0.5, 0.5, -0.5,   0.5, 0.5, -0.5,   0.5, -0.5, -0.5,
      // Top face
      -0.5, 0.5, -0.5,   -0.5, 0.5, 0.5,   0.5, 0.5, 0.5,   0.5, 0.5, -0.5,
      // Bottom face
      -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5, 0.5,   -0.5, -0.5, 0.5,
      // Right face
      0.5, -0.5, -0.5,   0.5, 0.5, -0.5,   0.5, 0.5, 0.5,   0.5, -0.5, 0.5,
      // Left face
      -0.5, -0.5, -0.5,   -0.5, -0.5, 0.5,   -0.5, 0.5, 0.5,   -0.5, 0.5, -0.5
    ];
    
    const indices = [
      0, 1, 2,   0, 2, 3,     // Front
      4, 5, 6,   4, 6, 7,     // Back
      8, 9, 10,  8, 10, 11,   // Top
      12, 13, 14, 12, 14, 15, // Bottom
      16, 17, 18, 16, 18, 19, // Right
      20, 21, 22, 20, 22, 23  // Left
    ];
    
    const normals = [];
    for (let i = 0; i < 6; i++) {
      const normal = [
        [0, 0, 1],    // Front
        [0, 0, -1],   // Back
        [0, 1, 0],    // Top
        [0, -1, 0],   // Bottom
        [1, 0, 0],    // Right
        [-1, 0, 0]    // Left
      ][i];
      for (let j = 0; j < 4; j++) normals.push(...normal);
    }
    
    this.cubeVertices = new Float32Array(vertices);
    this.cubeNormals = new Float32Array(normals);
    this.cubeIndices = indices;
  }

  setRenderDistance(distance) {
    this.renderDistance = Math.max(1, Math.min(16, distance));
  }

  render() {
    if (!this.enabled) return;
    
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    
    // Set up matrices
    const w = this.canvas.width;
    const h = this.canvas.height;
    const fov = Math.PI / 3; // 60 degrees
    
    // Perspective matrix
    const projection = this._perspective(fov, w / h, 0.1, 1000);
    
    // View matrix
    const eye = [this.player.x, this.player.y, this.player.z];
    const dir = {
      x: Math.cos(this.player.yaw) * Math.cos(this.player.pitch),
      y: Math.sin(this.player.pitch),
      z: Math.sin(this.player.yaw) * Math.cos(this.player.pitch)
    };
    const center = [eye[0] + dir.x, eye[1] + dir.y, eye[2] + dir.z];
    const view = this._lookAt(eye, center, [0, 1, 0]);
    
    gl.uniformMatrix4fv(this.uProjection, false, projection);
    gl.uniformMatrix4fv(this.uView, false, view);
    
    // Render visible chunks
    const playerChunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(this.player.z / CHUNK_SIZE);
    
    for (let cx = playerChunkX - this.renderDistance; cx <= playerChunkX + this.renderDistance; cx++) {
      for (let cz = playerChunkZ - this.renderDistance; cz <= playerChunkZ + this.renderDistance; cz++) {
        this._renderChunk(cx, cz);
      }
    }
  }

  _renderChunk(chunkX, chunkZ) {
    const gl = this.gl;
    const chunk = this.world.getChunk(chunkX, chunkZ);
    if (!chunk) return;
    
    // Simple block rendering - draw each block as a cube
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let y = 0; y < Math.min(WORLD_HEIGHT, this.player.y + 50); y++) {
          const blockType = chunk.getBlock(lx, y, lz);
          if (blockType === BlockTypes.AIR) continue;
          
          const color = this._getBlockColor(blockType);
          const globalX = chunkX * CHUNK_SIZE + lx;
          const globalZ = chunkZ * CHUNK_SIZE + lz;
          
          this._drawBlock(globalX, y, globalZ, color);
        }
      }
    }
  }

  _drawBlock(x, y, z, color) {
    const gl = this.gl;
    
    // Create model matrix for block position
    const model = this._translate(x, y, z);
    gl.uniformMatrix4fv(this.uModel, false, model);
    
    // Set color attribute
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    
    const colors = [];
    for (let i = 0; i < 24; i++) {
      colors.push(...color);
    }
    
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.aColor);
    
    // Position
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.cubeVertices, gl.STATIC_DRAW);
    gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.aPosition);
    
    // Normals
    const normBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.cubeNormals, gl.STATIC_DRAW);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.aNormal);
    
    // Draw
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.cubeIndices), gl.STATIC_DRAW);
    gl.drawElements(gl.TRIANGLES, this.cubeIndices.length, gl.UNSIGNED_SHORT, 0);
  }

  _getBlockColor(blockType) {
    const colors = {
      [BlockTypes.GRASS]: [0.2, 0.67, 0.2],
      [BlockTypes.DIRT]: [0.55, 0.44, 0.28],
      [BlockTypes.STONE]: [0.53, 0.53, 0.53],
      [BlockTypes.WOOD]: [0.55, 0.27, 0.07],
      [BlockTypes.LEAVES]: [0.13, 0.55, 0.13],
      [BlockTypes.WATER]: [0.27, 0.53, 1.0],
      [BlockTypes.SAND]: [1.0, 1.0, 0.6],
      [BlockTypes.LOG]: [0.4, 0.27, 0.13],
      [BlockTypes.BEDROCK]: [0.1, 0.1, 0.1]
    };
    return colors[blockType] || [1, 1, 1];
  }

  // Matrix math helpers
  _perspective(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1.0 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0
    ];
  }

  _lookAt(eye, center, up) {
    const zAxis = [eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]].normalize();
    const xAxis = this._cross(up, zAxis).normalize();
    const yAxis = this._cross(zAxis, xAxis).normalize();
    
    return [
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -this._dot(xAxis, eye), -this._dot(yAxis, eye), -this._dot(zAxis, eye), 1
    ];
  }

  _translate(x, y, z) {
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, z, 1
    ];
  }

  _dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  _cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
}

// Add normalize method to arrays
if (!Array.prototype.normalize) {
  Array.prototype.normalize = function() {
    const len = Math.sqrt(this[0] * this[0] + this[1] * this[1] + this[2] * this[2]);
    return [this[0] / len, this[1] / len, this[2] / len];
  };
}

// ============================================================================
// 👁️ FIRST-PERSON RENDERER (Raycasting for voxel blocks)
// ============================================================================

class FirstPersonRenderer {
  constructor(canvas, world, player, textureAtlas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.player = player;
    this.textureAtlas = textureAtlas;
    
    this.renderDistance = 4;
    this.fov = Math.PI / 3; // 60 degrees
    this.screenWidth = canvas.width;
    this.screenHeight = canvas.height;
    
    // Enable cursor lock on canvas click
    canvas.addEventListener('click', () => this._requestPointerLock());
    document.addEventListener('pointerlockchange', () => this._onPointerLockChange());
    document.addEventListener('mozpointerlockchange', () => this._onPointerLockChange());
    this.pointerLocked = false;
  }
  
  _requestPointerLock() {
    this.canvas.requestPointerLock = this.canvas.requestPointerLock || this.canvas.mozRequestPointerLock;
    this.canvas.requestPointerLock();
  }
  
  _onPointerLockChange() {
    this.pointerLocked = document.pointerLockElement === this.canvas || document.mozPointerLockElement === this.canvas;
    if (this.pointerLocked) {
      console.log('🔒 Cursor locked - click again to unlock');
    }
  }

  setRenderDistance(distance) {
    this.renderDistance = Math.max(1, Math.min(16, distance));
  }

  render() {
    const ctx = this.ctx;
    const w = this.screenWidth;
    const h = this.screenHeight;

    // Clear sky (gradient)
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#E0F6FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Draw terrain using raycasting
    this._raycastAndRender(ctx);

    // Draw crosshair
    this._drawCrosshair(ctx);
  }

  _raycastAndRender(ctx) {
    const w = this.screenWidth;
    const h = this.screenHeight;
    const eye = this.player.getEyePosition();
    const dir = this.player.getDirection();
    
    const pixelSize = this.fov / w;
    const pixelStep = 1; // Render EVERY pixel for visibility

    for (let x = 0; x < w; x += pixelStep) {
      // Calculate ray angle for this screen column
      const rayAngleOffset = (x - w / 2) * pixelSize;
      const rayAngle = dir.yaw + rayAngleOffset;
      
      const rayDirX = Math.cos(rayAngle) * Math.cos(dir.pitch);
      const rayDirZ = Math.sin(rayAngle) * Math.cos(dir.pitch);

      // For each vertical pixel, cast a ray
      for (let y = 0; y < h; y += pixelStep) {
        // Map screen Y to pitch angle
        const screenYOffset = (y - h / 2) / h;
        const verticalAngle = dir.pitch + screenYOffset * (this.fov / 2);
        
        const rayDirY = Math.tan(verticalAngle);
        
        // Cast ray and find hit block
        const hit = this._castRay(eye.x, eye.y, eye.z, rayDirX, rayDirY, rayDirZ);
        
        if (hit) {
          // Get texture or color
          const color = this._getBlockColorOrTexture(hit.blockType, hit.blockX, hit.blockY, hit.blockZ, hit.faceNormal);
          ctx.fillStyle = color;
          ctx.fillRect(x, y, pixelStep, pixelStep);
        } else {
          // Sky gradient
          const skyColor = `rgb(${Math.floor(135 + 30 * screenYOffset)}, ${Math.floor(206 + 50 * screenYOffset)}, 235)`;
          ctx.fillStyle = skyColor;
          ctx.fillRect(x, y, pixelStep, pixelStep);
        }
      }
    }
  }

  _castRay(sx, sy, sz, dx, dy, dz) {
    const maxDist = this.renderDistance * CHUNK_SIZE * 2;
    const stepSize = 0.05; // Smaller steps for better block detection
    let lastValidDist = 0;
    let debugRayFireCount = 0;
    
    // Normalize direction vector
    const dirLen = Math.sqrt(dx*dx + dy*dy + dz*dz);
    dx /= dirLen; dy /= dirLen; dz /= dirLen;
    
    for (let dist = 0; dist < maxDist; dist += stepSize) {
      const x = sx + dx * dist;
      const y = sy + dy * dist;
      const z = sz + dz * dist;

      const blockX = Math.floor(x);
      const blockY = Math.floor(y);
      const blockZ = Math.floor(z);

      // Check bounds
      if (blockY < 0 || blockY >= WORLD_HEIGHT) continue;

      const chunkX = Math.floor(blockX / CHUNK_SIZE);
      const chunkZ = Math.floor(blockZ / CHUNK_SIZE);
      
      // Make sure chunk is generated
      const chunk = this.world.getChunk(chunkX, chunkZ);
      if (!chunk || !chunk.generated) continue;

      const lx = ((blockX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((blockZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      
      const blockType = chunk.getBlock(lx, blockY, lz);
      if (blockType !== BlockTypes.AIR) {
        debugRayFireCount++;
        if (debugRayFireCount === 1) {
          console.log(`🎯 Ray hit block! Type: ${blockType}, Pos: (${blockX}, ${blockY}, ${blockZ}), Dist: ${dist.toFixed(2)}`);
        }
        
        // Determine which face was hit based on ray direction
        let faceNormal = 'front';
        if (Math.abs(dx) > Math.abs(dz)) {
          faceNormal = dx > 0 ? 'east' : 'west';
        } else {
          faceNormal = dz > 0 ? 'south' : 'north';
        }
        if (Math.abs(dy) > 0.5) {
          faceNormal = dy > 0 ? 'top' : 'bottom';
        }
        
        return {
          distance: dist,
          blockType: blockType,
          blockX: blockX,
          blockY: blockY,
          blockZ: blockZ,
          faceNormal: faceNormal
        };
      }
    }
    return null;
  }

  _getBlockColorOrTexture(blockType, blockX, blockY, blockZ, faceNormal) {
    // If textures are loaded, sample from texture atlas
    if (this.textureAtlas && this.textureAtlas.loaded && this.textureAtlas.image) {
      return this._sampleTexture(blockType, blockX, blockY, blockZ, faceNormal);
    }
    
    // Fall back to solid color
    const color = BlockColors[blockType] || '#ffffff';
    
    // Shade based on face direction
    switch(faceNormal) {
      case 'top':
        return this._shadeColor(color, 120);
      case 'bottom':
        return this._shadeColor(color, 60);
      case 'east':
      case 'west':
        return this._shadeColor(color, 90);
      case 'north':
      case 'south':
        return this._shadeColor(color, 80);
      default:
        return color;
    }
  }
  
  _sampleTexture(blockType, blockX, blockY, blockZ, faceNormal) {
    // Try individual PNG first
    if (this.textureAtlas.blockImageMap.has(blockType)) {
      const imgObj = this.textureAtlas.blockImageMap.get(blockType);
      return this._sampleFromImage(imgObj, blockX, blockY, blockZ, faceNormal);
    }
    
    // Fall back to spritesheet
    const texName = this.textureAtlas.blockTextureMap.get(blockType);
    if (!texName) return BlockColors[blockType] || '#ffffff';
    
    const texInfo = this.textureAtlas.textures.get(texName);
    if (!texInfo || !this.textureAtlas.image) return BlockColors[blockType] || '#ffffff';
    
    return this._sampleFromAtlas(this.textureAtlas.image, texInfo, blockX, blockY, blockZ, faceNormal);
  }

  _sampleFromImage(image, blockX, blockY, blockZ, faceNormal) {
    if (!image || !image.width) return BlockColors[BlockTypes.STONE] || '#888888';
    
    // Get local coordinates within block (0-1 range)
    let localX = blockX - Math.floor(blockX);
    let localY = blockY - Math.floor(blockY);
    let localZ = blockZ - Math.floor(blockZ);
    
    // Get pixel position in individual PNG
    let pixelX, pixelY;
    switch(faceNormal) {
      case 'top':
        pixelX = Math.floor(localX * (image.width - 1));
        pixelY = Math.floor(localZ * (image.height - 1));
        break;
      case 'bottom':
        pixelX = Math.floor(localX * (image.width - 1));
        pixelY = Math.floor((1 - localZ) * (image.height - 1));
        break;
      case 'north':
      case 'south':
        pixelX = Math.floor(localX * (image.width - 1));
        pixelY = Math.floor(localY * (image.height - 1));
        break;
      case 'east':
      case 'west':
        pixelX = Math.floor(localZ * (image.width - 1));
        pixelY = Math.floor(localY * (image.height - 1));
        break;
      default:
        pixelX = Math.floor(localX * (image.width - 1));
        pixelY = Math.floor(localY * (image.height - 1));
    }
    
    // Sample pixel from image
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctxTemp = canvas.getContext('2d');
      ctxTemp.drawImage(image, pixelX, pixelY, 1, 1, 0, 0, 1, 1);
      const imageData = ctxTemp.getImageData(0, 0, 1, 1).data;
      return `rgb(${imageData[0]}, ${imageData[1]}, ${imageData[2]})`;
    } catch (err) {
      return BlockColors[BlockTypes.STONE] || '#888888';
    }
  }

  _sampleFromAtlas(atlasImage, texInfo, blockX, blockY, blockZ, faceNormal) {
    // Get local coordinates within block (0-1 range)
    let localX = blockX - Math.floor(blockX);
    let localY = blockY - Math.floor(blockY);
    let localZ = blockZ - Math.floor(blockZ);
    
    // Get pixel position in texture based on face
    let pixelX, pixelY;
    switch(faceNormal) {
      case 'top':
        pixelX = (texInfo.x + localX * texInfo.width) | 0;
        pixelY = (texInfo.y + localZ * texInfo.height) | 0;
        break;
      case 'bottom':
        pixelX = (texInfo.x + localX * texInfo.width) | 0;
        pixelY = (texInfo.y + (1 - localZ) * texInfo.height) | 0;
        break;
      case 'north':
      case 'south':
        pixelX = (texInfo.x + localX * texInfo.width) | 0;
        pixelY = (texInfo.y + localY * texInfo.height) | 0;
        break;
      case 'east':
      case 'west':
        pixelX = (texInfo.x + localZ * texInfo.width) | 0;
        pixelY = (texInfo.y + localY * texInfo.height) | 0;
        break;
      default:
        pixelX = (texInfo.x + localX * texInfo.width) | 0;
        pixelY = (texInfo.y + localY * texInfo.height) | 0;
    }
    
    // Clamp to texture bounds
    pixelX = Math.max(0, Math.min(pixelX, texInfo.x + texInfo.width - 1));
    pixelY = Math.max(0, Math.min(pixelY, texInfo.y + texInfo.height - 1));
    
    // Sample pixel from texture image
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctxTemp = canvas.getContext('2d');
      ctxTemp.drawImage(atlasImage, pixelX, pixelY, 1, 1, 0, 0, 1, 1);
      const imageData = ctxTemp.getImageData(0, 0, 1, 1).data;
      return `rgb(${imageData[0]}, ${imageData[1]}, ${imageData[2]})`;
    } catch(e) {
      return BlockColors[blockType] || '#ffffff';
    }
  }

  _shadeColor(color, percent) {
    const usePound = color[0] === '#';
    const col = usePound ? color.slice(1) : color;
    const num = parseInt(col, 16);
    const amt = Math.round(2.55 * (percent - 100));
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }

  _drawCrosshair(ctx) {
    const centerX = this.screenWidth / 2;
    const centerY = this.screenHeight / 2;
    const size = 10;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY);
    ctx.lineTo(centerX + size, centerY);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - size);
    ctx.lineTo(centerX, centerY + size);
    ctx.stroke();

    ctx.globalAlpha = 1.0;
  }
}

// ============================================================================
// 🎨 HUD (Heads Up Display) System
// ============================================================================

class GameHUD {
  constructor(canvas, player) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.player = player;
    this.showDebug = false;
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Draw hotbar
    this._drawHotbar(ctx, w, h);

    // Draw health
    this._drawHealth(ctx, w, h);

    // Draw hunger
    this._drawHunger(ctx, w, h);

    // Draw experience bar
    this._drawExperienceBar(ctx, w, h);

    // Draw debug info if enabled
    if (this.showDebug) {
      this._drawDebugInfo(ctx, w, h);
    }
  }

  _drawHotbar(ctx, w, h) {
    const slotSize = 40;
    const slots = 9;
    const totalWidth = slotSize * slots + 10 * (slots - 1);
    const startX = (w - totalWidth) / 2;
    const startY = h - 70;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(startX - 5, startY - 5, totalWidth + 10, slotSize + 10);

    for (let i = 0; i < slots; i++) {
      const x = startX + i * (slotSize + 10);
      const y = startY;

      // Slot background
      ctx.fillStyle = this.player.selectedHotbarSlot === i ? '#FFA500' : '#8B8B8B';
      ctx.fillRect(x, y, slotSize, slotSize);

      // Slot border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, slotSize, slotSize);

      // Item in slot
      const item = this.player.hotbar[i];
      if (item) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(String(item.count), x + slotSize - 5, y + slotSize - 5);
      }
    }
  }

  _drawHealth(ctx, w, h) {
    const heartSize = 9;
    const maxHearts = this.player.maxHealth / 2;
    const startX = 10;
    const startY = h - 40;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(startX - 5, startY - 5, maxHearts * (heartSize + 2) + 10, heartSize + 10);

    for (let i = 0; i < maxHearts; i++) {
      const x = startX + i * (heartSize + 2);
      const y = startY;

      const health = Math.min(2, Math.max(0, this.player.health - i * 2));
      
      if (health === 2) {
        ctx.fillStyle = '#FF0000'; // Full heart
      } else if (health === 1) {
        ctx.fillStyle = '#FF6666'; // Half heart
      } else {
        ctx.fillStyle = '#444444'; // Empty heart
      }

      ctx.fillRect(x, y, heartSize, heartSize);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.ceil(this.player.health)} / ${this.player.maxHealth}`, startX + maxHearts * (heartSize + 2) + 10, startY + heartSize - 2);
  }

  _drawHunger(ctx, w, h) {
    const foodSize = 9;
    const maxFood = this.player.maxHunger / 2;
    const startX = w - 10 - maxFood * (foodSize + 2);
    const startY = h - 40;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(startX - 5, startY - 5, maxFood * (foodSize + 2) + 10, foodSize + 10);

    for (let i = 0; i < maxFood; i++) {
      const x = startX + i * (foodSize + 2);
      const y = startY;

      const hunger = Math.min(2, Math.max(0, this.player.hunger - i * 2));

      if (hunger === 2) {
        ctx.fillStyle = '#FF8C00'; // Full food
      } else if (hunger === 1) {
        ctx.fillStyle = '#FFB366'; // Half food
      } else {
        ctx.fillStyle = '#444444'; // Empty food
      }

      ctx.fillRect(x, y, foodSize, foodSize);
    }
  }

  _drawExperienceBar(ctx, w, h) {
    const barWidth = 200;
    const barHeight = 5;
    const startX = (w - barWidth) / 2;
    const startY = h - 125;

    ctx.fillStyle = '#000000';
    ctx.fillRect(startX - 2, startY - 2, barWidth + 4, barHeight + 4);

    ctx.fillStyle = '#00BB00';
    const progress = this.player.exp % 100;
    ctx.fillRect(startX, startY, (progress / 100) * barWidth, barHeight);

    ctx.strokeStyle = '#00AA00';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, startY, barWidth, barHeight);
  }

  _drawDebugInfo(ctx, w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 300, 120);

    ctx.fillStyle = '#00FF00';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';

    const lines = [
      `Pos: ${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}, ${this.player.z.toFixed(1)}`,
      `Yaw: ${(this.player.yaw * 180 / Math.PI).toFixed(0)}°`,
      `Pitch: ${(this.player.pitch * 180 / Math.PI).toFixed(0)}°`,
      `On Ground: ${this.player.onGround}`,
      `Health: ${this.player.health} / ${this.player.maxHealth}`,
      `Hunger: ${this.player.hunger} / ${this.player.maxHunger}`,
      `[F3] Toggle Debug`
    ];

    lines.forEach((line, idx) => {
      ctx.fillText(line, 20, 25 + idx * 15);
    });
  }

  toggleDebug() {
    this.showDebug = !this.showDebug;
  }
}

// ============================================================================
// 🎨 BLOCK TEXTURE ATLAS MANAGER
// ============================================================================

class BlockTextureAtlas {
  constructor(atlasImagePath, atlasXmlPath) {
    this.imagePath = atlasImagePath;
    this.xmlPath = atlasXmlPath;
    this.image = null;
    this.textures = new Map(); // name -> {x, y, width, height} OR {image: Image} for individual PNGs
    this.blockTextureMap = new Map(); // blockType -> texture name
    this.blockImageMap = new Map(); // blockType -> individual Image object (for PNG mode)
    this.loaded = false;
    this.usesIndividualPNGs = false;
  }

  async load(engine) {
    try {
      // Try loading both image and XML for spritesheet mode
      try {
        const [img, xmlText] = await Promise.all([
          Promise.race([
            engine.resources.loadImage(this.imagePath),
            new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 2000))
          ]),
          Promise.race([
            engine.resources.fetchText(this.xmlPath),
            new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 2000))
          ])
        ]);
        
        this.image = img;
        this._parseXML(xmlText);
        this.loaded = true;
        this.usesIndividualPNGs = false;
        console.log(`✅ Spritesheet atlas loaded: ${this.textures.size} textures`);
        return true;
      } catch(err) {
        console.warn(`⚠️ Spritesheet load failed: ${err.message}`);
        return false;
      }
    } catch(err) {
      console.error(`❌ Failed to load any textures: ${err.message}`);
      return false;
    }
  }

  _parseXML(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Failed to parse XML');
    }

    const subtextures = xmlDoc.getElementsByTagName('SubTexture');
    for (let i = 0; i < subtextures.length; i++) {
      const st = subtextures[i];
      const name = st.getAttribute('name');
      const x = parseInt(st.getAttribute('x'));
      const y = parseInt(st.getAttribute('y'));
      const width = parseInt(st.getAttribute('width'));
      const height = parseInt(st.getAttribute('height'));
      
      this.textures.set(name, {x, y, width, height});
    }
  }

  mapBlockType(blockType, textureName) {
    this.blockTextureMap.set(blockType, textureName);
  }

  // Add individual PNG image for a block type (for PNG mode)
  addBlockImage(blockType, image) {
    this.blockImageMap.set(blockType, image);
    this.usesIndividualPNGs = true;
  }

  getTexture(blockType) {
    // Try individual PNG first
    if (this.blockImageMap.has(blockType)) {
      return this.blockImageMap.get(blockType);
    }
    
    // Fall back to spritesheet
    const texName = this.blockTextureMap.get(blockType);
    return texName ? this.textures.get(texName) : null;
  }

  drawBlock(ctx, screenX, screenY, blockType, size, shadowOffsetX = 0, shadowOffsetY = 0) {
    if (blockType === BlockTypes.AIR) return;
    
    const texInfo = this.getTexture(blockType);
    if (!texInfo || !this.image) {
      // Fallback to color if texture not available
      drawIsometricBlock(ctx, screenX, screenY, blockType, size);
      return;
    }

    const halfSize = size / 2;
    const quarterSize = size / 4;
    
    // Scale texture to fit block size
    const scaleX = size / texInfo.width;
    const scaleY = halfSize / texInfo.height;
    
    // Draw right face with texture
    ctx.save();
    ctx.translate(screenX + halfSize, screenY);
    ctx.drawImage(
      this.image,
      texInfo.x, texInfo.y + texInfo.height/2, texInfo.width, texInfo.height/2,
      0, quarterSize * 0.7, size * 0.6, halfSize * 0.7
    );
    ctx.restore();

    // Draw left face with darker texture
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(screenX - halfSize, screenY);
    ctx.drawImage(
      this.image,
      texInfo.x, texInfo.y, texInfo.width, texInfo.height/2,
      0, 0, size * 0.6, halfSize
    );
    ctx.restore();

    // Draw top with full texture
    ctx.save();
    ctx.translate(screenX, screenY - quarterSize);
    ctx.drawImage(
      this.image,
      texInfo.x, texInfo.y, texInfo.width, texInfo.height,
      -halfSize * 0.5, -quarterSize * 0.5, size * 0.5, quarterSize * 1.5
    );
    ctx.restore();

    // Border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(screenX - halfSize, screenY, size, halfSize);
  }
}

// ============================================================================
// 🎨 RENDERING HELPERS
// ============================================================================

function shadeColor(color, percent) {
  if (color.startsWith('rgba')) return color;
  const usePound = color[0] === '#';
  const col = usePound ? color.slice(1) : color;
  const num = parseInt(col, 16);
  const amt = Math.round(2.55 * (percent - 100));
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

function drawIsometricBlock(ctx, screenX, screenY, blockType, size) {
  const color = BlockColors[blockType] || '#ffffff';
  const halfSize = size / 2;
  const quarterSize = size / 4;

  if (blockType === BlockTypes.AIR) return;

  ctx.fillStyle = color;
  ctx.fillRect(screenX - halfSize, screenY, size, halfSize);

  ctx.fillStyle = shadeColor(color, 1.2);
  ctx.beginPath();
  ctx.moveTo(screenX - halfSize, screenY);
  ctx.lineTo(screenX, screenY - quarterSize);
  ctx.lineTo(screenX + halfSize, screenY);
  ctx.lineTo(screenX, screenY + quarterSize);
  ctx.fill();

  ctx.fillStyle = shadeColor(color, 0.8);
  ctx.beginPath();
  ctx.moveTo(screenX + halfSize, screenY);
  ctx.lineTo(screenX, screenY + quarterSize);
  ctx.lineTo(screenX, screenY + halfSize + quarterSize);
  ctx.lineTo(screenX + halfSize, screenY + halfSize);
  ctx.fill();

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(screenX - halfSize, screenY, size, halfSize);
}

// ============================================================================
// 🔊 GAME SOUND MANAGER
// ============================================================================

class GameSoundManager {
  constructor(engine) {
    this.engine = engine;
    this.sounds = new Map();
    this.volume = 0.3;
    this.enabled = true;
    this.soundCooldown = new Map();
    this.cooldownTime = 100; // ms
  }

  async loadSounds() {
    const soundFiles = [
      { name: 'cursor', path: 'Wav/Cursor_tones/style1/cursor_style_1_006.wav' },
      { name: 'confirm', path: 'Wav/Confirm_tones/style1/confirm_style_1_007.wav' },
      { name: 'error', path: 'Wav/Error_tones/style1/error_style_1_007.wav' }
    ];

    try {
      const assets = await this.engine.resources.loadAssets(
        soundFiles.map(s => ({name: s.name, url: s.path, type: 'audio'})),
        (loaded, total, url, err) => {
          if (err) {
            console.warn(`⚠️ Failed to load sound: ${url}`);
          } else {
            console.log(`🔊 Loaded sound ${loaded}/${total}`);
          }
        }
      );

      for (const [name, audio] of assets) {
        if (audio) this.sounds.set(name, audio);
      }
      console.log(`✅ SoundManager loaded ${this.sounds.size} sounds`);
      return true;
    } catch (err) {
      console.error(`❌ Failed to initialize SoundManager: ${err.message}`);
      return false;
    }
  }

  canPlay(soundName) {
    const lastPlay = this.soundCooldown.get(soundName) || 0;
    return Date.now() - lastPlay > this.cooldownTime;
  }

  play(soundName, volume = null) {
    if (!this.enabled || !this.canPlay(soundName)) return;

    const sound = this.sounds.get(soundName);
    if (!sound) {
      console.warn(`⚠️ Sound not found: ${soundName}`);
      return;
    }

    try {
      sound.volume = (volume ?? this.volume);
      sound.currentTime = 0;
      sound.play().catch(err => {
        // Ignore autoplay errors in some browsers
        console.debug(`Sound playback: ${err.message}`);
      });
      this.soundCooldown.set(soundName, Date.now());
    } catch (err) {
      console.error(`❌ Failed to play sound "${soundName}": ${err.message}`);
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

// ============================================================================
// 🎮 GAME EXPORT (For Sirco Engine)
// ============================================================================

export default function FreeCube2Game(engine) {
  let world = null;
  let player = null;
  let textureAtlas = null;
  let soundManager = null;
  let fpRenderer = null;
  let hud = null;
  let gameState = "menu"; // "menu", "loading", "playing"
  let loadingProgress = 0;
  let chunksToPreload = [];
  let chunksPreloadedCount = 0;

  // 📊 Track progress from different loading tasks
  let loadingTasks = {
    textures: { current: 0, total: 1, weight: 0.3 },
    sounds: { current: 0, total: 1, weight: 0.2 },
    chunks: { current: 0, total: 25, weight: 0.5 }
  };

  function updateLoadingProgress() {
    let totalWeight = loadingTasks.textures.weight + loadingTasks.sounds.weight + loadingTasks.chunks.weight;
    let weighted = 0;

    for (const task in loadingTasks) {
      const t = loadingTasks[task];
      const taskProgress = t.total > 0 ? Math.min(1, t.current / t.total) : 1;
      weighted += taskProgress * t.weight;
    }

    loadingProgress = weighted / totalWeight;
    console.log(`📊 Loading: ${Math.floor(loadingProgress * 100)}% (tex: ${loadingTasks.textures.current}/${loadingTasks.textures.total}, snd: ${loadingTasks.sounds.current}/${loadingTasks.sounds.total}, chunks: ${loadingTasks.chunks.current}/${loadingTasks.chunks.total})`);

    // Check if all tasks complete
    if (loadingProgress >= 0.99) {
      loadingProgress = 1.0;
      if (gameState === 'loading') {
        console.log('✅ All assets loaded! Starting game...');
        gameState = 'playing';
      }
    }
  }

  // ⚙️ Async chunk preloader - spreads work across frames
  function preloadChunksAsync() {
    return new Promise((resolve) => {
      const startChunks = chunksToPreload.slice();
      chunksPreloadedCount = 0;

      const loadNextChunk = () => {
        if (chunksToPreload.length === 0) {
          loadingTasks.chunks.current = loadingTasks.chunks.total;
          updateLoadingProgress();
          resolve(true);
          return;
        }

        // Load 1 chunk per frame to avoid blocking
        const chunk = chunksToPreload.shift();
        try {
          world.getChunk(chunk.x, chunk.z).generate();
          chunksPreloadedCount++;
          loadingTasks.chunks.current = chunksPreloadedCount;
          updateLoadingProgress();
        } catch (err) {
          console.warn(`⚠️ Chunk preload failed: ${err.message}`);
        }

        // Schedule next chunk load on next frame
        requestAnimationFrame(loadNextChunk);
      };

      loadNextChunk();
    });
  }

  // 🎨 Load individual PNG files (with fallback to spritesheet)
  async function loadTexturesWithFallback() {
    loadingTasks.textures.current = 0;

    // Try individual PNGs first - CORRECT PATHS (PNG/Tiles/)
    const blockTextures = [
      { type: BlockTypes.GRASS, file: 'PNG/Tiles/dirt_grass.png', name: 'Grass' },
      { type: BlockTypes.DIRT, file: 'PNG/Tiles/dirt.png', name: 'Dirt' },
      { type: BlockTypes.STONE, file: 'PNG/Tiles/brick_grey.png', name: 'Stone' },
      { type: BlockTypes.WOOD, file: 'PNG/Tiles/fence_wood.png', name: 'Wood' },
      { type: BlockTypes.LEAVES, file: 'PNG/Tiles/grass1.png', name: 'Leaves' },
      { type: BlockTypes.WATER, file: 'PNG/Tiles/glass.png', name: 'Water' },
      { type: BlockTypes.SAND, file: 'PNG/Tiles/dirt_sand.png', name: 'Sand' },
      { type: BlockTypes.LOG, file: 'PNG/Tiles/fence_stone.png', name: 'Log' },
      { type: BlockTypes.BEDROCK, file: 'PNG/Tiles/brick_grey.png', name: 'Bedrock' }
    ];

    loadingTasks.textures.total = blockTextures.length;

    // Try to load each PNG individually
    let successCount = 0;
    for (const tex of blockTextures) {
      try {
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(`Failed to load ${tex.file}`));
          
          // Add timeout
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout loading ${tex.file}`));
          }, 3000);
          
          image.onload = () => {
            clearTimeout(timeout);
            resolve(image);
          };
          
          image.src = tex.file;
        });

        // Register PNG with atlas
        textureAtlas.addBlockImage(tex.type, img);
        successCount++;
        console.log(`✅ Loaded texture: ${tex.name} (${tex.file})`);
      } catch (err) {
        console.warn(`⚠️ PNG not found: ${tex.file} - ${err.message}`);
      }

      loadingTasks.textures.current++;
      updateLoadingProgress();
    }

    // Fallback: load spritesheet if few PNGs loaded
    if (successCount < 3) {
      console.log('📦 Falling back to spritesheet (only ' + successCount + ' PNGs loaded)');
      try {
        const loaded = await textureAtlas.load(engine);
        if (loaded) {
          successCount = blockTextures.length; // Mark as success
          console.log('✅ Spritesheet loaded as fallback');
        }
      } catch (err) {
        console.warn('⚠️ Spritesheet also failed - using color fallback');
      }
    }

    loadingTasks.textures.current = loadingTasks.textures.total;
    updateLoadingProgress();
    return successCount > 0;
  }

  return {
    start() {
      console.log('🎮 FreeCube2 v3.1 - First-Person Mode');
      console.log('✨ Click to start playing');
      
      // Create world and player immediately (no blocking)
      world = new World(12345);
      player = new GamePlayer();
      player.x = 0;
      // Spawn player on terrain surface
      const spawnHeight = world.terrain.getHeight(0, 0);
      player.y = spawnHeight + player.eyeHeight + 2;  // Above terrain
      player.z = 0;
      console.log(`🧑 Player spawning at height ${player.y.toFixed(1)} (terrain: ${spawnHeight.toFixed(1)})`);

      // Create texture atlas immediately (empty, will load async)
      textureAtlas = new BlockTextureAtlas('Spritesheets/spritesheet_tiles.png', 'Spritesheets/spritesheet_tiles.xml');
      
      // Use raycasting renderer (proven to work, shows actual blocks!)
      // WebGL is overkill and buggy for single blocks
      fpRenderer = new FirstPersonRenderer(engine.canvas, world, player, textureAtlas);
      console.log('🎮 Raycasting rendering enabled - blocks will be visible!');
      
      fpRenderer.setRenderDistance(4);
      hud = new GameHUD(engine.canvas, player);

      // Initialize sound manager
      soundManager = new GameSoundManager(engine);

      // Key bindings
      engine.input.onKeyDown = (key) => {
        if (key === 'F3') hud.toggleDebug();
        if (key === 'r' || key === 'R') {
          fpRenderer.setRenderDistance(fpRenderer.renderDistance + 1);
          console.log(`📏 Render distance: ${fpRenderer.renderDistance}`);
        }
        if (key === 't' || key === 'T') {
          fpRenderer.setRenderDistance(fpRenderer.renderDistance - 1);
          console.log(`📏 Render distance: ${fpRenderer.renderDistance}`);
        }
      };

      // Menu click handler: START ASYNC LOADING SEQUENCE
      engine.canvas.addEventListener('click', async () => {
        if (gameState === 'menu') {
          gameState = 'loading';
          loadingProgress = 0;

          // Prepare chunks to preload (expand from 5x5 to 7x7 grid for more terrain)
          chunksToPreload = [];
          for (let cx = -3; cx <= 3; cx++) {
            for (let cz = -3; cz <= 3; cz++) {
              chunksToPreload.push({ x: cx, z: cz });
            }
          }
          loadingTasks.chunks.total = chunksToPreload.length;

          console.log(`🔄 Starting async loading sequence... preloading ${chunksToPreload.length} chunks`);

          // Run all loading tasks in parallel
          await Promise.all([
            loadTexturesWithFallback(),
            soundManager.loadSounds().then(success => {
              loadingTasks.sounds.current = loadingTasks.sounds.total;
              updateLoadingProgress();
              if (success) soundManager.play('cursor', 0.2);
              return success;
            }),
            preloadChunksAsync()
          ]);

          console.log('✅ All loading complete!');
          loadingProgress = 1.0;
          gameState = 'playing';
        }
      });
    },

    update(dt) {
      if (gameState !== 'playing') return;
      if (!world || !player) return;

      player.update(dt, engine.input, world);

      // Load chunks around player
      const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
      const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);
      const renderDist = Math.ceil(fpRenderer.renderDistance);
      
      for (let cx = playerChunkX - renderDist; cx <= playerChunkX + renderDist; cx++) {
        for (let cz = playerChunkZ - renderDist; cz <= playerChunkZ + renderDist; cz++) {
          world.getChunk(cx, cz);
        }
      }
      world.unloadFarChunks(playerChunkX, playerChunkZ, renderDist + 1);
    },

    render(dt) {
      const ctx = engine.ctx2d;
      const w = engine.canvas.width;
      const h = engine.canvas.height;

      // Title screen
      if (gameState === 'menu') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('FREECUBE 2', w / 2, h / 2 - 50);

        ctx.font = '20px Arial';
        ctx.fillText('Click to Start', w / 2, h / 2);

        ctx.font = '14px Arial';
        ctx.fillStyle = '#aaa';
        ctx.fillText('WASD = Move | Mouse = Look | SPACE = Jump | SHIFT = Sprint', w / 2, h / 2 + 60);

        return;
      }

      // Loading screen
      if (gameState === 'loading') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Loading... ${Math.floor(loadingProgress * 100)}%`, w / 2, h / 2 - 30);

        // Loading bar
        const barWidth = 200;
        const barX = w / 2 - barWidth / 2;
        const barY = h / 2 + 10;
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(barX, barY, barWidth, 20);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(barX, barY, barWidth * loadingProgress, 20);

        return;
      }

      // Game render
      if (gameState === 'playing') {
        if (!world || !player) {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
          return;
        }

        fpRenderer.render();
        hud.render();
      }
    }
  };
}
