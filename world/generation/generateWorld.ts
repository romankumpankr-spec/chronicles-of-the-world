import type { Terrain, WorldHex, WorldSeed } from '../../shared/types.ts';

type Grid = number[][];

function hash2d(x: number, y: number, seed: number): number {
  let h = Math.imul(x + seed * 374761393, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  h += y * 374761393;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number, scale: number): number {
  const gx = Math.floor(x / scale);
  const gy = Math.floor(y / scale);
  const tx = smooth((x / scale) - gx);
  const ty = smooth((y / scale) - gy);
  const a = hash2d(gx, gy, seed);
  const b = hash2d(gx + 1, gy, seed);
  const c = hash2d(gx, gy + 1, seed);
  const d = hash2d(gx + 1, gy + 1, seed);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}

function fractalNoise(x: number, y: number, seed: number): number {
  const samples = [
    [7, 0.55],
    [3.5, 0.3],
    [1.75, 0.15],
  ] as const;
  let total = 0;
  let weight = 0;
  for (const [scale, amplitude] of samples) {
    total += valueNoise(x, y, seed + scale * 101, scale) * amplitude;
    weight += amplitude;
  }
  return total / weight;
}

function buildField(width: number, height: number, seed: number, offset: number): Grid {
  return Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, q) => fractalNoise(q + offset, r + offset * 0.37, seed + offset * 997)),
  );
}

function neighbours(q: number, r: number, width: number, height: number): Array<[number, number]> {
  const even = r % 2 === 0;
  const offsets = even
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets
    .map(([dq, dr]) => [q + dq, r + dr] as [number, number])
    .filter(([nq, nr]) => nq >= 0 && nq < width && nr >= 0 && nr < height);
}

export function generateWorld(seed: number, width: number, height: number): WorldSeed {
  const elevation = buildField(width, height, seed, 0);
  const moisture = buildField(width, height, seed + 41, 13);
  const hexes: WorldHex[] = [];

  for (let r = 0; r < height; r += 1) {
    for (let q = 0; q < width; q += 1) {
      const edge = Math.min(q, width - 1 - q, r, height - 1 - r) / Math.max(1, Math.min(width, height) * 0.5);
      const continentalBias = Math.min(1, edge * 1.8);
      const e = elevation[r][q] * 0.78 + continentalBias * 0.22;
      const m = moisture[r][q];

      let terrain: Terrain;
      if (e < 0.30) terrain = 'water';
      else if (e > 0.76) terrain = 'mountain';
      else if (m < 0.25 && e < 0.58) terrain = 'desert';
      else if (m > 0.48) terrain = 'forest';
      else terrain = 'plains';

      hexes.push({
        id: `${q}:${r}`,
        q,
        r,
        terrain,
        elevation: e,
        moisture: m,
        discovered: false,
        ownerId: null,
        resource: null,
        settlement: 'none',
        road: false,
        river: false,
        darkness: 0,
      });
    }
  }

  const byId = new Map(hexes.map((hex) => [hex.id, hex]));
  const riverSources = hexes
    .filter((hex) => hex.terrain === 'mountain' && hex.elevation > 0.82)
    .sort((a, b) => b.elevation - a.elevation)
    .filter((_, index) => index % 5 === 0)
    .slice(0, Math.max(2, Math.floor(width / 7)));

  for (const source of riverSources) {
    let current = source;
    const visited = new Set<string>();
    for (let step = 0; step < 14; step += 1) {
      if (current.terrain === 'water') break;
      current.river = true;
      visited.add(current.id);
      const candidates = neighbours(current.q, current.r, width, height)
        .map(([q, r]) => byId.get(`${q}:${r}`)!)
        .filter((hex) => !visited.has(hex.id));
      if (candidates.length === 0) break;
      const next = candidates
        .sort((a, b) => a.elevation - b.elevation)[0];
      if (next.elevation > current.elevation + 0.025 && step > 1) break;
      current = next;
    }
  }

  return { seed: seed >>> 0, width, height, hexes };
}
