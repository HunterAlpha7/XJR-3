/* global chrome, browser */

const API_BASE_URL = "http://localhost:3000/api"; // TODO: Update for deployment
const { formatTimestampToLocal, formatTimeAgo } = require('../shared/utils'); // Re-evaluate if this works directly in browser context

const getBrowserApi = () => typeof chrome !== 'undefined' ? chrome : browser;
const browserApi = getBrowserApi();

const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const logoutButton = document.getElementById('logout-button');
const searchForm = document.getElementById('search-form');
const searchKeywordInput = document.getElementById('search-keyword');
const searchUserInput = document.getElementById('search-user');
const searchPublishYearInput = document.getElementById('search-publish-year');
const papersTableBody = document.getElementById('papers-table-body');
const papersMessage = document.getElementById('papers-message');
const loadMoreButton = document.getElementById('load-more-button');

let currentPage = 1;
let currentLimit = 10;
let currentSearchQuery = {};

const readConfirmationModal = $('#readConfirmationModal');
const existingReadsInfo = $('#existing-reads-info');
const viewNotesButton = $('#viewNotesButton');
const confirmMarkReadButton = $('#confirmMarkReadButton');

// --- Utility functions for browser environment (re-defined from shared/utils.js if not directly importable) ---
// In a real extension, you'd bundle these shared utilities to be accessible.
// For now, re-defining minimal necessary parts or assuming a build process.

function getLocalFormattedTimestamp(timestamp) {
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
}

function getRelativeTime(timestamp) {
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
}
// --- End Utility functions ---

// Function to check login status and update UI
async function checkLoginStatus() {
  const storage = await browserApi.storage.local.get(['jwtToken', 'userId']);
  if (storage.jwtToken && storage.userId) {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    await fetchPapers(true); // Fetch papers on successful login/startup
  } else {
    loginSection.style.display = 'block';
    dashboardSection.style.display = 'none';
  }
}

// Handle login form submission
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = loginForm.username.value;
  const password = loginForm.password.value;

  try {
    const response = await fetch(`${API_BASE_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminUsername: username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Login failed');
    }

    const data = await response.json();
    await browserApi.storage.local.set({ jwtToken: data.token, userId: username }); // Storing username as userId for now
    loginMessage.textContent = '';
    checkLoginStatus();
  } catch (error) {
    console.error('Login error:', error);
    loginMessage.textContent = error.message || 'An unexpected error occurred.';
  }
});

// Handle logout
logoutButton.addEventListener('click', async () => {
  await browserApi.storage.local.remove(['jwtToken', 'userId']);
  checkLoginStatus();
  papersTableBody.innerHTML = ''; // Clear papers on logout
  papersMessage.style.display = 'block';
  papersMessage.textContent = 'No papers found.';
});

// Function to fetch and display papers
async function fetchPapers(reset = false) {
  if (reset) {
    currentPage = 1;
    papersTableBody.innerHTML = '';
    papersMessage.style.display = 'block';
    papersMessage.textContent = 'Loading papers...';
  }

  const storage = await browserApi.storage.local.get(['jwtToken', 'userId']);
  const jwtToken = storage.jwtToken;
  const currentUserId = storage.userId;

  if (!jwtToken) {
    papersMessage.textContent = 'Please log in to view papers.';
    return;
  }

  const queryParams = new URLSearchParams({
    page: currentPage,
    limit: currentLimit,
    ...currentSearchQuery,
  }).toString();

  try {
    const response = await fetch(`${API_BASE_URL}/papers/search-papers?${queryParams}`, {
      headers: { 'x-auth-token': jwtToken },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch papers');
    }

    const data = await response.json();
    console.log('Fetched papers:', data);

    if (data.papers.length === 0 && reset) {
      papersMessage.textContent = 'No papers found matching your criteria.';
      papersMessage.style.display = 'block';
      loadMoreButton.style.display = 'none';
      return;
    } else if (data.papers.length === 0 && !reset) {
      papersMessage.textContent = 'All papers loaded.';
      papersMessage.style.display = 'block';
      loadMoreButton.style.display = 'none';
      return;
    }

    papersMessage.style.display = 'none';
    data.papers.forEach(paper => {
      const row = papersTableBody.insertRow();
      const readStatus = paper.reads.some(read => read.user === currentUserId) ? 'read' : 'unread';
      row.classList.add(`read-status-${readStatus}`);

      const readByUsers = paper.reads.map(read => read.user).join(', ') || 'N/A';

      let latestReadTime = 'N/A';
      let latestReadEntryId = null;
      const userReads = paper.reads.filter(read => read.user === currentUserId);
      if (userReads.length > 0) {
        const mostRecentRead = userReads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        latestReadTime = `${getLocalFormattedTimestamp(mostRecentRead.timestamp)} (${getRelativeTime(mostRecentRead.timestamp)})`;
        latestReadEntryId = mostRecentRead._id;
      }

      row.insertCell().textContent = paper.metadata.title;
      row.insertCell().textContent = paper.metadata.publishYear || 'N/A';
      row.insertCell().textContent = readByUsers;
      row.insertCell().textContent = latestReadTime;

      // Add Notes cell
      row.insertCell().textContent = userReads.length > 0 ? userReads[0].notes : 'N/A';

      const actionsCell = row.insertCell();
      if (readStatus === 'unread') {
        const markReadButton = document.createElement('button');
        markReadButton.textContent = 'Mark Read';
        markReadButton.classList.add('btn', 'btn-success', 'btn-sm');
        markReadButton.addEventListener('click', () => markPaperAsRead(paper.id, paper.metadata, currentUserId));
        actionsCell.appendChild(markReadButton);
      } else if (readStatus === 'read' && latestReadEntryId) {
        const undoReadButton = document.createElement('button');
        undoReadButton.textContent = 'Undo Read';
        undoReadButton.classList.add('btn', 'btn-danger', 'btn-sm');
        undoReadButton.addEventListener('click', () => undoPaperRead(paper.id, latestReadEntryId));
        actionsCell.appendChild(undoReadButton);
      }
    });

    if (data.totalCount > (currentPage * currentLimit)) {
      loadMoreButton.style.display = 'block';
    } else {
      loadMoreButton.style.display = 'none';
    }

  } catch (error) {
    console.error('Error fetching papers:', error);
    papersMessage.textContent = error.message || 'An error occurred while fetching papers.';
    papersMessage.style.display = 'block';
    loadMoreButton.style.display = 'none';
  }
}

// Handle search form submission
searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  currentSearchQuery = {
    keyword: searchKeywordInput.value,
    user: searchUserInput.value,
    publishYear: searchPublishYearInput.value ? parseInt(searchPublishYearInput.value, 10) : undefined,
  };
  await fetchPapers(true); // Reset and fetch with new query
});

// Handle Load More button
loadMoreButton.addEventListener('click', async () => {
  currentPage++;
  await fetchPapers(false);
});

async function markPaperAsRead(paperId, metadata, userId) {
  const storage = await browserApi.storage.local.get(['jwtToken']);
  const jwtToken = storage.jwtToken;

  if (!jwtToken) {
    alert('Please log in to mark papers as read.');
    return;
  }

  try {
    // First, check if the paper is already read
    const checkResponse = await fetch(`${API_BASE_URL}/papers/check-paper?id=${encodeURIComponent(paperId)}&details=true`, {
      headers: { 'x-auth-token': jwtToken },
    });

    if (!checkResponse.ok && checkResponse.status !== 404) {
      const errorData = await checkResponse.json();
      throw new Error(errorData.message || 'Failed to check paper status');
    }

    const checkData = checkResponse.status === 200 ? await checkResponse.json() : null;

    // Fetch current config to check preventDuplicateReads
    const configResponse = await fetch(`${API_BASE_URL}/admin/config`, {
      headers: { 'x-auth-token': jwtToken },
    });
    const configData = await configResponse.json();
    const preventDuplicateReads = configData.preventDuplicateReads;

    if (checkData && checkData.readStatus === 'read' && preventDuplicateReads) {
      // Paper is already read and duplicates are prevented
      const existingReads = checkData.reads;
      let readsHtml = '';
      existingReads.forEach(read => {
        const localTimestamp = getLocalFormattedTimestamp(read.timestamp);
        const timeAgo = getRelativeTime(read.timestamp);
        readsHtml += `<p><strong>${read.user}</strong> on ${localTimestamp} (${timeAgo})<br>Notes: ${read.notes || 'No notes.'}</p>`;
      });

      existingReadsInfo.html(readsHtml);
      readConfirmationModal.modal('show');

      // Set up button listeners for the modal
      confirmMarkReadButton.off('click').on('click', () => {
        readConfirmationModal.modal('hide');
        actuallyMarkPaperAsRead(paperId, metadata, userId); // Proceed to mark read
      });

      viewNotesButton.off('click').on('click', () => {
        readConfirmationModal.modal('hide');
        alert('Viewing all notes functionality not implemented yet.'); // TODO: Implement view all notes
      });

      return; // Stop here, wait for modal interaction
    } else if (checkData && checkData.readStatus === 'read' && !preventDuplicateReads) {
      // Paper is already read, but duplicates are allowed, so proceed without modal
      await actuallyMarkPaperAsRead(paperId, metadata, userId);
    } else {
      // Paper is unread, proceed directly
      await actuallyMarkPaperAsRead(paperId, metadata, userId);
    }

  } catch (error) {
    console.error('Error checking paper status before marking:', error);
    alert(error.message || 'An error occurred while checking paper status.');
  }
}

async function actuallyMarkPaperAsRead(paperId, metadata, userId) {
  const readNotes = prompt('Add notes for this read (optional):');
  const payload = {
    id: paperId,
    metadata: metadata,
    read: { user: userId, notes: readNotes || '' },
  };

  try {
    const response = await fetch(`${API_BASE_URL}/papers/mark-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': (await browserApi.storage.local.get('jwtToken')).jwtToken },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      // If the error is a duplicate read and preventDuplicateReads is false, this should not happen now
      // but handle other potential errors
      throw new Error(errorData.message || 'Failed to mark paper as read');
    }

    alert('Paper marked as read successfully!');
    await fetchPapers(true); // Refresh papers
  } catch (error) {
    console.error('Error marking paper as read:', error);
    alert(error.message || 'An error occurred.');
  }
}

// Function to undo paper read
async function undoPaperRead(paperId, readEntryId) {
  if (!confirm('Are you sure you want to undo this read?')) {
    return;
  }

  const payload = {
    id: paperId,
    readEntryId: readEntryId,
  };

  try {
    const response = await fetch(`${API_BASE_URL}/papers/mark-read`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': (await browserApi.storage.local.get('jwtToken')).jwtToken },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to undo read');
    }

    alert('Read entry removed successfully!');
    await fetchPapers(true); // Refresh papers
  } catch (error) {
    console.error('Error undoing read:', error);
    alert(error.message || 'An error occurred.');
  }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', checkLoginStatus);
