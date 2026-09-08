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
} from 'three';
import type { Color } from '../../engine/types';
import { COLOR_HEX } from '../colors';
import { topFace, validFace } from './face';
import type { DieRoll, DieScene, DieSceneOptions } from './types';

const WORLD_SIZE = 1.05;
const DIE_SIZE = 0.98;
const VIEW = 0.78;
const MAX_DRAG = 180;

/**
 * Pequena cena Three.js + cannon-es para um único dado.
 *
 * A classe não sabe nada sobre o jogo: ela apenas devolve a face que ficou
 * para cima. Sorteio, turnos e persistência continuam no motor/store.
 */
export class PhysicsDie implements DieScene {
  readonly canvas: HTMLCanvasElement;
  color: Color;
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  readonly renderer: WebGLRenderer;
  readonly world: CANNON.World;
  readonly body: CANNON.Body;
  readonly mesh: Mesh;

  private readonly edge: LineSegments;
  private readonly ground: Mesh;
  private readonly onResult?: (roll: DieRoll) => void;
  private frame: number | null = null;
  private lastFrame = 0;
  private settleFor = 0;
  private rollStarted = 0;
  private current: Promise<DieRoll> | null = null;
  private resolveCurrent: ((roll: DieRoll) => void) | null = null;
  private dragX = 0;
  private dragY = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: DieSceneOptions) {
    this.canvas = canvas;
    this.color = options.color;
    this.onResult = options.onResult;

    this.scene = new Scene();
    this.scene.background = null;
    this.camera = new OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 30);
    this.camera.position.set(2.4, 3.2, 3.4);
    this.camera.lookAt(0, DIE_SIZE / 2, 0);

    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = 2;
    this.renderer.outputColorSpace = 'srgb';

    this.scene.add(new AmbientLight('#ffffff', 1.8));
    const key = new DirectionalLight('#ffffff', 3.2);
    key.position.set(-3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    this.scene.add(key);

    this.ground = new Mesh(new PlaneGeometry(3.2, 3.2), new ShadowMaterial({ color: '#000000', opacity: 0.22 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    const materials = [2, 5, 1, 6, 3, 4].map((face) => pipMaterial(face));
    this.mesh = new Mesh(new BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE), materials);
    this.mesh.castShadow = true;
    this.mesh.position.y = DIE_SIZE / 2 + 0.08;
    this.scene.add(this.mesh);
    this.edge = new LineSegments(new EdgesGeometry(this.mesh.geometry), new LineBasicMaterial({ color: COLOR_HEX[options.color], linewidth: 2 }));
    this.mesh.add(this.edge);

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    const surface = new CANNON.Material('table');
    const dieSurface = new CANNON.Material('die');
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(surface, dieSurface, { friction: 0.42, restitution: 0.34 }),
    );
    this.world.addContactMaterial(new CANNON.ContactMaterial(surface, surface, { friction: 0.5, restitution: 0.2 }));
    this.body = new CANNON.Body({
      mass: 1,
      material: dieSurface,
      shape: new CANNON.Box(new CANNON.Vec3(DIE_SIZE / 2, DIE_SIZE / 2, DIE_SIZE / 2)),
      position: new CANNON.Vec3(0, DIE_SIZE / 2 + 0.08, 0),
      allowSleep: true,
      sleepSpeedLimit: 0.08,
      sleepTimeLimit: 0.16,
      linearDamping: 0.18,
      angularDamping: 0.18,
    });
    this.world.addBody(this.body);

    // Caixa invisível em volta do tabuleiro. Caixas simples são mais estáveis
    // que planos finos quando o dado bate de quina.
    this.addWall(new CANNON.Vec3(WORLD_SIZE, 0.5, 0), new CANNON.Vec3(0.08, 0.55, WORLD_SIZE + 0.25), surface);
    this.addWall(new CANNON.Vec3(-WORLD_SIZE, 0.5, 0), new CANNON.Vec3(0.08, 0.55, WORLD_SIZE + 0.25), surface);
    this.addWall(new CANNON.Vec3(0, 0.5, WORLD_SIZE), new CANNON.Vec3(WORLD_SIZE + 0.25, 0.55, 0.08), surface);
    this.addWall(new CANNON.Vec3(0, 0.5, -WORLD_SIZE), new CANNON.Vec3(WORLD_SIZE + 0.25, 0.55, 0.08), surface);
    const floor = new CANNON.Body({ mass: 0, material: surface, shape: new CANNON.Plane(), position: new CANNON.Vec3(0, 0, 0) });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floor);

    this.resize(options.size);
    this.render(0);
  }

  get running(): boolean {
    return this.current !== null;
  }

  roll(dragX = 0, dragY = 0): Promise<DieRoll> {
    if (this.disposed) return Promise.resolve({ value: 1, dragX, dragY });
    if (this.current) return this.current;
    this.dragX = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dragX));
    this.dragY = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dragY));
    this.current = new Promise<DieRoll>((resolve) => (this.resolveCurrent = resolve));
    this.rollStarted = performance.now();
    this.settleFor = 0;
    this.body.wakeUp();
    this.body.position.set(0, DIE_SIZE / 2 + 0.55, 0);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.setFromEuler(Math.random() * 2, Math.random() * 2, Math.random() * 2);
    const impulse = new CANNON.Vec3(this.dragX / MAX_DRAG * 1.15, 1.55, -this.dragY / MAX_DRAG * 1.15);
    this.body.applyImpulse(impulse, this.body.position);
    this.body.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    this.startFrame();
    return this.current;
  }

  resize(size: number): void {
    const px = Math.max(32, size);
    this.renderer.setSize(px, px, false);
  }

  setColor(color: Color): void {
    this.color = color;
    (this.edge.material as LineBasicMaterial).color.set(COLOR_HEX[color]);
    if (!this.current) this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    for (const child of [...this.mesh.children]) child.removeFromParent();
    this.mesh.geometry.dispose();
    for (const material of Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material]) {
      const m = material as MeshStandardMaterial;
      const map = m.map;
      m.dispose();
      map?.dispose();
    }
    (this.edge.material as LineBasicMaterial).dispose();
    this.edge.geometry.dispose();
    this.renderer.dispose();
    if (this.current) this.finish(1);
  }

  private addWall(position: CANNON.Vec3, half: CANNON.Vec3, material: CANNON.Material): void {
    const wall = new CANNON.Body({ mass: 0, material, shape: new CANNON.Box(half), position });
    this.world.addBody(wall);
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
    if (this.current) {
      this.world.step(1 / 60, dt, 3);
      this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z);
      this.mesh.quaternion.set(this.body.quaternion.x, this.body.quaternion.y, this.body.quaternion.z, this.body.quaternion.w);
      const speed = this.body.velocity.length() + this.body.angularVelocity.length() * 0.18;
      if (speed < 0.2) this.settleFor += dt;
      else this.settleFor = 0;
      if (this.settleFor > 0.18 || time - this.rollStarted > 2600) this.finish(topFace(this.mesh.quaternion));
    }
    this.renderer.render(this.scene, this.camera);
    if (this.current) this.frame = requestAnimationFrame((next) => this.render(next));
  }

  private finish(raw: number): void {
    if (!this.current) return;
    const value = validFace(raw) ? raw : 1;
    const result: DieRoll = { value, dragX: this.dragX, dragY: this.dragY };
    const resolve = this.resolveCurrent;
    this.current = null;
    this.resolveCurrent = null;
    this.body.sleep();
    resolve?.(result);
    this.onResult?.(result);
  }
}

/** Cria uma textura pequena com os pontos pretos do valor da face. */
function pipMaterial(value: number): MeshStandardMaterial {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return new MeshStandardMaterial({ color: '#ffffff', roughness: 0.52, metalness: 0.02 });
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new MeshStandardMaterial({ color: '#ffffff', roughness: 0.52, metalness: 0.02 });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#eef0f4';
  ctx.lineWidth = 7;
  ctx.strokeRect(4, 4, 120, 120);
  const pips: Record<number, [number, number][]> = {
    1: [[64, 64]],
    2: [[34, 34], [94, 94]],
    3: [[34, 34], [64, 64], [94, 94]],
    4: [[34, 34], [94, 34], [34, 94], [94, 94]],
    5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]],
    6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]],
  };
  ctx.fillStyle = '#1f2430';
  for (const [x, y] of pips[value] ?? pips[1]) {
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture: Texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return new MeshStandardMaterial({ map: texture, roughness: 0.52, metalness: 0.02 });
}

/** Testa o suporte básico a WebGL sem criar uma cena persistente. */
export function canUseWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2') || !!canvas.getContext('webgl');
  } catch {
    return false;
  }
}
