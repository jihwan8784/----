from pathlib import Path
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]


def remove(path: str):
    p = ROOT / path
    if p.exists():
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()


def move(src: str, dst: str):
    source = ROOT / src
    target = ROOT / dst
    if not source.exists():
        raise SystemExit(f"Missing source for move: {src}")
    if target.exists():
        raise SystemExit(f"Target already exists: {dst}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(target))


# Remove obvious leftovers that are not used by the app/build.
for path in [
    "CLAUDE.md",
    "scripts/convert-project-glb-to-vrm.mjs",
    "scripts/fetch-assets.sh",
    "public/file.svg",
    "public/globe.svg",
    "public/next.svg",
    "public/vercel.svg",
    "public/window.svg",
]:
    remove(path)

# Collapse src/components + src/lib/* into one clear core folder.
move("src/components/AvatarStudio.tsx", "src/AvatarStudio.tsx")
move("src/lib/avatar/expressions.ts", "src/core/face-expressions.ts")
move("src/lib/avatar/mannequin.ts", "scripts/test-mannequin.ts")
move("src/lib/avatar/rig.ts", "src/core/avatar-rig.ts")
move("src/lib/avatar/solver.ts", "src/core/motion-solver.ts")
move("src/lib/avatar/vrm.ts", "src/core/vrm-loader.ts")
move("src/lib/scene/viewer.ts", "src/core/scene-viewer.ts")
move("src/lib/store.ts", "src/core/settings.ts")
move("src/lib/tracking/landmarks.ts", "src/core/tracking-landmarks.ts")
move("src/lib/tracking/overlay.ts", "src/core/tracking-overlay.ts")
move("src/lib/tracking/smoothing.ts", "src/core/tracking-smoothing.ts")
move("src/lib/tracking/tracker.ts", "src/core/tracking-engine.ts")
move("src/lib/types.ts", "src/core/types.ts")
remove("src/components")
remove("src/lib")

# Give maintenance scripts names that explain exactly what they do.
move("scripts/copy-wasm.mjs", "scripts/prepare-mediapipe-wasm.mjs")
move("scripts/rig-check.mts", "scripts/test-tracking-rig.mts")
move("scripts/validate-vrm-assets.mjs", "scripts/validate-avatar-assets.mjs")

# Flatten avatar provider folders. Provider + gender + role are now visible in filenames.
avatar_moves = {
    "public/avatars/realistic/male-casual.vrm": "public/avatars/valid-male-casual.vrm",
    "public/avatars/realistic/female-casual.vrm": "public/avatars/valid-female-casual.vrm",
    "public/avatars/realistic/male-business.vrm": "public/avatars/valid-male-business.vrm",
    "public/avatars/realistic/female-business.vrm": "public/avatars/valid-female-business.vrm",
    "public/avatars/realistic/male-medical.vrm": "public/avatars/valid-male-medical.vrm",
    "public/avatars/realistic/female-medical.vrm": "public/avatars/valid-female-medical.vrm",
    "public/avatars/realistic/male-utility.vrm": "public/avatars/valid-male-utility.vrm",
    "public/avatars/realistic/female-utility.vrm": "public/avatars/valid-female-utility.vrm",
    "public/avatars/realistic/NOTICE.md": "public/avatars/LICENSE_GOOGLE_VALID.md",
    "public/avatars/occupation/male-student.vrm": "public/avatars/rocketbox-male-student-casual.vrm",
    "public/avatars/occupation/female-student.vrm": "public/avatars/rocketbox-female-student-casual.vrm",
    "public/avatars/occupation/male-astronaut.vrm": "public/avatars/rocketbox-male-astronaut-pilot.vrm",
    "public/avatars/occupation/female-astronaut.vrm": "public/avatars/rocketbox-female-astronaut-pilot.vrm",
    "public/avatars/occupation/male-firefighter.vrm": "public/avatars/rocketbox-male-firefighter.vrm",
    "public/avatars/occupation/female-firefighter.vrm": "public/avatars/rocketbox-female-firefighter.vrm",
    "public/avatars/occupation/female-chef.vrm": "public/avatars/rocketbox-female-chef.vrm",
    "public/avatars/occupation/NOTICE.md": "public/avatars/LICENSE_MICROSOFT_ROCKETBOX.md",
}
for src, dst in avatar_moves.items():
    move(src, dst)
remove("public/avatars/realistic")
remove("public/avatars/occupation")

# Backgrounds are few enough to keep directly under public/.
background_moves = {
    "public/backgrounds/ai-stage.png": "public/background-ai-stage.png",
    "public/backgrounds/ai-stage-thumb.jpg": "public/background-ai-stage-thumb.jpg",
    "public/backgrounds/neon-city.png": "public/background-neon-city.png",
    "public/backgrounds/neon-city-thumb.jpg": "public/background-neon-city-thumb.jpg",
    "public/backgrounds/busan-future.png": "public/background-busan-future.png",
    "public/backgrounds/busan-future-thumb.jpg": "public/background-busan-future-thumb.jpg",
}
for src, dst in background_moves.items():
    move(src, dst)
remove("public/backgrounds")

# Update imports and asset references everywhere.
replacements = {
    '@/components/AvatarStudio': '@/AvatarStudio',
    '@/lib/avatar/expressions': '@/core/face-expressions',
    '@/lib/avatar/rig': '@/core/avatar-rig',
    '@/lib/avatar/solver': '@/core/motion-solver',
    '@/lib/avatar/vrm': '@/core/vrm-loader',
    '@/lib/scene/viewer': '@/core/scene-viewer',
    '@/lib/store': '@/core/settings',
    '@/lib/tracking/landmarks': '@/core/tracking-landmarks',
    '@/lib/tracking/overlay': '@/core/tracking-overlay',
    '@/lib/tracking/smoothing': '@/core/tracking-smoothing',
    '@/lib/tracking/tracker': '@/core/tracking-engine',
    '@/lib/types': '@/core/types',
    '../src/lib/avatar/mannequin': './test-mannequin',
    '../src/lib/avatar/solver': '../src/core/motion-solver',
    '../src/lib/tracking/landmarks': '../src/core/tracking-landmarks',
    '../src/lib/types': '../src/core/types',
    '/avatars/realistic/male-casual.vrm': '/avatars/valid-male-casual.vrm',
    '/avatars/realistic/female-casual.vrm': '/avatars/valid-female-casual.vrm',
    '/avatars/realistic/male-business.vrm': '/avatars/valid-male-business.vrm',
    '/avatars/realistic/female-business.vrm': '/avatars/valid-female-business.vrm',
    '/avatars/realistic/male-medical.vrm': '/avatars/valid-male-medical.vrm',
    '/avatars/realistic/female-medical.vrm': '/avatars/valid-female-medical.vrm',
    '/avatars/realistic/male-utility.vrm': '/avatars/valid-male-utility.vrm',
    '/avatars/realistic/female-utility.vrm': '/avatars/valid-female-utility.vrm',
    '/avatars/occupation/male-student.vrm': '/avatars/rocketbox-male-student-casual.vrm',
    '/avatars/occupation/female-student.vrm': '/avatars/rocketbox-female-student-casual.vrm',
    '/avatars/occupation/male-astronaut.vrm': '/avatars/rocketbox-male-astronaut-pilot.vrm',
    '/avatars/occupation/female-astronaut.vrm': '/avatars/rocketbox-female-astronaut-pilot.vrm',
    '/avatars/occupation/male-firefighter.vrm': '/avatars/rocketbox-male-firefighter.vrm',
    '/avatars/occupation/female-firefighter.vrm': '/avatars/rocketbox-female-firefighter.vrm',
    '/avatars/occupation/female-chef.vrm': '/avatars/rocketbox-female-chef.vrm',
    '/backgrounds/ai-stage.png': '/background-ai-stage.png',
    '/backgrounds/ai-stage-thumb.jpg': '/background-ai-stage-thumb.jpg',
    '/backgrounds/neon-city.png': '/background-neon-city.png',
    '/backgrounds/neon-city-thumb.jpg': '/background-neon-city-thumb.jpg',
    '/backgrounds/busan-future.png': '/background-busan-future.png',
    '/backgrounds/busan-future-thumb.jpg': '/background-busan-future-thumb.jpg',
}

text_suffixes = {'.ts', '.tsx', '.mts', '.mjs', '.js', '.json', '.md', '.yml', '.yaml'}
for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix not in text_suffixes:
        continue
    if path.name == 'simplify-repository.py':
        continue
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue
    updated = text
    for old, new in replacements.items():
        updated = updated.replace(old, new)
    if updated != text:
        path.write_text(updated)

# Mannequin is only a headless test helper now; remove it from runtime settings.
settings = ROOT / 'src/core/settings.ts'
text = settings.read_text()
text = text.replace('import { DEFAULT_MANNEQUIN, type MannequinOptions } from "@/core/avatar/mannequin";\n', '')
text = text.replace('  mannequin: MannequinOptions;\n', '')
text = text.replace('  mannequin: DEFAULT_MANNEQUIN,\n', '')
settings.write_text(text)

# Update the test helper's generic rig import after moving it out of src/.
test_mannequin = ROOT / 'scripts/test-mannequin.ts'
text = test_mannequin.read_text()
text = text.replace('@/lib/avatar/rig', '@/core/avatar-rig')
text = text.replace('@/lib/types', '@/core/types')
test_mannequin.write_text(text)

# All built-in avatars now live in one folder, so simplify the fixed-texture check.
studio = ROOT / 'src/AvatarStudio.tsx'
text = studio.read_text()
text = text.replace(
    's.vrmUrl?.startsWith("/avatars/realistic/") ||\n    s.vrmUrl?.startsWith("/avatars/occupation/")',
    's.vrmUrl?.startsWith("/avatars/")',
)
text = text.replace(
    's.vrmUrl?.startsWith("/avatars/realistic/") ||\n    s.vrmUrl?.startsWith("/avatars/occupation/")',
    's.vrmUrl?.startsWith("/avatars/")',
)
# Remove catalog metadata that was collected but never read by the UI/runtime.
text = text.replace('  faceExpressions: boolean;\n', '')
text = re.sub(r', faceExpressions: (?:true|false)', '', text)
text = text.replace('      faceExpressions: variant.faceExpressions,\n', '')
studio.write_text(text)

# Replace the asset validator with a smaller validator for the flattened layout.
validator = ROOT / 'scripts/validate-avatar-assets.mjs'
validator.write_text(r'''#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredBones = new Set([
  "hips", "spine", "chest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot",
  "rightUpperLeg", "rightLowerLeg", "rightFoot",
]);

function readVrm(file) {
  const data = fs.readFileSync(file);
  if (data.toString("ascii", 0, 4) !== "glTF") throw new Error(`${file}: not a binary glTF/VRM file`);
  if (data.readUInt32LE(4) !== 2) throw new Error(`${file}: expected glTF 2.0`);
  const jsonLength = data.readUInt32LE(12);
  if (data.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${file}: first chunk is not JSON`);
  return {
    data,
    json: JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8").trimEnd()),
  };
}

function humanoidBoneNames(json, relative) {
  const vrm1 = json.extensions?.VRMC_vrm;
  if (vrm1) return { version: "1.0", names: new Set(Object.keys(vrm1.humanoid?.humanBones ?? {})) };
  const vrm0 = json.extensions?.VRM;
  if (vrm0) {
    return {
      version: "0.x",
      names: new Set((vrm0.humanoid?.humanBones ?? []).map((entry) => entry?.bone).filter(Boolean)),
    };
  }
  throw new Error(`${relative}: missing VRMC_vrm/VRM extension`);
}

function validateHumanoid(url, requireMorphs) {
  const file = path.join(root, "public", url.replace(/^\//, ""));
  if (!fs.existsSync(file)) throw new Error(`${url}: missing file`);
  const { data, json } = readVrm(file);
  const humanoid = humanoidBoneNames(json, url);
  const missing = [...requiredBones].filter((bone) => !humanoid.names.has(bone));
  if (missing.length) throw new Error(`${url}: missing humanoid bones: ${missing.join(", ")}`);
  if (!json.skins?.length) throw new Error(`${url}: no skin`);
  if (!json.materials?.length) throw new Error(`${url}: no materials`);
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  if (!primitives.length) throw new Error(`${url}: no mesh primitives`);
  if (!primitives.some((p) => p.attributes?.JOINTS_0 !== undefined && p.attributes?.WEIGHTS_0 !== undefined)) {
    throw new Error(`${url}: no JOINTS_0/WEIGHTS_0`);
  }
  const morphCount = primitives.reduce((sum, p) => sum + (p.targets?.length ?? 0), 0);
  if (requireMorphs && morphCount === 0) throw new Error(`${url}: expected facial morph targets but found none`);
  console.log(`OK ${url} (VRM ${humanoid.version}, ${(data.length / 1024 / 1024).toFixed(2)} MB, morphTargets=${morphCount})`);
}

const source = fs.readFileSync(path.join(root, "src/AvatarStudio.tsx"), "utf8");
const urls = [...new Set([...source.matchAll(/\/avatars\/[a-z-]+\.vrm/g)].map((m) => m[0]))];
if (urls.length < 10) throw new Error(`Expected catalog VRM references, found only ${urls.length}`);

for (const line of source.split(/\r?\n/)) {
  if (!line.includes('url: "/avatars/')) continue;
  if (line.includes('source: "valid"') && !line.includes('/avatars/valid-')) {
    throw new Error(`VALID source mismatch: ${line.trim()}`);
  }
  if (line.includes('source: "rocketbox"') && !line.includes('/avatars/rocketbox-')) {
    throw new Error(`Rocketbox source mismatch: ${line.trim()}`);
  }
}

for (const url of urls) validateHumanoid(url, url.startsWith("/avatars/valid-"));

for (const license of [
  "public/avatars/LICENSE_GOOGLE_VALID.md",
  "public/avatars/LICENSE_MICROSOFT_ROCKETBOX.md",
]) {
  if (!fs.existsSync(path.join(root, license))) throw new Error(`Missing license file: ${license}`);
}

console.log(`Validated ${urls.length} catalog VRM references.`);
''')

# Package scripts follow the renamed maintenance files.
package_file = ROOT / 'package.json'
package = json.loads(package_file.read_text())
package['name'] = 'ai-korea-avatar-studio'
package['scripts']['check:rig'] = 'node --import tsx scripts/test-tracking-rig.mts'
package['scripts']['check:assets'] = 'node scripts/validate-avatar-assets.mjs'
package['scripts']['postinstall'] = 'node scripts/prepare-mediapipe-wasm.mjs'
package_file.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

# Keep package-lock project metadata aligned without regenerating dependencies.
lock_file = ROOT / 'package-lock.json'
lock = json.loads(lock_file.read_text())
lock['name'] = 'ai-korea-avatar-studio'
lock['packages']['']['name'] = 'ai-korea-avatar-studio'
lock_file.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n')

# README becomes the one place to understand the simplified repository layout.
(ROOT / 'README.md').write_text('''# AI Korea Avatar Studio

웹캠으로 전신과 손을 추적하고 현실형 VRM 아바타에 실시간으로 적용하는 전시용 웹 앱입니다.
카메라 영상과 추적 데이터는 브라우저 안에서 처리됩니다.

## 실행

```bash
npm install
npm run dev
```

카메라는 `localhost` 또는 HTTPS 환경에서 사용할 수 있습니다.

## 단순화된 파일 구조

```text
.github/workflows/ci.yml       # GitHub 자동 검사
.openai/hosting.json           # 배포 설정
public/
  avatars/                     # 모든 내장 VRM + 라이선스 파일
  background-*.png/jpg         # 전시 배경 이미지
scripts/
  prepare-mediapipe-wasm.mjs   # MediaPipe WASM 준비
  test-tracking-rig.mts        # 전신/손목 회귀 테스트
  test-mannequin.ts            # 테스트 전용 단순 리그
  validate-avatar-assets.mjs   # VRM 구조/라이선스 검사
src/
  AvatarStudio.tsx             # 화면 UI + 카메라/촬영 제어
  app/                         # Next.js 페이지 라우트
  core/                        # 추적·VRM·렌더링 핵심 코드
```

`src/core`는 기능별로 다시 여러 폴더를 만들지 않고 한 폴더에 모았습니다. 파일 이름 앞부분만 보면 역할을 알 수 있습니다.

- `tracking-*`: MediaPipe 추적 관련
- `avatar-*`, `motion-solver.ts`, `face-expressions.ts`: 아바타 리그/움직임
- `vrm-loader.ts`: VRM 로딩
- `scene-viewer.ts`: Three.js 화면 렌더링
- `settings.ts`: 스튜디오 설정 상태
- `types.ts`: 공용 타입

## 아바타 파일 이름 규칙

모든 VRM은 `public/avatars` 한 곳에 있습니다.

- `valid-성별-복장.vrm`: Google VALID / TLTMedia 기반, CC BY 4.0
- `rocketbox-성별-용도.vrm`: Microsoft Rocketbox 기반, MIT

상세 출처와 라이선스는 다음 두 파일에 보존되어 있습니다.

- `public/avatars/LICENSE_GOOGLE_VALID.md`
- `public/avatars/LICENSE_MICROSOFT_ROCKETBOX.md`

## 검사

```bash
npm run check:rig
npm run check:assets
npm run lint
npm run build
```

GitHub의 `Avatar Studio CI`도 위 검사를 자동으로 실행합니다.
''')

# Make stale old paths impossible to accidentally keep after this migration.
for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix not in text_suffixes or path.name == 'simplify-repository.py':
        continue
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue
    forbidden = ['@/lib/', '@/components/', '/avatars/realistic/', '/avatars/occupation/', '/backgrounds/']
    bad = [token for token in forbidden if token in text]
    if bad:
        raise SystemExit(f"Stale references in {path.relative_to(ROOT)}: {bad}")

print('Repository structure simplified successfully.')
