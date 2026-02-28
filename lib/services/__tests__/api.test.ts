import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    getAllKeys: vi.fn(() => Promise.resolve([])),
    multiRemove: vi.fn(),
  },
}));

// Mock React Native Platform
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export required functions', async () => {
    const api = await import('../api');
    expect(typeof api.getBaseUrl).toBe('function');
    expect(typeof api.setBaseUrl).toBe('function');
    expect(typeof api.getApiUrl).toBe('function');
    expect(typeof api.getAuthToken).toBe('function');
    expect(typeof api.saveAuthData).toBe('function');
    expect(typeof api.clearAuthData).toBe('function');
    expect(typeof api.isLoggedIn).toBe('function');
    expect(typeof api.apiGet).toBe('function');
    expect(typeof api.apiPost).toBe('function');
    expect(typeof api.apiPostMultipart).toBe('function');
    expect(typeof api.getItemValue).toBe('function');
    expect(typeof api.encryptWithRSA).toBe('function');
    expect(typeof api.uploadFile).toBe('function');
  });

  it('getBaseUrl should return hardcoded base URL', async () => {
    const { getBaseUrl } = await import('../api');
    expect(getBaseUrl()).toBe('https://elmujib.com');
  });

  it('getApiUrl should return hardcoded API URL', async () => {
    const { getApiUrl } = await import('../api');
    expect(getApiUrl()).toBe('https://elmujib.com/api/');
  });

  it('getItemValue should extract nested values', async () => {
    const { getItemValue } = await import('../api');
    const data = {
      client_models: {
        contacts: { a: 1, b: 2 },
        unreadMessagesCount: 5,
      },
    };
    expect(getItemValue(data, 'client_models.contacts')).toEqual({ a: 1, b: 2 });
    expect(getItemValue(data, 'client_models.unreadMessagesCount')).toBe(5);
    expect(getItemValue(null, 'any.path')).toBeNull();
    expect(getItemValue(data, 'nonexistent.path')).toBeNull();
  });

  it('encryptWithRSA should be a function that returns a string', async () => {
    const { encryptWithRSA } = await import('../api');
    expect(typeof encryptWithRSA).toBe('function');
    const result = encryptWithRSA('test');
    expect(typeof result).toBe('string');
  });
});

describe('Message History Service', () => {
  it('should export required functions', async () => {
    const history = await import('../message-history');
    expect(typeof history.cacheMessages).toBe('function');
    expect(typeof history.getCachedMessages).toBe('function');
    expect(typeof history.clearCachedMessages).toBe('function');
    expect(typeof history.getQuickReplies).toBe('function');
    expect(typeof history.addQuickReply).toBe('function');
    expect(typeof history.removeQuickReply).toBe('function');
    expect(typeof history.updateContactContext).toBe('function');
    expect(typeof history.getContactContext).toBe('function');
    expect(typeof history.analyzeAndUpdateContext).toBe('function');
    expect(typeof history.addRecentContact).toBe('function');
    expect(typeof history.getRecentContacts).toBe('function');
    expect(typeof history.getStorageUsage).toBe('function');
    expect(typeof history.clearAllCache).toBe('function');
  });
});
