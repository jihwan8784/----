"use client";

import { useRef, useState } from "react";

import { useSettings, presetForMode } from "@/lib/store";
import type { useAvatarEngine } from "./useAvatarEngine";
import { Button, ColorField, Panel, Segmented, Slider, Toggle } from "./ui";

type Engine = ReturnType<typeof useAvatarEngine>;

const VRM_PRESETS = [
  { name: "Avatar A", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/AvatarSample_A.vrm" },
  { name: "Avatar B", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/AvatarSample_B.vrm" },
  { name: "Avatar C", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/AvatarSample_C.vrm" },
];

export function ControlPanel({ engine }: { engine: Engine }) {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);
  const [vrmInput, setVrmInput] = useState("");
  const validVrmUrl = (() => {
    try {
      return new URL(vrmInput.trim()).pathname.toLowerCase().endsWith(".vrm");
    } catch {
      return false;
    }
  })();

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

  return (
    <div className="space-y-3">
      <Panel title="트래킹" hint="전신은 몸 전체가 화면에 들어와야 안정적입니다.">
        <Segmented
          value={s.mode}
          onChange={(mode) =>
            s.patch({ mode, cameraPreset: presetForMode(mode) })
          }
          options={[
            { value: "full", label: "전신" },
            { value: "face", label: "얼굴만" },
          ]}
        />
        <Toggle
          label="거울 모드"
          hint="내가 든 손이 화면에서도 같은 쪽에 보입니다"
          checked={s.mirror}
          onChange={(v) => s.set("mirror", v)}
        />
        <Toggle
          label="손가락 트래킹"
          hint="정확도가 올라가지만 무거워집니다"
          checked={s.hands}
          onChange={(v) => s.set("hands", v)}
          disabled={s.mode !== "full"}
        />
        <div>
          <p className="mb-1 text-[12px] text-white/80">포즈 모델 정확도</p>
          <Segmented
            value={s.quality}
            onChange={(quality) => s.set("quality", quality)}
            options={[
              { value: "lite", label: "가볍게" },
              { value: "full", label: "정밀하게" },
            ]}
          />
        </div>
        <Slider
          label="부드러움"
          value={s.smoothing}
          onChange={(v) => s.set("smoothing", v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          label="몸 따라가기"
          value={s.followBody}
          onChange={(v) => s.set("followBody", v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          label="고개 반응"
          value={s.headGain}
          min={0.5}
          max={2}
          onChange={(v) => s.set("headGain", v)}
          format={(v) => `${v.toFixed(2)}x`}
        />
        <Slider
          label="표정 반응"
          value={s.expressionGain}
          min={0.5}
          max={2.5}
          onChange={(v) => s.set("expressionGain", v)}
          format={(v) => `${v.toFixed(2)}x`}
        />
      </Panel>

      <Panel title="VRM 아바타" hint="내장 모델을 고르거나 자신의 .vrm 파일을 올릴 수 있습니다.">
        <div className="grid grid-cols-3 gap-2">
          {VRM_PRESETS.map((preset) => (
            <button
              key={preset.url}
              type="button"
              onClick={() =>
                s.patch({
                  avatarKind: "vrm",
                  vrmUrl: preset.url,
                  vrmName: preset.name,
                })
              }
              className={`rounded-xl border px-2 py-3 text-[11px] transition ${
                s.vrmUrl === preset.url
                  ? "border-indigo-400 bg-indigo-500/25 text-white"
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <p className="rounded-lg bg-black/25 px-3 py-2 text-[11px] text-white/50">
          현재 아바타: {s.vrmName ?? "없음"}
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
        <Button full onClick={() => fileRef.current?.click()}>
          내 VRM 파일 올리기…
        </Button>
        <div className="flex gap-1.5">
          <input
            value={vrmInput}
            onChange={(e) => setVrmInput(e.target.value)}
            placeholder="또는 VRM 주소 붙여넣기"
            className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-[12px] text-white/80 outline-none placeholder:text-white/25 focus:ring-1 focus:ring-indigo-400"
          />
          <Button
            disabled={!validVrmUrl}
            onClick={() =>
              s.patch({
                avatarKind: "vrm",
                vrmUrl: vrmInput.trim(),
                vrmName: vrmInput.trim().split("/").pop() ?? "VRM",
              })
            }
          >
            적용
          </Button>
        </div>
      </Panel>

      <Panel title="화면">
        <div>
          <p className="mb-1 text-[12px] text-white/80">카메라 앵글</p>
          <Segmented
            value={s.cameraPreset}
            onChange={(v) => s.set("cameraPreset", v)}
            options={[
              { value: "full", label: "전신" },
              { value: "upper", label: "상반신" },
              { value: "face", label: "얼굴" },
            ]}
          />
        </div>
        <div>
          <p className="mb-1 text-[12px] text-white/80">배경</p>
          <Segmented
            value={s.background}
            onChange={(v) => s.set("background", v)}
            options={[
              { value: "gradient", label: "다크" },
              { value: "studio", label: "스튜디오" },
              { value: "chroma", label: "크로마" },
              { value: "transparent", label: "투명" },
            ]}
          />
        </div>
        {s.background === "chroma" ? (
          <ColorField
            label="크로마 색"
            value={s.chroma}
            onChange={(v) => s.set("chroma", v)}
          />
        ) : null}
        <Toggle
          label="웹캠 미리보기"
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
              mode: s.mode,
              mirror: s.mirror ? "1" : "0",
              hands: s.hands ? "1" : "0",
              preset: s.cameraPreset,
              bg: "transparent",
            });
            // Blob URLs from a local file pick can't cross window boundaries.
            if (s.avatarKind === "vrm" && s.vrmUrl?.startsWith("http")) {
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
