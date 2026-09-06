"use client";

import { create } from "zustand";

import type {
  BackgroundKind,
  CameraPreset,
} from "@/lib/scene/avatar-scene-viewer";

export interface Settings {
  mirror: boolean;

  vrmUrl: string | null;
  vrmName: string | null;
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
  mirror: true,

  vrmUrl: "/avatars/microsoft-rocketbox/male-casual-student.vrm",
  vrmName: "남성형 학생 · Rocketbox 현실형 일상복",
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
