// src/__tests__/github-sync-real.test.js
// Integration tests for GitHub Sync with real API response simulation

const { 
  syncToGitHub, 
  fetchArchive, 
  buildCommitPayload,
  getErrorMessage
} = require('../js/services/github-sync');

describe('GitHub Sync Real API Integration', () => {
  const mockToken = 'ghp_test12345678901234567890';
  const mockRepo = 'testuser/test-repo';
  const mockBranch = 'main';
  const mockPath = 'data/videos.json';

  const mockVideo = {
    id: 'abc12345678',
    url: 'https://www.youtube.com/watch?v=abc12345678',
    title: 'Test Video',
    thumbnail: 'https://img.youtube.com/vi/abc12345678/hqdefault.jpg',
    tags: ['test'],
    savedAt: new Date().toISOString()
  };

  const mockVideos = [mockVideo];

  const successResponse = {
    content: { sha: 'successSha' },
    commit: { sha: 'commitSha' }
  };

  beforeEach(() => {
    global.resetFetchMock();
  });

  describe('buildCommitPayload', () => {
    test('encodes videos.json content as base64 with proper structure', () => {
      const payload = buildCommitPayload([mockVideo]);
      expect(payload.message).toMatch(/Auto-sync: \d+ video\(s\)/);
      expect(payload.content).toBeDefined();
      // Verify base64 decoding works
      const decoded = Buffer.from(payload.content, 'base64').toString();
      const parsed = JSON.parse(decoded);
      expect(parsed).toEqual([mockVideo]);
    });

    test('includes current SHA for update operations', () => {
      const sha = 'existingSha123';
      const payload = buildCommitPayload([mockVideo], sha);
      expect(payload.sha).toBe(sha);
    });
  });

  describe('syncToGitHub - Success Flow', () => {
    test('calls GitHub API with correct headers and payload', async () => {
      // Setup: File doesn't exist (404), then successful creation (201)
      global.setFetchResponses([
        { status: 404, ok: false }, // GET: file doesn't exist
        { 
          status: 201, 
          ok: true, 
          data: { content: { sha: 'new-sha' }, commit: { sha: 'commit-sha' } }
        }
      ]);

      const result = await syncToGitHub(mockVideos, mockToken, mockRepo, mockBranch, mockPath);
      
      expect(result).toHaveProperty('content');
      expect(result.content.sha).toBeDefined();
      
      // Verify correct API calls were made
      const calls = global.fetch.mock.calls;
      expect(calls.length).toBe(2);
      
      // First call: GET for existing SHA
      expect(calls[0][1].method).toBe('GET');
      expect(calls[0][1].headers.Authorization).toBe(`token ${mockToken}`);
      
      // Second call: PUT to create file
      expect(calls[1][1].method).toBe('PUT');
      expect(calls[1][1].headers['Content-Type']).toBe('application/json');
    });

    test('fetches existing file SHA before update if not provided', async () => {
      const existingSha = 'existing-file-sha';
      
      global.setFetchResponses([
        // Successful GET returns existing SHA
        { status: 200, ok: true, data: { sha: existingSha } },
        // Successful PUT
        { 
          status: 200, 
          ok: true, 
          data: { content: { sha: existingSha }, commit: { sha: 'update-sha' } }
        }
      ]);

      const result = await syncToGitHub(mockVideos, mockToken, mockRepo, mockBranch, mockPath);
      
      expect(result).toBeDefined();
      
      // Check that PUT included the SHA
      const putCall = global.fetch.mock.calls[1];
      const body = JSON.parse(putCall[1].body);
      expect(body.sha).toBe(existingSha);
    });
  });

  describe('syncToGitHub - Error Handling', () => {
    test('retries on 429 rate limit with Retry-After header', async () => {
      // Setup: 429 with Retry-After, then success (GET fails with 404 first)
      global.setFetchResponses([
        // First: GET existing file (404 - file doesn't exist)
        { status: 404, ok: false },
        // Second: PUT returns 429 with Retry-After
        { 
          status: 429, 
          ok: false, 
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '0' }
        },
        // Third: PUT succeeds
        { 
          status: 201, 
          ok: true, 
          data: { content: { sha: 'successSha' } }
        }
      ]);

      const result = await syncToGitHub(mockVideos, mockToken, mockRepo, mockBranch, mockPath);
      
      // Verify fetch was called: GET (1) + first PUT (1) + successful PUT (1) = 3
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result.content.sha).toBe('successSha');
    });

    test('retries on 5xx server errors with exponential backoff', async () => {
      // Setup: 500, 503, then 201 success
      global.setFetchResponses([
        // GET existing file (404)
        { status: 404, ok: false },
        // First PUT: 500
        { status: 500, ok: false, statusText: 'Internal Server Error' },
        // Second PUT: 503
        { status: 503, ok: false, statusText: 'Service Unavailable' },
        // Third PUT: Success
        { 
          status: 201, 
          ok: true, 
          data: { content: { sha: 'successSha' } }
        }
      ]);

      const result = await syncToGitHub(mockVideos, mockToken, mockRepo, mockBranch, mockPath);
      
      // GET (1) + PUT attempts (3) = 4 calls
      expect(global.fetch).toHaveBeenCalledTimes(4);
      expect(result.content.sha).toBe('successSha');
    });

    test('throws user-friendly error on 401/403 auth failures', async () => {
      // For auth failures, use a valid-format token that will be rejected by API
      global.setFetchResponses([
        { status: 404, ok: false }, // GET fails
        { status: 401, ok: false, statusText: 'Unauthorized' }
      ]);

      await expect(
        syncToGitHub(mockVideos, mockToken, mockRepo, mockBranch, mockPath)
      ).rejects.toThrow('GitHub authentication failed. Please check your PAT.');
    });

    test('throws user-friendly error on 404 repo not found', async () => {
      // 404 from GET is okay, but 404 from PUT means repo doesn't exist
      // Repo 404 usually returns 404 on GET too, but let's simulate it
      global.setFetchResponses([
        { status: 404, ok: false }, // GET fails with 404 (repo not found)
        { status: 404, ok: false, statusText: 'Not Found' } // PUT also fails
      ]);

      await expect(
        syncToGitHub(mockVideos, mockToken, 'user/nonexistent-repo', mockBranch, mockPath)
      ).rejects.toThrow('Repository not found. Please create a private repo first.');
    });

    test('throws error after max retries exhausted', async () => {
      // Setup: All responses fail with 500
      global.setFetchResponses([
        { status: 404, ok: false }, // GET fails
        { status: 500, ok: false, statusText: 'Internal Server Error' },
        { status: 500, ok: false, statusText: 'Internal Server Error' },
        { status: 500, ok: false, statusText: 'Internal Server Error' }
      ]);

      await expect(
        syncToGitHub(mockVideos, mockToken, mockRepo, mockBranch, mockPath)
      ).rejects.toThrow('GitHub API error: 500 Internal Server Error (max retries exceeded)');
    });
  });

  describe('fetchArchive', () => {
    test('fetches and parses videos.json from GitHub', async () => {
      const mockArchive = [{
        id: 'xyz98765432',
        url: 'https://www.youtube.com/watch?v=xyz98765432',
        title: 'Archived Video',
        thumbnail: 'https://img.youtube.com/vi/xyz98765432/hqdefault.jpg',
        tags: ['archived'],
        savedAt: '2024-01-01T00:00:00.000Z'
      }];

      const encodedContent = Buffer.from(JSON.stringify(mockArchive)).toString('base64');
      
      global.setFetchResponses([
        { 
          status: 200, 
          ok: true, 
          data: { content: encodedContent, sha: 'archive-sha' }
        }
      ]);

      const result = await fetchArchive(mockToken, mockRepo, mockBranch, mockPath);
      expect(result).toEqual(mockArchive);
    });

    test('returns empty array if file does not exist (404)', async () => {
      global.setFetchResponses([
        { status: 404, ok: false }
      ]);

      const result = await fetchArchive(mockToken, mockRepo, mockBranch, mockPath);
      expect(result).toEqual([]);
    });

    test('throws error on other HTTP failures', async () => {
      global.setFetchResponses([
        { status: 403, ok: false, statusText: 'Forbidden' }
      ]);

      await expect(
        fetchArchive(mockToken, mockRepo, mockBranch, mockPath)
      ).rejects.toThrow('GitHub API error: 403 Forbidden');
    });
  });
});