import { supabase } from '../lib/supabase.ts';
import { generateWorld } from '../../world/generation/generateWorld.ts';
import type { WorldHex, WorldSeed } from '../../shared/types.ts';

type DbHex = {
  id: string;
  q: number;
  r: number;
  discovered: boolean;
  owner_player_id: string | null;
  resource: string | null;
  settlement: 'none' | 'settlement' | 'city' | null;
  darkness: number | null;
};

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
    .select('id, q, r, discovered, owner_player_id, resource, settlement, darkness')
    .eq('game_id', game.id);

  if (hexError) throw hexError;

  const world = generateWorld(Number(game.seed), 18, 12);
  const states = new Map((dbHexes as DbHex[] | null ?? []).map((hex) => [`${hex.q}:${hex.r}`, hex]));
  const hexes = world.hexes.map((hex) => {
    const state = states.get(`${hex.q}:${hex.r}`);
    if (!state) return hex;
    return {
      ...hex,
      discovered: state.discovered,
      ownerId: state.owner_player_id,
      resource: state.resource ?? hex.resource,
      settlement: state.settlement ?? hex.settlement,
      darkness: state.darkness ?? hex.darkness,
    };
  });

  return {
    gameId: game.id,
    code: game.code,
    month: game.month,
    world: { ...world, hexes },
  };
}
