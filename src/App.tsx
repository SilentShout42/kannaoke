import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';

interface Performance {
  title: string;
  artist: string;
  videoId: string;
  videoTitle: string;
  videoDate: string;
  startTime: number;
  endTime: number | null;
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
  const resultsRef = useRef<HTMLUListElement | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/performances.json')
      .then(r => r.json())
      .then((data: Performance[]) => {
        setPerformances(data);
        fuseRef.current = new Fuse(data, {
          keys: ['title', 'artist', 'videoTitle'],
          threshold: 0.4,
          includeScore: true,
        });
        const initial = data[Math.floor(Math.random() * data.length)];
        setActiveEntry(initial);

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
                if (pendingRef.current) {
                  ytPlayerRef.current!.loadVideoById(videoParams(pendingRef.current));
                  pendingRef.current = null;
                }
              },
              onStateChange({ data }: { data: number }) {
                const { PLAYING, PAUSED, ENDED, CUED } = window.YT.PlayerState;
                if ([PLAYING, PAUSED, ENDED, CUED].includes(data)) setLoadingYT(false);
              },
            },
          });
        };

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      });
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

  function selectEntry(entry: Performance) {
    setActiveEntry(entry);
    setLoadingYT(true);
    if (ytReadyRef.current) {
      ytPlayerRef.current!.loadVideoById(videoParams(entry));
    } else {
      pendingRef.current = entry;
    }
  }

  const sorted = query.trim()
    ? (fuseRef.current?.search(query).map(r => r.item) ?? [])
    : [...performances].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <>
      <header>
        <h1>Kannaoke</h1>
        <p className="subtitle">The Kanna Yanagi 🦆🔍 Karaoke Index</p>
      </header>

      <main ref={e => { mainRef.current = e; }}>
        <section className="results-panel" ref={e => { panelRef.current = e; }}>
          <div className="search-bar">
            <input
              type="search"
              placeholder="Search songs or artists..."
              autoComplete="off"
              spellCheck={false}
              onChange={e => setQuery(e.target.value)}
            />
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
                    <div className="song-stream">{entry.videoDate} · {entry.videoTitle}</div>
                  </div>
                  <span className="time-badge">{timeLabel(entry)}</span>
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

      <footer>
        <p>Made by Kamos!</p>
      </footer>
    </>
  );
}
