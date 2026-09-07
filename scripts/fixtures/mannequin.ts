import * as THREE from "three";

import {
  FINGER_NAMES,
  fingerBone,
  type AvatarRig,
  type BoneName,
  type ExpressionName,
  type FingerName,
  type RigMetrics,
  type Side,
} from "./rig";

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
