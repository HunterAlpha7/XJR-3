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
// --- End Utility functions ---

export default function UserManagement({ initialUsers, error }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers || []);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [addError, setAddError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (error === 'Authentication failed') {
      router.push('/'); // Redirect to login if not authenticated
    } else if (error) {
      console.error('User Management initial error:', error);
    }
  }, [error, router]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const adminJwtToken = Cookies.get('adminJwtToken');
      if (!adminJwtToken) {
        router.push('/');
        return;
      }

      const response = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/admin/users`, {
        headers: {
          'x-auth-token': adminJwtToken,
        },
      });
      setUsers(response.data);
    } catch (err) {
      console.error('Error fetching users:', err);
      if (err.response?.status === 401) {
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddError('');
    try {
      const adminJwtToken = Cookies.get('adminJwtToken');
      if (!adminJwtToken) {
        router.push('/');
        return;
      }

      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/admin/users`, {
        username: newUsername,
        password: newPassword,
      }, {
        headers: {
          'x-auth-token': adminJwtToken,
        },
      });
      setNewUsername('');
      setNewPassword('');
      await fetchUsers(); // Refresh user list
    } catch (err) {
      setAddError(err.response?.data?.message || 'Failed to add user.');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) {
      return;
    }

    setDeleteError('');
    try {
      const adminJwtToken = Cookies.get('adminJwtToken');
      if (!adminJwtToken) {
        router.push('/');
        return;
      }

      await axios.delete(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/admin/users/${userId}`, {
        headers: {
          'x-auth-token': adminJwtToken,
        },
      });
      await fetchUsers(); // Refresh user list
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete user.');
    }
  };

  return (
    <div className="container mt-5">
      <Head>
        <title>User Management - XJR-3</title>
      </Head>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3">User Management</h1>
        <Image src="/logo.svg" alt="XJR-3 Logo" width={40} height={40} />
        <button onClick={() => {
          Cookies.remove('adminJwtToken');
          router.push('/');
        }} className="btn btn-danger">Logout</button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Add New User Form */}
      <div className="card p-3 mb-4">
        <h2 className="h5 card-title">Add New User</h2>
        <form onSubmit={handleAddUser}>
          <div className="row">
            <div className="col-md-5 mb-2">
              <input
                type="text"
                className="form-control"
                placeholder="Username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
              />
            </div>
            <div className="col-md-5 mb-2">
              <input
                type="password"
                className="form-control"
                placeholder="Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="col-md-2 mb-2">
              <button type="submit" className="btn btn-success btn-block" disabled={loading}>Add User</button>
            </div>
          </div>
          {addError && <div className="alert alert-danger mt-2">{addError}</div>}
        </form>
      </div>

      {/* User List Table */}
      <div className="card p-3">
        <h2 className="h5 card-title">All Users ({users.length})</h2>
        <div className="table-responsive">
          <table className="table table-hover table-sm">
            <thead>
              <tr>
                <th>Username</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length > 0 ? (
                users.map((user) => (
                  <tr key={user._id}>
                    <td>{user.username}</td>
                    <td>
                      {user.lastAccess ? getLocalFormattedTimestamp(user.lastAccess) : 'N/A'}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteUser(user._id)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="text-center">{loading ? 'Loading users...' : 'No users found.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {deleteError && <div className="alert alert-danger mt-3">{deleteError}</div>}
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
    // In a real app, you'd decode and validate it using verifyAdminToken from shared/auth
    // const decoded = verifyAdminToken(adminJwtToken);
    // if (!decoded) { /* redirect */ }

    const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3000/api';
    const response = await axios.get(`${backendApiUrl}/admin/users`, {
      headers: {
        'x-auth-token': adminJwtToken,
      },
    });

    return {
      props: {
        initialUsers: response.data,
      },
    };
  } catch (error) {
    console.error('Error fetching initial user data:', error);
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
      props: { error: error.response?.data?.message || 'Failed to load user data.' },
    };
  }
}
