/* global chrome, browser */

const API_BASE_URL = "http://localhost:3000/api/papers"; // TODO: Replace with actual backend URL for deployment
// const { formatTimestampToLocal, formatTimeAgo, fuzzyMatch } = require('../shared/utils'); // Removed for browser compatibility
// const { paperSchema } = require('../shared/paper'); // Removed for browser compatibility

const getBrowserApi = () => typeof chrome !== 'undefined' ? chrome : browser;
const browserApi = getBrowserApi();

// --- Utility functions (copied/adapted from shared/utils.js for browser environment) ---
const paperSchema = {
  id: null,
  metadata: {
    title: null,
    authors: [],
    abstract: null,
    publishYear: null,
  },
  reads: [],
};

const fuzzyMatch = (text, query) => {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
};

const formatTimestampToLocal = (timestamp) => {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZoneName: 'short',
  }).format(date);
};

const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const past = new Date(timestamp);
  const seconds = Math.round((now.getTime() - past.getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 60) return `${seconds} seconds ago`;
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours < 24) return `${hours} hours ago`;
  return `${days} days ago`;
};
// --- End Utility functions ---

// Function to extract metadata from the current page
function extractPaperMetadata() {
  const metadata = { ...paperSchema.metadata };

  // 1. From meta tags
  const metaTags = document.querySelectorAll('meta[name^="citation_"], meta[property^="og:"]');
  metaTags.forEach(tag => {
    const name = tag.getAttribute('name') || tag.getAttribute('property');
    const content = tag.getAttribute('content');
    if (!content) return;

    if (name === 'citation_title' || name === 'og:title') {
      metadata.title = metadata.title || content;
    } else if (name === 'citation_author' || name === 'og:author') {
      metadata.authors = [...(metadata.authors || []), content];
    } else if (name === 'citation_abstract' || name === 'og:description') {
      metadata.abstract = metadata.abstract || content;
    } else if (name === 'citation_publication_date' || name === 'og:pubdate') {
      metadata.publishYear = metadata.publishYear || parseInt(content.substring(0, 4), 10);
    } else if (name === 'citation_doi') {
      metadata.id = metadata.id || content;
    }
  });

  // 2. From URL (basic DOI/URL extraction)
  if (!metadata.id) {
    const url = window.location.href;
    const doiMatch = url.match(/doi\.org\/(10\.\d{4,}\/[^\s\/]+)/i);
    if (doiMatch) {
      metadata.id = doiMatch[1];
    } else {
      metadata.id = url; // Fallback to URL as ID
    }
  }

  // 3. From DOM (example for arXiv or similar)
  if (!metadata.title) {
    const titleElement = document.querySelector('h1.title, .entry-title');
    if (titleElement) metadata.title = titleElement.innerText.trim();
  }
  if ((!metadata.authors || metadata.authors.length === 0) && document.querySelector('.authors')) {
    metadata.authors = Array.from(document.querySelectorAll('.authors a')).map(a => a.innerText.trim());
  }
  if (!metadata.abstract) {
    const abstractElement = document.querySelector('.abstract, #abs');
    if (abstractElement) metadata.abstract = abstractElement.innerText.trim();
  }

  return {
    id: metadata.id,
    metadata: {
      title: metadata.title || 'Unknown Title',
      authors: metadata.authors.length > 0 ? metadata.authors : ['Unknown Author'],
      abstract: metadata.abstract || 'No abstract available.',
      publishYear: metadata.publishYear || null,
    },
  };
}

// Function to show a tooltip
function showTooltip(element, message) {
  let tooltip = document.getElementById('xjr3-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'xjr3-tooltip';
    Object.assign(tooltip.style, {
      position: 'fixed',
      backgroundColor: '#333',
      color: '#fff',
      padding: '5px 10px',
      borderRadius: '5px',
      zIndex: '10000',
      fontSize: '12px',
    });
    document.body.appendChild(tooltip);
  }

  tooltip.innerText = message;

  const rect = element.getBoundingClientRect();
  Object.assign(tooltip.style, {
    top: `${rect.bottom + window.scrollY + 5}px`,
    left: `${rect.left + window.scrollX}px`,
    display: 'block',
  });

  // Hide tooltip after a delay
  setTimeout(() => {
    tooltip.style.display = 'none';
  }, 5000);
}

// Main function to check paper and display status
async function checkPaperAndDisplayStatus() {
  const paperData = extractPaperMetadata();

  if (!paperData.id) {
    console.log('[XJR-3] No identifiable paper ID found on this page.');
    return;
  }

  console.log('[XJR-3] Extracted paper metadata:', paperData);

  // Try to get token from storage
  const storage = await browserApi.storage.local.get(['jwtToken', 'userId']);
  const jwtToken = storage.jwtToken;
  const userId = storage.userId;

  if (!jwtToken || !userId) {
    console.log('[XJR-3] User not logged in, cannot check paper status.');
    // showTooltip(document.body, 'Please log in to XJR-3 extension to track papers.');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/check-paper?id=${encodeURIComponent(paperData.id)}&details=true`, {
      headers: {
        'x-auth-token': jwtToken,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[XJR-3] Paper not found in backend.');
        showTooltip(document.body, 'Paper: Unread');
      } else {
        const errorData = await response.json();
        console.error('[XJR-3] Error checking paper:', errorData.message);
        showTooltip(document.body, `Error: ${errorData.message}`);
      }
      return;
    }

    const data = await response.json();
    console.log('[XJR-3] Paper check response:', data);

    let tooltipMessage = `Paper: ${data.readStatus === 'read' ? 'Read' : 'Unread'}`;

    if (data.readStatus === 'read' && data.reads && data.reads.length > 0) {
      // Find the most recent read by the current user
      const userReads = data.reads.filter(read => read.user === userId);
      if (userReads.length > 0) {
        const most recentRead = userReads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        const localTimestamp = formatTimestampToLocal(new Date(mostRecentRead.timestamp));
        const timeAgo = formatTimeAgo(new Date(mostRecentRead.timestamp));
        tooltipMessage += ` by you on ${localTimestamp} (${timeAgo})`;
      } else {
        tooltipMessage += ' by others';
      }
    }

    showTooltip(document.body, tooltipMessage);

  } catch (error) {
    console.error('[XJR-3] Network or server error checking paper:', error);
    // Implement offline caching here
    showTooltip(document.body, 'Offline—queued (not implemented yet)');
  }
}

// Run when the content script is loaded
checkPaperAndDisplayStatus();

// Listen for messages from background script or popup
browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getPaperMetadata') {
    const metadata = extractPaperMetadata();
    sendResponse(metadata);
    return true; // Indicates an asynchronous response
  }
});
