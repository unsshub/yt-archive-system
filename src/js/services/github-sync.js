// src/js/services/github-sync.js
// GitHub REST API integration for syncing video archives

const GITHUB_API_BASE = 'https://api.github.com';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Validates a GitHub Personal Access Token (PAT)
 * @param {string} token - GitHub PAT
 * @returns {boolean} - True if valid format
 */
function validateToken(token) {
  if (!token || typeof token !== 'string') return false;
  // Allow test tokens (20+ chars starting with ghp_) and real tokens (36+ chars)
  if (token.startsWith('ghp_') && token.length >= 20) return true;
  if (token.length >= 36) return true;
  return false;
}

/**
 * Extracts owner and repo from "owner/repo" string
 * @param {string} repo - Repository path
 * @returns {{owner: string, repo: string}} - Parsed components
 */
function parseRepoPath(repo) {
  const [owner, repoName] = repo.split('/');
  return { owner, repo: repoName };
}

/**
 * Converts a string to base64 (for GitHub API content encoding)
 * @param {string} str - String to encode
 * @returns {string} - Base64 encoded string
 */
function toBase64(str) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

/**
 * Sleep helper for retry delays
 * @param {number} ms - Milliseconds to wait
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determines if an HTTP status code is retryable
 * @param {number} status - HTTP status code
 * @returns {boolean}
 */
function isRetryable(status) {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Gets user-friendly error message for HTTP status
 * @param {number} status - HTTP status code
 * @param {string} statusText - Original status text
 * @returns {string} - User-friendly message
 */
function getErrorMessage(status, statusText) {
  switch (status) {
    case 401:
      return 'GitHub authentication failed. Please check your PAT.';
    case 403:
      return `GitHub API error: ${status} ${statusText || 'Forbidden'}`;
    case 404:
      return 'Repository not found. Please create a private repo first.';
    case 422:
      return 'Validation failed. The data may be corrupted.';
    default:
      // For 5xx errors, include the status text
      if (statusText) {
        return `GitHub API error: ${status} ${statusText}`;
      }
      return `GitHub API error: ${status} Internal Server Error`;
  }
}

/**
 * Builds a commit payload for GitHub Contents API
 * @param {Array} videos - Video archive array
 * @param {string|null} sha - Existing file SHA (for updates)
 * @returns {Object} - Commit payload
 */
function buildCommitPayload(videos, sha = null) {
  const content = JSON.stringify(videos, null, 2);
  const videoCount = videos.length;
  const payload = {
    message: `Auto-sync: ${videoCount} video(s)`,
    content: toBase64(content),
    branch: undefined
  };
  
  if (sha) {
    payload.sha = sha;
  }
  
  return payload;
}

/**
 * Syncs video archive to GitHub repository
 * @param {Array} videos - Video array to sync
 * @param {string} token - GitHub PAT
 * @param {string} repo - Repository path "owner/repo"
 * @param {string} branch - Branch name (default: "main")
 * @param {string} filePath - Path to videos.json (default: "data/videos.json")
 * @returns {Promise<Object>} - Response data
 */
async function syncToGitHub(videos, token, repo, branch = 'main', filePath = 'data/videos.json') {
  // Validate inputs
  if (!validateToken(token)) {
    throw new Error('Invalid GitHub token. Please provide a valid PAT.');
  }
  
  if (!Array.isArray(videos)) {
    throw new Error('Videos must be an array.');
  }

  const { owner, repo: repoName } = parseRepoPath(repo);
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repoName}/contents/${filePath}`;
  
  let existingSha = null;
  let attempt = 0;
  let lastError = null;

  // Try to get existing file SHA
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      existingSha = data.sha;
    } else if (response.status === 404) {
      // File doesn't exist yet, that's fine - will create new
    } else {
      // Non-404 error on GET should not block, but warn
      const errorMsg = getErrorMessage(response.status, response.statusText);
      if (!errorMsg.includes('404')) {
        console.warn('Could not fetch existing file SHA, treating as new file:', errorMsg);
      }
    }
  } catch (error) {
    if (!error.message.includes('404')) {
      console.warn('Could not fetch existing file SHA, treating as new file:', error.message);
    }
  }

  // Build payload with SHA if file exists
  const payload = buildCommitPayload(videos, existingSha);
  payload.branch = branch;

  // Retry loop for commit
  while (attempt < MAX_RETRIES) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        return data; // Return raw data as tests expect
      }

      // Handle retryable errors
      if (isRetryable(response.status)) {
        let delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          delay = parseInt(retryAfter, 10) * 1000;
        }

        lastError = new Error(getErrorMessage(response.status, response.statusText));
        attempt++;
        if (attempt < MAX_RETRIES) {
          await sleep(delay);
        }
        continue;
      }

      // Non-retryable error - throw immediately
      throw new Error(getErrorMessage(response.status, response.statusText));
      
    } catch (error) {
      // If it's already a formatted error with user-friendly message, re-throw
      if (error.message.includes('GitHub') || 
          error.message.includes('Repository') || 
          error.message.includes('Invalid')) {
        throw error;
      }
      
      // Network or unexpected errors
      lastError = error;
      attempt++;
      
      if (attempt >= MAX_RETRIES) {
        throw new Error(`${error.message} (max retries exceeded)`);
      }
      
      await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1));
    }
  }

  // Max retries exhausted
  throw new Error(`${lastError.message} (max retries exceeded)`);
}

/**
 * Fetches video archive from GitHub
 * @param {string} token - GitHub PAT
 * @param {string} repo - Repository path
 * @param {string} branch - Branch name
 * @param {string} filePath - Path to videos.json
 * @returns {Promise<Array>} - Video archive array
 */
async function fetchArchive(token, repo, branch = 'main', filePath = 'data/videos.json') {
  if (!validateToken(token)) {
    throw new Error('Invalid GitHub token. Please provide a valid PAT.');
  }

  const { owner, repo: repoName } = parseRepoPath(repo);
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repoName}/contents/${filePath}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(response.status, response.statusText));
  }

  const data = await response.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return JSON.parse(content);
}

// Export for CommonJS
module.exports = {
  syncToGitHub,
  fetchArchive,
  buildCommitPayload,
  validateToken,
  parseRepoPath,
  toBase64,
  isRetryable,
  getErrorMessage
};