import type { Terrain, WorldHex, WorldSeed } from '../../shared/types.ts';

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateWorld(seed: number, width: number, height: number): WorldSeed {
  const random = mulberry32(seed >>> 0);
  const hexes: WorldHex[] = [];

  for (let r = 0; r < height; r += 1) {
    for (let q = 0; q < width; q += 1) {
      const elevation = Math.pow(random(), 0.72);
      const moisture = random();
      let terrain: Terrain;

      if (elevation < 0.16) terrain = 'water';
      else if (elevation > 0.82) terrain = 'mountain';
      else if (moisture < 0.2) terrain = 'desert';
      else if (moisture > 0.52) terrain = 'forest';
      else terrain = 'plains';

      hexes.push({
        id: `${q}:${r}`,
        q,
        r,
        terrain,
        elevation,
        moisture,
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

  return { seed: seed >>> 0, width, height, hexes };
}
