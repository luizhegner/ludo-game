import { Vector3, Quaternion } from 'three';

/**
 * Normais locais do cubo. O dado fica com a face 1 voltada para cima quando
 * está sem rotação; as faces opostas somam 7.
 */
export const FACE_NORMALS: Readonly<Record<number, [number, number, number]>> = {
  1: [0, 1, 0],
  6: [0, -1, 0],
  2: [1, 0, 0],
  5: [-1, 0, 0],
  3: [0, 0, 1],
  4: [0, 0, -1],
};

const UP = new Vector3(0, 1, 0);

/** Face que aponta mais para cima para a orientação atual do cubo. */
export function topFace(rotation: Quaternion): number {
  let best = 1;
  let bestDot = -Infinity;
  for (const [raw, normal] of Object.entries(FACE_NORMALS)) {
    const world = new Vector3(normal[0], normal[1], normal[2]).applyQuaternion(rotation);
    const dot = world.dot(UP);
    if (dot > bestDot) {
      bestDot = dot;
      best = Number(raw);
    }
  }
  return best;
}

/** Dot da melhor face com o eixo vertical (1 = perfeitamente assentada). */
export function topFaceConfidence(rotation: Quaternion): number {
  let best = -Infinity;
  for (const normal of Object.values(FACE_NORMALS)) {
    best = Math.max(best, new Vector3(normal[0], normal[1], normal[2]).applyQuaternion(rotation).dot(UP));
  }
  return best;
}

/** Escolhe uma rotação que deixa `face` para cima, com um giro horizontal opcional. */
export function rotationForFace(face: number, yaw = 0): Quaternion {
  const normal = FACE_NORMALS[face] ?? FACE_NORMALS[1];
  const local = new Vector3(normal[0], normal[1], normal[2]);
  const q = new Quaternion();
  // Alinha a normal da face com o eixo Y usando o menor arco.
  q.setFromUnitVectors(local, UP);
  const spin = new Quaternion().setFromAxisAngle(UP, yaw);
  return spin.multiply(q);
}

/** Mantém valores vindos da física dentro do intervalo permitido pelo motor. */
export function validFace(value: number): value is 1 | 2 | 3 | 4 | 5 | 6 {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}
