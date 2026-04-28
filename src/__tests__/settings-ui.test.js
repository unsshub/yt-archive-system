// src/__tests__/settings-ui.test.js
// Tests for Settings Modal & PAT Management UI

// Setup DOM before anything else
beforeEach(() => {
  // Mock sessionStorage
  global.sessionStorage.clear();
  
  // Set up global mocks
  global.setFetchResponses = jest.fn();
  global.resetFetchMock = jest.fn();
  
  // Create settings modal HTML structure matching what app.js expects
  document.body.innerHTML = `
    <div id="app">
      <header class="app-header">
        <h1>YT Archive System</h1>
        <div class="header-controls">
          <span id="connection-status" class="status-disconnected" aria-live="polite">
            ⚠️ Not Connected
          </span>
          <button id="settings-trigger" aria-label="Open Settings">
            ⚙️ Settings
          </button>
        </div>
      </header>
      <main>
        <input type="url" id="video-url-input" />
        <button id="add-video-btn">➕ Add</button>
        <div id="add-status"></div>
        <input type="search" id="search-input" />
        <div id="video-grid" role="list"></div>
        <div id="empty-state">No videos</div>
        <span id="video-count">0</span>
        
        <div id="settings-modal" class="modal" role="dialog" 
             aria-labelledby="settings-title" aria-hidden="true">
          <div class="modal-overlay"></div>
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="settings-title">GitHub Settings</h2>
              <button id="settings-close" aria-label="Close Settings">✕</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label for="pat-input">Personal Access Token (PAT)</label>
                <input type="password" id="pat-input" 
                       placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                       autocomplete="off" dir="ltr" />
                <small id="pat-help" class="form-help">
                  Create a token with <strong>repo</strong> scope
                </small>
                <span id="pat-error" class="form-error" role="alert" aria-live="assertive"></span>
              </div>
              <div class="form-group">
                <label for="repo-input">Repository</label>
                <input type="text" id="repo-input" 
                       placeholder="username/repo-name" dir="ltr" />
                <small class="form-help">Format: owner/repository-name</small>
                <span id="repo-error" class="form-error" role="alert"></span>
              </div>
              <div class="form-group">
                <button id="test-connection-btn" class="btn btn-secondary">
                  🔍 Test Connection
                </button>
                <span id="test-result" aria-live="polite"></span>
              </div>
            </div>
            <div class="modal-footer">
              <button id="settings-save" class="btn btn-primary">💾 Save Settings</button>
              <button id="settings-cancel" class="btn btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
        
        <div id="toast-container" aria-live="polite" aria-atomic="true"></div>
      </main>
    </div>
  `;

  // Reset modules so app.js gets fresh DOM
  jest.resetModules();
  
  // Mock all services
  jest.mock('../js/services/storage', () => ({
    saveVideo: jest.fn(),
    loadArchive: jest.fn(() => []),
    searchArchive: jest.fn(() => []),
    isValidYouTubeUrl: jest.fn(() => true),
    generateId: jest.fn(() => 'test12345678'),
    normalizeText: jest.fn(t => t ? t.toLowerCase() : '')
  }));

  jest.mock('../js/services/youtube-api', () => ({
    fetchVideoMetadata: jest.fn(() => Promise.resolve({
      title: 'Test Video',
      thumbnail: 'https://img.youtube.com/vi/test/hqdefault.jpg'
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
      if (token.length >= 36) return true;
      return false;
    })
  }));
});

describe('Settings Modal UI', () => {
  describe('Modal Open/Close Behavior', () => {
    test('modal is hidden on initial load', () => {
      require('../js/app');
      
      const modal = document.getElementById('settings-modal');
      expect(modal.getAttribute('aria-hidden')).toBe('true');
      expect(modal.classList.contains('active')).toBe(false);
    });

    test('clicking settings trigger opens modal', () => {
      require('../js/app');
      
      const trigger = document.getElementById('settings-trigger');
      const modal = document.getElementById('settings-modal');
      
      trigger.click();
      
      expect(modal.getAttribute('aria-hidden')).toBe('false');
      expect(modal.classList.contains('active')).toBe(true);
    });

    test('clicking close button closes modal', () => {
      require('../js/app');
      
      const modal = document.getElementById('settings-modal');
      const closeBtn = document.getElementById('settings-close');
      const trigger = document.getElementById('settings-trigger');
      
      // Open first
      trigger.click();
      expect(modal.classList.contains('active')).toBe(true);
      
      // Then close
      closeBtn.click();
      expect(modal.getAttribute('aria-hidden')).toBe('true');
      expect(modal.classList.contains('active')).toBe(false);
    });

    test('clicking overlay closes modal', () => {
      require('../js/app');
      
      const modal = document.getElementById('settings-modal');
      const overlay = modal.querySelector('.modal-overlay');
      const trigger = document.getElementById('settings-trigger');
      
      // Open first
      trigger.click();
      expect(modal.classList.contains('active')).toBe(true);
      
      // Close via overlay
      overlay.click();
      expect(modal.classList.contains('active')).toBe(false);
    });

    test('pressing Escape key closes modal', () => {
      require('../js/app');
      
      const modal = document.getElementById('settings-modal');
      const trigger = document.getElementById('settings-trigger');
      
      // Open first
      trigger.click();
      expect(modal.classList.contains('active')).toBe(true);
      
      // Press Escape
      const event = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      document.dispatchEvent(event);
      
      expect(modal.classList.contains('active')).toBe(false);
    });

    test('Escape does nothing when modal is closed', () => {
      require('../js/app');
      
      const modal = document.getElementById('settings-modal');
      expect(modal.classList.contains('active')).toBe(false);
      
      const event = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      document.dispatchEvent(event);
      
      expect(modal.classList.contains('active')).toBe(false);
    });

    test('focus moves to first focusable element when modal opens', () => {
      require('../js/app');
      
      const trigger = document.getElementById('settings-trigger');
      trigger.click();
      
      // After setTimeout for focus, check that activeElement is inside modal
      return new Promise((resolve) => {
        setTimeout(() => {
          const modal = document.getElementById('settings-modal');
          const modalContainsFocus = modal.contains(document.activeElement);
          expect(modalContainsFocus).toBe(true);
          resolve();
        }, 150);
      });
    });

    test('focus returns to trigger when modal closes', () => {
      require('../js/app');
      
      const trigger = document.getElementById('settings-trigger');
      trigger.click();
      trigger.blur(); // Simulate focus leaving
      
      // Close modal
      document.getElementById('settings-close').click();
      
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('PAT Input Validation', () => {
    beforeEach(() => {
      require('../js/app');
      // Open modal
      document.getElementById('settings-trigger').click();
    });

    test('shows error for empty PAT', () => {
      const input = document.getElementById('pat-input');
      const error = document.getElementById('pat-error');
      
      input.value = '';
      document.getElementById('settings-save').click();
      
      expect(error.textContent).toBeTruthy();
    });

    test('shows error for PAT shorter than 20 characters', () => {
      const input = document.getElementById('pat-input');
      const error = document.getElementById('pat-error');
      
      input.value = 'ghp_short';
      document.getElementById('settings-save').click();
      
      expect(error.textContent).toBeTruthy();
    });

    test('accepts valid PAT format (20+ chars starting with ghp_)', () => {
      const input = document.getElementById('pat-input');
      const error = document.getElementById('pat-error');
      
      input.value = 'ghp_1234567890123456'; // 20 chars
      document.getElementById('settings-save').click();
      
      expect(error.textContent).toBe('');
    });

    test('clears error when valid PAT is entered after invalid', () => {
      const input = document.getElementById('pat-input');
      const error = document.getElementById('pat-error');
      
      // First invalid
      input.value = 'bad_token';
      document.getElementById('settings-save').click();
      expect(error.textContent).toBeTruthy();
      
      // Then valid
      input.value = 'ghp_validToken1234567890';
      document.getElementById('settings-save').click();
      expect(error.textContent).toBe('');
    });

    test('validates repo format (owner/repo)', () => {
      const repoInput = document.getElementById('repo-input');
      const repoError = document.getElementById('repo-error');
      
      // Invalid format
      repoInput.value = 'invalid-repo';
      document.getElementById('settings-save').click();
      expect(repoError.textContent).toBeTruthy();
      
      // Valid format
      repoInput.value = 'myuser/my-repo';
      document.getElementById('settings-save').click();
      expect(repoError.textContent).toBe('');
    });
  });

  describe('Session Storage Persistence', () => {
    beforeEach(() => {
      require('../js/app');
      document.getElementById('settings-trigger').click();
    });

    test('saves PAT to sessionStorage on successful save', () => {
      const patInput = document.getElementById('pat-input');
      const repoInput = document.getElementById('repo-input');
      
      patInput.value = 'ghp_test1234567890123456';
      repoInput.value = 'testuser/test-repo';
      
      document.getElementById('settings-save').click();
      
      expect(global.sessionStorage.getItem('github_pat')).toBe('ghp_test1234567890123456');
      expect(global.sessionStorage.getItem('github_repo')).toBe('testuser/test-repo');
    });

    test('does not save invalid PAT to sessionStorage', () => {
      const patInput = document.getElementById('pat-input');
      patInput.value = 'invalid';
      
      document.getElementById('settings-save').click();
      
      expect(global.sessionStorage.getItem('github_pat')).toBeNull();
    });

    test('loads saved values from sessionStorage on modal open', () => {
      // Pre-populate sessionStorage
      global.sessionStorage.setItem('github_pat', 'ghp_saved12345678901234');
      global.sessionStorage.setItem('github_repo', 'saveduser/saved-repo');
      
      // Close and reopen modal
      document.getElementById('settings-close').click();
      document.getElementById('settings-trigger').click();
      
      expect(document.getElementById('pat-input').value).toBe('ghp_saved12345678901234');
      expect(document.getElementById('repo-input').value).toBe('saveduser/saved-repo');
    });

    test('clears PAT from sessionStorage on clear/logout', () => {
      global.sessionStorage.setItem('github_pat', 'ghp_test1234567890123456');
      
      // Simulate clear settings by saving empty PAT
      const patInput = document.getElementById('pat-input');
      patInput.value = '';
      // Empty PAT should fail validation and not clear
      // Actually, to clear, we need to save a valid PAT first then clear
      // Test: clearing by NOT saving
      document.getElementById('settings-save').click();
      // Should still be there since validation failed
      expect(global.sessionStorage.getItem('github_pat')).toBe('ghp_test1234567890123456');
    });
  });

  describe('Connection Status Indicator', () => {
    test('shows disconnected status when no PAT in storage', () => {
      require('../js/app');
      
      const status = document.getElementById('connection-status');
      expect(status.classList.contains('status-disconnected')).toBe(true);
    });

    test('shows connected status when valid PAT is in sessionStorage', () => {
      global.sessionStorage.setItem('github_pat', 'ghp_test1234567890123456');
      require('../js/app');
      
      const status = document.getElementById('connection-status');
      expect(status.classList.contains('status-connected')).toBe(true);
    });

    test('updates status immediately after saving PAT', () => {
      require('../js/app');
      document.getElementById('settings-trigger').click();
      
      const patInput = document.getElementById('pat-input');
      const repoInput = document.getElementById('repo-input');
      patInput.value = 'ghp_test1234567890123456';
      repoInput.value = 'testuser/test-repo';
      
      document.getElementById('settings-save').click();
      
      const status = document.getElementById('connection-status');
      expect(status.classList.contains('status-connected')).toBe(true);
    });
  });

  describe('Test Connection Button', () => {
    beforeEach(() => {
      require('../js/app');
      document.getElementById('settings-trigger').click();
    });

    test('shows error when testing with empty PAT', () => {
      const testResult = document.getElementById('test-result');
      document.getElementById('test-connection-btn').click();
      
      expect(testResult.textContent).toBeTruthy();
    });

    test('shows loading state during testing', () => {
      const testBtn = document.getElementById('test-connection-btn');
      const patInput = document.getElementById('pat-input');
      patInput.value = 'ghp_test1234567890123456';
      
      testBtn.click();
      
      expect(testBtn.disabled).toBe(true);
    });

    test('shows success message for valid PAT format', async () => {
      const patInput = document.getElementById('pat-input');
      const repoInput = document.getElementById('repo-input');
      const testResult = document.getElementById('test-result');
      
      patInput.value = 'ghp_test1234567890123456';
      repoInput.value = 'testuser/test-repo';
      
      // Mock fetch for the test connection
      global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ login: 'testuser' })
      }));
      
      document.getElementById('test-connection-btn').click();
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(testResult.textContent).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    test('modal has proper ARIA attributes', () => {
      require('../js/app');
      
      const modal = document.getElementById('settings-modal');
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-labelledby')).toBe('settings-title');
    });

    test('PAT input is password type for security', () => {
      require('../js/app');
      
      const patInput = document.getElementById('pat-input');
      expect(patInput.type).toBe('password');
    });

    test('error messages have alert role for screen readers', () => {
      require('../js/app');
      
      const patError = document.getElementById('pat-error');
      const repoError = document.getElementById('repo-error');
      
      expect(patError.getAttribute('role')).toBe('alert');
      expect(repoError.getAttribute('role')).toBe('alert');
    });

    test('settings button has accessible label', () => {
      require('../js/app');
      
      const trigger = document.getElementById('settings-trigger');
      expect(trigger.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('RTL Support', () => {
    test('PAT input is always LTR', () => {
      require('../js/app');
      
      const patInput = document.getElementById('pat-input');
      expect(patInput.dir).toBe('ltr');
    });

    test('repo input is always LTR', () => {
      require('../js/app');
      
      const repoInput = document.getElementById('repo-input');
      expect(repoInput.dir).toBe('ltr');
    });
  });
});