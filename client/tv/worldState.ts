import { supabase } from '../lib/supabase.ts';
import type { Terrain, WorldHex, WorldSeed } from '../../shared/types.ts';

const terrains = new Set<Terrain>(['plains', 'forest', 'mountain', 'water', 'desert']);

type DbHex = {
  id: string;
  q: number;
  r: number;
  terrain: string;
  discovered: boolean;
  owner_player_id: string | null;
  resource: string | null;
  settlement: 'none' | 'settlement' | 'city' | null;
  army_strength: number | null;
  darkness: number | null;
};

function toWorldHex(hex: DbHex): WorldHex {
  const terrain = terrains.has(hex.terrain as Terrain) ? hex.terrain as Terrain : 'plains';
  return {
    id: hex.id,
    q: hex.q,
    r: hex.r,
    terrain,
    elevation: terrain === 'mountain' ? 0.8 : terrain === 'water' ? 0.15 : 0.45,
    moisture: terrain === 'forest' ? 0.7 : terrain === 'desert' ? 0.15 : 0.45,
    discovered: hex.discovered,
    ownerId: hex.owner_player_id,
    resource: hex.resource,
    settlement: hex.settlement ?? 'none',
    road: false,
    river: false,
    darkness: hex.darkness ?? 0,
  };
}

export async function loadActiveWorld(): Promise<{ world: WorldSeed; gameId: string; month: number; code: string } | null> {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, code, month, seed, player_count')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (gameError) throw gameError;
  if (!game) return null;

  const { data: dbHexes, error: hexError } = await supabase
    .from('hexes')
    .select('id, q, r, terrain, discovered, owner_player_id, resource, settlement, army_strength, darkness')
    .eq('game_id', game.id)
    .order('r', { ascending: true })
    .order('q', { ascending: true });

  if (hexError) throw hexError;
  if (!dbHexes?.length) return null;

  const hexes = (dbHexes as DbHex[]).map(toWorldHex);
  return {
    gameId: game.id,
    code: game.code,
    month: game.month,
    world: {
      seed: Number(game.seed),
      width: Math.max(...hexes.map((hex) => hex.q)) + 1,
      height: Math.max(...hexes.map((hex) => hex.r)) + 1,
      hexes,
    },
  };
}
