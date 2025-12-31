const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');

// Mock Mongoose models explicitly
jest.mock('../models/paper', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn().mockReturnThis() })), // Make findOne chainable
    findOneAndUpdate: jest.fn(() => ({ select: jest.fn().mockReturnThis() })), // Make findOneAndUpdate chainable
    create: jest.fn(),
    aggregate: jest.fn(() => ({ exec: jest.fn() })), // Make aggregate chainable with .exec()
    save: jest.fn(), // For instances
    find: jest.fn(() => ({ select: jest.fn().mockReturnThis() })), // Make find chainable
    findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn(),
  },
}));
jest.mock('../models/user', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn().mockReturnThis() })), // Make findOne chainable
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
    find: jest.fn(() => ({ select: jest.fn().mockReturnThis() })), // Make find chainable
  },
}));
jest.mock('../models/admin', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn().mockReturnThis() })), // Make findOne chainable
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn(),
  },
}));
jest.mock('../models/config', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn().mockReturnThis() })), // Make findOne chainable
    findOneAndUpdate: jest.fn(() => ({ select: jest.fn().mockReturnThis() })), // Make findOneAndUpdate chainable
    create: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

// Mock shared modules
jest.mock('../../shared/auth', () => ({
  __esModule: true,
  generateUserToken: jest.fn(() => 'mockUserToken'),
  verifyUserToken: jest.fn(() => ({ user: { id: 'testUserId' } })),
  generateAdminToken: jest.fn(() => 'mockAdminToken'),
  verifyAdminToken: jest.fn(() => ({ admin: { id: 'testAdminId' } })),
  hashPassword: jest.fn(() => 'hashedPassword123'),
  comparePassword: jest.fn(() => true),
}));

jest.mock('../../shared/config', () => ({
  __esModule: true,
  default: {
    preventDuplicateReads: false,
  },
}));

// Mock dotenv and winston
jest.mock('dotenv');
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
  }),
  format: {
    json: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

// Require mocked modules after jest.mock calls
const Paper = require('../models/paper').default;
const User = require('../models/user').default;
const Admin = require('../models/admin').default;
const Config = require('../models/config').default;
const { generateUserToken, verifyUserToken, generateAdminToken, verifyAdminToken, hashPassword, comparePassword } = require('../../shared/auth');
const sharedConfig = require('../../shared/config').default;

describe('Backend API Tests', () => {
  const mockPaperMetadata = {
    title: 'Test Paper',
    authors: ['Test Author'],
    abstract: 'Test Abstract',
    publishYear: 2023,
  };
  const mockRead = {
    user: 'testUserId',
    notes: 'Test Notes',
  };

  // Connect/Disconnect MongoDB before/after tests
  beforeAll(async () => {
    // Ensure Mongoose doesn't actually try to connect
    jest.spyOn(mongoose, 'connect').mockResolvedValue(true);
    // Mock process.env variables needed by server.js
    process.env.MONGO_URI = 'mongodb://localhost:27017/testdb';
    process.env.JWT_SECRET = 'testjwtsecret';
    process.env.JWT_SECRET_USER = 'testjwtsecretuser';
    process.env.JWT_SECRET_ADMIN = 'testjwtsecretadmin';
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'test'; // Set NODE_ENV to test to avoid HTTPS redirection

    // Ensure Config has a default value for tests
    Config.countDocuments.mockResolvedValue(0);
    Config.create.mockResolvedValue({ preventDuplicateReads: false });
    // Call server setup to mock the initial config creation in server.js
    require('../server');
  });

  afterAll(async () => {
    // Restore original console.error to avoid interfering with Jest's output
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock data for each test, chaining select where applicable
    Paper.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    Paper.findOneAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    Paper.create.mockResolvedValue(null);
    Paper.aggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([
      { metadata: [{ totalCount: 0 }], data: [] }
    ])});
    Paper.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    User.create.mockResolvedValue(null);
    User.findByIdAndDelete.mockResolvedValue(null);
    User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    Admin.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    Admin.create.mockResolvedValue(null);
    Config.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ preventDuplicateReads: false }) });
    Config.findOneAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue({ preventDuplicateReads: false }) });
    Config.countDocuments.mockResolvedValue(1);
  });

  describe('Paper Routes', () => {
    describe('POST /api/papers/mark-read', () => {
      it('should upsert a paper and add a read entry if not exists', async () => {
        Paper.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) }); // Paper does not exist
        Paper.create.mockImplementationOnce((data) => ({
          ...data,
          save: jest.fn().mockResolvedValue(true),
        }));

        const res = await request(app)
          .post('/api/papers/mark-read')
          .set('x-auth-token', 'mockUserToken')
          .send({ id: 'testPaperId', metadata: mockPaperMetadata, read: mockRead });

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toEqual('Paper marked as read successfully');
        expect(Paper.create).toHaveBeenCalledTimes(1);
        expect(Paper.create).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'testPaperId', metadata: mockPaperMetadata })
        );
      });

      it('should add a read entry to an existing paper', async () => {
        const existingPaper = { id: 'testPaperId', metadata: mockPaperMetadata, reads: [], save: jest.fn() };
        Paper.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(existingPaper) });

        const res = await request(app)
          .post('/api/papers/mark-read')
          .set('x-auth-token', 'mockUserToken')
          .send({ id: 'testPaperId', metadata: mockPaperMetadata, read: mockRead });

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toEqual('Paper marked as read successfully');
        expect(existingPaper.reads.length).toBe(1);
        expect(existingPaper.reads[0].user).toEqual('testUserId');
        expect(existingPaper.save).toHaveBeenCalledTimes(1);
      });

      it('should prevent duplicate read entries if configured', async () => {
        const existingPaper = {
          id: 'testPaperId',
          metadata: mockPaperMetadata,
          reads: [{ user: 'testUserId', timestamp: new Date(), notes: 'Existing Notes' }],
          save: jest.fn(),
        };
        Paper.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(existingPaper) });
        sharedConfig.preventDuplicateReads = true; // Set config to prevent duplicates

        const res = await request(app)
          .post('/api/papers/mark-read')
          .set('x-auth-token', 'mockUserToken')
          .send({ id: 'testPaperId', metadata: mockPaperMetadata, read: { user: 'testUserId', notes: 'Existing Notes' } });

        expect(res.statusCode).toEqual(409);
        expect(res.body.message).toEqual('Duplicate read entry prevented.');
        expect(existingPaper.save).not.toHaveBeenCalled();
      });

      it('should allow duplicate read entries if not configured to prevent', async () => {
        const existingPaper = {
          id: 'testPaperId',
          metadata: mockPaperMetadata,
          reads: [{ user: 'testUserId', timestamp: new Date(), notes: 'Existing Notes' }],
          save: jest.fn(),
        };
        Paper.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(existingPaper) });
        sharedConfig.preventDuplicateReads = false; // Set config to allow duplicates

        const res = await request(app)
          .post('/api/papers/mark-read')
          .set('x-auth-token', 'mockUserToken')
          .send({ id: 'testPaperId', metadata: mockPaperMetadata, read: { user: 'testUserId', notes: 'New Notes' } });

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toEqual('Paper marked as read successfully');
        expect(existingPaper.reads.length).toBe(2);
        expect(existingPaper.save).toHaveBeenCalledTimes(1);
      });

      it('should return 400 for invalid metadata', async () => {
        const res = await request(app)
          .post('/api/papers/mark-read')
          .set('x-auth-token', 'mockUserToken')
          .send({ id: 'testPaperId', metadata: { title: '' }, read: mockRead });

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('"title" is not allowed to be empty');
      });

      it('should return 401 if no token is provided', async () => {
        verifyUserToken.mockReturnValueOnce(null); // Explicitly deny token
        const res = await request(app)
          .post('/api/papers/mark-read')
          .send({ id: 'testPaperId', metadata: mockPaperMetadata, read: mockRead });

        expect(res.statusCode).toEqual(401);
        expect(res.body.message).toEqual('No token, authorization denied');
      });
    });

    describe('GET /api/papers/check-paper', () => {
      it('should return paper details if found', async () => {
        const paperWithReads = {
          id: 'testPaperId',
          metadata: mockPaperMetadata,
          reads: [
            { user: 'otherUser', timestamp: new Date(), notes: 'Read by someone else' },
            { _id: 'readEntry1', user: 'testUserId', timestamp: new Date(), notes: 'My Read' },
          ],
        };
        Paper.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(paperWithReads) });

        const res = await request(app)
          .get('/api/papers/check-paper?id=testPaperId&details=true')
          .set('x-auth-token', 'mockUserToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.id).toEqual('testPaperId');
        expect(res.body.readStatus).toEqual('read');
        expect(res.body.metadata.title).toEqual('Test Paper');
        expect(res.body.reads.length).toEqual(2);
      });

      it('should return readStatus unread if paper found but not read by user', async () => {
        const paperWithoutUserRead = {
          id: 'testPaperId',
          metadata: mockPaperMetadata,
          reads: [{ user: 'otherUser', timestamp: new Date(), notes: 'Read by someone else' }],
        };
        Paper.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(paperWithoutUserRead) });

        const res = await request(app)
          .get('/api/papers/check-paper?id=testPaperId')
          .set('x-auth-token', 'mockUserToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.id).toEqual('testPaperId');
        expect(res.body.readStatus).toEqual('unread');
        expect(res.body.reads).toBeUndefined(); // details=false by default
      });

      it('should return 404 if paper not found', async () => {
        Paper.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

        const res = await request(app)
          .get('/api/papers/check-paper?id=nonExistentPaper')
          .set('x-auth-token', 'mockUserToken');

        expect(res.statusCode).toEqual(404);
        expect(res.body.message).toEqual('Paper not found');
      });

      it('should return 400 for invalid input', async () => {
        const res = await request(app)
          .get('/api/papers/check-paper?details=invalid')
          .set('x-auth-token', 'mockUserToken');

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('"id" is required');
      });
    });

    describe('GET /api/papers/search-papers', () => {
      it('should return a list of papers with pagination', async () => {
        const mockPapers = [
          { id: 'p1', metadata: { title: 'Paper 1', publishYear: 2020 }, reads: [] },
          { id: 'p2', metadata: { title: 'Paper 2', publishYear: 2021 }, reads: [] },
        ];
        Paper.aggregate().exec.mockResolvedValueOnce([
          { metadata: [{ totalCount: 2 }], data: mockPapers },
        ]);

        const res = await request(app)
          .get('/api/papers/search-papers?page=1&limit=10')
          .set('x-auth-token', 'mockUserToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.totalCount).toEqual(2);
        expect(res.body.papers.length).toEqual(2);
        expect(Paper.aggregate).toHaveBeenCalledTimes(1);
      });

      it('should filter papers by keyword', async () => {
        const mockPapers = [
          { id: 'p1', metadata: { title: 'Keyword Paper', publishYear: 2020 }, reads: [] },
        ];
        Paper.aggregate().exec.mockResolvedValueOnce([
          { metadata: [{ totalCount: 1 }], data: mockPapers },
        ]);

        const res = await request(app)
          .get('/api/papers/search-papers?keyword=Keyword')
          .set('x-auth-token', 'mockUserToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.papers[0].metadata.title).toEqual('Keyword Paper');
        expect(Paper.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              $or: expect.arrayContaining([
                expect.objectContaining({ 'metadata.title': /Keyword/i }),
              ]),
            }),
          }),
        ]));
      });

      it('should filter papers by user', async () => {
        const mockPapers = [
          { id: 'p1', metadata: { title: 'User Paper', publishYear: 2020 }, reads: [{ user: 'testUser' }] },
        ];
        Paper.aggregate().exec.mockResolvedValueOnce([
          { metadata: [{ totalCount: 1 }], data: mockPapers },
        ]);

        const res = await request(app)
          .get('/api/papers/search-papers?user=testUser')
          .set('x-auth-token', 'mockUserToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.papers[0].metadata.title).toEqual('User Paper');
        expect(Paper.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
          expect.objectContaining({ $match: { 'reads.user': 'testUser' } }),
        ]));
      });

      it('should filter papers by publish year', async () => {
        const mockPapers = [
          { id: 'p1', metadata: { title: 'Year Paper', publishYear: 2022 }, reads: [] },
        ];
        Paper.aggregate().exec.mockResolvedValueOnce([
          { metadata: [{ totalCount: 1 }], data: mockPapers },
        ]);

        const res = await request(app)
          .get('/api/papers/search-papers?publishYear=2022')
          .set('x-auth-token', 'mockUserToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.papers[0].metadata.title).toEqual('Year Paper');
        expect(Paper.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
          expect.objectContaining({ $match: { 'metadata.publishYear': 2022 } }),
        ]));
      });

      it('should return 400 for invalid query parameters', async () => {
        const res = await request(app)
          .get('/api/papers/search-papers?limit=abc')
          .set('x-auth-token', 'mockUserToken');

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('"limit" must be a number');
      });
    });

    describe('DELETE /api/papers/mark-read (user undo)', () => {
      it('should remove a specific read entry for the user', async () => {
        const existingPaper = {
          id: 'testPaperId',
          metadata: mockPaperMetadata,
          reads: [
            { _id: 'readEntry1', user: 'testUserId', timestamp: new Date(), notes: 'My Read' },
            { _id: 'readEntry2', user: 'otherUser', timestamp: new Date(), notes: 'Other Read' },
          ],
        };
        Paper.findOneAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(existingPaper) });

        const res = await request(app)
          .delete('/api/papers/mark-read')
          .set('x-auth-token', 'mockUserToken')
          .send({ id: 'testPaperId', readEntryId: 'readEntry1' });

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toEqual('Read entry removed successfully');
        expect(Paper.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(Paper.findOneAndUpdate).toHaveBeenCalledWith(
          { id: 'testPaperId', 'reads._id': 'readEntry1', 'reads.user': 'testUserId' },
          { $pull: { reads: { _id: 'readEntry1', user: 'testUserId' } } },
          { new: true }
        );
      });

      it('should return 404 if paper or read entry not found for user', async () => {
        Paper.findOneAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

        const res = await request(app)
          .delete('/api/papers/mark-read')
          .set('x-auth-token', 'mockUserToken')
          .send({ id: 'nonExistentPaper', readEntryId: 'readEntry1' });

        expect(res.statusCode).toEqual(404);
        expect(res.body.message).toEqual('Paper or read entry not found for this user.');
      });

      it('should return 400 for invalid input', async () => {
        const res = await request(app)
          .delete('/api/papers/mark-read')
          .set('x-auth-token', 'mockUserToken')
          .send({ id: 'testPaperId' }); // Missing readEntryId

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('"readEntryId" is required');
      });
    });
  });

  describe('Admin Routes', () => {
    const mockAdminUsername = 'adminUser';
    const mockAdminPassword = 'adminPass';
    const mockAdmin = {
      _id: 'adminId',
      adminUsername: mockAdminUsername,
      comparePassword: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(true),
    };
    const mockUser = { _id: 'userId1', username: 'testUser', passwordHash: 'hashedPass' };

    beforeEach(() => {
      // Reset Admin.findOne mock for admin routes
      Admin.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) }); // Default for not found
      Admin.findOne.mockImplementationOnce((query) => {
        if (query && query.adminUsername === mockAdminUsername) {
          return { select: jest.fn().mockResolvedValue(mockAdmin) };
        }
        return { select: jest.fn().mockResolvedValue(null) };
      });
      // Resetting instance mocks for each admin test
      mockAdmin.comparePassword.mockResolvedValue(true);
      mockAdmin.save.mockResolvedValue(true);
    });

    describe('POST /api/admin/login', () => {
      it('should successfully log in admin and return token', async () => {
        generateAdminToken.mockReturnValueOnce('mockAdminToken');

        const res = await request(app)
          .post('/api/admin/login')
          .send({ adminUsername: mockAdminUsername, password: mockAdminPassword });

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toEqual('Admin logged in successfully');
        expect(res.body.token).toEqual('mockAdminToken');
        expect(Admin.findOne).toHaveBeenCalledWith({ adminUsername: mockAdminUsername });
        expect(mockAdmin.comparePassword).toHaveBeenCalledWith(mockAdminPassword);
        expect(mockAdmin.save).toHaveBeenCalledTimes(1); // lastAccess updated
        expect(generateAdminToken).toHaveBeenCalledWith({ admin: { id: 'adminId' } });
      });

      it('should return 400 for invalid credentials (username)', async () => {
        const res = await request(app)
          .post('/api/admin/login')
          .send({ adminUsername: 'wrongUser', password: mockAdminPassword });

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toEqual('Invalid Credentials');
      });

      it('should return 400 for invalid credentials (password)', async () => {
        Admin.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockAdmin) });
        mockAdmin.comparePassword.mockResolvedValueOnce(false);

        const res = await request(app)
          .post('/api/admin/login')
          .send({ adminUsername: mockAdminUsername, password: 'wrongPass' });

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toEqual('Invalid Credentials');
      });

      it('should return 400 for invalid input', async () => {
        const res = await request(app)
          .post('/api/admin/login')
          .send({ adminUsername: mockAdminUsername }); // Missing password

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('"password" is required');
      });
    });

    describe('Admin Authentication Middleware', () => {
      it('should return 401 if no token is provided', async () => {
        verifyAdminToken.mockReturnValueOnce(null); // Ensure token is invalid
        const res = await request(app).get('/api/admin/users');
        expect(res.statusCode).toEqual(401);
        expect(res.body.message).toEqual('No token, authorization denied');
      });

      it('should return 401 if token is invalid', async () => {
        verifyAdminToken.mockReturnValueOnce(null); // Ensure token is invalid
        const res = await request(app).get('/api/admin/users').set('x-auth-token', 'invalidToken');
        expect(res.statusCode).toEqual(401);
        expect(res.body.message).toEqual('Token is not valid or not an admin token');
      });
    });

    describe('GET /api/admin/users', () => {
      it('should return a list of users', async () => {
        User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([mockUser]) });

        const res = await request(app)
          .get('/api/admin/users')
          .set('x-auth-token', 'mockAdminToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.length).toEqual(1);
        expect(res.body[0].username).toEqual('testUser');
        expect(res.body[0].passwordHash).toBeUndefined(); // passwordHash should be excluded
        expect(User.find).toHaveBeenCalledTimes(1);
        expect(User.find).toHaveBeenCalledWith({});
      });
    });

    describe('POST /api/admin/users', () => {
      it('should create a new user', async () => {
        User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) }); // User does not exist
        User.create.mockImplementationOnce((data) => ({
          ...data,
          _id: 'newUserId',
          username: data.username,
          save: jest.fn().mockResolvedValue(true),
        }));

        const res = await request(app)
          .post('/api/admin/users')
          .set('x-auth-token', 'mockAdminToken')
          .send({ username: 'newUser', password: 'newPassword123' });

        expect(res.statusCode).toEqual(201);
        expect(res.body.message).toEqual('User created successfully');
        expect(User.findOne).toHaveBeenCalledWith({ username: 'newUser' });
        expect(User.create).toHaveBeenCalledTimes(1);
        expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
          username: 'newUser',
          passwordHash: 'hashedPassword123', // Should be hashed by mock
        }));
      });

      it('should return 409 if username already exists', async () => {
        User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

        const res = await request(app)
          .post('/api/admin/users')
          .set('x-auth-token', 'mockAdminToken')
          .send({ username: 'testUser', password: 'newPassword123' });

        expect(res.statusCode).toEqual(409);
        expect(res.body.message).toEqual('User with that username already exists');
        expect(User.create).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid input', async () => {
        const res = await request(app)
          .post('/api/admin/users')
          .set('x-auth-token', 'mockAdminToken')
          .send({ username: 'short', password: '123' }); // Short password

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('"password" length must be at least 6 characters long');
      });
    });

    describe('DELETE /api/admin/users/:id', () => {
      it('should delete a user', async () => {
        User.findByIdAndDelete.mockResolvedValueOnce(mockUser);

        const res = await request(app)
          .delete('/api/admin/users/userId1')
          .set('x-auth-token', 'mockAdminToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toEqual('User deleted successfully');
        expect(User.findByIdAndDelete).toHaveBeenCalledTimes(1);
        expect(User.findByIdAndDelete).toHaveBeenCalledWith('userId1');
      });

      it('should return 404 if user not found', async () => {
        User.findByIdAndDelete.mockResolvedValueOnce(null);

        const res = await request(app)
          .delete('/api/admin/users/nonExistentUser')
          .set('x-auth-token', 'mockAdminToken');

        expect(res.statusCode).toEqual(404);
        expect(res.body.message).toEqual('User not found');
      });
    });

    describe('DELETE /api/admin/mark-read', () => {
      it('should remove a specific read entry for any user by admin', async () => {
        const existingPaper = {
          id: 'testPaperId',
          metadata: mockPaperMetadata,
          reads: [
            { _id: 'readEntry1', user: 'testUserId', timestamp: new Date(), notes: 'My Read' },
            { _id: 'readEntry2', user: 'otherUser', timestamp: new Date(), notes: 'Other Read' },
          ],
        };
        Paper.findOneAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(existingPaper) });

        const res = await request(app)
          .delete('/api/admin/mark-read')
          .set('x-auth-token', 'mockAdminToken')
          .send({ paperId: 'testPaperId', readEntryId: 'readEntry1' });

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toEqual('Read entry removed successfully by admin');
        expect(Paper.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(Paper.findOneAndUpdate).toHaveBeenCalledWith(
          { id: 'testPaperId', 'reads._id': 'readEntry1' },
          { $pull: { reads: { _id: 'readEntry1' } } },
          { new: true }
        );
      });

      it('should return 404 if paper or read entry not found', async () => {
        Paper.findOneAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

        const res = await request(app)
          .delete('/api/admin/mark-read')
          .set('x-auth-token', 'mockAdminToken')
          .send({ paperId: 'nonExistentPaper', readEntryId: 'readEntry1' });

        expect(res.statusCode).toEqual(404);
        expect(res.body.message).toEqual('Paper or read entry not found.');
      });

      it('should return 400 for invalid input', async () => {
        const res = await request(app)
          .delete('/api/admin/mark-read')
          .set('x-auth-token', 'mockAdminToken')
          .send({ paperId: 'testPaperId' }); // Missing readEntryId

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('"readEntryId" is required');
      });
    });

    describe('GET /api/admin/config', () => {
      it('should return the current configuration', async () => {
        Config.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ preventDuplicateReads: true }) });

        const res = await request(app)
          .get('/api/admin/config')
          .set('x-auth-token', 'mockAdminToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.preventDuplicateReads).toEqual(true);
        expect(Config.findOne).toHaveBeenCalledTimes(1);
        expect(Config.findOne).toHaveBeenCalledWith({});
      });

      it('should return default config if no config found', async () => {
        Config.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
        Config.countDocuments.mockResolvedValueOnce(0); // Simulate no config in DB
        Config.create.mockResolvedValueOnce({ preventDuplicateReads: false }); // Default created

        const res = await request(app)
          .get('/api/admin/config')
          .set('x-auth-token', 'mockAdminToken');

        expect(res.statusCode).toEqual(200);
        expect(res.body.preventDuplicateReads).toEqual(false);
      });
    });

    describe('POST /api/admin/config', () => {
      it('should update the configuration', async () => {
        Config.findOneAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue({ preventDuplicateReads: true }) });

        const res = await request(app)
          .post('/api/admin/config')
          .set('x-auth-token', 'mockAdminToken')
          .send({ preventDuplicateReads: true });

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toEqual('Config updated successfully');
        expect(res.body.preventDuplicateReads).toEqual(true);
        expect(Config.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(Config.findOneAndUpdate).toHaveBeenCalledWith(
          {},
          { preventDuplicateReads: true },
          { new: true, upsert: true }
        );
      });

      it('should return 400 for invalid input', async () => {
        const res = await request(app)
          .post('/api/admin/config')
          .set('x-auth-token', 'mockAdminToken')
          .send({ preventDuplicateReads: 'invalid' });

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('"preventDuplicateReads" must be a boolean');
      });
    });
  });
});
