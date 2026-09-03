"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { loadVRMRig } from "@/lib/avatar/vrm";
import { AvatarViewer } from "@/lib/scene/viewer";
import { Tracker } from "@/lib/tracking/tracker";
import { useSettings } from "@/lib/store";
import type { TrackFrame, TrackerStats } from "@/lib/types";

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
        mode: useSettings.getState().mode,
        quality: useSettings.getState().quality,
        hands: useSettings.getState().hands,
        mirror: useSettings.getState().mirror,
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
          setAvatarLabel(rig.name);
          setError(null);
        } catch (e) {
          if (cancelled) return;
          setError(
            e instanceof Error ? e.message : "VRM 파일을 불러오지 못했습니다.",
          );
          useSettings.getState().patch({
            avatarKind: "vrm",
            vrmUrl: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/AvatarSample_A.vrm",
            vrmName: "Avatar A",
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
        vrmUrl: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/AvatarSample_A.vrm",
        vrmName: "Avatar A",
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
      mode: settings.mode,
      quality: settings.quality,
      hands: settings.hands,
      mirror: settings.mirror,
    });
  }, [settings.mode, settings.quality, settings.hands, settings.mirror]);

  useEffect(() => {
    trackerRef.current?.setSmoothing(settings.smoothing);
    viewerRef.current?.setSolverSettings({
      smoothing: settings.smoothing,
      followBody: settings.followBody,
      headGain: settings.headGain,
      bodyEnabled: settings.mode === "full",
      fingersEnabled: settings.hands,
    });
  }, [
    settings.smoothing,
    settings.followBody,
    settings.headGain,
    settings.mode,
    settings.hands,
    avatarLabel,
  ]);

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.expressionGain = settings.expressionGain;
  }, [settings.expressionGain]);

  useEffect(() => {
    viewerRef.current?.setBackground(settings.background, settings.chroma);
  }, [settings.background, settings.chroma]);

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
      try {
        setStatus("카메라 여는 중…");
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: id ? { exact: id } : undefined,
            width: { ideal: 960 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        setDeviceId(
          stream.getVideoTracks()[0]?.getSettings().deviceId ?? id ?? null,
        );
        await refreshDevices();
        await trackerRef.current?.start(video);
        setRunning(true);
      } catch (e) {
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
