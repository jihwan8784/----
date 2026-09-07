"use client";

import type * as avatarRig__THREE from "three";
import * as motionSolver__THREE from "three";
import * as vrmLoader__THREE from "three";
import { GLTFLoader as vrmLoader__GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM as vrmLoader__VRM, VRMLoaderPlugin as vrmLoader__VRMLoaderPlugin, VRMUtils as vrmLoader__VRMUtils } from "@pixiv/three-vrm";
import { FaceLandmarker as trackingEngine__FaceLandmarker, FilesetResolver as trackingEngine__FilesetResolver, HandLandmarker as trackingEngine__HandLandmarker, PoseLandmarker as trackingEngine__PoseLandmarker, type NormalizedLandmark as trackingEngine__NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as sceneViewer__THREE from "three";
import { OrbitControls as sceneViewer__OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { create as settings__create } from "zustand";

// Consolidated Avatar Studio core. Keep domain sections separated by comments
// instead of splitting them back into nested TypeScript folders.

// -----------------------------------------------------------------------------
// types.ts
// -----------------------------------------------------------------------------
export type TrackMode = "full" | "face";
export type PoseQuality = "lite" | "full";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Joint names we solve against. Left/right are the *person's* left/right. */
export type JointName =
  | "nose"
  | "leftEye"
  | "rightEye"
  | "leftEar"
  | "rightEar"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftWrist"
  | "rightWrist"
  | "leftIndex"
  | "rightIndex"
  | "leftPinky"
  | "rightPinky"
  | "leftThumb"
  | "rightThumb"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftAnkle"
  | "rightAnkle"
  | "leftFootIndex"
  | "rightFootIndex";

export type Joints = Partial<Record<JointName, Vec3>>;

export interface Point2D {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/** One solved frame of tracking data, already converted into avatar space. */
export interface TrackFrame {
  ts: number;
  hasPose: boolean;
  hasFace: boolean;
  /** Joint positions in avatar space (metres, hip centre at origin, +y up, +z toward camera). */
  joints: Joints;
  /** Per-joint confidence, 0..1. */
  confidence: Partial<Record<JointName, number>>;
  /** Head orientation basis in avatar space, as a quaternion [x,y,z,w]. */
  headQuat: [number, number, number, number] | null;
  /** ARKit-style blendshape scores keyed by name. */
  blendshapes: Record<string, number>;
  /** Hand landmarks in avatar space, relative to each wrist. */
  hands: { left: Vec3[] | null; right: Vec3[] | null };
  /** Normalised body offset in view space, -1..1 horizontally / vertically. */
  rootOffset: Vec3;
  /** Raw normalised landmarks for the debug overlay. */
  overlay: {
    pose: Point2D[] | null;
    face: Point2D[] | null;
    hands: Point2D[][];
  };
}

export interface TrackerOptions {
  mode: TrackMode;
  quality: PoseQuality;
  hands: boolean;
  mirror: boolean;
  showOverlay: boolean;
}

export interface TrackerStats {
  fps: number;
  inferenceMs: number;
  delegate: "GPU" | "CPU";
}
// -----------------------------------------------------------------------------
// avatar-rig.ts
// -----------------------------------------------------------------------------
/** Subset of the VRM humanoid bone set that this rig drives. Names match VRM 1.0. */
export type BoneName =
  | "hips"
  | "spine"
  | "chest"
  | "upperChest"
  | "neck"
  | "head"
  | "leftShoulder"
  | "leftUpperArm"
  | "leftLowerArm"
  | "leftHand"
  | "rightShoulder"
  | "rightUpperArm"
  | "rightLowerArm"
  | "rightHand"
  | "leftUpperLeg"
  | "leftLowerLeg"
  | "leftFoot"
  | "leftToes"
  | "rightUpperLeg"
  | "rightLowerLeg"
  | "rightFoot"
  | "rightToes"
  | FingerBone;

export type Side = "left" | "right";
export type FingerName = "thumb" | "index" | "middle" | "ring" | "little";
export type FingerBone = `${Side}${Capitalize<FingerName>}${
  | "Metacarpal"
  | "Proximal"
  | "Intermediate"
  | "Distal"}`;

export const FINGER_NAMES: FingerName[] = [
  "thumb",
  "index",
  "middle",
  "ring",
  "little",
];

export function fingerBone(
  side: Side,
  finger: FingerName,
  segment: "Metacarpal" | "Proximal" | "Intermediate" | "Distal",
): FingerBone {
  const f = (finger[0].toUpperCase() + finger.slice(1)) as Capitalize<FingerName>;
  return `${side}${f}${segment}` as FingerBone;
}

/** VRM expression presets we drive from face blendshapes. */
export type ExpressionName =
  | "aa"
  | "ih"
  | "ou"
  | "ee"
  | "oh"
  | "blinkLeft"
  | "blinkRight"
  | "happy"
  | "angry"
  | "sad"
  | "surprised"
  | "relaxed";

export interface RigMetrics {
  /** Standing height of the avatar in scene units. */
  height: number;
  /** Head bone height above the floor, for camera framing. */
  headY: number;
  /** Hip bone height above the floor. */
  hipY: number;
}

export interface AvatarAppearance {
  skin: string;
  hair: string;
  outfit: string;
  accent: string;
}

export interface AvatarRig {
  /** Object to add to the scene. Its position is the avatar's floor anchor. */
  root: avatarRig__THREE.Object3D;
  name: string;
  metrics: RigMetrics;
  getBone(name: BoneName): avatarRig__THREE.Object3D | null;
  /** Reset every bone to the rest pose. */
  resetPose(): void;
  setExpression(name: ExpressionName, weight: number): void;
  /** Eye gaze in normalised units, -1..1. */
  setGaze(yaw: number, pitch: number): void;
  /** Recolour the simple built-in mannequin. */
  setPalette?(body: string, accent: string, skin: string): void;
  /** Recolour semantic VRM material groups without changing the .vrm rig. */
  setAppearance?(appearance: AvatarAppearance): void;
  update(delta: number): void;
  dispose(): void;
}

/** Bone -> the child bone that defines its rest direction. */
export const REST_CHILD: Partial<Record<BoneName, BoneName[]>> = {
  hips: ["spine"],
  spine: ["chest", "upperChest", "neck"],
  chest: ["upperChest", "neck"],
  upperChest: ["neck"],
  neck: ["head"],
  leftShoulder: ["leftUpperArm"],
  leftUpperArm: ["leftLowerArm"],
  leftLowerArm: ["leftHand"],
  leftHand: ["leftMiddleProximal", "leftIndexProximal"],
  rightShoulder: ["rightUpperArm"],
  rightUpperArm: ["rightLowerArm"],
  rightLowerArm: ["rightHand"],
  rightHand: ["rightMiddleProximal", "rightIndexProximal"],
  leftUpperLeg: ["leftLowerLeg"],
  leftLowerLeg: ["leftFoot"],
  leftFoot: ["leftToes"],
  rightUpperLeg: ["rightLowerLeg"],
  rightLowerLeg: ["rightFoot"],
  rightFoot: ["rightToes"],
};

for (const side of ["left", "right"] as Side[]) {
  for (const finger of FINGER_NAMES) {
    if (finger === "thumb") {
      REST_CHILD[fingerBone(side, finger, "Metacarpal")] = [
        fingerBone(side, finger, "Proximal"),
      ];
      REST_CHILD[fingerBone(side, finger, "Proximal")] = [
        fingerBone(side, finger, "Distal"),
      ];
    } else {
      REST_CHILD[fingerBone(side, finger, "Proximal")] = [
        fingerBone(side, finger, "Intermediate"),
      ];
      REST_CHILD[fingerBone(side, finger, "Intermediate")] = [
        fingerBone(side, finger, "Distal"),
      ];
    }
  }
}

/** Nearest rig-bone ancestor of each bone, used to convert world -> local. */
export const BONE_PARENT: Partial<Record<BoneName, BoneName>> = {
  spine: "hips",
  chest: "spine",
  upperChest: "chest",
  neck: "upperChest",
  head: "neck",
  leftShoulder: "upperChest",
  leftUpperArm: "leftShoulder",
  leftLowerArm: "leftUpperArm",
  leftHand: "leftLowerArm",
  rightShoulder: "upperChest",
  rightUpperArm: "rightShoulder",
  rightLowerArm: "rightUpperArm",
  rightHand: "rightLowerArm",
  leftUpperLeg: "hips",
  leftLowerLeg: "leftUpperLeg",
  leftFoot: "leftLowerLeg",
  leftToes: "leftFoot",
  rightUpperLeg: "hips",
  rightLowerLeg: "rightUpperLeg",
  rightFoot: "rightLowerLeg",
  rightToes: "rightFoot",
};

for (const side of ["left", "right"] as Side[]) {
  const hand: BoneName = side === "left" ? "leftHand" : "rightHand";
  for (const finger of FINGER_NAMES) {
    if (finger === "thumb") {
      BONE_PARENT[fingerBone(side, finger, "Metacarpal")] = hand;
      BONE_PARENT[fingerBone(side, finger, "Proximal")] = fingerBone(
        side,
        finger,
        "Metacarpal",
      );
      BONE_PARENT[fingerBone(side, finger, "Distal")] = fingerBone(
        side,
        finger,
        "Proximal",
      );
    } else {
      BONE_PARENT[fingerBone(side, finger, "Proximal")] = hand;
      BONE_PARENT[fingerBone(side, finger, "Intermediate")] = fingerBone(
        side,
        finger,
        "Proximal",
      );
      BONE_PARENT[fingerBone(side, finger, "Distal")] = fingerBone(
        side,
        finger,
        "Intermediate",
      );
    }
  }
}

/** Top-down evaluation order — parents must be solved before their children. */
export const SOLVE_ORDER: BoneName[] = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
  ...(["left", "right"] as Side[]).flatMap((side) =>
    FINGER_NAMES.flatMap((finger) =>
      finger === "thumb"
        ? [
            fingerBone(side, finger, "Metacarpal"),
            fingerBone(side, finger, "Proximal"),
            fingerBone(side, finger, "Distal"),
          ]
        : [
            fingerBone(side, finger, "Proximal"),
            fingerBone(side, finger, "Intermediate"),
            fingerBone(side, finger, "Distal"),
          ],
    ),
  ),
];
// -----------------------------------------------------------------------------
// tracking-smoothing.ts
// -----------------------------------------------------------------------------
/**
 * 1€ filter — low latency when the signal moves fast, heavy smoothing when it
 * is nearly still. Exactly what landmark jitter needs.
 */
class trackingSmoothing__OneEuroScalar {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff: number,
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tSeconds: number): number {
    if (this.xPrev === null || !Number.isFinite(x)) {
      this.xPrev = x;
      this.tPrev = tSeconds;
      return x;
    }
    const dt = Math.max(1e-3, tSeconds - this.tPrev);
    this.tPrev = tSeconds;

    const dx = (x - this.xPrev) / dt;
    const aD = trackingSmoothing__OneEuroScalar.alpha(this.dCutoff, dt);
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = trackingSmoothing__OneEuroScalar.alpha(cutoff, dt);
    const out = a * x + (1 - a) * this.xPrev;
    this.xPrev = out;
    return out;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
  }
}

export class OneEuroVec3 {
  private fx: trackingSmoothing__OneEuroScalar;
  private fy: trackingSmoothing__OneEuroScalar;
  private fz: trackingSmoothing__OneEuroScalar;

  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1) {
    this.fx = new trackingSmoothing__OneEuroScalar(minCutoff, beta, dCutoff);
    this.fy = new trackingSmoothing__OneEuroScalar(minCutoff, beta, dCutoff);
    this.fz = new trackingSmoothing__OneEuroScalar(minCutoff, beta, dCutoff);
  }

  filter(v: Vec3, t: number): Vec3 {
    return {
      x: this.fx.filter(v.x, t),
      y: this.fy.filter(v.y, t),
      z: this.fz.filter(v.z, t),
    };
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}

/** Keyed bank of 1€ filters, created lazily per landmark. */
export class VectorSmoother {
  private banks = new Map<string, OneEuroVec3>();

  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
  ) {}

  filter(key: string, v: Vec3, t: number): Vec3 {
    let f = this.banks.get(key);
    if (!f) {
      f = new OneEuroVec3(this.minCutoff, this.beta);
      this.banks.set(key, f);
    }
    return f.filter(v, t);
  }

  /** Higher = snappier / less smoothing. Rebuilds the bank. */
  setStrength(smoothing: number) {
    // smoothing 0 (raw) .. 1 (very smooth)
    this.minCutoff = 8 - 7.4 * smoothing;
    this.beta = 0.02 + 0.28 * (1 - smoothing);
    this.banks.clear();
  }

  reset() {
    this.banks.clear();
  }
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(smoothing: number, dt: number) {
  const halfLife = 0.008 + smoothing * 0.12;
  return 1 - Math.pow(2, -dt / halfLife);
}
// -----------------------------------------------------------------------------
// tracking-landmarks.ts
// -----------------------------------------------------------------------------
/** MediaPipe BlazePose landmark index -> joint name. Unlisted indices are ignored. */
export const POSE_INDEX_TO_JOINT: Record<number, JointName> = {
  0: "nose",
  2: "leftEye",
  5: "rightEye",
  7: "leftEar",
  8: "rightEar",
  11: "leftShoulder",
  12: "rightShoulder",
  13: "leftElbow",
  14: "rightElbow",
  15: "leftWrist",
  16: "rightWrist",
  17: "leftPinky",
  18: "rightPinky",
  19: "leftIndex",
  20: "rightIndex",
  21: "leftThumb",
  22: "rightThumb",
  23: "leftHip",
  24: "rightHip",
  25: "leftKnee",
  26: "rightKnee",
  27: "leftAnkle",
  28: "rightAnkle",
  31: "leftFootIndex",
  32: "rightFootIndex",
};

/** Joints whose left/right meaning flips when the scene is mirrored. */
export const MIRROR_PAIRS: [JointName, JointName][] = [
  ["leftEye", "rightEye"],
  ["leftEar", "rightEar"],
  ["leftShoulder", "rightShoulder"],
  ["leftElbow", "rightElbow"],
  ["leftWrist", "rightWrist"],
  ["leftIndex", "rightIndex"],
  ["leftPinky", "rightPinky"],
  ["leftThumb", "rightThumb"],
  ["leftHip", "rightHip"],
  ["leftKnee", "rightKnee"],
  ["leftAnkle", "rightAnkle"],
  ["leftFootIndex", "rightFootIndex"],
];

/** Skeleton edges used by the debug overlay (BlazePose indices). */
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 31],
  [28, 32],
  [15, 19],
  [16, 20],
  [15, 17],
  [16, 18],
  [15, 21],
  [16, 22],
  [0, 2],
  [0, 5],
  [2, 7],
  [5, 8],
];

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

/** Face-mesh landmarks used to build a stable head basis. */
export const FACE = {
  noseTip: 1,
  forehead: 10,
  chin: 152,
  rightSide: 234,
  leftSide: 454,
  rightEyeOuter: 33,
  leftEyeOuter: 263,
} as const;

/** A sparse ring of face-oval points, enough to sketch the face in the overlay. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];
// -----------------------------------------------------------------------------
// tracking-overlay.ts
// -----------------------------------------------------------------------------
/**
 * Draws the detected skeleton over the camera preview. Coordinates are the raw
 * normalised landmarks, so the canvas must carry the same CSS mirror as the
 * <video> it sits on top of.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  frame: TrackFrame | null,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  if (!frame) return;

  const px = (x: number) => x * width;
  const py = (y: number) => y * height;
  const scale = Math.min(width, height) / 360;

  const pose = frame.overlay.pose;
  if (pose) {
    ctx.lineWidth = Math.max(1.5, 3 * scale);
    ctx.strokeStyle = "rgba(122, 162, 255, 0.9)";
    ctx.beginPath();
    for (const [a, b] of POSE_CONNECTIONS) {
      const p = pose[a];
      const q = pose[b];
      if (!p || !q || p.visibility < 0.35 || q.visibility < 0.35) continue;
      ctx.moveTo(px(p.x), py(p.y));
      ctx.lineTo(px(q.x), py(q.y));
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 214, 102, 0.95)";
    for (const p of pose) {
      if (p.visibility < 0.4) continue;
      ctx.beginPath();
      ctx.arc(px(p.x), py(p.y), Math.max(1.5, 3.2 * scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const face = frame.overlay.face;
  if (face) {
    ctx.strokeStyle = "rgba(120, 245, 210, 0.85)";
    ctx.lineWidth = Math.max(1, 1.8 * scale);
    ctx.beginPath();
    FACE_OVAL.forEach((idx, i) => {
      const p = face[idx];
      if (!p) return;
      if (i === 0) ctx.moveTo(px(p.x), py(p.y));
      else ctx.lineTo(px(p.x), py(p.y));
    });
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "rgba(120, 245, 210, 0.5)";
    for (let i = 0; i < face.length; i += 4) {
      const p = face[i];
      ctx.fillRect(px(p.x) - 0.5, py(p.y) - 0.5, 1.4, 1.4);
    }
  }

  for (const hand of frame.overlay.hands) {
    ctx.strokeStyle = "rgba(255, 138, 190, 0.9)";
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const p = hand[a];
      const q = hand[b];
      if (!p || !q) continue;
      ctx.moveTo(px(p.x), py(p.y));
      ctx.lineTo(px(q.x), py(q.y));
    }
    ctx.stroke();
  }
}
// -----------------------------------------------------------------------------
// face-expressions.ts
// -----------------------------------------------------------------------------
const faceExpressions__clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const faceExpressions__avg = (a: number, b: number) => (a + b) / 2;

export interface FaceDrive {
  expressions: Record<ExpressionName, number>;
  gaze: { yaw: number; pitch: number };
}

export const NEUTRAL_FACE: FaceDrive = {
  expressions: {
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
    blinkLeft: 0,
    blinkRight: 0,
    happy: 0,
    angry: 0,
    sad: 0,
    surprised: 0,
    relaxed: 0,
  },
  gaze: { yaw: 0, pitch: 0 },
};

/**
 * Turns MediaPipe's 52 ARKit-style blendshape scores into the handful of
 * VRM expression presets an avatar actually exposes.
 */
export function driveFromBlendshapes(
  b: Record<string, number>,
  gain = 1,
): FaceDrive {
  const g = (k: string) => b[k] ?? 0;

  const jaw = faceExpressions__clamp01((g("jawOpen") - g("mouthClose") * 0.5) * 1.3 * gain);
  const pucker = faceExpressions__clamp01(Math.max(g("mouthPucker"), g("mouthFunnel")) * gain);
  const smile = faceExpressions__clamp01(faceExpressions__avg(g("mouthSmileLeft"), g("mouthSmileRight")) * gain);
  const stretch = faceExpressions__clamp01(
    faceExpressions__avg(g("mouthStretchLeft"), g("mouthStretchRight")) * gain,
  );
  const frown = faceExpressions__clamp01(faceExpressions__avg(g("mouthFrownLeft"), g("mouthFrownRight")) * gain);
  const browDown = faceExpressions__clamp01(faceExpressions__avg(g("browDownLeft"), g("browDownRight")) * gain);
  const browUp = faceExpressions__clamp01(g("browInnerUp") * gain);
  const eyeWide = faceExpressions__clamp01(faceExpressions__avg(g("eyeWideLeft"), g("eyeWideRight")) * gain);

  // Visemes: split the open/rounded/wide mouth space between aa / ou / ih.
  const aa = faceExpressions__clamp01(jaw - pucker * 0.8);
  const ou = faceExpressions__clamp01(pucker - jaw * 0.35);
  const ih = faceExpressions__clamp01(Math.max(stretch, smile * 0.6) * (1 - jaw * 0.6));
  const oh = faceExpressions__clamp01(Math.min(jaw, pucker) * 1.4);

  const blinkLeft = faceExpressions__clamp01(
    g("eyeBlinkLeft") * 1.15 + g("eyeSquintLeft") * 0.25,
  );
  const blinkRight = faceExpressions__clamp01(
    g("eyeBlinkRight") * 1.15 + g("eyeSquintRight") * 0.25,
  );

  // Gaze: "out" on one eye pairs with "in" on the other.
  const lookLeft = faceExpressions__avg(g("eyeLookOutLeft"), g("eyeLookInRight"));
  const lookRight = faceExpressions__avg(g("eyeLookOutRight"), g("eyeLookInLeft"));
  const lookUp = faceExpressions__avg(g("eyeLookUpLeft"), g("eyeLookUpRight"));
  const lookDown = faceExpressions__avg(g("eyeLookDownLeft"), g("eyeLookDownRight"));

  return {
    expressions: {
      aa,
      ih,
      ou,
      ee: faceExpressions__clamp01(ih * 0.7),
      oh,
      blinkLeft,
      blinkRight,
      happy: faceExpressions__clamp01(smile * 1.1 - frown),
      sad: faceExpressions__clamp01(frown * 1.1 - smile),
      angry: faceExpressions__clamp01(browDown * 1.2 - browUp),
      surprised: faceExpressions__clamp01(Math.min(browUp, eyeWide + 0.35) * 1.3),
      relaxed: 0,
    },
    gaze: {
      yaw: faceExpressions__clamp01(lookLeft) - faceExpressions__clamp01(lookRight),
      pitch: faceExpressions__clamp01(lookUp) - faceExpressions__clamp01(lookDown),
    },
  };
}

/** Simple idle blink so a face-less frame still looks alive. */
export class IdleBlinker {
  private next = 2;
  private t = 0;
  private phase = -1;

  update(dt: number): number {
    this.t += dt;
    if (this.phase < 0 && this.t > this.next) {
      this.phase = 0;
      this.t = 0;
    }
    if (this.phase >= 0) {
      this.phase += dt / 0.11;
      if (this.phase >= 1) {
        this.phase = -1;
        this.t = 0;
        this.next = 1.6 + Math.random() * 3.4;
        return 0;
      }
      return Math.sin(this.phase * Math.PI);
    }
    return 0;
  }
}
// -----------------------------------------------------------------------------
// motion-solver.ts
// -----------------------------------------------------------------------------
/** Bones driven by a single joint-to-joint direction. */
const motionSolver__LIMB_CHAIN: Partial<Record<BoneName, [JointName, JointName]>> = {
  leftUpperArm: ["leftShoulder", "leftElbow"],
  leftLowerArm: ["leftElbow", "leftWrist"],
  rightUpperArm: ["rightShoulder", "rightElbow"],
  rightLowerArm: ["rightElbow", "rightWrist"],
  leftUpperLeg: ["leftHip", "leftKnee"],
  leftLowerLeg: ["leftKnee", "leftAnkle"],
  leftFoot: ["leftAnkle", "leftFootIndex"],
  rightUpperLeg: ["rightHip", "rightKnee"],
  rightLowerLeg: ["rightKnee", "rightAnkle"],
  rightFoot: ["rightAnkle", "rightFootIndex"],
};

const motionSolver__ATTENTION_DIRECTIONS: Partial<Record<BoneName, [number, number, number]>> = {
  leftUpperArm: [0.12, -0.99, 0],
  leftLowerArm: [0.04, -1, 0],
  leftHand: [0.02, -1, 0],
  rightUpperArm: [-0.12, -0.99, 0],
  rightLowerArm: [-0.04, -1, 0],
  rightHand: [-0.02, -1, 0],
};

/** Hand landmark indices per finger, from knuckle outward. */
const motionSolver__FINGER_LANDMARKS: Record<string, number[]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  little: [17, 18, 19, 20],
};

const motionSolver__V = (v: Vec3) => new motionSolver__THREE.Vector3(v.x, v.y, v.z);

export interface SolverSettings {
  smoothing: number;
  /** 0 = avatar stays centred, 1 = follows the body around the frame. */
  followBody: number;
  bodyEnabled: boolean;
  headEnabled: boolean;
  fingersEnabled: boolean;
  /** Extra head rotation gain, so small head turns read clearly. */
  headGain: number;
}

export const DEFAULT_SOLVER_SETTINGS: SolverSettings = {
  smoothing: 0.45,
  followBody: 0.5,
  bodyEnabled: true,
  headEnabled: true,
  fingersEnabled: true,
  headGain: 1.1,
};

/**
 * Maps tracked landmarks onto a humanoid rig.
 *
 * Every bone is solved in world space first (rest direction rotated onto the
 * tracked direction), smoothed there, then converted back to a local rotation
 * using the already-smoothed parent. Solving in world space keeps the result
 * independent of how the source model nests its bones.
 */
export class PoseSolver {
  private bones = new Map<BoneName, motionSolver__THREE.Object3D>();
  private restLocal = new Map<BoneName, motionSolver__THREE.Quaternion>();
  private restWorld = new Map<BoneName, motionSolver__THREE.Quaternion>();
  private restDir = new Map<BoneName, motionSolver__THREE.Vector3>();
  private world = new Map<BoneName, motionSolver__THREE.Quaternion>();
  private rootRestY = 0;

  settings: SolverSettings = { ...DEFAULT_SOLVER_SETTINGS };

  constructor(private rig: AvatarRig) {
    this.bind();
    this.applyAttentionArms(1);
  }

  private bind() {
    this.rig.resetPose();
    this.rig.root.updateWorldMatrix(true, true);
    this.rootRestY = this.rig.root.position.y;

    const worldPos = new motionSolver__THREE.Vector3();
    const worldQuat = new motionSolver__THREE.Quaternion();

    for (const name of SOLVE_ORDER) {
      const bone = this.rig.getBone(name);
      if (!bone) continue;
      this.bones.set(name, bone);
      this.restLocal.set(name, bone.quaternion.clone());
      bone.getWorldQuaternion(worldQuat);
      this.restWorld.set(name, worldQuat.clone());
      this.world.set(name, worldQuat.clone());
      bone.getWorldPosition(worldPos);

      const childPos = this.restChildPosition(name);
      const dir = childPos
        ? childPos.clone().sub(worldPos)
        : this.fallbackDirection(name);
      if (dir.lengthSq() < 1e-10) dir.set(0, 1, 0);
      this.restDir.set(name, dir.normalize());
    }
  }

  private restChildPosition(name: BoneName): motionSolver__THREE.Vector3 | null {
    const candidates = REST_CHILD[name];
    const p = new motionSolver__THREE.Vector3();
    if (candidates) {
      for (const c of candidates) {
        const child = this.rig.getBone(c);
        if (child) return child.getWorldPosition(p).clone();
      }
    }
    const bone = this.rig.getBone(name);
    if (!bone || bone.children.length === 0) return null;
    const acc = new motionSolver__THREE.Vector3();
    let n = 0;
    for (const child of bone.children) {
      child.getWorldPosition(p);
      acc.add(p);
      n++;
    }
    return n ? acc.divideScalar(n) : null;
  }

  /** Used for leaf bones (fingertip segments, toes) with no child to aim at. */
  private fallbackDirection(name: BoneName): motionSolver__THREE.Vector3 {
    const parent = BONE_PARENT[name];
    const bone = this.rig.getBone(name);
    const parentBone = parent ? this.rig.getBone(parent) : null;
    if (bone && parentBone) {
      const a = parentBone.getWorldPosition(new motionSolver__THREE.Vector3());
      const b = bone.getWorldPosition(new motionSolver__THREE.Vector3());
      const d = b.sub(a);
      if (d.lengthSq() > 1e-10) return d;
    }
    return new motionSolver__THREE.Vector3(0, 1, 0);
  }

  reset() {
    this.rig.resetPose();
    for (const [name, q] of this.restWorld) this.world.set(name, q.clone());
  }

  /** Applies one tracked frame. `dt` is the render delta in seconds. */
  apply(frame: TrackFrame, dt: number) {
    const alpha = damp(this.settings.smoothing, Math.min(dt, 0.1));
    const j = frame.joints;
    const usable = this.settings.bodyEnabled && frame.hasPose;

    const torso = usable ? this.torsoBases(j) : null;
    const headBasis =
      this.settings.headEnabled && frame.headQuat
        ? new motionSolver__THREE.Quaternion(...frame.headQuat)
        : null;

    // --- torso -------------------------------------------------------------
    const identity = new motionSolver__THREE.Quaternion();
    const chainTop: BoneName[] = ["spine", "chest", "upperChest"];
    if (torso) {
      this.setCharacterBasis("hips", torso.hips, alpha);
      const present = chainTop.filter((b) => this.bones.has(b));
      present.forEach((bone, i) => {
        const t = (i + 1) / (present.length + 1);
        this.setCharacterBasis(bone, torso.hips.clone().slerp(torso.chest, t), alpha);
      });
    } else {
      this.relax("hips", alpha);
      for (const b of chainTop) this.relax(b, alpha);
    }

    // --- neck & head -------------------------------------------------------
    const chestBasis = torso ? torso.chest : identity;
    if (headBasis) {
      // Amplify only the head's rotation relative to the chest, so a small
      // real-world head turn reads clearly on the avatar.
      const relative = chestBasis.clone().invert().multiply(headBasis);
      const amplified = new motionSolver__THREE.Quaternion().slerp(
        relative,
        this.settings.headGain,
      );
      const headTarget = chestBasis.clone().multiply(amplified);
      if (this.bones.has("neck")) {
        this.setCharacterBasis(
          "neck",
          chestBasis.clone().slerp(headTarget, 0.4),
          alpha,
        );
      }
      this.setCharacterBasis("head", headTarget, alpha);
    } else {
      this.relax("neck", alpha);
      this.relax("head", alpha);
    }

    // --- shoulders ---------------------------------------------------------
    for (const side of ["left", "right"] as Side[]) {
      const bone: BoneName = side === "left" ? "leftShoulder" : "rightShoulder";
      if (!this.bones.has(bone)) continue;
      // Shoulders only hint at the chest rotation; the arms carry the motion.
      this.setCharacterBasis(
        bone,
        new motionSolver__THREE.Quaternion().slerp(chestBasis, 0.25),
        alpha,
      );
    }

    // --- limbs -------------------------------------------------------------
    for (const [boneName, pair] of Object.entries(motionSolver__LIMB_CHAIN) as [
      BoneName,
      [JointName, JointName],
    ][]) {
      const bone = this.bones.get(boneName);
      if (!bone) continue;
      const a = usable ? j[pair[0]] : undefined;
      const b = usable ? j[pair[1]] : undefined;
      const conf = Math.min(
        frame.confidence[pair[0]] ?? 0,
        frame.confidence[pair[1]] ?? 0,
      );
      if (!a || !b || conf < 0.4) {
        const attention = motionSolver__ATTENTION_DIRECTIONS[boneName];
        if (attention) this.aimBone(boneName, new motionSolver__THREE.Vector3(...attention), alpha);
        else this.relax(boneName, alpha, 0.35);
        continue;
      }
      const dir = motionSolver__V(b).sub(motionSolver__V(a));
      if (dir.lengthSq() < 1e-8) continue;
      this.aimBone(boneName, dir.normalize(), alpha);
    }

    // --- hands & fingers ---------------------------------------------------
    for (const side of ["left", "right"] as Side[]) {
      const handBone: BoneName = side === "left" ? "leftHand" : "rightHand";
      const landmarks = frame.hands[side];
      if (this.settings.fingersEnabled && landmarks && landmarks.length >= 21) {
        this.solveHand(side, landmarks, alpha);
      } else {
        // No trustworthy finger data: return the wrist and fingers to the
        // avatar's authored neutral pose. PoseLandmark's index-finger points
        // are too noisy to use as a substitute hand orientation.
        this.relaxLocal(handBone, alpha, 0.55);
        this.relaxFingers(side, alpha);
      }
    }

    this.applyRootMotion(frame, alpha);
  }

  private applyAttentionArms(alpha: number) {
    for (const name of [
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      "rightUpperArm",
      "rightLowerArm",
      "rightHand",
    ] as BoneName[]) {
      const direction = motionSolver__ATTENTION_DIRECTIONS[name];
      if (direction) this.aimBone(name, new motionSolver__THREE.Vector3(...direction), alpha);
    }
  }

  /** Hip and chest orientation, as world-space basis quaternions. */
  private torsoBases(j: TrackFrame["joints"]) {
    const lh = j.leftHip;
    const rh = j.rightHip;
    const ls = j.leftShoulder;
    const rs = j.rightShoulder;
    if (!lh || !rh || !ls || !rs) return null;

    const hipMid = motionSolver__V(lh).add(motionSolver__V(rh)).multiplyScalar(0.5);
    const shoulderMid = motionSolver__V(ls).add(motionSolver__V(rs)).multiplyScalar(0.5);
    const up = shoulderMid.clone().sub(hipMid);
    if (up.lengthSq() < 1e-8) return null;
    up.normalize();

    const hips = motionSolver__basisQuat(motionSolver__V(lh).sub(motionSolver__V(rh)).normalize(), up);
    const chest = motionSolver__basisQuat(motionSolver__V(ls).sub(motionSolver__V(rs)).normalize(), up);
    if (!hips || !chest) return null;
    return { hips, chest };
  }

  private solveHand(side: Side, lm: Vec3[], alpha: number) {
    const handBone: BoneName = side === "left" ? "leftHand" : "rightHand";
    const wrist = motionSolver__V(lm[0]);
    const middle = motionSolver__V(lm[9]);

    const axis = middle.clone().sub(wrist);
    if (axis.lengthSq() < 1e-8) return;
    axis.normalize();

    // Aim the wrist along the palm axis. A full palm-normal basis can flip by
    // 180 degrees when MediaPipe briefly swaps or jitters knuckles; keeping
    // wrist roll authored makes webcam tracking much more stable.
    this.aimBone(handBone, axis, alpha);

    for (const finger of FINGER_NAMES) {
      const idx = motionSolver__FINGER_LANDMARKS[finger];
      const segments =
        finger === "thumb"
          ? (["Metacarpal", "Proximal", "Distal"] as const)
          : (["Proximal", "Intermediate", "Distal"] as const);
      for (let s = 0; s < segments.length; s++) {
        const bone = fingerBone(side, finger, segments[s]);
        if (!this.bones.has(bone)) continue;
        const dir = motionSolver__V(lm[idx[s + 1]]).sub(motionSolver__V(lm[idx[s]]));
        if (dir.lengthSq() < 1e-10) continue;
        this.aimBone(bone, dir.normalize(), alpha);
      }
    }
  }

  private relaxFingers(side: Side, alpha: number) {
    for (const finger of FINGER_NAMES) {
      const segments =
        finger === "thumb"
          ? (["Metacarpal", "Proximal", "Distal"] as const)
          : (["Proximal", "Intermediate", "Distal"] as const);
      for (const s of segments) {
        const bone = fingerBone(side, finger, s);
        if (!this.bones.has(bone)) continue;
        this.relaxLocal(bone, alpha, 0.55);
      }
    }
  }

  /** Rotates a bone so its rest direction points along `dir` (world space). */
  private aimBone(name: BoneName, dir: motionSolver__THREE.Vector3, alpha: number) {
    const rest = this.restDir.get(name);
    const restWorld = this.restWorld.get(name);
    if (!rest || !restWorld) return;
    const delta = new motionSolver__THREE.Quaternion().setFromUnitVectors(rest, dir);
    this.setWorldBasisRaw(name, delta.multiply(restWorld), alpha);
  }

  /**
   * `basis` is where the *character* axes (x = avatar-left, y = up, z = front)
   * should end up. The authored rest rotation is composed back in, so a rig
   * whose bones do not sit at identity — a rotated VRM 0.x scene, an A-pose
   * model — lands in the same place as a canonical one.
   */
  private setCharacterBasis(
    name: BoneName,
    basis: motionSolver__THREE.Quaternion,
    alpha: number,
  ) {
    const restWorld = this.restWorld.get(name);
    if (!this.bones.has(name) || !restWorld) return;
    this.setWorldBasisRaw(name, basis.clone().multiply(restWorld), alpha);
  }

  /** Eases a bone back to its authored world-space rest rotation. */
  private relax(name: BoneName, alpha: number, rate = 1) {
    const restWorld = this.restWorld.get(name);
    if (!this.bones.has(name) || !restWorld) return;
    this.setWorldBasisRaw(name, restWorld.clone(), alpha * rate);
  }

  /**
   * Eases a bone toward its authored LOCAL rotation relative to its current
   * parent. Hands and fingers need this when the tracked arm is moving: using
   * the original world-space rest would counter-rotate the wrist against the
   * forearm and produce the sideways/upside-down hand seen when no hand is
   * actually detected.
   */
  private relaxLocal(name: BoneName, alpha: number, rate = 1) {
    const bone = this.bones.get(name);
    const restLocal = this.restLocal.get(name);
    if (!bone || !restLocal) return;

    const amount = Math.min(1, alpha * rate);
    let target = restLocal.clone();
    if (bone.quaternion.dot(target) < 0) {
      target = target.set(-target.x, -target.y, -target.z, -target.w);
    }
    bone.quaternion.slerp(target, amount);

    const parentName = BONE_PARENT[name];
    const parentWorld = parentName
      ? this.worldOf(parentName)
      : this.rig.root.getWorldQuaternion(new motionSolver__THREE.Quaternion());
    this.world.set(name, parentWorld.clone().multiply(bone.quaternion));
  }

  private setWorldBasisRaw(
    name: BoneName,
    target: motionSolver__THREE.Quaternion,
    alpha: number,
  ) {
    const bone = this.bones.get(name);
    if (!bone) return;
    const current = this.world.get(name)!;
    if (current.dot(target) < 0) target.set(-target.x, -target.y, -target.z, -target.w);
    current.slerp(target, alpha);

    const parentName = BONE_PARENT[name];
    const parentWorld = parentName
      ? this.worldOf(parentName)
      : this.rig.root.getWorldQuaternion(new motionSolver__THREE.Quaternion());
    bone.quaternion.copy(parentWorld.clone().invert().multiply(current));
  }

  private worldOf(name: BoneName | undefined): motionSolver__THREE.Quaternion {
    if (!name) return new motionSolver__THREE.Quaternion();
    const w = this.world.get(name);
    if (w) return w;
    const parent = BONE_PARENT[name];
    return parent ? this.worldOf(parent) : new motionSolver__THREE.Quaternion();
  }

  private applyRootMotion(frame: TrackFrame, alpha: number) {
    const follow = this.settings.followBody;
    const root = this.rig.root;
    if (follow <= 0.001 || (!frame.hasPose && !frame.hasFace)) {
      root.position.x += (0 - root.position.x) * alpha;
      root.position.y += (this.rootRestY - root.position.y) * alpha;
      root.position.z += (0 - root.position.z) * alpha;
      return;
    }
    const scale = this.rig.metrics.height * 0.35 * follow;
    const tx = frame.rootOffset.x * scale;
    const ty = this.rootRestY + frame.rootOffset.y * scale * 0.6;
    const tz = -frame.rootOffset.z * scale * 0.8;
    root.position.x += (tx - root.position.x) * alpha;
    root.position.y += (ty - root.position.y) * alpha;
    root.position.z += (tz - root.position.z) * alpha;
  }
}

/**
 * Builds a character basis from a left-pointing axis and an up hint.
 * Convention: +x = avatar's left, +y = up, +z = forward (out of the screen).
 */
function motionSolver__basisQuat(
  leftAxis: motionSolver__THREE.Vector3,
  upHint: motionSolver__THREE.Vector3,
): motionSolver__THREE.Quaternion | null {
  const x = leftAxis.clone();
  if (x.lengthSq() < 1e-8) return null;
  x.normalize();
  const z = new motionSolver__THREE.Vector3().crossVectors(x, upHint);
  if (z.lengthSq() < 1e-8) return null;
  z.normalize();
  const y = new motionSolver__THREE.Vector3().crossVectors(z, x).normalize();
  x.crossVectors(y, z).normalize();
  return new motionSolver__THREE.Quaternion().setFromRotationMatrix(
    new motionSolver__THREE.Matrix4().makeBasis(x, y, z),
  );
}
// -----------------------------------------------------------------------------
// vrm-loader.ts
// -----------------------------------------------------------------------------
const vrmLoader__DEG = 180 / Math.PI;

/** Expression fallbacks for models that only ship the merged presets. */
const vrmLoader__EXPRESSION_FALLBACK: Partial<Record<ExpressionName, string>> = {
  blinkLeft: "blink",
  blinkRight: "blink",
  ee: "ih",
  oh: "aa",
};

type vrmLoader__AppearanceSlot = keyof AvatarAppearance;

const vrmLoader__APPEARANCE_PATTERNS: [vrmLoader__AppearanceSlot, RegExp][] = [
  ["hair", /hair|bang|ponytail|髪|眉|まつげ|eyebrow|eyelash/i],
  ["skin", /face|skin|arm|leg|hand|肌|顔/i],
  ["accent", /shoe|sneaker|sock|tie|ribbon|button|accessory|metal|trim|靴|リボン/i],
  ["outfit", /cloth|outfit|wear|shirt|tee|tshirt|hoodie|sweater|scrub|suit|top|bottom|pants|jeans|skirt|dress|coat|jacket|uniform|服|トップス|ボトム/i],
];

function vrmLoader__appearanceSlot(objectName: string, materialName: string): vrmLoader__AppearanceSlot | null {
  const source = `${objectName} ${materialName}`;
  return vrmLoader__APPEARANCE_PATTERNS.find(([, pattern]) => pattern.test(source))?.[0] ?? null;
}

export async function loadVRMRig(
  url: string,
  displayName: string,
  onProgress?: (ratio: number) => void,
): Promise<AvatarRig> {
  const loader = new vrmLoader__GLTFLoader();
  loader.register((parser) => new vrmLoader__VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync(url, (e) => {
    if (e.total > 0) onProgress?.(e.loaded / e.total);
  });

  const vrm = gltf.userData.vrm as vrmLoader__VRM | undefined;
  if (!vrm) throw new Error("VRM 데이터가 없는 파일입니다 (.vrm 파일인지 확인하세요).");

  vrmLoader__VRMUtils.removeUnnecessaryVertices(gltf.scene);
  vrmLoader__VRMUtils.combineSkeletons(gltf.scene);
  vrmLoader__VRMUtils.rotateVRM0(vrm);

  const appearanceMaterials = new Map<vrmLoader__THREE.Material, vrmLoader__AppearanceSlot>();

  vrm.scene.traverse((obj) => {
    if (obj instanceof vrmLoader__THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        const slot = vrmLoader__appearanceSlot(obj.name, material.name);
        if (slot) appearanceMaterials.set(material, slot);
      }
    }
  });

  const humanoid = vrm.humanoid;
  humanoid.resetNormalizedPose();
  vrm.scene.updateWorldMatrix(true, true);

  const restLocal = new Map<BoneName, vrmLoader__THREE.Quaternion>();
  const boneCache = new Map<BoneName, vrmLoader__THREE.Object3D | null>();
  const getBone = (name: BoneName): vrmLoader__THREE.Object3D | null => {
    if (boneCache.has(name)) return boneCache.get(name)!;
    let node: vrmLoader__THREE.Object3D | null = null;
    try {
      node = humanoid.getNormalizedBoneNode(
        name as Parameters<typeof humanoid.getNormalizedBoneNode>[0],
      );
    } catch {
      node = null;
    }
    boneCache.set(name, node);
    if (node) restLocal.set(name, node.quaternion.clone());
    return node;
  };

  // Warm the cache so resetPose() knows every bone up front.
  const head = getBone("head");
  const hips = getBone("hips");

  const bbox = new vrmLoader__THREE.Box3().setFromObject(vrm.scene);
  const height = Math.max(0.2, bbox.max.y - bbox.min.y);
  const headWorld = head?.getWorldPosition(new vrmLoader__THREE.Vector3());
  const hipWorld = hips?.getWorldPosition(new vrmLoader__THREE.Vector3());
  const metrics: RigMetrics = {
    height,
    headY: headWorld?.y ?? height * 0.88,
    hipY: hipWorld?.y ?? height * 0.53,
  };

  // Gaze is driven through VRM's own look-at rig via a target object.
  const gazeTarget = new vrmLoader__THREE.Object3D();
  gazeTarget.position.set(0, metrics.headY, 2);
  vrm.scene.add(gazeTarget);
  if (vrm.lookAt) {
    vrm.lookAt.target = gazeTarget;
    vrm.lookAt.autoUpdate = true;
  }

  const em = vrm.expressionManager;
  const pending = new Map<string, number>();

  const resolveExpression = (name: ExpressionName): string | null => {
    if (!em) return null;
    if (em.getExpression(name)) return name;
    const fb = vrmLoader__EXPRESSION_FALLBACK[name];
    if (fb && em.getExpression(fb)) return fb;
    return null;
  };

  let gazeYaw = 0;
  let gazePitch = 0;

  return {
    root: vrm.scene,
    name: displayName,
    metrics,
    getBone,
    resetPose() {
      humanoid.resetNormalizedPose();
      for (const [name, q] of restLocal) getBone(name)?.quaternion.copy(q);
      vrm.scene.position.set(0, 0, 0);
    },
    setExpression(name, weight) {
      const key = resolveExpression(name);
      if (!key) return;
      // blinkLeft/blinkRight can collapse onto one 'blink' — keep the strongest.
      pending.set(key, Math.max(pending.get(key) ?? 0, weight));
    },
    setGaze(yaw, pitch) {
      gazeYaw = yaw;
      gazePitch = pitch;
    },
    setAppearance(appearance) {
      for (const [material, slot] of appearanceMaterials) {
        const color = (material as vrmLoader__THREE.Material & { color?: vrmLoader__THREE.Color }).color;
        if (!color?.isColor) continue;
        color.set(appearance[slot]);
        material.needsUpdate = true;
      }
    },
    update(delta) {
      if (em) {
        for (const [key, value] of pending) em.setValue(key, value);
        pending.clear();
      }
      if (head && vrm.lookAt) {
        const maxYaw = 22 / vrmLoader__DEG;
        const maxPitch = 16 / vrmLoader__DEG;
        const dir = new vrmLoader__THREE.Vector3(0, 0, 1).applyEuler(
          new vrmLoader__THREE.Euler(-gazePitch * maxPitch, gazeYaw * maxYaw, 0, "YXZ"),
        );
        const headPos = head.getWorldPosition(new vrmLoader__THREE.Vector3());
        const headQuat = head.getWorldQuaternion(new vrmLoader__THREE.Quaternion());
        dir.applyQuaternion(headQuat).multiplyScalar(1.5).add(headPos);
        gazeTarget.parent?.worldToLocal(dir);
        gazeTarget.position.copy(dir);
      }
      vrm.update(delta);
    },
    dispose() {
      vrmLoader__VRMUtils.deepDispose(vrm.scene);
      vrm.scene.removeFromParent();
    },
  };
}
// -----------------------------------------------------------------------------
// tracking-engine.ts
// -----------------------------------------------------------------------------
const trackingEngine__WASM_PATH = "/mediapipe/wasm";
const trackingEngine__MIN_INFERENCE_INTERVAL_MS = 1000 / 20;
const trackingEngine__MAX_INFERENCE_INTERVAL_MS = 100;
const trackingEngine__MIN_HAND_SCORE = 0.68;
const trackingEngine__MIN_HAND_SIZE = 0.018;
const trackingEngine__MAX_HAND_SIZE = 0.55;
const trackingEngine__MAX_HAND_TO_POSE_WRIST_DISTANCE = 0.28;
const trackingEngine__HAND_CONFIRM_FRAMES = 2;
const trackingEngine__TFLITE_INFO_PATTERN = /Created TensorFlow Lite XNNPACK delegate for CPU/i;
const trackingEngine__MEDIA_PIPE_CONSOLE_METHODS = ["error", "warn", "info"] as const;
const trackingEngine__MODEL = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  poseLite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  poseFull: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
};

const trackingEngine__MIRROR_LOOKUP: Partial<Record<JointName, JointName>> = (() => {
  const m: Partial<Record<JointName, JointName>> = {};
  for (const [a, b] of MIRROR_PAIRS) {
    m[a] = b;
    m[b] = a;
  }
  return m;
})();

type trackingEngine__Delegate = "GPU" | "CPU";

/**
 * Converts a MediaPipe landmark into avatar space.
 *
 * MediaPipe: +x image-right, +y image-down, +z away from the camera.
 * Avatar:    +x avatar-left,  +y up,        +z toward the camera.
 */
function trackingEngine__toAvatar(l: { x: number; y: number; z: number }, mirror: boolean): Vec3 {
  return { x: mirror ? -l.x : l.x, y: -l.y, z: -l.z };
}

function trackingEngine__point2d(l: trackingEngine__NormalizedLandmark): Point2D {
  return {
    x: l.x,
    y: l.y,
    z: l.z ?? 0,
    visibility: l.visibility ?? 1,
  };
}

function trackingEngine__videoFrameReady(video: HTMLVideoElement): boolean {
  return (
    !video.paused &&
    !video.ended &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  );
}

let trackingEngine__mediaPipeInfoFilterUsers = 0;
let trackingEngine__restoreMediaPipeInfoFilter: (() => void) | null = null;

function trackingEngine__installMediaPipeInfoFilter() {
  trackingEngine__mediaPipeInfoFilterUsers += 1;
  if (trackingEngine__mediaPipeInfoFilterUsers > 1) {
    return () => {
      trackingEngine__mediaPipeInfoFilterUsers = Math.max(0, trackingEngine__mediaPipeInfoFilterUsers - 1);
      if (trackingEngine__mediaPipeInfoFilterUsers === 0) trackingEngine__restoreMediaPipeInfoFilter?.();
    };
  }

  const originals = trackingEngine__MEDIA_PIPE_CONSOLE_METHODS.map((method) => [
    method,
    console[method],
  ] as const);
  for (const [method, original] of originals) {
    console[method] = ((...args: Parameters<typeof original>) => {
      const text = args.map((arg) => String(arg ?? "")).join(" ");
      if (!trackingEngine__TFLITE_INFO_PATTERN.test(text)) original(...args);
    }) as typeof original;
  }

  trackingEngine__restoreMediaPipeInfoFilter = () => {
    for (const [method, original] of originals) console[method] = original;
    trackingEngine__restoreMediaPipeInfoFilter = null;
  };
  return () => {
    trackingEngine__mediaPipeInfoFilterUsers = Math.max(0, trackingEngine__mediaPipeInfoFilterUsers - 1);
    if (trackingEngine__mediaPipeInfoFilterUsers === 0) trackingEngine__restoreMediaPipeInfoFilter?.();
  };
}

function trackingEngine__validHandCandidate(
  screen: trackingEngine__NormalizedLandmark[],
  handedness: string,
  poseScreen: trackingEngine__NormalizedLandmark[] | null,
): boolean {
  if (screen.length < 21) return false;
  for (const l of screen) {
    if (!Number.isFinite(l.x) || !Number.isFinite(l.y) || !Number.isFinite(l.z ?? 0)) {
      return false;
    }
    if (l.x < -0.15 || l.x > 1.15 || l.y < -0.15 || l.y > 1.15) return false;
  }

  const wrist = screen[0];
  const index = screen[5];
  const middle = screen[9];
  const pinky = screen[17];
  const palmWidth = Math.hypot(index.x - pinky.x, index.y - pinky.y);
  const palmLength = Math.hypot(middle.x - wrist.x, middle.y - wrist.y);
  if (
    palmWidth < trackingEngine__MIN_HAND_SIZE ||
    palmLength < trackingEngine__MIN_HAND_SIZE ||
    palmWidth > trackingEngine__MAX_HAND_SIZE ||
    palmLength > trackingEngine__MAX_HAND_SIZE
  ) {
    return false;
  }

  if (poseScreen) {
    const poseWrist = poseScreen[handedness === "Left" ? 15 : 16];
    if (poseWrist && (poseWrist.visibility ?? 1) >= 0.35) {
      const distance = Math.hypot(wrist.x - poseWrist.x, wrist.y - poseWrist.y);
      if (distance > trackingEngine__MAX_HAND_TO_POSE_WRIST_DISTANCE) return false;
    }
  }

  return true;
}

export interface TrackerCallbacks {
  onFrame: (frame: TrackFrame) => void;
  onStats?: (stats: TrackerStats) => void;
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
}

export class Tracker {
  private fileset: Awaited<
    ReturnType<typeof trackingEngine__FilesetResolver.forVisionTasks>
  > | null = null;
  private pose: trackingEngine__PoseLandmarker | null = null;
  private face: trackingEngine__FaceLandmarker | null = null;
  private hand: trackingEngine__HandLandmarker | null = null;

  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private running = false;
  private lastVideoTime = -1;
  private lastProcessAt = 0;
  private lastTs = 0;
  private delegate: trackingEngine__Delegate = "GPU";

  private smoother = new VectorSmoother();
  private frameTimes: number[] = [];
  private lastStatsAt = 0;
  private inferenceMs = 0;

  private building: Promise<void> | null = null;
  private dirty = true;
  private releaseInfoFilter: (() => void) | null = null;
  private handStableFrames: Record<"left" | "right", number> = {
    left: 0,
    right: 0,
  };

  constructor(
    private options: TrackerOptions,
    private cb: TrackerCallbacks,
  ) {}

  setOptions(next: Partial<TrackerOptions>) {
    const prev = this.options;
    this.options = { ...prev, ...next };
    if (
      prev.mode !== this.options.mode ||
      prev.quality !== this.options.quality ||
      prev.hands !== this.options.hands
    ) {
      this.dirty = true;
    }
    if (prev.mirror !== this.options.mirror) this.smoother.reset();
  }

  setSmoothing(value: number) {
    this.smoother.setStrength(value);
  }

  async start(video: HTMLVideoElement) {
    this.releaseInfoFilter ??= trackingEngine__installMediaPipeInfoFilter();
    const wasRunning = this.running;
    this.video = video;
    this.running = true;
    this.lastVideoTime = -1;
    this.lastProcessAt = 0;
    this.frameTimes = [];
    this.handStableFrames.left = 0;
    this.handStableFrames.right = 0;
    this.smoother.reset();
    await this.ensureModels();
    if (!wasRunning) this.loop();
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    this.stop();
    this.releaseInfoFilter?.();
    this.releaseInfoFilter = null;
    this.pose?.close();
    this.face?.close();
    this.hand?.close();
    this.pose = this.face = this.hand = null;
  }

  private async getFileset() {
    if (!this.fileset) {
      this.cb.onStatus?.("추론 엔진 로딩 중…");
      this.fileset = await trackingEngine__FilesetResolver.forVisionTasks(trackingEngine__WASM_PATH);
    }
    return this.fileset;
  }

  private async ensureModels() {
    if (!this.dirty) return;
    if (this.building) return this.building;

    this.building = (async () => {
      const fileset = await this.getFileset();
      const { mode, quality, hands } = this.options;
      const wantPose = mode === "full";
      const wantHands = mode === "full" && hands;

      try {
        this.cb.onStatus?.("얼굴 모델 로딩 중…");
        if (!this.face) {
          this.face = await trackingEngine__FaceLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: trackingEngine__MODEL.face,
              delegate: this.delegate,
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: false,
          });
        }

        if (wantPose) {
          this.cb.onStatus?.("전신 모델 로딩 중…");
          this.pose?.close();
          this.pose = await trackingEngine__PoseLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath:
                quality === "full" ? trackingEngine__MODEL.poseFull : trackingEngine__MODEL.poseLite,
              delegate: this.delegate,
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } else if (this.pose) {
          this.pose.close();
          this.pose = null;
        }

        if (wantHands) {
          this.cb.onStatus?.("손 모델 로딩 중…");
          if (!this.hand) {
            this.hand = await trackingEngine__HandLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: trackingEngine__MODEL.hand,
                delegate: this.delegate,
              },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.68,
              minHandPresenceConfidence: 0.68,
              minTrackingConfidence: 0.68,
            });
          }
        } else if (this.hand) {
          this.hand.close();
          this.hand = null;
        }

        this.dirty = false;
        this.cb.onStatus?.("");
      } catch (err) {
        if (this.delegate === "GPU") {
          // Some machines have no usable WebGL for TFLite — retry on CPU once.
          this.delegate = "CPU";
          this.pose?.close();
          this.face?.close();
          this.hand?.close();
          this.pose = this.face = this.hand = null;
          this.building = null;
          this.cb.onStatus?.("GPU 사용 불가 — CPU로 전환합니다…");
          await this.ensureModels();
          return;
        }
        this.cb.onError?.(
          err instanceof Error ? err.message : "모델 로딩에 실패했습니다.",
        );
      } finally {
        this.building = null;
      }
    })();

    return this.building;
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);

    const video = this.video;
    if (!video || !trackingEngine__videoFrameReady(video)) return;
    if (document.hidden) return;
    if (this.dirty && !this.building) void this.ensureModels();
    if (video.currentTime === this.lastVideoTime) return;

    const started = performance.now();
    const adaptiveInterval = Math.min(
      trackingEngine__MAX_INFERENCE_INTERVAL_MS,
      Math.max(trackingEngine__MIN_INFERENCE_INTERVAL_MS, this.inferenceMs * 1.15),
    );
    if (started - this.lastProcessAt < adaptiveInterval) return;
    this.lastProcessAt = started;
    this.lastVideoTime = video.currentTime;

    let ts = Math.round(started);
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;

    try {
      this.process(video, ts);
    } catch {
      // A dropped frame is not worth tearing the session down for.
      return;
    }

    const elapsed = performance.now() - started;
    this.inferenceMs = this.inferenceMs * 0.9 + elapsed * 0.1;
    this.trackFps(started);
  };

  private trackFps(now: number) {
    this.frameTimes.push(now);
    while (this.frameTimes.length > 60) this.frameTimes.shift();
    if (now - this.lastStatsAt < 500) return;
    this.lastStatsAt = now;
    const span =
      this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0];
    const fps = span > 0 ? ((this.frameTimes.length - 1) / span) * 1000 : 0;
    this.cb.onStats?.({
      fps,
      inferenceMs: this.inferenceMs,
      delegate: this.delegate,
    });
  }

  private process(video: HTMLVideoElement, ts: number) {
    const { mirror, mode, showOverlay } = this.options;
    const tSec = ts / 1000;
    const aspect = video.videoHeight / video.videoWidth || 0.75;

    const joints: Joints = {};
    const confidence: Partial<Record<JointName, number>> = {};
    let hasPose = false;
    let overlayPose: Point2D[] | null = null;
    let poseScreen: trackingEngine__NormalizedLandmark[] | null = null;
    const rootOffset: Vec3 = { x: 0, y: 0, z: 0 };

    if (mode === "full" && this.pose) {
      const res = this.pose.detectForVideo(video, ts);
      const world = res.worldLandmarks?.[0];
      const screen = res.landmarks?.[0];
      if (world && screen) {
        hasPose = true;
        poseScreen = screen;
        overlayPose = showOverlay ? screen.map(trackingEngine__point2d) : null;

        for (const [idxStr, name] of Object.entries(POSE_INDEX_TO_JOINT)) {
          const idx = Number(idxStr);
          const w = world[idx];
          const s = screen[idx];
          if (!w) continue;
          const target = mirror ? (trackingEngine__MIRROR_LOOKUP[name] ?? name) : name;
          joints[target] = this.smoother.filter(
            `p:${target}`,
            trackingEngine__toAvatar(w, mirror),
            tSec,
          );
          confidence[target] = s?.visibility ?? 1;
        }

        // Where the body sits inside the frame, so the avatar can follow it.
        const lh = screen[23];
        const rh = screen[24];
        const ls = screen[11];
        const rs = screen[12];
        if (lh && rh && ls && rs) {
          const cx = (lh.x + rh.x) / 2;
          const cy = (lh.y + rh.y + ls.y + rs.y) / 4;
          const shoulderSpan = Math.hypot(ls.x - rs.x, (ls.y - rs.y) * aspect);
          const raw = {
            x: ((mirror ? 1 - cx : cx) - 0.5) * 2,
            y: -(cy - 0.5) * 2,
            // Wider shoulders in frame == closer to the camera.
            z: (shoulderSpan - 0.22) * 3,
          };
          const smoothed = this.smoother.filter("root", raw, tSec);
          rootOffset.x = smoothed.x;
          rootOffset.y = smoothed.y;
          rootOffset.z = smoothed.z;
        }
      }
    }

    let hasFace = false;
    let headQuat: TrackFrame["headQuat"] = null;
    let blendshapes: Record<string, number> = {};
    let overlayFace: Point2D[] | null = null;

    if (this.face) {
      const res = this.face.detectForVideo(video, ts);
      const lm = res.faceLandmarks?.[0];
      if (lm && lm.length > FACE.leftSide) {
        hasFace = true;
        overlayFace = showOverlay ? lm.map(trackingEngine__point2d) : null;
        headQuat = this.solveHeadBasis(lm, mirror, aspect, tSec);

        const cats = res.faceBlendshapes?.[0]?.categories;
        if (cats) {
          blendshapes = {};
          for (const c of cats) {
            if (c.categoryName) blendshapes[c.categoryName] = c.score;
          }
          if (mirror) blendshapes = trackingEngine__mirrorBlendshapes(blendshapes);
        }

        if (mode === "face") {
          const nose = lm[FACE.noseTip];
          const raw = {
            x: ((mirror ? 1 - nose.x : nose.x) - 0.5) * 2,
            y: -(nose.y - 0.5) * 2,
            z: 0,
          };
          const smoothed = this.smoother.filter("root", raw, tSec);
          rootOffset.x = smoothed.x;
          rootOffset.y = smoothed.y;
        }
      }
    }

    const hands: TrackFrame["hands"] = { left: null, right: null };
    const overlayHands: Point2D[][] = [];
    const seenHand: Record<"left" | "right", boolean> = {
      left: false,
      right: false,
    };
    if (this.hand && mode === "full") {
      const res = this.hand.detectForVideo(video, ts);
      const worlds = res.worldLandmarks ?? [];
      for (let i = 0; i < worlds.length; i++) {
        const handed = res.handedness?.[i]?.[0];
        const label = handed?.categoryName;
        const score = handed?.score ?? 0;
        const screen = res.landmarks?.[i];
        const world = worlds[i];
        if (
          !label ||
          score < trackingEngine__MIN_HAND_SCORE ||
          !screen ||
          !world ||
          world.length < 21 ||
          !trackingEngine__validHandCandidate(screen, label, poseScreen)
        ) {
          continue;
        }

        // MediaPipe reports handedness for the raw (unmirrored) image.
        const side: "left" | "right" =
          (label === "Left") === !mirror ? "left" : "right";
        seenHand[side] = true;
        this.handStableFrames[side] = Math.min(
          trackingEngine__HAND_CONFIRM_FRAMES,
          this.handStableFrames[side] + 1,
        );
        if (this.handStableFrames[side] < trackingEngine__HAND_CONFIRM_FRAMES) continue;

        hands[side] = world.map((l) => trackingEngine__toAvatar(l, mirror));
        if (showOverlay) overlayHands.push(screen.map(trackingEngine__point2d));
      }
    }
    for (const side of ["left", "right"] as const) {
      if (!seenHand[side]) this.handStableFrames[side] = 0;
    }

    this.cb.onFrame({
      ts,
      hasPose,
      hasFace,
      joints,
      confidence,
      headQuat,
      blendshapes,
      hands,
      rootOffset,
      overlay: { pose: overlayPose, face: overlayFace, hands: overlayHands },
    });
  }

  /**
   * Head orientation straight from the face mesh: an orthonormal basis built
   * from the ear-to-ear, chin-to-forehead and outward axes, then packed into a
   * quaternion. More stable than deriving it from three pose landmarks.
   */
  private solveHeadBasis(
    lm: trackingEngine__NormalizedLandmark[],
    mirror: boolean,
    aspect: number,
    tSec: number,
  ): [number, number, number, number] {
    const p = (i: number): Vec3 => {
      const l = lm[i];
      return this.smoother.filter(
        `f:${i}`,
        { x: mirror ? -l.x : l.x, y: -l.y * aspect, z: -(l.z ?? 0) },
        tSec,
      );
    };

    // When mirrored, the face's left/right sides swap roles as well.
    const leftIdx = mirror ? FACE.rightSide : FACE.leftSide;
    const rightIdx = mirror ? FACE.leftSide : FACE.rightSide;

    const left = p(leftIdx);
    const right = p(rightIdx);
    const top = p(FACE.forehead);
    const bottom = p(FACE.chin);

    // x = avatar-left, y = up, z = forward (= x cross y)
    let ax = trackingEngine__norm(trackingEngine__sub(left, right));
    const ay0 = trackingEngine__norm(trackingEngine__sub(top, bottom));
    const az = trackingEngine__norm(trackingEngine__cross(ax, ay0));
    const ay = trackingEngine__norm(trackingEngine__cross(az, ax));
    ax = trackingEngine__norm(trackingEngine__cross(ay, az));

    return trackingEngine__quatFromBasis(ax, ay, az);
  }
}

function trackingEngine__mirrorBlendshapes(b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(b)) {
    if (k.endsWith("Left")) out[`${k.slice(0, -4)}Right`] = v;
    else if (k.endsWith("Right")) out[`${k.slice(0, -5)}Left`] = v;
    else out[k] = v;
  }
  return out;
}

function trackingEngine__sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function trackingEngine__cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function trackingEngine__norm(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** Column-major basis -> quaternion (three.js compatible ordering). */
function trackingEngine__quatFromBasis(
  x: Vec3,
  y: Vec3,
  z: Vec3,
): [number, number, number, number] {
  const m00 = x.x,
    m10 = x.y,
    m20 = x.z;
  const m01 = y.x,
    m11 = y.y,
    m21 = y.z;
  const m02 = z.x,
    m12 = z.y,
    m22 = z.z;

  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}
// -----------------------------------------------------------------------------
// scene-viewer.ts
// -----------------------------------------------------------------------------
export type BackgroundKind =
  | "gradient"
  | "studio"
  | "ai-stage"
  | "neon-city"
  | "busan-future"
  | "custom"
  | "chroma"
  | "transparent";
export type CameraPreset = "full" | "upper" | "face";

const sceneViewer__PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: number }> =
  {
    full: { pos: [0, 0.62, 3.15], target: 0.55 },
    upper: { pos: [0, 0.85, 1.75], target: 0.8 },
    face: { pos: [0, 0.94, 0.95], target: 0.92 },
  };

const sceneViewer__TARGET_RENDER_INTERVAL_MS = 1000 / 30;

function sceneViewer__gradientTexture(top: string, bottom: string) {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new sceneViewer__THREE.CanvasTexture(c);
  tex.colorSpace = sceneViewer__THREE.SRGBColorSpace;
  return tex;
}

export class AvatarViewer {
  readonly renderer: sceneViewer__THREE.WebGLRenderer;
  readonly scene = new sceneViewer__THREE.Scene();
  readonly camera: sceneViewer__THREE.PerspectiveCamera;
  private controls: sceneViewer__OrbitControls;
  private clock = new sceneViewer__THREE.Clock();
  private raf = 0;
  private lastRenderAt = 0;
  private rig: AvatarRig | null = null;
  private solver: PoseSolver | null = null;
  private frame: TrackFrame | null = null;
  private blinker = new IdleBlinker();
  private face: FaceDrive = structuredClone(NEUTRAL_FACE);
  private smoothedFace = structuredClone(NEUTRAL_FACE);
  private ground: sceneViewer__THREE.Mesh;
  private backdrop: sceneViewer__THREE.Texture | null = null;
  private backgroundLoadToken = 0;
  private background: BackgroundKind = "gradient";
  private chroma = "#00b140";
  private preset: CameraPreset = "full";

  expressionGain = 1.15;
  idleBlink = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new sceneViewer__THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = sceneViewer__THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new sceneViewer__THREE.PerspectiveCamera(32, 1, 0.05, 60);
    this.camera.position.set(0, 1.05, 3.15);

    this.controls = new sceneViewer__OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 8;
    this.controls.target.set(0, 0.95, 0);

    const hemi = new sceneViewer__THREE.HemisphereLight(0xdfe8ff, 0x2b2f45, 1.5);
    this.scene.add(hemi);

    const key = new sceneViewer__THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(1.6, 3.1, 2.6);
    key.castShadow = false;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.top = 2.4;
    key.shadow.camera.bottom = -0.4;
    key.shadow.camera.left = -1.6;
    key.shadow.camera.right = 1.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 9;
    key.shadow.bias = -0.0015;
    this.scene.add(key);

    const rim = new sceneViewer__THREE.DirectionalLight(0x8ea4ff, 1.1);
    rim.position.set(-2.2, 1.8, -2.4);
    this.scene.add(rim);

    this.ground = new sceneViewer__THREE.Mesh(
      new sceneViewer__THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2),
      new sceneViewer__THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    this.ground.receiveShadow = false;
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

  setBackground(kind: BackgroundKind, chroma?: string, customUrl?: string | null) {
    this.background = kind;
    const loadToken = ++this.backgroundLoadToken;
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
      this.scene.background = new sceneViewer__THREE.Color(this.chroma);
      return;
    }
    const imageUrl =
      kind === "ai-stage"
        ? "/background-ai-stage.png"
        : kind === "neon-city"
          ? "/background-neon-city.png"
          : kind === "busan-future"
            ? "/background-busan-future.png"
            : kind === "custom"
              ? customUrl
              : null;
    if (imageUrl) {
      this.scene.background = new sceneViewer__THREE.Color("#111528");
      new sceneViewer__THREE.TextureLoader().load(
        imageUrl,
        (texture) => {
          if (loadToken !== this.backgroundLoadToken) {
            texture.dispose();
            return;
          }
          texture.colorSpace = sceneViewer__THREE.SRGBColorSpace;
          this.backdrop = texture;
          this.fitBackdrop();
          this.scene.background = texture;
        },
        undefined,
        () => {
          if (loadToken !== this.backgroundLoadToken) return;
          this.backdrop = sceneViewer__gradientTexture("#2b2f57", "#0b0d1c");
          this.scene.background = this.backdrop;
        },
      );
      return;
    }
    this.backdrop =
      kind === "studio"
        ? sceneViewer__gradientTexture("#f4f6ff", "#c3c9e4")
        : sceneViewer__gradientTexture("#2b2f57", "#0b0d1c");
    this.scene.background = this.backdrop;
  }

  applyPreset(preset: CameraPreset, immediate = false) {
    this.preset = preset;
    const rig = this.rig;
    const h = rig ? rig.metrics.height : 1.7;
    const p = sceneViewer__PRESETS[preset];
    const target = new sceneViewer__THREE.Vector3(0, h * p.target + (preset === "face" ? 0.02 : 0), 0);
    const pos = new sceneViewer__THREE.Vector3(p.pos[0], h * (p.pos[1] / 1.7) + target.y * 0.35, p.pos[2] * (h / 1.7));
    if (immediate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
    } else {
      this.pendingCamera = { pos, target };
    }
  }

  private pendingCamera: { pos: sceneViewer__THREE.Vector3; target: sceneViewer__THREE.Vector3 } | null = null;

  resize(width: number, height: number) {
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.fitBackdrop();
    this.renderer.setSize(width, height, false);
  }

  private fitBackdrop() {
    const texture = this.backdrop;
    const image = texture?.image as { width?: number; height?: number } | undefined;
    if (!texture || !image?.width || !image.height) return;
    const imageAspect = image.width / image.height;
    const viewAspect = this.camera.aspect;
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    if (imageAspect > viewAspect) {
      texture.repeat.x = viewAspect / imageAspect;
      texture.offset.x = (1 - texture.repeat.x) / 2;
    } else {
      texture.repeat.y = imageAspect / viewAspect;
      texture.offset.y = (1 - texture.repeat.y) / 2;
    }
    texture.needsUpdate = true;
  }

  start() {
    if (this.raf) return;
    this.clock.start();
    this.lastRenderAt = 0;
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const elapsed = now - this.lastRenderAt;
      if (document.hidden || elapsed < sceneViewer__TARGET_RENDER_INTERVAL_MS) {
        return;
      }
      // Keep the remainder so a 60 Hz display settles near 30 fps instead of
      // occasionally dropping to every third animation frame.
      this.lastRenderAt = now - (elapsed % sceneViewer__TARGET_RENDER_INTERVAL_MS);
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
    this.backgroundLoadToken += 1;
    this.setRig(null);
    this.controls.dispose();
    this.backdrop?.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as sceneViewer__THREE.Material).dispose();
    this.renderer.dispose();
  }
}
// -----------------------------------------------------------------------------
// settings.ts
// -----------------------------------------------------------------------------
export interface Settings {
  mirror: boolean;

  vrmUrl: string | null;
  vrmName: string | null;
  skinColor: string;
  hairColor: string;
  outfitColor: string;
  accentColor: string;

  smoothing: number;
  followBody: number;
  headGain: number;
  expressionGain: number;

  background: BackgroundKind;
  backgroundUrl: string | null;
  chroma: string;
  cameraPreset: CameraPreset;

  showSkeleton: boolean;
  showCamera: boolean;
}

interface settings__Store extends Settings {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  patch(next: Partial<Settings>): void;
}

const settings__initial: Settings = {
  mirror: true,

  vrmUrl: "/avatars/rocketbox-male-casual-student.vrm",
  vrmName: "남성형 학생 · Rocketbox 현실형 일상복",
  skinColor: "#efc29f",
  hairColor: "#2a211f",
  outfitColor: "#334f82",
  accentColor: "#37f2dc",

  smoothing: 0.45,
  followBody: 0.5,
  headGain: 1.15,
  expressionGain: 1.15,

  background: "gradient",
  backgroundUrl: null,
  chroma: "#00b140",
  cameraPreset: "full",

  showSkeleton: false,
  showCamera: true,
};

export const useSettings = settings__create<settings__Store>((set) => ({
  ...settings__initial,
  set: (key, value) => set({ [key]: value } as Partial<Settings>),
  patch: (next) => set(next),
}));
