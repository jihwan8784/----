#!/usr/bin/env python3
import json
import struct
from pathlib import Path

JSON_CHUNK = 0x4E4F534A


def read_json(path: Path):
    data = path.read_bytes()
    if data[:4] != b'glTF':
        raise RuntimeError(f'{path}: not GLB/VRM')
    version, total = struct.unpack_from('<II', data, 4)
    if version != 2 or total != len(data):
        raise RuntimeError(f'{path}: invalid GLB header')
    offset = 12
    while offset + 8 <= len(data):
        length, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        chunk = data[offset:offset + length]
        offset += length
        if kind == JSON_CHUNK:
            return json.loads(chunk.decode('utf-8').rstrip('\x00 '))
    raise RuntimeError(f'{path}: JSON chunk missing')


for path in sorted(Path('public/avatars/realistic').glob('*.vrm')):
    doc = read_json(path)
    print(f'\n=== {path.name} ===')
    materials = doc.get('materials', [])
    for i, mat in enumerate(materials):
        pbr = mat.get('pbrMetallicRoughness', {})
        print('MAT', i, repr(mat.get('name', '')), 'base=', pbr.get('baseColorFactor'), 'tex=', pbr.get('baseColorTexture', {}).get('index'))
    meshes = doc.get('meshes', [])
    nodes = doc.get('nodes', [])
    for ni, node in enumerate(nodes):
        mi = node.get('mesh')
        if mi is None or mi >= len(meshes):
            continue
        mesh = meshes[mi]
        refs = sorted({p.get('material') for p in mesh.get('primitives', []) if p.get('material') is not None})
        names = [materials[i].get('name', '') if i < len(materials) else '?' for i in refs]
        print('NODE', ni, repr(node.get('name', '')), 'mesh=', repr(mesh.get('name', '')), 'materials=', list(zip(refs, names)))
