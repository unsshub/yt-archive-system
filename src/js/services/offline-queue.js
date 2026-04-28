// src/js/services/offline-queue.js
// Offline queue management and sync status

const QUEUE_STORAGE_KEY = 'offline_queue';
const MAX_RETRY_COUNT = 3;

/**
 * @typedef {Object} QueueOperation
 * @property {string} type - Operation type ('sync')
 * @property {Array} videos - Videos to sync
 * @property {string} token - GitHub PAT
 * @property {string} repo - Repository path
 * @property {string} [branch='main'] - Branch name
 * @property {string} [path='data/videos.json'] - File path
 * @property {number} [retries=0] - Number of retry attempts
 * @property {boolean} [hasToken=false] - Whether token is present
 */

/** @type {QueueOperation[]} */
let queue = [];

/**
 * Loads queue from localStorage on initialization
 */
function loadQueue() {
  try {
    const stored = global.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Reconstruct tokens from sessionStorage if available
      const token = global.sessionStorage.getItem('github_pat');
      queue = parsed.map(op => ({
        ...op,
        token: token || op.token || '',
        hasToken: !!token || !!op.token
      }));
    }
  } catch (error) {
    console.error('Failed to load offline queue:', error);
    queue = [];
  }
}

/**
 * Saves queue to localStorage for persistence
 */
function saveQueue() {
  try {
    // Store with masked tokens for security
    const toStore = queue.map(op => ({
      type: op.type,
      videos: op.videos,
      repo: op.repo,
      branch: op.branch || 'main',
      path: op.path || 'data/videos.json',
      retries: op.retries || 0,
      hasToken: !!op.token
    }));
    global.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(toStore));
  } catch (error) {
    console.error('Failed to save offline queue:', error);
  }
}

/**
 * Gets the current queue
 * @returns {QueueOperation[]}
 */
function getQueue() {
  return [...queue];
}

/**
 * Adds an operation to the queue
 * @param {QueueOperation} operation - Operation to enqueue
 * @returns {boolean} - True if added, false if duplicate
 */
function enqueue(operation) {
  // Check for duplicates
  const isDuplicate = queue.some(existing => 
    existing.type === operation.type &&
    existing.repo === operation.repo &&
    JSON.stringify(existing.videos) === JSON.stringify(operation.videos)
  );

  if (isDuplicate) {
    return false;
  }

  // Ensure token is present
  const token = operation.token || global.sessionStorage.getItem('github_pat') || '';
  
  queue.push({
    type: operation.type,
    videos: operation.videos || [],
    token: token,
    repo: operation.repo || '',
    branch: operation.branch || 'main',
    path: operation.path || 'data/videos.json',
    retries: 0,
    hasToken: !!token
  });

  saveQueue();
  updateSyncStatus();
  return true;
}

/**
 * Removes an operation from the queue
 * @param {QueueOperation} operation - Operation to remove
 */
function dequeue(operation) {
  queue = queue.filter(op => 
    !(op.type === operation.type && 
      op.repo === operation.repo &&
      JSON.stringify(op.videos) === JSON.stringify(operation.videos))
  );
  saveQueue();
  updateSyncStatus();
}

/**
 * Clears all operations from the queue
 */
function clearQueue() {
  queue = [];
  saveQueue();
  updateSyncStatus('idle');
}

/**
 * Gets the count of queued operations
 * @returns {number}
 */
function getQueueLength() {
  return queue.length;
}

/**
 * Processes all queued operations
 * @returns {Promise<{success: number, failed: number}>}
 */
async function processQueue() {
  if (queue.length === 0) return { success: 0, failed: 0 };

  const { syncToGitHub } = require('./github-sync');
  let success = 0;
  let failed = 0;

  updateSyncStatus('syncing');
  notifySyncStart(queue.length);

  // Process each operation
  const operations = [...queue];
  
  for (const operation of operations) {
    try {
      // Ensure we have a valid token
      if (!operation.token) {
        operation.token = global.sessionStorage.getItem('github_pat') || '';
      }

      if (!operation.token) {
        // No token available, remove from queue
        dequeue(operation);
        failed++;
        continue;
      }

      await syncToGitHub(
        operation.videos,
        operation.token,
        operation.repo,
        operation.branch,
        operation.path
      );

      // Success - remove from queue
      dequeue(operation);
      success++;
    } catch (error) {
      // Check if error is retryable
      if (isRetryableError(error) && (operation.retries || 0) < MAX_RETRY_COUNT) {
        // Keep in queue for retry, increment retry count
        operation.retries = (operation.retries || 0) + 1;
        saveQueue();
        failed++;
      } else {
        // Non-retryable or max retries exceeded - remove from queue
        dequeue(operation);
        failed++;
      }
    }
  }

  saveQueue();
  
  if (failed > 0 && success === 0) {
    updateSyncStatus('error');
    notifySyncError(`Sync failed for ${failed} operation(s)`);
  } else if (failed > 0) {
    updateSyncStatus('idle');
    notifySyncComplete(success, failed);
  } else {
    updateSyncStatus('idle');
    notifySyncComplete(success, 0);
  }

  return { success, failed };
}

/**
 * Checks if an error is retryable
 * @param {Error} error 
 * @returns {boolean}
 */
function isRetryableError(error) {
  const message = error.message || '';
  // Network errors are retryable
  if (message.includes('Network') || message.includes('fetch') || message.includes('timeout')) {
    return true;
  }
  // 5xx errors are retryable
  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return true;
  }
  // Rate limit errors are retryable
  if (message.includes('429') || message.includes('rate limit')) {
    return true;
  }
  // Auth errors, not found, validation errors are NOT retryable
  return false;
}

/**
 * Updates the sync status indicator in the UI
 * @param {'idle'|'syncing'|'error'|'pending'} status - Status type
 */
function updateSyncStatus(status) {
  const statusElement = document.getElementById('sync-status');
  if (!statusElement) return;

  // Determine status based on queue if not explicitly provided
  if (!status) {
    status = queue.length > 0 ? 'pending' : 'idle';
  }

  // Remove all status classes
  statusElement.classList.remove('sync-idle', 'sync-progress', 'sync-pending', 'sync-error');

  switch (status) {
    case 'idle':
      statusElement.classList.add('sync-idle');
      statusElement.textContent = '✅ Synced';
      break;
    case 'syncing':
      statusElement.classList.add('sync-progress');
      statusElement.textContent = '🔄 Syncing...';
      break;
    case 'pending':
      statusElement.classList.add('sync-pending');
      statusElement.textContent = `⏳ ${queue.length} pending sync(s)`;
      break;
    case 'error':
      statusElement.classList.add('sync-error');
      statusElement.textContent = '❌ Sync failed';
      break;
    default:
      statusElement.classList.add('sync-idle');
      statusElement.textContent = '✅ Synced';
  }
}

/**
 * Shows a toast notification for sync events
 * @param {string} message - Toast message
 * @param {'success'|'error'|'info'|'warning'} type - Toast type
 */
function showSyncToast(message, type = 'info') {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: '🔄'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;

  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('toast-hiding');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

/**
 * Notifies that sync has started
 * @param {number} queueLength - Number of items to process
 */
function notifySyncStart(queueLength) {
  showSyncToast(`Syncing ${queueLength} item(s) to GitHub...`, 'info');
  
  const event = new CustomEvent('sync-start', { detail: { queueLength } });
  window.dispatchEvent(event);
}

/**
 * Notifies that sync has completed
 * @param {number} success - Number of successful operations
 * @param {number} failed - Number of failed operations
 */
function notifySyncComplete(success, failed) {
  let message = `Sync complete: ${success} item(s) synced`;
  if (failed > 0) {
    message += `, ${failed} failed`;
  }
  
  const type = failed > 0 ? 'warning' : 'success';
  showSyncToast(message, type);

  const event = new CustomEvent('sync-complete', { detail: { success, failed } });
  window.dispatchEvent(event);
}

/**
 * Notifies that sync has failed
 * @param {string} errorMessage - Error description
 */
function notifySyncError(errorMessage) {
  showSyncToast(`Sync failed: ${errorMessage}`, 'error');

  const event = new CustomEvent('sync-error', { detail: { error: errorMessage } });
  window.dispatchEvent(event);
}

// ==================== Event Listeners ====================

/**
 * Handles online event - processes queue
 */
async function handleOnline() {
  showSyncToast('Back online! Processing queued items...', 'info');
  
  if (queue.length > 0) {
    await processQueue();
  } else {
    updateSyncStatus('idle');
  }

  // Hide offline banner
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.style.display = 'none';
  }
}

/**
 * Handles offline event - shows indicator
 */
function handleOffline() {
  updateSyncStatus('pending');
  showSyncToast('You are offline. Changes will be synced when connection is restored.', 'warning');

  // Show offline banner
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.style.display = 'block';
  }
}

/**
 * Initializes the offline queue system
 */
function initOfflineQueue() {
  // Load persisted queue
  loadQueue();
  
  // Set initial sync status
  updateSyncStatus();
  
  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // If online and queue has items, process them
  if (navigator.onLine && queue.length > 0) {
    processQueue();
  }

  // If offline, show indicator
  if (!navigator.onLine) {
    handleOffline();
  }
}

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOfflineQueue);
  } else {
    initOfflineQueue();
  }
}

module.exports = {
  getQueue,
  enqueue,
  dequeue,
  clearQueue,
  getQueueLength,
  processQueue,
  updateSyncStatus,
  initOfflineQueue
};