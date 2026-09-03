import * as THREE from "three";

import type { JointName, TrackFrame, Vec3 } from "@/lib/types";
import { damp } from "@/lib/tracking/smoothing";
import {
  BONE_PARENT,
  FINGER_NAMES,
  REST_CHILD,
  SOLVE_ORDER,
  fingerBone,
  type AvatarRig,
  type BoneName,
  type Side,
} from "./rig";

/** Bones driven by a single joint-to-joint direction. */
const LIMB_CHAIN: Partial<Record<BoneName, [JointName, JointName]>> = {
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

/** Hand landmark indices per finger, from knuckle outward. */
const FINGER_LANDMARKS: Record<string, number[]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  little: [17, 18, 19, 20],
};

const V = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);

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
  private bones = new Map<BoneName, THREE.Object3D>();
  private restLocal = new Map<BoneName, THREE.Quaternion>();
  private restWorld = new Map<BoneName, THREE.Quaternion>();
  private restDir = new Map<BoneName, THREE.Vector3>();
  private world = new Map<BoneName, THREE.Quaternion>();
  private rootRestY = 0;

  settings: SolverSettings = { ...DEFAULT_SOLVER_SETTINGS };

  constructor(private rig: AvatarRig) {
    this.bind();
  }

  private bind() {
    this.rig.resetPose();
    this.rig.root.updateWorldMatrix(true, true);
    this.rootRestY = this.rig.root.position.y;

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();

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

  private restChildPosition(name: BoneName): THREE.Vector3 | null {
    const candidates = REST_CHILD[name];
    const p = new THREE.Vector3();
    if (candidates) {
      for (const c of candidates) {
        const child = this.rig.getBone(c);
        if (child) return child.getWorldPosition(p).clone();
      }
    }
    const bone = this.rig.getBone(name);
    if (!bone || bone.children.length === 0) return null;
    const acc = new THREE.Vector3();
    let n = 0;
    for (const child of bone.children) {
      child.getWorldPosition(p);
      acc.add(p);
      n++;
    }
    return n ? acc.divideScalar(n) : null;
  }

  /** Used for leaf bones (fingertip segments, toes) with no child to aim at. */
  private fallbackDirection(name: BoneName): THREE.Vector3 {
    const parent = BONE_PARENT[name];
    const bone = this.rig.getBone(name);
    const parentBone = parent ? this.rig.getBone(parent) : null;
    if (bone && parentBone) {
      const a = parentBone.getWorldPosition(new THREE.Vector3());
      const b = bone.getWorldPosition(new THREE.Vector3());
      const d = b.sub(a);
      if (d.lengthSq() > 1e-10) return d;
    }
    return new THREE.Vector3(0, 1, 0);
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
        ? new THREE.Quaternion(...frame.headQuat)
        : null;

    // --- torso -------------------------------------------------------------
    const identity = new THREE.Quaternion();
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
      const amplified = new THREE.Quaternion().slerp(
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
        new THREE.Quaternion().slerp(chestBasis, 0.25),
        alpha,
      );
    }

    // --- limbs -------------------------------------------------------------
    for (const [boneName, pair] of Object.entries(LIMB_CHAIN) as [
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
        this.relax(boneName, alpha, 0.35);
        continue;
      }
      const dir = V(b).sub(V(a));
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
        // No finger data — point the wrist along the forearm and relax fingers.
        const wrist = usable ? j[`${side}Wrist` as JointName] : undefined;
        const index = usable ? j[`${side}Index` as JointName] : undefined;
        if (wrist && index) {
          const dir = V(index).sub(V(wrist));
          if (dir.lengthSq() > 1e-8) this.aimBone(handBone, dir.normalize(), alpha);
        } else {
          this.relax(handBone, alpha, 0.3);
        }
        this.relaxFingers(side, alpha);
      }
    }

    this.applyRootMotion(frame, alpha);
  }

  /** Hip and chest orientation, as world-space basis quaternions. */
  private torsoBases(j: TrackFrame["joints"]) {
    const lh = j.leftHip;
    const rh = j.rightHip;
    const ls = j.leftShoulder;
    const rs = j.rightShoulder;
    if (!lh || !rh || !ls || !rs) return null;

    const hipMid = V(lh).add(V(rh)).multiplyScalar(0.5);
    const shoulderMid = V(ls).add(V(rs)).multiplyScalar(0.5);
    const up = shoulderMid.clone().sub(hipMid);
    if (up.lengthSq() < 1e-8) return null;
    up.normalize();

    const hips = basisQuat(V(lh).sub(V(rh)).normalize(), up);
    const chest = basisQuat(V(ls).sub(V(rs)).normalize(), up);
    if (!hips || !chest) return null;
    return { hips, chest };
  }

  private solveHand(side: Side, lm: Vec3[], alpha: number) {
    const handBone: BoneName = side === "left" ? "leftHand" : "rightHand";
    const wrist = V(lm[0]);
    const middle = V(lm[9]);
    const indexKnuckle = V(lm[5]);
    const pinkyKnuckle = V(lm[17]);

    const axis = middle.clone().sub(wrist);
    if (axis.lengthSq() < 1e-8) return;
    axis.normalize();

    // Palm-outward normal; the cross product flips sign between hands.
    const normal = indexKnuckle
      .clone()
      .sub(wrist)
      .cross(pinkyKnuckle.clone().sub(wrist))
      .multiplyScalar(side === "left" ? -1 : 1);

    if (normal.lengthSq() > 1e-8) {
      normal.normalize();
      const target = orthoBasis(axis, normal);
      // The rest pose: bone axis as authored, palm facing down.
      const restAxis = this.restDir.get(handBone)?.clone() ?? axis.clone();
      const restNormal = new THREE.Vector3(0, -1, 0);
      const rest = orthoBasis(restAxis, restNormal);
      if (target && rest) {
        const delta = target.clone().multiply(rest.clone().invert());
        const w = delta.multiply(this.restWorld.get(handBone)!);
        this.setWorldBasisRaw(handBone, w, alpha);
      }
    } else {
      this.aimBone(handBone, axis, alpha);
    }

    for (const finger of FINGER_NAMES) {
      const idx = FINGER_LANDMARKS[finger];
      const segments =
        finger === "thumb"
          ? (["Metacarpal", "Proximal", "Distal"] as const)
          : (["Proximal", "Intermediate", "Distal"] as const);
      for (let s = 0; s < segments.length; s++) {
        const bone = fingerBone(side, finger, segments[s]);
        if (!this.bones.has(bone)) continue;
        const dir = V(lm[idx[s + 1]]).sub(V(lm[idx[s]]));
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
        this.relax(bone, alpha, 0.25);
      }
    }
  }

  /** Rotates a bone so its rest direction points along `dir` (world space). */
  private aimBone(name: BoneName, dir: THREE.Vector3, alpha: number) {
    const rest = this.restDir.get(name);
    const restWorld = this.restWorld.get(name);
    if (!rest || !restWorld) return;
    const delta = new THREE.Quaternion().setFromUnitVectors(rest, dir);
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
    basis: THREE.Quaternion,
    alpha: number,
  ) {
    const restWorld = this.restWorld.get(name);
    if (!this.bones.has(name) || !restWorld) return;
    this.setWorldBasisRaw(name, basis.clone().multiply(restWorld), alpha);
  }

  /** Eases a bone back to its authored rest rotation. */
  private relax(name: BoneName, alpha: number, rate = 1) {
    const restWorld = this.restWorld.get(name);
    if (!this.bones.has(name) || !restWorld) return;
    this.setWorldBasisRaw(name, restWorld.clone(), alpha * rate);
  }

  private setWorldBasisRaw(
    name: BoneName,
    target: THREE.Quaternion,
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
      : this.rig.root.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentWorld.clone().invert().multiply(current));
  }

  private worldOf(name: BoneName | undefined): THREE.Quaternion {
    if (!name) return new THREE.Quaternion();
    const w = this.world.get(name);
    if (w) return w;
    const parent = BONE_PARENT[name];
    return parent ? this.worldOf(parent) : new THREE.Quaternion();
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
function basisQuat(
  leftAxis: THREE.Vector3,
  upHint: THREE.Vector3,
): THREE.Quaternion | null {
  const x = leftAxis.clone();
  if (x.lengthSq() < 1e-8) return null;
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, upHint);
  if (z.lengthSq() < 1e-8) return null;
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  x.crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
}

/** Orthonormal frame whose first axis is `primary` and second is near `hint`. */
function orthoBasis(
  primary: THREE.Vector3,
  hint: THREE.Vector3,
): THREE.Quaternion | null {
  const x = primary.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, hint);
  if (z.lengthSq() < 1e-8) return null;
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
}
