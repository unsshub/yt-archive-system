// ============ Storage Service ============
var STORAGE_KEY = 'videos';
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
  if (!isValidYouTubeUrl(url)) {
    return Promise.reject(new Error('Invalid YouTube URL'));
  }
  var videoId = extractVideoId(url);
  if (!videoId) {
    return Promise.reject(new Error('Could not extract video ID'));
  }
  var oembedUrl = 'https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId) + '&format=json';
  return fetch(oembedUrl, { headers: { 'Accept': 'application/json' } })
    .then(function(response) {
      if (!response.ok) {
        if (response.status === 429) throw new Error('Rate limited by YouTube. Please wait.');
        throw new Error('Failed to fetch video metadata: ' + response.status);
      }
      return response.json();
    })
    .then(function(data) {
      return {
        title: data.title || 'Untitled Video',
        thumbnail: data.thumbnail_url || ('https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg')
      };
    });
}

// ============ GitHub Sync Service ============
var GITHUB_API_BASE = 'https://api.github.com';
var MAX_RETRIES = 3;
var INITIAL_BACKOFF_MS = 1000;

function validateToken(token) {
  if (!token || typeof token !== 'string') return false;
  if (token.indexOf('ghp_') === 0 && token.length >= 20) return true;
  if (token.length >= 36) return true;
  return false;
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function isRetryable(status) {
  return status === 429 || (status >= 500 && status < 600);
}

function getErrorMessage(status, statusText) {
  switch (status) {
    case 401: return 'GitHub authentication failed. Please check your PAT.';
    case 403: return 'GitHub API error: 403 ' + (statusText || 'Forbidden');
    case 404: return 'Repository not found. Please create a private repo first.';
    case 422: return 'Validation failed. The data may be corrupted.';
    default: return 'GitHub API error: ' + status + ' ' + (statusText || 'Internal Server Error');
  }
}

function buildCommitPayload(videos, sha) {
  var content = JSON.stringify(videos, null, 2);
  var payload = {
    message: 'Auto-sync: ' + videos.length + ' video(s)',
    content: toBase64(content)
  };
  if (sha) payload.sha = sha;
  return payload;
}

function syncToGitHub(videos, token, repo, branch, filePath) {
  branch = branch || 'main';
  filePath = filePath || 'data/videos.json';
  
  if (!validateToken(token)) throw new Error('Invalid GitHub token. Please provide a valid PAT.');
  if (!Array.isArray(videos)) throw new Error('Videos must be an array.');

  var parts = repo.split('/');
  var owner = parts[0];
  var repoName = parts[1];
  var url = GITHUB_API_BASE + '/repos/' + owner + '/' + repoName + '/contents/' + filePath;
  var existingSha = null;
  var attempt = 0;
  var lastError = null;

  return fetch(url, {
    method: 'GET',
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
  })
  .then(function(response) {
    if (response.ok) return response.json().then(function(data) { existingSha = data.sha; });
    if (response.status !== 404) {
      var msg = getErrorMessage(response.status, response.statusText);
      if (msg.indexOf('404') === -1) console.warn('Could not fetch existing file SHA:', msg);
    }
    return null;
  })
  .catch(function(error) {
    if (error.message.indexOf('404') === -1) console.warn('Could not fetch existing file SHA:', error.message);
  })
  .then(function() {
    var payload = buildCommitPayload(videos, existingSha);
    payload.branch = branch;

    function attemptPut() {
      return fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': 'token ' + token,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      .then(function(response) {
        if (response.ok) return response.json();
        
        if (isRetryable(response.status) && attempt < MAX_RETRIES) {
          var delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          var retryAfter = response.headers.get('Retry-After');
          if (retryAfter) delay = parseInt(retryAfter, 10) * 1000;
          lastError = new Error(getErrorMessage(response.status, response.statusText));
          attempt++;
          return sleep(delay).then(attemptPut);
        }
        throw new Error(getErrorMessage(response.status, response.statusText));
      })
      .catch(function(error) {
        if (error.message.indexOf('GitHub') === 0 || error.message.indexOf('Repository') === 0) throw error;
        lastError = error;
        attempt++;
        if (attempt >= MAX_RETRIES) throw new Error(error.message + ' (max retries exceeded)');
        return sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)).then(attemptPut);
      });
    }
    return attemptPut();
  });
}

function fetchArchive(token, repo, branch, filePath) {
  branch = branch || 'main';
  filePath = filePath || 'data/videos.json';
  
  if (!validateToken(token)) throw new Error('Invalid GitHub token. Please provide a valid PAT.');
  
  var parts = repo.split('/');
  var url = GITHUB_API_BASE + '/repos/' + parts[0] + '/' + parts[1] + '/contents/' + filePath;

  return fetch(url, {
    method: 'GET',
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
  })
  .then(function(response) {
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(getErrorMessage(response.status, response.statusText));
    return response.json().then(function(data) {
      return JSON.parse(atob(data.content));
    });
  });
}

// ============ Offline Queue Service ============
var QUEUE_STORAGE_KEY = 'offline_queue';
var MAX_RETRY_COUNT = 3;
var queue = [];

function loadQueue() {
  try {
    var stored = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (stored) {
      var parsed = JSON.parse(stored);
      var token = sessionStorage.getItem('github_pat');
      queue = parsed.map(function(op) {
        return {
          type: op.type,
          videos: op.videos,
          token: token || '',
          repo: op.repo,
          branch: op.branch || 'main',
          path: op.path || 'data/videos.json',
          retries: op.retries || 0,
          hasToken: !!token
        };
      });
    }
  } catch (e) { queue = []; }
}

function saveQueue() {
  try {
    var toStore = queue.map(function(op) {
      return {
        type: op.type,
        videos: op.videos,
        repo: op.repo,
        branch: op.branch,
        path: op.path,
        retries: op.retries,
        hasToken: !!op.token
      };
    });
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) { console.error('Failed to save queue:', e); }
}

function enqueue(operation) {
  var isDuplicate = queue.some(function(existing) {
    return existing.type === operation.type && existing.repo === operation.repo &&
      JSON.stringify(existing.videos) === JSON.stringify(operation.videos);
  });
  if (isDuplicate) return false;
  var token = operation.token || sessionStorage.getItem('github_pat') || '';
  queue.push({
    type: operation.type,
    videos: operation.videos || [],
    token: token,
    repo: operation.repo || '',
    branch: operation.branch || 'main',
    path: operation.path || 'data/videos.json',
    retries: 0,
    hasToken: !!token
  });
  saveQueue();
  updateSyncStatus();
  return true;
}

function dequeue(operation) {
  queue = queue.filter(function(op) {
    return !(op.type === operation.type && op.repo === operation.repo &&
      JSON.stringify(op.videos) === JSON.stringify(operation.videos));
  });
  saveQueue();
  updateSyncStatus();
}

function clearQueue() {
  queue = [];
  saveQueue();
  updateSyncStatus('idle');
}

function getQueueLength() { return queue.length; }

function updateSyncStatus(status) {
  var statusElement = document.getElementById('sync-status');
  if (!statusElement) return;
  if (!status) status = queue.length > 0 ? 'pending' : 'idle';
  statusElement.classList.remove('sync-idle', 'sync-progress', 'sync-pending', 'sync-error');
  switch (status) {
    case 'idle': statusElement.classList.add('sync-idle'); statusElement.textContent = '✅ Synced'; break;
    case 'syncing': statusElement.classList.add('sync-progress'); statusElement.textContent = '🔄 Syncing...'; break;
    case 'pending': statusElement.classList.add('sync-pending'); statusElement.textContent = '⏳ ' + queue.length + ' pending sync(s)'; break;
    case 'error': statusElement.classList.add('sync-error'); statusElement.textContent = '❌ Sync failed'; break;
  }
}

function showSyncToast(message, type) {
  var toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.setAttribute('role', 'status');
  var icons = { success: '✅', error: '❌', warning: '⚠️', info: '🔄' };
  toast.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span class="toast-message">' + message + '</span>';
  toastContainer.appendChild(toast);
  setTimeout(function() { toast.classList.add('toast-hiding'); setTimeout(function() { toast.remove(); }, 300); }, 5000);
}

function handleOnline() {
  showSyncToast('Back online! Processing queued items...', 'info');
  var banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = 'none';
  if (queue.length > 0) processQueue();
  else updateSyncStatus('idle');
}

function handleOffline() {
  updateSyncStatus('pending');
  showSyncToast('You are offline. Changes will be synced when connection is restored.', 'warning');
  var banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = 'block';
}

function isRetryableError(error) {
  var message = error.message || '';
  if (message.indexOf('Network') !== -1 || message.indexOf('fetch') !== -1 || message.indexOf('timeout') !== -1) return true;
  if (message.indexOf('500') !== -1 || message.indexOf('502') !== -1 || message.indexOf('503') !== -1) return true;
  if (message.indexOf('429') !== -1 || message.indexOf('rate limit') !== -1) return true;
  return false;
}

function processQueue() {
  if (queue.length === 0) return Promise.resolve({ success: 0, failed: 0 });
  updateSyncStatus('syncing');
  showSyncToast('Syncing ' + queue.length + ' item(s) to GitHub...', 'info');
  var operations = queue.slice();
  var success = 0;
  var failed = 0;

  function processNext(index) {
    if (index >= operations.length) {
      saveQueue();
      if (failed > 0 && success === 0) { updateSyncStatus('error'); showSyncToast('Sync failed for ' + failed + ' operation(s)', 'error'); }
      else if (failed > 0) { updateSyncStatus('idle'); showSyncToast('Sync complete: ' + success + ' synced, ' + failed + ' failed', 'warning'); }
      else { updateSyncStatus('idle'); showSyncToast('Sync complete: ' + success + ' item(s) synced', 'success'); }
      return { success: success, failed: failed };
    }
    var op = operations[index];
    if (!op.token) op.token = sessionStorage.getItem('github_pat') || '';
    if (!op.token) { dequeue(op); failed++; return processNext(index + 1); }

    return syncToGitHub(op.videos, op.token, op.repo, op.branch, op.path)
      .then(function() { dequeue(op); success++; return processNext(index + 1); })
      .catch(function(error) {
        if (isRetryableError(error) && (op.retries || 0) < MAX_RETRY_COUNT) { op.retries = (op.retries || 0) + 1; saveQueue(); failed++; }
        else { dequeue(op); failed++; }
        return processNext(index + 1);
      });
  }
  return processNext(0);
}

window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);
loadQueue();
updateSyncStatus();
if (navigator.onLine && queue.length > 0) processQueue();
if (!navigator.onLine) handleOffline();

// ============ App Logic ============
var elements = {};

function getElements() {
  return {
    videoUrlInput: document.getElementById('video-url-input'),
    addVideoBtn: document.getElementById('add-video-btn'),
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
    toastContainer: document.getElementById('toast-container')
  };
}

function showAppToast(message, type, duration) {
  if (!elements.toastContainer) return;
  type = type || 'info';
  duration = duration || 3000;
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.setAttribute('role', 'status');
  var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = '<span class="toast-icon">' + icons[type] + '</span><span class="toast-message">' + message + '</span>';
  elements.toastContainer.appendChild(toast);
  setTimeout(function() { toast.classList.add('toast-hiding'); setTimeout(function() { toast.remove(); }, 300); }, duration);
}

function openSettingsModal() {
  var modal = elements.settingsModal;
  if (!modal) return;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  var savedPat = sessionStorage.getItem('github_pat');
  var savedRepo = sessionStorage.getItem('github_repo');
  if (savedPat && elements.patInput) elements.patInput.value = savedPat;
  if (elements.repoInput) elements.repoInput.value = savedRepo || 'yt-archive/videos';
  setTimeout(function() {
    var firstFocusable = modal.querySelector('button, input');
    if (firstFocusable) firstFocusable.focus();
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
  if (elements.settingsTrigger) elements.settingsTrigger.focus();
}

function validateSettingsInputs() {
  var isValid = true;
  var token = elements.patInput ? elements.patInput.value.trim() : '';
  if (!token) { if (elements.patError) elements.patError.textContent = 'Token is required'; isValid = false; }
  else if (!validateToken(token)) { if (elements.patError) elements.patError.textContent = 'Invalid token format. Must start with ghp_ and be at least 20 characters'; isValid = false; }
  else { if (elements.patError) elements.patError.textContent = ''; }

  var repo = elements.repoInput ? elements.repoInput.value.trim() : '';
  if (!repo) { if (elements.repoError) elements.repoError.textContent = 'Repository is required'; isValid = false; }
  else if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) { if (elements.repoError) elements.repoError.textContent = 'Invalid format. Use: owner/repository-name'; isValid = false; }
  else { if (elements.repoError) elements.repoError.textContent = ''; }
  return isValid;
}

function saveSettings() {
  if (!validateSettingsInputs()) return;
  var token = elements.patInput.value.trim();
  var repo = elements.repoInput.value.trim();
  sessionStorage.setItem('github_pat', token);
  sessionStorage.setItem('github_repo', repo);
  updateConnectionStatus();
  closeSettingsModal();
  showAppToast('Settings saved successfully!', 'success');
}

function testConnection() {
  if (!elements.testConnectionBtn || !elements.testResult) return;
  var token = elements.patInput ? elements.patInput.value.trim() : '';
  var repo = elements.repoInput ? elements.repoInput.value.trim() : '';
  elements.testConnectionBtn.textContent = '⏳ Testing...';
  elements.testConnectionBtn.disabled = true;
  elements.testResult.textContent = '';
  elements.testResult.className = '';

  if (!token || !repo) {
    elements.testResult.textContent = '⚠️ Please enter both token and repository';
    elements.testResult.className = 'error';
    elements.testConnectionBtn.textContent = '🔍 Test Connection';
    elements.testConnectionBtn.disabled = false;
    return;
  }
  if (!validateToken(token)) {
    elements.testResult.textContent = '❌ Invalid token format';
    elements.testResult.className = 'error';
    elements.testConnectionBtn.textContent = '🔍 Test Connection';
    elements.testConnectionBtn.disabled = false;
    return;
  }

  var owner = repo.split('/')[0];
  fetch('https://api.github.com/users/' + owner, {
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
  })
  .then(function(response) {
    if (response.ok) return response.json().then(function(data) {
      elements.testResult.textContent = '✅ Connected as ' + data.login;
      elements.testResult.className = 'success';
    });
    if (response.status === 401) { elements.testResult.textContent = '❌ Authentication failed. Check your token.'; elements.testResult.className = 'error'; }
    else { elements.testResult.textContent = '⚠️ API error: ' + response.status; elements.testResult.className = 'error'; }
  })
  .catch(function() {
    elements.testResult.textContent = '❌ Network error. Check your connection.';
    elements.testResult.className = 'error';
  })
  .then(function() {
    elements.testConnectionBtn.textContent = '🔍 Test Connection';
    elements.testConnectionBtn.disabled = false;
  });
}

function updateConnectionStatus() {
  var token = sessionStorage.getItem('github_pat');
  var status = elements.connectionStatus;
  if (!status) return;
  if (token && validateToken(token)) {
    status.classList.remove('status-disconnected');
    status.classList.add('status-connected');
    status.textContent = '✅ Connected';
  } else {
    status.classList.remove('status-connected');
    status.classList.add('status-disconnected');
    status.textContent = '⚠️ Not Connected';
  }
}

function addVideo() {
  if (!elements.videoUrlInput || !elements.addVideoBtn) return;
  var url = elements.videoUrlInput.value.trim();
  if (!url) { showAppToast('Please enter a YouTube URL', 'warning'); return; }
  if (!isValidYouTubeUrl(url)) { showAppToast('Invalid YouTube URL', 'error'); return; }

  elements.addVideoBtn.disabled = true;
  elements.addVideoBtn.textContent = '⏳ Loading...';
  if (elements.addStatus) elements.addStatus.textContent = 'Fetching video metadata...';

  fetchVideoMetadata(url)
    .then(function(metadata) {
      saveVideo({ url: url, title: metadata.title, thumbnail: metadata.thumbnail, tags: [] });
      elements.videoUrlInput.value = '';
      if (elements.addStatus) elements.addStatus.textContent = '';
      showAppToast('Saved: ' + metadata.title, 'success');
      renderVideoGrid();
    })
    .catch(function(error) {
      if (elements.addStatus) elements.addStatus.textContent = '';
      showAppToast('Error: ' + error.message, 'error');
    })
    .then(function() {
      elements.addVideoBtn.disabled = false;
      elements.addVideoBtn.textContent = '➕ Add';
    });
}

function renderVideoGrid() {
  if (!elements.searchInput || !elements.videoGrid) return;
  var query = elements.searchInput.value;
  var videos = query ? searchArchive(query) : loadArchive();
  if (elements.videoCount) elements.videoCount.textContent = videos.length;
  elements.videoGrid.innerHTML = '';

  if (videos.length === 0) {
    if (elements.emptyState) elements.emptyState.style.display = 'block';
    elements.videoGrid.style.display = 'none';
    return;
  }
  if (elements.emptyState) elements.emptyState.style.display = 'none';
  elements.videoGrid.style.display = 'grid';

  videos.forEach(function(video) {
    var card = document.createElement('div');
    card.className = 'video-card';
    card.setAttribute('role', 'listitem');
    card.innerHTML = '<a href="' + video.url + '" target="_blank" rel="noopener noreferrer" class="video-card-link">' +
      '<img src="' + video.thumbnail + '" alt="Thumbnail" class="video-thumbnail" loading="lazy" />' +
      '<div class="video-info"><h3 class="video-title">' + escapeHtml(video.title) + '</h3>' +
      '<p class="video-date">' + formatDate(video.savedAt) + '</p></div></a>';
    elements.videoGrid.appendChild(card);
  });
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function syncToGithubApp() {
  var token = sessionStorage.getItem('github_pat');
  var repo = sessionStorage.getItem('github_repo') || 'yt-archive/videos';
  if (!token) { showAppToast('Please configure GitHub settings first', 'warning'); openSettingsModal(); return; }

  var videos = loadArchive();
  if (!navigator.onLine) {
    if (enqueue({ type: 'sync', videos: videos, token: token, repo: repo })) {
      showAppToast('Offline: Sync queued for when connection is restored', 'warning', 5000);
    }
    return;
  }

  showAppToast('Syncing to GitHub...', 'info', 2000);
  syncToGitHub(videos, token, repo)
    .then(function() { showAppToast('Sync successful!', 'success'); })
    .catch(function(error) {
      if (error.message.indexOf('Network') !== -1 || error.message.indexOf('fetch') !== -1) {
        if (enqueue({ type: 'sync', videos: videos, token: token, repo: repo })) {
          showAppToast('Network error: Sync queued for retry', 'warning', 5000);
        }
      } else {
        showAppToast('Sync failed: ' + error.message, 'error');
      }
    });
}

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
  if (elements.settingsSave) elements.settingsSave.addEventListener('click', saveSettings);
  if (elements.testConnectionBtn) elements.testConnectionBtn.addEventListener('click', testConnection);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && elements.settingsModal && elements.settingsModal.classList.contains('active')) closeSettingsModal();
  });
  var syncBtn = document.getElementById('sync-btn');
  if (syncBtn) syncBtn.addEventListener('click', syncToGithubApp);
}

function init() {
  elements = getElements();
  updateConnectionStatus();
  renderVideoGrid();
  initEventListeners();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();


