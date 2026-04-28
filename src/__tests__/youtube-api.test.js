// Resistant Tests: YouTube oEmbed API Service
// Tests guardrails for metadata fetching, URL validation, and error recovery

/**
 * @jest-environment jsdom
 */
const { fetchVideoMetadata, isValidYouTubeUrl, extractVideoId } = require('../js/services/youtube-api');

describe('YouTube oEmbed API Service', () => {
  const validUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/abc123XYZ'
  ];

  const invalidUrls = [
    'https://example.com/video',
    'https://youtube.com',
    'not-a-url',
    ''
  ];

  describe('isValidYouTubeUrl', () => {
    test('accepts valid YouTube URL formats', () => {
      validUrls.forEach(url => {
        expect(isValidYouTubeUrl(url)).toBe(true);
      });
    });

    test('rejects non-YouTube URLs', () => {
      invalidUrls.forEach(url => {
        expect(isValidYouTubeUrl(url)).toBe(false);
      });
    });

    test('handles URLs with extra query params', () => {
      expect(isValidYouTubeUrl('https://youtube.com/watch?v=abc123&t=30s')).toBe(true);
    });
  });

  describe('extractVideoId', () => {
    test('extracts 11-char ID from watch URLs', () => {
      expect(extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    test('extracts ID from youtu.be short URLs', () => {
      expect(extractVideoId('https://youtu.be/abc123XYZ45')).toBe('abc123XYZ45');
    });

    test('extracts ID from Shorts URLs', () => {
      expect(extractVideoId('https://youtube.com/shorts/xyz789ABC12')).toBe('xyz789ABC12');
    });

    test('returns null for invalid URLs', () => {
      expect(extractVideoId('https://example.com')).toBeNull();
    });
  });

  describe('fetchVideoMetadata', () => {
    const mockEmbedResponse = {
      title: 'Rick Astley - Never Gonna Give You Up',
      thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
      author_name: 'Rick Astley',
      type: 'video'
    };

    beforeEach(() => {
      // Mock global fetch for API calls
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('rejects invalid YouTube URLs', async () => {
      await expect(fetchVideoMetadata('https://example.com')).rejects.toThrow('Invalid YouTube URL');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('calls oEmbed endpoint with encoded URL', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEmbedResponse)
      });

      const url = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
      await fetchVideoMetadata(url);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );
    });

    test('returns normalized metadata object on success', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEmbedResponse)
      });

      const result = await fetchVideoMetadata('https://youtu.be/dQw4w9WgXcQ');

      expect(result).toEqual({
        title: 'Rick Astley - Never Gonna Give You Up',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
        author: 'Rick Astley',
        type: 'video'
      });
    });

    test('handles API errors gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(fetchVideoMetadata('https://youtube.com/watch?v=invalid123'))
        .rejects.toThrow('YouTube API error: 404 Not Found');
    });

    test('handles network failures', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetchVideoMetadata('https://youtube.com/watch?v=dQw4w9WgXcQ'))
        .rejects.toThrow('Network error');
    });

    test('handles rate limit responses', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['Retry-After', '60']])
      });

      await expect(fetchVideoMetadata('https://youtube.com/watch?v=dQw4w9WgXcQ'))
        .rejects.toThrow('Rate limited. Please wait 60 seconds.');
    });
  });
});