import {openingImageURL} from './opening-images';
import { webImage } from './web-images.ts';
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CaretDown } from '@phosphor-icons/react';
import { contact, experiences, introduction, type Experience } from './content';
import { useMedia } from './usePreferences';
import { chapterId, useExperienceScroll } from './useExperienceScroll';
import { MusicPlayer } from './MusicPlayer';
import { SceneLoading } from './SceneLoading';
import headerArt from './header-art.json';
import { caseCharmPose } from './case-pin-motion';

const KnitScene = lazy(() => import('./Scene'));
const chapterStyle = (item: Experience) => ({ '--chapter-color': item.accent } as CSSProperties);

function ChapterIcon({ experience, className = '', enabled = true }: { experience: Experience; className?: string; enabled?: boolean }) {
  if (!experience.pinCase) return <img className={className} src={enabled ? openingImageURL(experience.image) : undefined} alt="" width="32" height="32" loading="lazy" />;
  const entries = experience.entries.filter(entry => entry.pin);
  return <span className={`work-icon ${className}`} aria-hidden="true">
    <img src={enabled ? openingImageURL(experience.image) : undefined} alt="" />
    {entries.slice(0, 6).map((entry, index) => {
      const pose = caseCharmPose(index, entries.length, false, experience.pinCase!);
      return <img key={entry.id} src={enabled ? openingImageURL(entry.pin!.image) : undefined} alt="" style={{ left: `${50 + pose.x / 1.05 * 100}%`, top: `${50 - pose.y / 1.05 * 100}%`, width: `${pose.scale * 100}%`, height: `${pose.scale * 100}%`, transform: 'translate(-50%, -50%)' }} />;
    })}
  </span>;
}

function KnitLabelArt({ kind, enabled }: { kind: keyof typeof headerArt; enabled: boolean }) {
  const art = headerArt[kind];
  return <svg className="knit-label-art" viewBox={art.viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <image href={enabled ? openingImageURL(webImage(art.src)) : undefined} width={art.width} height={art.height} />
  </svg>;
}

// Keep simplified-Chinese punctuation low on the baseline; the TC display face centers it.
function HeadingText({ children }: { children: string }) {
  return children.split(/([，。])/).map((part, index) => /[，。]/.test(part)
    ? <span className="heading-punctuation" key={index}>{part}</span> : part);
}

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Scene failed to load', error, info.componentStack); this.props.onError(); }
  render() { return this.state.error ? null : this.props.children; }
}

function ExperienceBody({ experience, active, artEnabled }: { experience: Experience; active: boolean; artEnabled: boolean }) {
  // Reserve the existing art boxes, but give the opening scene the network first.
  return <>
    <header className="chapter-heading">
      <div className="chapter-kicker"><span>{experience.company}</span><span className="eyebrow">{experience.kind}</span></div>
      <h2 id={`${chapterId(experience.id)}-title`} tabIndex={-1}><HeadingText>{experience.title}</HeadingText></h2>
      <ChapterIcon experience={experience} className="chapter-stamp" enabled={artEnabled} />
    </header>
    {experience.entries.map(entry => <section className={`story-entry entry-${entry.id}`} key={entry.id} id={`story-${entry.id}`} aria-labelledby={`title-${entry.id}`}>
      <img className="entry-art" src={artEnabled ? entry.art : undefined} alt="" aria-hidden="true" width="1536" height="1024" loading={active ? 'eager' : 'lazy'} decoding="async" />
      <div className="entry-heading">
        {experience.pinCase && entry.pin
          ? <div className="story-entry-title"><span className="story-pin-anchor" data-story-pin-anchor={entry.id} aria-hidden="true"><img src={artEnabled ? openingImageURL(entry.pin.image) : undefined} alt="" width="56" height="56" /></span><h3 id={`title-${entry.id}`} tabIndex={-1}><HeadingText>{entry.title}</HeadingText></h3></div>
          : <h3 id={`title-${entry.id}`} tabIndex={-1}><HeadingText>{entry.title}</HeadingText></h3>}
        {entry.place && <span className="entry-place">{entry.place}</span>}
      </div>
      {(entry.subtitle || entry.period) && <div className="entry-meta">{entry.subtitle && <p>{entry.subtitle}</p>}{entry.period && <span>{entry.period}</span>}</div>}
      {entry.summary && <p className="school-thought">{entry.summary}</p>}
      {entry.bullets && <ul className="story-points">{entry.bullets.map(point => <li key={point}>{point.split(/(vibe coding|https:\/\/[^\s，。；！？]+)/).map((part, index) => part.startsWith('https://')
        ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>
        : part === 'vibe coding' ? <strong key={index}>{part}</strong> : part)}</li>)}</ul>}
    </section>)}
    {experience.id === 'music' && <MusicPlayer active={active} artEnabled={artEnabled} />}
  </>;
}

export default function App() {
  const mobile = useMedia('(max-width: 760px), (max-aspect-ratio: 1/1)');
  const systemReducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = systemReducedMotion || (import.meta.env.DEV && new URLSearchParams(location.search).has('test-reduced-motion'));
  const { motion, scene, selectedId, open, select, home, close } = useExperienceScroll(reducedMotion, mobile);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [failed, setFailed] = useState(false);
  const onFailure = useCallback(() => setFailed(true), []);
  const loadingPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('test-loading');
  const loading = loadingPreview || (!ready && !failed);
  const continueWithoutScene = useCallback(() => { setFailed(true); select(experiences[0].id); }, [select]);
  const experience = experiences.find(item => item.id === selectedId) ?? experiences[0];
  const directory = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!loading) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = previous; };
  }, [loading]);

  useEffect(() => {
    const nav = directory.current;
    const link = nav?.querySelector<HTMLElement>('[aria-current]');
    if (!mobile || scene !== 'detail' || !nav || !link) return;
    // Keep the current chapter visible without scrolling the document itself.
    const delta = link.getBoundingClientRect().left - nav.getBoundingClientRect().left;
    nav.scrollTo({ left: nav.scrollLeft + delta - (nav.clientWidth - link.offsetWidth) / 2, behavior: reducedMotion ? 'instant' : 'smooth' });
  }, [mobile, reducedMotion, scene, selectedId]);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) setFailed(true);
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  }, []);

  const cleanCapture = import.meta.env.DEV && new URLSearchParams(location.search).has('test-clean');
  return <main className={`app state-${scene} ${ready ? 'scene-ready' : ''} ${failed ? 'scene-failed' : ''} ${reducedMotion ? 'reduce-motion' : ''} ${cleanCapture ? 'qa-clean' : ''}`} data-state={scene}>
    <SceneLoading pending={loading} reducedMotion={reducedMotion} onContinue={loadingPreview ? undefined : continueWithoutScene} />
    <div className="app-content" inert={loading} aria-busy={loading}>
    <a className="skip-link" href={`#${chapterId(experiences[0].id)}`} onClick={event => { event.preventDefault(); select(experiences[0].id); }}>跳到正文</a>
    <div className="scene-stage">
      {failed && <div className="poster" aria-hidden="true" />}
      {!failed && !loadingPreview && <div className="scene-canvas" inert={!ready}><SceneBoundary onError={onFailure}><Suspense fallback={null}>
        <KnitScene state={scene} motion={motion} mobile={mobile} reducedMotion={reducedMotion} selected={experience} onOpen={open} onSelect={select} onReady={onReady} onFailure={onFailure} />
      </Suspense></SceneBoundary></div>}
      <div className="scene-shade" aria-hidden="true" />
      <section className="hero-copy" aria-hidden={scene !== 'home'}>
        <h1>About <em>hoho</em></h1>
        <p className="hero-intro" lang="en">{introduction}</p>
        <CaretDown className="hero-scroll-cue" size={25} weight="light" aria-hidden="true" />
      </section>
      {scene === 'detail' && (!ready || failed) && <ChapterIcon experience={experience} className="reading-fallback-pin" />}
    </div>
    <header className="site-header">
      <button className="wordmark knit-label" onClick={home} aria-label="HoHo，返回首页"><KnitLabelArt kind="hoho" enabled={!loading} /><span className="sr-only">HoHo</span></button>
      <div className="header-actions">
        <a className="contact-link knit-label" href={`mailto:${contact.email}`}><KnitLabelArt kind="contact" enabled={!loading} /><span className="sr-only">{contact.label}</span></a>
      </div>
    </header>
    {scene === 'collection' && <button className="scene-back" onClick={close}><ArrowLeft size={17} aria-hidden="true" /><span>收起收藏瓶</span></button>}
    {failed && scene !== 'detail' && <div className="fallback-controls"><button className="glass-button" onClick={() => select(experiences[0].id)}>查看经历 <ArrowRight size={17} aria-hidden="true" /></button></div>}
    <div className="hero-spacer" aria-hidden="true" />
    <div className="journey">
      <nav ref={directory} className="chapter-nav" aria-label="章节目录" hidden={scene !== 'detail'}>
        <ol>{experiences.map(item => <li key={item.id} style={chapterStyle(item)}>
          <a href={`#${chapterId(item.id)}`} aria-current={selectedId === item.id ? 'location' : undefined} onClick={event => { event.preventDefault(); select(item.id); }}>
            <ChapterIcon experience={item} className={item.badge === 'flask' ? 'flask-icon' : ''} enabled={!loading} /><span>{item.company}</span>
          </a>
        </li>)}</ol>
      </nav>
      <div className="experience-chapters">
        {experiences.map((item, index) => <article className={`experience-chapter chapter-${item.id}`} style={chapterStyle(item)} id={chapterId(item.id)} aria-labelledby={`${chapterId(item.id)}-title`} key={item.id}>
          <ExperienceBody experience={item} active={scene === 'detail' && selectedId === item.id} artEnabled={!loading} />
          {index === experiences.length - 1 && <button className="detail-return" onClick={home}><ArrowLeft size={18} aria-hidden="true" /> 返回收藏瓶</button>}
        </article>)}
      </div>
    </div>
    <div className="story-pin-layer" aria-hidden="true">
      {experiences.filter(item => item.pinCase).flatMap(item => item.entries.filter(entry => entry.pin).map(entry =>
        <img key={entry.id} className="story-pin-flight" data-story-pin={entry.id} src={!loading ? openingImageURL(entry.pin!.image) : undefined} alt="" width="64" height="64" />))}
    </div>
    <div className="sr-only" role="status" aria-live="polite">{scene === 'detail' ? experience.company : ''}</div>
    </div>
  </main>;
}
