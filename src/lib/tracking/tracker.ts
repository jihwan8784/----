"use client";

import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import type {
  JointName,
  Joints,
  Point2D,
  TrackFrame,
  TrackerOptions,
  TrackerStats,
  Vec3,
} from "@/lib/types";
import { FACE, MIRROR_PAIRS, POSE_INDEX_TO_JOINT } from "./landmarks";
import { VectorSmoother } from "./smoothing";

const WASM_PATH = "/mediapipe/wasm";
const MIN_INFERENCE_INTERVAL_MS = 1000 / 20;
const MAX_INFERENCE_INTERVAL_MS = 100;
const MIN_HAND_SCORE = 0.68;
const MIN_HAND_SIZE = 0.018;
const MAX_HAND_SIZE = 0.55;
const MAX_HAND_TO_POSE_WRIST_DISTANCE = 0.28;
const HAND_CONFIRM_FRAMES = 2;
const TFLITE_INFO_PATTERN = /Created TensorFlow Lite XNNPACK delegate for CPU/i;
const MODEL = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  poseLite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  poseFull: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
};

const MIRROR_LOOKUP: Partial<Record<JointName, JointName>> = (() => {
  const m: Partial<Record<JointName, JointName>> = {};
  for (const [a, b] of MIRROR_PAIRS) {
    m[a] = b;
    m[b] = a;
  }
  return m;
})();

type Delegate = "GPU" | "CPU";

/**
 * Converts a MediaPipe landmark into avatar space.
 *
 * MediaPipe: +x image-right, +y image-down, +z away from the camera.
 * Avatar:    +x avatar-left,  +y up,        +z toward the camera.
 */
function toAvatar(l: { x: number; y: number; z: number }, mirror: boolean): Vec3 {
  return { x: mirror ? -l.x : l.x, y: -l.y, z: -l.z };
}

function point2d(l: NormalizedLandmark): Point2D {
  return {
    x: l.x,
    y: l.y,
    z: l.z ?? 0,
    visibility: l.visibility ?? 1,
  };
}

function videoFrameReady(video: HTMLVideoElement): boolean {
  return (
    !video.paused &&
    !video.ended &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  );
}

function withMediaPipeInfoFilter<T>(run: () => T): T {
  const originalError = console.error;
  console.error = (...args: Parameters<typeof console.error>) => {
    const text = args.map((arg) => String(arg ?? "")).join(" ");
    if (TFLITE_INFO_PATTERN.test(text)) return;
    originalError(...args);
  };
  try {
    return run();
  } finally {
    console.error = originalError;
  }
}

function validHandCandidate(
  screen: NormalizedLandmark[],
  handedness: string,
  poseScreen: NormalizedLandmark[] | null,
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
    palmWidth < MIN_HAND_SIZE ||
    palmLength < MIN_HAND_SIZE ||
    palmWidth > MAX_HAND_SIZE ||
    palmLength > MAX_HAND_SIZE
  ) {
    return false;
  }

  if (poseScreen) {
    const poseWrist = poseScreen[handedness === "Left" ? 15 : 16];
    if (poseWrist && (poseWrist.visibility ?? 1) >= 0.35) {
      const distance = Math.hypot(wrist.x - poseWrist.x, wrist.y - poseWrist.y);
      if (distance > MAX_HAND_TO_POSE_WRIST_DISTANCE) return false;
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
    ReturnType<typeof FilesetResolver.forVisionTasks>
  > | null = null;
  private pose: PoseLandmarker | null = null;
  private face: FaceLandmarker | null = null;
  private hand: HandLandmarker | null = null;

  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private running = false;
  private lastVideoTime = -1;
  private lastProcessAt = 0;
  private lastTs = 0;
  private delegate: Delegate = "GPU";

  private smoother = new VectorSmoother();
  private frameTimes: number[] = [];
  private lastStatsAt = 0;
  private inferenceMs = 0;

  private building: Promise<void> | null = null;
  private dirty = true;
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
    this.pose?.close();
    this.face?.close();
    this.hand?.close();
    this.pose = this.face = this.hand = null;
  }

  private async getFileset() {
    if (!this.fileset) {
      this.cb.onStatus?.("추론 엔진 로딩 중…");
      this.fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
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
          this.face = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: MODEL.face,
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
          this.pose = await PoseLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath:
                quality === "full" ? MODEL.poseFull : MODEL.poseLite,
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
            this.hand = await HandLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: MODEL.hand,
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
    if (!video || !videoFrameReady(video)) return;
    if (document.hidden) return;
    if (this.dirty && !this.building) void this.ensureModels();
    if (video.currentTime === this.lastVideoTime) return;

    const started = performance.now();
    const adaptiveInterval = Math.min(
      MAX_INFERENCE_INTERVAL_MS,
      Math.max(MIN_INFERENCE_INTERVAL_MS, this.inferenceMs * 1.15),
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
    let poseScreen: NormalizedLandmark[] | null = null;
    const rootOffset: Vec3 = { x: 0, y: 0, z: 0 };

    if (mode === "full" && this.pose) {
      const res = withMediaPipeInfoFilter(() => this.pose!.detectForVideo(video, ts));
      const world = res.worldLandmarks?.[0];
      const screen = res.landmarks?.[0];
      if (world && screen) {
        hasPose = true;
        poseScreen = screen;
        overlayPose = showOverlay ? screen.map(point2d) : null;

        for (const [idxStr, name] of Object.entries(POSE_INDEX_TO_JOINT)) {
          const idx = Number(idxStr);
          const w = world[idx];
          const s = screen[idx];
          if (!w) continue;
          const target = mirror ? (MIRROR_LOOKUP[name] ?? name) : name;
          joints[target] = this.smoother.filter(
            `p:${target}`,
            toAvatar(w, mirror),
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
      const res = withMediaPipeInfoFilter(() => this.face!.detectForVideo(video, ts));
      const lm = res.faceLandmarks?.[0];
      if (lm && lm.length > FACE.leftSide) {
        hasFace = true;
        overlayFace = showOverlay ? lm.map(point2d) : null;
        headQuat = this.solveHeadBasis(lm, mirror, aspect, tSec);

        const cats = res.faceBlendshapes?.[0]?.categories;
        if (cats) {
          blendshapes = {};
          for (const c of cats) {
            if (c.categoryName) blendshapes[c.categoryName] = c.score;
          }
          if (mirror) blendshapes = mirrorBlendshapes(blendshapes);
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
      const res = withMediaPipeInfoFilter(() => this.hand!.detectForVideo(video, ts));
      const worlds = res.worldLandmarks ?? [];
      for (let i = 0; i < worlds.length; i++) {
        const handed = res.handedness?.[i]?.[0];
        const label = handed?.categoryName;
        const score = handed?.score ?? 0;
        const screen = res.landmarks?.[i];
        const world = worlds[i];
        if (
          !label ||
          score < MIN_HAND_SCORE ||
          !screen ||
          !world ||
          world.length < 21 ||
          !validHandCandidate(screen, label, poseScreen)
        ) {
          continue;
        }

        // MediaPipe reports handedness for the raw (unmirrored) image.
        const side: "left" | "right" =
          (label === "Left") === !mirror ? "left" : "right";
        seenHand[side] = true;
        this.handStableFrames[side] = Math.min(
          HAND_CONFIRM_FRAMES,
          this.handStableFrames[side] + 1,
        );
        if (this.handStableFrames[side] < HAND_CONFIRM_FRAMES) continue;

        hands[side] = world.map((l) => toAvatar(l, mirror));
        if (showOverlay) overlayHands.push(screen.map(point2d));
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
    lm: NormalizedLandmark[],
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
    let ax = norm(sub(left, right));
    const ay0 = norm(sub(top, bottom));
    const az = norm(cross(ax, ay0));
    const ay = norm(cross(az, ax));
    ax = norm(cross(ay, az));

    return quatFromBasis(ax, ay, az);
  }
}

function mirrorBlendshapes(b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(b)) {
    if (k.endsWith("Left")) out[`${k.slice(0, -4)}Right`] = v;
    else if (k.endsWith("Right")) out[`${k.slice(0, -5)}Left`] = v;
    else out[k] = v;
  }
  return out;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** Column-major basis -> quaternion (three.js compatible ordering). */
function quatFromBasis(
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
