import { useCallback, useEffect, useRef, useState } from 'react';
import { experiences } from './content';
import { LID_DURATION } from './lid-motion';
import { activeChapter, clamp01, journeyScene, scrollOpening, type JourneyMotion } from './journey';
import type { SceneState } from './state';

export const chapterId = (id: string) => `experience-${id}`;

export function useExperienceScroll(reducedMotion: boolean, mobile: boolean) {
  const motion = useRef<JourneyMotion>({ opening: 0 });
  const [scene, setScene] = useState<SceneState>('home');
  const [selectedId, setSelectedId] = useState(experiences[0].id);
  const animation = useRef(0);
  const closing = useRef(false);
  const scrollFrame = useRef(0);
  const tops = useRef<number[]>([]);
  const restoredInitialHash = useRef(false);

  // A breakpoint change rebinds scroll listeners, but must not stop the lid midway.
  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  const sync = useCallback(() => {
    const y = Math.max(0, window.scrollY);
    if (closing.current && y === 0) { setScene('home'); return; }
    motion.current.opening = scrollOpening(motion.current.opening, y, innerHeight);
    if (reducedMotion && motion.current.opening > 0) motion.current.opening = 1;
    setScene(journeyScene(y, innerHeight, motion.current.opening));
    setSelectedId(experiences[activeChapter(tops.current, y, innerHeight, mobile)].id);
  }, [mobile, reducedMotion]);

  const open = useCallback(() => {
    cancelAnimationFrame(animation.current);
    closing.current = false;
    const from = motion.current.opening;
    if (reducedMotion) {
      motion.current.opening = 1;
      sync();
      return;
    }
    const start = performance.now();
    setScene('collection');
    const tick = (now: number) => {
      motion.current.opening = Math.max(motion.current.opening, clamp01(from + (now - start) / (LID_DURATION * 1000)));
      if (motion.current.opening < 1) animation.current = requestAnimationFrame(tick);
    };
    animation.current = requestAnimationFrame(tick);
  }, [reducedMotion, sync]);

  const select = useCallback((id: string, updateHistory = true, entryId?: string) => {
    const validEntry = entryId && experiences.find(item => item.id === id)?.entries.some(entry => entry.id === entryId);
    const anchor = validEntry ? `story-${entryId}` : chapterId(id);
    const element = document.getElementById(anchor);
    if (!element) return;
    const keyboardFocus = document.activeElement?.matches(':focus-visible');
    cancelAnimationFrame(animation.current);
    closing.current = false;
    motion.current.opening = 1;
    setSelectedId(id);
    const hash = `#${anchor}`;
    if (updateHistory && location.hash !== hash) history.pushState(null, '', hash);
    element.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    if (keyboardFocus) element.querySelector<HTMLElement>('h2, h3')?.focus({ preventScroll: true });
    sync();
  }, [reducedMotion, sync]);

  const home = useCallback(() => {
    if (location.hash) history.pushState(null, '', location.pathname + location.search);
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
    document.querySelector<HTMLButtonElement>('.wordmark')?.focus({ preventScroll: true });
  }, [reducedMotion]);

  const close = useCallback(() => {
    cancelAnimationFrame(animation.current);
    closing.current = true;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (location.hash) history.pushState(null, '', location.pathname + location.search);
    const from = motion.current.opening;
    const start = performance.now();
    if (reducedMotion) motion.current.opening = 0;
    setScene('home');
    const tick = (now: number) => {
      motion.current.opening = clamp01(from - (now - start) / (LID_DURATION * 1000));
      if (motion.current.opening > 0) animation.current = requestAnimationFrame(tick);
    };
    if (!reducedMotion) animation.current = requestAnimationFrame(tick);
    document.querySelector<HTMLButtonElement>('.wordmark')?.focus({ preventScroll: true });
  }, [reducedMotion]);

  useEffect(() => {
    const measure = () => {
      tops.current = experiences.map(item => {
        const element = document.getElementById(chapterId(item.id));
        return element ? element.getBoundingClientRect().top + scrollY : Infinity;
      });
      sync();
    };
    const onScroll = () => {
      // Actual scrolling takes over from the timed opening; no wheel/touch interception.
      if (!(closing.current && window.scrollY === 0)) {
        cancelAnimationFrame(animation.current);
        closing.current = false;
      }
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = requestAnimationFrame(sync);
    };
    const onHistory = () => {
      const chapter = experiences.find(item => item.pinCase && item.entries.some(entry => location.hash === `#story-${entry.id}`));
      const entry = chapter?.entries.find(entry => location.hash === `#story-${entry.id}`);
      if (chapter && entry) { select(chapter.id, false, entry.id); return; }
      const item = location.hash === '#experience-targetmol' ? experiences.find(item => item.id === 'work') : experiences.find(item => location.hash === `#${chapterId(item.id)}`);
      if (item) select(item.id, false);
      else window.scrollTo({ top: 0, behavior: 'instant' });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.querySelector('.journey')!);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);
    measure();
    if (!restoredInitialHash.current) {
      restoredInitialHash.current = true;
      if (location.hash) onHistory();
    }
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      window.removeEventListener('popstate', onHistory);
      window.removeEventListener('hashchange', onHistory);
      cancelAnimationFrame(scrollFrame.current);
    };
  }, [sync, select]);

  useEffect(() => {
    if (!reducedMotion || motion.current.opening <= 0 || motion.current.opening >= 1) return;
    cancelAnimationFrame(animation.current);
    motion.current.opening = closing.current ? 0 : 1;
    sync();
  }, [reducedMotion, sync]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (scene === 'detail' || scrollY > 0) home();
      else if (scene === 'collection') close();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [scene, home, close]);

  return { motion, scene, selectedId, open, select, home, close };
}
