import { webImage } from './web-images.ts';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, SkipBack, SkipForward } from '@phosphor-icons/react';
import { tracks } from './content';

type Playback = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function MusicPlayer({ active, artEnabled }: { active: boolean; artEnabled: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Playback>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const track = tracks[index];
  const playing = status === 'playing';

  function pause() {
    request.current++;
    clearTimeout(deadline.current);
    audio.current?.pause();
    setStatus('paused');
  }

  function play(next = index) {
    const player = audio.current;
    if (!player) return;
    const token = ++request.current;
    clearTimeout(deadline.current);
    player.pause();
    setIndex(next);
    if (player.getAttribute('src') !== tracks[next].preview) {
      player.src = tracks[next].preview;
      setElapsed(0);
      setDuration(0);
    } else if (player.ended) player.currentTime = 0;
    setStatus('loading');
    deadline.current = setTimeout(() => {
      if (token !== request.current) return;
      request.current++;
      player.pause();
      setStatus('error');
    }, 15000);
    void player.play().then(() => {
      if (token !== request.current) return;
      clearTimeout(deadline.current);
      setStatus('playing');
    }).catch(() => {
      if (token !== request.current) return;
      clearTimeout(deadline.current);
      setStatus('error');
    });
  }

  useEffect(() => {
    if (!active) {
      request.current++;
      clearTimeout(deadline.current);
      audio.current?.pause();
      setStatus(previous => previous === 'idle' ? previous : 'paused');
    }
  }, [active]);
  useEffect(() => () => { request.current++; clearTimeout(deadline.current); }, []);

  return <div className="music-player">
    <div className="record-deck">
      <button className={`record-button ${playing ? 'is-playing' : ''}`} aria-label={`${playing ? '暂停' : status === 'loading' ? '取消试听' : '试听'} ${track.title}`} onClick={() => playing || status === 'loading' ? pause() : play()}>
        <img src={artEnabled ? webImage('/assets/chapters/music.png') : undefined} alt="" width="240" height="240" loading="lazy" />
        <span className="record-control">{playing ? <Pause weight="fill" aria-hidden="true" /> : <Play weight="fill" aria-hidden="true" />}</span>
      </button>
      <div className="record-caption">
        <span className="eyebrow">{status === 'loading' ? '加载试听…' : '最近在听'}</span>
        <h3>{track.title}</h3><p>{track.artist}</p>
        <div className="transport">
          <button aria-label="上一首" onClick={() => play((index + tracks.length - 1) % tracks.length)}><SkipBack size={19} weight="fill" aria-hidden="true" /></button>
          <button className="play-button" aria-label={playing ? '暂停试听' : status === 'loading' ? '取消试听' : '播放试听'} onClick={() => playing || status === 'loading' ? pause() : play()}>{playing ? <Pause size={18} weight="fill" aria-hidden="true" /> : <Play size={18} weight="fill" aria-hidden="true" />}<span>{playing ? '暂停' : status === 'loading' ? '取消' : '试听'}</span></button>
          <button aria-label="下一首" onClick={() => play((index + 1) % tracks.length)}><SkipForward size={19} weight="fill" aria-hidden="true" /></button>
        </div>
      </div>
    </div>
    <div className="playback-progress"><span>{clock(elapsed)}</span><input aria-label="试听进度" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(elapsed, duration || 1)} disabled={!duration} onChange={event => {
      if (audio.current) { audio.current.currentTime = Number(event.target.value); setElapsed(Number(event.target.value)); }
    }} /><span>{clock(duration)}</span></div>
    <div className="player-source"><span>Apple Music 试听</span><a href={track.url} target="_blank" rel="noreferrer">完整歌曲 <ArrowUpRight size={14} aria-hidden="true" /></a></div>
    {status === 'error' && <p className="audio-error" role="status">试听暂时无法加载，请重试或前往完整歌曲。</p>}
    <ol className="track-list">{tracks.map((item, i) => <li key={item.id}>
      <button className={`track-${item.id}`} aria-label={`${i === index && playing ? '暂停' : '试听'} ${item.title}，${item.artist}`} aria-pressed={i === index} onClick={() => i === index && (playing || status === 'loading') ? pause() : play(i)}>
        <img className="track-art" src={artEnabled ? item.art : undefined} alt="" aria-hidden="true" width="1536" height="1024" loading={active ? 'eager' : 'lazy'} decoding="async" />
        <span className="track-number">{i === index && playing ? <Pause size={16} weight="fill" aria-hidden="true" /> : String(i + 1).padStart(2, '0')}</span>
        <span className="track-copy"><strong>{item.title}</strong><small>{item.artist}</small><span className="track-mood">{item.mood}</span></span>
        <Play className="track-play" size={16} weight="fill" aria-hidden="true" />
      </button>
    </li>)}</ol>
    <audio ref={audio} preload="none" onTimeUpdate={event => setElapsed(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onEnded={() => { clearTimeout(deadline.current); setStatus('paused'); }} onError={() => { request.current++; clearTimeout(deadline.current); setStatus('error'); }} />
  </div>;
}
