export type TrackMode = "full" | "face";
export type AvatarKind = "mannequin" | "vrm";
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
}

export interface TrackerStats {
  fps: number;
  inferenceMs: number;
  delegate: "GPU" | "CPU";
}
