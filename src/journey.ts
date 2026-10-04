import type { SceneState } from './state';

export type JourneyMotion = { opening: number };
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// A return to the garden preserves the progress already seen. Only Close resets it.
export function scrollOpening(previous: number, scrollY: number, height: number) {
  return Math.max(previous, clamp01(scrollY / Math.max(1, height * 0.65)));
}

export function journeyScene(scrollY: number, height: number, opening: number): SceneState {
  if (scrollY >= height * 0.45) return 'detail';
  return opening > 0 ? 'collection' : 'home';
}

export function activeChapter(tops: number[], scrollY: number, height: number, mobile: boolean) {
  const readingLine = scrollY + height * (mobile ? 0.55 : 0.38);
  let index = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= readingLine) index = i;
  }
  return index;
}
