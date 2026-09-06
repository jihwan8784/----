# VRM 아바타 캡처 스튜디오

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
