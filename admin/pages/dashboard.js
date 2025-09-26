import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import axios from 'axios';
import Cookies from 'js-cookie';
import { verifyAdminToken } from '../shared/auth'; // Assuming auth utilities can be used here for SSR token verification

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

export default function Dashboard({ initialPapers, initialTotalCount, error }) {
  const router = useRouter();
  const [papers, setPapers] = useState(initialPapers || []);
  const [totalCount, setTotalCount] = useState(initialTotalCount || 0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [currentFilters, setCurrentFilters] = useState({
    keyword: '',
    user: '',
    publishYear: '',
  });

  useEffect(() => {
    if (error === 'Authentication failed') {
      router.push('/'); // Redirect to login if not authenticated
    } else if (error) {
      console.error('Dashboard initial error:', error);
    }
  }, [error, router]);

  const fetchPapersClientSide = async (page, filters) => {
    setLoading(true);
    try {
      const adminJwtToken = Cookies.get('adminJwtToken');
      if (!adminJwtToken) {
        router.push('/');
        return;
      }

      const queryParams = new URLSearchParams({
        page,
        limit: 10, // Assuming a default limit for client-side fetches
        ...filters,
      }).toString();

      const response = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/papers/search-papers?${queryParams}`, {
        headers: {
          'x-auth-token': adminJwtToken,
        },
      });

      if (page === 1) {
        setPapers(response.data.papers);
      } else {
        setPapers((prevPapers) => [...prevPapers, ...response.data.papers]);
      }
      setTotalCount(response.data.totalCount);
      setCurrentPage(page);
    } catch (err) {
      console.error('Error fetching papers client-side:', err);
      if (err.response?.status === 401) {
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    setCurrentFilters({
      ...currentFilters,
      [e.target.name]: e.target.value,
    });
  };

  const handleSearch = () => {
    fetchPapersClientSide(1, currentFilters);
  };

  const handleLoadMore = () => {
    fetchPapersClientSide(currentPage + 1, currentFilters);
  };

  return (
    <div className="container mt-5">
      <Head>
        <title>Admin Dashboard - XJR-3</title>
      </Head>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3">Admin Dashboard</h1>
        <Image src="/logo.svg" alt="XJR-3 Logo" width={40} height={40} />
        <button onClick={() => {
          Cookies.remove('adminJwtToken');
          router.push('/');
        }} className="btn btn-danger">Logout</button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Filters */}
      <div className="card p-3 mb-4">
        <h2 className="h5 card-title">Filters</h2>
        <div className="row">
          <div className="col-md-4 mb-2">
            <input
              type="text"
              className="form-control"
              placeholder="Keyword (title, author, abstract)"
              name="keyword"
              value={currentFilters.keyword}
              onChange={handleFilterChange}
            />
          </div>
          <div className="col-md-3 mb-2">
            <input
              type="text"
              className="form-control"
              placeholder="User"
              name="user"
              value={currentFilters.user}
              onChange={handleFilterChange}
            />
          </div>
          <div className="col-md-3 mb-2">
            <input
              type="number"
              className="form-control"
              placeholder="Publish Year"
              name="publishYear"
              value={currentFilters.publishYear}
              onChange={handleFilterChange}
            />
          </div>
          <div className="col-md-2 mb-2">
            <button className="btn btn-primary btn-block" onClick={handleSearch}>Search</button>
          </div>
        </div>
      </div>

      {/* Stats Placeholder */}
      <div className="card p-3 mb-4">
        <h2 className="h5 card-title">Statistics</h2>
        <p>Overall paper statistics (e.g., pie chart of reads by user) will go here.</p>
      </div>

      {/* Papers Table */}
      <div className="card p-3">
        <h2 className="h5 card-title">All Papers ({totalCount})</h2>
        <div className="table-responsive">
          <table className="table table-hover table-sm">
            <thead>
              <tr>
                <th>Title</th>
                <th>Publish Year</th>
                <th>Reads Count</th>
                <th>Latest Read Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {papers.length > 0 ? (
                papers.map((paper) => (
                  <tr key={paper.id}>
                    <td>{paper.metadata.title}</td>
                    <td>{paper.metadata.publishYear || 'N/A'}</td>
                    <td>{paper.reads.length}</td>
                    <td>
                      {paper.reads.length > 0 ? (
                        <>
                          {getLocalFormattedTimestamp(paper.reads[paper.reads.length - 1].timestamp)}
                          &nbsp;({getRelativeTime(paper.reads[paper.reads.length - 1].timestamp)})
                        </>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td>
                      {/* Actions like View Notes, Delete Read, etc. */}
                      <button className="btn btn-sm btn-info me-2">View Reads</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center">{loading ? 'Loading...' : 'No papers found.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalCount > papers.length && (
          <div className="text-center mt-3">
            <button className="btn btn-secondary" onClick={handleLoadMore} disabled={loading}>
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
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
    // Verify token on server-side (optional, but good for security)
    // For this basic example, we'll just check its presence for redirection
    // In a real app, you'd decode and validate it using verifyAdminToken from shared/auth
    // const decoded = verifyAdminToken(adminJwtToken);
    // if (!decoded) { /* redirect */ }

    // Fetch initial papers
    const backendApiUrl = process.env.BACKEND_API_URL || 'http://localhost:3000/api';
    const response = await axios.get(`${backendApiUrl}/papers/search-papers?page=1&limit=10`, {
      headers: {
        'x-auth-token': adminJwtToken,
      },
    });

    return {
      props: {
        initialPapers: response.data.papers,
        initialTotalCount: response.data.totalCount,
      },
    };
  } catch (error) {
    console.error('Error fetching initial dashboard data:', error);
    // If token is invalid or expired, redirect to login
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
      props: { error: error.response?.data?.message || 'Failed to load dashboard data.' },
    };
  }
}
