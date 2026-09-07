# AI Korea Avatar Studio

웹캠으로 전신과 손을 추적하고 현실형 VRM 아바타에 실시간으로 적용하는 전시용 웹 앱입니다.

## 실행

```bash
npm install
npm run dev
```

카메라는 `localhost` 또는 HTTPS에서 사용할 수 있습니다.

## 파일 구조

```text
src/
  AvatarStudio.tsx       # 메인 스튜디오 UI/카메라/촬영
  app/                   # Next.js 페이지와 /embed 라우트
  core/                  # 추적, VRM, 렌더링 핵심 코드
public/
  avatars/               # 모든 VRM과 라이선스
  background-*.png/jpg   # 전시 배경
scripts/
  prepare-mediapipe-wasm.mjs
  test-avatar-tracking.mts
  test-mannequin.ts
  validate-avatar-files.mjs
```

`src/core`는 하위 폴더를 다시 만들지 않고 한 곳에 모았습니다. 파일 이름으로 역할을 바로 알 수 있습니다.

- `tracking-*`: MediaPipe 추적
- `avatar-rig.ts`, `motion-solver.ts`: 아바타 뼈/움직임
- `face-expressions.ts`: 얼굴 표정
- `vrm-loader.ts`: VRM 로딩
- `scene-viewer.ts`: Three.js 렌더링
- `settings.ts`: 스튜디오 설정
- `types.ts`: 공용 타입

## 검사

```bash
npm run check:tracking
npm run check:avatars
npm run lint
npm run build
```

GitHub Actions의 `Avatar Studio CI`도 같은 검사를 자동 실행합니다.
