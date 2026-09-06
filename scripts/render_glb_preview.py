#!/usr/bin/env python3
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def args():
    if "--" not in sys.argv:
        raise RuntimeError("Usage: blender -b --python render_glb_preview.py -- input.glb output_dir")
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 2:
        raise RuntimeError("Expected input.glb output_dir")
    return Path(values[0]).resolve(), Path(values[1]).resolve()


def scene_bounds():
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    if not points:
        raise RuntimeError("No mesh bounds found")
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return low, high


def point_at(obj, target):
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, size, target):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = Vector(location)
    point_at(obj, target)
    return obj


def main():
    input_path, output_dir = args()
    output_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path))
    bpy.context.view_layer.update()

    # glTF/VRM is Y-up, but Blender converts imported glTF scenes to Z-up.
    # Preview in Blender world coordinates so a valid upright VRM is rendered
    # standing rather than from above/below.
    low, high = scene_bounds()
    center = (low + high) * 0.5
    width = high.x - low.x
    depth = high.y - low.y
    height = high.z - low.z
    print("Preview bounds:", tuple(low), tuple(high), "height:", height)
    if not (1.4 <= height <= 2.2):
        raise RuntimeError(f"Unexpected Blender-world avatar height: {height:.3f}m")

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (0.04, 0.04, 0.055)

    camera_data = bpy.data.cameras.new("Camera")
    camera = bpy.data.objects.new("Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera_data.lens = 58

    target = Vector((center.x, center.y, low.z + height * 0.53))
    distance = max(2.4, height * 1.55, width * 2.0, depth * 2.0)
    add_area("Key", (center.x + 1.2, center.y - 1.7, low.z + height * 1.35), 850, 3.0, target)
    add_area("Fill", (center.x - 1.4, center.y - 0.8, low.z + height * 1.0), 500, 2.5, target)
    add_area("Rim", (center.x, center.y + 1.8, low.z + height * 1.35), 650, 2.0, target)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    for label, sign in (("plus-y", 1), ("minus-y", -1)):
        camera.location = Vector((center.x, center.y + sign * distance, target.z))
        point_at(camera, target)
        scene.render.filepath = str(output_dir / f"{label}.png")
        bpy.ops.render.render(write_still=True)
        print("Rendered", scene.render.filepath)


if __name__ == "__main__":
    main()
