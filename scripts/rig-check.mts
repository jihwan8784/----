/**
 * Headless sanity check for the landmark -> bone pipeline.
 *
 * Feeds synthetic MediaPipe world landmarks through the same conversion the
 * tracker uses, runs the real solver against the built-in mannequin, and
 * asserts the avatar ends up in the pose a human would expect. This is where
 * the coordinate-system reasoning (+x = avatar's left, +z = toward camera,
 * mirror = negate x and swap sides) actually gets tested.
 *
 *   npm run check:rig
 */
import * as THREE from "three";

import { createMannequin } from "../src/lib/avatar/mannequin";
import { PoseSolver } from "../src/lib/avatar/solver";
import { MIRROR_PAIRS } from "../src/lib/tracking/landmarks";
import type { JointName, Joints, TrackFrame, Vec3 } from "../src/lib/types";

type MPPoint = [number, number, number];

/** Person facing the camera, right arm straight up, left arm down. */
const RAW: Partial<Record<JointName, MPPoint>> = {
  nose: [0, -0.62, -0.1],
  leftEar: [0.08, -0.6, 0.02],
  rightEar: [-0.08, -0.6, 0.02],
  leftShoulder: [0.18, -0.5, 0],
  rightShoulder: [-0.18, -0.5, 0],
  leftElbow: [0.22, -0.22, 0],
  rightElbow: [-0.2, -0.78, 0],
  leftWrist: [0.24, 0.05, 0],
  rightWrist: [-0.22, -1.05, 0],
  leftIndex: [0.25, 0.13, 0],
  rightIndex: [-0.23, -1.13, 0],
  leftHip: [0.1, 0, 0],
  rightHip: [-0.1, 0, 0],
  leftKnee: [0.1, 0.45, 0],
  rightKnee: [-0.1, 0.45, 0],
  leftAnkle: [0.1, 0.9, 0],
  rightAnkle: [-0.1, 0.9, 0],
  leftFootIndex: [0.1, 0.95, -0.12],
  rightFootIndex: [-0.1, 0.95, -0.12],
};

/** Same person, arms straight out to the sides. */
const T_POSE: Partial<Record<JointName, MPPoint>> = {
  ...RAW,
  leftElbow: [0.45, -0.5, 0],
  rightElbow: [-0.45, -0.5, 0],
  leftWrist: [0.7, -0.5, 0],
  rightWrist: [-0.7, -0.5, 0],
  leftIndex: [0.78, -0.5, 0],
  rightIndex: [-0.78, -0.5, 0],
};

const MIRROR_LOOKUP = new Map<JointName, JointName>();
for (const [a, b] of MIRROR_PAIRS) {
  MIRROR_LOOKUP.set(a, b);
  MIRROR_LOOKUP.set(b, a);
}

/** Same conversion as Tracker.process: MediaPipe world -> avatar space. */
function buildFrame(
  mirror: boolean,
  raw: Partial<Record<JointName, MPPoint>> = RAW,
): TrackFrame {
  const joints: Joints = {};
  const confidence: Partial<Record<JointName, number>> = {};
  for (const [name, p] of Object.entries(raw) as [JointName, MPPoint][]) {
    const target = mirror ? (MIRROR_LOOKUP.get(name) ?? name) : name;
    const v: Vec3 = { x: mirror ? -p[0] : p[0], y: -p[1], z: -p[2] };
    joints[target] = v;
    confidence[target] = 1;
  }
  return {
    ts: 0,
    hasPose: true,
    hasFace: false,
    joints,
    confidence,
    headQuat: null,
    blendshapes: {},
    hands: { left: null, right: null },
    rootOffset: { x: 0, y: 0, z: 0 },
    overlay: { pose: null, face: null, hands: [] },
  };
}

function settle(
  mirror: boolean,
  raw?: Partial<Record<JointName, MPPoint>>,
  prepare?: (rig: ReturnType<typeof createMannequin>) => void,
) {
  const rig = createMannequin();
  prepare?.(rig);
  const solver = new PoseSolver(rig);
  solver.settings.followBody = 0;
  const frame = buildFrame(mirror, raw);
  for (let i = 0; i < 240; i++) solver.apply(frame, 1 / 60);
  rig.root.updateMatrixWorld(true);
  const at = (name: Parameters<typeof rig.getBone>[0]) => {
    const b = rig.getBone(name);
    if (!b) throw new Error(`missing bone ${name}`);
    return b.getWorldPosition(new THREE.Vector3());
  };
  return { rig, at };
}

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label} — ${detail}`);
}

console.log("\n입력: 사람이 카메라를 보고 오른팔을 위로 든 자세\n");

{
  console.log("거울 모드 끔 (아바타가 사람과 같은 쪽 팔을 듦)");
  const { at } = settle(false);
  const rHand = at("rightHand");
  const lHand = at("leftHand");
  const rShoulder = at("rightUpperArm");

  check(
    "오른손이 어깨 위로 올라감",
    rHand.y > rShoulder.y + 0.25,
    `hand.y=${rHand.y.toFixed(3)} vs shoulder.y=${rShoulder.y.toFixed(3)}`,
  );
  check(
    "오른손이 아바타 오른쪽(-x)에 있음",
    rHand.x < -0.05,
    `hand.x=${rHand.x.toFixed(3)}`,
  );
  check(
    "왼손은 내려가 있음",
    lHand.y < rHand.y - 0.5,
    `left.y=${lHand.y.toFixed(3)} right.y=${rHand.y.toFixed(3)}`,
  );
}

{
  console.log("\n거울 모드 켬 (화면상 같은 쪽 = 아바타의 왼팔)");
  const { at } = settle(true);
  const rHand = at("rightHand");
  const lHand = at("leftHand");

  check(
    "왼손이 올라감",
    lHand.y > rHand.y + 0.5,
    `left.y=${lHand.y.toFixed(3)} right.y=${rHand.y.toFixed(3)}`,
  );
  check(
    "올라간 손이 화면 오른쪽(+x)에 있음",
    lHand.x > 0.05,
    `left.x=${lHand.x.toFixed(3)}`,
  );
}

{
  console.log("\n정면 확인 (아바타가 카메라 쪽 +z 를 향함)");
  const { rig, at } = settle(false);
  rig.root.updateMatrixWorld(true);
  const chest = rig.getBone("chest")!;
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
    chest.getWorldQuaternion(new THREE.Quaternion()),
  );
  check("가슴이 +z 를 봄", forward.z > 0.9, `forward.z=${forward.z.toFixed(3)}`);

  const hips = at("hips");
  check(
    "엉덩이가 기본 높이를 유지",
    Math.abs(hips.y - 0.92) < 0.02,
    `hips.y=${hips.y.toFixed(3)}`,
  );
}

{
  console.log("\n비표준 rest 포즈 (A-포즈로 만들어진 모델 흉내)");
  // Drop both upper arms 45 degrees at rest, then feed a real T-pose. A rig
  // that only works from an identity rest would leave the arms hanging.
  const aPose = (rig: ReturnType<typeof createMannequin>) => {
    for (const [name, sign] of [
      ["leftUpperArm", -1],
      ["rightUpperArm", 1],
    ] as const) {
      rig
        .getBone(name)!
        .quaternion.setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          (sign * Math.PI) / 4,
        );
    }
  };
  const { at } = settle(false, T_POSE, aPose);
  const lHand = at("leftHand");
  const shoulder = at("leftUpperArm");
  check(
    "T-포즈 입력에 팔이 수평으로 펴짐",
    Math.abs(lHand.y - shoulder.y) < 0.12,
    `hand.y=${lHand.y.toFixed(3)} shoulder.y=${shoulder.y.toFixed(3)}`,
  );
  check(
    "손이 몸에서 충분히 멀어짐",
    lHand.x > 0.45,
    `hand.x=${lHand.x.toFixed(3)}`,
  );
}

console.log(
  failures === 0
    ? "\n전부 통과했습니다.\n"
    : `\n${failures}개 실패했습니다.\n`,
);
process.exit(failures === 0 ? 0 : 1);
