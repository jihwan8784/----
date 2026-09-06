"use client";

import { create } from "zustand";

import type { BackgroundKind, CameraPreset } from "@/lib/scene/viewer";
import { DEFAULT_MANNEQUIN, type MannequinOptions } from "@/lib/avatar/mannequin";
import type { AvatarKind, PoseQuality, TrackMode } from "@/lib/types";

export interface Settings {
  mode: TrackMode;
  quality: PoseQuality;
  hands: boolean;
  mirror: boolean;

  avatarKind: AvatarKind;
  vrmUrl: string | null;
  vrmName: string | null;
  mannequin: MannequinOptions;
  skinColor: string;
  hairColor: string;
  outfitColor: string;
  accentColor: string;

  smoothing: number;
  followBody: number;
  headGain: number;
  expressionGain: number;

  background: BackgroundKind;
  backgroundUrl: string | null;
  chroma: string;
  cameraPreset: CameraPreset;

  showSkeleton: boolean;
  showCamera: boolean;
}

interface Store extends Settings {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  patch(next: Partial<Settings>): void;
}

const initial: Settings = {
  mode: "full",
  quality: "lite",
  hands: true,
  mirror: true,

  avatarKind: "vrm",
  vrmUrl: "/avatars/realistic/male-casual.vrm",
  vrmName: "남성형 학생 · 현실형 캐주얼",
  mannequin: DEFAULT_MANNEQUIN,
  skinColor: "#efc29f",
  hairColor: "#2a211f",
  outfitColor: "#334f82",
  accentColor: "#37f2dc",

  smoothing: 0.45,
  followBody: 0.5,
  headGain: 1.15,
  expressionGain: 1.15,

  background: "gradient",
  backgroundUrl: null,
  chroma: "#00b140",
  cameraPreset: "full",

  showSkeleton: false,
  showCamera: true,
};

export const useSettings = create<Store>((set) => ({
  ...initial,
  set: (key, value) => set({ [key]: value } as Partial<Settings>),
  patch: (next) => set(next),
}));

/** Camera preset that suits a tracking mode, used when the mode changes. */
export function presetForMode(mode: TrackMode): CameraPreset {
  return mode === "face" ? "face" : "full";
}
