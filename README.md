# VRM 아바타 캡처 스튜디오

네 개의 아바타 프로젝트에서 실시간 추적, VRM 렌더링, 촬영 UI를 하나로 통합한 웹 앱입니다.

## 주요 기능

- MediaPipe 기반 전신·얼굴·손가락 추적
- VRM 0.x / 1.0 아바타만 지원
- 기본·남성·여성·개성 카테고리의 내장 VRM 10종 선택
- 로컬 `.vrm` 파일 업로드
- 다크·스튜디오·크로마키·투명 배경
- 촬영 버튼 클릭 후 3초 카운트다운
- 사진을 `YYYY-MM-DD_HH-mm-ss.png` 이름으로 자동 다운로드
- WebM 녹화와 OBS용 투명 배경 팝아웃
- 카메라 영상과 추적 데이터는 브라우저 안에서만 처리

## 실행

```bash
npm install
npm run dev
```

카메라는 localhost 또는 HTTPS 환경에서만 사용할 수 있습니다.

## 내장 아바타

Avatar A, B, C는 [VRoid 샘플 모델 이용 조건](https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z)을 따릅니다. 추가된 후미리야, 헤어 스타일 남성, 시노, 빅토리아, 비타, 비비, 다크니스 모델은 VRoid가 CC0로 공개한 샘플입니다.

## 통합 출처

- [vision20400/webcam-avatar-studio](https://github.com/vision20400/webcam-avatar-studio): VRM·MediaPipe 추적 엔진
- [LPRS1234/pose-persona-booth](https://github.com/LPRS1234/pose-persona-booth): 포토부스 촬영 흐름
- [jihwan8784/project](https://github.com/jihwan8784/project): 아바타 선택·합성 UI
- [jihwan8784/----](https://github.com/jihwan8784/----): 통합 대상 프로젝트
