"use client";

import { useRef, useState } from "react";

import { useSettings, presetForMode } from "@/lib/store";
import type { useAvatarEngine } from "./useAvatarEngine";
import { Button, ColorField, Panel, Segmented, Slider, Toggle } from "./ui";

type Engine = ReturnType<typeof useAvatarEngine>;

const VRM_PRESETS = [
  { name: "Avatar A", label: "기본 A", group: "기본", accent: "#7c8cff", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/AvatarSample_A.vrm" },
  { name: "Avatar B", label: "기본 B", group: "기본", accent: "#34d399", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/AvatarSample_B.vrm" },
  { name: "Avatar C", label: "기본 C", group: "기본", accent: "#fb7185", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/AvatarSample_C.vrm" },
  { name: "Sakurada Fumiriya", label: "후미리야", group: "남성", accent: "#38bdf8", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Sakurada_Fumiriya.vrm" },
  { name: "Hair Sample Male", label: "헤어 스타일 남성", group: "남성", accent: "#60a5fa", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/HairSample_Male.vrm" },
  { name: "Sendagaya Shino", label: "시노", group: "여성", accent: "#f472b6", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Sendagaya_Shino.vrm" },
  { name: "Victoria Rubin", label: "빅토리아", group: "여성", accent: "#c084fc", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Victoria_Rubin.vrm" },
  { name: "Vita", label: "비타", group: "개성", accent: "#f59e0b", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Vita.vrm" },
  { name: "Vivi", label: "비비", group: "개성", accent: "#22d3ee", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Vivi.vrm" },
  { name: "Darkness Shibu", label: "다크니스", group: "개성", accent: "#a78bfa", url: "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Darkness_Shibu.vrm" },
];

const VRM_GROUPS = ["전체", "기본", "남성", "여성", "개성"] as const;

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
  const [vrmInput, setVrmInput] = useState("");
  const [vrmGroup, setVrmGroup] =
    useState<(typeof VRM_GROUPS)[number]>("전체");
  const visiblePresets =
    vrmGroup === "전체"
      ? VRM_PRESETS
      : VRM_PRESETS.filter((preset) => preset.group === vrmGroup);
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
      <Panel
        title="트래킹"
        hint="행사장에서는 가볍게·손가락 끄기를 권장합니다."
      >
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

      <Panel title="VRM 아바타" hint="행사장에서 사용할 아바타를 빠르게 골라보세요.">
        <div className="flex flex-wrap gap-1.5">
          {VRM_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setVrmGroup(group)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
                vrmGroup === group
                  ? "border-white/40 bg-white text-black"
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {group}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {visiblePresets.map((preset) => (
            <button
              key={preset.url}
              type="button"
              disabled={engine.avatarLoading}
              onClick={() =>
                s.patch({
                  avatarKind: "vrm",
                  vrmUrl: preset.url,
                  vrmName: preset.name,
                })
              }
              className={`relative overflow-hidden rounded-xl border px-3 py-3 text-left transition disabled:cursor-wait disabled:opacity-55 ${
                s.vrmUrl === preset.url
                  ? "border-indigo-400 bg-indigo-500/25 text-white"
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ backgroundColor: preset.accent }}
              />
              <span className="block text-[13px] font-semibold">{preset.label}</span>
              <span className="mt-0.5 block text-[11px] text-white/40">
                {preset.group} · VRM
              </span>
            </button>
          ))}
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
