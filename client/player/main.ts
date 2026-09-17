import { supabase } from '../lib/supabase.ts';
import './style.css';

type Player = { id: string; slot: number; kingdom_name: string; user_id: string | null; is_ready: boolean };
type Game = { id: string; code: string; status: 'lobby' | 'active' | 'finished'; month: number; player_count: number };

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

const state: { game: Game | null; players: Player[]; selectedSlot: number | null } = { game: null, players: [], selectedSlot: null };

function shell(content: string) {
  app.innerHTML = `<main class="player-shell"><section class="player-card">${content}</section></main>`;
}

function errorText(message: string) { return `<div class="error">${message}</div>`; }

function loginScreen(message = '') {
  shell(`<div class="eyebrow">ХРОНИКИ МИРА</div><h1>Командный терминал</h1><p class="subtitle">Подключение к партии происходит с телефона. Личные решения игрока не видны на TV.</p><form id="login" class="form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Пароль<input name="password" type="password" autocomplete="current-password" required></label><button>Войти</button>${message ? errorText(message) : '<div class="error"></div>'}</form>`);
  document.querySelector<HTMLFormElement>('#login')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const { error } = await supabase.auth.signInWithPassword({ email: String(data.get('email') ?? ''), password: String(data.get('password') ?? '') });
    if (error) { loginScreen('Не удалось войти. Проверьте email и пароль.'); return; }
    await start();
  });
}

function joinScreen(message = '') {
  const slots = state.players.map((p) => `<button type="button" class="slot ${p.user_id ? 'occupied' : ''}" data-slot="${p.slot}" ${p.user_id ? 'disabled' : ''}><strong>Слот ${p.slot}</strong><span>${p.user_id ? p.kingdom_name || 'Занят' : 'Свободен'}</span></button>`).join('');
  shell(`<div class="eyebrow">ШАГ 1 / 2</div><h1>Войти в мир</h1><p class="subtitle">Введи код партии, выбери свободный слот и назови своё королевство.</p><form id="find-game" class="form"><label>Код партии<input id="game-code" name="code" inputmode="text" maxlength="6" autocomplete="off" placeholder="ABC123" required></label><button>Найти партию</button>${message ? errorText(message) : '<div class="error"></div>'}</form><div class="step"><p class="step-title">После поиска появятся свободные слоты</p><div class="slots" id="slots">${slots || '<div class="note">Сначала найди партию.</div>'}</div></div>`);
  document.querySelector<HTMLFormElement>('#find-game')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '').trim().toUpperCase();
    const { data, error } = await supabase.from('games').select('id, code, status, month, player_count').eq('code', code).eq('status', 'lobby').maybeSingle();
    if (error || !data) { joinScreen('Партия с таким кодом не найдена или уже запущена.'); return; }
    state.game = data as Game;
    const { data: players, error: playersError } = await supabase.from('players').select('id, slot, kingdom_name, user_id, is_ready').eq('game_id', data.id).order('slot');
    if (playersError) { joinScreen('Не удалось загрузить слоты партии.'); return; }
    state.players = (players ?? []) as Player[];
    renderJoinDetails();
  });
}

function renderJoinDetails(message = '') {
  if (!state.game) return joinScreen(message);
  const slots = state.players.map((p) => `<button type="button" class="slot ${p.user_id ? 'occupied' : ''} ${state.selectedSlot === p.slot ? 'selected' : ''}" data-slot="${p.slot}" ${p.user_id ? 'disabled' : ''}><strong>Слот ${p.slot}</strong><span>${p.user_id ? p.kingdom_name || 'Занят' : 'Свободен'}</span></button>`).join('');
  shell(`<div class="eyebrow">ШАГ 2 / 2</div><div class="lobby-head"><div><div class="eyebrow">КОД ПАРТИИ</div><div class="code">${state.game.code}</div></div><span class="status">ЛОББИ</span></div><div class="step"><p class="step-title">Выбери своё место</p><div class="slots">${slots}</div></div><form id="join" class="form step"><label>Название королевства<input name="kingdom" maxlength="32" minlength="2" placeholder="например, Северное королевство" required></label><button ${state.selectedSlot ? '' : 'disabled'}>Войти в партию</button>${message ? errorText(message) : '<div class="error"></div>'}</form><button id="back" class="secondary" style="margin-top:10px">Изменить код</button>`);
  document.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((button) => button.addEventListener('click', () => { state.selectedSlot = Number(button.dataset.slot); renderJoinDetails(); }));
  document.querySelector<HTMLButtonElement>('#back')?.addEventListener('click', () => { state.game = null; state.players = []; state.selectedSlot = null; joinScreen(); });
  document.querySelector<HTMLFormElement>('#join')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.game || !state.selectedSlot) return;
    const kingdom = String(new FormData(event.currentTarget).get('kingdom') ?? '').trim();
    const { error } = await supabase.rpc('join_game', { p_code: state.game.code, p_slot: state.selectedSlot, p_kingdom_name: kingdom });
    if (error) { renderJoinDetails('Не удалось войти: ' + error.message); return; }
    await playerLobby();
  });
}

async function playerLobby() {
  if (!state.game) return;
  const { data: players, error } = await supabase.from('players').select('id, slot, kingdom_name, user_id, is_ready').eq('game_id', state.game.id).order('slot');
  if (error) { renderJoinDetails('Не удалось обновить лобби.'); return; }
  state.players = (players ?? []) as Player[];
  const me = state.players.find((p) => p.user_id);
  shell(`<div class="eyebrow">ПАРТИЯ ${state.game.code}</div><h1>${me?.kingdom_name || 'Королевство'}</h1><p class="subtitle">Ты подключён. Ждём остальных игроков и запуска партии.</p><div class="step"><p class="step-title">Игроки</p><div class="players">${state.players.map((p) => `<div class="player-row"><div><strong>Слот ${p.slot}</strong><small>${p.kingdom_name || 'Ожидание игрока'}</small></div><span class="${p.user_id ? 'ready' : 'waiting'}">${p.user_id ? 'подключён' : 'свободен'}</span></div>`).join('')}</div><p class="note">TV увидит только общий мир. Экономика, скрытая информация и решения останутся на телефоне игрока.</p></div><button id="refresh" class="secondary" style="margin-top:14px">Обновить лобби</button>`);
  document.querySelector<HTMLButtonElement>('#refresh')?.addEventListener('click', () => void playerLobby());
}

async function start() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { loginScreen(); return; }
  const { data: profile } = await supabase.from('profiles').select('display_name, role').eq('id', session.user.id).maybeSingle();
  if (!profile || !['player', 'admin'].includes(profile.role)) { await supabase.auth.signOut(); loginScreen('Эта учётная запись не является игроком.'); return; }
  const { data: mine } = await supabase.from('players').select('id, slot, kingdom_name, user_id, is_ready, game_id').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (mine) {
    const { data: game } = await supabase.from('games').select('id, code, status, month, player_count').eq('id', mine.game_id).maybeSingle();
    if (game && game.status === 'lobby') { state.game = game as Game; state.selectedSlot = mine.slot; await playerLobby(); return; }
  }
  joinScreen();
}

void start();
