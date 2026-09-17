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
  const tx = smooth(x / scale - gx);
  const ty = smooth(y / scale - gy);
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
  const shape = buildField(width, height, seed + 91, 27);
  const hexes: WorldHex[] = [];

  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxDistance = Math.hypot(cx, cy);

  for (let r = 0; r < height; r += 1) {
    for (let q = 0; q < width; q += 1) {
      const distance = Math.hypot(q - cx, (r - cy) * 1.05) / maxDistance;
      const coastNoise = shape[r][q] * 0.22;
      const continent = 0.86 - distance * 0.68 + coastNoise;
      const e = elevation[r][q] * 0.58 + continent * 0.42;
      const m = moisture[r][q];

      let terrain: Terrain;
      if (e < 0.31) terrain = 'water';
      else if (e > 0.72 && m < 0.72) terrain = 'mountain';
      else if (m < 0.27 && e < 0.60) terrain = 'desert';
      else if (m > 0.50) terrain = 'forest';
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

  for (const hex of hexes) {
    if (hex.terrain !== 'water') continue;
    const landNeighbours = neighbours(hex.q, hex.r, width, height)
      .map(([q, r]) => byId.get(`${q}:${r}`)!)
      .filter((n) => n.terrain !== 'water').length;
    if (landNeighbours >= 5 && distanceToEdge(hex.q, hex.r, width, height) > 1) {
      hex.terrain = 'plains';
      hex.elevation = Math.max(hex.elevation, 0.34);
    }
  }

  const riverSources = hexes
    .filter((hex) => hex.terrain === 'mountain' && hex.elevation > 0.76)
    .sort((a, b) => b.elevation - a.elevation)
    .filter((_, index) => index % 4 === 0)
    .slice(0, Math.max(2, Math.floor(width / 6)));

  for (const source of riverSources) {
    let current = source;
    const visited = new Set<string>();
    for (let step = 0; step < 18; step += 1) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      current.river = true;
      if (current.terrain === 'water') break;

      const candidates = neighbours(current.q, current.r, width, height)
        .map(([q, r]) => byId.get(`${q}:${r}`)!)
        .filter((hex) => !visited.has(hex.id));
      if (candidates.length === 0) break;

      const next = candidates
        .sort((a, b) => {
          const aScore = a.elevation - (a.terrain === 'water' ? 0.18 : 0);
          const bScore = b.elevation - (b.terrain === 'water' ? 0.18 : 0);
          return aScore - bScore;
        })[0];

      if (next.elevation > current.elevation + 0.045 && step > 1) break;
      current = next;
    }
  }

  // Seed neutral settlements only for the visual prototype.
  const settlementCandidates = hexes
    .filter((hex) => (hex.terrain === 'plains' || hex.terrain === 'forest') && (hex.river || hex.moisture > 0.58))
    .sort((a, b) => hash2d(a.q, a.r, seed + 700) - hash2d(b.q, b.r, seed + 700));
  const settlements: WorldHex[] = [];
  for (const candidate of settlementCandidates) {
    if (settlements.some((other) => Math.hypot(candidate.q - other.q, candidate.r - other.r) < 4)) continue;
    candidate.settlement = settlements.length === 0 ? 'city' : 'settlement';
    candidate.resource = candidate.terrain === 'forest' ? 'wood' : 'grain';
    settlements.push(candidate);
    if (settlements.length >= Math.max(4, Math.floor(width / 3))) break;
  }

  // A few strategic deposits make the first map readable before the economy exists.
  for (const hex of hexes) {
    if (hex.resource || hex.terrain === 'water') continue;
    const roll = hash2d(hex.q + 91, hex.r - 37, seed + 1200);
    if (hex.terrain === 'mountain' && roll > 0.72) hex.resource = 'iron';
    else if (hex.terrain === 'desert' && roll > 0.82) hex.resource = 'salt';
  }

  // Prototype roads connect nearby settlements; later this becomes a player-built system.
  for (let i = 0; i < settlements.length - 1; i += 1) {
    const a = settlements[i];
    const b = settlements[i + 1];
    const steps = Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      const q = Math.round(a.q + (b.q - a.q) * t);
      const r = Math.round(a.r + (b.r - a.r) * t);
      const roadHex = byId.get(`${q}:${r}`);
      if (roadHex && roadHex.terrain !== 'water' && roadHex.terrain !== 'mountain') roadHex.road = true;
    }
    a.road = true;
    b.road = true;
  }

  return { seed: seed >>> 0, width, height, hexes };
}

function distanceToEdge(q: number, r: number, width: number, height: number): number {
  return Math.min(q, width - 1 - q, r, height - 1 - r);
}
