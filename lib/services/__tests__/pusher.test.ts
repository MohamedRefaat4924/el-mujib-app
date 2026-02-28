import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pusher-js
vi.mock('pusher-js/react-native', () => {
  const mockChannel = {
    bind: vi.fn(),
    bind_global: vi.fn(),
  };
  const mockPusher = vi.fn().mockImplementation(() => ({
    connection: {
      bind: vi.fn(),
    },
    subscribe: vi.fn(() => mockChannel),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
  }));
  return { default: mockPusher };
});

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    getAllKeys: vi.fn(() => Promise.resolve([])),
    multiRemove: vi.fn(() => Promise.resolve()),
  },
}));

// Mock React Native
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// Mock expo-file-system (imported transitively via api.ts)
vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn(),
  EncodingType: { Base64: 'base64' },
}));

describe('Pusher Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should export required functions', async () => {
    const pusher = await import('../pusher');
    expect(typeof pusher.initPusher).toBe('function');
    expect(typeof pusher.subscribeToChannel).toBe('function');
    expect(typeof pusher.unsubscribeFromChannel).toBe('function');
    expect(typeof pusher.disconnectPusher).toBe('function');
    expect(typeof pusher.reconnectPusher).toBe('function');
    expect(typeof pusher.getPusherState).toBe('function');
  });

  it('getPusherState should return initial state', async () => {
    const { getPusherState } = await import('../pusher');
    const state = getPusherState();
    expect(state).toHaveProperty('isInitialized');
    expect(state).toHaveProperty('isConnected');
  });

  it('initPusher should initialize without throwing', async () => {
    const { initPusher } = await import('../pusher');
    await expect(
      initPusher({
        authToken: 'test-token',
        host: 'aa.evyx.lol',
        port: 443,
        useTLS: true,
      })
    ).resolves.not.toThrow();
  });
});

describe('Types', () => {
  it('should have correct message type definitions', async () => {
    const types = await import('../../types');
    // Verify types module exports correctly
    expect(types).toBeDefined();
  });
});
