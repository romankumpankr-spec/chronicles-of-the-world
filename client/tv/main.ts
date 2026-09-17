import * as THREE from 'three';
import { supabase } from '../lib/supabase.ts';
import { generateWorld } from '../../world/generation/generateWorld.ts';
import { createWorldScene } from './worldRenderer.ts';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

const loginMarkup = `
  <main class="auth-shell">
    <section class="auth-card">
      <div class="eyebrow">CHRONICLES OF THE WORLD</div>
      <h1>TV Console</h1>
      <p class="muted">Общий экран мира. Личные данные игроков здесь не отображаются.</p>
      <form id="tv-login" class="auth-form">
        <label>Email<input name="email" type="email" autocomplete="username" required /></label>
        <label>Пароль<input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit">Войти как TV</button>
        <div id="login-error" class="error"></div>
      </form>
    </section>
  </main>`;

app.innerHTML = loginMarkup;

async function startTvSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, role')
    .eq('id', session.user.id)
    .single();

  if (error || !profile || !['tv', 'admin'].includes(profile.role)) {
    await supabase.auth.signOut();
    showLoginError('Эта учётная запись не имеет роли TV.');
    return;
  }

  renderWorld(profile.display_name, profile.role);
}

function showLoginError(message: string) {
  const error = document.querySelector<HTMLDivElement>('#login-error');
  if (error) error.textContent = message;
}

function renderWorld(displayName: string, role: string) {
  app.innerHTML = '<div id="world-root"></div>';
  const root = document.querySelector<HTMLDivElement>('#world-root');
  if (!root) throw new Error('World root not found');

  const hud = document.createElement('div');
  hud.className = 'tv-hud';
  hud.innerHTML = `
    <div class="tv-brand">ХРОНИКИ МИРА</div>
    <div class="tv-meta"><span>TV MODE</span><span>${displayName}</span><span>Месяц 1 / 50</span></div>
    <button id="logout" class="logout">Выйти</button>`;
  root.appendChild(hud);

  const world = generateWorld(20700916, 18, 12);
  const scene = createWorldScene(world);
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(15, -13, 24);
  camera.lookAt(15, -10, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.querySelector<HTMLButtonElement>('#logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });

  function animate() {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  void role;
  animate();
}

document.querySelector<HTMLFormElement>('#tv-login')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  showLoginError('');

  const { error } = await supabase.auth.signInWithPassword({
    email: String(data.get('email') ?? ''),
    password: String(data.get('password') ?? ''),
  });

  if (error) {
    showLoginError('Не удалось войти. Проверьте email и пароль.');
    return;
  }

  await startTvSession();
});

void startTvSession();
