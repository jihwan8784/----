#!/usr/bin/env python3
import json
import mimetypes
import struct
import urllib.request
from pathlib import Path

CANDIDATES = ["kai", "nova", "sky", "ember"]
BASE = "https://vtubeme.com/media/free/{name}/model.vrm"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
OUT = Path("candidate-thumbs")
OUT.mkdir(exist_ok=True)


def read_glb(data: bytes):
    if data[:4] != b"glTF":
        raise RuntimeError("not GLB")
    version, total = struct.unpack_from("<II", data, 4)
    if version != 2 or total != len(data):
        raise RuntimeError("invalid GLB header")
    offset = 12
    doc = None
    bin_chunk = b""
    while offset + 8 <= len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + length]
        offset += length
        if kind == JSON_CHUNK:
            doc = json.loads(chunk.decode("utf-8").rstrip("\x00 "))
        elif kind == BIN_CHUNK:
            bin_chunk = chunk
    if doc is None:
        raise RuntimeError("missing JSON chunk")
    return doc, bin_chunk


def image_bytes(doc, bin_chunk, image_index):
    images = doc.get("images", [])
    if image_index is None or image_index >= len(images):
        return None, None
    image = images[image_index]
    bv_index = image.get("bufferView")
    if bv_index is None:
        return None, None
    bv = doc.get("bufferViews", [])[bv_index]
    start = bv.get("byteOffset", 0)
    end = start + bv["byteLength"]
    return bin_chunk[start:end], image.get("mimeType")


for name in CANDIDATES:
    url = BASE.format(name=name)
    print(f"\n=== {name} ===")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    print("bytes", len(data))
    doc, bin_chunk = read_glb(data)
    print("extensionsUsed", doc.get("extensionsUsed"))
    print("materials", len(doc.get("materials", [])), "meshes", len(doc.get("meshes", [])), "nodes", len(doc.get("nodes", [])))
    for i, mat in enumerate(doc.get("materials", [])):
        pbr = mat.get("pbrMetallicRoughness", {})
        print("MAT", i, repr(mat.get("name", "")), "base=", pbr.get("baseColorFactor"), "tex=", pbr.get("baseColorTexture", {}).get("index"))

    vrm = doc.get("extensions", {}).get("VRMC_vrm", {})
    meta = vrm.get("meta", {})
    print("vrm1 meta", {k: meta.get(k) for k in ("name", "authors", "licenseUrl", "commercialUsage", "modification", "redistribution") if k in meta})
    thumb_index = meta.get("thumbnailImage")
    raw, mime = image_bytes(doc, bin_chunk, thumb_index)
    if raw:
        ext = mimetypes.guess_extension(mime or "") or ".png"
        path = OUT / f"{name}{ext}"
        path.write_bytes(raw)
        print("thumbnail", path, mime, len(raw))
    else:
        # Fall back to the first embedded image so the artifact is still useful.
        raw, mime = image_bytes(doc, bin_chunk, 0)
        if raw:
            ext = mimetypes.guess_extension(mime or "") or ".png"
            path = OUT / f"{name}-image0{ext}"
            path.write_bytes(raw)
            print("image0", path, mime, len(raw))
