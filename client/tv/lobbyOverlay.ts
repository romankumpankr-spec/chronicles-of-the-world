import { supabase } from '../lib/supabase.ts';
import './style.css';

const mount = () => {
  if (document.querySelector('#lobby-toggle')) return;
  const toggle = document.createElement('button');
  toggle.id = 'lobby-toggle';
  toggle.className = 'lobby-toggle';
  toggle.textContent = 'ПАРТИИ';
  document.body.appendChild(toggle);

  const panel = document.createElement('section');
  panel.id = 'lobby-panel';
  panel.className = 'lobby-panel hidden';
  panel.innerHTML = `
    <div class="lobby-head">
      <div><div class="eyebrow">CHRONICLES OF THE WORLD</div><h2>Лобби</h2></div>
      <button id="lobby-close" class="panel-close">×</button>
    </div>
    <div class="lobby-create">
      <label>Игроков <select id="player-count"><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select></label>
      <button id="create-game" class="primary-action">Создать партию</button>
    </div>
    <div id="lobby-status" class="lobby-status">Загрузка...</div>
    <div id="lobby-list" class="lobby-list"></div>
  `;
  document.body.appendChild(panel);

  const status = panel.querySelector<HTMLDivElement>('#lobby-status')!;
  const list = panel.querySelector<HTMLDivElement>('#lobby-list')!;

  const render = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      status.textContent = 'Нет активной сессии TV. Войдите заново.';
      list.innerHTML = '';
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();
    if (profileError) {
      status.textContent = `Ошибка профиля: ${profileError.message}`;
      return;
    }
    if (!profile || !['tv', 'admin'].includes(profile.role)) {
      status.textContent = 'У этой учётной записи нет роли TV.';
      return;
    }

    const { data: games, error } = await supabase
      .from('games')
      .select('id, code, status, month, player_count, created_at')
      .in('status', ['lobby', 'active'])
      .order('created_at', { ascending: false });
    if (error) {
      console.error('TV lobby load failed', error);
      status.textContent = `Ошибка загрузки партий: ${error.message}`;
      return;
    }
    if (!games?.length) {
      status.textContent = 'Партий пока нет.';
      list.innerHTML = '';
      return;
    }

    status.textContent = 'Партии обновляются автоматически.';
    list.innerHTML = games.map((game) => `
      <article class="lobby-game">
        <div><strong>${game.code}</strong><span>${game.status === 'active' ? 'ИДЁТ ИГРА' : 'ЛОББИ'}</span></div>
        <div class="lobby-game-meta">${game.player_count} игроков · месяц ${game.month}</div>
        ${game.status === 'lobby' ? `<button class="start-game" data-id="${game.id}">Начать</button>` : ''}
      </article>`).join('');

    list.querySelectorAll<HTMLButtonElement>('.start-game').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        const { error: startError } = await supabase.rpc('start_game', { p_game_id: button.dataset.id });
        if (startError) {
          status.textContent = `Не удалось начать: ${startError.message}`;
          button.disabled = false;
          return;
        }
        await render();
        location.reload();
      });
    });
  };

  toggle.addEventListener('click', async () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) await render();
  });
  panel.querySelector<HTMLButtonElement>('#lobby-close')!.addEventListener('click', () => panel.classList.add('hidden'));
  panel.querySelector<HTMLButtonElement>('#create-game')!.addEventListener('click', async () => {
    const count = Number((panel.querySelector<HTMLSelectElement>('#player-count')!).value);
    const button = panel.querySelector<HTMLButtonElement>('#create-game')!;
    button.disabled = true;
    status.textContent = 'Создаём партию...';
    const { data, error } = await supabase.rpc('create_game', { p_player_count: count });
    button.disabled = false;
    if (error) {
      console.error('TV create game failed', error);
      status.textContent = `Ошибка создания: ${error.message}`;
      return;
    }
    const created = Array.isArray(data) ? data[0] : data;
    status.textContent = created?.game_code ? `Партия создана: ${created.game_code}` : 'Партия создана.';
    await render();
  });

  void render();
};

const observer = new MutationObserver(mount);
observer.observe(document.body, { childList: true });
mount();
