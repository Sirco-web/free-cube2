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
        }

        if (Math.random() < 0.05 && height > this.terrain.seaLevel) {
          this._generateTree(lx, Math.floor(height), lz);
        }
      }
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

    for (let x = 0; x < w; x++) {
      // Calculate ray angle for this screen column
      const rayAngleOffset = (x - w / 2) * pixelSize;
      const rayAngle = dir.yaw + rayAngleOffset;
      
      const rayDirX = Math.cos(rayAngle) * Math.cos(dir.pitch);
      const rayDirZ = Math.sin(rayAngle) * Math.cos(dir.pitch);

      // For each vertical pixel, cast a ray
      for (let y = 0; y < h; y++) {
        // Map screen Y to pitch angle
        const screenYOffset = (y - h / 2) / h;
        const verticalAngle = dir.pitch + screenYOffset * (this.fov / 2);
        
        const rayDirY = Math.tan(verticalAngle);
        const horizontalDist = 1; // Normalize
        
        // Cast ray and find hit block
        const hit = this._castRay(eye.x, eye.y, eye.z, rayDirX, rayDirY, rayDirZ);
        
        if (hit) {
          // Get texture or color
          const color = this._getBlockColorOrTexture(hit.blockType, hit.blockX, hit.blockY, hit.blockZ, hit.faceNormal);
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        } else {
          // Sky
          const skyColor = `rgb(${Math.floor(135 + 30 * screenYOffset)}, ${Math.floor(206 + 50 * screenYOffset)}, 235)`;
          ctx.fillStyle = skyColor;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  _castRay(sx, sy, sz, dx, dy, dz) {
    const maxDist = this.renderDistance * CHUNK_SIZE * 2;
    const stepSize = 0.1;
    let lastValidDist = 0;
    
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

      const chunk = this.world.getChunk(
        Math.floor(blockX / CHUNK_SIZE),
        Math.floor(blockZ / CHUNK_SIZE)
      );

      if (chunk && chunk.generated) {
        const lx = ((blockX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((blockZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        
        const blockType = chunk.getBlock(lx, blockY, lz);
        if (blockType !== BlockTypes.AIR && blockType !== BlockTypes.WATER) {
          // Determine which face was hit based on ray direction
          let faceNormal = 'front';
          if (Math.abs(dx) > Math.abs(dz)) {
            faceNormal = dx > 0 ? 'east' : 'west';
          } else {
            faceNormal = dz > 0 ? 'south' : 'north';
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
    const texName = this.textureAtlas.blockTextureMap.get(blockType);
    if (!texName) return BlockColors[blockType] || '#ffffff';
    
    const texInfo = this.textureAtlas.textures.get(texName);
    if (!texInfo) return BlockColors[blockType] || '#ffffff';
    
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
      ctxTemp.drawImage(this.textureAtlas.image, pixelX, pixelY, 1, 1, 0, 0, 1, 1);
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
    this.textures = new Map(); // name -> {x, y, width, height}
    this.blockTextureMap = new Map(); // blockType -> texture name
    this.loaded = false;
  }

  async load(engine) {
    try {
      // Load both image and XML
      const [img, xmlText] = await Promise.all([
        engine.resources.loadImage(this.imagePath),
        engine.resources.fetchText(this.xmlPath)
      ]);
      
      this.image = img;
      this._parseXML(xmlText);
      this.loaded = true;
      console.log(`✅ Block texture atlas loaded: ${this.textures.size} textures`);
      return true;
    } catch(err) {
      console.error(`❌ Failed to load block texture atlas: ${err.message}`);
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

  getTexture(blockType) {
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
      { name: 'cursor', path: 'Wav/Cursor_tones/cursor_style_1.wav' },
      { name: 'confirm', path: 'Wav/Confirm_tones/confirm_style_1.wav' },
      { name: 'error', path: 'Wav/Error_tones/error_style_1.wav' }
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

  return {
    start() {
      console.log('🎮 FreeCube2 v3.0 - First-Person Mode');
      console.log('✨ First-Person Camera + Full HUD System');
      console.log('📋 Controls:');
      console.log('   W/A/S/D = Move | Mouse = Look | SPACE = Jump | SHIFT = Sprint/Crouch');
      console.log('   1-9 = Select hotbar | E = Inventory | F3 = Toggle Debug');
      
      world = new World(12345);
      player = new GamePlayer();
      player.x = 0;
      player.y = 100;
      player.z = 0;

      // Initialize first-person renderer and HUD
      fpRenderer = new FirstPersonRenderer(engine.canvas, world, player, textureAtlas);
      fpRenderer.setRenderDistance(4);
      hud = new GameHUD(engine.canvas, player);

      // Initialize block texture atlas
      textureAtlas = new BlockTextureAtlas('Spritesheets/spritesheet_tiles.png', 'Spritesheets/spritesheet_tiles.xml');
      textureAtlas.load(engine).then(success => {
        if (success) {
          // Map block types to textures
          textureAtlas.mapBlockType(BlockTypes.GRASS, 'dirt_grass.png');
          textureAtlas.mapBlockType(BlockTypes.DIRT, 'dirt.png');
          textureAtlas.mapBlockType(BlockTypes.STONE, 'greystone.png');
          textureAtlas.mapBlockType(BlockTypes.WOOD, 'brick_red.png');
          textureAtlas.mapBlockType(BlockTypes.LEAVES, 'leaves.png');
          textureAtlas.mapBlockType(BlockTypes.WATER, 'ice.png');
          textureAtlas.mapBlockType(BlockTypes.SAND, 'sand.png');
          textureAtlas.mapBlockType(BlockTypes.LOG, 'redstone.png');
          textureAtlas.mapBlockType(BlockTypes.BEDROCK, 'greystone.png');
          console.log('✅ Block textures loaded!');
        }
      });

      // Initialize sound manager
      soundManager = new GameSoundManager(engine);
      soundManager.loadSounds().then(success => {
        if (success) {
          soundManager.play('cursor', 0.2);
          console.log('🔊 Game sounds ready!');
        }
      });

      // Key bindings
      engine.input.onKeyDown = (key) => {
        if (key === 'F3') hud.toggleDebug();
        if (key === 'r' || key === 'R') {
          // Increase render distance
          fpRenderer.setRenderDistance(fpRenderer.renderDistance + 1);
          console.log(`📏 Render distance: ${fpRenderer.renderDistance}`);
        }
        if (key === 't' || key === 'T') {
          // Decrease render distance
          fpRenderer.setRenderDistance(fpRenderer.renderDistance - 1);
          console.log(`📏 Render distance: ${fpRenderer.renderDistance}`);
        }
      };
    },

    update(dt) {
      if (!world || !player) return;

      player.update(dt, engine.input, world);

      // Load chunks around player based on render distance
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

      if (!world || !player) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, engine.canvas.width, engine.canvas.height);
        return;
      }

      // Render first-person view
      fpRenderer.render();

      // Render HUD on top
      hud.render();
    }
  };
}
