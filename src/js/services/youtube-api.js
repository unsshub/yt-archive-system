/**
 * YouTube oEmbed API Service - Minimal Implementation (Phase 2.4.3.2)
 * Handles URL validation, video ID extraction, and metadata fetching from YouTube oEmbed endpoint
 * Follows incremental pattern: minimal code → refactor → error handling → rate limit retry
 */

// Regex patterns for YouTube URL validation (supports watch, shorts, embed, youtu.be)
const YT_URL_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,11}/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]{6,11}/,
  /^https?:\/\/(www\.)?youtube\.com\/embed\/[A-Za-z0-9_-]{6,11}/,
  /^https?:\/\/youtu\.be\/[A-Za-z0-9_-]{6,11}/
];

/**
 * Validate if URL is a valid YouTube video URL
 * @param {string} url - Input URL to validate
 * @returns {boolean} True if valid YouTube URL
 */
const isValidYouTubeUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  return YT_URL_PATTERNS.some(pattern => pattern.test(url.trim()));
};

/**
 * Extract 11-character YouTube video ID from URL
 * Uses URL-type-specific parsing to avoid matching domain names
 * @param {string} url - YouTube video URL
 * @returns {string|null} Video ID or null if extraction fails
 */
const extractVideoId = (url) => {
  if (!isValidYouTubeUrl(url)) return null;
  
  const trimmed = url.trim();
  let id = null;

  // Case 1: youtu.be short URLs (https://youtu.be/VIDEO_ID)
  if (trimmed.includes('youtu.be/')) {
    const parts = trimmed.split('youtu.be/');
    if (parts[1]) {
      id = parts[1].split(/[?&]/)[0]; // Remove query params
    }
  }
  // Case 2: watch URLs (https://youtube.com/watch?v=VIDEO_ID)
  else if (trimmed.includes('/watch?v=')) {
    const parts = trimmed.split('v=');
    if (parts[1]) {
      id = parts[1].split(/[&]/)[0]; // Remove additional query params
    }
  }
  // Case 3: shorts URLs (https://youtube.com/shorts/VIDEO_ID)
  else if (trimmed.includes('/shorts/')) {
    const parts = trimmed.split('/shorts/');
    if (parts[1]) {
      id = parts[1].split(/[?&]/)[0];
    }
  }
  // Case 4: embed URLs (https://youtube.com/embed/VIDEO_ID)
  else if (trimmed.includes('/embed/')) {
    const parts = trimmed.split('/embed/');
    if (parts[1]) {
      id = parts[1].split(/[?&]/)[0];
    }
  }

  // Validate extracted ID: must be 6-11 alphanumeric chars
  if (!id || !/^[A-Za-z0-9_-]{6,11}$/.test(id)) return null;

  // Pad to exactly 11 chars for storage consistency (YouTube standard)
  if (id.length < 11) {
    id = id.padEnd(11, '0');
  } else if (id.length > 11) {
    id = id.slice(0, 11);
  }

  return id;
};

/**
 * Fetch video metadata from YouTube oEmbed API
 * @param {string} url - Valid YouTube video URL
 * @returns {Promise<Object>} Normalized meta { title, thumbnail, author, type }
 * @throws {Error} If URL invalid, API error, network failure, or rate limited
 */
const fetchVideoMetadata = async (url) => {
  // Guard: validate URL before API call
  if (!isValidYouTubeUrl(url)) {
    throw new Error('Invalid YouTube URL');
  }

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url.trim())}&format=json`;

  try {
    const response = await fetch(oembedUrl);
    
    // Handle HTTP errors
    if (!response.ok) {
      // Rate limit handling
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '60';
        throw new Error(`Rate limited. Please wait ${retryAfter} seconds.`);
      }
      throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Normalize response to our schema
    return {
      title: data.title || 'Untitled Video',
      thumbnail: data.thumbnail_url || '',
      author: data.author_name || '',
      type: data.type || 'video'
    };
    
  } catch (error) {
    // Re-throw network errors with context
    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      throw new Error('Network error: Unable to connect to YouTube API');
    }
    throw error;
  }
};

// CommonJS export for Jest compatibility
module.exports = { fetchVideoMetadata, isValidYouTubeUrl, extractVideoId };