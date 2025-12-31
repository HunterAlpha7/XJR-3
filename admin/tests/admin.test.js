import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { useRouter } from 'next/router';
import axios from 'axios';
import Cookies from 'js-cookie';

// Mock Next.js modules
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));
jest.mock('next/image', () => function MockImage({ src, alt }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} />;
});
jest.mock('axios');
jest.mock('js-cookie');

// Mock global Date for consistent snapshots with timestamps
const MOCK_DATE = new Date('2025-09-26T10:00:00.000Z');
const MOCK_LOCAL_DATE_FORMATTED = 'Formatted: 2025-09-26T10:00:00.000Z'; // Simplified for testing

global.Date = jest.fn(() => MOCK_DATE);
global.Date.toISOString = MOCK_DATE.toISOString;
global.Date.now = jest.fn(() => MOCK_DATE.getTime());

// Mock Intl.DateTimeFormat for consistent date formatting
global.Intl = {
  DateTimeFormat: jest.fn(() => ({
    format: jest.fn((date) => `Formatted: ${date.toISOString()}`),
  })),
};

// Mock window.alert and window.confirm for client-side interactions
global.alert = jest.fn();
global.confirm = jest.fn(() => true);

describe('Admin Pages', () => {
  let mockRouter;
  const NEXT_PUBLIC_BACKEND_API_URL = 'http://localhost:3000/api';

  beforeAll(() => {
    process.env.NEXT_PUBLIC_BACKEND_API_URL = NEXT_PUBLIC_BACKEND_API_URL;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter = {
      push: jest.fn(),
    };
    useRouter.mockReturnValue(mockRouter);

    Cookies.get.mockReturnValue(undefined); // Default to no token
    Cookies.remove.mockImplementation(jest.fn());
    axios.post.mockResolvedValue({ data: { token: 'mockAdminJwt' } });
    axios.get.mockResolvedValue({ data: { papers: [], totalCount: 0, preventDuplicateReads: false } }); // Default for dashboard/tools
    axios.delete.mockResolvedValue({ data: { message: 'Success' } });
    global.alert.mockClear();
    global.confirm.mockClear();
  });

  // Test Login Page
  describe('Login Page (/admin/pages/index.js)', () => {
    const AdminLogin = require('../pages/index').default;

    it('renders login form correctly', () => {
      render(<AdminLogin />);
      expect(screen.getByLabelText(/Admin Username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Login/i })).toBeInTheDocument();
    });

    it('handles successful login and redirects to dashboard', async () => {
      render(<AdminLogin />);

      await userEvent.type(screen.getByLabelText(/Admin Username/i), 'testadmin');
      await userEvent.type(screen.getByLabelText(/Password/i), 'testpassword');
      await userEvent.click(screen.getByRole('button', { name: /Login/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          `${NEXT_PUBLIC_BACKEND_API_URL}/admin/login`,
          { adminUsername: 'testadmin', password: 'testpassword' }
        );
        expect(Cookies.set).toHaveBeenCalledWith('adminJwtToken', 'mockAdminJwt', { expires: 1 / 24 });
        expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('displays error message on failed login', async () => {
      axios.post.mockRejectedValue({
        response: { data: { message: 'Invalid Credentials' } },
      });

      render(<AdminLogin />);

      await userEvent.type(screen.getByLabelText(/Admin Username/i), 'wrongadmin');
      await userEvent.type(screen.getByLabelText(/Password/i), 'wrongpassword');
      await userEvent.click(screen.getByRole('button', { name: /Login/i }));

      await waitFor(() => {
        expect(screen.getByText(/Invalid Credentials/i)).toBeInTheDocument();
      });
    });
  });

  // Test Dashboard Page
  describe('Dashboard Page (/admin/pages/dashboard.js)', () => {
    const Dashboard = require('../pages/dashboard').default;

    it('redirects to login if no admin token found in getServerSideProps', async () => {
      // getServerSideProps runs in Node.js environment, so we mock context.req.cookies
      const context = { req: { cookies: {} }, res: { setHeader: jest.fn() } };
      const { redirect } = await Dashboard.getServerSideProps(context);

      expect(redirect).toEqual({
        destination: '/',
        permanent: false,
      });
    });

    it('fetches and displays papers on initial load (SSR)', async () => {
      const mockPapers = [
        { id: 'p1', metadata: { title: 'Paper One', publishYear: 2023 }, reads: [{ user: 'u1', timestamp: MOCK_DATE }] },
      ];
      axios.get.mockResolvedValueOnce({ data: { papers: mockPapers, totalCount: 1 } });
      Cookies.get.mockReturnValue('mockAdminJwt'); // Simulate logged-in client-side

      const context = { req: { cookies: { adminJwtToken: 'mockAdminJwt' } }, res: { setHeader: jest.fn() } };
      const { props } = await Dashboard.getServerSideProps(context);

      render(<Dashboard {...props} />);

      expect(screen.getByText(/Paper One/i)).toBeInTheDocument();
      expect(screen.getByText(/2023/i)).toBeInTheDocument();
      expect(screen.getByText(/1/i)).toBeInTheDocument(); // Reads Count
      expect(screen.getByText(MOCK_LOCAL_DATE_FORMATTED)).toBeInTheDocument();
      expect(screen.getByText(/seconds ago/i)).toBeInTheDocument();
    });

    it('allows client-side searching of papers', async () => {
      const mockPapers = [
        { id: 'p2', metadata: { title: 'Searched Paper', publishYear: 2024 }, reads: [] },
      ];
      axios.get.mockResolvedValueOnce({ data: { papers: mockPapers, totalCount: 1 } }); // For search
      Cookies.get.mockReturnValue('mockAdminJwt');

      const context = { req: { cookies: { adminJwtToken: 'mockAdminJwt' } }, res: { setHeader: jest.fn() } };
      const { props } = await Dashboard.getServerSideProps(context);

      render(<Dashboard {...props} />);

      await userEvent.type(screen.getByPlaceholderText(/Keyword/i), 'Searched');
      await userEvent.click(screen.getByRole('button', { name: /Search/i }));

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining(`${NEXT_PUBLIC_BACKEND_API_URL}/papers/search-papers?page=1&limit=10&keyword=Searched`),
          expect.any(Object)
        );
        expect(screen.getByText(/Searched Paper/i)).toBeInTheDocument();
      });
    });
  });

  // Test User Management Page
  describe('User Management Page (/admin/pages/users.js)', () => {
    const UserManagement = require('../pages/users').default;

    it('redirects to login if no admin token found in getServerSideProps', async () => {
      const context = { req: { cookies: {} }, res: { setHeader: jest.fn() } };
      const { redirect } = await UserManagement.getServerSideProps(context);
      expect(redirect).toEqual({
        destination: '/',
        permanent: false,
      });
    });

    it('fetches and displays users on initial load (SSR)', async () => {
      const mockUsers = [
        { _id: 'u1', username: 'user1', lastAccess: MOCK_DATE.toISOString() },
      ];
      axios.get.mockResolvedValueOnce({ data: mockUsers });
      Cookies.get.mockReturnValue('mockAdminJwt');

      const context = { req: { cookies: { adminJwtToken: 'mockAdminJwt' } }, res: { setHeader: jest.fn() } };
      const { props } = await UserManagement.getServerSideProps(context);

      render(<UserManagement {...props} />);

      expect(screen.getByText(/user1/i)).toBeInTheDocument();
      expect(screen.getByText(MOCK_LOCAL_DATE_FORMATTED)).toBeInTheDocument();
    });

    it('allows adding a new user', async () => {
      axios.post.mockResolvedValueOnce({ data: { message: 'User created successfully' } });
      axios.get.mockResolvedValueOnce({ data: [] }); // After adding, fetch empty list
      Cookies.get.mockReturnValue('mockAdminJwt');

      const context = { req: { cookies: { adminJwtToken: 'mockAdminJwt' } }, res: { setHeader: jest.fn() } };
      const { props } = await UserManagement.getServerSideProps(context);

      render(<UserManagement {...props} />);

      await userEvent.type(screen.getByPlaceholderText(/Username/i), 'newuser');
      await userEvent.type(screen.getByPlaceholderText(/Password/i), 'newpass123');
      await userEvent.click(screen.getByRole('button', { name: /Add User/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          `${NEXT_PUBLIC_BACKEND_API_URL}/admin/users`,
          { username: 'newuser', password: 'newpass123' },
          expect.any(Object)
        );
        expect(axios.get).toHaveBeenCalledWith(
          `${NEXT_PUBLIC_BACKEND_API_URL}/admin/users`,
          expect.any(Object)
        ); // Refresh
      });
    });

    it('allows deleting a user', async () => {
      const mockUsers = [
        { _id: 'u1', username: 'user1', lastAccess: MOCK_DATE.toISOString() },
      ];
      axios.get.mockResolvedValueOnce({ data: mockUsers }); // Initial fetch
      axios.delete.mockResolvedValueOnce({ data: { message: 'User deleted successfully' } });
      axios.get.mockResolvedValueOnce({ data: [] }); // After delete, fetch empty list
      Cookies.get.mockReturnValue('mockAdminJwt');

      const context = { req: { cookies: { adminJwtToken: 'mockAdminJwt' } }, res: { setHeader: jest.fn() } };
      const { props } = await UserManagement.getServerSideProps(context);

      render(<UserManagement {...props} />);

      await waitFor(() => expect(screen.getByText(/user1/i)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: /Delete/i }));

      await waitFor(() => {
        expect(global.confirm).toHaveBeenCalled();
        expect(axios.delete).toHaveBeenCalledWith(
          `${NEXT_PUBLIC_BACKEND_API_URL}/admin/users/u1`,
          expect.any(Object)
        );
        expect(axios.get).toHaveBeenCalledTimes(2); // Initial fetch + refresh
      });
    });
  });

  // Test Tools Page
  describe('Tools Page (/admin/pages/tools.js)', () => {
    const AdminTools = require('../pages/tools').default;
    const mockPaper = {
      id: 'p1',
      metadata: { title: 'Tool Paper', publishYear: 2023, authors: ['Author A'], abstract: 'Abstract A' },
      reads: [
        { _id: 'r1', user: 'u1', timestamp: MOCK_DATE.toISOString(), notes: 'Note 1' },
        { _id: 'r2', user: 'u2', timestamp: MOCK_DATE.toISOString(), notes: 'Note 2' },
      ],
    };

    it('redirects to login if no admin token found in getServerSideProps', async () => {
      const context = { req: { cookies: {} }, res: { setHeader: jest.fn() } };
      const { redirect } = await AdminTools.getServerSideProps(context);
      expect(redirect).toEqual({
        destination: '/',
        permanent: false,
      });
    });

    it('fetches and displays papers and config on initial load (SSR)', async () => {
      axios.get
        .mockResolvedValueOnce({ data: { papers: [mockPaper], totalCount: 1 } }) // Papers
        .mockResolvedValueOnce({ data: { preventDuplicateReads: true } }); // Config
      Cookies.get.mockReturnValue('mockAdminJwt');

      const context = { req: { cookies: { adminJwtToken: 'mockAdminJwt' } }, res: { setHeader: jest.fn() } };
      const { props } = await AdminTools.getServerSideProps(context);

      render(<AdminTools {...props} />);

      expect(screen.getByText(/Tool Paper/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Prevent Duplicate Reads/i)).toBeChecked();
    });

    it('allows toggling preventDuplicateReads setting', async () => {
      axios.get
        .mockResolvedValueOnce({ data: { papers: [], totalCount: 0 } }) // Papers for initial load
        .mockResolvedValueOnce({ data: { preventDuplicateReads: false } }); // Initial config
      axios.post.mockResolvedValueOnce({ data: { preventDuplicateReads: true } }); // Update config
      Cookies.get.mockReturnValue('mockAdminJwt');

      const context = { req: { cookies: { adminJwtToken: 'mockAdminJwt' } }, res: { setHeader: jest.fn() } };
      const { props } = await AdminTools.getServerSideProps(context);

      render(<AdminTools {...props} />);

      await waitFor(() => expect(screen.getByLabelText(/Prevent Duplicate Reads/i)).not.toBeChecked());
      await userEvent.click(screen.getByLabelText(/Prevent Duplicate Reads/i));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          `${NEXT_PUBLIC_BACKEND_API_URL}/admin/config`,
          { preventDuplicateReads: true },
          expect.any(Object)
        );
        expect(screen.getByLabelText(/Prevent Duplicate Reads/i)).toBeChecked();
      });
    });

    it('allows deleting a read entry by admin', async () => {
      axios.get
        .mockResolvedValueOnce({ data: { papers: [mockPaper], totalCount: 1 } }) // Papers for initial load
        .mockResolvedValueOnce({ data: { preventDuplicateReads: false } }); // Config for initial load
      axios.delete.mockResolvedValueOnce({ data: { message: 'Read entry deleted successfully by admin' } });
      axios.get
        .mockResolvedValueOnce({ data: { papers: [], totalCount: 0 } }) // Papers after delete (refresh)
        .mockResolvedValueOnce({ data: { preventDuplicateReads: false } }); // Config after delete (refresh)
      Cookies.get.mockReturnValue('mockAdminJwt');

      const context = { req: { cookies: { adminJwtToken: 'mockAdminJwt' } }, res: { setHeader: jest.fn() } };
      const { props } = await AdminTools.getServerSideProps(context);

      render(<AdminTools {...props} />);

      await waitFor(() => expect(screen.getByText(/Tool Paper/i)).toBeInTheDocument());

      await userEvent.click(screen.getByRole('button', { name: /Expand/i }));

      await waitFor(() => expect(screen.getByText(/Note 1/i)).toBeInTheDocument());
      await userEvent.click(screen.getAllByRole('button', { name: /Delete/i })[0]); // Click first delete button

      await waitFor(() => {
        expect(global.confirm).toHaveBeenCalled();
        expect(axios.delete).toHaveBeenCalledWith(
          `${NEXT_PUBLIC_BACKEND_API_URL}/admin/mark-read`,
          expect.objectContaining({
            data: { paperId: 'p1', readEntryId: 'r1' },
          })
        );
        expect(global.alert).toHaveBeenCalledWith('Read entry deleted successfully!');
        // Expect refresh to be called
        expect(axios.get).toHaveBeenCalledTimes(4); // 2 for initial SSR, 2 for client-side refresh
      });
    });

    it('allows exporting papers to CSV', async () => {
      axios.get
        .mockResolvedValueOnce({ data: { papers: [mockPaper], totalCount: 1 } }) // Papers for initial load
        .mockResolvedValueOnce({ data: { preventDuplicateReads: false } }) // Config for initial load
        .mockResolvedValueOnce({ data: { papers: [mockPaper], totalCount: 1 } }); // Papers for CSV export
      Cookies.get.mockReturnValue('mockAdminJwt');

      const context = { req: { cookies: { adminJwtToken: 'mockAdminJwt' } }, res: { setHeader: jest.fn() } };
      const { props } = await AdminTools.getServerSideProps(context);

      render(<AdminTools {...props} />);

      await userEvent.click(screen.getByRole('button', { name: /Export All Papers to CSV/i }));

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          `${NEXT_PUBLIC_BACKEND_API_URL}/papers/search-papers?limit=10000`,
          expect.any(Object)
        );
        expect(global.alert).toHaveBeenCalledWith('Papers exported to CSV successfully!');
      });
    });
  });
});
