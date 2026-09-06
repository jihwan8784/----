#!/usr/bin/env python3
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


def replace_all(path: Path, replacements: dict[str, str]) -> None:
    text = path.read_text()
    for old, new in replacements.items():
        text = text.replace(old, new)
    path.write_text(text)


# 1) Remove files that are not referenced by the current app.
run(
    "git",
    "rm",
    "CLAUDE.md",
    "scripts/convert-project-glb-to-vrm.mjs",
    "scripts/fetch-assets.sh",
    "public/file.svg",
    "public/globe.svg",
    "public/next.svg",
    "public/vercel.svg",
    "public/window.svg",
)

# 2) Rename active files so their purpose/source is obvious.
for old, new in [
    ("scripts/copy-wasm.mjs", "scripts/prepare-mediapipe-wasm.mjs"),
    ("scripts/rig-check.mts", "scripts/test-avatar-tracking.mts"),
    ("scripts/validate-vrm-assets.mjs", "scripts/validate-avatar-files.mjs"),
    ("src/lib/store.ts", "src/lib/studio-settings-store.ts"),
    ("src/lib/types.ts", "src/lib/tracking-types.ts"),
    ("src/lib/scene/viewer.ts", "src/lib/scene/avatar-scene-viewer.ts"),
    ("src/lib/avatar/vrm.ts", "src/lib/avatar/vrm-loader.ts"),
    ("public/avatars/realistic", "public/avatars/google-valid"),
    (
        "public/avatars/google-valid/NOTICE.md",
        "public/avatars/google-valid/LICENSE_AND_SOURCE.md",
    ),
    ("public/avatars/occupation", "public/avatars/microsoft-rocketbox"),
    (
        "public/avatars/microsoft-rocketbox/NOTICE.md",
        "public/avatars/microsoft-rocketbox/LICENSE_AND_SOURCE.md",
    ),
    (
        "public/avatars/microsoft-rocketbox/male-student.vrm",
        "public/avatars/microsoft-rocketbox/male-casual-student.vrm",
    ),
    (
        "public/avatars/microsoft-rocketbox/female-student.vrm",
        "public/avatars/microsoft-rocketbox/female-casual-student.vrm",
    ),
    (
        "public/avatars/microsoft-rocketbox/male-astronaut.vrm",
        "public/avatars/microsoft-rocketbox/male-pilot-for-astronaut.vrm",
    ),
    (
        "public/avatars/microsoft-rocketbox/female-astronaut.vrm",
        "public/avatars/microsoft-rocketbox/female-pilot-for-astronaut.vrm",
    ),
]:
    run("git", "mv", old, new)

# 3) Update source imports and public asset paths after the renames.
replacements = {
    '"@/lib/avatar/vrm"': '"@/lib/avatar/vrm-loader"',
    '"@/lib/scene/viewer"': '"@/lib/scene/avatar-scene-viewer"',
    '"@/lib/store"': '"@/lib/studio-settings-store"',
    '"@/lib/types"': '"@/lib/tracking-types"',
    '"../types"': '"../tracking-types"',
    '"../src/lib/types"': '"../src/lib/tracking-types"',
    "/avatars/realistic/": "/avatars/google-valid/",
    "/avatars/occupation/": "/avatars/microsoft-rocketbox/",
    "public/avatars/realistic": "public/avatars/google-valid",
    "public/avatars/occupation": "public/avatars/microsoft-rocketbox",
    "male-student.vrm": "male-casual-student.vrm",
    "female-student.vrm": "female-casual-student.vrm",
    "male-astronaut.vrm": "male-pilot-for-astronaut.vrm",
    "female-astronaut.vrm": "female-pilot-for-astronaut.vrm",
    "(?:realistic|occupation)": "(?:google-valid|microsoft-rocketbox)",
}

for folder in [ROOT / "src", ROOT / "scripts"]:
    for path in folder.rglob("*"):
        if path == Path(__file__).resolve():
            continue
        if path.is_file() and path.suffix in {".ts", ".tsx", ".mts", ".mjs"}:
            replace_all(path, replacements)

# 4) Remove obsolete app state. Full-body + hands + VRM are fixed behavior now.
store_path = ROOT / "src/lib/studio-settings-store.ts"
store_path.write_text(
    '''"use client";

import { create } from "zustand";

import type {
  BackgroundKind,
  CameraPreset,
} from "@/lib/scene/avatar-scene-viewer";

export interface Settings {
  mirror: boolean;

  vrmUrl: string | null;
  vrmName: string | null;
  skinColor: string;
  hairColor: string;
  outfitColor: string;
  accentColor: string;

  smoothing: number;
  followBody: number;
  headGain: number;
  expressionGain: number;

  background: BackgroundKind;
  backgroundUrl: string | null;
  chroma: string;
  cameraPreset: CameraPreset;

  showSkeleton: boolean;
  showCamera: boolean;
}

interface Store extends Settings {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  patch(next: Partial<Settings>): void;
}

const initial: Settings = {
  mirror: true,

  vrmUrl: "/avatars/microsoft-rocketbox/male-casual-student.vrm",
  vrmName: "남성형 학생 · Rocketbox 현실형 일상복",
  skinColor: "#efc29f",
  hairColor: "#2a211f",
  outfitColor: "#334f82",
  accentColor: "#37f2dc",

  smoothing: 0.45,
  followBody: 0.5,
  headGain: 1.15,
  expressionGain: 1.15,

  background: "gradient",
  backgroundUrl: null,
  chroma: "#00b140",
  cameraPreset: "full",

  showSkeleton: false,
  showCamera: true,
};

export const useSettings = create<Store>((set) => ({
  ...initial,
  set: (key, value) => set({ [key]: value } as Partial<Settings>),
  patch: (next) => set(next),
}));
'''
)

types_path = ROOT / "src/lib/tracking-types.ts"
types = types_path.read_text().replace(
    'export type AvatarKind = "mannequin" | "vrm";\n', ""
)
types_path.write_text(types)

avatar_path = ROOT / "src/components/AvatarStudio.tsx"
avatar = avatar_path.read_text()
avatar = avatar.replace("  faceExpressions: boolean;\n", "")
avatar = avatar.replace(
    '  accent: string;\n  model: "mapped" | null;\n  match: JobMatch;\n  note: string;\n',
    "  accent: string;\n  note: string;\n",
)
avatar = avatar.replace(', model: "mapped", match: "closest"', "")
avatar = avatar.replace(', model: "mapped", match: "direct"', "")
avatar = avatar.replace(', faceExpressions: true', "")
avatar = avatar.replace(', faceExpressions: false', "")
avatar = avatar.replace("      faceExpressions: variant.faceExpressions,\n", "")

old_job_buttons = '''            {PROJECT_JOBS.map((job) => {
              const unavailable = job.model === null;
              return (
                <button
                  key={job.value}
                  type="button"
                  disabled={engine.avatarLoading || unavailable}
                  title={job.note}
                  onClick={() =>
                    selectProjectAvatar(selectedProfile.gender, job.value, true)
                  }
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition disabled:cursor-not-allowed ${
                    unavailable
                      ? "border-white/5 bg-white/[0.02] text-white/25"
                      : selectedProfile.job === job.value
                        ? "border-white/40 bg-white text-black"
                        : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {job.label}
                  {unavailable ? <span className="ml-1 text-[9px]">준비 중</span> : null}
                </button>
              );
            })}'''
new_job_buttons = '''            {PROJECT_JOBS.map((job) => (
              <button
                key={job.value}
                type="button"
                disabled={engine.avatarLoading}
                title={job.note}
                onClick={() =>
                  selectProjectAvatar(selectedProfile.gender, job.value, true)
                }
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition disabled:cursor-wait disabled:opacity-55 ${
                  selectedProfile.job === job.value
                    ? "border-white/40 bg-white text-black"
                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {job.label}
              </button>
            ))}'''
if old_job_buttons not in avatar:
    raise SystemExit("Could not find obsolete unavailable-job UI block")
avatar = avatar.replace(old_job_buttons, new_job_buttons)

avatar = avatar.replace(
    'if (settings.avatarKind === "vrm" && settings.vrmUrl) {',
    "if (settings.vrmUrl) {",
)
avatar = avatar.replace(
    "[ready, settings.avatarKind, settings.vrmUrl, settings.vrmName]",
    "[ready, settings.vrmUrl, settings.vrmName]",
)
avatar = avatar.replace(
    'if (s.avatarKind === "vrm" && s.vrmUrl && !s.vrmUrl.startsWith("blob:")) {',
    'if (s.vrmUrl && !s.vrmUrl.startsWith("blob:")) {',
)
avatar = re.sub(
    r'^\s*avatarKind: "vrm"(?: as const)?,\n',
    "",
    avatar,
    flags=re.MULTILINE,
)
avatar = avatar.replace(
    '''    useSettings.getState().patch({
      mode: "full",
      mirror: params.get("mirror") !== "0",
      hands: true,
      cameraPreset: "full",''',
    '''    useSettings.getState().patch({
      mirror: params.get("mirror") !== "0",
      cameraPreset: "full",''',
)
avatar_path.write_text(avatar)

if "avatarKind" in avatar:
    raise SystemExit("avatarKind dead state still remains")
if "job.model" in avatar or 'model: "mapped"' in avatar:
    raise SystemExit("obsolete job availability state still remains")
if "faceExpressions" in avatar:
    raise SystemExit("unused faceExpressions field still remains")

# 5) Update validation script for the new source-based directory names.
validator_path = ROOT / "scripts/validate-avatar-files.mjs"
validator = validator_path.read_text()
validator = validator.replace(
    "public/avatars/google-valid/NOTICE.md",
    "public/avatars/google-valid/LICENSE_AND_SOURCE.md",
)
validator = validator.replace(
    "public/avatars/microsoft-rocketbox/NOTICE.md",
    "public/avatars/microsoft-rocketbox/LICENSE_AND_SOURCE.md",
)
validator = validator.replace("const requiredOccupation = [", "const requiredRocketbox = [")
validator = validator.replace(
    "for (const name of requiredOccupation) {",
    "for (const name of requiredRocketbox) {",
)
validator_path.write_text(validator)

# 6) Give npm scripts names that describe what they actually check.
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text())
scripts = package["scripts"]
scripts.pop("check:rig", None)
scripts.pop("check:assets", None)
scripts["check:tracking"] = "node --import tsx scripts/test-avatar-tracking.mts"
scripts["check:avatars"] = "node scripts/validate-avatar-files.mjs"
scripts["postinstall"] = "node scripts/prepare-mediapipe-wasm.mjs"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n")

ci_path = ROOT / ".github/workflows/ci.yml"
ci = ci_path.read_text()
ci = ci.replace("      - main\n", "      - main\n      - repository-cleanup-20260907\n")
ci = ci.replace(
    "Check tracking rig and wrist regression",
    "Test full-body tracking and wrist regression",
)
ci = ci.replace("npm run check:rig", "npm run check:tracking")
ci = ci.replace("Validate bundled VRM assets", "Validate built-in avatar files")
ci = ci.replace("npm run check:assets", "npm run check:avatars")
ci_path.write_text(ci)

# 7) Replace the outdated README with a file map that is useful during maintenance.
(ROOT / "README.md").write_text(
    '''# VRM 아바타 캡처 스튜디오

웹캠으로 사람의 전신·손을 추적하고 현실형 VRM 아바타를 실시간으로 움직이는 Next.js 웹 앱입니다.
카메라 프레임과 추적 데이터는 브라우저 안에서 처리됩니다.

## 실행

```bash
npm install
npm run dev
```

카메라는 `localhost` 또는 HTTPS에서 사용할 수 있습니다.

## 주요 기능

- MediaPipe 전신 추적 + 손 추적 항상 사용
- VRM 0.x / 1.0 로딩
- 남성형·여성형과 9개 직업 선택
- Google VALID / TLTMedia 현실형 VRM
- Microsoft Rocketbox 직업형 VRM
- 사용자 `.vrm` 파일 불러오기
- 배경 선택, 사진 촬영, WebM 녹화, OBS용 `/embed` 화면

## 파일 구조

```text
src/components/AvatarStudio.tsx              메인 화면·카메라·촬영 UI
src/lib/studio-settings-store.ts             화면과 아바타 설정 상태
src/lib/tracking-types.ts                    추적 데이터 타입
src/lib/tracking/                            MediaPipe 추적 처리
src/lib/avatar/vrm-loader.ts                 VRM 파일 로딩
src/lib/avatar/                              리그·포즈·표정 처리
src/lib/scene/avatar-scene-viewer.ts         Three.js 렌더링 화면

public/avatars/google-valid/                 Google VALID 기반 현실형 VRM
public/avatars/microsoft-rocketbox/          Microsoft Rocketbox 기반 직업형 VRM
public/backgrounds/                          선택 가능한 배경 이미지

scripts/prepare-mediapipe-wasm.mjs           MediaPipe WASM 준비
scripts/test-avatar-tracking.mts             전신·손목 추적 회귀 테스트
scripts/validate-avatar-files.mjs            내장 VRM 구조·라이선스 검사
```

Next.js가 요구하는 `src/app/page.tsx`, `layout.tsx`, `globals.css` 같은 표준 파일 이름은 그대로 유지합니다.

## 검사

```bash
npm run check:tracking
npm run check:avatars
npm run lint
npm run build
```

GitHub Actions의 `.github/workflows/ci.yml`도 같은 검사를 실행합니다.

## 내장 VRM 출처

자세한 출처와 라이선스는 각 폴더의 `LICENSE_AND_SOURCE.md`를 확인합니다.

- `public/avatars/google-valid/`: Google VALID + TLTMedia, CC BY 4.0
- `public/avatars/microsoft-rocketbox/`: Microsoft Rocketbox, MIT

직업 선택에서 정확한 전용 모델이 없는 경우 UI에 가장 가까운 현실형 대체 복장임을 표시합니다.
'''
)

(ROOT / "public/avatars/README.md").write_text(
    '''# 내장 아바타 파일 안내

파일 이름은 성별과 실제 복장/용도를 바로 알 수 있게 정리했습니다.

## `google-valid/`

Google VALID 기반 현실형 아바타입니다.

- `male-casual.vrm`, `female-casual.vrm`: 일반 캐주얼 복장
- `male-business.vrm`, `female-business.vrm`: 비즈니스 복장
- `male-medical.vrm`, `female-medical.vrm`: 의료 복장
- `male-utility.vrm`, `female-utility.vrm`: 일반 작업복
- `LICENSE_AND_SOURCE.md`: 출처와 CC BY 4.0 안내

## `microsoft-rocketbox/`

Microsoft Rocketbox 기반 직업형/대체 아바타입니다.

- `male-casual-student.vrm`, `female-casual-student.vrm`: 학생 선택용 현실형 일상복
- `male-pilot-for-astronaut.vrm`, `female-pilot-for-astronaut.vrm`: 우주 비행사 선택에 사용하는 파일럿 기반 대체 모델
- `male-firefighter.vrm`, `female-firefighter.vrm`: 소방관 전용 복장
- `female-chef.vrm`: 여성 요리사 전용 복장
- `LICENSE_AND_SOURCE.md`: 출처와 MIT 라이선스 안내

새 파일을 추가할 때는 역할을 과장하지 말고 실제 모델의 복장/용도가 드러나는 이름을 사용합니다.
'''
)

# 8) Fail early if stale names survived the cleanup.
for path in [ROOT / "src", ROOT / "scripts", ROOT / "README.md", ROOT / "public/avatars/README.md"]:
    files = [path] if path.is_file() else [p for p in path.rglob("*") if p.is_file()]
    for file in files:
        if file == Path(__file__).resolve():
            continue
        if file.suffix not in {".ts", ".tsx", ".mts", ".mjs", ".md", ".json"}:
            continue
        text = file.read_text(errors="ignore")
        for stale in [
            "avatars/realistic",
            "avatars/occupation",
            "convert-project-glb-to-vrm",
            "fetch-assets.sh",
            "rig-check.mts",
            "validate-vrm-assets.mjs",
            "copy-wasm.mjs",
            '"@/lib/store"',
            '"@/lib/types"',
            '"@/lib/scene/viewer"',
            '"@/lib/avatar/vrm"',
        ]:
            if stale in text:
                raise SystemExit(f"Stale name {stale!r} remains in {file.relative_to(ROOT)}")

print("Repository cleanup transformations completed.")
