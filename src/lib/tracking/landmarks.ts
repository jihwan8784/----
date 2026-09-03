import type { JointName } from "@/lib/types";

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
