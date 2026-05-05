import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';
import {
  IconDice1Filled, IconDice2Filled, IconDice3Filled,
  IconDice4Filled, IconDice5Filled, IconDice6Filled, IconDiscFilled, IconLockSquareRoundedFilled, IconX,
} from '@tabler/icons-react';

const DICE_ICONS = [
  IconDice1Filled, IconDice2Filled, IconDice3Filled,
  IconDice4Filled, IconDice5Filled, IconDice6Filled,
];

interface Performance {
  title: string;
  artist: string;
  videoId: string;
  videoTitle: string;
  videoDate: string;
  startTime: number;
  endTime: number | null;
  membersOnly: boolean;
}

declare global {
  interface Window {
    YT: {
      Player: new (el: string, opts: unknown) => YTPlayer;
      PlayerState: Record<string, number>;
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  loadVideoById(params: { videoId: string; startSeconds: number; endSeconds?: number }): void;
  cueVideoById(params: { videoId: string; startSeconds: number; endSeconds?: number }): void;
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

function timeLabel(e: Performance): string {
  return e.endTime != null
    ? `${formatTime(e.startTime)} – ${formatTime(e.endTime)}`
    : formatTime(e.startTime);
}

function videoParams(entry: Performance) {
  const p: { videoId: string; startSeconds: number; endSeconds?: number } = {
    videoId: entry.videoId,
    startSeconds: entry.startTime,
  };
  if (entry.endTime != null) p.endSeconds = entry.endTime;
  return p;
}

export default function App() {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [query, setQuery] = useState('');
  const [activeEntry, setActiveEntry] = useState<Performance | null>(null);
  const [loadingYT, setLoadingYT] = useState(false);

  const fuseRef = useRef<Fuse<Performance> | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const pendingRef = useRef<Performance | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLUListElement | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [diceIndex, setDiceIndex] = useState(0);
  const [rolling, setRolling] = useState(false);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fuseOptions: IFuseOptions<Performance> = {
    keys: ['title', 'artist', 'videoTitle'],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: false,
  };

  useEffect(() => {
    let cancelled = false;

    const initializeApp = (data: Performance[]) => {
      if (cancelled) return;

      setPerformances(data);

      // Filter to public, non-cover videos for random selection
      const publicVideos = data.filter(p => !p.membersOnly && !/cover/i.test(p.videoTitle));
      const randomPool = publicVideos.length > 0 ? publicVideos : data;
      const random = randomPool[Math.floor(Math.random() * randomPool.length)];

      const urlParams = new URLSearchParams(window.location.search);
      const vParam = urlParams.get('v');
      const tParam = urlParams.get('t');
      const qParam = urlParams.get('q')?.trim() ?? '';
      const matched = vParam && tParam
        ? data
          .filter(p => p.videoId === vParam)
          .reduce<Performance | undefined>((best, p) => {
            if (!best) return p;
            return Math.abs(p.startTime - Number(tParam)) < Math.abs(best.startTime - Number(tParam)) ? p : best;
          }, undefined)
        : undefined;

      let queryRandom: Performance | undefined;
      if (!matched && qParam && !vParam && !tParam) {
        const queryPool = new Fuse(publicVideos, fuseOptions).search(qParam).map(r => r.item);
        if (queryPool.length > 0) {
          queryRandom = queryPool[Math.floor(Math.random() * queryPool.length)];
        }
      }

      const initial = matched ?? queryRandom ?? random;
      if (matched) {
        setActiveEntry(initial);
      } else {
        runDiceRoll(() => {
          setActiveEntry(initial);
        });
      }

      window.onYouTubeIframeAPIReady = () => {
        const entry = pendingRef.current ?? initial;
        pendingRef.current = null;
        const playerVars: Record<string, unknown> = {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: entry.startTime,
        };
        if (entry.endTime != null) playerVars.end = entry.endTime;
        ytPlayerRef.current = new window.YT.Player('yt-player', {
          videoId: entry.videoId,
          playerVars,
          events: {
            onReady() {
              ytReadyRef.current = true;
              setRolling(false);
              setLoadingYT(false);
              if (pendingRef.current) {
                ytPlayerRef.current!.loadVideoById(videoParams(pendingRef.current));
                pendingRef.current = null;
              }
            },
            onStateChange({ data }: { data: number }) {
              const { PLAYING, PAUSED, ENDED, CUED, BUFFERING } = window.YT.PlayerState;
              if ([BUFFERING, CUED].includes(data)) {
                setRolling(false);
              }
              if ([PLAYING, PAUSED, ENDED, CUED].includes(data)) {
                setLoadingYT(false);
              }
            },
          },
        });
      };

      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    };

    const loadData = async () => {
      try {
        const [dataRes, indexRes] = await Promise.all([
          fetch('/performances.min.json'),
          fetch('/performances.fuse-index.json'),
        ]);

        if (!dataRes.ok || !indexRes.ok) {
          throw new Error('prebuilt data unavailable');
        }

        const [data, indexRaw] = await Promise.all([
          dataRes.json() as Promise<Performance[]>,
          indexRes.json(),
        ]);

        const markedData = data.map(p => ({
          ...p,
          membersOnly: p.membersOnly === true,
        }));

        if (cancelled) return;
        fuseRef.current = new Fuse(
          markedData,
          fuseOptions,
          Fuse.parseIndex<Performance>(indexRaw),
        );
        initializeApp(markedData);
      } catch {
        const fallbackRes = await fetch('/performances.json');
        const fallbackData = (await fallbackRes.json()) as Performance[];
        const markedFallbackData = fallbackData.map(p => ({
          ...p,
          membersOnly: p.membersOnly === true,
        }));
        if (cancelled) return;
        fuseRef.current = new Fuse(markedFallbackData, fuseOptions);
        initializeApp(markedFallbackData);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Drag-to-resize
  useEffect(() => {
    const handle = document.getElementById('resize-handle');
    const panel = panelRef.current;
    const main = mainRef.current;
    if (!handle || !panel || !main) return;

    let dragging = false;
    const onDown = (e: MouseEvent) => {
      dragging = true;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const rect = main.getBoundingClientRect();
      panel.style.width = Math.max(180, Math.min(e.clientX - rect.left, rect.width - 300)) + 'px';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      handle.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    document.querySelector('#results .result-item.active')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeEntry]);

  // Seed query from ?q= on mount
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setQuery(q);
  }, []);

  // Sync query → URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (query.trim()) {
      params.set('q', query);
    } else {
      params.delete('q');
    }
    const next = params.toString() ? `?${params.toString()}` : window.location.pathname;
    const current = window.location.search || '';
    const expected = params.toString() ? `?${params.toString()}` : '';
    if (current !== expected) history.replaceState(null, '', next);
  }, [query]);

  // Sync active entry → URL
  useEffect(() => {
    if (!activeEntry) return;
    const params = new URLSearchParams(window.location.search);
    params.set('v', activeEntry.videoId);
    params.set('t', String(activeEntry.startTime));
    const next = `?${params.toString()}`;
    if (window.location.search !== next) history.replaceState(null, '', next);
  }, [activeEntry]);

  function selectEntry(entry: Performance) {
    setActiveEntry(entry);
    setLoadingYT(true);
    if (ytReadyRef.current) {
      ytPlayerRef.current!.loadVideoById(videoParams(entry));
    } else {
      pendingRef.current = entry;
    }
  }

  function runDiceRoll(onComplete: () => void) {
    if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
    setRolling(true);
    let ticks = 0;
    const total = 10;
    rollIntervalRef.current = setInterval(() => {
      setDiceIndex(Math.floor(Math.random() * 6));
      ticks++;
      if (ticks >= total) {
        clearInterval(rollIntervalRef.current!);
        rollIntervalRef.current = null;
        onComplete();
      }
    }, 60);
  }

  function rollDice() {
    const publicVideos = performances.filter(p => !p.membersOnly && !/cover/i.test(p.videoTitle));
    if (rolling || publicVideos.length === 0) return;
    runDiceRoll(() => {
      const entry = publicVideos[Math.floor(Math.random() * publicVideos.length)];
      selectEntry(entry);
    });
  }

  const byDate = (a: Performance, b: Performance) => {
    const dateCmp = b.videoDate.localeCompare(a.videoDate);
    if (dateCmp !== 0) return dateCmp;
    const videoCmp = a.videoId.localeCompare(b.videoId);
    if (videoCmp !== 0) return videoCmp;
    return a.startTime - b.startTime;
  };
  const sorted = query.trim()
    ? (fuseRef.current?.search(query) ?? [])
      .sort((a, b) => {
        const scoreA = a.score ?? Number.POSITIVE_INFINITY;
        const scoreB = b.score ?? Number.POSITIVE_INFINITY;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return byDate(a.item, b.item);
      })
      .map(r => r.item)
    : [...performances].sort(byDate);

  return (
    <>
      <header>
        <h1><a className="home-link" href="/" onClick={e => { e.preventDefault(); setQuery(''); setActiveEntry(null); history.pushState(null, '', '/'); }}>Kannaoke</a></h1>
        <p className="subtitle">The Kanna Yanagi 🦆🔍 Karaoke Index</p>
        <button
          className={`dice-btn${rolling ? ' rolling' : ''}`}
          onClick={rollDice}
          aria-label="Play random song"
          title="Play random song"
        >
          {(() => { const Icon = DICE_ICONS[diceIndex]; return <Icon size={28} />; })()}
        </button>
      </header>

      <main ref={e => { mainRef.current = e; }}>
        <section className="results-panel" ref={e => { panelRef.current = e; }}>
          <div className="search-bar">
            <div className="search-input-wrap">
              <input
                ref={searchInputRef}
                type="search"
                placeholder="Search songs or artists..."
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query.trim() && (
                <button
                  type="button"
                  className="search-clear-btn"
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                >
                  <IconX size={15} stroke={2.2} />
                </button>
              )}
            </div>
            <span className="result-count">
              {sorted.length > 0
                ? `${sorted.length} song${sorted.length !== 1 ? 's' : ''}`
                : ''}
            </span>
          </div>
          <ul
            id="results"
            role="list"
            ref={resultsRef}
            onScroll={() => {
              const el = resultsRef.current;
              if (!el) return;
              el.classList.add('is-scrolling');
              if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
              scrollTimerRef.current = setTimeout(() => el.classList.remove('is-scrolling'), 1000);
            }}
          >
            {sorted.length === 0 ? (
              <li className="no-results">No songs found</li>
            ) : (
              sorted.map((entry, i) => (
                <li
                  key={`${entry.videoId}-${entry.startTime}-${i}`}
                  className={`result-item${entry === activeEntry ? ' active' : ''}`}
                  role="listitem"
                  onClick={() => selectEntry(entry)}
                >
                  <div className="result-text">
                    <div className="song-title">{entry.title}</div>
                    <div className="song-artist">{entry.artist}</div>
                    <div className="song-stream">
                      <span className="song-stream-text">{entry.videoDate} · {entry.videoTitle}</span>
                    </div>
                  </div>
                  <div className="result-meta">
                    {/cover/i.test(entry.videoTitle) && (
                      <span
                        className="cover-indicator"
                        title="Cover song"
                        aria-label="Cover song"
                      >
                        <IconDiscFilled size={24} />
                      </span>
                    )}
                    {entry.membersOnly && (
                      <span
                        className="members-only-indicator"
                        title="Members-only stream"
                        aria-label="Members-only stream"
                      >
                        <IconLockSquareRoundedFilled size={24} />
                      </span>
                    )}
                    <span className="time-badge">{timeLabel(entry)}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <div className="resize-handle" id="resize-handle" />

        <aside className="player-panel" id="player-panel">
          {activeEntry && (
            <div className="now-playing">
              <span className="now-playing-label">Now playing</span>
              <span className="now-playing-title">{activeEntry.title}</span>
              <span className="now-playing-artist">{activeEntry.artist}</span>
              <span className="now-playing-stream">
                {activeEntry.videoDate} · {activeEntry.videoTitle}
              </span>
            </div>
          )}
          <div className="yt-container">
            <div id="yt-player" />
            {loadingYT && (
              <div className="yt-loading">
                <div className="yt-spinner" />
              </div>
            )}
          </div>
        </aside>
      </main>
    </>
  );
}
