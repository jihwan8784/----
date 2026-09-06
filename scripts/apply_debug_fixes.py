#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Tracker: guard camera-frame races, filter MediaPipe info noise, reject false
# hand detections, and require stable hands before publishing finger landmarks.
# ---------------------------------------------------------------------------
tracker_path = Path("src/lib/tracking/tracker.ts")
tracker = tracker_path.read_text(encoding="utf-8")

tracker = replace_once(
    tracker,
    'const MAX_INFERENCE_INTERVAL_MS = 100;\n',
    '''const MAX_INFERENCE_INTERVAL_MS = 100;
const MIN_HAND_SCORE = 0.68;
const MIN_HAND_SIZE = 0.018;
const MAX_HAND_SIZE = 0.55;
const MAX_HAND_TO_POSE_WRIST_DISTANCE = 0.28;
const HAND_CONFIRM_FRAMES = 2;
const TFLITE_INFO_PATTERN = /Created TensorFlow Lite XNNPACK delegate for CPU/i;
''',
    "tracker constants",
)

tracker = replace_once(
    tracker,
    '''function point2d(l: NormalizedLandmark): Point2D {
  return {
    x: l.x,
    y: l.y,
    z: l.z ?? 0,
    visibility: l.visibility ?? 1,
  };
}

export interface TrackerCallbacks {''',
    '''function point2d(l: NormalizedLandmark): Point2D {
  return {
    x: l.x,
    y: l.y,
    z: l.z ?? 0,
    visibility: l.visibility ?? 1,
  };
}

function videoFrameReady(video: HTMLVideoElement): boolean {
  return (
    !video.paused &&
    !video.ended &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  );
}

function withMediaPipeInfoFilter<T>(run: () => T): T {
  const originalError = console.error;
  console.error = (...args: Parameters<typeof console.error>) => {
    const text = args.map((arg) => String(arg ?? "")).join(" ");
    if (TFLITE_INFO_PATTERN.test(text)) return;
    originalError(...args);
  };
  try {
    return run();
  } finally {
    console.error = originalError;
  }
}

function validHandCandidate(
  screen: NormalizedLandmark[],
  handedness: string,
  poseScreen: NormalizedLandmark[] | null,
): boolean {
  if (screen.length < 21) return false;
  for (const l of screen) {
    if (!Number.isFinite(l.x) || !Number.isFinite(l.y) || !Number.isFinite(l.z ?? 0)) {
      return false;
    }
    if (l.x < -0.15 || l.x > 1.15 || l.y < -0.15 || l.y > 1.15) return false;
  }

  const wrist = screen[0];
  const index = screen[5];
  const middle = screen[9];
  const pinky = screen[17];
  const palmWidth = Math.hypot(index.x - pinky.x, index.y - pinky.y);
  const palmLength = Math.hypot(middle.x - wrist.x, middle.y - wrist.y);
  if (
    palmWidth < MIN_HAND_SIZE ||
    palmLength < MIN_HAND_SIZE ||
    palmWidth > MAX_HAND_SIZE ||
    palmLength > MAX_HAND_SIZE
  ) {
    return false;
  }

  if (poseScreen) {
    const poseWrist = poseScreen[handedness === "Left" ? 15 : 16];
    if (poseWrist && (poseWrist.visibility ?? 1) >= 0.35) {
      const distance = Math.hypot(wrist.x - poseWrist.x, wrist.y - poseWrist.y);
      if (distance > MAX_HAND_TO_POSE_WRIST_DISTANCE) return false;
    }
  }

  return true;
}

export interface TrackerCallbacks {''',
    "tracker helpers",
)

tracker = replace_once(
    tracker,
    '''  private building: Promise<void> | null = null;
  private dirty = true;
''',
    '''  private building: Promise<void> | null = null;
  private dirty = true;
  private handStableFrames: Record<"left" | "right", number> = {
    left: 0,
    right: 0,
  };
''',
    "tracker hand stability state",
)

tracker = replace_once(
    tracker,
    '''  async start(video: HTMLVideoElement) {
    const wasRunning = this.running;
    this.video = video;
    this.running = true;
    this.lastVideoTime = -1;
    this.lastProcessAt = 0;
    this.frameTimes = [];
    await this.ensureModels();
    if (!wasRunning) this.loop();
  }
''',
    '''  async start(video: HTMLVideoElement) {
    const wasRunning = this.running;
    this.video = video;
    this.running = true;
    this.lastVideoTime = -1;
    this.lastProcessAt = 0;
    this.frameTimes = [];
    this.handStableFrames.left = 0;
    this.handStableFrames.right = 0;
    this.smoother.reset();
    await this.ensureModels();
    if (!wasRunning) this.loop();
  }
''',
    "tracker start reset",
)

tracker = replace_once(
    tracker,
    '''              runningMode: "VIDEO",
              numHands: 2,
            });''',
    '''              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.68,
              minHandPresenceConfidence: 0.68,
              minTrackingConfidence: 0.68,
            });''',
    "hand model confidence",
)

tracker = replace_once(
    tracker,
    '''    const video = this.video;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
''',
    '''    const video = this.video;
    if (!video || !videoFrameReady(video)) return;
''',
    "video readiness guard",
)

tracker = replace_once(
    tracker,
    '''    let hasPose = false;
    let overlayPose: Point2D[] | null = null;
    const rootOffset: Vec3 = { x: 0, y: 0, z: 0 };

    if (mode === "full" && this.pose) {
      const res = this.pose.detectForVideo(video, ts);
      const world = res.worldLandmarks?.[0];
      const screen = res.landmarks?.[0];
      if (world && screen) {
        hasPose = true;
        overlayPose = showOverlay ? screen.map(point2d) : null;
''',
    '''    let hasPose = false;
    let overlayPose: Point2D[] | null = null;
    let poseScreen: NormalizedLandmark[] | null = null;
    const rootOffset: Vec3 = { x: 0, y: 0, z: 0 };

    if (mode === "full" && this.pose) {
      const res = withMediaPipeInfoFilter(() => this.pose!.detectForVideo(video, ts));
      const world = res.worldLandmarks?.[0];
      const screen = res.landmarks?.[0];
      if (world && screen) {
        hasPose = true;
        poseScreen = screen;
        overlayPose = showOverlay ? screen.map(point2d) : null;
''',
    "pose detection guard",
)

tracker = replace_once(
    tracker,
    '''    if (this.face) {
      const res = this.face.detectForVideo(video, ts);
''',
    '''    if (this.face) {
      const res = withMediaPipeInfoFilter(() => this.face!.detectForVideo(video, ts));
''',
    "face info filter",
)

tracker = replace_once(
    tracker,
    '''    const hands: TrackFrame["hands"] = { left: null, right: null };
    const overlayHands: Point2D[][] = [];
    if (this.hand && mode === "full") {
      const res = this.hand.detectForVideo(video, ts);
      const worlds = res.worldLandmarks ?? [];
      for (let i = 0; i < worlds.length; i++) {
        const label = res.handedness?.[i]?.[0]?.categoryName;
        if (!label) continue;
        // MediaPipe reports handedness for the raw (unmirrored) image.
        const side = (label === "Left") === !mirror ? "left" : "right";
        hands[side] = worlds[i].map((l) => toAvatar(l, mirror));
        if (showOverlay && res.landmarks?.[i]) {
          overlayHands.push(res.landmarks[i].map(point2d));
        }
      }
    }
''',
    '''    const hands: TrackFrame["hands"] = { left: null, right: null };
    const overlayHands: Point2D[][] = [];
    const seenHand: Record<"left" | "right", boolean> = {
      left: false,
      right: false,
    };
    if (this.hand && mode === "full") {
      const res = withMediaPipeInfoFilter(() => this.hand!.detectForVideo(video, ts));
      const worlds = res.worldLandmarks ?? [];
      for (let i = 0; i < worlds.length; i++) {
        const handed = res.handedness?.[i]?.[0];
        const label = handed?.categoryName;
        const score = handed?.score ?? 0;
        const screen = res.landmarks?.[i];
        const world = worlds[i];
        if (
          !label ||
          score < MIN_HAND_SCORE ||
          !screen ||
          !world ||
          world.length < 21 ||
          !validHandCandidate(screen, label, poseScreen)
        ) {
          continue;
        }

        // MediaPipe reports handedness for the raw (unmirrored) image.
        const side: "left" | "right" =
          (label === "Left") === !mirror ? "left" : "right";
        seenHand[side] = true;
        this.handStableFrames[side] = Math.min(
          HAND_CONFIRM_FRAMES,
          this.handStableFrames[side] + 1,
        );
        if (this.handStableFrames[side] < HAND_CONFIRM_FRAMES) continue;

        hands[side] = world.map((l) => toAvatar(l, mirror));
        if (showOverlay) overlayHands.push(screen.map(point2d));
      }
    }
    for (const side of ["left", "right"] as const) {
      if (!seenHand[side]) this.handStableFrames[side] = 0;
    }
''',
    "hand candidate filtering",
)

tracker_path.write_text(tracker, encoding="utf-8")


# ---------------------------------------------------------------------------
# Solver: when no real hand landmarks are present, keep authored wrist/finger
# pose instead of steering the hand using noisy pose-index points. Also avoid
# palm-normal 180-degree flips on intermittent hand detections.
# ---------------------------------------------------------------------------
solver_path = Path("src/lib/avatar/solver.ts")
solver = solver_path.read_text(encoding="utf-8")

solver = replace_once(
    solver,
    '''      } else {
        // No finger data — point the wrist along the forearm and relax fingers.
        const wrist = usable ? j[`${side}Wrist` as JointName] : undefined;
        const index = usable ? j[`${side}Index` as JointName] : undefined;
        if (wrist && index) {
          const dir = V(index).sub(V(wrist));
          if (dir.lengthSq() > 1e-8) this.aimBone(handBone, dir.normalize(), alpha);
        } else if (ATTENTION_DIRECTIONS[handBone]) {
          this.aimBone(
            handBone,
            new THREE.Vector3(...ATTENTION_DIRECTIONS[handBone]!),
            alpha,
          );
        } else {
          this.relax(handBone, alpha, 0.3);
        }
        this.relaxFingers(side, alpha);
      }
''',
    '''      } else {
        // No trustworthy finger data: return the wrist and fingers to the
        // avatar's authored neutral pose. PoseLandmark's index-finger points
        // are too noisy to use as a substitute hand orientation.
        this.relax(handBone, alpha, 0.55);
        this.relaxFingers(side, alpha);
      }
''',
    "solver missing-hand neutral pose",
)

old_hand_orientation = '''    // Palm-outward normal; the cross product flips sign between hands.
    const normal = indexKnuckle
      .clone()
      .sub(wrist)
      .cross(pinkyKnuckle.clone().sub(wrist))
      .multiplyScalar(side === "left" ? -1 : 1);

    if (normal.lengthSq() > 1e-8) {
      normal.normalize();
      const target = orthoBasis(axis, normal);
      // The rest pose: bone axis as authored, palm facing down.
      const restAxis = this.restDir.get(handBone)?.clone() ?? axis.clone();
      const restNormal = new THREE.Vector3(0, -1, 0);
      const rest = orthoBasis(restAxis, restNormal);
      if (target && rest) {
        const delta = target.clone().multiply(rest.clone().invert());
        const w = delta.multiply(this.restWorld.get(handBone)!);
        this.setWorldBasisRaw(handBone, w, alpha);
      }
    } else {
      this.aimBone(handBone, axis, alpha);
    }
'''
new_hand_orientation = '''    // Aim the wrist along the palm axis. A full palm-normal basis can flip by
    // 180 degrees when MediaPipe briefly swaps or jitters knuckles; keeping
    // wrist roll authored makes webcam tracking much more stable.
    this.aimBone(handBone, axis, alpha);
'''
solver = replace_once(solver, old_hand_orientation, new_hand_orientation, "solver wrist stability")

# indexKnuckle/pinkyKnuckle are no longer needed after removing palm-normal roll.
solver = replace_once(
    solver,
    '''    const middle = V(lm[9]);
    const indexKnuckle = V(lm[5]);
    const pinkyKnuckle = V(lm[17]);

    const axis = middle.clone().sub(wrist);
''',
    '''    const middle = V(lm[9]);

    const axis = middle.clone().sub(wrist);
''',
    "solver unused palm points",
)

solver = replace_once(
    solver,
    '''        this.relax(bone, alpha, 0.25);
''',
    '''        this.relax(bone, alpha, 0.55);
''',
    "finger recovery speed",
)

solver_path.write_text(solver, encoding="utf-8")


# ---------------------------------------------------------------------------
# VRM material matching: do not treat a generic monolithic `_Body` material as
# skin. Broaden useful names for genuinely separated clothing materials.
# ---------------------------------------------------------------------------
vrm_path = Path("src/lib/avatar/vrm.ts")
vrm = vrm_path.read_text(encoding="utf-8")
vrm = replace_once(
    vrm,
    '''const APPEARANCE_PATTERNS: [AppearanceSlot, RegExp][] = [
  ["hair", /hair|bang|ponytail|髪|眉|まつげ|eyebrow|eyelash/i],
  ["skin", /face|skin|body|arm|leg|hand|肌|顔/i],
  ["accent", /shoe|sock|tie|ribbon|button|accessory|metal|靴|リボン/i],
  ["outfit", /cloth|outfit|wear|shirt|top|bottom|pants|skirt|dress|coat|jacket|uniform|服|トップス|ボトム/i],
];''',
    '''const APPEARANCE_PATTERNS: [AppearanceSlot, RegExp][] = [
  ["hair", /hair|bang|ponytail|髪|眉|まつげ|eyebrow|eyelash/i],
  ["skin", /face|skin|arm|leg|hand|肌|顔/i],
  ["accent", /shoe|sneaker|sock|tie|ribbon|button|accessory|metal|trim|靴|リボン/i],
  ["outfit", /cloth|outfit|wear|shirt|tee|tshirt|hoodie|sweater|scrub|suit|top|bottom|pants|jeans|skirt|dress|coat|jacket|uniform|服|トップス|ボトム/i],
];''',
    "VRM appearance patterns",
)
vrm_path.write_text(vrm, encoding="utf-8")


# ---------------------------------------------------------------------------
# Camera switching and UI: wait for a real video frame before restarting
# MediaPipe, restore the old stream on failure, and do not present non-working
# color controls for the current monolithic VALID texture avatars.
# ---------------------------------------------------------------------------
studio_path = Path("src/components/AvatarStudio.tsx")
studio = studio_path.read_text(encoding="utf-8")

studio = replace_once(
    studio,
    '''export function useAvatarEngine({
  canvasRef,
  videoRef,
  onFrame,
  autoStart = false,
}: UseAvatarEngineArgs) {''',
    '''async function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 4000) {
  const ready = () =>
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0;
  if (ready()) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      window.clearTimeout(timer);
    };
    const onReady = () => {
      if (!ready() || settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("카메라 영상 준비 시간이 초과되었습니다."));
    }, timeoutMs);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
  });
}

export function useAvatarEngine({
  canvasRef,
  videoRef,
  onFrame,
  autoStart = false,
}: UseAvatarEngineArgs) {''',
    "video ready helper",
)

old_camera = '''  const startCamera = useCallback(
    async (id?: string) => {
      setError(null);
      const video = videoRef.current;
      if (!video) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("이 브라우저는 웹캠 접근을 지원하지 않습니다 (HTTPS 필요).");
        return;
      }
      const requestId = ++cameraRequestRef.current;
      const previousStream = streamRef.current;
      let nextStream: MediaStream | null = null;
      try {
        setStatus(previousStream ? "카메라 전환 중…" : "카메라 여는 중…");
        nextStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: id ? { exact: id } : undefined,
            width: { ideal: 640, max: 640 },
            height: { ideal: 480, max: 480 },
            frameRate: { ideal: 24, max: 24 },
          },
          audio: false,
        });
        if (requestId !== cameraRequestRef.current) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = nextStream;
        await video.play();
        streamRef.current = nextStream;
        setDeviceId(
          nextStream.getVideoTracks()[0]?.getSettings().deviceId ?? id ?? null,
        );
        await trackerRef.current?.start(video);
        previousStream?.getTracks().forEach((track) => track.stop());
        await refreshDevices();
        setRunning(true);
        setStatus("");
      } catch (e) {
        nextStream?.getTracks().forEach((track) => track.stop());
        if (previousStream) {
          streamRef.current = previousStream;
          video.srcObject = previousStream;
          await video.play().catch(() => undefined);
          setRunning(true);
        }
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "카메라 권한이 거부되었습니다. 브라우저 주소창의 카메라 아이콘에서 허용해 주세요."
            : name === "NotFoundError"
              ? "사용 가능한 카메라를 찾지 못했습니다."
              : e instanceof Error
                ? e.message
                : "카메라를 시작하지 못했습니다.",
        );
        setStatus("");
      }
    },
    [refreshDevices, videoRef],
  );
'''
new_camera = '''  const startCamera = useCallback(
    async (id?: string) => {
      setError(null);
      const video = videoRef.current;
      if (!video) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("이 브라우저는 웹캠 접근을 지원하지 않습니다 (HTTPS 필요).");
        return;
      }

      const requestId = ++cameraRequestRef.current;
      const previousStream = streamRef.current;
      const currentDevice = previousStream
        ?.getVideoTracks()[0]
        ?.getSettings().deviceId;
      if (id && previousStream?.active && currentDevice === id) return;

      let nextStream: MediaStream | null = null;
      let trackerPaused = false;
      try {
        setStatus(previousStream ? "카메라 전환 중…" : "카메라 여는 중…");
        nextStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: id ? { exact: id } : undefined,
            width: { ideal: 640, max: 640 },
            height: { ideal: 480, max: 480 },
            frameRate: { ideal: 24, max: 24 },
          },
          audio: false,
        });
        if (requestId !== cameraRequestRef.current) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        trackerRef.current?.stop();
        trackerPaused = true;
        setRunning(false);
        video.pause();
        video.srcObject = nextStream;
        await video.play();
        await waitForVideoReady(video);
        if (requestId !== cameraRequestRef.current) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = nextStream;
        setDeviceId(
          nextStream.getVideoTracks()[0]?.getSettings().deviceId ?? id ?? null,
        );
        await trackerRef.current?.start(video);
        previousStream?.getTracks().forEach((track) => track.stop());
        await refreshDevices();
        setRunning(true);
        setStatus("");
      } catch (e) {
        nextStream?.getTracks().forEach((track) => track.stop());

        if (previousStream?.active) {
          streamRef.current = previousStream;
          video.srcObject = previousStream;
          try {
            await video.play();
            await waitForVideoReady(video);
            if (trackerPaused) await trackerRef.current?.start(video);
            setDeviceId(
              previousStream.getVideoTracks()[0]?.getSettings().deviceId ?? null,
            );
            setRunning(true);
          } catch {
            streamRef.current = null;
            video.srcObject = null;
            setRunning(false);
          }
        } else {
          streamRef.current = null;
          video.srcObject = null;
          setRunning(false);
        }

        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "카메라 권한이 거부되었습니다. 브라우저 주소창의 카메라 아이콘에서 허용해 주세요."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "선택한 카메라를 열 수 없습니다. 다른 카메라를 선택해 주세요."
              : e instanceof Error
                ? e.message
                : "카메라를 시작하지 못했습니다.",
        );
        setStatus("");
      }
    },
    [refreshDevices, videoRef],
  );
'''
studio = replace_once(studio, old_camera, new_camera, "camera switching")

studio = replace_once(
    studio,
    '''    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setRunning(false);
''',
    '''    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setDeviceId(null);
    setRunning(false);
''',
    "stop camera device reset",
)

# Mark built-in VALID avatars as fixed-texture. Custom/external models keep the
# color controls and use the improved material-name matcher in vrm.ts.
studio = replace_once(
    studio,
    '''  const selectedProfile =
    HUMAN_VRM_PROFILES.find((profile) => profile.url === s.vrmUrl) ??
    HUMAN_VRM_PROFILES[0];
''',
    '''  const selectedProfile =
    HUMAN_VRM_PROFILES.find((profile) => profile.url === s.vrmUrl) ??
    HUMAN_VRM_PROFILES[0];
  const fixedTextureAvatar = Boolean(s.vrmUrl?.startsWith("/avatars/realistic/"));
''',
    "fixed texture flag",
)

old_colors = '''        <div>
          <p className="mb-1.5 text-[12px] text-white/80">피부 색</p>
          <div className="flex gap-1.5">
            {SKIN_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`피부 색 ${color}`}
                aria-pressed={s.skinColor === color}
                onClick={() => s.set("skinColor", color)}
                className={`h-7 flex-1 rounded-lg border-2 ${
                  s.skinColor === color ? "border-white" : "border-transparent"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
          <ColorField
            label="복장"
            value={s.outfitColor}
            onChange={(v) => s.set("outfitColor", v)}
          />
          <ColorField
            label="포인트"
            value={s.accentColor}
            onChange={(v) => s.set("accentColor", v)}
          />
        </div>
'''
new_colors = '''        {fixedTextureAvatar ? (
          <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-100/70">
            이 현실형 VRM은 몸·얼굴·복장이 하나의 통합 텍스처라 색상만 따로 바꿀 수 없습니다.
            색상 조절이 가능한 분리 재질 VRM을 선택하거나 내 VRM 파일을 사용할 때 색상 옵션이 나타납니다.
          </div>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-[12px] text-white/80">피부 색</p>
              <div className="flex gap-1.5">
                {SKIN_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`피부 색 ${color}`}
                    aria-pressed={s.skinColor === color}
                    onClick={() => s.set("skinColor", color)}
                    className={`h-7 flex-1 rounded-lg border-2 ${
                      s.skinColor === color ? "border-white" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
              <ColorField
                label="복장"
                value={s.outfitColor}
                onChange={(v) => s.set("outfitColor", v)}
              />
              <ColorField
                label="포인트"
                value={s.accentColor}
                onChange={(v) => s.set("accentColor", v)}
              />
            </div>
          </>
        )}
'''
studio = replace_once(studio, old_colors, new_colors, "appearance color UI")

studio_path.write_text(studio, encoding="utf-8")

print("Avatar Studio debugging fixes applied.")
