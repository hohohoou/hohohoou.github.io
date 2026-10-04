export type ScreenPinPose = { x: number; y: number; size: number; angle: number };

// Keep the destination live so landed pins follow scrolling without lag.
export function storyPinFlight(from: ScreenPinPose, to: ScreenPinPose, progress: number): ScreenPinPose {
  const t = Math.max(0, Math.min(1, progress));
  const ease = t * t * (3 - 2 * t);
  return {
    x: from.x + (to.x - from.x) * ease,
    y: from.y + (to.y - from.y) * ease - Math.sin(Math.PI * t) * Math.min(48, Math.abs(to.x - from.x) * 0.16 + 16),
    size: from.size + (to.size - from.size) * ease,
    angle: from.angle * (1 - ease) + to.angle * ease,
  };
}

export function storyPinInView(top: number, height: number, viewportHeight: number, mobile: boolean) {
  return top >= (mobile ? 148 : 118) && top + height <= viewportHeight - 16;
}
