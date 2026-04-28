// ============ YT Archive System v2.0 ============
// Features: Favorites, Date Filter, Bulk Actions, Export/Import, Tags, Dark Mode, Auto Sync Toggle

// ============ Storage Service ============
var STORAGE_KEY = 'videos';
var SETTINGS_KEY = 'yt-archive-settings';
var VALID_YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;

function isValidYouTubeUrl(url) {
  return VALID_YOUTUBE_REGEX.test(url);
}

function generateId() {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var id = '';
  for (var i = 0; i < 11; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function normalizeText(text) {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u064B-\u065F\u0670]/g, '').toLowerCase().trim();
}

function saveVideo(videoData) {
  if (!videoData || !videoData.url || !videoData.title || !videoData.thumbnail) {
    throw new Error('Video must have url, title, and thumbnail properties');
  }
  if (!isValidYouTubeUrl(videoData.url)) {
    throw new Error('Invalid YouTube URL');
  }
  var video = {
    id: generateId(),
    url: videoData.url,
    title: videoData.title,
    thumbnail: videoData.thumbnail,
    tags: videoData.tags || [],
    favorite: false,
    savedAt: new Date().toISOString()
  };
  var archive = loadArchive();
  archive.unshift(video);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
  return video;
}

function loadArchive() {
  var data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    var videos = JSON.parse(data);
    return videos.sort(function(a, b) {
      return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    });
  } catch (error) {
    console.error('Error parsing video archive:', error);
    return [];
  }
}

function deleteVideo(videoId) {
  var archive = loadArchive();
  var filtered = archive.filter(function(v) { return v.id !== videoId; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

function updateVideo(videoId, updates) {
  var archive = loadArchive();
  var video = archive.find(function(v) { return v.id === videoId; });
  if (video) {
    Object.assign(video, updates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
  }
  return archive;
}

function toggleFavorite(videoId) {
  var archive = loadArchive();
  var video = archive.find(function(v) { return v.id === videoId; });
  if (video) {
    video.favorite = !video.favorite;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
  }
  return archive;
}

function searchArchive(query) {
  if (!query || query.trim() === '') return loadArchive();
  var normalizedQuery = normalizeText(query);
  var archive = loadArchive();
  return archive.filter(function(video) {
    if (normalizeText(video.title).indexOf(normalizedQuery) !== -1) return true;
    if (video.tags && video.tags.some(function(tag) { return normalizeText(tag).indexOf(normalizedQuery) !== -1; })) return true;
    return false;
  });
}

// Settings
function loadSettings() {
  var data = localStorage.getItem(SETTINGS_KEY);
  if (!data) return { darkMode: false, autoSync: true };
  try { return JSON.parse(data); } catch(e) { return { darkMode: false, autoSync: true }; }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Export
function exportArchive() {
  var archive = loadArchive();
  var data = JSON.stringify(archive, null, 2);
  var blob = new Blob([data], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'yt-archive-backup-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Import
function importArchive(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('Invalid format');
        var existing = loadArchive();
        var merged = existing.concat(data.filter(function(newV) {
          return !existing.some(function(exV) { return exV.id === newV.id || exV.url === newV.url; });
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        resolve(merged.length - existing.length);
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ============ YouTube API Service ============
function extractVideoId(url) {
  var patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = url.match(patterns[i]);
    if (match) return match[1];
  }
  return null;
}

function fetchVideoMetadata(url) {
  if (!isValidYouTubeUrl(url)) return Promise.reject(new Error('Invalid YouTube URL'));
  var videoId = extractVideoId(url);
  if (!videoId) return Promise.reject(new Error('Could not extract video ID'));
  var oembedUrl = 'https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId) + '&format=json';
  return fetch(oembedUrl, { headers: { 'Accept': 'application/json' } })
    .then(function(response) {
      if (!response.ok) throw new Error('Failed to fetch: ' + response.status);
      return response.json();
    })
    .then(function(data) {
      return {
        title: data.title || 'Untitled',
        thumbnail: data.thumbnail_url || ('https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg')
      };
    });
}

// ============ GitHub Sync Service ============
var GITHUB_API_BASE = 'https://api.github.com';

function validateToken(token) {
  if (!token || typeof token !== 'string') return false;
  if (token.indexOf('ghp_') === 0 && token.length >= 20) return true;
  return token.length >= 36;
}

function syncToGitHub(videos, token, repo, branch, filePath) {
  branch = branch || 'main';
  filePath = filePath || 'data/videos.json';
  if (!validateToken(token)) throw new Error('Invalid GitHub token');
  var parts = repo.split('/');
  var url = GITHUB_API_BASE + '/repos/' + parts[0] + '/' + parts[1] + '/contents/' + filePath;
  var existingSha = null;

  return fetch(url, {
    method: 'GET',
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
  })
  .then(function(response) {
    if (response.ok) return response.json().then(function(data) { existingSha = data.sha; });
    return null;
  })
  .catch(function() {})
  .then(function() {
    var content = JSON.stringify(videos, null, 2);
    var payload = {
      message: 'Auto-sync: ' + videos.length + ' video(s)',
      content: btoa(unescape(encodeURIComponent(content))),
      branch: branch
    };
    if (existingSha) payload.sha = existingSha;

    return fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(function(response) {
      if (!response.ok) throw new Error('Sync failed: ' + response.status);
      return response.json();
    });
  });
}

// ============ Dark Mode ============
function applyTheme(dark) {
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  var settings = loadSettings();
  settings.darkMode = !settings.darkMode;
  saveSettings(settings);
  applyTheme(settings.darkMode);
  updateThemeButton(settings.darkMode);
}

function updateThemeButton(dark) {
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = dark ? '☀️' : '🌙';
}

// ============ Auto Sync ============
var autoSyncInterval = null;

function startAutoSync() {
  var settings = loadSettings();
  if (settings.autoSync) {
    stopAutoSync();
    autoSyncInterval = setInterval(function() {
      var token = sessionStorage.getItem('github_pat');
      if (token && navigator.onLine) {
        syncSilently();
      }
    }, 300000); // Every 5 minutes
  }
}

function stopAutoSync() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
}

function toggleAutoSync() {
  var settings = loadSettings();
  settings.autoSync = !settings.autoSync;
  saveSettings(settings);
  if (settings.autoSync) { startAutoSync(); }
  else { stopAutoSync(); }
  updateAutoSyncButton(settings.autoSync);
}

function updateAutoSyncButton(enabled) {
  var btn = document.getElementById('auto-sync-toggle');
  if (btn) btn.textContent = enabled ? '🔄 Auto Sync: ON' : '🔄 Auto Sync: OFF';
}

function syncSilently() {
  var token = sessionStorage.getItem('github_pat');
  var repo = sessionStorage.getItem('github_repo') || 'yt-archive/videos';
  if (!token) return;
  var videos = loadArchive();
  syncToGitHub(videos, token, repo).catch(function() {});
}

// ============ App Logic ============
var elements = {};
var bulkMode = false;
var selectedVideos = [];

function getElements() {
  return {
    videoUrlInput: document.getElementById('video-url-input'),
    addVideoBtn: document.getElementById('add-video-btn'),
    tagInput: document.getElementById('tag-input'),
    addStatus: document.getElementById('add-status'),
    searchInput: document.getElementById('search-input'),
    videoGrid: document.getElementById('video-grid'),
    emptyState: document.getElementById('empty-state'),
    videoCount: document.getElementById('video-count'),
    settingsTrigger: document.getElementById('settings-trigger'),
    settingsModal: document.getElementById('settings-modal'),
    settingsClose: document.getElementById('settings-close'),
    settingsCancel: document.getElementById('settings-cancel'),
    settingsSave: document.getElementById('settings-save'),
    patInput: document.getElementById('pat-input'),
    repoInput: document.getElementById('repo-input'),
    testConnectionBtn: document.getElementById('test-connection-btn'),
    testResult: document.getElementById('test-result'),
    patError: document.getElementById('pat-error'),
    repoError: document.getElementById('repo-error'),
    connectionStatus: document.getElementById('connection-status'),
    syncStatus: document.getElementById('sync-status'),
    toastContainer: document.getElementById('toast-container'),
    // New elements
    themeToggle: document.getElementById('theme-toggle'),
    autoSyncToggle: document.getElementById('auto-sync-toggle'),
    bulkActionBar: document.getElementById('bulk-action-bar'),
    bulkDeleteBtn: document.getElementById('bulk-delete-btn'),
    bulkFavoriteBtn: document.getElementById('bulk-favorite-btn'),
    bulkCancelBtn: document.getElementById('bulk-cancel-btn'),
    bulkCount: document.getElementById('bulk-count'),
    bulkSelectAll: document.getElementById('bulk-select-all'),
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    importFile: document.getElementById('import-file'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    dateFilterLabel: document.getElementById('date-filter-label')
  };
}

function showToast(msg, type, dur) {
  if (!elements.toastContainer) return;
  type = type || 'info';
  dur = dur || 3000;
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.setAttribute('role', 'status');
  var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  t.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span class="toast-message">' + msg + '</span>';
  elements.toastContainer.appendChild(t);
  setTimeout(function() { t.classList.add('toast-hiding'); setTimeout(function() { t.remove(); }, 300); }, dur);
}

// ============ Modal ============
function openSettingsModal() {
  var modal = elements.settingsModal;
  if (!modal) return;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  var pat = sessionStorage.getItem('github_pat');
  var repo = sessionStorage.getItem('github_repo');
  if (pat && elements.patInput) elements.patInput.value = pat;
  if (elements.repoInput) elements.repoInput.value = repo || '';
  setTimeout(function() {
    var f = modal.querySelector('button, input');
    if (f) f.focus();
  }, 100);
  if (elements.patError) elements.patError.textContent = '';
  if (elements.repoError) elements.repoError.textContent = '';
  if (elements.testResult) { elements.testResult.textContent = ''; elements.testResult.className = ''; }
}

function closeSettingsModal() {
  var modal = elements.settingsModal;
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function saveSettingsModal() {
  var pat = elements.patInput ? elements.patInput.value.trim() : '';
  var repo = elements.repoInput ? elements.repoInput.value.trim() : '';
  if (!pat) return;
  sessionStorage.setItem('github_pat', pat);
  sessionStorage.setItem('github_repo', repo || '');
  updateConnectionStatus();
  closeSettingsModal();
  showToast('Settings saved!', 'success');
}

function testConnection() {
  var btn = elements.testConnectionBtn;
  var result = elements.testResult;
  if (!btn || !result) return;
  var token = elements.patInput ? elements.patInput.value.trim() : '';
  btn.textContent = '⏳ Testing...';
  btn.disabled = true;
  result.textContent = '';
  result.className = '';
  if (!token) {
    result.textContent = '⚠️ Enter token first';
    result.className = 'error';
    btn.textContent = '🔍 Test Connection';
    btn.disabled = false;
    return;
  }
  fetch('https://api.github.com/user', {
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
  })
  .then(function(r) {
    if (r.ok) return r.json().then(function(d) {
      result.textContent = '✅ Connected as ' + d.login;
      result.className = 'success';
    });
    result.textContent = '❌ Auth failed';
    result.className = 'error';
  })
  .catch(function() {
    result.textContent = '❌ Network error';
    result.className = 'error';
  })
  .then(function() {
    btn.textContent = '🔍 Test Connection';
    btn.disabled = false;
  });
}

function updateConnectionStatus() {
  var s = elements.connectionStatus;
  if (!s) return;
  var token = sessionStorage.getItem('github_pat');
  if (token && validateToken(token)) {
    s.classList.remove('status-disconnected');
    s.classList.add('status-connected');
    s.textContent = '✅ Connected';
  } else {
    s.classList.remove('status-connected');
    s.classList.add('status-disconnected');
    s.textContent = '⚠️ Not Connected';
  }
}

// ============ Video Actions ============
function addVideo() {
  if (!elements.videoUrlInput || !elements.addVideoBtn) return;
  var url = elements.videoUrlInput.value.trim();
  if (!url) { showToast('Enter a YouTube URL', 'warning'); return; }
  if (!isValidYouTubeUrl(url)) { showToast('Invalid YouTube URL', 'error'); return; }

  var tags = [];
  if (elements.tagInput && elements.tagInput.value.trim()) {
    tags = elements.tagInput.value.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
  }

  elements.addVideoBtn.disabled = true;
  elements.addVideoBtn.textContent = '⏳ Loading...';

  fetchVideoMetadata(url)
    .then(function(meta) {
      saveVideo({ url: url, title: meta.title, thumbnail: meta.thumbnail, tags: tags });
      elements.videoUrlInput.value = '';
      if (elements.tagInput) elements.tagInput.value = '';
      showToast('Saved: ' + meta.title, 'success');
      renderVideoGrid();
      if (loadSettings().autoSync) syncSilently();
    })
    .catch(function(err) { showToast('Error: ' + err.message, 'error'); })
    .then(function() {
      elements.addVideoBtn.disabled = false;
      elements.addVideoBtn.textContent = '➕ Add';
    });
}

function toggleFavoriteVideo(videoId) {
  toggleFavorite(videoId);
  renderVideoGrid();
}

function deleteVideoById(videoId, title) {
  if (confirm('Delete "' + title + '"?')) {
    deleteVideo(videoId);
    showToast('Deleted!', 'success');
    renderVideoGrid();
    if (loadSettings().autoSync) syncSilently();
  }
}

// ============ Bulk Actions ============
function toggleBulkMode() {
  bulkMode = !bulkMode;
  selectedVideos = [];
  updateBulkUI();
  renderVideoGrid();
}

function toggleVideoSelection(videoId) {
  var idx = selectedVideos.indexOf(videoId);
  if (idx > -1) selectedVideos.splice(idx, 1);
  else selectedVideos.push(videoId);
  updateBulkUI();
}

function selectAllVideos(videos) {
  if (selectedVideos.length === videos.length) {
    selectedVideos = [];
  } else {
    selectedVideos = videos.map(function(v) { return v.id; });
  }
  updateBulkUI();
  renderVideoGrid();
}

function bulkDelete() {
  if (!selectedVideos.length) return;
  if (confirm('Delete ' + selectedVideos.length + ' video(s)?')) {
    var archive = loadArchive();
    var filtered = archive.filter(function(v) { return selectedVideos.indexOf(v.id) === -1; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    selectedVideos = [];
    showToast('Deleted ' + selectedVideos.length + ' video(s)!', 'success');
    renderVideoGrid();
    if (loadSettings().autoSync) syncSilently();
  }
}

function bulkFavorite() {
  if (!selectedVideos.length) return;
  var archive = loadArchive();
  archive.forEach(function(v) {
    if (selectedVideos.indexOf(v.id) > -1) v.favorite = true;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
  selectedVideos = [];
  showToast('Added to favorites!', 'success');
  renderVideoGrid();
}

function cancelBulkMode() {
  bulkMode = false;
  selectedVideos = [];
  updateBulkUI();
  renderVideoGrid();
}

function updateBulkUI() {
  var bar = elements.bulkActionBar;
  if (!bar) return;
  if (bulkMode && selectedVideos.length > 0) {
    bar.style.display = 'flex';
    if (elements.bulkCount) elements.bulkCount.textContent = selectedVideos.length + ' selected';
  } else if (bulkMode) {
    bar.style.display = 'flex';
    if (elements.bulkCount) elements.bulkCount.textContent = 'Select videos';
  } else {
    bar.style.display = 'none';
  }
}

// ============ Date Filter ============
var currentDateFilter = 'all';

function filterByDate(filter) {
  currentDateFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  var activeBtn = document.querySelector('[data-filter="' + filter + '"]');
  if (activeBtn) activeBtn.classList.add('active');
  if (elements.dateFilterLabel) {
    var labels = { all: 'All Time', today: 'Today', week: 'This Week', month: 'This Month', favorites: '⭐ Favorites' };
    elements.dateFilterLabel.textContent = '📅 ' + (labels[filter] || 'All');
  }
  renderVideoGrid();
}

function getFilteredVideos() {
  var videos = loadArchive();
  if (currentDateFilter === 'favorites') {
    return videos.filter(function(v) { return v.favorite; });
  }
  if (currentDateFilter === 'all') return videos;

  var now = new Date();
  var cutoff;

  if (currentDateFilter === 'today') {
    cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (currentDateFilter === 'week') {
    cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (currentDateFilter === 'month') {
    cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return videos.filter(function(v) {
    return new Date(v.savedAt) >= cutoff;
  });
}

// ============ Render ============
function renderVideoGrid() {
  if (!elements.videoGrid) return;
  var query = elements.searchInput ? elements.searchInput.value : '';
  var videos = query ? searchArchive(query) : getFilteredVideos();

  if (elements.videoCount) elements.videoCount.textContent = videos.length;
  elements.videoGrid.innerHTML = '';

  if (videos.length === 0) {
    if (elements.emptyState) elements.emptyState.style.display = 'block';
    elements.videoGrid.style.display = 'none';
    return;
  }

  if (elements.emptyState) elements.emptyState.style.display = 'none';
  elements.videoGrid.style.display = 'grid';

  // Bulk select all checkbox
  if (bulkMode) {
    var selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'bulk-select-all';
    selectAllDiv.innerHTML = '<label><input type="checkbox" id="bulk-select-all-cb" ' + 
      (selectedVideos.length === videos.length ? 'checked' : '') + '> Select All (' + videos.length + ')</label>';
    elements.videoGrid.appendChild(selectAllDiv);
    setTimeout(function() {
      var cb = document.getElementById('bulk-select-all-cb');
      if (cb) cb.addEventListener('change', function() { selectAllVideos(videos); });
    }, 0);
  }

  videos.forEach(function(video) {
    var card = document.createElement('div');
    card.className = 'video-card' + (video.favorite ? ' favorite' : '') + 
      (bulkMode && selectedVideos.indexOf(video.id) > -1 ? ' selected' : '');
    card.setAttribute('role', 'listitem');

    var tagsHtml = '';
    if (video.tags && video.tags.length) {
      tagsHtml = '<div class="video-tags">' + video.tags.map(function(t) { 
        return '<span class="tag">' + escapeHtml(t) + '</span>'; 
      }).join('') + '</div>';
    }

    var favIcon = video.favorite ? '⭐' : '☆';
    var bulkCheckbox = bulkMode ? '<input type="checkbox" class="bulk-checkbox" ' + 
      (selectedVideos.indexOf(video.id) > -1 ? 'checked' : '') + ' data-id="' + video.id + '">' : '';

    card.innerHTML = 
      bulkCheckbox +
      '<a href="' + video.url + '" target="_blank" rel="noopener noreferrer" class="video-card-link">' +
      '<img src="' + video.thumbnail + '" alt="Thumbnail" class="video-thumbnail" loading="lazy" />' +
      '<div class="video-info">' +
      '<h3 class="video-title">' + escapeHtml(video.title) + '</h3>' +
      tagsHtml +
      '<p class="video-date">' + formatDate(video.savedAt) + '</p>' +
      '</div></a>' +
      '<div class="video-actions">' +
      '<button class="btn-fav" onclick="window.toggleFavoriteVideo(\'' + video.id + '\')" title="Favorite">' + favIcon + '</button>' +
      '<button class="btn-delete" onclick="window.deleteVideoById(\'' + video.id + '\', \'' + escapeHtml(video.title).replace(/'/g, "\\'") + '\')" title="Delete">🗑️</button>' +
      '</div>';

    elements.videoGrid.appendChild(card);

    // Bulk checkbox handler
    if (bulkMode) {
      var checkbox = card.querySelector('.bulk-checkbox');
      if (checkbox) {
        checkbox.addEventListener('change', function() {
          toggleVideoSelection(video.id);
          card.classList.toggle('selected', selectedVideos.indexOf(video.id) > -1);
        });
      }
    }
  });
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, { 
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });
}

// ============ Sync ============
function syncToGithubApp() {
  var token = sessionStorage.getItem('github_pat');
  var repo = sessionStorage.getItem('github_repo') || '';
  if (!token || !repo) { showToast('Configure GitHub settings first', 'warning'); openSettingsModal(); return; }
  showToast('Syncing...', 'info', 2000);
  syncToGitHub(loadArchive(), token, repo)
    .then(function() { showToast('Sync successful!', 'success'); })
    .catch(function(err) { showToast('Sync failed: ' + err.message, 'error'); });
}

// ============ Event Listeners ============
function initEventListeners() {
  if (elements.addVideoBtn) elements.addVideoBtn.addEventListener('click', addVideo);
  if (elements.videoUrlInput) elements.videoUrlInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') addVideo(); });
  if (elements.searchInput) elements.searchInput.addEventListener('input', renderVideoGrid);
  if (elements.settingsTrigger) elements.settingsTrigger.addEventListener('click', openSettingsModal);
  if (elements.settingsClose) elements.settingsClose.addEventListener('click', closeSettingsModal);
  if (elements.settingsCancel) elements.settingsCancel.addEventListener('click', closeSettingsModal);
  if (elements.settingsModal) {
    var overlay = elements.settingsModal.querySelector('.modal-overlay');
    if (overlay) overlay.addEventListener('click', closeSettingsModal);
  }
  if (elements.settingsSave) elements.settingsSave.addEventListener('click', saveSettingsModal);
  if (elements.testConnectionBtn) elements.testConnectionBtn.addEventListener('click', testConnection);
  
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && elements.settingsModal && elements.settingsModal.classList.contains('active')) closeSettingsModal();
  });

  var syncBtn = document.getElementById('sync-btn');
  if (syncBtn) syncBtn.addEventListener('click', syncToGithubApp);

  // Theme toggle
  if (elements.themeToggle) elements.themeToggle.addEventListener('click', toggleTheme);

  // Auto sync toggle
  if (elements.autoSyncToggle) elements.autoSyncToggle.addEventListener('click', toggleAutoSync);

  // Bulk actions
  if (elements.bulkDeleteBtn) elements.bulkDeleteBtn.addEventListener('click', bulkDelete);
  if (elements.bulkFavoriteBtn) elements.bulkFavoriteBtn.addEventListener('click', bulkFavorite);
  if (elements.bulkCancelBtn) elements.bulkCancelBtn.addEventListener('click', cancelBulkMode);

  // Export/Import
  if (elements.exportBtn) elements.exportBtn.addEventListener('click', function() { exportArchive(); showToast('Archive exported!', 'success'); });
  if (elements.importBtn) elements.importBtn.addEventListener('click', function() { elements.importFile.click(); });
  if (elements.importFile) elements.importFile.addEventListener('change', function(e) {
    if (e.target.files[0]) {
      importArchive(e.target.files[0])
        .then(function(count) { showToast('Imported ' + count + ' new video(s)!', 'success'); renderVideoGrid(); })
        .catch(function() { showToast('Import failed: Invalid file', 'error'); });
      e.target.value = '';
    }
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { filterByDate(this.dataset.filter); });
  });
}

// Make functions globally accessible
window.toggleFavoriteVideo = toggleFavoriteVideo;
window.deleteVideoById = deleteVideoById;
window.toggleBulkMode = toggleBulkMode;

function init() {
  elements = getElements();

  // Apply saved theme
  var settings = loadSettings();
  applyTheme(settings.darkMode);
  updateThemeButton(settings.darkMode);
  updateAutoSyncButton(settings.autoSync);
  if (settings.autoSync) startAutoSync();

  updateConnectionStatus();
  renderVideoGrid();
  initEventListeners();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

