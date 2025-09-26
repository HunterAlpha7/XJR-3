/* global chrome, browser */

const API_BASE_URL = "http://localhost:3000/api"; // TODO: Replace with actual backend URL for deployment
const OFFLINE_QUEUE_KEY = 'xjr3_offline_queue';
const JWT_TOKEN_KEY = 'jwtToken';
const USER_ID_KEY = 'userId';

const getBrowserApi = () => typeof chrome !== 'undefined' ? chrome : browser;
const browserApi = getBrowserApi();

// --- Utility functions (copied/adapted from shared/utils.js for browser environment) ---
const isOffline = () => {
  if (typeof navigator !== 'undefined') {
    return !navigator.onLine;
  }
  return false; // Assume online if navigator is not available (e.g., in Node.js backend)
};

// Removed formatTimestampToLocal and formatTimeAgo as they are now in content.js and popup.js directly or handled natively
// --- End Utility functions ---

// Function to sync queued offline requests to the backend
async function syncOfflineQueue() {
  if (isOffline()) {
    console.log('[XJR-3 Background] Offline. Queue will sync when online.');
    return;
  }

  console.log('[XJR-3 Background] Attempting to sync offline queue...');
  const storage = await browserApi.storage.local.get([OFFLINE_QUEUE_KEY, JWT_TOKEN_KEY]);
  let offlineQueue = storage[OFFLINE_QUEUE_KEY] || [];
  const jwtToken = storage[JWT_TOKEN_KEY];

  if (offlineQueue.length === 0) {
    console.log('[XJR-3 Background] Offline queue is empty.');
    return;
  }

  if (!jwtToken) {
    console.warn('[XJR-3 Background] No JWT token found. Cannot sync offline queue.');
    return;
  }

  const successfulRequests = [];
  for (const [index, request] of offlineQueue.entries()) {
    try {
      console.log('[XJR-3 Background] Syncing request:', request.url);
      const response = await fetch(request.url, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': jwtToken,
          ...(request.headers || {}),
        },
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      if (response.ok) {
        console.log('[XJR-3 Background] Request synced successfully:', request.url);
        successfulRequests.push(index);
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error(`[XJR-3 Background] Failed to sync ${request.url}:`, response.status, errorData.message);
        // Do not remove from queue, will retry later
      }
    } catch (error) {
      console.error('[XJR-3 Background] Network error during sync:', request.url, error);
      // Do not remove from queue, will retry later (likely still offline)
    }
  }

  // Remove successfully synced requests from the queue
  offlineQueue = offlineQueue.filter((_, index) => !successfulRequests.includes(index));
  await browserApi.storage.local.set({ [OFFLINE_QUEUE_KEY]: offlineQueue });

  console.log(`[XJR-3 Background] Sync attempt finished. ${successfulRequests.length} requests synced.`);
}

// Listen for an alarm to periodically sync the queue
browserApi.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncOfflineQueue') {
    syncOfflineQueue();
  }
});

// Set up the alarm when the extension is installed or updated
browserApi.runtime.onInstalled.addListener(() => {
  browserApi.alarms.create('syncOfflineQueue', { periodInMinutes: 5 }); // Poll every 5 minutes
  console.log('[XJR-3 Background] Offline sync alarm set.');
});

// Set up the alarm when the browser starts (for service workers, this might be redundant with onInstalled)
browserApi.runtime.onStartup.addListener(() => {
  browserApi.alarms.create('syncOfflineQueue', { periodInMinutes: 5 }); // Poll every 5 minutes
  console.log('[XJR-3 Background] Offline sync alarm re-created on startup.');
});

// Listen for messages from content scripts or popup
browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'queueOfflineRequest') {
    const { url, method, body, headers } = message.payload;
    browserApi.storage.local.get(OFFLINE_QUEUE_KEY, (result) => {
      const offlineQueue = result[OFFLINE_QUEUE_KEY] || [];
      offlineQueue.push({ url, method, body, headers });
      browserApi.storage.local.set({ [OFFLINE_QUEUE_KEY]: offlineQueue }, () => {
        console.log('[XJR-3 Background] Request queued offline:', url);
        sendResponse({ success: true, message: 'Request queued offline.' });
      });
    });
    return true; // Indicates an asynchronous response
  } else if (message.action === 'forceSyncOfflineQueue') {
    syncOfflineQueue();
    sendResponse({ success: true, message: 'Offline queue sync initiated.' });
    return true;
  }
});
