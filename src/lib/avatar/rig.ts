import type * as THREE from "three";

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

export interface AvatarRig {
  /** Object to add to the scene. Its position is the avatar's floor anchor. */
  root: THREE.Object3D;
  name: string;
  metrics: RigMetrics;
  getBone(name: BoneName): THREE.Object3D | null;
  /** Reset every bone to the rest pose. */
  resetPose(): void;
  setExpression(name: ExpressionName, weight: number): void;
  /** Eye gaze in normalised units, -1..1. */
  setGaze(yaw: number, pitch: number): void;
  /** Recolour in place, where the avatar supports it (built-in mannequin). */
  setPalette?(body: string, accent: string, skin: string): void;
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
