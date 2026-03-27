function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function hash4(x, y, z, seed) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 374761393);
  h = Math.imul(h ^ (y | 0), 668265263);
  h = Math.imul(h ^ (z | 0), 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function random2(x, z, seed) {
  return hash4(x, 0, z, seed) / 4294967295;
}

export function random3(x, y, z, seed) {
  return hash4(x, y, z, seed) / 4294967295;
}

export function createSeededRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967295;
  };
}

export class PerlinNoise {
  constructor(seed = 12345) {
    this.seed = seed;
    this.p = this.buildPermutation(seed);
  }

  buildPermutation(seed) {
    const values = Array.from({ length: 256 }, (_, index) => index);
    for (let index = 255; index > 0; index -= 1) {
      seed = (seed * 16807) % 2147483647;
      const swapIndex = Math.floor((seed / 2147483647) * (index + 1));
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values.concat(values);
  }

  noise(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);

    const n00 = this.grad2d(xi, yi, xf, yf);
    const n10 = this.grad2d(xi + 1, yi, xf - 1, yf);
    const n01 = this.grad2d(xi, yi + 1, xf, yf - 1);
    const n11 = this.grad2d(xi + 1, yi + 1, xf - 1, yf - 1);

    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return nx0 + v * (nx1 - nx0);
  }

  grad2d(x, y, dx, dy) {
    const gradients = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    const hash = this.p[(this.p[x & 255] + y) & 255] & 3;
    const gradient = gradients[hash];
    return gradient[0] * dx + gradient[1] * dy;
  }
}

export class FractalNoise {
  constructor(seed = 12345, octaves = 4, persistence = 0.5, lacunarity = 2) {
    this.baseNoise = new PerlinNoise(seed);
    this.octaves = octaves;
    this.persistence = persistence;
    this.lacunarity = lacunarity;
  }

  fractal(x, y) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let octave = 0; octave < this.octaves; octave += 1) {
      value += this.baseNoise.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }

    return value / maxValue;
  }
}

export class ValueNoise3D {
  constructor(seed = 12345) {
    this.seed = seed >>> 0;
  }

  smooth(t) {
    return t * t * (3 - 2 * t);
  }

  sampleCorner(x, y, z) {
    return (hash4(x, y, z, this.seed) / 4294967295) * 2 - 1;
  }

  noise(x, y, z) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const z1 = z0 + 1;
    const tx = this.smooth(x - x0);
    const ty = this.smooth(y - y0);
    const tz = this.smooth(z - z0);

    const c000 = this.sampleCorner(x0, y0, z0);
    const c100 = this.sampleCorner(x1, y0, z0);
    const c010 = this.sampleCorner(x0, y1, z0);
    const c110 = this.sampleCorner(x1, y1, z0);
    const c001 = this.sampleCorner(x0, y0, z1);
    const c101 = this.sampleCorner(x1, y0, z1);
    const c011 = this.sampleCorner(x0, y1, z1);
    const c111 = this.sampleCorner(x1, y1, z1);

    const x00 = lerp(c000, c100, tx);
    const x10 = lerp(c010, c110, tx);
    const x01 = lerp(c001, c101, tx);
    const x11 = lerp(c011, c111, tx);
    const y0v = lerp(x00, x10, ty);
    const y1v = lerp(x01, x11, ty);
    return lerp(y0v, y1v, tz);
  }
}

export class FractalNoise3D {
  constructor(seed = 12345, octaves = 4, persistence = 0.5, lacunarity = 2) {
    this.baseNoise = new ValueNoise3D(seed);
    this.octaves = octaves;
    this.persistence = persistence;
    this.lacunarity = lacunarity;
  }

  fractal(x, y, z) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let octave = 0; octave < this.octaves; octave += 1) {
      value += this.baseNoise.noise(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }

    return maxValue > 0 ? value / maxValue : 0;
  }
}
