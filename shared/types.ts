export type Terrain = 'plains' | 'forest' | 'mountain' | 'water' | 'desert';

export interface HexCoord {
  q: number;
  r: number;
}

export interface WorldHex extends HexCoord {
  id: string;
  terrain: Terrain;
  elevation: number;
  moisture: number;
  discovered: boolean;
  ownerId: string | null;
  resource: string | null;
  settlement: 'none' | 'settlement' | 'city';
  road: boolean;
  river: boolean;
  darkness: number;
}

export interface WorldSeed {
  seed: number;
  width: number;
  height: number;
  hexes: WorldHex[];
}
