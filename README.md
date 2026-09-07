# AI Korea Avatar Studio

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
