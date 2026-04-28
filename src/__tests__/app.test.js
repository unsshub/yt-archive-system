// src/__tests__/app.test.js
// Tests for App Logic

// Setup DOM before requiring app
beforeEach(() => {
  // Mock sessionStorage
  global.sessionStorage.clear();
  
  // Create minimal mock DOM for app tests
  document.body.innerHTML = `
    <div id="app">
      <header class="app-header">
        <h1>YT Archive System</h1>
        <div class="header-controls">
          <span id="connection-status" class="status-disconnected" aria-live="polite"></span>
          <button id="settings-trigger" aria-label="Open Settings">⚙️</button>
        </div>
      </header>
      <main>
        <input type="url" id="video-url-input" />
        <button id="add-video-btn">➕ Add</button>
        <div id="add-status" aria-live="polite"></div>
        <input type="search" id="search-input" />
        <div id="video-grid" role="list"></div>
        <div id="empty-state"></div>
        <span id="video-count"></span>
        <button id="sync-btn">🔄 Sync</button>
        
        <!-- Settings Modal -->
        <div id="settings-modal" class="modal" role="dialog" aria-hidden="true">
          <div class="modal-overlay"></div>
          <div class="modal-content">
            <h2 id="settings-title">Settings</h2>
            <button id="settings-close">✕</button>
            <input type="password" id="pat-input" />
            <input type="text" id="repo-input" />
            <button id="test-connection-btn">Test</button>
            <span id="test-result"></span>
            <span id="pat-error" role="alert"></span>
            <span id="repo-error" role="alert"></span>
            <button id="settings-save">Save</button>
            <button id="settings-cancel">Cancel</button>
          </div>
        </div>
        
        <!-- Toast Container -->
        <div id="toast-container" aria-live="polite"></div>
      </main>
    </div>
  `;

  // Clear modules cache to reload app with new DOM
  jest.resetModules();
  
  // Setup mocks for services
  jest.mock('../js/services/storage', () => ({
    saveVideo: jest.fn(() => ({
      id: 'test12345678',
      url: 'https://youtube.com/watch?v=test12345678',
      title: 'Test Video',
      thumbnail: 'https://img.youtube.com/vi/test/hqdefault.jpg',
      tags: [],
      savedAt: new Date().toISOString()
    })),
    loadArchive: jest.fn(() => []),
    searchArchive: jest.fn(() => [])
  }));

  jest.mock('../js/services/youtube-api', () => ({
    fetchVideoMetadata: jest.fn(() => Promise.resolve({
      title: 'Test Video',
      thumbnail: 'https://img.youtube.com/vi/test/hqdefault.jpg'
    })),
    isValidYouTubeUrl: jest.fn(() => true)
  }));

  jest.mock('../js/services/github-sync', () => ({
    syncToGitHub: jest.fn(() => Promise.resolve({})),
    fetchArchive: jest.fn(() => Promise.resolve([])),
    validateToken: jest.fn((token) => {
      if (!token || typeof token !== 'string') return false;
      if (token.startsWith('ghp_') && token.length >= 20) return true;
      return false;
    })
  }));
});

describe('App Logic', () => {
  describe('Initialization', () => {
    test('renders video grid on load', () => {
      const { loadArchive } = require('../js/services/storage');
      loadArchive.mockReturnValue([
        {
          id: 'test123',
          url: 'https://youtube.com/watch?v=test123',
          title: 'Test Video',
          thumbnail: 'https://img.youtube.com/vi/test/hqdefault.jpg',
          savedAt: new Date().toISOString()
        }
      ]);

      // Reload app with mock data
      require('../js/app');
      
      const grid = document.getElementById('video-grid');
      expect(grid).toBeDefined();
      expect(grid.children.length).toBeGreaterThan(0);
    });

    test('handles empty archive gracefully', () => {
      const { loadArchive } = require('../js/services/storage');
      loadArchive.mockReturnValue([]);

      require('../js/app');
      
      const emptyState = document.getElementById('empty-state');
      expect(emptyState.style.display).not.toBe('none');
    });
  });

  describe('Search Functionality', () => {
    test('filters grid on input', () => {
      const { loadArchive, searchArchive } = require('../js/services/storage');
      loadArchive.mockReturnValue([
        {
          id: 'test123',
          url: 'https://youtube.com/watch?v=test123',
          title: 'Test Video',
          thumbnail: 'https://img.youtube.com/vi/test/hqdefault.jpg',
          savedAt: new Date().toISOString()
        }
      ]);
      searchArchive.mockReturnValue([]);

      require('../js/app');
      
      const searchInput = document.getElementById('search-input');
      searchInput.value = 'nonexistent';
      searchInput.dispatchEvent(new Event('input'));
      
      expect(searchArchive).toHaveBeenCalledWith('nonexistent');
    });
  });

  describe('GitHub Sync', () => {
    test('calls sync service when button clicked', () => {
      const { syncToGitHub } = require('../js/services/github-sync');
      global.sessionStorage.setItem('github_pat', 'ghp_test1234567890123456');
      global.sessionStorage.setItem('github_repo', 'user/repo');
      
      require('../js/app');
      
      const syncBtn = document.getElementById('sync-btn');
      syncBtn.click();
      
      expect(syncToGitHub).toHaveBeenCalled();
    });

    test('shows alert when PAT is missing', () => {
      require('../js/app');
      
      const syncBtn = document.getElementById('sync-btn');
      syncBtn.click();
      
      // Should not call sync without PAT
      const { syncToGitHub } = require('../js/services/github-sync');
      expect(syncToGitHub).not.toHaveBeenCalled();
    });
  });
});