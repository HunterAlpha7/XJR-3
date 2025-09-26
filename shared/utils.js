const hashID = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
};

const fuzzyMatch = (text, query) => {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
};

const extractMetadata = (documentContent) => {
  // Placeholder for actual metadata extraction logic
  // In a real scenario, this would involve parsing the document content
  // to find title, authors, abstract, and publish year.
  // For now, we return dummy data or expect structured input.
  return {
    title: "Extracted Title",
    authors: ["Author One", "Author Two"],
    abstract: "This is an extracted abstract of the document.",
    publishYear: 2023,
  };
};

const isOffline = () => {
  if (typeof navigator !== 'undefined') {
    return !navigator.onLine;
  }
  // Assume online if navigator is not available (e.g., in Node.js backend)
  return false;
};

const { format, formatDistanceToNow } = require('date-fns');
const { utcToZonedTime, formatInTimeZone } = require('date-fns-tz');

const formatTimestampToLocal = (timestamp) => {
  const date = new Date(timestamp);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd HH:mm:ss XXX');
};

const formatTimeAgo = (timestamp) => {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
};

module.exports = {
  hashID,
  fuzzyMatch,
  extractMetadata,
  isOffline,
  formatTimestampToLocal,
  formatTimeAgo,
};
