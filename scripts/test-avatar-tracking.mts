import * as THREE from "three";

import {
  FINGER_NAMES,
  MIRROR_PAIRS,
  PoseSolver,
  fingerBone,
  type AvatarRig,
  type BoneName,
  type ExpressionName,
  type FingerName,
  type JointName,
  type Joints,
  type RigMetrics,
  type Side,
  type TrackFrame,
  type Vec3,
} from "../src/core";

// Test-only humanoid fixture, kept in this test file to avoid another .ts source.
export interface MannequinOptions {
  body: string;
  accent: string;
  skin: string;
}

export const DEFAULT_MANNEQUIN: MannequinOptions = {
  body: "#6d7dff",
  accent: "#151a2e",
  skin: "#ffd9c0",
};

const Y_UP = new THREE.Vector3(0, 1, 0);

/**
 * A built-in low-poly humanoid so the app works with no asset to download.
 * The hierarchy uses VRM bone names and a T-pose rest, so the same solver
 * drives it and a loaded VRM identically.
 */
export function createMannequin(opts: MannequinOptions = DEFAULT_MANNEQUIN): AvatarRig {
  const bones = new Map<BoneName, THREE.Object3D>();
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(opts.body),
    roughness: 0.45,
    metalness: 0.05,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(opts.accent),
    roughness: 0.3,
    metalness: 0.1,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(opts.skin),
    roughness: 0.6,
  });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.25,
  });
  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a26,
    roughness: 0.2,
  });
  disposables.push(bodyMat, accentMat, skinMat, eyeWhiteMat, pupilMat);

  const capsule = (
    dir: THREE.Vector3,
    length: number,
    radius: number,
    mat: THREE.Material,
  ) => {
    const geo = new THREE.CapsuleGeometry(
      radius,
      Math.max(length - radius * 2, 0.002),
      4,
      12,
    );
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    const d = dir.clone().normalize();
    mesh.quaternion.setFromUnitVectors(Y_UP, d);
    mesh.position.copy(d.multiplyScalar(length / 2));
    mesh.castShadow = true;
    return mesh;
  };

  const box = (
    size: [number, number, number],
    mat: THREE.Material,
    pos: [number, number, number] = [0, 0, 0],
  ) => {
    const geo = new THREE.BoxGeometry(...size);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    return mesh;
  };

  const bone = (
    name: BoneName,
    parent: THREE.Object3D,
    pos: [number, number, number],
  ) => {
    const obj = new THREE.Object3D();
    obj.name = name;
    obj.position.set(...pos);
    parent.add(obj);
    bones.set(name, obj);
    return obj;
  };

  const root = new THREE.Group();
  root.name = "mannequin";

  const hips = bone("hips", root, [0, 0.92, 0]);
  hips.add(capsule(new THREE.Vector3(0, 1, 0), 0.14, 0.115, accentMat));

  const spine = bone("spine", hips, [0, 0.1, 0]);
  const chest = bone("chest", spine, [0, 0.13, 0]);
  chest.add(capsule(new THREE.Vector3(0, 1, 0), 0.26, 0.135, bodyMat));
  const upperChest = bone("upperChest", chest, [0, 0.12, 0]);

  const neck = bone("neck", upperChest, [0, 0.1, 0]);
  neck.add(capsule(new THREE.Vector3(0, 1, 0), 0.07, 0.042, skinMat));

  const head = bone("head", neck, [0, 0.08, 0]);
  const skullGeo = new THREE.SphereGeometry(0.105, 24, 20);
  disposables.push(skullGeo);
  const skull = new THREE.Mesh(skullGeo, skinMat);
  skull.position.y = 0.085;
  skull.scale.set(0.95, 1.12, 1);
  skull.castShadow = true;
  head.add(skull);

  const hairGeo = new THREE.SphereGeometry(
    0.112,
    24,
    18,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.62,
  );
  disposables.push(hairGeo);
  const hair = new THREE.Mesh(hairGeo, accentMat);
  hair.position.y = 0.085;
  hair.scale.set(0.97, 1.12, 1.02);
  head.add(hair);

  // --- face -----------------------------------------------------------------
  const face = new THREE.Group();
  face.position.set(0, 0.09, 0);
  head.add(face);

  const eyeGeo = new THREE.SphereGeometry(0.021, 16, 12);
  const pupilGeo = new THREE.SphereGeometry(0.011, 12, 10);
  const browGeo = new THREE.BoxGeometry(0.042, 0.008, 0.01);
  disposables.push(eyeGeo, pupilGeo, browGeo);

  const eyes: Record<Side, THREE.Object3D> = {} as never;
  const pupils: Record<Side, THREE.Object3D> = {} as never;
  const brows: Record<Side, THREE.Object3D> = {} as never;
  for (const side of ["left", "right"] as Side[]) {
    const sx = side === "left" ? 1 : -1;
    const eye = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    eye.position.set(sx * 0.038, 0.005, 0.086);
    eye.scale.set(1, 1, 0.55);
    face.add(eye);
    eyes[side] = eye;

    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(sx * 0.038, 0.005, 0.099);
    face.add(pupil);
    pupils[side] = pupil;

    const brow = new THREE.Mesh(browGeo, accentMat);
    brow.position.set(sx * 0.038, 0.038, 0.092);
    face.add(brow);
    brows[side] = brow;
  }

  const mouth = box([0.05, 0.012, 0.012], accentMat, [0, -0.042, 0.09]);
  face.add(mouth);

  // --- arms -----------------------------------------------------------------
  const armSpec: { side: Side; sx: number }[] = [
    { side: "left", sx: 1 },
    { side: "right", sx: -1 },
  ];

  for (const { side, sx } of armSpec) {
    const shoulder = bone(
      (side === "left" ? "leftShoulder" : "rightShoulder") as BoneName,
      upperChest,
      [sx * 0.045, 0.06, 0],
    );
    const upperArm = bone(
      (side === "left" ? "leftUpperArm" : "rightUpperArm") as BoneName,
      shoulder,
      [sx * 0.115, 0, 0],
    );
    upperArm.add(capsule(new THREE.Vector3(sx, 0, 0), 0.25, 0.05, bodyMat));

    const lowerArm = bone(
      (side === "left" ? "leftLowerArm" : "rightLowerArm") as BoneName,
      upperArm,
      [sx * 0.25, 0, 0],
    );
    lowerArm.add(capsule(new THREE.Vector3(sx, 0, 0), 0.24, 0.042, skinMat));

    const hand = bone(
      (side === "left" ? "leftHand" : "rightHand") as BoneName,
      lowerArm,
      [sx * 0.24, 0, 0],
    );
    const palm = box([0.075, 0.075, 0.028], skinMat, [sx * 0.032, 0, 0]);
    palm.scale.set(1, 0.85, 1);
    hand.add(palm);

    buildFingers(side, sx, hand);
  }

  function buildFingers(side: Side, sx: number, hand: THREE.Object3D) {
    const knuckles: Record<FingerName, [number, number, number]> = {
      thumb: [0.012, -0.008, 0.03],
      index: [0.062, 0.004, 0.028],
      middle: [0.066, 0.004, 0.009],
      ring: [0.063, 0.003, -0.009],
      little: [0.058, 0.002, -0.027],
    };
    const lengths: Record<FingerName, [number, number, number]> = {
      thumb: [0.03, 0.028, 0.022],
      index: [0.036, 0.024, 0.019],
      middle: [0.039, 0.026, 0.02],
      ring: [0.036, 0.024, 0.019],
      little: [0.03, 0.02, 0.017],
    };

    for (const finger of FINGER_NAMES) {
      const [kx, ky, kz] = knuckles[finger];
      const [l0, l1, l2] = lengths[finger];
      const segments =
        finger === "thumb"
          ? (["Metacarpal", "Proximal", "Distal"] as const)
          : (["Proximal", "Intermediate", "Distal"] as const);
      // Thumb splays forward, the rest run straight out along the arm.
      const dir = new THREE.Vector3(sx, 0, finger === "thumb" ? 0.5 : 0).normalize();

      let parent = hand;
      let offset: [number, number, number] = [sx * kx, ky, kz];
      const segLengths = [l0, l1, l2];
      for (let i = 0; i < segments.length; i++) {
        const b = bone(fingerBone(side, finger, segments[i]), parent, offset);
        b.add(capsule(dir, segLengths[i], 0.0105 - i * 0.0012, skinMat));
        parent = b;
        offset = [dir.x * segLengths[i], dir.y * segLengths[i], dir.z * segLengths[i]];
      }
    }
  }

  // --- legs -----------------------------------------------------------------
  for (const { side, sx } of armSpec) {
    const upperLeg = bone(
      (side === "left" ? "leftUpperLeg" : "rightUpperLeg") as BoneName,
      hips,
      [sx * 0.085, -0.05, 0],
    );
    upperLeg.add(capsule(new THREE.Vector3(0, -1, 0), 0.42, 0.062, accentMat));

    const lowerLeg = bone(
      (side === "left" ? "leftLowerLeg" : "rightLowerLeg") as BoneName,
      upperLeg,
      [0, -0.42, 0],
    );
    lowerLeg.add(capsule(new THREE.Vector3(0, -1, 0), 0.4, 0.05, accentMat));

    const foot = bone(
      (side === "left" ? "leftFoot" : "rightFoot") as BoneName,
      lowerLeg,
      [0, -0.4, 0],
    );
    foot.add(box([0.08, 0.05, 0.14], bodyMat, [0, -0.02, 0.035]));

    bone(
      (side === "left" ? "leftToes" : "rightToes") as BoneName,
      foot,
      [0, -0.02, 0.1],
    );
  }

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = true;
  });

  const restLocal = new Map<BoneName, THREE.Quaternion>();
  for (const [name, obj] of bones) restLocal.set(name, obj.quaternion.clone());

  const metrics: RigMetrics = { height: 1.72, headY: 1.53, hipY: 0.92 };
  const expr: Partial<Record<ExpressionName, number>> = {};
  let gazeYaw = 0;
  let gazePitch = 0;

  return {
    root,
    name: "기본 아바타",
    metrics,
    getBone: (name) => bones.get(name) ?? null,
    resetPose() {
      for (const [name, q] of restLocal) bones.get(name)?.quaternion.copy(q);
      root.position.set(0, 0, 0);
    },
    setExpression(name, weight) {
      expr[name] = weight;
    },
    setGaze(yaw, pitch) {
      gazeYaw = yaw;
      gazePitch = pitch;
    },
    setPalette(body, accent, skin) {
      bodyMat.color.set(body);
      accentMat.color.set(accent);
      skinMat.color.set(skin);
    },
    update() {
      const open = Math.min(1, (expr.aa ?? 0) + (expr.oh ?? 0) * 0.8);
      const wide = expr.ih ?? 0;
      const round = expr.ou ?? 0;
      const happy = expr.happy ?? 0;
      const sad = expr.sad ?? 0;
      const angry = expr.angry ?? 0;
      const surprised = expr.surprised ?? 0;

      mouth.scale.set(
        1 + wide * 0.55 + happy * 0.3 - round * 0.5,
        1 + open * 7 + surprised * 1.2,
        1 + open * 1.6 + round * 1.2,
      );
      mouth.position.y = -0.042 - open * 0.012;
      mouth.rotation.z = (happy - sad) * 0.0;

      for (const side of ["left", "right"] as Side[]) {
        const sx = side === "left" ? 1 : -1;
        const blink = side === "left" ? expr.blinkLeft ?? 0 : expr.blinkRight ?? 0;
        eyes[side].scale.set(1, Math.max(0.04, 1 - blink) * (1 + surprised * 0.25), 0.55);
        pupils[side].scale.setScalar(Math.max(0.05, 1 - blink));
        pupils[side].position.x = sx * 0.038 + gazeYaw * 0.012;
        pupils[side].position.y = 0.005 + gazePitch * 0.01;

        brows[side].position.y =
          0.038 + surprised * 0.016 - angry * 0.008 + sad * 0.004;
        brows[side].rotation.z = sx * (angry * 0.5 - sad * 0.35);
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      root.removeFromParent();
    },
  };
}

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

{
  console.log("\n손 랜드마크 없음 (Pose 손가락 점이 튀어도 손목은 중립 유지)");
  const rig = createMannequin();
  const leftHand = rig.getBone("leftHand")!;
  const rightHand = rig.getBone("rightHand")!;
  const leftRest = leftHand.quaternion.clone();
  const rightRest = rightHand.quaternion.clone();
  const solver = new PoseSolver(rig);
  solver.settings.followBody = 0;
  const noisyIndex: Partial<Record<JointName, MPPoint>> = {
    ...RAW,
    leftIndex: [2.5, -2.5, 1.5],
    rightIndex: [-2.5, 2.5, -1.5],
  };
  const frame = buildFrame(false, noisyIndex);
  for (let i = 0; i < 240; i++) solver.apply(frame, 1 / 60);

  const leftAngle = leftHand.quaternion.angleTo(leftRest);
  const rightAngle = rightHand.quaternion.angleTo(rightRest);
  check(
    "왼손 손목이 rest 포즈를 유지",
    leftAngle < 0.08,
    `angle=${leftAngle.toFixed(4)} rad`,
  );
  check(
    "오른손 손목이 rest 포즈를 유지",
    rightAngle < 0.08,
    `angle=${rightAngle.toFixed(4)} rad`,
  );
}

console.log(
  failures === 0
    ? "\n전부 통과했습니다.\n"
    : `\n${failures}개 실패했습니다.\n`,
);
process.exit(failures === 0 ? 0 : 1);
