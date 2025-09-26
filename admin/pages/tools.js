import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import Cookies from 'js-cookie';
import axios from 'axios';
// import { verifyAdminToken } from '../shared/auth'; // For more robust SSR token verification

// --- Utility functions for browser environment (copied from shared/utils.js for client-side access) ---
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

export default function AdminTools({ initialPapers, initialConfig, error }) {
  const router = useRouter();
  const [papers, setPapers] = useState(initialPapers || []);
  const [config, setConfig] = useState(initialConfig);
  const [expandedPaperId, setExpandedPaperId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (error === 'Authentication failed') {
      router.push('/'); // Redirect to login if not authenticated
    } else if (error) {
      console.error('Tools page initial error:', error);
    }
  }, [error, router]);

  const fetchPapersAndConfig = async () => {
    setLoading(true);
    try {
      const adminJwtToken = Cookies.get('adminJwtToken');
      if (!adminJwtToken) {
        router.push('/');
        return;
      }

      const [papersResponse, configResponse] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/papers/search-papers?limit=10000`, {
          headers: { 'x-auth-token': adminJwtToken },
        }),
        axios.get(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/admin/config`, {
          headers: { 'x-auth-token': adminJwtToken },
        }),
      ]);

      setPapers(papersResponse.data.papers);
      setConfig(configResponse.data);
    } catch (err) {
      console.error('Error fetching papers or config client-side:', err);
      if (err.response?.status === 401) {
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (paperId) => {
    setExpandedPaperId(expandedPaperId === paperId ? null : paperId);
  };

  const handleDeleteAdminRead = async (paperId, readEntryId, userName) => {
    if (!confirm(`Are you sure you want to delete this read entry by ${userName}? This action cannot be undone.`)) {
      return;
    }

    try {
      const adminJwtToken = Cookies.get('adminJwtToken');
      if (!adminJwtToken) {
        router.push('/');
        return;
      }

      await axios.delete(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/admin/mark-read`, {
        headers: {
          'x-auth-token': adminJwtToken,
          'Content-Type': 'application/json',
        },
        data: { paperId, readEntryId }, // For DELETE with body
      });

      alert('Read entry deleted successfully!');
      await fetchPapersAndConfig(); // Refresh data
    } catch (err) {
      console.error('Error deleting read entry by admin:', err);
      alert(err.response?.data?.message || 'Failed to delete read entry.');
    }
  };

  const handleExportCsv = async () => {
    try {
      const adminJwtToken = Cookies.get('adminJwtToken');
      if (!adminJwtToken) {
        router.push('/');
        return;
      }

      const response = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/papers/search-papers?limit=10000`, {
        headers: {
          'x-auth-token': adminJwtToken,
        },
      });

      const papers = response.data.papers;

      if (!papers || papers.length === 0) {
        alert('No papers to export.');
        return;
      }

      // Prepare CSV header
      const csvRows = [];
      const headers = ['ID', 'Title', 'Authors', 'Abstract', 'Publish Year', 'Reads Count', 'Readers', 'Latest Read Time (UTC)', 'Latest Read Notes'];
      csvRows.push(headers.join(','));

      papers.forEach(paper => {
        const latestRead = paper.reads.length > 0 ? paper.reads[paper.reads.length - 1] : null;
        const row = [
          `"${paper.id}"`,
          `"${paper.metadata.title.replace(/"/g, '\"\')}"`,
          `"${paper.metadata.authors.join('; ').replace(/"/g, '\"\')}"`,
          `"${paper.metadata.abstract.replace(/"/g, '\"\')}"`,
          paper.metadata.publishYear || 'N/A',
          paper.reads.length,
          `"${paper.reads.map(read => read.user).join('; ').replace(/"/g, '\"\')}"`,
          latestRead ? latestRead.timestamp : 'N/A',
          latestRead ? `"${latestRead.notes.replace(/"/g, '\"\')}"` : 'N/A',
        ];
        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'xjr3_papers.csv';
      link.click();

      alert('Papers exported to CSV successfully!');
    } catch (err) {
      console.error('Error exporting CSV:', err);
      alert(err.response?.data?.message || 'Failed to export papers to CSV.');
    }
  };

  const handleDeleteDuplicates = async () => {
    if (!confirm('Are you sure you want to delete duplicate read entries? This action cannot be undone.')) {
      return;
    }

    try {
      const adminJwtToken = Cookies.get('adminJwtToken');
      if (!adminJwtToken) {
        router.push('/');
        return;
      }
      // This functionality needs to be implemented in the backend first
      alert('Delete duplicate functionality is not yet implemented in the backend.');
      // await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/admin/cleanup-duplicates`, {}, {
      //   headers: {
      //     'x-auth-token': adminJwtToken,
      //   },
      // });
      // alert('Duplicate read entries deleted successfully!');
    } catch (err) {
      console.error('Error deleting duplicates:', err);
      alert(err.response?.data?.message || 'Failed to delete duplicate read entries.');
    }
  };

  const handleTogglePreventDuplicateReads = async () => {
    setLoading(true);
    try {
      const adminJwtToken = Cookies.get('adminJwtToken');
      if (!adminJwtToken) {
        router.push('/');
        return;
      }

      const updatedValue = !config.preventDuplicateReads;
      const response = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/admin/config`, {
        preventDuplicateReads: updatedValue,
      }, {
        headers: {
          'x-auth-token': adminJwtToken,
        },
      });
      setConfig(response.data); // Update config state with response from backend
      alert(`Prevent duplicate reads set to ${updatedValue}.`);
    } catch (err) {
      console.error('Error toggling preventDuplicateReads:', err);
      alert(err.response?.data?.message || 'Failed to toggle setting.');
    }
    finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-5">
      <Head>
        <title>Admin Tools - XJR-3</title>
      </Head>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3">Admin Tools</h1>
        <Image src="/logo.svg" alt="XJR-3 Logo" width={40} height={40} />
        <button onClick={() => {
          Cookies.remove('adminJwtToken');
          router.push('/');
        }} className="btn btn-danger">Logout</button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Configuration Section */}
      <div className="card p-3 mb-4">
        <h2 className="h5 card-title">Configuration</h2>
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="preventDuplicateReadsSwitch"
            checked={config?.preventDuplicateReads || false}
            onChange={handleTogglePreventDuplicateReads}
            disabled={loading}
          />
          <label className="form-check-label" htmlFor="preventDuplicateReadsSwitch">
            Prevent Duplicate Reads
          </label>
        </div>
      </div>

      {/* Action Logs Placeholder */}
      <div className="card p-3 mb-4">
        <h2 className="h5 card-title">Action Logs</h2>
        <p>Recent admin actions will be displayed here.</p>
      </div>

      {/* Data Management Tools */}
      <div className="card p-3 mb-4">
        <h2 className="h5 card-title">Data Management</h2>
        <div className="d-grid gap-2">
          <button className="btn btn-warning mb-2" onClick={handleDeleteDuplicates}>
            Delete Duplicate Read Entries
          </button>
          <button className="btn btn-info" onClick={handleExportCsv}>
            Export All Papers to CSV
          </button>
        </div>
      </div>

      {/* All Papers with Reads */}
      <div className="card p-3">
        <h2 className="h5 card-title">All Papers and Read Entries ({papers.length})</h2>
        <div className="table-responsive">
          <table className="table table-hover table-sm">
            <thead>
              <tr>
                <th>Title</th>
                <th>Publish Year</th>
                <th>Reads Count</th>
                <th>Expand</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {papers.length > 0 ? (
                papers.map((paper) => (
                  <>
                    <tr key={paper.id}>
                      <td>{paper.metadata.title}</td>
                      <td>{paper.metadata.publishYear || 'N/A'}</td>
                      <td>{paper.reads.length}</td>
                      <td>
                        <button className="btn btn-sm btn-outline-primary" onClick={() => toggleExpand(paper.id)}>
                          {expandedPaperId === paper.id ? 'Collapse' : 'Expand'}
                        </button>
                      </td>
                      <td>
                        {/* Add paper-level actions here if needed */}
                      </td>
                    </tr>
                    {expandedPaperId === paper.id && paper.reads.length > 0 && (
                      <tr>
                        <td colSpan="5">
                          <table className="table table-bordered table-sm mb-0">
                            <thead>
                              <tr>
                                <th>User</th>
                                <th>Read Time</th>
                                <th>Notes</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paper.reads.map(read => (
                                <tr key={read._id}>
                                  <td>{read.user}</td>
                                  <td>
                                    {getLocalFormattedTimestamp(read.timestamp)}
                                    &nbsp;({getRelativeTime(read.timestamp)})
                                  </td>
                                  <td>{read.notes || 'No notes.'}</td>
                                  <td>
                                    <button
                                      className="btn btn-sm btn-danger"
                                      onClick={() => handleDeleteAdminRead(paper.id, read._id, read.user)}
                                      disabled={loading}
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center">{loading ? 'Loading papers...' : 'No papers found.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  const { req, res } = context;
  const adminJwtToken = req.cookies.adminJwtToken;

  if (!adminJwtToken) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };
  }

  try {
    // Fetch initial papers and config
    const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3000/api';
    const [papersResponse, configResponse] = await Promise.all([
      axios.get(`${backendApiUrl}/papers/search-papers?limit=10000`, {
        headers: { 'x-auth-token': adminJwtToken },
      }),
      axios.get(`${backendApiUrl}/admin/config`, {
        headers: { 'x-auth-token': adminJwtToken },
      }),
    ]);

    return {
      props: {
        initialPapers: papersResponse.data.papers,
        initialTotalCount: papersResponse.data.totalCount,
        initialConfig: configResponse.data,
      },
    };
  } catch (error) {
    console.error('Error fetching initial admin tools data:', error);
    if (error.response?.status === 401) {
      res.setHeader('Set-Cookie', 'adminJwtToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT');
      return {
        redirect: {
          destination: '/',
          permanent: false,
        },
      };
    }
    return {
      props: { error: error.message || 'Failed to load admin tools data.' },
    };
  }
}
