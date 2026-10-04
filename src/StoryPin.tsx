import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Entry } from './content';
import type { SceneState } from './state';
import { PinArtwork } from './PinArtwork';
import workOutlines from './work-pin-outlines.json';
import projectOutlines from './project-pin-outlines.json';
import { caseCharmPose } from './case-pin-motion';
import { storyPinFlight, storyPinInView, type ScreenPinPose } from './story-pin-motion';

const outlines = { ...workOutlines, ...projectOutlines };

// Attached pins share the case's Three group. Their same artwork crosses above
// the paper during flight, then follows the actual heading's document position.
export function StoryPin({ entry, index, count, kind, state, active, mobile, reducedMotion }: {
  entry: Entry; index: number; count: number; kind: 'work' | 'projects'; state: SceneState; active: boolean; mobile: boolean; reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const dom = useRef<{ anchor: HTMLElement; flyer: HTMLImageElement; rect: DOMRect; dirty: boolean; scrolled: number } | null>(null);
  const flight = useRef<{ phase: 'attached' | 'flying' | 'docked' | 'returning'; progress: number; from: ScreenPinPose; current: ScreenPinPose }>({
    phase: 'attached', progress: 0, from: { x: 0, y: 0, size: 0, angle: 0 }, current: { x: 0, y: 0, size: 0, angle: 0 },
  });
  const vectors = useMemo(() => ({ center: new THREE.Vector3(), edge: new THREE.Vector3() }), []);
  const rest = caseCharmPose(index % 6, Math.min(count, 6), false, kind);

  useEffect(() => {
    const anchor = document.querySelector<HTMLElement>(`[data-story-pin-anchor="${entry.id}"]`);
    const flyer = document.querySelector<HTMLImageElement>(`[data-story-pin="${entry.id}"]`);
    if (!anchor || !flyer) return;
    const value = { anchor, flyer, rect: anchor.getBoundingClientRect(), dirty: true, scrolled: performance.now() };
    dom.current = value;
    const invalidate = () => { value.dirty = true; };
    const scroll = () => { invalidate(); value.scrolled = performance.now(); };
    const observer = new ResizeObserver(invalidate);
    observer.observe(document.querySelector('.journey')!);
    observer.observe(anchor);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', invalidate);
    document.fonts.ready.then(invalidate);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', invalidate);
      flyer.style.visibility = 'hidden';
      dom.current = null;
    };
  }, [entry.id]);

  useFrame(({ camera, size }, delta) => {
    const pin = group.current;
    const view = dom.current;
    if (!pin || !view) return;
    if (view.dirty) { view.rect = view.anchor.getBoundingClientRect(); view.dirty = false; }
    const { rect, flyer } = view;
    const f = flight.current;
    if (f.phase === 'attached' && (state !== 'detail' || !active)) {
      pin.visible = index < 6;
      flyer.style.visibility = 'hidden';
      if (import.meta.env.DEV) flyer.dataset.phase = 'attached';
      return;
    }
    const destination: ScreenPinPose = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.width, angle: 0 };
    pin.updateWorldMatrix(true, false);
    vectors.center.set(0, 0, 0.03).applyMatrix4(pin.matrixWorld).project(camera);
    vectors.edge.set(0.525, 0, 0.03).applyMatrix4(pin.matrixWorld).project(camera);
    const dx = (vectors.edge.x - vectors.center.x) * size.width / 2;
    const dy = -(vectors.edge.y - vectors.center.y) * size.height / 2;
    const source: ScreenPinPose = {
      x: (vectors.center.x + 1) * size.width / 2,
      y: (1 - vectors.center.y) * size.height / 2,
      size: Math.hypot(dx, dy) * 2, angle: Math.atan2(dy, dx),
    };
    if (state !== 'detail') {
      if (f.phase === 'flying' || f.phase === 'docked') {
        f.from = f.current; f.progress = 0;
        // Offscreen stories do not fly across the entire viewport on return.
        f.phase = f.current.y > 0 && f.current.y < size.height ? 'returning' : 'attached';
      }
    } else if (active && f.phase === 'attached') {
      // Direct links to later stories must not replay earlier offscreen pins.
      if (rect.bottom < (mobile ? 148 : 118)) f.phase = 'docked';
      else if (storyPinInView(rect.top, rect.height, size.height, mobile) && (reducedMotion || performance.now() - view.scrolled > 160 + Math.min(index, 3) * 100)) {
        f.phase = 'flying'; f.from = source; f.progress = 0;
      }
    } else if (state === 'detail' && f.phase === 'returning') {
      f.phase = 'flying'; f.from = f.current; f.progress = 0;
    }
    if (f.phase === 'flying' || f.phase === 'returning') {
      f.progress = reducedMotion ? 1 : Math.min(1, f.progress + Math.min(delta, 0.05) / (f.phase === 'returning' ? 0.5 : 0.7));
      f.current = storyPinFlight(f.from, f.phase === 'returning' ? source : destination, f.progress);
      if (f.progress === 1) f.phase = f.phase === 'returning' ? 'attached' : 'docked';
    }
    if (f.phase === 'docked') f.current = destination;
    if (f.phase === 'attached') f.current = source;
    pin.visible = f.phase === 'attached' && index < 6;
    flyer.style.visibility = f.phase === 'attached' ? 'hidden' : 'visible';
    const p = f.current;
    flyer.style.transform = `translate3d(${p.x - 32}px,${p.y - 32}px,0) rotate(${p.angle}rad) scale(${p.size / 64})`;
    if (import.meta.env.DEV) flyer.dataset.phase = f.phase;
  });

  return <group ref={group} position={[rest.x, rest.y, rest.z]} scale={rest.scale}>
    <PinArtwork image={entry.pin!.image} contour={outlines[entry.pin!.outline]} metal="#c5a46c" />
  </group>;
}
