#!/usr/bin/env python3
import os
import sys
from pathlib import Path

import bpy


def arg_values():
    if "--" not in sys.argv:
        raise RuntimeError("Usage: blender -b --python rocketbox_to_glb.py -- input.fbx output.glb texture_dir")
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 3:
        raise RuntimeError("Expected input.fbx output.glb texture_dir")
    return Path(args[0]).resolve(), Path(args[1]).resolve(), Path(args[2]).resolve()


def find_armature():
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError("Rocketbox FBX contains no armature")
    return max(armatures, key=lambda obj: len(obj.data.bones))


def find_bone(armature, aliases):
    bones = armature.data.bones
    by_lower = {bone.name.lower(): bone for bone in bones}
    for alias in aliases:
        bone = by_lower.get(alias.lower())
        if bone:
            return bone
    for bone in bones:
        low = bone.name.lower()
        for alias in aliases:
            if low.endswith(alias.lower()):
                return bone
    return None


def rename_humanoid_bones(armature):
    mapping = {
        "Hips": ["Bip01 Pelvis", "Pelvis"],
        "Spine": ["Bip01 Spine", "Spine"],
        "Chest": ["Bip01 Spine2", "Bip01 Spine1", "Chest"],
        "Neck": ["Bip01 Neck", "Neck"],
        "Head": ["Bip01 Head", "Head"],
        "LeftShoulder": ["Bip01 L Clavicle", "LeftShoulder", "L Clavicle"],
        "LeftUpperArm": ["Bip01 L UpperArm", "LeftUpperArm", "L UpperArm"],
        "LeftForearm": ["Bip01 L Forearm", "LeftForearm", "L Forearm"],
        "LeftHand": ["Bip01 L Hand", "LeftHand", "L Hand"],
        "RightShoulder": ["Bip01 R Clavicle", "RightShoulder", "R Clavicle"],
        "RightUpperArm": ["Bip01 R UpperArm", "RightUpperArm", "R UpperArm"],
        "RightForearm": ["Bip01 R Forearm", "RightForearm", "R Forearm"],
        "RightHand": ["Bip01 R Hand", "RightHand", "R Hand"],
        "LeftThigh": ["Bip01 L Thigh", "LeftThigh", "L Thigh"],
        "LeftShin": ["Bip01 L Calf", "LeftShin", "L Calf"],
        "LeftFoot": ["Bip01 L Foot", "LeftFoot", "L Foot"],
        "RightThigh": ["Bip01 R Thigh", "RightThigh", "R Thigh"],
        "RightShin": ["Bip01 R Calf", "RightShin", "R Calf"],
        "RightFoot": ["Bip01 R Foot", "RightFoot", "R Foot"],
    }

    missing = []
    resolved = []
    for target, aliases in mapping.items():
        bone = find_bone(armature, aliases)
        if bone is None:
            missing.append(target)
            continue
        resolved.append((bone, target))

    if missing:
        available = ", ".join(b.name for b in armature.data.bones)
        raise RuntimeError(f"Missing humanoid bones: {missing}\nAvailable: {available}")

    for bone, target in resolved:
        bone.name = target

    print("Humanoid bones:", ", ".join(target for _, target in resolved))


def relink_and_resize_images(texture_dir: Path, max_size=1024):
    files = {p.name.lower(): p for p in texture_dir.glob("*") if p.is_file()}
    linked = 0
    for image in bpy.data.images:
        if image.name == "Render Result":
            continue
        candidates = []
        if image.filepath:
            candidates.append(Path(bpy.path.abspath(image.filepath)).name.lower())
        candidates.append(Path(image.name).name.lower())
        source = next((files[name] for name in candidates if name in files), None)
        if source:
            image.filepath = str(source)
            try:
                image.reload()
                linked += 1
            except RuntimeError:
                pass
        width, height = image.size[:]
        if width > 0 and height > 0 and max(width, height) > max_size:
            ratio = max_size / max(width, height)
            image.scale(max(1, round(width * ratio)), max(1, round(height * ratio)))
    print(f"Relinked {linked} texture images")


def remove_animation_data():
    for obj in bpy.data.objects:
        if obj.animation_data:
            obj.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def main():
    input_path, output_path, texture_dir = arg_values()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(input_path), use_anim=False)

    armature = find_armature()
    print("Armature:", armature.name, "bones:", len(armature.data.bones))
    rename_humanoid_bones(armature)
    relink_and_resize_images(texture_dir)
    remove_animation_data()

    # Keep the original rig/weights and let the app normalize camera framing.
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_animations=False,
        export_skins=True,
        export_morph=True,
        export_yup=True,
    )
    print(f"Exported {output_path} ({output_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
