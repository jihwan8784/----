#!/usr/bin/env python3
from pathlib import Path

path = Path("src/lib/avatar/solver.ts")
text = path.read_text(encoding="utf-8")

old = """        this.relax(handBone, alpha, 0.55);\n        this.relaxFingers(side, alpha);"""
new = """        this.relaxLocal(handBone, alpha, 0.55);\n        this.relaxFingers(side, alpha);"""
if text.count(old) != 1:
    raise RuntimeError(f"missing-hand wrist marker count={text.count(old)}")
text = text.replace(old, new, 1)

old = """        this.relax(bone, alpha, 0.55);"""
new = """        this.relaxLocal(bone, alpha, 0.55);"""
if text.count(old) != 1:
    raise RuntimeError(f"finger relax marker count={text.count(old)}")
text = text.replace(old, new, 1)

marker = """  /** Eases a bone back to its authored rest rotation. */
  private relax(name: BoneName, alpha: number, rate = 1) {
    const restWorld = this.restWorld.get(name);
    if (!this.bones.has(name) || !restWorld) return;
    this.setWorldBasisRaw(name, restWorld.clone(), alpha * rate);
  }

  private setWorldBasisRaw("""
replacement = """  /** Eases a bone back to its authored world-space rest rotation. */
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
      : this.rig.root.getWorldQuaternion(new THREE.Quaternion());
    this.world.set(name, parentWorld.clone().multiply(bone.quaternion));
  }

  private setWorldBasisRaw("""
if text.count(marker) != 1:
    raise RuntimeError(f"relax method marker count={text.count(marker)}")
text = text.replace(marker, replacement, 1)

path.write_text(text, encoding="utf-8")
print("Applied local-space hand/finger neutral-pose fix.")
