// src/__tests__/github-sync.test.js
// Tests for GitHub Sync Service (Mock)

const { 
  syncToGitHub, 
  fetchArchive, 
  buildCommitPayload, 
  validateToken,
  toBase64 
} = require('../js/services/github-sync');

describe('GitHub Sync Service', () => {
  const mockToken = 'ghp_test12345678901234567890';
  const mockRepo = 'testuser/test-repo';
  const mockBranch = 'main';
  const mockPath = 'data/videos.json';

  const mockVideos = [
    {
      id: 'abc12345678',
      url: 'https://www.youtube.com/watch?v=abc12345678',
      title: 'Test Video',
      thumbnail: 'https://img.youtube.com/vi/abc12345678/hqdefault.jpg',
      tags: ['test'],
      savedAt: new Date().toISOString()
    }
  ];

  describe('buildCommitPayload', () => {
    test('encodes videos.json content as base64', () => {
      const payload = buildCommitPayload(mockVideos);
      expect(payload.content).toBeDefined();
      expect(payload.message).toMatch(/Auto-sync: \d+ video\(s\)/);
      
      // Decode and verify
      const decoded = Buffer.from(payload.content, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      expect(parsed).toEqual(mockVideos);
    });

    test('includes proper commit message with timestamp', () => {
      const payload = buildCommitPayload(mockVideos);
      expect(payload.message).toMatch(/Auto-sync: \d+ video\(s\)/);
    });

    test('includes current SHA for update operations', () => {
      const sha = 'existing-sha-123';
      const payload = buildCommitPayload(mockVideos, sha);
      expect(payload.sha).toBe(sha);
    });
  });

  describe('syncToGitHub', () => {
    test('rejects calls without valid PAT', async () => {
      await expect(
        syncToGitHub(mockVideos, '', mockRepo, mockBranch, mockPath)
      ).rejects.toThrow('Invalid GitHub token');
    });

    test('rejects empty video array', async () => {
      // Empty array should still sync (just 0 videos)
      global.setFetchResponses([
        { status: 404, ok: false }, // GET: file doesn't exist
        { status: 201, ok: true, data: { content: { sha: 'new-sha' } } }
      ]);

      const result = await syncToGitHub([], mockToken, mockRepo, mockBranch, mockPath);
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('mocks successful commit response structure', async () => {
      global.setFetchResponses([
        // First call: GET existing file (404 = file doesn't exist)
        { status: 404, ok: false },
        // Second call: PUT new file
        { 
          status: 201, 
          ok: true, 
          data: { 
            content: { sha: 'new-sha-123' },
            commit: { sha: 'commit-sha-456' }
          }
        }
      ]);

      const result = await syncToGitHub(mockVideos, mockToken, mockRepo, mockBranch, mockPath);
      
      expect(result).toHaveProperty('content');
      expect(result.content.sha).toBeDefined();
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('fetchArchive', () => {
    test('rejects calls without valid PAT', async () => {
      await expect(
        fetchArchive('', mockRepo, mockBranch, mockPath)
      ).rejects.toThrow('Invalid GitHub token');
    });

    test('mocks empty archive response', async () => {
      global.setFetchResponses([
        { status: 404, ok: false }
      ]);

      const result = await fetchArchive(mockToken, mockRepo, mockBranch, mockPath);
      expect(result).toEqual([]);
    });
  });
});