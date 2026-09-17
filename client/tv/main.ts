import * as THREE from 'three';
import { supabase } from '../lib/supabase.ts';
import { generateWorld } from '../../world/generation/generateWorld.ts';
import { loadActiveWorld } from './worldState.ts';
import { createWorldScene } from './worldRenderer.ts';
import type { WorldHex, WorldSeed } from '../../shared/types.ts';
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

function showLoginError(message: string) {
  const error = document.querySelector<HTMLDivElement>('#login-error');
  if (error) error.textContent = message;
}

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

  await renderWorld(profile.display_name || 'TV', profile.role);
}

async function renderWorld(displayName: string, role: string) {
  app.innerHTML = '<div id="world-root"></div>';
  const root = document.querySelector<HTMLDivElement>('#world-root');
  if (!root) throw new Error('World root not found');

  root.innerHTML = '<div class="world-loading"><div>ЗАГРУЗКА МИРА</div><span>Синхронизация с хроникой...</span></div>';

  let world: WorldSeed;
  let gameId: string | null = null;
  let gameCode = 'LOCAL';
  let month = 1;

  try {
    const active = await loadActiveWorld();
    if (active) {
      world = active.world;
      gameId = active.gameId;
      gameCode = active.code;
      month = active.month;
    } else {
      world = generateWorld(20700916, 18, 12);
    }
  } catch (error) {
    console.error('World state load failed', error);
    world = generateWorld(20700916, 18, 12);
  }

  root.innerHTML = '';
  const hud = document.createElement('div');
  hud.className = 'tv-hud';
  hud.innerHTML = `
    <div class="tv-brand">ХРОНИКИ МИРА</div>
    <div class="tv-meta"><span>TV MODE</span><span>${displayName}</span><span>Месяц ${month} / 50</span><span>${gameCode}</span></div>
    <button id="logout" class="logout">Выйти</button>`;
  root.appendChild(hud);

  const hexById = new Map<string, WorldHex>(world.hexes.map((hex) => [hex.id, hex]));
  const scene = createWorldScene(world);
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(15, -13, 24);
  camera.lookAt(15, -10, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'world-canvas';
  root.appendChild(renderer.domElement);

  const info = document.createElement('aside');
  info.className = 'hex-info';
  info.innerHTML = `
    <div class="hex-info-kicker">МИР</div>
    <h2>Выберите территорию</h2>
    <p>${gameId ? 'Данные загружены из World State.' : 'Активной партии пока нет. Показан процедурный прототип.'}</p>`;
  root.appendChild(info);

  const hint = document.createElement('div');
  hint.className = 'map-hint';
  hint.textContent = 'Колесо — масштаб  •  ЛКМ — перемещение  •  Клик — территория';
  root.appendChild(hint);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: THREE.Mesh | null = null;
  let selected: THREE.Mesh | null = null;
  let dragging = false;
  let moved = false;
  let lastPointer = { x: 0, y: 0 };
  let cameraDistance = 24;

  const restoreMesh = (mesh: THREE.Mesh | null) => {
    if (!mesh) return;
    mesh.scale.setScalar(1);
    const material = mesh.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    }
  };

  const highlightMesh = (mesh: THREE.Mesh | null, color: number, intensity: number) => {
    if (!mesh) return;
    const material = mesh.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissive.setHex(color);
      material.emissiveIntensity = intensity;
    }
  };

  const pickHex = (event: PointerEvent): THREE.Mesh | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    return hits.find((hit) => hit.object instanceof THREE.Mesh && typeof hit.object.userData.hexId === 'string')?.object as THREE.Mesh | undefined ?? null;
  };

  const formatTerrain = (terrain: WorldHex['terrain']) => ({
    plains: 'Равнина', forest: 'Лес', mountain: 'Горы', water: 'Вода', desert: 'Пустыня',
  })[terrain];

  const updateInfo = (hex: WorldHex) => {
    const resource = hex.resource ?? 'нет';
    const settlement = hex.settlement === 'city' ? 'Город' : hex.settlement === 'settlement' ? 'Поселение' : 'нет';
    info.innerHTML = `
      <div class="hex-info-kicker">ТЕРРИТОРИЯ</div>
      <h2>${formatTerrain(hex.terrain)}</h2>
      <div class="hex-grid">
        <span>Координаты</span><strong>${hex.q}, ${hex.r}</strong>
        <span>Высота</span><strong>${hex.elevation.toFixed(2)}</strong>
        <span>Ресурс</span><strong>${resource}</strong>
        <span>Поселение</span><strong>${settlement}</strong>
        <span>Дорога</span><strong>${hex.road ? 'есть' : 'нет'}</strong>
        <span>Река</span><strong>${hex.river ? 'есть' : 'нет'}</strong>
        <span>Тьма</span><strong>${hex.darkness}%</strong>
      </div>`;
  };

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (dragging) {
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      camera.position.x -= dx * 0.012 * (cameraDistance / 24);
      camera.position.y += dy * 0.012 * (cameraDistance / 24);
      camera.lookAt(camera.position.x, camera.position.y, 0);
      lastPointer = { x: event.clientX, y: event.clientY };
      return;
    }
    const next = pickHex(event);
    if (next === hovered) return;
    restoreMesh(hovered);
    hovered = next;
    if (hovered && hovered !== selected) highlightMesh(hovered, 0xcfe8d9, 0.35);
    renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
  });

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    lastPointer = { x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener('pointerup', (event) => {
    if (event.button !== 0) return;
    dragging = false;
    renderer.domElement.releasePointerCapture(event.pointerId);
    if (moved) return;
    const next = pickHex(event);
    if (!next) return;
    restoreMesh(selected);
    if (hovered && hovered !== next) restoreMesh(hovered);
    selected = next;
    highlightMesh(selected, 0xd9f1df, 0.8);
    const hex = hexById.get(String(selected.userData.hexId));
    if (hex) updateInfo(hex);
  });

  renderer.domElement.addEventListener('pointerleave', () => {
    if (!dragging) {
      restoreMesh(hovered);
      hovered = null;
    }
  });

  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * 0.015, 13, 42);
    camera.position.z = cameraDistance;
    camera.lookAt(camera.position.x, camera.position.y, 0);
  }, { passive: false });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.querySelector<HTMLButtonElement>('#logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });

  void role;
  function animate() {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

document.querySelector<HTMLFormElement>('#tv-login')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
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
