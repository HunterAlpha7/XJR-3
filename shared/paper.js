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

function validatePaper(paper) {
  if (!paper.id) {
    return { isValid: false, message: 'Paper ID is required.' };
  }
  if (!paper.metadata.title) {
    return { isValid: false, message: 'Paper title is required.' };
  }
  if (!Array.isArray(paper.metadata.authors) || paper.metadata.authors.length === 0) {
    return { isValid: false, message: 'At least one author is required.' };
  }
  if (!paper.metadata.abstract) {
    return { isValid: false, message: 'Paper abstract is required.' };
  }
  if (!paper.metadata.publishYear || typeof paper.metadata.publishYear !== 'number') {
    return { isValid: false, message: 'Paper publish year is required and must be a number.' };
  }
  if (!Array.isArray(paper.reads)) {
    return { isValid: false, message: 'Paper reads must be an array.' };
  }

  for (const read of paper.reads) {
    if (!read.user || !read.timestamp || !read.notes) {
      return { isValid: false, message: 'Each read entry requires a user, timestamp, and notes.' };
    }
  }

  return { isValid: true };
}

module.exports = { paperSchema, validatePaper };
