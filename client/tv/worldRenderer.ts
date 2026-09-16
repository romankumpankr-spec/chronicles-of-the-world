import * as THREE from 'three';
import type { WorldHex, WorldSeed } from '../../shared/types.ts';

const palette: Record<WorldHex['terrain'], number> = {
  plains: 0x7c9860,
  forest: 0x426447,
  mountain: 0x77736b,
  water: 0x355b73,
  desert: 0xb59b68,
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

export function createWorldScene(world: WorldSeed): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1114);

  const radius = 1;
  const geometry = new THREE.ShapeGeometry(hexShape(radius));
  const group = new THREE.Group();
  const hexWidth = Math.sqrt(3) * radius;
  const rowStep = radius * 1.5;

  for (const hex of world.hexes) {
    const material = new THREE.MeshStandardMaterial({
      color: palette[hex.terrain],
      roughness: 1,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      hex.q * hexWidth + (hex.r % 2) * hexWidth * 0.5,
      -hex.r * rowStep,
      hex.elevation * 0.35,
    );
    group.add(mesh);
  }

  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xd8e2d4, 0x18211d, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(12, -10, 18);
  scene.add(sun);

  return scene;
}
