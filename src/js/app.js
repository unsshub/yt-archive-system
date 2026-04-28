// src/js/app.js
// Main application logic - UI bindings and event handlers

// Service imports (available globally via script tags in index.html)
const { saveVideo, loadArchive, searchArchive } = require('./services/storage');
const { fetchVideoMetadata, isValidYouTubeUrl } = require('./services/youtube-api');
const { syncToGitHub, fetchArchive, validateToken } = require('./services/github-sync');
const { enqueue, getQueueLength } = require('./services/offline-queue');

// ==================== Configuration ====================
const DEFAULT_REPO = 'yt-archive/videos';
const DEFAULT_BRANCH = 'main';
const DEFAULT_PATH = 'data/videos.json';

// ==================== State Management ====================
let currentArchive = [];

// ==================== DOM Element References ====================
function getElements() {
  return {
    // Video input
    videoUrlInput: document.getElementById('video-url-input'),
    addVideoBtn: document.getElementById('add-video-btn'),
    addStatus: document.getElementById('add-status'),
    
    // Search
    searchInput: document.getElementById('search-input'),
    
    // Grid
    videoGrid: document.getElementById('video-grid'),
    emptyState: document.getElementById('empty-state'),
    videoCount: document.getElementById('video-count'),
    
    // Settings
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
    
    // Status
    connectionStatus: document.getElementById('connection-status'),
    syncStatus: document.getElementById('sync-status'),
    toastContainer: document.getElementById('toast-container')
  };
}

let elements = {};

// ==================== Toast Notifications ====================

/**
 * Shows a toast notification
 * @param {string} message - Message to display
 * @param {'success'|'error'|'info'|'warning'} type - Toast type
 * @param {number} duration - Duration in ms
 */
function showToast(message, type = 'info', duration = 3000) {
  if (!elements.toastContainer) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;
  
  elements.toastContainer.appendChild(toast);
  
  // Animate out and remove
  setTimeout(() => {
    toast.classList.add('toast-hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==================== Settings Modal Logic ====================

/**
 * Opens the settings modal
 */
function openSettingsModal() {
  const modal = elements.settingsModal;
  if (!modal) return;
  
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  
  // Load saved values
  const savedPat = global.sessionStorage.getItem('github_pat');
  const savedRepo = global.sessionStorage.getItem('github_repo');
  
  if (savedPat && elements.patInput) {
    elements.patInput.value = savedPat;
  }
  if (elements.repoInput) {
    elements.repoInput.value = savedRepo || DEFAULT_REPO;
  }
  
  // Focus first input
  setTimeout(() => {
    const firstFocusable = modal.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (firstFocusable) firstFocusable.focus();
  }, 100);
  
  // Clear previous errors
  clearSettingsErrors();
}

/**
 * Closes the settings modal
 */
function closeSettingsModal() {
  const modal = elements.settingsModal;
  if (!modal) return;
  
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  
  // Return focus to trigger
  if (elements.settingsTrigger) {
    elements.settingsTrigger.focus();
  }
}

/**
 * Validates settings inputs
 * @returns {boolean} - True if all inputs are valid
 */
function validateSettingsInputs() {
  let isValid = true;
  
  // Validate PAT
  const token = elements.patInput ? elements.patInput.value.trim() : '';
  if (!token) {
    if (elements.patError) elements.patError.textContent = 'Token is required';
    isValid = false;
  } else if (!validateToken(token)) {
    if (elements.patError) elements.patError.textContent = 'Invalid token format. Must start with ghp_ and be at least 20 characters';
    isValid = false;
  } else {
    if (elements.patError) elements.patError.textContent = '';
  }
  
  // Validate Repo
  const repo = elements.repoInput ? elements.repoInput.value.trim() : '';
  if (!repo) {
    if (elements.repoError) elements.repoError.textContent = 'Repository is required';
    isValid = false;
  } else if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
    if (elements.repoError) elements.repoError.textContent = 'Invalid format. Use: owner/repository-name';
    isValid = false;
  } else {
    if (elements.repoError) elements.repoError.textContent = '';
  }
  
  return isValid;
}

/**
 * Clears all settings error messages
 */
function clearSettingsErrors() {
  if (elements.patError) elements.patError.textContent = '';
  if (elements.repoError) elements.repoError.textContent = '';
  if (elements.testResult) {
    elements.testResult.textContent = '';
    elements.testResult.className = '';
  }
}

/**
 * Saves settings to sessionStorage
 */
function saveSettings() {
  if (!validateSettingsInputs()) {
    return;
  }
  
  const token = elements.patInput.value.trim();
  const repo = elements.repoInput.value.trim();
  
  global.sessionStorage.setItem('github_pat', token);
  global.sessionStorage.setItem('github_repo', repo);
  
  updateConnectionStatus();
  closeSettingsModal();
  showToast('Settings saved successfully!', 'success');
}

/**
 * Tests GitHub connection with current credentials
 */
async function testConnection() {
  if (!elements.testConnectionBtn || !elements.testResult) return;
  
  const token = elements.patInput ? elements.patInput.value.trim() : '';
  const repo = elements.repoInput ? elements.repoInput.value.trim() : '';
  
  // Show loading state
  elements.testConnectionBtn.textContent = '⏳ Testing...';
  elements.testConnectionBtn.disabled = true;
  elements.testResult.textContent = '';
  elements.testResult.className = '';
  
  // Validate inputs first
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
  
  try {
    // Try to fetch user info to validate token
    const [owner] = repo.split('/');
    const response = await fetch(`https://api.github.com/users/${owner}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.ok) {
      const userData = await response.json();
      elements.testResult.textContent = `✅ Connected as ${userData.login}`;
      elements.testResult.className = 'success';
    } else if (response.status === 401) {
      elements.testResult.textContent = '❌ Authentication failed. Check your token.';
      elements.testResult.className = 'error';
    } else {
      elements.testResult.textContent = `⚠️ API error: ${response.status} ${response.statusText}`;
      elements.testResult.className = 'error';
    }
  } catch (error) {
    elements.testResult.textContent = '❌ Network error. Check your connection.';
    elements.testResult.className = 'error';
  } finally {
    elements.testConnectionBtn.textContent = '🔍 Test Connection';
    elements.testConnectionBtn.disabled = false;
  }
}

/**
 * Updates the connection status indicator
 */
function updateConnectionStatus() {
  const token = global.sessionStorage.getItem('github_pat');
  const status = elements.connectionStatus;
  
  // Guard: if status element doesn't exist, skip
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

// ==================== Video Management ====================

/**
 * Adds a video from URL input
 */
async function addVideo() {
  if (!elements.videoUrlInput || !elements.addVideoBtn) return;
  
  const url = elements.videoUrlInput.value.trim();
  
  if (!url) {
    showToast('Please enter a YouTube URL', 'warning');
    return;
  }
  
  if (!isValidYouTubeUrl(url)) {
    showToast('Invalid YouTube URL', 'error');
    return;
  }
  
  // Show loading state
  elements.addVideoBtn.disabled = true;
  elements.addVideoBtn.textContent = '⏳ Loading...';
  if (elements.addStatus) elements.addStatus.textContent = 'Fetching video metadata...';
  
  try {
    const metadata = await fetchVideoMetadata(url);
    
    const savedVideo = saveVideo({
      url: url,
      title: metadata.title,
      thumbnail: metadata.thumbnail,
      tags: []
    });
    
    // Update UI
    elements.videoUrlInput.value = '';
    if (elements.addStatus) elements.addStatus.textContent = '';
    showToast(`Saved: ${metadata.title}`, 'success');
    
    renderVideoGrid();
  } catch (error) {
    if (elements.addStatus) elements.addStatus.textContent = '';
    showToast(`Error: ${error.message}`, 'error');
  } finally {
    elements.addVideoBtn.disabled = false;
    elements.addVideoBtn.textContent = '➕ Add';
  }
}

/**
 * Renders the video grid from current search/archive state
 */
function renderVideoGrid() {
  if (!elements.searchInput || !elements.videoGrid) return;
  
  const query = elements.searchInput.value;
  const videos = query ? searchArchive(query) : loadArchive();
  
  currentArchive = videos;
  
  // Update count
  if (elements.videoCount) elements.videoCount.textContent = videos.length;
  
  // Clear grid
  elements.videoGrid.innerHTML = '';
  
  if (videos.length === 0) {
    if (elements.emptyState) elements.emptyState.style.display = 'block';
    elements.videoGrid.style.display = 'none';
    return;
  }
  
  if (elements.emptyState) elements.emptyState.style.display = 'none';
  elements.videoGrid.style.display = 'grid';
  
  // Render video cards
  videos.forEach(video => {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.setAttribute('role', 'listitem');
    
    card.innerHTML = `
      <a href="${video.url}" target="_blank" rel="noopener noreferrer" class="video-card-link">
        <img src="${video.thumbnail}" 
             alt="Thumbnail for ${escapeHtml(video.title)}"
             class="video-thumbnail"
             loading="lazy"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2290%22><rect fill=%22%23ddd%22 width=%22120%22 height=%2290%22/><text x=%2260%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22>No Image</text></svg>'"/>
        <div class="video-info">
          <h3 class="video-title">${escapeHtml(video.title)}</h3>
          <p class="video-date">${formatDate(video.savedAt)}</p>
        </div>
      </a>
    `;
    
    elements.videoGrid.appendChild(card);
  });
}

/**
 * Escapes HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Formats a date string for display
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return date.toLocaleDateString(undefined, options);
}

/**
 * Syncs local archive to GitHub (with offline queue support)
 */
async function syncToGithub() {
  const token = global.sessionStorage.getItem('github_pat');
  const repo = global.sessionStorage.getItem('github_repo') || DEFAULT_REPO;
  
  if (!token) {
    showToast('Please configure GitHub settings first', 'warning');
    openSettingsModal();
    return;
  }

  const videos = loadArchive();
  
  // Check if online
  if (!navigator.onLine) {
    // Queue the sync operation for later
    const queued = enqueue({
      type: 'sync',
      videos: videos,
      token: token,
      repo: repo,
      branch: DEFAULT_BRANCH,
      path: DEFAULT_PATH
    });
    
    if (queued) {
      showToast('Offline: Sync queued for when connection is restored', 'warning', 5000);
    }
    return;
  }

  // Online - try to sync immediately
  showToast('Syncing to GitHub...', 'info', 2000);
  
  try {
    const result = await syncToGitHub(videos, token, repo, DEFAULT_BRANCH, DEFAULT_PATH);
    showToast('Sync successful!', 'success');
  } catch (error) {
    // If network error, queue it
    if (error.message.includes('Network') || error.message.includes('fetch')) {
      const queued = enqueue({
        type: 'sync',
        videos: videos,
        token: token,
        repo: repo,
        branch: DEFAULT_BRANCH,
        path: DEFAULT_PATH
      });
      
      if (queued) {
        showToast('Network error: Sync queued for retry', 'warning', 5000);
      }
    } else {
      showToast(`Sync failed: ${error.message}`, 'error');
    }
  }
}

// ==================== Event Listeners ====================

function initEventListeners() {
  // Add video
  if (elements.addVideoBtn) {
    elements.addVideoBtn.addEventListener('click', addVideo);
  }
  if (elements.videoUrlInput) {
    elements.videoUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addVideo();
    });
  }
  
  // Search
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', renderVideoGrid);
  }
  
  // Settings modal
  if (elements.settingsTrigger) {
    elements.settingsTrigger.addEventListener('click', openSettingsModal);
  }
  if (elements.settingsClose) {
    elements.settingsClose.addEventListener('click', closeSettingsModal);
  }
  if (elements.settingsCancel) {
    elements.settingsCancel.addEventListener('click', closeSettingsModal);
  }
  if (elements.settingsModal) {
    const overlay = elements.settingsModal.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeSettingsModal);
    }
  }
  if (elements.settingsSave) {
    elements.settingsSave.addEventListener('click', saveSettings);
  }
  if (elements.testConnectionBtn) {
    elements.testConnectionBtn.addEventListener('click', testConnection);
  }
  
  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.settingsModal && 
        elements.settingsModal.classList.contains('active')) {
      closeSettingsModal();
    }
  });
  
  // Sync button (if present)
  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', syncToGithub);
  }
}

// ==================== Initialization ====================

function init() {
  elements = getElements();
  updateConnectionStatus();
  renderVideoGrid();
  initEventListeners();
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}