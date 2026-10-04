import { useEffect, useState } from 'react';
import {preload} from 'react-dom';
import {webImage} from './web-images';
import {loadingPhase} from './loading-metrics';

export function SceneLoading({ pending, onContinue }: { pending: boolean; reducedMotion: boolean; onContinue?: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  const [slow, setSlow] = useState(false);
  // Resolve the current viewport after layout, then prioritize its existing CSS
  // background without requesting both compositions during initial navigation.
  if (!dismissed && typeof window !== 'undefined') preload(webImage(window.matchMedia('(max-width:760px), (max-aspect-ratio:1/1)').matches
    ? '/assets/web-images/loading-knit-layered-mobile.a721e6bc112d.webp' : '/assets/web-images/loading-knit-layered-desktop.70f6e042a1d5.webp'), {as:'image',fetchPriority:'high'});

  useEffect(() => {
    if (!pending || !onContinue) return;
    const timer = window.setTimeout(() => setSlow(true), 10000);
    return () => window.clearTimeout(timer);
  }, [pending, onContinue]);

  useEffect(() => {
    if (pending) return;
    // Reveal immediately once the full scene has actually rendered.
    setDismissed(true);
    loadingPhase('loading-dismissed');
  }, [pending]);

  if (dismissed) return null;
  return <div className={`scene-loading ${pending ? '' : 'is-leaving'}`} aria-hidden={!pending}>
    <div className="scene-loading-message" role="status" aria-live="polite">
      <p><span className="scene-loading-name">hoho</span><span className="scene-loading-copy">正在火速赶来…</span></p>
      <span className="scene-loading-cyclist" aria-hidden="true"><img src="/assets/web-images/loading-cyclist-wool.ff3056dab651.webp" alt="" width="768" height="384" /></span>
    </div>
    {pending && slow && onContinue && <button className="glass-button scene-loading-continue" onClick={onContinue}>查看经历</button>}
  </div>;
}
