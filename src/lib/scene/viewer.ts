import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { AvatarRig } from "@/lib/avatar/rig";
import { PoseSolver, type SolverSettings } from "@/lib/avatar/solver";
import {
  IdleBlinker,
  NEUTRAL_FACE,
  driveFromBlendshapes,
  type FaceDrive,
} from "@/lib/avatar/expressions";
import { damp } from "@/lib/tracking/smoothing";
import type { TrackFrame } from "@/lib/types";

export type BackgroundKind = "gradient" | "studio" | "chroma" | "transparent";
export type CameraPreset = "full" | "upper" | "face";

const PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: number }> =
  {
    full: { pos: [0, 0.62, 3.15], target: 0.55 },
    upper: { pos: [0, 0.85, 1.75], target: 0.8 },
    face: { pos: [0, 0.94, 0.95], target: 0.92 },
  };

function gradientTexture(top: string, bottom: string) {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class AvatarViewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private rig: AvatarRig | null = null;
  private solver: PoseSolver | null = null;
  private frame: TrackFrame | null = null;
  private blinker = new IdleBlinker();
  private face: FaceDrive = structuredClone(NEUTRAL_FACE);
  private smoothedFace = structuredClone(NEUTRAL_FACE);
  private ground: THREE.Mesh;
  private backdrop: THREE.Texture | null = null;
  private background: BackgroundKind = "gradient";
  private chroma = "#00b140";
  private preset: CameraPreset = "full";

  expressionGain = 1.15;
  idleBlink = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
    this.camera.position.set(0, 1.05, 3.15);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 8;
    this.controls.target.set(0, 0.95, 0);

    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2b2f45, 1.5);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(1.6, 3.1, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.top = 2.4;
    key.shadow.camera.bottom = -0.4;
    key.shadow.camera.left = -1.6;
    key.shadow.camera.right = 1.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 9;
    key.shadow.bias = -0.0015;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8ea4ff, 1.1);
    rim.position.set(-2.2, 1.8, -2.4);
    this.scene.add(rim);

    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.setBackground("gradient");
  }

  setRig(rig: AvatarRig | null) {
    if (this.rig) {
      this.scene.remove(this.rig.root);
      this.rig.dispose();
    }
    this.rig = rig;
    this.solver = null;
    if (rig) {
      this.scene.add(rig.root);
      this.solver = new PoseSolver(rig);
      this.applyPreset(this.preset, true);
    }
  }

  get currentRig() {
    return this.rig;
  }

  setSolverSettings(next: Partial<SolverSettings>) {
    if (this.solver) Object.assign(this.solver.settings, next);
  }

  pushFrame(frame: TrackFrame) {
    this.frame = frame;
  }

  setBackground(kind: BackgroundKind, chroma?: string) {
    this.background = kind;
    if (chroma) this.chroma = chroma;
    this.backdrop?.dispose();
    this.backdrop = null;

    if (kind === "transparent") {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
      this.ground.visible = false;
      return;
    }
    this.ground.visible = true;
    if (kind === "chroma") {
      this.scene.background = new THREE.Color(this.chroma);
      return;
    }
    this.backdrop =
      kind === "studio"
        ? gradientTexture("#f4f6ff", "#c3c9e4")
        : gradientTexture("#2b2f57", "#0b0d1c");
    this.scene.background = this.backdrop;
  }

  applyPreset(preset: CameraPreset, immediate = false) {
    this.preset = preset;
    const rig = this.rig;
    const h = rig ? rig.metrics.height : 1.7;
    const p = PRESETS[preset];
    const target = new THREE.Vector3(0, h * p.target + (preset === "face" ? 0.02 : 0), 0);
    const pos = new THREE.Vector3(p.pos[0], h * (p.pos[1] / 1.7) + target.y * 0.35, p.pos[2] * (h / 1.7));
    if (immediate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
    } else {
      this.pendingCamera = { pos, target };
    }
  }

  private pendingCamera: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

  resize(width: number, height: number) {
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  start() {
    if (this.raf) return;
    this.clock.start();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.render();
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private render() {
    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.pendingCamera) {
      const a = damp(0.35, dt);
      this.camera.position.lerp(this.pendingCamera.pos, a);
      this.controls.target.lerp(this.pendingCamera.target, a);
      if (this.camera.position.distanceTo(this.pendingCamera.pos) < 0.004) {
        this.pendingCamera = null;
      }
    }

    if (this.rig && this.solver && this.frame) {
      this.solver.apply(this.frame, dt);
      this.applyFace(dt);
    }
    this.rig?.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private applyFace(dt: number) {
    const rig = this.rig;
    const frame = this.frame;
    if (!rig || !frame) return;

    this.face = frame.hasFace
      ? driveFromBlendshapes(frame.blendshapes, this.expressionGain)
      : structuredClone(NEUTRAL_FACE);

    const a = damp(0.25, dt);
    const target = this.face.expressions;
    const cur = this.smoothedFace.expressions;
    for (const key of Object.keys(target) as (keyof typeof target)[]) {
      cur[key] += (target[key] - cur[key]) * a;
    }
    this.smoothedFace.gaze.yaw +=
      (this.face.gaze.yaw - this.smoothedFace.gaze.yaw) * a;
    this.smoothedFace.gaze.pitch +=
      (this.face.gaze.pitch - this.smoothedFace.gaze.pitch) * a;

    const idle = this.idleBlink && !frame.hasFace ? this.blinker.update(dt) : 0;

    for (const key of Object.keys(cur) as (keyof typeof cur)[]) {
      let v = cur[key];
      if (idle > 0 && (key === "blinkLeft" || key === "blinkRight")) {
        v = Math.max(v, idle);
      }
      rig.setExpression(key, v);
    }
    rig.setGaze(this.smoothedFace.gaze.yaw, this.smoothedFace.gaze.pitch);
  }

  /** PNG data URL of the current frame. */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  captureStream(fps = 30): MediaStream {
    return this.renderer.domElement.captureStream(fps);
  }

  dispose() {
    this.stop();
    this.setRig(null);
    this.controls.dispose();
    this.backdrop?.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
