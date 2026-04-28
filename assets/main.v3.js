// YT Archive System v3 - Fixed: Single Tab + Bulk Actions
(function() {
  'use strict';

  var STORAGE_KEY = 'yt-archive-videos';

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"videos":[]}'); }
    catch(e) { return { videos: [] }; }
  }

  function saveAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadArchive() { return loadAll().videos || []; }
  function saveArchive(videos) { var d = loadAll(); d.videos = videos; saveAll(d); }
  function getPat() { return loadAll().pat || ''; }
  function setPat(token) { var d = loadAll(); d.pat = token; saveAll(d); }
  function getRepo() { return loadAll().repo || ''; }
  function setRepo(repo) { var d = loadAll(); d.repo = repo; saveAll(d); }

  var SETTINGS_KEY = 'yt-archive-settings';
  function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch(e) { return {}; } }
  function saveSettingsObj(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

  var bulkMode = false;
  var selectedVideos = [];
  var currentFilter = 'all';
  var pendingBookmarkUrl = null;

  function $(id) { return document.getElementById(id); }

  function getElements() {
    return {
      videoUrl: $('video-url-input'), tagInput: $('tag-input'), addBtn: $('add-video-btn'),
      searchInput: $('search-input'), videoGrid: $('video-grid'), emptyState: $('empty-state'),
      videoCount: $('video-count'), toastContainer: $('toast-container'),
      themeToggle: $('theme-toggle'), autoSyncToggle: $('auto-sync-toggle'),
      connectionStatus: $('connection-status'), filterLabel: $('date-filter-label'),
      bulkBar: $('bulk-action-bar'), bulkCount: $('bulk-count'),
      settingsModal: $('settings-modal'), patInput: $('pat-input'), repoInput: $('repo-input'),
      testResult: $('test-result'), testBtn: $('test-connection-btn'), importFile: $('import-file'),
      tagModal: $('tag-modal'), tagModalInput: $('tag-modal-input'),
      tagModalSave: $('tag-modal-save'), tagModalSkip: $('tag-modal-skip')
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
    if (dark) { document.documentElement.setAttribute('data-theme', 'dark'); if (el.themeToggle) el.themeToggle.textContent = '☀️'; }
    else { document.documentElement.removeAttribute('data-theme'); if (el.themeToggle) el.themeToggle.textContent = '🌙'; }
  }

  function toggleTheme() { var s = loadSettings(); s.darkMode = !s.darkMode; saveSettingsObj(s); applyTheme(s.darkMode); }

  var autoSyncTimer = null;
  function updateAutoSyncUI(e) { if (el.autoSyncToggle) el.autoSyncToggle.textContent = e ? '🔄 Auto: ON' : '🔄 Auto: OFF'; }
  function toggleAutoSync() { var s = loadSettings(); s.autoSync = !s.autoSync; saveSettingsObj(s); updateAutoSyncUI(s.autoSync); if (s.autoSync) startAutoSync(); else stopAutoSync(); toast(s.autoSync ? 'Auto sync ON' : 'Auto sync OFF', 'info'); }
  function startAutoSync() { stopAutoSync(); autoSyncTimer = setInterval(silentSync, 300000); }
  function stopAutoSync() { if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; } }
  function silentSync() { var t = getPat(), r = getRepo(); if (!t || !r) return; syncToGitHub(loadArchive(), t, r).catch(function(){}); }

  function updateConnectionStatus() {
    var token = getPat();
    if (!el.connectionStatus) return;
    if (token && token.length > 20) { el.connectionStatus.textContent = '✅ Connected'; el.connectionStatus.className = 'status-connected'; }
    else { el.connectionStatus.textContent = '⚠️ Not Connected'; el.connectionStatus.className = 'status-disconnected'; }
  }

  function syncToGitHub(videos, token, repo) {
    var parts = repo.split('/');
    if (parts.length < 2) return Promise.reject(new Error('Invalid repo format'));
    var url = 'https://api.github.com/repos/' + parts[0] + '/' + parts[1] + '/contents/data/videos.json';
    var sha = null;
    return fetch(url, { headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' } })
    .then(function(r) { if (r.ok) return r.json().then(function(d) { sha = d.sha; }); if (r.status === 404) return null; throw new Error('GitHub error: ' + r.status); })
    .then(function() {
      var content = btoa(unescape(encodeURIComponent(JSON.stringify(videos, null, 2))));
      var body = { message: 'Update: ' + videos.length + ' video(s)', content: content, branch: 'main' };
      if (sha) body.sha = sha;
      return fetch(url, { method: 'PUT', headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    })
    .then(function(r) { if (!r.ok) { if (r.status === 409) throw new Error('Conflict. Try again.'); if (r.status === 401) throw new Error('Invalid token.'); throw new Error('Sync error: ' + r.status); } return r.json(); });
  }

  function saveVideo(url, title, thumbnail, tags) {
    var video = { id: generateId(), url: url, title: title, thumbnail: thumbnail, tags: tags || [], favorite: false, savedAt: new Date().toISOString() };
    var a = loadArchive(); a.unshift(video); saveArchive(a);
    return video;
  }

  function generateId() { var c = 'abcdefghijklmnopqrstuvwxyz0123456789', id = ''; for (var i = 0; i < 11; i++) id += c[Math.floor(Math.random() * c.length)]; return id; }

  function toggleFavorite(videoId) { var a = loadArchive(); var v = a.find(function(x) { return x.id === videoId; }); if (v) { v.favorite = !v.favorite; saveArchive(a); } renderGrid(); }

  function deleteVideoById(videoId) { var a = loadArchive(); saveArchive(a.filter(function(v) { return v.id !== videoId; })); renderGrid(); if (loadSettings().autoSync) silentSync(); }

  function showTagModal(url) { pendingBookmarkUrl = url; if (el.tagModal) { el.tagModal.classList.add('active'); el.tagModal.setAttribute('aria-hidden', 'false'); if (el.tagModalInput) { el.tagModalInput.value = ''; setTimeout(function() { el.tagModalInput.focus(); }, 100); } } }
  function hideTagModal() { if (el.tagModal) { el.tagModal.classList.remove('active'); el.tagModal.setAttribute('aria-hidden', 'true'); } }

  function confirmTags() {
    var tags = el.tagModalInput ? el.tagModalInput.value.trim() : '';
    hideTagModal();
    if (el.tagInput) el.tagInput.value = tags;
    if (pendingBookmarkUrl) { doAddVideo(pendingBookmarkUrl, tags); pendingBookmarkUrl = null; }
  }

  function skipTags() {
    hideTagModal();
    if (pendingBookmarkUrl) { if (el.tagInput) el.tagInput.value = ''; doAddVideo(pendingBookmarkUrl, ''); pendingBookmarkUrl = null; }
  }

  function addVideo(prefilledUrl) {
    if (prefilledUrl) { showTagModal(prefilledUrl); return; }
    var url = el.videoUrl ? el.videoUrl.value.trim() : '';
    var tags = el.tagInput ? el.tagInput.value.trim() : '';
    doAddVideo(url, tags);
  }

  function doAddVideo(url, tags) {
    if (!url) { toast('Enter a YouTube URL', 'warning'); return; }
    if (!/youtube\.com|youtu\.be/.test(url)) { toast('Invalid YouTube URL', 'error'); return; }
    var tagList = [];
    if (tags && tags.trim()) { tagList = tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean); }
    if (el.addBtn) { el.addBtn.disabled = true; el.addBtn.textContent = '⏳...'; }
    var videoId = null;
    var patterns = [/v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /shorts\/([a-zA-Z0-9_-]{11})/];
    for (var i = 0; i < patterns.length; i++) { var m = url.match(patterns[i]); if (m) { videoId = m[1]; break; } }
    if (!videoId) { toast('Cannot extract video ID', 'error'); if (el.addBtn) { el.addBtn.disabled = false; el.addBtn.textContent = '➕ Add'; } return; }
    fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json')
      .then(function(r) { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(function(data) {
        saveVideo(url, data.title || 'Untitled', data.thumbnail_url || 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg', tagList);
        if (el.videoUrl) el.videoUrl.value = '';
        if (el.tagInput) el.tagInput.value = '';
        toast('Saved: ' + (data.title || 'Video'), 'success');
        renderGrid();
        if (loadSettings().autoSync) silentSync();
      })
      .catch(function() { toast('Error fetching video info', 'error'); })
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
    if (query) { videos = videos.filter(function(v) { return v.title.toLowerCase().indexOf(query) !== -1 || (v.tags || []).some(function(t) { return t.toLowerCase().indexOf(query) !== -1; }); }); }
    if (el.videoCount) el.videoCount.textContent = videos.length;
    el.videoGrid.innerHTML = '';
    if (videos.length === 0) { if (el.emptyState) el.emptyState.style.display = 'block'; return; }
    if (el.emptyState) el.emptyState.style.display = 'none';

    videos.forEach(function(v) {
      var card = document.createElement('div');
      card.className = 'video-card' + (v.favorite ? ' favorite' : '') + (bulkMode && selectedVideos.indexOf(v.id) > -1 ? ' selected' : '');
      var tagsHtml = '';
      if (v.tags && v.tags.length) { tagsHtml = '<div class="video-tags">' + v.tags.map(function(t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>'; }
      card.innerHTML = 
        (bulkMode ? '<input type="checkbox" class="bulk-checkbox" data-id="' + v.id + '"' + (selectedVideos.indexOf(v.id) > -1 ? ' checked' : '') + '>' : '') +
        '<a href="' + v.url + '" target="_blank" rel="noopener" class="video-card-link"><img src="' + v.thumbnail + '" alt="" class="video-thumbnail" loading="lazy" /><div class="video-info"><h3 class="video-title">' + esc(v.title) + '</h3>' + tagsHtml + '<p class="video-date">' + new Date(v.savedAt).toLocaleDateString() + '</p></div></a>' +
        '<div class="video-actions"><button class="btn-fav" data-id="' + v.id + '">' + (v.favorite ? '⭐' : '☆') + '</button><button class="btn-del" data-id="' + v.id + '" data-title="' + esc(v.title) + '">🗑️</button></div>';
      el.videoGrid.appendChild(card);
    });

    el.videoGrid.querySelectorAll('.btn-fav').forEach(function(b) { b.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); toggleFavorite(this.dataset.id); }); });
    el.videoGrid.querySelectorAll('.btn-del').forEach(function(b) { b.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); if (confirm('Delete "' + this.dataset.title + '"?')) deleteVideoById(this.dataset.id); }); });
    el.videoGrid.querySelectorAll('.bulk-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = this.dataset.id;
        var idx = selectedVideos.indexOf(id);
        if (idx > -1) selectedVideos.splice(idx, 1);
        else selectedVideos.push(id);
        updateBulkUI();
        var card = this.closest('.video-card');
        if (card) card.classList.toggle('selected', selectedVideos.indexOf(id) > -1);
      });
    });
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    var btn = document.querySelector('[data-filter="' + filter + '"]');
    if (btn) btn.classList.add('active');
    var labels = { all: 'All Time', today: 'Today', week: 'This Week', month: 'This Month', favorites: '⭐ Favorites' };
    if (el.filterLabel) el.filterLabel.textContent = '📅 ' + (labels[filter] || 'All');
    renderGrid();
  }

  // ============ BULK ACTIONS - FULLY REWRITTEN ============
  function toggleBulkMode() {
    bulkMode = !bulkMode;
    selectedVideos = [];
    updateBulkUI();
    renderGrid();
    if (!bulkMode && el.bulkBar) el.bulkBar.style.display = 'none';
  }

  function updateBulkUI() {
    if (!el.bulkBar) return;
    if (bulkMode) {
      el.bulkBar.style.display = 'flex';
      el.bulkCount.textContent = selectedVideos.length ? selectedVideos.length + ' selected' : 'Click videos to select';
    } else {
      el.bulkBar.style.display = 'none';
    }
  }

  function bulkDelete() {
    if (selectedVideos.length === 0) { toast('Select videos first!', 'warning'); return; }
    var count = selectedVideos.length;
    if (!confirm('Delete ' + count + ' video(s)?')) return;
    var archive = loadArchive();
    saveArchive(archive.filter(function(v) { return selectedVideos.indexOf(v.id) === -1; }));
    selectedVideos = [];
    bulkMode = false;
    updateBulkUI();
    renderGrid();
    toast('Deleted ' + count + ' video(s)!', 'success');
  }

  function bulkFavorite() {
    if (selectedVideos.length === 0) { toast('Select videos first!', 'warning'); return; }
    var count = selectedVideos.length;
    var archive = loadArchive();
    archive.forEach(function(v) { if (selectedVideos.indexOf(v.id) > -1) v.favorite = true; });
    saveArchive(archive);
    selectedVideos = [];
    bulkMode = false;
    updateBulkUI();
    renderGrid();
    toast('Favorited ' + count + ' video(s)!', 'success');
  }

  function cancelBulk() {
    bulkMode = false;
    selectedVideos = [];
    updateBulkUI();
    renderGrid();
  }

  function exportArchive() {
    var data = JSON.stringify(loadAll(), null, 2);
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
        var existing = loadAll();
        if (!imported.videos && Array.isArray(imported)) imported = { videos: imported };
        imported.videos = imported.videos || [];
        var count = 0;
        imported.videos.forEach(function(v) { if (!existing.videos.some(function(x) { return x.id === v.id || x.url === v.url; })) { existing.videos.push(v); count++; } });
        if (imported.pat && !existing.pat) existing.pat = imported.pat;
        if (imported.repo && !existing.repo) existing.repo = imported.repo;
        saveAll(existing);
        updateConnectionStatus();
        toast('Imported ' + count + ' video(s)!', 'success');
        renderGrid();
      } catch(err) { toast('Invalid file', 'error'); }
    };
    reader.readAsText(file);
  }

  function manualSync() {
    var token = getPat(), repo = getRepo();
    if (!token || !repo) { toast('Set up GitHub in Settings first', 'warning'); openSettings(); return; }
    toast('Syncing...', 'info');
    syncToGitHub(loadArchive(), token, repo).then(function() { toast('Synced!', 'success'); }).catch(function(err) { toast(err.message, 'error'); });
  }

  function openSettings() {
    if (!el.settingsModal) return;
    el.settingsModal.classList.add('active'); el.settingsModal.setAttribute('aria-hidden', 'false');
    if (el.patInput) el.patInput.value = getPat();
    if (el.repoInput) el.repoInput.value = getRepo();
    if (el.testResult) { el.testResult.textContent = ''; el.testResult.className = ''; }
  }

  function closeSettings() { if (el.settingsModal) { el.settingsModal.classList.remove('active'); el.settingsModal.setAttribute('aria-hidden', 'true'); } }

  function saveSettingsModal() {
    var pat = (el.patInput || {}).value || '', repo = (el.repoInput || {}).value || '';
    if (!pat) { toast('Token required', 'warning'); return; }
    setPat(pat.trim()); setRepo(repo.trim());
    updateConnectionStatus(); closeSettings();
    toast('Settings saved!', 'success');
  }

  function testConnection() {
    var pat = (el.patInput || {}).value || '';
    if (!pat) return;
    if (el.testBtn) { el.testBtn.disabled = true; el.testBtn.textContent = '⏳...'; }
    if (el.testResult) { el.testResult.textContent = ''; el.testResult.className = ''; }
    fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + pat, 'Accept': 'application/vnd.github.v3+json' } })
    .then(function(r) { if (r.ok) return r.json().then(function(d) { if (el.testResult) { el.testResult.textContent = '✅ ' + d.login; el.testResult.className = 'success'; } }); if (el.testResult) { el.testResult.textContent = '❌ Auth failed'; el.testResult.className = 'error'; } })
    .catch(function() { if (el.testResult) { el.testResult.textContent = '❌ Network error'; el.testResult.className = 'error'; } })
    .then(function() { if (el.testBtn) { el.testBtn.disabled = false; el.testBtn.textContent = '🔍 Test Connection'; } });
  }

  function init() {
    el = getElements();

    var settings = loadSettings();
    applyTheme(settings.darkMode || false);
    updateAutoSyncUI(settings.autoSync || false);
    if (settings.autoSync) startAutoSync();
    updateConnectionStatus();

    // Add video
    if (el.addBtn) el.addBtn.addEventListener('click', function() { addVideo(); });
    if (el.videoUrl) el.videoUrl.addEventListener('keypress', function(e) { if (e.key === 'Enter') addVideo(); });

    // Search
    if (el.searchInput) el.searchInput.addEventListener('input', renderGrid);

    // Theme & Auto Sync
    if (el.themeToggle) el.themeToggle.addEventListener('click', toggleTheme);
    if (el.autoSyncToggle) el.autoSyncToggle.addEventListener('click', toggleAutoSync);

    // Tag modal
    if (el.tagModalSave) el.tagModalSave.addEventListener('click', confirmTags);
    if (el.tagModalSkip) el.tagModalSkip.addEventListener('click', skipTags);
    if (el.tagModal) { var to = el.tagModal.querySelector('.modal-overlay'); if (to) to.addEventListener('click', skipTags); }

    // Filters
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.addEventListener('click', function() { setFilter(this.dataset.filter); }); });

    // Bulk buttons - DIRECT event listeners (no replaceWith needed)
    var bulkModeBtn = $('bulk-mode-btn');
    if (bulkModeBtn) { bulkModeBtn.addEventListener('click', toggleBulkMode); }
    var bulkDelBtn = $('bulk-delete-btn');
    if (bulkDelBtn) { bulkDelBtn.addEventListener('click', bulkDelete); }
    var bulkFavBtn = $('bulk-favorite-btn');
    if (bulkFavBtn) { bulkFavBtn.addEventListener('click', bulkFavorite); }
    var bulkCanBtn = $('bulk-cancel-btn');
    if (bulkCanBtn) { bulkCanBtn.addEventListener('click', cancelBulk); }

    // Export/Import
    if ($('export-btn')) $('export-btn').addEventListener('click', function() { exportArchive(); toast('Exported!', 'success'); });
    if ($('import-btn')) $('import-btn').addEventListener('click', function() { if (el.importFile) el.importFile.click(); });
    if (el.importFile) el.importFile.addEventListener('change', function(e) { if (e.target.files[0]) { importArchive(e.target.files[0]); e.target.value = ''; } });

    // Settings
    if ($('settings-trigger')) $('settings-trigger').addEventListener('click', openSettings);
    if ($('settings-close')) $('settings-close').addEventListener('click', closeSettings);
    if ($('settings-cancel')) $('settings-cancel').addEventListener('click', closeSettings);
    if ($('settings-save')) $('settings-save').addEventListener('click', saveSettingsModal);
    if (el.testBtn) el.testBtn.addEventListener('click', testConnection);
    if (el.settingsModal) { var ov = el.settingsModal.querySelector('.modal-overlay'); if (ov) ov.addEventListener('click', closeSettings); }

    // Sync
    if ($('sync-btn')) $('sync-btn').addEventListener('click', manualSync);

    // Keyboard
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (el.tagModal && el.tagModal.classList.contains('active')) skipTags();
        if (el.settingsModal && el.settingsModal.classList.contains('active')) closeSettings();
      }
    });

    // Online/Offline
    window.addEventListener('online', function() { var b = $('offline-banner'); if (b) b.style.display = 'none'; });
    window.addEventListener('offline', function() { var b = $('offline-banner'); if (b) b.style.display = 'block'; });
    if (!navigator.onLine) { var b = $('offline-banner'); if (b) b.style.display = 'block'; }

    renderGrid();

    // URL param - bookmarklet
    var params = new URLSearchParams(window.location.search);
    var urlParam = params.get('url');
    if (urlParam) {
      var cleanUrl = decodeURIComponent(urlParam).split('&')[0];
      if (el.videoUrl) el.videoUrl.value = cleanUrl;
      var waitForReady = setInterval(function() {
        if (el.addBtn && !el.addBtn.disabled) { clearInterval(waitForReady); addVideo(cleanUrl); }
      }, 200);
      setTimeout(function() { clearInterval(waitForReady); }, 5000);
    }
  }

  window.toggleBulkMode = toggleBulkMode;
  window.deleteVideoById = deleteVideoById;
  window.toggleFavoriteVideo = toggleFavorite;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
