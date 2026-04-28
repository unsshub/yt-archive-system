// YT Archive System v3 - Persistent Settings + URL Parameter Auto-Add
(function() {
  'use strict';

  function obfuscate(str) {
    if (!str) return '';
    return btoa(str.split('').map(function(c, i) {
      return String.fromCharCode(c.charCodeAt(0) ^ (i % 7 + 1));
    }).join(''));
  }

  function deobfuscate(str) {
    if (!str) return '';
    return atob(str).split('').map(function(c, i) {
      return String.fromCharCode(c.charCodeAt(0) ^ (i % 7 + 1));
    }).join('');
  }

  var STORAGE_KEY = 'videos';
  var SETTINGS_KEY = 'yt-archive-settings';
  var PAT_KEY = 'yt-archive-pat';
  var REPO_KEY = 'yt-archive-repo';

  function loadArchive() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch(e) { return []; }
  }

  function saveArchive(videos) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  }

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
    catch(e) { return {}; }
  }

  function saveSettingsObj(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  function getPat() {
    var raw = localStorage.getItem(PAT_KEY);
    return raw ? deobfuscate(raw) : '';
  }

  function setPat(token) {
    if (token) localStorage.setItem(PAT_KEY, obfuscate(token));
    else localStorage.removeItem(PAT_KEY);
  }

  function getRepo() {
    return localStorage.getItem(REPO_KEY) || '';
  }

  function setRepo(repo) {
    if (repo) localStorage.setItem(REPO_KEY, repo);
    else localStorage.removeItem(REPO_KEY);
  }

  var bulkMode = false;
  var selectedVideos = [];
  var currentFilter = 'all';

  function $(id) { return document.getElementById(id); }

  function getElements() {
    return {
      videoUrl: $('video-url-input'),
      tagInput: $('tag-input'),
      addBtn: $('add-video-btn'),
      searchInput: $('search-input'),
      videoGrid: $('video-grid'),
      emptyState: $('empty-state'),
      videoCount: $('video-count'),
      toastContainer: $('toast-container'),
      themeToggle: $('theme-toggle'),
      autoSyncToggle: $('auto-sync-toggle'),
      connectionStatus: $('connection-status'),
      filterLabel: $('date-filter-label'),
      bulkBar: $('bulk-action-bar'),
      bulkCount: $('bulk-count'),
      settingsModal: $('settings-modal'),
      patInput: $('pat-input'),
      repoInput: $('repo-input'),
      testResult: $('test-result'),
      testBtn: $('test-connection-btn'),
      importFile: $('import-file')
    };
  }

  var el = {};

  function toast(msg, type, dur) {
    if (!el.toastContainer) return;
    type = type || 'info'; dur = dur || 3000;
    var t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.innerHTML = '<span>' + msg + '</span>';
    el.toastContainer.appendChild(t);
    setTimeout(function() { t.remove(); }, dur);
  }

  function applyTheme(dark) {
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (el.themeToggle) el.themeToggle.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (el.themeToggle) el.themeToggle.textContent = '🌙';
    }
  }

  function toggleTheme() {
    var s = loadSettings();
    s.darkMode = !s.darkMode;
    saveSettingsObj(s);
    applyTheme(s.darkMode);
  }

  var autoSyncTimer = null;

  function updateAutoSyncUI(enabled) {
    if (el.autoSyncToggle) el.autoSyncToggle.textContent = enabled ? '🔄 Auto: ON' : '🔄 Auto: OFF';
  }

  function toggleAutoSync() {
    var s = loadSettings();
    s.autoSync = !s.autoSync;
    saveSettingsObj(s);
    updateAutoSyncUI(s.autoSync);
    if (s.autoSync) startAutoSync();
    else stopAutoSync();
    toast(s.autoSync ? 'Auto sync ON (every 5 min)' : 'Auto sync OFF', 'info');
  }

  function startAutoSync() {
    stopAutoSync();
    autoSyncTimer = setInterval(silentSync, 300000);
  }

  function stopAutoSync() {
    if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
  }

  function silentSync() {
    var token = getPat();
    var repo = getRepo();
    if (!token || !repo) return;
    syncToGitHub(loadArchive(), token, repo).catch(function(){});
  }

  function updateConnectionStatus() {
    var token = getPat();
    if (!el.connectionStatus) return;
    if (token && token.length > 20) {
      el.connectionStatus.textContent = '✅ Connected';
      el.connectionStatus.className = 'status-connected';
    } else {
      el.connectionStatus.textContent = '⚠️ Not Connected';
      el.connectionStatus.className = 'status-disconnected';
    }
  }

  function syncToGitHub(videos, token, repo) {
    var parts = repo.split('/');
    if (parts.length < 2) return Promise.reject(new Error('Invalid repo format. Use: username/repo'));
    var url = 'https://api.github.com/repos/' + parts[0] + '/' + parts[1] + '/contents/data/videos.json';
    var sha = null;

    return fetch(url, {
      headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
    })
    .then(function(r) {
      if (r.ok) return r.json().then(function(d) { sha = d.sha; });
      if (r.status === 404) return null;
      throw new Error('GitHub error: ' + r.status);
    })
    .then(function() {
      var content = btoa(unescape(encodeURIComponent(JSON.stringify(videos, null, 2))));
      var body = {
        message: 'Update: ' + videos.length + ' video(s)',
        content: content,
        branch: 'main'
      };
      if (sha) body.sha = sha;

      return fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': 'token ' + token,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    })
    .then(function(r) {
      if (!r.ok) {
        if (r.status === 409) throw new Error('Conflict. Wait a moment and try again.');
        if (r.status === 401) throw new Error('Invalid token. Check settings.');
        if (r.status === 404) throw new Error('Repository not found. Create it first.');
        throw new Error('Sync error: ' + r.status);
      }
      return r.json();
    });
  }

  function saveVideo(url, title, thumbnail, tags) {
    var video = {
      id: generateId(),
      url: url,
      title: title,
      thumbnail: thumbnail,
      tags: tags || [],
      favorite: false,
      savedAt: new Date().toISOString()
    };
    var archive = loadArchive();
    archive.unshift(video);
    saveArchive(archive);
    return video;
  }

  function generateId() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var id = '';
    for (var i = 0; i < 11; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  function toggleFavorite(videoId) {
    var archive = loadArchive();
    var v = archive.find(function(x) { return x.id === videoId; });
    if (v) { v.favorite = !v.favorite; saveArchive(archive); }
    renderGrid();
  }

  function deleteVideoById(videoId) {
    var archive = loadArchive();
    saveArchive(archive.filter(function(v) { return v.id !== videoId; }));
    renderGrid();
    if (loadSettings().autoSync) silentSync();
  }

  // ============ Add Video (supports auto-fill from URL param) ============
  function addVideo(prefilledUrl) {
    var url = prefilledUrl || (el.videoUrl ? el.videoUrl.value.trim() : '');
    if (!url) { toast('Enter a YouTube URL', 'warning'); return; }
    if (!/youtube\.com|youtu\.be/.test(url)) { toast('Invalid YouTube URL', 'error'); return; }

    var tags = [];
    if (el.tagInput && el.tagInput.value.trim()) {
      tags = el.tagInput.value.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
    }

    if (el.addBtn) { el.addBtn.disabled = true; el.addBtn.textContent = '⏳...'; }

    var videoId = null;
    var patterns = [/v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /shorts\/([a-zA-Z0-9_-]{11})/];
    for (var i = 0; i < patterns.length; i++) {
      var m = url.match(patterns[i]);
      if (m) { videoId = m[1]; break; }
    }
    if (!videoId) { toast('Cannot extract video ID', 'error'); if (el.addBtn) { el.addBtn.disabled = false; el.addBtn.textContent = '➕ Add'; } return; }

    fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json')
      .then(function(r) { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(function(data) {
        saveVideo(url, data.title || 'Untitled', data.thumbnail_url || 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg', tags);
        if (el.videoUrl) el.videoUrl.value = '';
        if (el.tagInput) el.tagInput.value = '';
        toast('Saved: ' + (data.title || 'Video'), 'success');
        renderGrid();
        if (loadSettings().autoSync) silentSync();
      })
      .catch(function() { toast('Error fetching video', 'error'); })
      .then(function() { if (el.addBtn) { el.addBtn.disabled = false; el.addBtn.textContent = '➕ Add'; } });
  }

  function getFilteredVideos() {
    var videos = loadArchive();
    if (currentFilter === 'favorites') return videos.filter(function(v) { return v.favorite; });
    if (currentFilter === 'all') return videos;
    var now = new Date(), cutoff;
    if (currentFilter === 'today') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (currentFilter === 'week') cutoff = new Date(now.getTime() - 7*86400000);
    else if (currentFilter === 'month') cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    return videos.filter(function(v) { return new Date(v.savedAt) >= cutoff; });
  }

  function renderGrid() {
    if (!el.videoGrid) return;
    var query = el.searchInput ? el.searchInput.value.trim().toLowerCase() : '';
    var videos = getFilteredVideos();
    
    if (query) {
      videos = videos.filter(function(v) {
        return v.title.toLowerCase().indexOf(query) !== -1 ||
          (v.tags || []).some(function(t) { return t.toLowerCase().indexOf(query) !== -1; });
      });
    }

    if (el.videoCount) el.videoCount.textContent = videos.length;
    el.videoGrid.innerHTML = '';

    if (videos.length === 0) {
      if (el.emptyState) el.emptyState.style.display = 'block';
      return;
    }

    if (el.emptyState) el.emptyState.style.display = 'none';

    videos.forEach(function(v) {
      var card = document.createElement('div');
      card.className = 'video-card' + (v.favorite ? ' favorite' : '') + (bulkMode && selectedVideos.indexOf(v.id) > -1 ? ' selected' : '');

      var tagsHtml = '';
      if (v.tags && v.tags.length) {
        tagsHtml = '<div class="video-tags">' + v.tags.map(function(t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>';
      }

      card.innerHTML = 
        (bulkMode ? '<input type="checkbox" class="bulk-checkbox" data-id="' + v.id + '"' + (selectedVideos.indexOf(v.id) > -1 ? ' checked' : '') + '>' : '') +
        '<a href="' + v.url + '" target="_blank" rel="noopener" class="video-card-link">' +
        '<img src="' + v.thumbnail + '" alt="" class="video-thumbnail" loading="lazy" />' +
        '<div class="video-info"><h3 class="video-title">' + esc(v.title) + '</h3>' +
        tagsHtml +
        '<p class="video-date">' + new Date(v.savedAt).toLocaleDateString() + '</p></div></a>' +
        '<div class="video-actions">' +
        '<button class="btn-fav" data-id="' + v.id + '">' + (v.favorite ? '⭐' : '☆') + '</button>' +
        '<button class="btn-del" data-id="' + v.id + '" data-title="' + esc(v.title) + '">🗑️</button>' +
        '</div>';

      el.videoGrid.appendChild(card);
    });

    el.videoGrid.querySelectorAll('.btn-fav').forEach(function(b) {
      b.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); toggleFavorite(this.dataset.id); });
    });
    el.videoGrid.querySelectorAll('.btn-del').forEach(function(b) {
      b.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation();
        if (confirm('Delete "' + this.dataset.title + '"?')) deleteVideoById(this.dataset.id);
      });
    });
    el.videoGrid.querySelectorAll('.bulk-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = this.dataset.id;
        var idx = selectedVideos.indexOf(id);
        if (idx > -1) selectedVideos.splice(idx, 1);
        else selectedVideos.push(id);
        updateBulkUI();
        this.parentElement.classList.toggle('selected', selectedVideos.indexOf(id) > -1);
      });
    });
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    var btn = document.querySelector('[data-filter="' + filter + '"]');
    if (btn) btn.classList.add('active');
    var labels = { all: 'All Time', today: 'Today', week: 'This Week', month: 'This Month', favorites: '⭐ Favorites' };
    if (el.filterLabel) el.filterLabel.textContent = '📅 ' + (labels[filter] || 'All');
    renderGrid();
  }

  function toggleBulkMode() {
    bulkMode = !bulkMode;
    selectedVideos = [];
    updateBulkUI();
    renderGrid();
  }

  function updateBulkUI() {
    if (!el.bulkBar) return;
    if (bulkMode) {
      el.bulkBar.style.display = 'flex';
      el.bulkCount.textContent = selectedVideos.length ? selectedVideos.length + ' selected' : 'Select videos';
    } else {
      el.bulkBar.style.display = 'none';
    }
  }

  function bulkDelete() {
    if (!selectedVideos.length) return;
    if (!confirm('Delete ' + selectedVideos.length + ' video(s)?')) return;
    var archive = loadArchive();
    saveArchive(archive.filter(function(v) { return selectedVideos.indexOf(v.id) === -1; }));
    selectedVideos = []; bulkMode = false;
    updateBulkUI(); renderGrid();
    toast('Deleted!', 'success');
    if (loadSettings().autoSync) silentSync();
  }

  function bulkFavorite() {
    if (!selectedVideos.length) return;
    var archive = loadArchive();
    archive.forEach(function(v) { if (selectedVideos.indexOf(v.id) > -1) v.favorite = true; });
    saveArchive(archive);
    selectedVideos = []; bulkMode = false;
    updateBulkUI(); renderGrid();
    toast('Added to favorites!', 'success');
  }

  function cancelBulk() {
    bulkMode = false; selectedVideos = [];
    updateBulkUI(); renderGrid();
  }

  function exportArchive() {
    var data = JSON.stringify(loadArchive(), null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yt-archive-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
  }

  function importArchive(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid');
        var existing = loadArchive();
        var count = 0;
        imported.forEach(function(v) {
          if (!existing.some(function(x) { return x.id === v.id || x.url === v.url; })) {
            existing.push(v); count++;
          }
        });
        saveArchive(existing);
        toast('Imported ' + count + ' video(s)!', 'success');
        renderGrid();
      } catch(err) { toast('Invalid file', 'error'); }
    };
    reader.readAsText(file);
  }

  function manualSync() {
    var token = getPat();
    var repo = getRepo();
    if (!token || !repo) { toast('Set up GitHub in Settings ⚙️ first', 'warning'); openSettings(); return; }
    toast('Syncing...', 'info');
    syncToGitHub(loadArchive(), token, repo)
      .then(function() { toast('Synced! ✅', 'success'); })
      .catch(function(err) { toast(err.message, 'error'); });
  }

  function openSettings() {
    if (!el.settingsModal) return;
    el.settingsModal.classList.add('active');
    el.settingsModal.setAttribute('aria-hidden', 'false');
    if (el.patInput) el.patInput.value = getPat();
    if (el.repoInput) el.repoInput.value = getRepo();
    if (el.testResult) { el.testResult.textContent = ''; el.testResult.className = ''; }
  }

  function closeSettings() {
    if (!el.settingsModal) return;
    el.settingsModal.classList.remove('active');
    el.settingsModal.setAttribute('aria-hidden', 'true');
  }

  function saveSettingsModal() {
    var pat = (el.patInput || {}).value || '';
    var repo = (el.repoInput || {}).value || '';
    if (!pat) { toast('Token required', 'warning'); return; }
    setPat(pat.trim());
    setRepo(repo.trim());
    updateConnectionStatus();
    closeSettings();
    toast('Settings saved! 🔒', 'success');
  }

  function testConnection() {
    var pat = (el.patInput || {}).value || '';
    if (!pat) return;
    if (el.testBtn) { el.testBtn.disabled = true; el.testBtn.textContent = '⏳...'; }
    if (el.testResult) { el.testResult.textContent = ''; el.testResult.className = ''; }
    fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'token ' + pat, 'Accept': 'application/vnd.github.v3+json' }
    })
    .then(function(r) {
      if (r.ok) return r.json().then(function(d) {
        if (el.testResult) { el.testResult.textContent = '✅ ' + d.login; el.testResult.className = 'success'; }
      });
      if (el.testResult) { el.testResult.textContent = '❌ Auth failed'; el.testResult.className = 'error'; }
    })
    .catch(function() {
      if (el.testResult) { el.testResult.textContent = '❌ Network error'; el.testResult.className = 'error'; }
    })
    .then(function() {
      if (el.testBtn) { el.testBtn.disabled = false; el.testBtn.textContent = '🔍 Test Connection'; }
    });
  }

  // ============ Init ============
  function init() {
    el = getElements();

    var settings = loadSettings();
    applyTheme(settings.darkMode || false);
    updateAutoSyncUI(settings.autoSync || false);
    if (settings.autoSync) startAutoSync();
    updateConnectionStatus();

    if (el.addBtn) el.addBtn.addEventListener('click', function() { addVideo(); });
    if (el.videoUrl) el.videoUrl.addEventListener('keypress', function(e) { if (e.key === 'Enter') addVideo(); });
    if (el.searchInput) el.searchInput.addEventListener('input', renderGrid);
    if (el.themeToggle) el.themeToggle.addEventListener('click', toggleTheme);
    if (el.autoSyncToggle) el.autoSyncToggle.addEventListener('click', toggleAutoSync);

    document.querySelectorAll('.filter-btn').forEach(function(b) {
      b.addEventListener('click', function() { setFilter(this.dataset.filter); });
    });

    if ($('bulk-mode-btn')) $('bulk-mode-btn').addEventListener('click', toggleBulkMode);
    if ($('bulk-delete-btn')) $('bulk-delete-btn').addEventListener('click', bulkDelete);
    if ($('bulk-favorite-btn')) $('bulk-favorite-btn').addEventListener('click', bulkFavorite);
    if ($('bulk-cancel-btn')) $('bulk-cancel-btn').addEventListener('click', cancelBulk);

    if ($('export-btn')) $('export-btn').addEventListener('click', function() { exportArchive(); toast('Exported!', 'success'); });
    if ($('import-btn')) $('import-btn').addEventListener('click', function() { if (el.importFile) el.importFile.click(); });
    if (el.importFile) el.importFile.addEventListener('change', function(e) {
      if (e.target.files[0]) { importArchive(e.target.files[0]); e.target.value = ''; }
    });

    if ($('settings-trigger')) $('settings-trigger').addEventListener('click', openSettings);
    if ($('settings-close')) $('settings-close').addEventListener('click', closeSettings);
    if ($('settings-cancel')) $('settings-cancel').addEventListener('click', closeSettings);
    if ($('settings-save')) $('settings-save').addEventListener('click', saveSettingsModal);
    if (el.testBtn) el.testBtn.addEventListener('click', testConnection);
    if (el.settingsModal) {
      var overlay = el.settingsModal.querySelector('.modal-overlay');
      if (overlay) overlay.addEventListener('click', closeSettings);
    }

    if ($('sync-btn')) $('sync-btn').addEventListener('click', manualSync);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && el.settingsModal && el.settingsModal.classList.contains('active')) closeSettings();
    });

    window.addEventListener('online', function() {
      var banner = $('offline-banner'); if (banner) banner.style.display = 'none';
    });
    window.addEventListener('offline', function() {
      var banner = $('offline-banner'); if (banner) banner.style.display = 'block';
    });

    if (!navigator.onLine) {
      var banner = $('offline-banner'); if (banner) banner.style.display = 'block';
    }

    renderGrid();

    // ============ URL Parameter Auto-Add ============
    var params = new URLSearchParams(window.location.search);
    var urlParam = params.get('url');
    if (urlParam) {
      // Clean the URL (remove extra params from YouTube links)
      var cleanUrl = urlParam.split('&')[0]; // Remove tracking params
      if (el.videoUrl) el.videoUrl.value = cleanUrl;
      // Auto-add with a small delay to ensure everything is ready
      setTimeout(function() {
        addVideo(cleanUrl);
      }, 500);
    }
  }

  window.toggleBulkMode = toggleBulkMode;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
