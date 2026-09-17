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
      p.z += 0.075;
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
    const geometry = new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), 0.045, 5, false);
    const material = new THREE.MeshStandardMaterial({ color: 0x72b6cf, roughness: 0.35, metalness: 0.05 });
    scene.add(new THREE.Mesh(geometry, material));
  }
}

export function createWorldScene(world: WorldSeed): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081014);
  scene.fog = new THREE.Fog(0x081014, 20, 70);

  const radius = 1;
  const geometry = new THREE.ExtrudeGeometry(hexShape(radius * 0.985), {
    depth: 0.12,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  geometry.rotateX(0);
  const group = new THREE.Group();

  for (const hex of world.hexes) {
    const material = new THREE.MeshStandardMaterial({
      color: palette[hex.terrain],
      roughness: hex.terrain === 'water' ? 0.55 : 0.92,
      metalness: hex.terrain === 'water' ? 0.08 : 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const p = hexPosition(hex, radius);
    mesh.position.set(p.x, p.y, p.z);
    mesh.userData.hexId = hex.id;
    group.add(mesh);
  }

  scene.add(group);
  addRiver(scene, world.hexes, radius);

  scene.add(new THREE.HemisphereLight(0xdbe8de, 0x18231f, 2.5));
  const sun = new THREE.DirectionalLight(0xfff3d8, 3.2);
  sun.position.set(10, -16, 24);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9cc7ff, 0.8);
  fill.position.set(-18, 8, 12);
  scene.add(fill);

  return scene;
}
