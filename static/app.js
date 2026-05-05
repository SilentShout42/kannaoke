let allPerformances = [];
let fuse = null;
let ytPlayer = null;
let ytPlayerReady = false;
let pendingEntry = null;  // entry to play (with autoplay) once the player is ready
let activeEntry = null;   // currently selected entry (survives re-renders)
let activeItem = null;    // the active <li> DOM node
let debounceTimer = null;

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function timeLabel(entry) {
  if (entry.endTime != null) {
    return `${formatTime(entry.startTime)} – ${formatTime(entry.endTime)}`;
  }
  return formatTime(entry.startTime);
}

function renderResults(entries) {
  const list = document.getElementById('results');
  const countEl = document.getElementById('result-count');

  list.innerHTML = '';
  activeItem = null;

  if (entries.length === 0) {
    list.innerHTML = '<li class="no-results">No songs found</li>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${entries.length} song${entries.length !== 1 ? 's' : ''}`;

  entries.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.setAttribute('role', 'listitem');
    li.innerHTML = `
      <div class="result-text">
        <div class="song-title">${escapeHtml(entry.title)}</div>
        <div class="song-artist">${escapeHtml(entry.artist)}</div>
        <div class="song-stream">${escapeHtml(entry.videoDate)} · ${escapeHtml(entry.videoTitle)}</div>
      </div>
      <span class="time-badge">${timeLabel(entry)}</span>
    `;
    li.addEventListener('click', () => selectEntry(entry, li));
    if (entry === activeEntry) {
      li.classList.add('active');
      activeItem = li;
    }
    list.appendChild(li);
  });

  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' });
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setNowPlaying(entry) {
  document.getElementById('now-playing').hidden = false;
  document.getElementById('now-playing-title').textContent = entry.title;
  document.getElementById('now-playing-artist').textContent = entry.artist;
  document.getElementById('now-playing-stream').textContent = `${entry.videoDate} · ${entry.videoTitle}`;
}

function selectEntry(entry, itemEl) {
  if (activeItem) activeItem.classList.remove('active');
  activeEntry = entry;
  activeItem = itemEl;
  itemEl.classList.add('active');
  setNowPlaying(entry);
  setLoading(true);
  if (ytPlayerReady) {
    loadVideo(entry);
  } else {
    pendingEntry = entry;
  }
}

function setLoading(on) {
  document.getElementById('yt-loading').hidden = !on;
}

function videoParams(entry) {
  const p = { videoId: entry.videoId, startSeconds: entry.startTime };
  if (entry.endTime != null) p.endSeconds = entry.endTime;
  return p;
}

function loadVideo(entry) {
  ytPlayer.loadVideoById(videoParams(entry));
}

function cueVideo(entry) {
  ytPlayer.cueVideoById(videoParams(entry));
}

// Called by the YouTube IFrame API once its script has loaded.
// By this point activeEntry is already set (we inject the script after the data fetch),
// so we can pass videoId directly in the constructor — the approach the docs recommend.
window.onYouTubeIframeAPIReady = function () {
  const entry = pendingEntry || activeEntry;
  pendingEntry = null;

  const playerVars = {
    videoId: entry.videoId,
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
    start: entry.startTime,
  };
  if (entry.endTime != null) playerVars.end = entry.endTime;

  ytPlayer = new YT.Player('yt-player', {
    videoId: entry.videoId,
    playerVars,
    events: {
      onReady() {
        ytPlayerReady = true;
        // pendingEntry means the user clicked a different song while the player was loading
        if (pendingEntry) {
          loadVideo(pendingEntry);
          pendingEntry = null;
        }
      },
      onStateChange({ data }) {
        const { PLAYING, PAUSED, ENDED, CUED } = YT.PlayerState;
        if (data === PLAYING || data === PAUSED || data === ENDED || data === CUED) {
          setLoading(false);
        }
        // UNSTARTED (-1) fires immediately on loadVideoById before buffering begins;
        // leave the spinner alone so it doesn't flash off between states.
      },
    },
  });
};

function doSearch(query) {
  if (!query.trim()) {
    renderResults([...allPerformances].sort((a, b) => a.title.localeCompare(b.title)));
    return;
  }
  const results = fuse.search(query).map(r => r.item);
  renderResults(results);
}

function initResizeHandle() {
  const handle = document.getElementById('resize-handle');
  const panel = document.querySelector('.results-panel');
  const main = document.querySelector('main');
  let dragging = false;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = main.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    panel.style.width = Math.max(180, Math.min(newWidth, rect.width - 300)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initResizeHandle();
  const response = await fetch('performances.json');
  allPerformances = await response.json();

  activeEntry = allPerformances[Math.floor(Math.random() * allPerformances.length)];
  setNowPlaying(activeEntry);
  fuse = new Fuse(allPerformances, {
    keys: ['title', 'artist', 'videoTitle'],
    threshold: 0.4,
    includeScore: true,
  });

  renderResults([...allPerformances].sort((a, b) => a.title.localeCompare(b.title)));

  document.getElementById('search').addEventListener('input', e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(e.target.value), 200);
  });

  // Inject the YouTube IFrame API script now that activeEntry is set.
  // onYouTubeIframeAPIReady will fire after this script loads and will find
  // activeEntry ready to pass as videoId to the YT.Player constructor.
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
});
