"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "@/lib/store";
import { drawOverlay } from "@/lib/tracking/overlay";
import type { TrackFrame } from "@/lib/types";
import { ControlPanel } from "./ControlPanel";
import { Button } from "./ui";
import { useAvatarEngine } from "./useAvatarEngine";

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
