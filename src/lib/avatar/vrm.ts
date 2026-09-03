import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

import type { AvatarRig, BoneName, ExpressionName, RigMetrics } from "./rig";

const DEG = 180 / Math.PI;

/** Expression fallbacks for models that only ship the merged presets. */
const EXPRESSION_FALLBACK: Partial<Record<ExpressionName, string>> = {
  blinkLeft: "blink",
  blinkRight: "blink",
  ee: "ih",
  oh: "aa",
};

export async function loadVRMRig(
  url: string,
  displayName: string,
  onProgress?: (ratio: number) => void,
): Promise<AvatarRig> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync(url, (e) => {
    if (e.total > 0) onProgress?.(e.loaded / e.total);
  });

  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error("VRM 데이터가 없는 파일입니다 (.vrm 파일인지 확인하세요).");

  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);

  vrm.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
    }
  });

  const humanoid = vrm.humanoid;
  humanoid.resetNormalizedPose();
  vrm.scene.updateWorldMatrix(true, true);

  const restLocal = new Map<BoneName, THREE.Quaternion>();
  const boneCache = new Map<BoneName, THREE.Object3D | null>();
  const getBone = (name: BoneName): THREE.Object3D | null => {
    if (boneCache.has(name)) return boneCache.get(name)!;
    let node: THREE.Object3D | null = null;
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

  const bbox = new THREE.Box3().setFromObject(vrm.scene);
  const height = Math.max(0.2, bbox.max.y - bbox.min.y);
  const headWorld = head?.getWorldPosition(new THREE.Vector3());
  const hipWorld = hips?.getWorldPosition(new THREE.Vector3());
  const metrics: RigMetrics = {
    height,
    headY: headWorld?.y ?? height * 0.88,
    hipY: hipWorld?.y ?? height * 0.53,
  };

  // Gaze is driven through VRM's own look-at rig via a target object.
  const gazeTarget = new THREE.Object3D();
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
    const fb = EXPRESSION_FALLBACK[name];
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
    update(delta) {
      if (em) {
        for (const [key, value] of pending) em.setValue(key, value);
        pending.clear();
      }
      if (head && vrm.lookAt) {
        const maxYaw = 22 / DEG;
        const maxPitch = 16 / DEG;
        const dir = new THREE.Vector3(0, 0, 1).applyEuler(
          new THREE.Euler(-gazePitch * maxPitch, gazeYaw * maxYaw, 0, "YXZ"),
        );
        const headPos = head.getWorldPosition(new THREE.Vector3());
        const headQuat = head.getWorldQuaternion(new THREE.Quaternion());
        dir.applyQuaternion(headQuat).multiplyScalar(1.5).add(headPos);
        gazeTarget.parent?.worldToLocal(dir);
        gazeTarget.position.copy(dir);
      }
      vrm.update(delta);
    },
    dispose() {
      VRMUtils.deepDispose(vrm.scene);
      vrm.scene.removeFromParent();
    },
  };
}
