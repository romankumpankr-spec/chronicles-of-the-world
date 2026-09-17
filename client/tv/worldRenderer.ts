import * as THREE from 'three';
import type { WorldHex, WorldSeed } from '../../shared/types.ts';

const palette: Record<WorldHex['terrain'], number> = {
  plains: 0x7f9d63,
  forest: 0x3f6549,
  mountain: 0x77766f,
  water: 0x2e6078,
  desert: 0xb69b67,
};

function hexShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function hexPosition(hex: WorldHex, radius: number): THREE.Vector3 {
  const hexWidth = Math.sqrt(3) * radius;
  const rowStep = radius * 1.5;
  return new THREE.Vector3(
    hex.q * hexWidth + (hex.r % 2) * hexWidth * 0.5,
    -hex.r * rowStep,
    hex.elevation * 0.7,
  );
}

function localHash(q: number, r: number): number {
  let h = Math.imul(q + 17, 374761393) ^ Math.imul(r + 31, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function addForest(scene: THREE.Scene, hex: WorldHex, radius: number): void {
  const base = hexPosition(hex, radius);
  const count = 2 + Math.floor(localHash(hex.q, hex.r) * 3);
  const treeGeometry = new THREE.ConeGeometry(0.14, 0.5, 5);
  const trunkGeometry = new THREE.CylinderGeometry(0.035, 0.045, 0.22, 5);
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x244b37, roughness: 0.95 });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x624a31, roughness: 1 });

  for (let i = 0; i < count; i += 1) {
    const angle = localHash(hex.q + i * 7, hex.r + i * 11) * Math.PI * 2;
    const distance = 0.16 + localHash(hex.q - i * 5, hex.r + i * 3) * 0.38;
    const x = base.x + Math.cos(angle) * distance;
    const y = base.y + Math.sin(angle) * distance;
    const z = base.z + 0.15;
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, y, z);
    const crown = new THREE.Mesh(treeGeometry, crownMaterial);
    crown.position.set(x, y, z + 0.27);
    crown.scale.setScalar(0.8 + localHash(hex.q + i, hex.r - i) * 0.45);
    scene.add(trunk, crown);
  }
}

function addMountain(scene: THREE.Scene, hex: WorldHex, radius: number): void {
  const base = hexPosition(hex, radius);
  const height = 0.7 + hex.elevation * 1.35;
  const geometry = new THREE.ConeGeometry(0.48, height, 6);
  const material = new THREE.MeshStandardMaterial({ color: 0x696762, roughness: 0.98 });
  const mountain = new THREE.Mesh(geometry, material);
  mountain.position.set(base.x, base.y, base.z + height * 0.5 + 0.04);
  scene.add(mountain);

  const snowHeight = Math.max(0.18, height * 0.25);
  const snow = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, snowHeight, 6),
    new THREE.MeshStandardMaterial({ color: 0xdfe5e1, roughness: 0.9 }),
  );
  snow.position.set(base.x, base.y, base.z + height - snowHeight * 0.32);
  scene.add(snow);
}

function addDesertDetails(scene: THREE.Scene, hex: WorldHex, radius: number): void {
  const base = hexPosition(hex, radius);
  const rockGeometry = new THREE.DodecahedronGeometry(0.1, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x8f774e, roughness: 1 });
  for (let i = 0; i < 2; i += 1) {
    const rock = new THREE.Mesh(rockGeometry, material);
    const angle = localHash(hex.q + i * 9, hex.r + i * 13) * Math.PI * 2;
    const distance = 0.2 + localHash(hex.q + i, hex.r - i) * 0.4;
    rock.position.set(base.x + Math.cos(angle) * distance, base.y + Math.sin(angle) * distance, base.z + 0.12);
    rock.scale.setScalar(0.7 + localHash(hex.q - i, hex.r + i) * 0.7);
    scene.add(rock);
  }
}

function addRiver(scene: THREE.Scene, hexes: WorldHex[], radius: number): void {
  const byId = new Map(hexes.map((hex) => [hex.id, hex]));
  const seen = new Set<string>();
  const evenOffsets = [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const oddOffsets = [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];

  for (const start of hexes.filter((hex) => hex.river)) {
    if (seen.has(start.id)) continue;
    const points: THREE.Vector3[] = [];
    let current = start;
    for (let step = 0; step < 14; step += 1) {
      if (seen.has(current.id) && current.id !== start.id) break;
      seen.add(current.id);
      const p = hexPosition(current, radius);
      p.z += 0.12;
      points.push(p);
      if (current.terrain === 'water') break;
      const offsets = current.r % 2 === 0 ? evenOffsets : oddOffsets;
      const next = offsets
        .map(([dq, dr]) => byId.get(`${current.q + dq}:${current.r + dr}`))
        .filter((hex): hex is WorldHex => Boolean(hex && hex.river && !seen.has(hex.id)))
        .sort((a, b) => a.elevation - b.elevation)[0];
      if (!next) break;
      current = next;
    }
    if (points.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, Math.max(10, points.length * 4), 0.07, 6, false);
    const material = new THREE.MeshStandardMaterial({ color: 0x72b6cf, roughness: 0.25, metalness: 0.05 });
    scene.add(new THREE.Mesh(geometry, material));
  }
}

export function createWorldScene(world: WorldSeed): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081014);
  scene.fog = new THREE.Fog(0x081014, 25, 75);

  const radius = 1;
  const geometry = new THREE.ExtrudeGeometry(hexShape(radius * 0.985), {
    depth: 0.14,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  const group = new THREE.Group();

  for (const hex of world.hexes) {
    const material = new THREE.MeshStandardMaterial({
      color: palette[hex.terrain],
      roughness: hex.terrain === 'water' ? 0.5 : 0.92,
      metalness: hex.terrain === 'water' ? 0.08 : 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const p = hexPosition(hex, radius);
    mesh.position.set(p.x, p.y, p.z);
    mesh.userData.hexId = hex.id;
    group.add(mesh);

    if (hex.terrain === 'forest') addForest(scene, hex, radius);
    if (hex.terrain === 'mountain') addMountain(scene, hex, radius);
    if (hex.terrain === 'desert') addDesertDetails(scene, hex, radius);
  }

  scene.add(group);
  addRiver(scene, world.hexes, radius);

  scene.add(new THREE.HemisphereLight(0xdbe8de, 0x18231f, 2.6));
  const sun = new THREE.DirectionalLight(0xfff3d8, 3.4);
  sun.position.set(10, -16, 26);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9cc7ff, 0.75);
  fill.position.set(-18, 8, 12);
  scene.add(fill);

  return scene;
}
