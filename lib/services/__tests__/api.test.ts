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
    expect(getItemValue(data, 'nonexistent.path')).toBeNull();
    expect(getItemValue(null, 'any.path')).toBeNull();
  });

  it('setBaseUrl should strip trailing slashes', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const { setBaseUrl, getBaseUrl } = await import('../api');
    
    await setBaseUrl('https://example.com///');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@el_mujib_base_url',
      'https://example.com'
    );
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
