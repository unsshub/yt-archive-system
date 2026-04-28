// src/__tests__/app-integration.test.js
// Integration tests for app flow

beforeEach(() => {
  global.sessionStorage.clear();
  
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
        <div id="empty-state">No videos saved yet</div>
        <span id="video-count">0</span>
        
        <!-- Settings Modal -->
        <div id="settings-modal" class="modal" role="dialog" aria-hidden="true">
          <div class="modal-overlay"></div>
          <div class="modal-content">
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
        
        <div id="toast-container" aria-live="polite"></div>
      </main>
    </div>
  `;

  jest.resetModules();

  // Create a shared videos array for dynamic mock behavior
  let savedVideos = [];

  // Mock storage with dynamic behavior
  jest.mock('../js/services/storage', () => ({
    saveVideo: jest.fn((videoData) => {
      if (!videoData || !videoData.url || !videoData.title || !videoData.thumbnail) {
        throw new Error('Missing required fields');
      }
      const video = {
        id: 'int12345678',
        url: videoData.url,
        title: videoData.title,
        thumbnail: videoData.thumbnail,
        tags: videoData.tags || [],
        savedAt: new Date().toISOString()
      };
      savedVideos.push(video);
      return video;
    }),
    loadArchive: jest.fn(() => savedVideos),
    searchArchive: jest.fn(() => savedVideos),
    isValidYouTubeUrl: jest.fn(() => true),
    generateId: jest.fn(() => 'int12345678'),
    normalizeText: jest.fn((t) => t ? t.toLowerCase().trim() : '')
  }));

  // Mock YouTube API
  jest.mock('../js/services/youtube-api', () => ({
    fetchVideoMetadata: jest.fn(() => Promise.resolve({
      title: 'Integration Test Video',
      thumbnail: 'https://img.youtube.com/vi/test123/hqdefault.jpg'
    })),
    isValidYouTubeUrl: jest.fn(() => true),
    extractVideoId: jest.fn(() => 'test12345678')
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

describe('App Integration Flow', () => {
  describe('URL Paste → Metadata → Save Flow', () => {
    test('fetches metadata and saves video on add button click', async () => {
      const { saveVideo } = require('../js/services/storage');
      const { fetchVideoMetadata } = require('../js/services/youtube-api');

      require('../js/app');

      const urlInput = document.getElementById('video-url-input');
      const addBtn = document.getElementById('add-video-btn');
      
      urlInput.value = 'https://www.youtube.com/watch?v=test12345678';
      addBtn.click();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(fetchVideoMetadata).toHaveBeenCalledWith('https://www.youtube.com/watch?v=test12345678');
      expect(saveVideo).toHaveBeenCalled();
    });

    test('shows loading state during metadata fetch', () => {
      require('../js/app');

      const addBtn = document.getElementById('add-video-btn');
      const urlInput = document.getElementById('video-url-input');
      
      urlInput.value = 'https://www.youtube.com/watch?v=test12345678';
      addBtn.click();

      expect(addBtn.disabled).toBe(true);
      expect(addBtn.textContent).toMatch(/loading/i);
    });

    test('shows error toast on metadata fetch failure', async () => {
      const { fetchVideoMetadata } = require('../js/services/youtube-api');
      fetchVideoMetadata.mockRejectedValueOnce(new Error('Network Error'));

      require('../js/app');

      const urlInput = document.getElementById('video-url-input');
      const addBtn = document.getElementById('add-video-btn');
      
      urlInput.value = 'https://www.youtube.com/watch?v=test12345678';
      addBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const toast = document.querySelector('.toast-error');
      expect(toast).toBeTruthy();
    });

    test('re-renders grid after successful save', async () => {
      require('../js/app');

      const urlInput = document.getElementById('video-url-input');
      const addBtn = document.getElementById('add-video-btn');
      
      // Save a video
      urlInput.value = 'https://www.youtube.com/watch?v=test12345678';
      addBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Grid should now have children since saveVideo pushes to the array
      // and renderVideoGrid calls loadArchive which returns the updated array
      const grid = document.getElementById('video-grid');
      expect(grid.children.length).toBeGreaterThan(0);
    });

    test('clears URL input after successful save', async () => {
      require('../js/app');

      const urlInput = document.getElementById('video-url-input');
      const addBtn = document.getElementById('add-video-btn');
      
      urlInput.value = 'https://www.youtube.com/watch?v=test12345678';
      addBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(urlInput.value).toBe('');
    });
  });

  describe('Bilingual Search Integration', () => {
    test('filters results when typing in search input', () => {
      const { searchArchive } = require('../js/services/storage');
      
      // Pre-populate with some videos by calling saveVideo
      const { saveVideo } = require('../js/services/storage');
      saveVideo({
        url: 'https://youtube.com/watch?v=test123',
        title: 'Test Video',
        thumbnail: 'https://img.youtube.com/vi/test/hqdefault.jpg'
      });
      saveVideo({
        url: 'https://youtube.com/watch?v=test456',
        title: 'Arabic Video',
        thumbnail: 'https://img.youtube.com/vi/test2/hqdefault.jpg'
      });
      
      // Make searchArchive return filtered results
      searchArchive.mockImplementation((query) => {
        const { loadArchive } = require('../js/services/storage');
        const videos = loadArchive();
        if (!query || query.trim() === '') return videos;
        return videos.filter(v => v.title.toLowerCase().includes(query.toLowerCase()));
      });

      require('../js/app');

      const searchInput = document.getElementById('search-input');
      searchInput.value = 'test';
      searchInput.dispatchEvent(new Event('input'));

      expect(searchArchive).toHaveBeenCalledWith('test');
    });
  });
});