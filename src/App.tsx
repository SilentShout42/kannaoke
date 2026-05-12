import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';
import {
  IconDice1Filled, IconDice2Filled, IconDice3Filled,
  IconDice4Filled, IconDice5Filled, IconDice6Filled, IconDiscFilled, IconLockSquareRoundedFilled, IconX,
  IconSun, IconMoon, IconMailHeart,
} from '@tabler/icons-react';
import LiteYouTubeEmbed from 'react-lite-youtube-embed';
import 'react-lite-youtube-embed/dist/LiteYouTubeEmbed.css';

import { formatDate } from './formatDate';

const DICE_ICONS = [
  IconDice1Filled, IconDice2Filled, IconDice3Filled,
  IconDice4Filled, IconDice5Filled, IconDice6Filled,
];

const LITE_PLAYER = false;

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

function videoParams(entry: Performance) {
  const p: { videoId: string; startSeconds: number; endSeconds?: number } = {
    videoId: entry.videoId,
    startSeconds: entry.startTime,
  };
  if (entry.endTime != null) p.endSeconds = entry.endTime;
  return p;
}

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


export default function App() {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [query, setQuery] = useState('');
  const [activeEntry, setActiveEntry] = useState<Performance | null>(null);


  const fuseRef = useRef<Fuse<Performance> | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const pendingRef = useRef<Performance | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLUListElement | null>(null);
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateScrollFade = () => {
    const el = resultsRef.current;
    const wrap = scrollWrapRef.current;
    if (!el || !wrap) return;
    wrap.classList.toggle('has-top', el.scrollTop > 0);
    wrap.classList.toggle('has-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  };

  const scrollActiveToSafeZone = () => {
    requestAnimationFrame(() => {
      const list = resultsRef.current;
      const item = list?.querySelector<HTMLElement>('.result-item.active');
      if (!list || !item) return;
      const fadeH = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3;
      const itemTop = item.offsetTop - list.scrollTop;
      const itemBottom = itemTop + item.offsetHeight;
      if (itemTop >= fadeH && itemBottom <= list.clientHeight - fadeH) return;
      const top = itemTop < fadeH
        ? item.offsetTop - fadeH
        : item.offsetTop + item.offsetHeight - list.clientHeight + fadeH;
      list.scrollTo({ top, behavior: 'smooth' });
    });
  };
  const [autoplay, setAutoplay] = useState(false);
  const pushNextNav = useRef(false);
  const [diceIndex, setDiceIndex] = useState(0);
  const [rolling, setRolling] = useState(false);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('theme') as 'dark' | 'light' | null)
      ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fuseOptions: IFuseOptions<Performance> = {
    keys: ['title', 'artist', 'videoTitle'],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    useExtendedSearch: true,
  };

  // Convert "quoted" or 'quoted' input to Fuse exact-include syntax ('term).
  const prepareQuery = (q: string): string => {
    const t = q.trim();
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      return "'" + t.slice(1, -1);
    }
    return q;
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
      const playParam = urlParams.get('autoplay') === '1';
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
        const queryPool = new Fuse(publicVideos, fuseOptions).search(prepareQuery(qParam)).map(r => r.item);
        if (queryPool.length > 0) {
          queryRandom = queryPool[0];
        }
      }

      const initial = matched ?? queryRandom ?? random;
      if (matched) {
        selectEntry(initial, playParam, false);
      } else {
        runDiceRoll(() => {
          selectEntry(initial, playParam, false);
        });
      }

      if (!LITE_PLAYER) {
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
          if (playParam) playerVars.autoplay = 1;
          ytPlayerRef.current = new window.YT.Player('yt-player', {
            videoId: entry.videoId,
            playerVars,
            events: {
              onReady() {
                ytReadyRef.current = true;
                setRolling(false);
                if (pendingRef.current) {
                  ytPlayerRef.current!.loadVideoById(videoParams(pendingRef.current));
                  pendingRef.current = null;
                }
              },
              onStateChange({ data }: { data: number }) {
                const { BUFFERING, CUED } = window.YT.PlayerState;
                if ([BUFFERING, CUED].includes(data)) setRolling(false);
              },
            },
          });
        };

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
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
          Fuse.parseIndex<Performance>(indexRaw as Parameters<typeof Fuse.parseIndex>[0]),
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

  useEffect(() => { scrollActiveToSafeZone(); }, [activeEntry]);

  useEffect(() => {
    document.title = activeEntry
      ? `${activeEntry.title} | Kannaoke`
      : 'Kannaoke';
  }, [activeEntry]);

  // Seed query from ?q= on mount
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setQuery(q);
  }, []);

  // Scroll results to top on new search; reveal active item when clearing
  useEffect(() => {
    if (query.trim()) {
      resultsRef.current?.scrollTo({ top: 0 });
    } else {
      scrollActiveToSafeZone();
    }
  }, [query]);

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

  // Sync active entry → URL (push for explicit user nav, replace otherwise)
  useEffect(() => {
    if (!activeEntry) return;
    const params = new URLSearchParams(window.location.search);
    params.set('v', activeEntry.videoId);
    params.set('t', String(activeEntry.startTime));
    const next = `?${params.toString()}`;
    if (window.location.search !== next) {
      if (pushNextNav.current) {
        history.pushState(null, '', next);
      } else {
        history.replaceState(null, '', next);
      }
    }
    pushNextNav.current = false;
  }, [activeEntry]);

  // Restore state on browser back/forward
  useEffect(() => {
    if (performances.length === 0) return;
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('v');
      const t = params.get('t');
      const q = params.get('q') ?? '';
      setQuery(q);
      if (v && t) {
        const entry = performances.find(p => p.videoId === v && p.startTime === Number(t));
        if (entry) selectEntry(entry, false, false);
      } else {
        setActiveEntry(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [performances]);

  function selectEntry(entry: Performance, play = true, push = true) {
    pushNextNav.current = push;
    if (LITE_PLAYER) {
      setAutoplay(play);
      setActiveEntry(entry);
    } else {
      setActiveEntry(entry);
      if (ytReadyRef.current) {
        ytPlayerRef.current!.loadVideoById(videoParams(entry));
      } else {
        pendingRef.current = entry;
      }
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
        setRolling(false);
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
    ? (fuseRef.current?.search(prepareQuery(query)) ?? [])
      .sort((a, b) => {
        const scoreA = a.score ?? Number.POSITIVE_INFINITY;
        const scoreB = b.score ?? Number.POSITIVE_INFINITY;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return byDate(a.item, b.item);
      })
      .map(r => r.item)
    : [...performances].sort(byDate);

  // Re-evaluate fade after every list change (data load, query, scroll-to-center)
  useEffect(() => { requestAnimationFrame(updateScrollFade); });

  return (
    <>
      <header>
        <div className="header-title">
          <h1><a className="home-link" href="/" onClick={e => { e.preventDefault(); setQuery(''); history.pushState(null, '', '/'); }}>Kannaoke</a></h1>
          <p className="subtitle">The Kanna Yanagi 🦆🔍 Karaoke Index</p>
        </div>
        <div className="header-actions">
          <button
            className={`dice-btn${rolling ? ' rolling' : ''}`}
            onClick={rollDice}
            aria-label="Play random song"
            title="Play random song"
          >
            {(() => { const Icon = DICE_ICONS[diceIndex]; return <Icon size={24} />; })()}
          </button>
          <button
            className="theme-btn"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <IconSun size={24} /> : <IconMoon size={24} />}
          </button>
          <a
            className="feedback-link"
            href="https://marshmallow-qa.com/wco0tcuk8ipq15i"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Send feedback"
            title="Send feedback"
          >
            <IconMailHeart size={24} />
          </a>
          </div>
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
          <div className="results-scroll-wrap" ref={scrollWrapRef}>
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
              updateScrollFade();
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
                  <img
                    className="song-thumb"
                    src={`https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    width={72}
                    height={40}
                  />
                  <div className="result-text">
                    <div className="song-title">{entry.title}</div>
                    <div className="song-artist">{entry.artist}</div>
                    <div className="song-stream">
                      <span className="song-stream-text">{formatDate(entry.videoDate)}</span>
                    </div>
                  </div>
                  <div className="result-meta">
                    {/cover/i.test(entry.videoTitle) && (
                      <span
                        className="cover-indicator"
                        role="img"
                        title="Cover song"
                        aria-label="Cover song"
                      >
                        <IconDiscFilled size={24} />
                      </span>
                    )}
                    {entry.membersOnly && (
                      <span
                        className="members-only-indicator"
                        role="img"
                        title="Members-only stream"
                        aria-label="Members-only stream"
                      >
                        <IconLockSquareRoundedFilled size={24} />
                      </span>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
          </div>
        </section>

        <div className="resize-handle" id="resize-handle" />

        <aside className="player-panel" id="player-panel">
          {activeEntry && (
            <div className="now-playing">
              <span className="now-playing-label">Now playing</span>
              <span className="now-playing-title">{activeEntry.title}</span>
              <span className="now-playing-artist">{activeEntry.artist}</span>
              <span className="now-playing-stream">
                {formatDate(activeEntry.videoDate)} · {activeEntry.videoTitle}
              </span>
            </div>
          )}
          <div className="yt-wrapper">
            <div className="yt-container">
              {LITE_PLAYER ? (
                activeEntry && (autoplay ? (
                  <iframe
                    key={`${activeEntry.videoId}-${activeEntry.startTime}`}
                    src={`https://www.youtube-nocookie.com/embed/${activeEntry.videoId}?autoplay=1&start=${activeEntry.startTime}${activeEntry.endTime != null ? `&end=${activeEntry.endTime}` : ''}&rel=0&playsinline=1`}
                    title={activeEntry.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <LiteYouTubeEmbed
                    key={`${activeEntry.videoId}-${activeEntry.startTime}`}
                    id={activeEntry.videoId}
                    title={activeEntry.title}
                    noCookie={true}
                    poster="maxresdefault"
                    params={`start=${activeEntry.startTime}${activeEntry.endTime != null ? `&end=${activeEntry.endTime}` : ''}&rel=0&playsinline=1`}
                  />
                ))
              ) : (
                <div id="yt-player" />
              )}
            </div>
          </div>
        </aside>
      </main>
    </>
  );
}
