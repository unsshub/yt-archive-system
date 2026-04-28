// src/__setup__/global-setup.js
// Jest global setup - mocks for testing environment

// Mock fetch with sequence support for retry logic
let fetchResponses = [];

global.fetch = jest.fn((url, options) => {
  // Return pre-configured responses if set
  if (fetchResponses.length > 0) {
    const response = fetchResponses.shift();
    
    if (response instanceof Error) {
      return Promise.reject(response);
    }
    
    // Create headers Map that supports .get()
    const headers = new Map();
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        headers.set(key.toLowerCase(), String(value));
      });
    }
    
    // If response.ok is false, include statusText in error-like response
    const statusText = response.statusText || getDefaultStatusText(response.status);
    
    return Promise.resolve({
      ok: response.ok !== false,
      status: response.status || 200,
      statusText: statusText,
      headers: {
        get: (name) => headers.get(name.toLowerCase()) || null
      },
      json: () => Promise.resolve(response.data || response.body || response),
      text: () => Promise.resolve(JSON.stringify(response.data || response.body || response))
    });
  }

  // Default fallback: success response
  return Promise.resolve({
    ok: true,
    status: 201,
    statusText: 'Created',
    headers: {
      get: () => null
    },
    json: () => Promise.resolve({ 
      content: { sha: 'default-sha-123' },
      commit: { sha: 'commit-sha-456' }
    })
  });
});

// Helper to get default status text
function getDefaultStatusText(status) {
  const statusTexts = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  };
  return statusTexts[status] || 'Unknown';
}

// Helper to configure fetch responses for retry sequences
global.setFetchResponses = (responses) => {
  fetchResponses.length = 0;
  fetchResponses.push(...responses);
};

// Helper to reset fetch mock
global.resetFetchMock = () => {
  fetchResponses.length = 0;
  global.fetch.mockClear();
};

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index) => Object.keys(store)[index] || null)
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(global, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true
});

// Mock TextEncoder/TextDecoder for base64 encoding
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = class TextEncoder {
    encode(str) {
      const buf = Buffer.from(str, 'utf-8');
      return new Uint8Array(buf);
    }
  };
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = class TextDecoder {
    decode(buffer) {
      return Buffer.from(buffer).toString('utf-8');
    }
  };
}

// Mock navigator.onLine
Object.defineProperty(global.navigator, 'onLine', {
  value: true,
  writable: true,
  configurable: true
});