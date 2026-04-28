// src/js/services/storage.js
// LocalStorage CRUD operations with bilingual search support

const STORAGE_KEY = 'videos';
const VALID_YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;

/**
 * Validates a YouTube URL format
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
function isValidYouTubeUrl(url) {
  return VALID_YOUTUBE_REGEX.test(url);
}

/**
 * Generates a unique 11-character video ID
 * @returns {string} - 11 char ID
 */
function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 11; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Normalizes text for bilingual search (removes Arabic diacritics, lowercases)
 * @param {string} text - Text to normalize
 * @returns {string} - Normalized text
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Saves a video to localStorage archive
 * @param {Object} videoData - Video to save (must have url, title, thumbnail)
 * @returns {Object} - Saved video with generated ID and timestamp
 * @throws {Error} - If required fields are missing or URL is invalid
 */
function saveVideo(videoData) {
  // Validate required fields
  if (!videoData || !videoData.url || !videoData.title || !videoData.thumbnail) {
    throw new Error('Video must have url, title, and thumbnail properties');
  }

  // Validate YouTube URL
  if (!isValidYouTubeUrl(videoData.url)) {
    throw new Error('Invalid YouTube URL');
  }

  // Create video object with metadata
  const video = {
    id: generateId(),
    url: videoData.url,
    title: videoData.title,
    thumbnail: videoData.thumbnail,
    tags: videoData.tags || [],
    savedAt: new Date().toISOString()
  };

  // Load existing archive
  const archive = loadArchive();
  
  // Add new video to the beginning (most recent first)
  archive.unshift(video);
  
  // Save to localStorage
  global.localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));

  return video;
}

/**
 * Loads all saved videos from localStorage
 * @returns {Array} - Array of video objects sorted by newest first
 */
function loadArchive() {
  const data = global.localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  
  try {
    const videos = JSON.parse(data);
    // Videos are stored in reverse chronological order by saveVideo
    // But to be safe, sort by savedAt descending (newest first)
    return videos.sort((a, b) => {
      const dateA = new Date(a.savedAt).getTime();
      const dateB = new Date(b.savedAt).getTime();
      return dateB - dateA; // Descending: newest first
    });
  } catch (error) {
    console.error('Error parsing video archive:', error);
    return [];
  }
}

/**
 * Searches video archive by query (supports English and Arabic)
 * @param {string} query - Search query
 * @returns {Array} - Matching videos
 */
function searchArchive(query) {
  // Return full archive for empty/null/undefined queries
  if (!query || query.trim() === '') {
    return loadArchive();
  }

  const normalizedQuery = normalizeText(query);
  const archive = loadArchive();

  return archive.filter(video => {
    // Search in title
    if (normalizeText(video.title).includes(normalizedQuery)) {
      return true;
    }
    
    // Search in tags
    if (video.tags && video.tags.some(tag => normalizeText(tag).includes(normalizedQuery))) {
      return true;
    }
    
    return false;
  });
}

module.exports = {
  saveVideo,
  loadArchive,
  searchArchive,
  isValidYouTubeUrl,
  generateId,
  normalizeText
};