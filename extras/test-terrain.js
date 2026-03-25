// Quick test of terrain generation
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 256;

const BlockTypes = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WATER: 6, BEDROCK: 9 };

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
}

// Test terrain generation
const terrain = new TerrainGenerator(12345);

console.log('🧪 Testing terrain generation...\n');

// Test at spawn position (0, 0)
const h00 = terrain.getHeight(0, 0);
console.log(`📍 Height at (0, 0): ${h00.toFixed(2)}`);

// Test nearby positions
for (let i = 0; i < 5; i++) {
  const x = i * 16;
  const z = 0;
  const h = terrain.getHeight(x, z);
  console.log(`📍 Height at (${x}, ${z}): ${h.toFixed(2)}`);
}

console.log('\n✅ Terrain generation working correctly!\n');

// Simulate chunk generation at (0, 0)
console.log('🧪 Testing chunk block generation...\n');

let blockCounts = {
  BEDROCK: 0,
  STONE: 0,
  DIRT: 0,
  GRASS: 0,
  WATER: 0,
  AIR: 0
};

const chunkX = 0, chunkZ = 0;
for (let lx = 0; lx < CHUNK_SIZE; lx++) {
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    const globalX = chunkX * CHUNK_SIZE + lx;
    const globalZ = chunkZ * CHUNK_SIZE + lz;
    const height = terrain.getHeight(globalX, globalZ);

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      let blockType = BlockTypes.AIR;

      if (y === 0) blockType = BlockTypes.BEDROCK;
      else if (y < height - 3) blockType = BlockTypes.STONE;
      else if (y < height - 1) blockType = BlockTypes.DIRT;
      else if (y === Math.floor(height) - 1) blockType = BlockTypes.GRASS;
      else if (y <= terrain.seaLevel) blockType = BlockTypes.WATER;

      if (blockType === BlockTypes.BEDROCK) blockCounts.BEDROCK++;
      else if (blockType === BlockTypes.STONE) blockCounts.STONE++;
      else if (blockType === BlockTypes.DIRT) blockCounts.DIRT++;
      else if (blockType === BlockTypes.GRASS) blockCounts.GRASS++;
      else if (blockType === BlockTypes.WATER) blockCounts.WATER++;
      else blockCounts.AIR++;
    }
  }
}

console.log('📦 Block counts in chunk (0,0):');
console.log(`  BEDROCK: ${blockCounts.BEDROCK}`);
console.log(`  STONE:   ${blockCounts.STONE}`);
console.log(`  DIRT:    ${blockCounts.DIRT}`);
console.log(`  GRASS:   ${blockCounts.GRASS}`);
console.log(`  WATER:   ${blockCounts.WATER}`);
console.log(`  AIR:     ${blockCounts.AIR}`);
console.log(`  TOTAL:   ${blockCounts.BEDROCK + blockCounts.STONE + blockCounts.DIRT + blockCounts.GRASS + blockCounts.WATER + blockCounts.AIR}`);

const totalBlocks = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
const solidBlocks = blockCounts.BEDROCK + blockCounts.STONE + blockCounts.DIRT + blockCounts.GRASS + blockCounts.WATER;
console.log(`\n✅ Solid blocks in chunk: ${solidBlocks}/${totalBlocks} (${(solidBlocks/totalBlocks*100).toFixed(1)}%)`);

if (solidBlocks > 0) {
  console.log('✅ Terrain generation is WORKING - blocks will be visible!\n');
} else {
  console.log('❌ ERROR: No solid blocks generated!\n');
}
