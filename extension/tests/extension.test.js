/* eslint-disable no-undef */

// Mock browser API and global objects
const mockBrowserApi = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
  runtime: {
    onMessage: {
      addListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
    onStartup: {
      addListener: jest.fn(),
    },
  },
  alarms: {
    onAlarm: {
      addListener: jest.fn(),
    },
    create: jest.fn(),
  },
};

// Mock global `chrome` and `browser` objects to use our mock
global.chrome = mockBrowserApi;
global.browser = mockBrowserApi;

// Mock `fetch` API
global.fetch = jest.fn();

// Mock DOM elements and methods for content.js and popup.js
const mockDocument = {
  querySelectorAll: jest.fn(() => []),
  querySelector: jest.fn(() => null),
  createElement: jest.fn((tagName) => {
    const element = {
      tagName,
      id: '',
      className: '',
      style: {},
      innerText: '',
      innerHTML: '',
      value: '',
      checked: false,
      getAttribute: jest.fn(),
      setAttribute: jest.fn(),
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      getBoundingClientRect: jest.fn(() => ({ bottom: 0, left: 0 }))
    };
    if (tagName === 'input') {
      element.type = 'text';
    } else if (tagName === 'table') {
      element.insertRow = jest.fn(() => mockDocument.createElement('tr'));
    } else if (tagName === 'tr') {
      element.insertCell = jest.fn(() => mockDocument.createElement('td'));
    }
    return element;
  }),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  },
  getElementById: jest.fn((id) => {
    if (id === 'xjr3-tooltip') {
      return mockDocument.createElement('div'); // Return a new element if not found in current DOM state
    } else if (id === 'login-section') {
      return { style: {} };
    } else if (id === 'dashboard-section') {
      return { style: {} };
    } else if (id === 'login-form') {
      return { addEventListener: jest.fn(), username: { value: '' }, password: { value: '' } };
    } else if (id === 'login-message') {
      return { textContent: '' };
    } else if (id === 'logout-button') {
      return { addEventListener: jest.fn() };
    } else if (id === 'search-form') {
      return { addEventListener: jest.fn(), keyword: { value: '' }, user: { value: '' }, publishYear: { value: '' } };
    } else if (id === 'papers-table-body') {
      return mockDocument.createElement('tbody');
    } else if (id === 'papers-message') {
      return { style: {}, textContent: '' };
    } else if (id === 'load-more-button') {
      return { style: {}, addEventListener: jest.fn() };
    }
    return null;
  }),
  addEventListener: jest.fn(),
};

global.document = mockDocument;

global.window = {
  location: { href: 'http://localhost/' },
  scrollY: 0,
  scrollX: 0,
  confirm: jest.fn(() => true),
  prompt: jest.fn(() => ''),
};

// Mock Intl.DateTimeFormat for consistent date formatting
global.Intl = {
  DateTimeFormat: jest.fn(() => ({
    format: jest.fn((date) => `Formatted: ${date.toISOString()}`),
  })),
};

describe('Extension Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks for each test
    mockBrowserApi.storage.local.get.mockResolvedValue({});
    mockBrowserApi.storage.local.set.mockResolvedValue(true);
    mockBrowserApi.storage.local.remove.mockResolvedValue(true);
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
      status: 200,
    });
    mockDocument.querySelectorAll.mockReturnValue([]);
    mockDocument.querySelector.mockReturnValue(null);
    mockDocument.createElement.mockClear();
    mockDocument.getElementById.mockClear();
    mockDocument.body.appendChild.mockClear();
    global.window.confirm.mockReturnValue(true);
    global.window.prompt.mockReturnValue('');
    global.Intl.DateTimeFormat.mockClear();
  });

  describe('content.js', () => {
    const { extractPaperMetadata, showTooltip, checkPaperAndDisplayStatus } = require('../content');

    it('should extract metadata from meta tags', () => {
      mockDocument.querySelectorAll.mockReturnValueOnce([
        { getAttribute: (attr) => (attr === 'name' ? 'citation_title' : 'Test Title') },
        { getAttribute: (attr) => (attr === 'name' ? 'citation_doi' : '10.1234/test') },
      ]);
      const metadata = extractPaperMetadata();
      expect(metadata.metadata.title).toEqual('Test Title');
      expect(metadata.id).toEqual('10.1234/test');
    });

    it('should show a tooltip', () => {
      const mockElement = mockDocument.createElement('div');
      mockElement.getBoundingClientRect.mockReturnValue({ bottom: 100, left: 50 });
      showTooltip(mockElement, 'Test Message');
      expect(mockDocument.body.appendChild).toHaveBeenCalled();
      expect(mockDocument.getElementById('xjr3-tooltip').innerText).toEqual('Test Message');
    });

    it('should check paper status and show unread tooltip if paper not found', async () => {
      mockBrowserApi.storage.local.get.mockResolvedValue({ jwtToken: 'testJwt', userId: 'testUser' });
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: jest.fn().mockResolvedValue({ message: 'Paper not found' }),
      });

      mockDocument.querySelector.mockReturnValueOnce({ innerText: 'Dummy Title' }); // For extractPaperMetadata
      global.window.location.href = 'http://example.com/dummy-id';

      await checkPaperAndDisplayStatus();
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/check-paper?id=http%3A%2F%2Fexample.com%2Fdummy-id'), expect.any(Object));
      // Expect showTooltip to be called, assuming it gets mocked
    });
  });

  describe('popup.js', () => {
    let popup;

    beforeEach(() => {
      // Mock specific elements that popup.js tries to access
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'login-section') return { style: {} };
        if (id === 'dashboard-section') return { style: {} };
        if (id === 'login-form') return { addEventListener: jest.fn(), username: { value: 'testUser' }, password: { value: 'testPass' } };
        if (id === 'login-message') return { textContent: '' };
        if (id === 'logout-button') return { addEventListener: jest.fn() };
        if (id === 'search-form') return { addEventListener: jest.fn(), searchKeyword: { value: '' }, searchUser: { value: '' }, searchPublishYear: { value: '' } };
        if (id === 'papers-table-body') return mockDocument.createElement('tbody');
        if (id === 'papers-message') return { style: {}, textContent: '' };
        if (id === 'load-more-button') return { style: {}, addEventListener: jest.fn() };
        return null;
      });

      // Re-require popup.js to get fresh references to mocked DOM elements
      jest.resetModules();
      popup = require('../popup');
    });

    it('should display dashboard if logged in', async () => {
      mockBrowserApi.storage.local.get.mockResolvedValue({ jwtToken: 'adminToken', userId: 'adminUser' });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ papers: [], totalCount: 0 }),
        status: 200,
      });

      await popup.checkLoginStatus(); // Assume checkLoginStatus is exposed or called on DOMContentLoaded

      // Expect dashboard to be visible
      expect(mockDocument.getElementById('login-section').style.display).toEqual('none');
      expect(mockDocument.getElementById('dashboard-section').style.display).toEqual('block');
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/papers/search-papers'), expect.any(Object));
    });

    it('should handle login successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ token: 'newAdminToken' }),
        status: 200,
      });
      // Mock the form elements
      mockDocument.getElementById('login-form').username.value = 'testAdmin';
      mockDocument.getElementById('login-form').password.value = 'testPass';

      // Simulate form submission
      await popup.loginForm.dispatchEvent(new Event('submit')); // Assuming loginForm is exposed or handled

      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/login'), expect.any(Object));
      expect(mockBrowserApi.storage.local.set).toHaveBeenCalledWith({ jwtToken: 'newAdminToken', userId: 'testAdmin' });
      // Expect checkLoginStatus to be called after successful login
    });
  });

  describe('background.js', () => {
    let background;

    beforeEach(() => {
      // Re-require background.js to get fresh references after mocks
      jest.resetModules();
      background = require('../background');
    });

    it('should set up sync alarm on install', () => {
      const onInstalledCallback = mockBrowserApi.runtime.onInstalled.addListener.mock.calls[0][0];
      onInstalledCallback();
      expect(mockBrowserApi.alarms.create).toHaveBeenCalledWith('syncOfflineQueue', { periodInMinutes: 5 });
    });

    it('should sync offline queue when online and items exist', async () => {
      // Mock navigator.onLine to be true
      Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });

      mockBrowserApi.storage.local.get.mockResolvedValueOnce({
        xjr3_offline_queue: [
          { url: 'http://test.com/api/request1', method: 'POST', body: { data: 'test' } },
        ],
        jwtToken: 'testJwt',
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
        status: 200,
      });

      // Directly call syncOfflineQueue since it's a standalone function for testing
      await background.syncOfflineQueue(); // Assuming syncOfflineQueue is exposed

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockBrowserApi.storage.local.set).toHaveBeenCalledWith({ xjr3_offline_queue: [] }); // Expect queue to be cleared
    });

    it('should not sync if offline', async () => {
      // Mock navigator.onLine to be false
      Object.defineProperty(global.navigator, 'onLine', { value: false, configurable: true });

      mockBrowserApi.storage.local.get.mockResolvedValueOnce({
        xjr3_offline_queue: [
          { url: 'http://test.com/api/request1', method: 'POST', body: { data: 'test' } },
        ],
        jwtToken: 'testJwt',
      });

      await background.syncOfflineQueue(); // Assuming syncOfflineQueue is exposed

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should queue offline requests', async () => {
      const onMessageCallback = mockBrowserApi.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      await onMessageCallback(
        { action: 'queueOfflineRequest', payload: { url: 'http://test.com/api/new', method: 'POST' } },
        {}, // sender
        sendResponse
      );

      expect(mockBrowserApi.storage.local.set).toHaveBeenCalledWith(
        { xjr3_offline_queue: [{ url: 'http://test.com/api/new', method: 'POST' }] },
        expect.any(Function)
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true, message: 'Request queued offline.' });
    });
  });
});
