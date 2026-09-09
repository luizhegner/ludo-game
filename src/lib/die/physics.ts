import * as CANNON from 'cannon-es';
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  WebGLRenderer,
  Texture,
  CanvasTexture,
  Quaternion,
} from 'three';
import type { Color } from '../../engine/types';
import { COLOR_HEX } from '../colors';
import { rotationForFace, topFace, topFaceConfidence, validFace } from './face';
import type { DiePose, DieRoll, DieScene, DieSceneOptions } from './types';

const BOARD = 15;
const DIE_SIZE = 1.55;
const WALL_T = 0.35;
const WALL_H = 4;
const MAX_DRAG = 260;
const HOME_WAIT = 900;
const SNAP_MS = 240;
const HOME_MS = 480;

type Phase = 'idle' | 'rolling' | 'snap' | 'hold' | 'homing';

interface Actor {
  id: string;
  color: Color;
  mesh: Mesh;
  edge: LineSegments;
  body: CANNON.Body;
  homeX: number;
  homeZ: number;
  phase: Phase;
  settleFor: number;
  rollStarted: number;
  holdUntil: number;
  homeFrom: { x: number; y: number; z: number };
  homeT: number;
  dragX: number;
  dragY: number;
  promise: Promise<DieRoll> | null;
  resolve: ((roll: DieRoll) => void) | null;
  /** Face sorteada ANTES do gesto: a animação pousa nela (a física não decide). */
  forceValue: number;
  snapFrom: Quaternion | null;
  snapTo: Quaternion | null;
  snapValue: DieRoll['value'];
  snapT: number;
}

/**
 * Mesa 15×15 alinhada ao tabuleiro: o canvas cobre o board inteiro, o dado
 * descansa na base e rola até as bordas (e tromba nos outros, no Deathmatch).
 */
export class PhysicsTable {
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  readonly renderer: WebGLRenderer;
  readonly world: CANNON.World;

  private readonly actors = new Map<string, Actor>();
  private readonly dieMat: CANNON.Material;
  private readonly surface: CANNON.Material;
  private readonly onPose?: (poses: DiePose[]) => void;
  private frame: number | null = null;
  private lastFrame = 0;
  private disposed = false;
  private px = 360;
  private idleUntil = 0;

  constructor(canvas: HTMLCanvasElement, options: { size: number; onPose?: (poses: DiePose[]) => void }) {
    this.canvas = canvas;
    this.onPose = options.onPose;

    this.scene = new Scene();
    this.scene.background = null;
    this.camera = new OrthographicCamera(-BOARD / 2, BOARD / 2, BOARD / 2, -BOARD / 2, 0.1, 80);
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(BOARD / 2, 48, BOARD / 2);
    this.camera.lookAt(BOARD / 2, 0, BOARD / 2);

    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = 2;
    this.renderer.outputColorSpace = 'srgb';

    this.scene.add(new AmbientLight('#ffffff', 1.55));
    const key = new DirectionalLight('#ffffff', 2.6);
    key.position.set(4, 22, 2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 50;
    this.scene.add(key);

    const ground = new Mesh(new PlaneGeometry(BOARD, BOARD), new ShadowMaterial({ color: '#000000', opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(BOARD / 2, 0.02, BOARD / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.surface = new CANNON.Material('table');
    this.dieMat = new CANNON.Material('die');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.surface, this.dieMat, { friction: 0.38, restitution: 0.42 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.dieMat, this.dieMat, { friction: 0.2, restitution: 0.35 }));

    const floor = new CANNON.Body({ mass: 0, material: this.surface, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floor);
    // Bordas do tabuleiro (caixas altas: o dado bate e volta).
    this.addWall(BOARD / 2, -WALL_T / 2, BOARD / 2 + WALL_T, WALL_H / 2, WALL_T / 2);
    this.addWall(BOARD / 2, BOARD + WALL_T / 2, BOARD / 2 + WALL_T, WALL_H / 2, WALL_T / 2);
    this.addWall(-WALL_T / 2, BOARD / 2, WALL_T / 2, WALL_H / 2, BOARD / 2 + WALL_T);
    this.addWall(BOARD + WALL_T / 2, BOARD / 2, WALL_T / 2, WALL_H / 2, BOARD / 2 + WALL_T);

    this.resize(options.size);
    this.render(0);
  }

  get running(): boolean {
    for (const a of this.actors.values()) if (a.phase === 'rolling') return true;
    return false;
  }

  sync(ids: string[]): void {
    for (const id of [...this.actors.keys()]) {
      if (!ids.includes(id)) this.removeDie(id);
    }
  }

  ensureDie(id: string, color: Color, homeX: number, homeZ: number): void {
    const existing = this.actors.get(id);
    if (existing) {
      existing.homeX = homeX;
      existing.homeZ = homeZ;
      if (existing.color !== color) this.setColor(id, color);
      if (existing.phase !== 'rolling') {
        const dx = existing.body.position.x - homeX;
        const dz = existing.body.position.z - homeZ;
        if (dx * dx + dz * dz > 0.08) this.startHome(existing);
      }
      return;
    }
    const materials = [2, 5, 1, 6, 3, 4].map((face) => pipMaterial(face));
    const mesh = new Mesh(new BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE), materials);
    mesh.castShadow = true;
    mesh.position.set(homeX, DIE_SIZE / 2, homeZ);
    this.scene.add(mesh);
    const edge = new LineSegments(
      new EdgesGeometry(mesh.geometry),
      new LineBasicMaterial({ color: COLOR_HEX[color], linewidth: 2 }),
    );
    mesh.add(edge);

    const body = new CANNON.Body({
      mass: 1.4,
      material: this.dieMat,
      shape: new CANNON.Box(new CANNON.Vec3(DIE_SIZE / 2, DIE_SIZE / 2, DIE_SIZE / 2)),
      position: new CANNON.Vec3(homeX, DIE_SIZE / 2, homeZ),
      allowSleep: true,
      sleepSpeedLimit: 0.12,
      sleepTimeLimit: 0.18,
      linearDamping: 0.22,
      angularDamping: 0.22,
    });
    this.world.addBody(body);

    this.actors.set(id, {
      id,
      color,
      mesh,
      edge,
      body,
      homeX,
      homeZ,
      phase: 'idle',
      settleFor: 0,
      rollStarted: 0,
      holdUntil: 0,
      homeFrom: { x: homeX, y: DIE_SIZE / 2, z: homeZ },
      homeT: 1,
      dragX: 0,
      dragY: 0,
      promise: null,
      resolve: null,
      forceValue: 0,
      snapFrom: null,
      snapTo: null,
      snapValue: 1,
      snapT: 0,
    });
    this.kick();
  }

  setColor(id: string, color: Color): void {
    const a = this.actors.get(id);
    if (!a) return;
    a.color = color;
    (a.edge.material as LineBasicMaterial).color.set(COLOR_HEX[color]);
    this.kick();
  }

  poseOf(id: string): DiePose | null {
    const a = this.actors.get(id);
    if (!a) return null;
    return { id, x: a.mesh.position.x, y: a.mesh.position.z, rolling: a.phase === 'rolling' };
  }

  /**
   * `forceValue` é o número sorteado pela camada de apresentação no toque: quando
   * presente, a simulação é só animação e o dado é assentado nessa face.
   */
  roll(id: string, dragX = 0, dragY = 0, forceValue?: number): Promise<DieRoll> {
    const a = this.actors.get(id);
    if (!a || this.disposed) return Promise.resolve({ value: 1, dragX, dragY });
    if (a.promise) return a.promise;
    a.forceValue = forceValue !== undefined && validFace(forceValue) ? forceValue : 0;
    a.dragX = clamp(dragX, -MAX_DRAG, MAX_DRAG);
    a.dragY = clamp(dragY, -MAX_DRAG, MAX_DRAG);
    a.promise = new Promise<DieRoll>((resolve) => (a.resolve = resolve));
    a.phase = 'rolling';
    a.rollStarted = performance.now();
    a.settleFor = 0;
    a.body.wakeUp();
    const x = clamp(a.body.position.x, DIE_SIZE, BOARD - DIE_SIZE);
    const z = clamp(a.body.position.z, DIE_SIZE, BOARD - DIE_SIZE);
    a.body.position.set(x, DIE_SIZE / 2 + 0.55, z);
    a.body.velocity.set(0, 0, 0);
    a.body.angularVelocity.set(0, 0, 0);
    const tap = Math.hypot(a.dragX, a.dragY) < 12;
    const pxToWorld = BOARD / Math.max(1, this.px);
    const ix = tap ? (Math.random() - 0.5) * 4 : a.dragX * pxToWorld * 3.4;
    const iz = tap ? (Math.random() - 0.5) * 4 : a.dragY * pxToWorld * 3.4;
    const iy = tap ? 6.5 : 4.2 + Math.min(5, Math.hypot(ix, iz) * 0.35);
    a.body.applyImpulse(new CANNON.Vec3(ix, iy, iz), a.body.position);
    a.body.angularVelocity.set(
      (Math.random() - 0.5) * 18 + iz * 0.8,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 18 - ix * 0.8,
    );
    this.kick();
    return a.promise;
  }

  resize(size: number): void {
    this.px = Math.max(64, size);
    this.renderer.setSize(this.px, this.px, false);
    this.kick();
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    for (const id of [...this.actors.keys()]) this.removeDie(id);
    this.renderer.dispose();
  }

  private removeDie(id: string): void {
    const a = this.actors.get(id);
    if (!a) return;
    if (a.promise) this.finish(a, 1);
    this.world.removeBody(a.body);
    for (const child of [...a.mesh.children]) child.removeFromParent();
    a.mesh.geometry.dispose();
    for (const material of Array.isArray(a.mesh.material) ? a.mesh.material : [a.mesh.material]) {
      const m = material as MeshStandardMaterial;
      m.map?.dispose();
      m.dispose();
    }
    (a.edge.material as LineBasicMaterial).dispose();
    a.edge.geometry.dispose();
    a.mesh.removeFromParent();
    this.actors.delete(id);
  }

  private addWall(x: number, z: number, hx: number, hy: number, hz: number): void {
    const wall = new CANNON.Body({
      mass: 0,
      material: this.surface,
      shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
      position: new CANNON.Vec3(x, hy, z),
    });
    this.world.addBody(wall);
  }

  private startHome(a: Actor): void {
    if (a.phase === 'rolling') return;
    a.phase = 'homing';
    a.homeFrom = { x: a.mesh.position.x, y: a.mesh.position.y, z: a.mesh.position.z };
    a.homeT = 0;
    a.body.sleep();
    this.kick();
  }

  private kick(): void {
    this.idleUntil = performance.now() + 80;
    this.startFrame();
  }

  private startFrame(): void {
    if (this.frame === null) {
      this.lastFrame = performance.now();
      this.frame = requestAnimationFrame((time) => this.render(time));
    }
  }

  private render(time: number): void {
    this.frame = null;
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0.001, (time - this.lastFrame) / 1000 || 1 / 60));
    this.lastFrame = time;
    let busy = false;

    const needStep = [...this.actors.values()].some((a) => a.phase === 'rolling');
    if (needStep) this.world.step(1 / 60, dt, 4);

    for (const a of this.actors.values()) {
      if (a.phase === 'rolling') {
        busy = true;
        a.mesh.position.set(a.body.position.x, a.body.position.y, a.body.position.z);
        a.mesh.quaternion.set(a.body.quaternion.x, a.body.quaternion.y, a.body.quaternion.z, a.body.quaternion.w);
        const q = a.mesh.quaternion;
        if (topFaceConfidence(q) < 0.82 && a.body.velocity.length() < 0.6) {
          a.body.wakeUp();
          a.body.angularVelocity.x += (Math.random() - 0.5) * 3;
          a.body.angularVelocity.z += (Math.random() - 0.5) * 3;
        }
        const speed = a.body.velocity.length() + a.body.angularVelocity.length() * 0.2;
        if (speed < 0.28) a.settleFor += dt;
        else a.settleFor = 0;
        if (a.settleFor > 0.22 || time - a.rollStarted > 3200) this.finish(a, topFace(a.mesh.quaternion));
      } else if (a.phase === 'snap') {
        busy = true;
        a.snapT = Math.min(1, a.snapT + dt * (1000 / SNAP_MS));
        const t = easeOut(a.snapT);
        if (a.snapFrom && a.snapTo) a.mesh.quaternion.copy(a.snapFrom).slerp(a.snapTo, t);
        a.mesh.position.y += (DIE_SIZE / 2 - a.mesh.position.y) * Math.min(1, dt * 14);
        if (a.snapT >= 1) this.settle(a, a.snapValue);
      } else if (a.phase === 'hold') {
        busy = true;
        if (time >= a.holdUntil) this.startHome(a);
      } else if (a.phase === 'homing') {
        busy = true;
        a.homeT = Math.min(1, a.homeT + dt * (1000 / HOME_MS));
        const t = easeOut(a.homeT);
        a.mesh.position.set(
          a.homeFrom.x + (a.homeX - a.homeFrom.x) * t,
          a.homeFrom.y + (DIE_SIZE / 2 - a.homeFrom.y) * t,
          a.homeFrom.z + (a.homeZ - a.homeFrom.z) * t,
        );
        if (a.homeT >= 1) {
          a.phase = 'idle';
          a.body.position.set(a.homeX, DIE_SIZE / 2, a.homeZ);
          a.body.velocity.set(0, 0, 0);
          a.body.angularVelocity.set(0, 0, 0);
          a.body.quaternion.set(a.mesh.quaternion.x, a.mesh.quaternion.y, a.mesh.quaternion.z, a.mesh.quaternion.w);
          a.body.sleep();
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.onPose?.([...this.actors.values()].map((a) => ({ id: a.id, x: a.mesh.position.x, y: a.mesh.position.z, rolling: a.phase === 'rolling' })));

    if (busy || time < this.idleUntil) this.frame = requestAnimationFrame((next) => this.render(next));
  }

  private finish(a: Actor, raw: number): void {
    if (!a.promise) return;
    const value: DieRoll['value'] = validFace(raw) ? raw : 1;
    const forced = a.forceValue;
    a.forceValue = 0;
    if (validFace(forced) && forced !== value) {
      // Resultado pré-sorticado: corrige o pouso suavemente para a face certa.
      a.snapFrom = a.mesh.quaternion.clone();
      a.snapTo = rotationForFace(forced);
      a.snapValue = forced;
      a.snapT = 0;
      a.phase = 'snap';
      a.body.velocity.set(0, 0, 0);
      a.body.angularVelocity.set(0, 0, 0);
      a.body.sleep();
      return;
    }
    this.settle(a, value);
  }

  /** Dado assentado: resolve a promessa da jogada e entra em espera antes de voltar à base. */
  private settle(a: Actor, value: DieRoll['value']): void {
    const result: DieRoll = { value, dragX: a.dragX, dragY: a.dragY };
    const resolve = a.resolve;
    a.promise = null;
    a.resolve = null;
    a.body.velocity.set(0, 0, 0);
    a.body.sleep();
    a.phase = 'hold';
    a.holdUntil = performance.now() + HOME_WAIT;
    resolve?.(result);
  }
}

/** Um dado só — API antiga, usada se alguém ainda instancia PhysicsDie. */
export class PhysicsDie implements DieScene {
  readonly canvas: HTMLCanvasElement;
  color: Color;
  private readonly table: PhysicsTable;
  private readonly onResult?: (roll: DieRoll) => void;

  constructor(canvas: HTMLCanvasElement, options: DieSceneOptions) {
    this.canvas = canvas;
    this.color = options.color;
    this.onResult = options.onResult;
    this.table = new PhysicsTable(canvas, { size: options.size });
    this.table.ensureDie('main', options.color, BOARD / 2, BOARD / 2);
  }

  get running(): boolean {
    return this.table.running;
  }

  roll(dragX = 0, dragY = 0, forceValue?: number): Promise<DieRoll> {
    return this.table.roll('main', dragX, dragY, forceValue).then((r) => {
      this.onResult?.(r);
      return r;
    });
  }

  resize(size: number): void {
    this.table.resize(size);
  }

  setColor(color: Color): void {
    this.color = color;
    this.table.setColor('main', color);
  }

  dispose(): void {
    this.table.dispose();
  }
}

function pipMaterial(value: number): MeshStandardMaterial {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return new MeshStandardMaterial({ color: '#ffffff', roughness: 0.52, metalness: 0.02 });
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new MeshStandardMaterial({ color: '#ffffff', roughness: 0.52, metalness: 0.02 });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#e8eaef';
  ctx.lineWidth = 14;
  ctx.strokeRect(8, 8, 240, 240);
  const pips: Record<number, [number, number][]> = {
    1: [[128, 128]],
    2: [[68, 68], [188, 188]],
    3: [[68, 68], [128, 128], [188, 188]],
    4: [[68, 68], [188, 68], [68, 188], [188, 188]],
    5: [[68, 68], [188, 68], [128, 128], [68, 188], [188, 188]],
    6: [[68, 56], [188, 56], [68, 128], [188, 128], [68, 200], [188, 200]],
  };
  ctx.fillStyle = '#1f2430';
  for (const [x, y] of pips[value] ?? pips[1]) {
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture: Texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return new MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0.02 });
}

export function canUseWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2') || !!canvas.getContext('webgl');
  } catch {
    return false;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
