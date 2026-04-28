// src/__tests__/storage.test.js
// Tests for Local Storage Persistence

const { saveVideo, loadArchive, searchArchive } = require('../js/services/storage');

describe('Local Storage Persistence', () => {
  const validVideo = {
    url: 'https://www.youtube.com/watch?v=abc12345678',
    title: 'Test Video',
    thumbnail: 'https://img.youtube.com/vi/abc12345678/hqdefault.jpg',
    tags: ['test', 'tutorial']
  };

  const arabicVideo = {
    url: 'https://www.youtube.com/watch?v=xyz98765432',
    title: 'درس تعليمي',
    thumbnail: 'https://img.youtube.com/vi/xyz98765432/hqdefault.jpg',
    tags: ['تعليم', 'عربي']
  };

  beforeEach(() => {
    // localStorage is already mocked by global-setup
    global.localStorage.clear();
  });

  describe('saveVideo', () => {
    test('rejects videos missing required fields', () => {
      expect(() => saveVideo({ url: 'https://youtube.com/watch?v=test' }))
        .toThrow();
      expect(() => saveVideo({ title: 'No URL' }))
        .toThrow();
    });

    test('rejects invalid YouTube URLs', () => {
      expect(() => saveVideo({
        url: 'https://not-youtube.com/video',
        title: 'Test',
        thumbnail: 'https://img.youtube.com/vi/test/hqdefault.jpg'
      })).toThrow();
    });

    test('stores valid video with auto-generated ID', () => {
      const saved = saveVideo(validVideo);
      expect(saved.id).toBeDefined();
      expect(saved.id).toHaveLength(11);
      expect(saved.url).toBe(validVideo.url);
      expect(saved.savedAt).toBeDefined();
      
      // Verify it's in localStorage
      const stored = JSON.parse(global.localStorage.getItem('videos'));
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(saved.id);
    });
  });

  describe('loadArchive', () => {
    test('returns empty array when no videos saved', () => {
      const archive = loadArchive();
      expect(archive).toEqual([]);
    });

    test('returns all saved videos in reverse chronological order', () => {
      // Save videos with different timestamps
      const video1 = saveVideo({ ...validVideo, url: 'https://www.youtube.com/watch?v=11111111111' });
      
      // Wait a tiny bit to ensure different timestamps
      const video2 = saveVideo({ ...validVideo, url: 'https://www.youtube.com/watch?v=22222222222' });
      
      const archive = loadArchive();
      expect(archive).toHaveLength(2);
      // Most recent first
      expect(archive[0].id).toBe(video2.id);
      expect(archive[1].id).toBe(video1.id);
    });
  });

  describe('searchArchive', () => {
    beforeEach(() => {
      global.localStorage.clear();
      saveVideo(validVideo);
      saveVideo(arabicVideo);
    });

    test('finds Arabic titles ignoring diacritics', () => {
      const results = searchArchive('درس');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBeDefined();
    });

    test('finds English titles case-insensitively', () => {
      const results = searchArchive('test');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Video');
      
      const resultsUpper = searchArchive('TEST');
      expect(resultsUpper).toHaveLength(1);
    });

    test('searches across title and tags fields', () => {
      const results = searchArchive('tutorial');
      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('tutorial');
    });

    test('returns full archive on empty/null query', () => {
      expect(searchArchive('')).toHaveLength(2);
      expect(searchArchive(null)).toHaveLength(2);
      expect(searchArchive(undefined)).toHaveLength(2);
    });
  });
});