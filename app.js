let allPerformances = [];
let fuse = null;
let ytPlayer = null;
let ytReady = false;
let pendingEntry = null;
let activeItem = null;
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
    list.appendChild(li);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function selectEntry(entry, itemEl) {
  if (activeItem) activeItem.classList.remove('active');
  activeItem = itemEl;
  itemEl.classList.add('active');

  document.getElementById('now-playing').hidden = false;
  document.getElementById('now-playing-title').textContent = entry.title;
  document.getElementById('now-playing-artist').textContent = entry.artist;
  document.getElementById('now-playing-stream').textContent = `${entry.videoDate} · ${entry.videoTitle}`;
  document.getElementById('yt-container').hidden = false;
  document.getElementById('player-placeholder').hidden = true;

  if (ytReady && ytPlayer) {
    loadVideo(entry);
  } else {
    pendingEntry = entry;
  }
}

function loadVideo(entry) {
  const params = { videoId: entry.videoId, startSeconds: entry.startTime };
  if (entry.endTime != null) params.endSeconds = entry.endTime;
  ytPlayer.loadVideoById(params);
}

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('yt-player', {
    playerVars: {
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
    },
    events: {
      onReady() {
        ytReady = true;
        if (pendingEntry) {
          loadVideo(pendingEntry);
          pendingEntry = null;
        }
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

document.addEventListener('DOMContentLoaded', async () => {
  const response = await fetch('data/performances.json');
  allPerformances = await response.json();

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
});
