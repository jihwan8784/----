import type { ExpressionName } from "./rig";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const avg = (a: number, b: number) => (a + b) / 2;

export interface FaceDrive {
  expressions: Record<ExpressionName, number>;
  gaze: { yaw: number; pitch: number };
}

export const NEUTRAL_FACE: FaceDrive = {
  expressions: {
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
    blinkLeft: 0,
    blinkRight: 0,
    happy: 0,
    angry: 0,
    sad: 0,
    surprised: 0,
    relaxed: 0,
  },
  gaze: { yaw: 0, pitch: 0 },
};

/**
 * Turns MediaPipe's 52 ARKit-style blendshape scores into the handful of
 * VRM expression presets an avatar actually exposes.
 */
export function driveFromBlendshapes(
  b: Record<string, number>,
  gain = 1,
): FaceDrive {
  const g = (k: string) => b[k] ?? 0;

  const jaw = clamp01((g("jawOpen") - g("mouthClose") * 0.5) * 1.3 * gain);
  const pucker = clamp01(Math.max(g("mouthPucker"), g("mouthFunnel")) * gain);
  const smile = clamp01(avg(g("mouthSmileLeft"), g("mouthSmileRight")) * gain);
  const stretch = clamp01(
    avg(g("mouthStretchLeft"), g("mouthStretchRight")) * gain,
  );
  const frown = clamp01(avg(g("mouthFrownLeft"), g("mouthFrownRight")) * gain);
  const browDown = clamp01(avg(g("browDownLeft"), g("browDownRight")) * gain);
  const browUp = clamp01(g("browInnerUp") * gain);
  const eyeWide = clamp01(avg(g("eyeWideLeft"), g("eyeWideRight")) * gain);

  // Visemes: split the open/rounded/wide mouth space between aa / ou / ih.
  const aa = clamp01(jaw - pucker * 0.8);
  const ou = clamp01(pucker - jaw * 0.35);
  const ih = clamp01(Math.max(stretch, smile * 0.6) * (1 - jaw * 0.6));
  const oh = clamp01(Math.min(jaw, pucker) * 1.4);

  const blinkLeft = clamp01(
    g("eyeBlinkLeft") * 1.15 + g("eyeSquintLeft") * 0.25,
  );
  const blinkRight = clamp01(
    g("eyeBlinkRight") * 1.15 + g("eyeSquintRight") * 0.25,
  );

  // Gaze: "out" on one eye pairs with "in" on the other.
  const lookLeft = avg(g("eyeLookOutLeft"), g("eyeLookInRight"));
  const lookRight = avg(g("eyeLookOutRight"), g("eyeLookInLeft"));
  const lookUp = avg(g("eyeLookUpLeft"), g("eyeLookUpRight"));
  const lookDown = avg(g("eyeLookDownLeft"), g("eyeLookDownRight"));

  return {
    expressions: {
      aa,
      ih,
      ou,
      ee: clamp01(ih * 0.7),
      oh,
      blinkLeft,
      blinkRight,
      happy: clamp01(smile * 1.1 - frown),
      sad: clamp01(frown * 1.1 - smile),
      angry: clamp01(browDown * 1.2 - browUp),
      surprised: clamp01(Math.min(browUp, eyeWide + 0.35) * 1.3),
      relaxed: 0,
    },
    gaze: {
      yaw: clamp01(lookLeft) - clamp01(lookRight),
      pitch: clamp01(lookUp) - clamp01(lookDown),
    },
  };
}

/** Simple idle blink so a face-less frame still looks alive. */
export class IdleBlinker {
  private next = 2;
  private t = 0;
  private phase = -1;

  update(dt: number): number {
    this.t += dt;
    if (this.phase < 0 && this.t > this.next) {
      this.phase = 0;
      this.t = 0;
    }
    if (this.phase >= 0) {
      this.phase += dt / 0.11;
      if (this.phase >= 1) {
        this.phase = -1;
        this.t = 0;
        this.next = 1.6 + Math.random() * 3.4;
        return 0;
      }
      return Math.sin(this.phase * Math.PI);
    }
    return 0;
  }
}
