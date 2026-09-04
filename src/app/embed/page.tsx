import { Suspense } from "react";

import { EmbedStage } from "@/components/AvatarStudio";

export const metadata = {
  title: "아바타 · 임베드",
};

export default function EmbedPage() {
  return (
    <Suspense fallback={null}>
      <EmbedStage />
    </Suspense>
  );
}
