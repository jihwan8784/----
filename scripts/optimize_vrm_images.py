#!/usr/bin/env python3
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def align4(data: bytes, fill: bytes = b"\x00") -> bytes:
    return data + fill * ((4 - len(data) % 4) % 4)


def read_glb(path: Path):
    raw = path.read_bytes()
    if len(raw) < 20:
        raise ValueError("file is too small to be a VRM/GLB")
    magic, version, declared_length = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(raw):
        raise ValueError("invalid GLB header")
    pos = 12
    chunks = []
    while pos < len(raw):
        length, chunk_type = struct.unpack_from("<II", raw, pos)
        pos += 8
        chunks.append((chunk_type, raw[pos : pos + length]))
        pos += length
    json_bytes = next(data for kind, data in chunks if kind == JSON_CHUNK)
    bin_bytes = next(data for kind, data in chunks if kind == BIN_CHUNK)
    return json.loads(json_bytes.rstrip(b" \x00").decode("utf-8")), bin_bytes


def optimize_image(data: bytes, mime: str, max_size: int) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as image:
            if max(image.size) <= max_size:
                return data
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            if mime == "image/jpeg" or image.format == "JPEG":
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")
                image.save(out, format="JPEG", quality=84, optimize=True)
            else:
                image.save(out, format="PNG", optimize=True, compress_level=9)
            return out.getvalue()
    except Exception as exc:
        print(f"warning: could not optimize embedded image: {exc}")
        return data


def get_bones(doc):
    ext = doc.get("extensions", {})
    if "VRMC_vrm" in ext:
        bones = ext["VRMC_vrm"].get("humanoid", {}).get("humanBones", {})
        return set(bones.keys()), "VRM 1.0"
    if "VRM" in ext:
        rows = ext["VRM"].get("humanoid", {}).get("humanBones", [])
        return {row.get("bone") for row in rows if row.get("bone")}, "VRM 0.x"
    raise ValueError("VRM extension is missing")


def optimize(src: Path, dst: Path, max_size: int = 1024):
    doc, old_bin = read_glb(src)
    views = doc.get("bufferViews", [])
    images = doc.get("images", [])
    image_by_view = {img["bufferView"]: img for img in images if "bufferView" in img}
    new_bin = bytearray()
    optimized_count = 0
    for index, view in enumerate(views):
        if view.get("buffer", 0) != 0:
            raise ValueError("only single-buffer VRM files are supported")
        start = view.get("byteOffset", 0)
        piece = old_bin[start : start + view["byteLength"]]
        image = image_by_view.get(index)
        if image:
            next_piece = optimize_image(piece, image.get("mimeType", ""), max_size)
            optimized_count += int(len(next_piece) < len(piece))
            piece = next_piece
        while len(new_bin) % 4:
            new_bin.append(0)
        view["byteOffset"] = len(new_bin)
        view["byteLength"] = len(piece)
        new_bin.extend(piece)
    new_bin = bytearray(align4(bytes(new_bin)))
    doc["buffers"][0]["byteLength"] = len(new_bin)
    bones, version = get_bones(doc)
    required = {"hips", "spine", "head", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg", "leftHand", "rightHand", "leftFoot", "rightFoot"}
    missing = sorted(required - bones)
    if missing:
        raise ValueError(f"required humanoid bones missing: {', '.join(missing)}")
    json_raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_padded = align4(json_raw, b" ")
    bin_padded = align4(bytes(new_bin))
    total = 12 + 8 + len(json_padded) + 8 + len(bin_padded)
    out = bytearray(struct.pack("<4sII", b"glTF", 2, total))
    out.extend(struct.pack("<II", len(json_padded), JSON_CHUNK))
    out.extend(json_padded)
    out.extend(struct.pack("<II", len(bin_padded), BIN_CHUNK))
    out.extend(bin_padded)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(out)
    print(f"{src.name}: {version}, {len(bones)} bones, {optimized_count}/{len(images)} textures resized, {src.stat().st_size / 1048576:.1f} -> {len(out) / 1048576:.1f} MiB")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit("usage: optimize_vrm_images.py INPUT.vrm OUTPUT.vrm [MAX_TEXTURE_SIZE]")
    optimize(Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) == 4 else 1024)
