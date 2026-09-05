"use client";

import { useSearchParams } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { loadVRMRig } from "@/lib/avatar/vrm";
import { AvatarViewer } from "@/lib/scene/viewer";
import type { BackgroundKind } from "@/lib/scene/viewer";
import { useSettings } from "@/lib/store";
import { drawOverlay } from "@/lib/tracking/overlay";
import { Tracker } from "@/lib/tracking/tracker";
import type { TrackFrame, TrackerStats } from "@/lib/types";

// Shared controls

export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <header className="mb-3">
        <h2 className="text-[13px] font-semibold tracking-tight text-white/90">
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-[11px] text-white/40">{hint}</p> : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 ${
        disabled ? "opacity-40" : "cursor-pointer"
      }`}
    >
      <span>
        <span className="block text-[12px] text-white/80">{label}</span>
        {hint ? (
          <span className="block text-[11px] text-white/35">{hint}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-indigo-500" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  full?: boolean;
}) {
  const styles = {
    default: "bg-white/[0.07] text-white/80 hover:bg-white/[0.12]",
    primary: "bg-indigo-500 text-white hover:bg-indigo-400",
    danger: "bg-rose-500/90 text-white hover:bg-rose-500",
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-3 py-2 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${
        full ? "w-full" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-white/80">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-12 cursor-pointer rounded-md border border-white/15 bg-transparent p-0.5"
      />
    </label>
  );
}

// Camera, tracking, rendering, and capture engine

export interface EngineHandles {
  viewer: AvatarViewer | null;
  frame: TrackFrame | null;
}

export interface UseAvatarEngineArgs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onFrame?: (frame: TrackFrame) => void;
  /** Start the camera as soon as the engine is ready (used by /embed). */
  autoStart?: boolean;
}

export function useAvatarEngine({
  canvasRef,
  videoRef,
  onFrame,
  autoStart = false,
}: UseAvatarEngineArgs) {
  const settings = useSettings();
  const viewerRef = useRef<AvatarViewer | null>(null);
  const trackerRef = useRef<Tracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [avatarLabel, setAvatarLabel] = useState("기본 아바타");
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const capturingRef = useRef(false);

  // --- viewer ---------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewer = new AvatarViewer(canvas);
    viewerRef.current = viewer;
    viewer.start();
    setReady(true);

    const parent = canvas.parentElement;
    const ro = new ResizeObserver(() => {
      const r = parent?.getBoundingClientRect();
      if (r) viewer.resize(r.width, r.height);
    });
    if (parent) {
      ro.observe(parent);
      const r = parent.getBoundingClientRect();
      viewer.resize(r.width, r.height);
    }

    return () => {
      ro.disconnect();
      viewer.dispose();
      viewerRef.current = null;
      setReady(false);
    };
  }, [canvasRef]);

  // --- tracker --------------------------------------------------------------
  useEffect(() => {
    const tracker = new Tracker(
      {
        mode: "full",
        quality: "lite",
        hands: true,
        mirror: useSettings.getState().mirror,
        showOverlay:
          useSettings.getState().showCamera &&
          useSettings.getState().showSkeleton,
      },
      {
        onFrame: (frame) => {
          viewerRef.current?.pushFrame(frame);
          onFrameRef.current?.(frame);
        },
        onStats: setStats,
        onStatus: setStatus,
        onError: setError,
      },
    );
    tracker.setSmoothing(useSettings.getState().smoothing);
    trackerRef.current = tracker;
    return () => {
      tracker.dispose();
      trackerRef.current = null;
    };
  }, []);

  // --- avatar ---------------------------------------------------------------
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    let cancelled = false;

    const build = async () => {
      if (settings.avatarKind === "vrm" && settings.vrmUrl) {
        setAvatarLoading(true);
        setStatus("아바타 불러오는 중…");
        try {
          const rig = await loadVRMRig(
            settings.vrmUrl,
            settings.vrmName ?? "VRM 아바타",
          );
          if (cancelled) {
            rig.dispose();
            return;
          }
          viewer.setRig(rig);
          const appearance = useSettings.getState();
          rig.setAppearance?.({
            skin: appearance.skinColor,
            hair: appearance.hairColor,
            outfit: appearance.outfitColor,
            accent: appearance.accentColor,
          });
          setAvatarLabel(rig.name);
          setError(null);
        } catch (e) {
          if (cancelled) return;
          setError(
            e instanceof Error ? e.message : "VRM 파일을 불러오지 못했습니다.",
          );
          useSettings.getState().patch({
            avatarKind: "vrm",
            vrmUrl: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Sakurada_Fumiriya.vrm",
            vrmName: "사람형 남성 · 짧은 머리",
          });
        } finally {
          if (!cancelled) {
            setAvatarLoading(false);
            setStatus("");
          }
        }
        return;
      }

      useSettings.getState().patch({
        avatarKind: "vrm",
        vrmUrl: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Sakurada_Fumiriya.vrm",
        vrmName: "사람형 남성 · 짧은 머리",
      });
    };

    void build();
    return () => {
      cancelled = true;
    };
  }, [ready, settings.avatarKind, settings.vrmUrl, settings.vrmName]);

  // --- settings -> engine ---------------------------------------------------
  useEffect(() => {
    trackerRef.current?.setOptions({
      mode: "full",
      quality: "lite",
      hands: true,
      mirror: settings.mirror,
      showOverlay: settings.showCamera && settings.showSkeleton,
    });
  }, [
    settings.mirror,
    settings.showCamera,
    settings.showSkeleton,
  ]);

  useEffect(() => {
    trackerRef.current?.setSmoothing(settings.smoothing);
    viewerRef.current?.setSolverSettings({
      smoothing: settings.smoothing,
      followBody: settings.followBody,
      headGain: settings.headGain,
      bodyEnabled: true,
      fingersEnabled: true,
    });
  }, [
    settings.smoothing,
    settings.followBody,
    settings.headGain,
    avatarLabel,
  ]);

  useEffect(() => {
    viewerRef.current?.currentRig?.setAppearance?.({
      skin: settings.skinColor,
      hair: settings.hairColor,
      outfit: settings.outfitColor,
      accent: settings.accentColor,
    });
  }, [
    avatarLabel,
    settings.skinColor,
    settings.hairColor,
    settings.outfitColor,
    settings.accentColor,
  ]);

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.expressionGain = settings.expressionGain;
  }, [settings.expressionGain]);

  useEffect(() => {
    viewerRef.current?.setBackground(
      settings.background,
      settings.chroma,
      settings.backgroundUrl,
    );
  }, [settings.background, settings.chroma, settings.backgroundUrl]);

  useEffect(() => {
    viewerRef.current?.applyPreset(settings.cameraPreset);
  }, [settings.cameraPreset, avatarLabel]);

  // --- camera ---------------------------------------------------------------
  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "videoinput"));
    } catch {
      /* enumerateDevices can fail before permission is granted */
    }
  }, []);

  const startCamera = useCallback(
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

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    trackerRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setRunning(false);
    setStatus("");
  }, [videoRef]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !ready) return;
    autoStarted.current = true;
    void startCamera();
  }, [autoStart, ready, startCamera]);

  // --- output ---------------------------------------------------------------
  const snapshot = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    for (let value = 3; value >= 1; value -= 1) {
      setCountdown(value);
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    setCountdown(null);
    const url = viewerRef.current?.snapshot();
    if (!url) {
      capturingRef.current = false;
      return;
    }
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const time = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${date}_${time}.png`;
    a.click();
    capturingRef.current = false;
  }, []);

  const toggleRecording = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    const stream = viewer.captureStream(30);
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
      (m) => MediaRecorder.isTypeSupported(m),
    );
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime ?? "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avatar-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      recorderRef.current = null;
      setRecording(false);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }, []);

  return {
    ready,
    running,
    status,
    error,
    stats,
    devices,
    deviceId,
    avatarLabel,
    avatarLoading,
    recording,
    countdown,
    startCamera,
    stopCamera,
    refreshDevices,
    snapshot,
    toggleRecording,
    setError,
  };
}

// Studio settings panel

type Engine = ReturnType<typeof useAvatarEngine>;

type ProjectGender = "male" | "female";
type ProjectJob =
  | "student"
  | "teacher"
  | "doctor"
  | "police"
  | "firefighter"
  | "chef"
  | "astronaut"
  | "hacker"
  | "singer";

const PROJECT_GENDERS: { value: ProjectGender; label: string }[] = [
  { value: "male", label: "남성형" },
  { value: "female", label: "여성형" },
];

const PROJECT_JOBS: {
  value: ProjectJob;
  label: string;
  outfit: string;
  accent: string;
}[] = [
  { value: "student", label: "학생", outfit: "#334f82", accent: "#37f2dc" },
  { value: "teacher", label: "교사", outfit: "#7a5b45", accent: "#e7c98f" },
  { value: "doctor", label: "의사", outfit: "#e7f1ef", accent: "#35b8a0" },
  { value: "police", label: "경찰", outfit: "#233d69", accent: "#eab308" },
  { value: "firefighter", label: "소방관", outfit: "#9b332d", accent: "#f59e0b" },
  { value: "chef", label: "요리사", outfit: "#f0ece3", accent: "#dc2626" },
  { value: "astronaut", label: "우주 비행사", outfit: "#e8edf3", accent: "#3b82f6" },
  { value: "hacker", label: "해커", outfit: "#20203b", accent: "#22d3ee" },
  { value: "singer", label: "가수", outfit: "#633c89", accent: "#f472b6" },
];

const HUMAN_VRM_PROFILES = PROJECT_GENDERS.flatMap((gender) =>
  PROJECT_JOBS.map((job) => ({
    gender: gender.value,
    genderLabel: gender.label,
    job: job.value,
    jobLabel: job.label,
    outfit: job.outfit,
    accent: job.accent,
    url: `/avatars/project/${gender.value}-${job.value}.vrm`,
  })),
);

const SKIN_COLORS = ["#f7d8bd", "#efc29f", "#c98f67", "#8b5c42"] as const;

const BACKGROUND_PRESETS = [
  {
    value: "gradient",
    label: "다크 그라데이션",
    preview: "linear-gradient(145deg, #343966, #080a18)",
  },
  {
    value: "studio",
    label: "밝은 스튜디오",
    preview: "linear-gradient(145deg, #f5f7ff, #adb7d6)",
  },
  {
    value: "ai-stage",
    label: "AI 전시 무대",
    image: "/backgrounds/ai-stage.png",
    thumbnail: "/backgrounds/ai-stage-thumb.jpg",
  },
  {
    value: "neon-city",
    label: "네온 시티",
    image: "/backgrounds/neon-city.png",
    thumbnail: "/backgrounds/neon-city-thumb.jpg",
  },
  {
    value: "busan-future",
    label: "부산 미래 해변",
    image: "/backgrounds/busan-future.png",
    thumbnail: "/backgrounds/busan-future-thumb.jpg",
  },
  {
    value: "chroma",
    label: "크로마키",
    preview: "linear-gradient(145deg, #00b140, #087d36)",
  },
  {
    value: "transparent",
    label: "투명",
    preview:
      "conic-gradient(#b9bfd1 25%, #eef0f6 0 50%, #b9bfd1 0 75%, #eef0f6 0) 0 0 / 18px 18px",
  },
] as const;

export function ControlPanel({ engine }: { engine: Engine }) {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const backgroundRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);
  const backgroundObjectUrl = useRef<string | null>(null);
  const selectedProfile =
    HUMAN_VRM_PROFILES.find((profile) => profile.url === s.vrmUrl) ??
    HUMAN_VRM_PROFILES[0];

  const selectProjectAvatar = (
    gender: ProjectGender,
    job: ProjectJob,
    resetJobColors: boolean,
  ) => {
    const profile = HUMAN_VRM_PROFILES.find(
      (candidate) => candidate.gender === gender && candidate.job === job,
    );
    if (!profile) return;
    s.patch({
      avatarKind: "vrm",
      vrmUrl: profile.url,
      vrmName: `${profile.genderLabel} ${profile.jobLabel}`,
      ...(resetJobColors
        ? { outfitColor: profile.outfit, accentColor: profile.accent }
        : {}),
    });
  };

  const applyVrmFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".vrm")) {
      engine.setError("VRM 파일만 사용할 수 있습니다.");
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    s.patch({
      avatarKind: "vrm",
      vrmUrl: url,
      vrmName: file.name.replace(/\.vrm$/i, ""),
    });
  };

  const applyBackgroundFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      engine.setError("JPG, PNG, WebP 같은 이미지 파일만 배경으로 사용할 수 있습니다.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      engine.setError("배경 이미지는 15MB 이하로 선택해 주세요.");
      return;
    }
    if (backgroundObjectUrl.current) {
      URL.revokeObjectURL(backgroundObjectUrl.current);
    }
    const url = URL.createObjectURL(file);
    backgroundObjectUrl.current = url;
    s.patch({ background: "custom", backgroundUrl: url });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        전신 인식 · 손 추적 항상 켜짐
      </div>

      <Panel title="사람형 VRM" hint="애니풍 대신 project의 전신 모델을 VRM 1.0으로 변환했습니다.">
        <div>
          <p className="mb-1.5 text-[12px] text-white/80">기본 인물</p>
          <div className="grid grid-cols-2 gap-2">
            {PROJECT_GENDERS.map((gender) => (
              <button
                key={gender.value}
                type="button"
                disabled={engine.avatarLoading}
                onClick={() =>
                  selectProjectAvatar(gender.value, selectedProfile.job, false)
                }
                className={`rounded-xl border px-3 py-2.5 text-center text-[12px] font-medium transition disabled:cursor-wait disabled:opacity-55 ${
                  selectedProfile.gender === gender.value
                    ? "border-indigo-400 bg-indigo-500/25 text-white"
                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {gender.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[12px] text-white/80">직업</p>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_JOBS.map((job) => (
              <button
                key={job.value}
                type="button"
                disabled={engine.avatarLoading}
                onClick={() =>
                  selectProjectAvatar(selectedProfile.gender, job.value, true)
                }
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
                  selectedProfile.job === job.value
                    ? "border-white/40 bg-white text-black"
                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {job.label}
              </button>
            ))}
          </div>
        </div>

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

        <p className="rounded-lg bg-black/25 px-3 py-2 text-[11px] text-white/50">
          {engine.avatarLoading
            ? "아바타를 불러오는 중…"
            : `현재 아바타: ${s.vrmName ?? "없음"}`}
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".vrm"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) applyVrmFile(f);
            e.target.value = "";
          }}
        />
        <details className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <summary className="cursor-pointer text-[11px] text-white/55">
            내 VRM 파일 사용
          </summary>
          <div className="mt-2">
            <Button full onClick={() => fileRef.current?.click()}>
              VRM 파일 선택…
            </Button>
          </div>
        </details>
      </Panel>

      <Panel title="화면" hint="전신 구도는 고정됩니다.">
        <Toggle
          label="거울 보기"
          checked={s.mirror}
          onChange={(v) => s.set("mirror", v)}
        />
        <Toggle
          label="웹캠 미리보기"
          hint="숨겨도 아바타 움직임 추적은 계속됩니다"
          checked={s.showCamera}
          onChange={(v) => s.set("showCamera", v)}
        />
        <Toggle
          label="스켈레톤 표시"
          checked={s.showSkeleton}
          onChange={(v) => s.set("showSkeleton", v)}
          disabled={!s.showCamera}
        />
      </Panel>

      <Panel title="배경" hint="촬영 사진과 녹화 영상에 선택한 배경이 함께 저장됩니다.">
        <div className="grid grid-cols-2 gap-2">
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              aria-pressed={s.background === preset.value}
              onClick={() =>
                s.patch({ background: preset.value, backgroundUrl: null })
              }
              className={`group overflow-hidden rounded-xl border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                s.background === preset.value
                  ? "border-indigo-400 bg-indigo-500/20"
                  : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10"
              }`}
            >
              <span
                className="block aspect-[16/9] bg-cover bg-center transition duration-200 group-hover:scale-[1.03]"
                style={{
                  backgroundImage: "image" in preset
                    ? `linear-gradient(rgb(0 0 0 / 0.04), rgb(0 0 0 / 0.22)), url(${preset.thumbnail})`
                    : preset.preview,
                }}
              />
              <span className="block px-2.5 py-2 text-[12px] font-medium text-white/80">
                {preset.label}
              </span>
            </button>
          ))}

          <button
            type="button"
            aria-pressed={s.background === "custom"}
            onClick={() => backgroundRef.current?.click()}
            className={`overflow-hidden rounded-xl border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              s.background === "custom"
                ? "border-indigo-400 bg-indigo-500/20"
                : "border-dashed border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10"
            }`}
          >
            <span
              className="grid aspect-[16/9] place-items-center bg-cover bg-center text-2xl text-white/55"
              style={
                s.backgroundUrl
                  ? { backgroundImage: `url(${s.backgroundUrl})` }
                  : undefined
              }
            >
              {s.backgroundUrl ? null : "+"}
            </span>
            <span className="block px-2.5 py-2 text-[12px] font-medium text-white/80">
              내 사진 선택
            </span>
          </button>
        </div>
        <input
          ref={backgroundRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) applyBackgroundFile(file);
            e.target.value = "";
          }}
        />
        {s.background === "chroma" ? (
          <ColorField
            label="크로마 색"
            value={s.chroma}
            onChange={(v) => s.set("chroma", v)}
          />
        ) : null}
      </Panel>

      <Panel title="내보내기" hint="사진은 버튼을 누른 뒤 3초 후 자동으로 저장됩니다.">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={engine.snapshot} disabled={!engine.ready || engine.countdown !== null}>
            {engine.countdown !== null ? `${engine.countdown}초` : "3초 후 촬영"}
          </Button>
          <Button
            onClick={engine.toggleRecording}
            variant={engine.recording ? "danger" : "default"}
            disabled={!engine.ready}
          >
            {engine.recording ? "녹화 중지" : "webm 녹화"}
          </Button>
        </div>
        <Button
          full
          onClick={() => {
            const q = new URLSearchParams({
              mirror: s.mirror ? "1" : "0",
              bg: "transparent",
              skin: s.skinColor,
              hair: s.hairColor,
              outfit: s.outfitColor,
              accent: s.accentColor,
            });
            // Blob URLs from a local file pick can't cross window boundaries.
            if (s.avatarKind === "vrm" && s.vrmUrl && !s.vrmUrl.startsWith("blob:")) {
              q.set("vrm", s.vrmUrl);
            }
            window.open(`/embed?${q}`, "avatar-embed", "width=720,height=960");
          }}
        >
          투명 배경 팝아웃 열기
        </Button>
      </Panel>
    </div>
  );
}

// Main studio screen

export function AvatarStudio() {
  const s = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const handleFrame = useCallback((frame: TrackFrame) => {
    if (!s.showCamera || !s.showSkeleton) return;
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) drawOverlay(ctx, frame, w, h);
  }, [s.showCamera, s.showSkeleton]);

  const engine = useAvatarEngine({ canvasRef, videoRef, onFrame: handleFrame });

  useEffect(() => {
    if (!s.showSkeleton || !s.showCamera) {
      const canvas = overlayRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [s.showSkeleton, s.showCamera]);

  const tracked = engine.running;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500 text-[13px] font-bold">
            A
          </span>
          <h1 className="text-[13px] font-semibold tracking-tight">
            아바타 캠 스튜디오
          </h1>
        </div>

        <div className="ml-2 hidden items-center gap-2 text-[11px] text-white/40 sm:flex">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              tracked ? "bg-emerald-400" : "bg-white/25"
            }`}
          />
          {engine.status ||
            (tracked
              ? `${engine.stats ? engine.stats.fps.toFixed(0) : "--"} fps · ${
                  engine.stats ? engine.stats.inferenceMs.toFixed(0) : "--"
                } ms · ${engine.stats?.delegate ?? ""}`
              : "카메라 꺼짐")}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-white/35 md:inline">
            {engine.avatarLabel}
          </span>
          {tracked ? (
            <Button variant="danger" onClick={engine.stopCamera}>
              정지
            </Button>
          ) : (
            <Button variant="primary" onClick={() => engine.startCamera()}>
              카메라 시작
            </Button>
          )}
          <Button
            onClick={() => {
              if (s.showCamera) setPreviewExpanded(false);
              s.set("showCamera", !s.showCamera);
            }}
          >
            {s.showCamera ? "영상 숨기기" : "영상 보기"}
          </Button>
          <Button onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? "설정 닫기" : "설정"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <canvas ref={canvasRef} className="block h-full w-full" />

          {engine.countdown !== null ? (
            <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/25 backdrop-blur-[2px]">
              <div
                aria-live="assertive"
                className="grid h-32 w-32 place-items-center rounded-full border-4 border-white/80 bg-indigo-600/90 text-6xl font-black text-white shadow-2xl"
              >
                {engine.countdown}
              </div>
            </div>
          ) : null}

          {!tracked && !engine.error ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="pointer-events-auto max-w-sm rounded-2xl border border-white/10 bg-black/55 p-6 text-center backdrop-blur">
                <h2 className="text-sm font-semibold">웹캠으로 아바타를 씌워보세요</h2>
                <p className="mt-2 text-[12px] leading-relaxed text-white/55">
                  카메라 영상은 전부 브라우저 안에서만 처리되고 어디에도 전송되지
                  않습니다. 전신 모드는 상체와 다리가 보이도록 한 걸음 물러서면
                  훨씬 안정적입니다.
                </p>
                <div className="mt-4">
                  <Button variant="primary" onClick={() => engine.startCamera()}>
                    카메라 시작
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {engine.error ? (
            <div className="absolute inset-x-0 top-3 mx-auto w-fit max-w-[90%] rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-2 text-[12px] text-rose-100 backdrop-blur">
              {engine.error}
              <button
                type="button"
                onClick={() => engine.setError(null)}
                className="ml-3 text-rose-200/70 hover:text-white"
              >
                닫기
              </button>
            </div>
          ) : null}

          <div
            className={`absolute overflow-hidden border border-white/15 bg-black/90 shadow-lg backdrop-blur ${
              previewExpanded
                ? "inset-0 z-20 flex w-full flex-col rounded-none"
                : "bottom-4 left-4 w-56 rounded-xl"
            } ${
              s.showCamera ? "" : "hidden"
            }`}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={previewExpanded ? "인식 카메라 축소" : "인식 카메라 전체 화면"}
              onClick={() => setPreviewExpanded((value) => !value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPreviewExpanded((value) => !value);
                }
              }}
              className={`relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 ${
                previewExpanded ? "min-h-0 flex-1" : "aspect-[4/3]"
              }`}
              style={{ transform: s.mirror ? "scaleX(-1)" : undefined }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                className={`h-full w-full ${
                  previewExpanded ? "object-contain" : "object-cover"
                }`}
              />
              <canvas
                ref={overlayRef}
                className={`absolute inset-0 h-full w-full ${
                  s.showSkeleton ? "" : "hidden"
                }`}
              />
              <span
                className="pointer-events-none absolute right-2 top-2 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-medium text-white/80"
                style={{ transform: s.mirror ? "scaleX(-1)" : undefined }}
              >
                {previewExpanded ? "클릭하여 축소" : "클릭하여 전체 화면"}
              </span>
            </div>
            {engine.devices.length > 1 ? (
              <select
                value={engine.deviceId ?? ""}
                onChange={(e) => engine.startCamera(e.target.value)}
                className="w-full bg-black/60 px-2 py-1.5 text-[11px] text-white/70 outline-none"
              >
                {engine.devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `카메라 ${i + 1}`}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </main>

        {panelOpen ? (
          <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-white/10 bg-black/25 p-3">
            <ControlPanel engine={engine} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

// Minimal pop-out screen used by OBS and browser sources

/**
 * Chrome-free avatar surface for OBS / Zoom browser sources.
 * Everything is configured through the query string so the window can be
 * pointed at, captured and forgotten.
 */
export function EmbedStage() {
  const params = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const bg = (params.get("bg") as BackgroundKind) ?? "transparent";
    useSettings.getState().patch({
      mode: "full",
      mirror: params.get("mirror") !== "0",
      hands: true,
      cameraPreset: "full",
      background: bg,
      chroma: params.get("chroma") ?? "#00b140",
      skinColor: params.get("skin") ?? "#efc29f",
      hairColor: params.get("hair") ?? "#2a211f",
      outfitColor: params.get("outfit") ?? "#334f82",
      accentColor: params.get("accent") ?? "#37f2dc",
      showCamera: false,
      showSkeleton: false,
      ...(params.get("vrm")
        ? {
            avatarKind: "vrm" as const,
            vrmUrl: params.get("vrm"),
            vrmName: "VRM",
          }
        : {}),
    });
    document.body.classList.toggle("transparent-stage", bg === "transparent");
  }, [params]);

  const engine = useAvatarEngine({ canvasRef, videoRef, autoStart: true });

  return (
    <div className="fixed inset-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
      <video ref={videoRef} playsInline muted className="hidden" />
      {engine.error ? (
        <p className="absolute inset-x-0 bottom-2 text-center text-[11px] text-rose-300">
          {engine.error}
        </p>
      ) : null}
    </div>
  );
}
