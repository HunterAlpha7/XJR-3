import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import axios from 'axios';
import Cookies from 'js-cookie';

export default function AdminLogin() {
  const [adminUsername, setAdminUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await axios.post('/api/admin/login', { adminUsername, password });
      Cookies.set('adminJwtToken', response.data.token, { expires: 1 / 24 }); // 1 hour expiry
      router.push('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center min-vh-100 bg-light">
      <Head>
        <title>Admin Login - XJR-3</title>
      </Head>
      <div className="card p-4 shadow-lg" style={{ maxWidth: '400px', width: '100%' }}>
        <div className="text-center mb-4">
          <Image src="/logo.svg" alt="XJR-3 Logo" width={64} height={64} />
          <h1 className="h4 mt-2">Admin Login</h1>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group mb-3">
            <label htmlFor="adminUsername">Admin Username</label>
            <input
              type="text"
              className="form-control"
              id="adminUsername"
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group mb-4">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              className="form-control"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="alert alert-danger mb-3">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
