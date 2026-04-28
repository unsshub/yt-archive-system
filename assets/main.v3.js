// YT Archive v3 - Clean version
(function() {
  'use strict';
  var STORAGE_KEY = 'yt-archive-videos', SETTINGS_KEY = 'yt-archive-settings';
  
  function L() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"videos":[]}'); } catch(e) { return {videos:[]}; } }
  function S(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
  function videos() { return L().videos || []; }
  function saveVids(v) { var d = L(); d.videos = v; S(d); }
  function pat() { return L().pat || ''; }
  function setPat(t) { var d = L(); d.pat = t; S(d); }
  function repo() { return L().repo || ''; }
  function setRepo(r) { var d = L(); d.repo = r; S(d); }
  function settings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch(e) { return {}; } }
  function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

  var bulkMode = false, selectedVideos = [], currentFilter = 'all', pendingUrl = null;
  function E(id) { return document.getElementById(id); }

  function toast(msg, type, dur) {
    var c = E('toast-container'); if (!c) return;
    type = type || 'info'; dur = dur || 3000;
    var t = document.createElement('div'); t.className = 'toast toast-' + type;
    t.innerHTML = '<span>' + msg + '</span>'; c.appendChild(t);
    setTimeout(function() { t.remove(); }, dur);
  }

  function applyTheme(dark) {
    if (dark) { document.documentElement.setAttribute('data-theme', 'dark'); var tt = E('theme-toggle'); if (tt) tt.textContent = '☀️'; }
    else { document.documentElement.removeAttribute('data-theme'); var tt2 = E('theme-toggle'); if (tt2) tt2.textContent = '🌙'; }
  }

  function toggleTheme() { var s = settings(); s.darkMode = !s.darkMode; saveSettings(s); applyTheme(s.darkMode); }

  var autoTimer = null;
  function autoUI(e) { var b = E('auto-sync-toggle'); if (b) b.textContent = e ? '🔄 Auto: ON' : '🔄 Auto: OFF'; }
  function toggleAuto() { var s = settings(); s.autoSync = !s.autoSync; saveSettings(s); autoUI(s.autoSync); if (s.autoSync) startAuto(); else stopAuto(); toast(s.autoSync ? 'Auto sync ON' : 'Auto sync OFF', 'info'); }
  function startAuto() { stopAuto(); autoTimer = setInterval(silentSync, 300000); }
  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
  function silentSync() { var t = pat(), r = repo(); if (!t || !r) return; syncGH(videos(), t, r).catch(function(){}); }

  function connStatus() {
    var c = E('connection-status'); if (!c) return;
    var t = pat();
    if (t && t.length > 20) { c.textContent = '✅ Connected'; c.className = 'status-connected'; }
    else { c.textContent = '⚠️ Not Connected'; c.className = 'status-disconnected'; }
  }

  function syncGH(vids, token, r) {
    var parts = r.split('/');
    var url = 'https://api.github.com/repos/' + parts[0] + '/' + parts[1] + '/contents/data/videos.json';
    var sha = null;
    return fetch(url, { headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' } })
    .then(function(res) { if (res.ok) return res.json().then(function(d) { sha = d.sha; }); if (res.status === 404) return null; throw new Error('GitHub error: ' + res.status); })
    .then(function() {
      var content = btoa(unescape(encodeURIComponent(JSON.stringify(vids, null, 2))));
      var body = { message: 'Update: ' + vids.length + ' video(s)', content: content, branch: 'main' };
      if (sha) body.sha = sha;
      return fetch(url, { method: 'PUT', headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    })
    .then(function(res) { if (!res.ok) throw new Error('Sync error: ' + res.status); return res.json(); });
  }

  function genId() { var c = 'abcdefghijklmnopqrstuvwxyz0123456789', id = ''; for (var i = 0; i < 11; i++) id += c[Math.floor(Math.random() * c.length)]; return id; }

  function addVid(url, tags) {
    if (!url) { toast('Enter a YouTube URL', 'warning'); return; }
    if (!/youtube\.com|youtu\.be/.test(url)) { toast('Invalid URL', 'error'); return; }
    var tagList = (tags || '').split(',').map(function(t) { return t.trim(); }).filter(Boolean);
    var btn = E('add-video-btn'); if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    var vid = null;
    [/v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /shorts\/([a-zA-Z0-9_-]{11})/].forEach(function(p) { var m = url.match(p); if (m) vid = m[1]; });
    if (!vid) { toast('Cannot extract ID', 'error'); if (btn) { btn.disabled = false; btn.textContent = '➕ Add'; } return; }
    fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + vid + '&format=json')
      .then(function(r) { if (!r.ok) throw new Error('Fail'); return r.json(); })
      .then(function(d) {
        var vids = videos();
        vids.unshift({ id: genId(), url: url, title: d.title || 'Untitled', thumbnail: d.thumbnail_url || 'https://img.youtube.com/vi/' + vid + '/hqdefault.jpg', tags: tagList, favorite: false, savedAt: new Date().toISOString() });
        saveVids(vids);
        var u = E('video-url-input'); if (u) u.value = '';
        var ti = E('tag-input'); if (ti) ti.value = '';
        toast('Saved: ' + (d.title || 'Video'), 'success');
        render();
        if (settings().autoSync) silentSync();
      })
      .catch(function() { toast('Error fetching', 'error'); })
      .then(function() { if (btn) { btn.disabled = false; btn.textContent = '➕ Add'; } });
  }

  function toggleFav(vid) { var v = videos(); var f = v.find(function(x) { return x.id === vid; }); if (f) { f.favorite = !f.favorite; saveVids(v); } render(); }
  function delVid(vid) { saveVids(videos().filter(function(v) { return v.id !== vid; })); render(); if (settings().autoSync) silentSync(); }

  function showTagModal(url) { pendingUrl = url; var m = E('tag-modal'); if (m) { m.classList.add('active'); m.setAttribute('aria-hidden', 'false'); var inp = E('tag-modal-input'); if (inp) { inp.value = ''; setTimeout(function() { inp.focus(); }, 100); } } }
  function hideTagModal() { var m = E('tag-modal'); if (m) { m.classList.remove('active'); m.setAttribute('aria-hidden', 'true'); } }
  function confirmTags() { var tags = (E('tag-modal-input') || {}).value || ''; hideTagModal(); if (pendingUrl) { addVid(pendingUrl, tags); pendingUrl = null; } }
  function skipTags() { hideTagModal(); if (pendingUrl) { addVid(pendingUrl, ''); pendingUrl = null; } }

  function doAdd(prefilled) {
    if (prefilled) { showTagModal(prefilled); return; }
    var u = (E('video-url-input') || {}).value || '';
    var t = (E('tag-input') || {}).value || '';
    addVid(u.trim(), t.trim());
  }

  function filtered() {
    var v = videos();
    if (currentFilter === 'favorites') return v.filter(function(x) { return x.favorite; });
    if (currentFilter === 'all') return v;
    var now = new Date(), cutoff;
    if (currentFilter === 'today') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (currentFilter === 'week') cutoff = new Date(now.getTime() - 7*86400000);
    else if (currentFilter === 'month') cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    return v.filter(function(x) { return new Date(x.savedAt) >= cutoff; });
  }

  function render() {
    var grid = E('video-grid'); if (!grid) return;
    var q = (E('search-input') || {}).value || '';
    var v = filtered();
    if (q) { q = q.toLowerCase(); v = v.filter(function(x) { return x.title.toLowerCase().indexOf(q) !== -1 || (x.tags || []).some(function(t) { return t.toLowerCase().indexOf(q) !== -1; }); }); }
    var vc = E('video-count'); if (vc) vc.textContent = v.length;
    grid.innerHTML = '';
    var es = E('empty-state');
    if (v.length === 0) { if (es) es.style.display = 'block'; return; }
    if (es) es.style.display = 'none';

    v.forEach(function(x) {
      var card = document.createElement('div');
      card.className = 'video-card' + (x.favorite ? ' favorite' : '') + (bulkMode && selectedVideos.indexOf(x.id) > -1 ? ' selected' : '');
      var tagsHtml = '';
      if (x.tags && x.tags.length) { tagsHtml = '<div class="video-tags">' + x.tags.map(function(t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>'; }
      card.innerHTML = 
        (bulkMode ? '<input type="checkbox" class="bulk-checkbox" data-id="' + x.id + '"' + (selectedVideos.indexOf(x.id) > -1 ? ' checked' : '') + '>' : '') +
        '<a href="' + x.url + '" target="_blank" rel="noopener" class="video-card-link"><img src="' + x.thumbnail + '" alt="" class="video-thumbnail" loading="lazy" /><div class="video-info"><h3 class="video-title">' + esc(x.title) + '</h3>' + tagsHtml + '<p class="video-date">' + new Date(x.savedAt).toLocaleDateString() + '</p></div></a>' +
        '<div class="video-actions"><button class="btn-fav" data-id="' + x.id + '">' + (x.favorite ? '⭐' : '☆') + '</button><button class="btn-del" data-id="' + x.id + '" data-title="' + esc(x.title) + '">🗑️</button></div>';
      grid.appendChild(card);
    });

    grid.querySelectorAll('.btn-fav').forEach(function(b) { b.onclick = function(e) { e.preventDefault(); e.stopPropagation(); toggleFav(this.dataset.id); }; });
    grid.querySelectorAll('.btn-del').forEach(function(b) { b.onclick = function(e) { e.preventDefault(); e.stopPropagation(); if (confirm('Delete "' + this.dataset.title + '"?')) delVid(this.dataset.id); }; });
    grid.querySelectorAll('.bulk-checkbox').forEach(function(cb) {
      cb.onchange = function() {
        var id = this.dataset.id, idx = selectedVideos.indexOf(id);
        if (idx > -1) selectedVideos.splice(idx, 1); else selectedVideos.push(id);
        updateBulkUI();
        var card = this.closest('.video-card'); if (card) card.classList.toggle('selected', selectedVideos.indexOf(id) > -1);
      };
    });
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function setFilter(f) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    var btn = document.querySelector('[data-filter="' + f + '"]'); if (btn) btn.classList.add('active');
    var labels = { all: 'All Time', today: 'Today', week: 'This Week', month: 'This Month', favorites: '⭐ Favorites' };
    var fl = E('date-filter-label'); if (fl) fl.textContent = '📅 ' + (labels[f] || 'All');
    render();
  }

  function toggleBulk() {
    bulkMode = !bulkMode; selectedVideos = []; updateBulkUI(); render();
    if (!bulkMode) { var bb = E('bulk-action-bar'); if (bb) bb.style.display = 'none'; }
  }

  function updateBulkUI() {
    var bb = E('bulk-action-bar'); if (!bb) return;
    if (bulkMode) { bb.style.display = 'flex'; var bc = E('bulk-count'); if (bc) bc.textContent = selectedVideos.length ? selectedVideos.length + ' selected' : 'Click videos to select'; }
    else { bb.style.display = 'none'; }
  }

  function bulkDel() {
    if (!selectedVideos.length) { toast('Select videos first', 'warning'); return; }
    var c = selectedVideos.length;
    if (!confirm('Delete ' + c + ' video(s)?')) return;
    saveVids(videos().filter(function(v) { return selectedVideos.indexOf(v.id) === -1; }));
    selectedVideos = []; bulkMode = false; updateBulkUI(); render();
    toast('Deleted ' + c + ' video(s)!', 'success');
  }

  function bulkFav() {
    if (!selectedVideos.length) { toast('Select videos first', 'warning'); return; }
    var c = selectedVideos.length;
    var v = videos(); v.forEach(function(x) { if (selectedVideos.indexOf(x.id) > -1) x.favorite = true; }); saveVids(v);
    selectedVideos = []; bulkMode = false; updateBulkUI(); render();
    toast('Favorited ' + c + ' video(s)!', 'success');
  }

  function bulkCancel() { bulkMode = false; selectedVideos = []; updateBulkUI(); render(); }

  function doExport() {
    var data = JSON.stringify(L(), null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'yt-archive-' + new Date().toISOString().split('T')[0] + '.json'; a.click();
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var imported = JSON.parse(e.target.result);
        var existing = L();
        if (!imported.videos && Array.isArray(imported)) imported = { videos: imported };
        imported.videos = imported.videos || [];
        var count = 0;
        imported.videos.forEach(function(v) { if (!existing.videos.some(function(x) { return x.id === v.id || x.url === v.url; })) { existing.videos.push(v); count++; } });
        if (imported.pat && !existing.pat) existing.pat = imported.pat;
        if (imported.repo && !existing.repo) existing.repo = imported.repo;
        S(existing); connStatus();
        toast('Imported ' + count + ' video(s)!', 'success'); render();
      } catch(err) { toast('Invalid file', 'error'); }
    };
    reader.readAsText(file);
  }

  function doSync() {
    var t = pat(), r = repo();
    if (!t || !r) { toast('Set up GitHub in Settings first', 'warning'); openSettings(); return; }
    toast('Syncing...', 'info');
    syncGH(videos(), t, r).then(function() { toast('Synced!', 'success'); }).catch(function(err) { toast(err.message, 'error'); });
  }

  function openSettings() {
    var m = E('settings-modal'); if (!m) return;
    m.classList.add('active'); m.setAttribute('aria-hidden', 'false');
    var pi = E('pat-input'); if (pi) pi.value = pat();
    var ri = E('repo-input'); if (ri) ri.value = repo();
    var tr = E('test-result'); if (tr) { tr.textContent = ''; tr.className = ''; }
  }

  function closeSettings() { var m = E('settings-modal'); if (m) { m.classList.remove('active'); m.setAttribute('aria-hidden', 'true'); } }

  function saveSettingsMod() {
    var p = ((E('pat-input') || {}).value || '').trim();
    var r = ((E('repo-input') || {}).value || '').trim();
    if (!p) { toast('Token required', 'warning'); return; }
    setPat(p); setRepo(r); connStatus(); closeSettings();
    toast('Settings saved!', 'success');
  }

  function testConn() {
    var p = ((E('pat-input') || {}).value || '').trim(); if (!p) return;
    var btn = E('test-connection-btn'); if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    var tr = E('test-result'); if (tr) { tr.textContent = ''; tr.className = ''; }
    fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + p, 'Accept': 'application/vnd.github.v3+json' } })
    .then(function(r) { if (r.ok) return r.json().then(function(d) { if (tr) { tr.textContent = '✅ ' + d.login; tr.className = 'success'; } }); if (tr) { tr.textContent = '❌ Auth failed'; tr.className = 'error'; } })
    .catch(function() { if (tr) { tr.textContent = '❌ Network error'; tr.className = 'error'; } })
    .then(function() { if (btn) { btn.disabled = false; btn.textContent = '🔍 Test Connection'; } });
  }

  function init() {
    var s = settings();
    applyTheme(s.darkMode || false); autoUI(s.autoSync || false);
    if (s.autoSync) startAuto(); connStatus();

    // Add video
    var ab = E('add-video-btn'); if (ab) ab.addEventListener('click', function() { doAdd(); });
    var vu = E('video-url-input'); if (vu) vu.addEventListener('keypress', function(e) { if (e.key === 'Enter') doAdd(); });

    // Search
    var si = E('search-input'); if (si) si.addEventListener('input', render);

    // Theme & Auto
    var tt = E('theme-toggle'); if (tt) tt.addEventListener('click', toggleTheme);
    var at = E('auto-sync-toggle'); if (at) at.addEventListener('click', toggleAuto);

    // Tag modal
    var tms = E('tag-modal-save'); if (tms) tms.addEventListener('click', confirmTags);
    var tmk = E('tag-modal-skip'); if (tmk) tmk.addEventListener('click', skipTags);
    var tmc = E('tag-modal-close'); if (tmc) tmc.addEventListener('click', skipTags);
    var tm = E('tag-modal'); if (tm) { var tmo = tm.querySelector('.modal-overlay'); if (tmo) tmo.addEventListener('click', skipTags); }

    // Filters
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.addEventListener('click', function() { setFilter(this.dataset.filter); }); });

    // Bulk buttons
    var bmb = E('bulk-mode-btn'); if (bmb) bmb.addEventListener('click', toggleBulk);
    var bdb = E('bulk-delete-btn'); if (bdb) bdb.addEventListener('click', bulkDel);
    var bfb = E('bulk-favorite-btn'); if (bfb) bfb.addEventListener('click', bulkFav);
    var bcb = E('bulk-cancel-btn'); if (bcb) bcb.addEventListener('click', bulkCancel);

    // Export/Import
    var exb = E('export-btn'); if (exb) exb.addEventListener('click', function() { doExport(); toast('Exported!', 'success'); });
    var imb = E('import-btn'); if (imb) imb.addEventListener('click', function() { var f = E('import-file'); if (f) f.click(); });
    var imf = E('import-file'); if (imf) imf.addEventListener('change', function(e) { if (e.target.files[0]) { doImport(e.target.files[0]); e.target.value = ''; } });

    // Settings
    var st = E('settings-trigger'); if (st) st.addEventListener('click', openSettings);
    var sc = E('settings-close'); if (sc) sc.addEventListener('click', closeSettings);
    var scc = E('settings-cancel'); if (scc) scc.addEventListener('click', closeSettings);
    var ss = E('settings-save'); if (ss) ss.addEventListener('click', saveSettingsMod);
    var tcb = E('test-connection-btn'); if (tcb) tcb.addEventListener('click', testConn);
    var sm = E('settings-modal'); if (sm) { var smo = sm.querySelector('.modal-overlay'); if (smo) smo.addEventListener('click', closeSettings); }

    // Sync
    var syb = E('sync-btn'); if (syb) syb.addEventListener('click', doSync);

    // Keyboard
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var tm2 = E('tag-modal'); if (tm2 && tm2.classList.contains('active')) skipTags();
        var sm2 = E('settings-modal'); if (sm2 && sm2.classList.contains('active')) closeSettings();
      }
    });

    // Online/Offline
    window.addEventListener('online', function() { var b = E('offline-banner'); if (b) b.style.display = 'none'; });
    window.addEventListener('offline', function() { var b = E('offline-banner'); if (b) b.style.display = 'block'; });
    if (!navigator.onLine) { var b2 = E('offline-banner'); if (b2) b2.style.display = 'block'; }

    render();

    // Bookmarklet URL param
    var params = new URLSearchParams(window.location.search);
    var urlParam = params.get('url');
    if (urlParam) {
      var cleanUrl = decodeURIComponent(urlParam).split('&')[0];
      var vu2 = E('video-url-input'); if (vu2) vu2.value = cleanUrl;
      var wait = setInterval(function() {
        var ab2 = E('add-video-btn'); if (ab2 && !ab2.disabled) { clearInterval(wait); doAdd(cleanUrl); }
      }, 200);
      setTimeout(function() { clearInterval(wait); }, 5000);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
