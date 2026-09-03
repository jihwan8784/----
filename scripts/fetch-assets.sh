#!/usr/bin/env bash
# Re-fetch the MediaPipe models into public/, and restore the WASM runtime.
# Models are committed to the repo, so this is only needed to bump their version.
# The WASM runtime is not committed — it is copied out of node_modules so that it
# always matches the installed @mediapipe/tasks-vision version.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/models
node scripts/copy-wasm.mjs

BASE=https://storage.googleapis.com/mediapipe-models
curl -fsSL -o public/models/face_landmarker.task \
  "$BASE/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
curl -fsSL -o public/models/pose_landmarker_lite.task \
  "$BASE/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
curl -fsSL -o public/models/pose_landmarker_full.task \
  "$BASE/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
curl -fsSL -o public/models/hand_landmarker.task \
  "$BASE/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

echo "done:"
ls -lh public/models public/mediapipe/wasm
