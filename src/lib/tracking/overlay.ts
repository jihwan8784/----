import type { TrackFrame } from "@/lib/types";
import { FACE_OVAL, HAND_CONNECTIONS, POSE_CONNECTIONS } from "./landmarks";

/**
 * Draws the detected skeleton over the camera preview. Coordinates are the raw
 * normalised landmarks, so the canvas must carry the same CSS mirror as the
 * <video> it sits on top of.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  frame: TrackFrame | null,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  if (!frame) return;

  const px = (x: number) => x * width;
  const py = (y: number) => y * height;
  const scale = Math.min(width, height) / 360;

  const pose = frame.overlay.pose;
  if (pose) {
    ctx.lineWidth = Math.max(1.5, 3 * scale);
    ctx.strokeStyle = "rgba(122, 162, 255, 0.9)";
    ctx.beginPath();
    for (const [a, b] of POSE_CONNECTIONS) {
      const p = pose[a];
      const q = pose[b];
      if (!p || !q || p.visibility < 0.35 || q.visibility < 0.35) continue;
      ctx.moveTo(px(p.x), py(p.y));
      ctx.lineTo(px(q.x), py(q.y));
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 214, 102, 0.95)";
    for (const p of pose) {
      if (p.visibility < 0.4) continue;
      ctx.beginPath();
      ctx.arc(px(p.x), py(p.y), Math.max(1.5, 3.2 * scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const face = frame.overlay.face;
  if (face) {
    ctx.strokeStyle = "rgba(120, 245, 210, 0.85)";
    ctx.lineWidth = Math.max(1, 1.8 * scale);
    ctx.beginPath();
    FACE_OVAL.forEach((idx, i) => {
      const p = face[idx];
      if (!p) return;
      if (i === 0) ctx.moveTo(px(p.x), py(p.y));
      else ctx.lineTo(px(p.x), py(p.y));
    });
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "rgba(120, 245, 210, 0.5)";
    for (let i = 0; i < face.length; i += 4) {
      const p = face[i];
      ctx.fillRect(px(p.x) - 0.5, py(p.y) - 0.5, 1.4, 1.4);
    }
  }

  for (const hand of frame.overlay.hands) {
    ctx.strokeStyle = "rgba(255, 138, 190, 0.9)";
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const p = hand[a];
      const q = hand[b];
      if (!p || !q) continue;
      ctx.moveTo(px(p.x), py(p.y));
      ctx.lineTo(px(q.x), py(q.y));
    }
    ctx.stroke();
  }
}
