import Pusher from 'pusher-js/react-native';
import { getApiUrl, getAuthToken } from './api';

let pusherInstance: Pusher | null = null;
let isInitialized = false;
let isConnected = false;

type EventCallback = (eventName: string, eventData: any) => void;
type ErrorCallback = (error: any) => void;

interface SubscriptionCallbacks {
  onEvent: EventCallback;
  onSubscriptionError?: ErrorCallback;
}

// Support multiple listeners per channel using listenerId
interface ChannelListener {
  listenerId: string;
  callbacks: SubscriptionCallbacks;
}

// Map of channelName -> array of listeners
const channelListeners: Map<string, ChannelListener[]> = new Map();
// Track which channels are already subscribed at the Pusher level
const subscribedChannels: Set<string> = new Set();

// Soketi configuration from Flutter app_config.dart configItems
const SOKETI_CONFIG = {
  appKey: 'elmujib-key-12345',   // configItems.services.pusher.apiKey
  cluster: 'eu',                  // configItems.services.pusher.cluster
  host: 'aa.evyx.lol',           // configItems.services.soketi.host
  port: 443,                      // configItems.services.soketi.port
  useTLS: true,                   // configItems.services.soketi.useTLS
};

export async function initPusher(options?: {
  authToken?: string;
  host?: string;
  port?: number;
  useTLS?: boolean;
  appKey?: string;
}): Promise<void> {
  if (isInitialized && pusherInstance) {
    console.log('[Pusher] Already initialized');
    return;
  }

  const authToken = options?.authToken || await getAuthToken() || '';
  const host = options?.host || SOKETI_CONFIG.host;
  const port = options?.port || SOKETI_CONFIG.port;
  const useTLS = options?.useTLS ?? SOKETI_CONFIG.useTLS;
  const appKey = options?.appKey || SOKETI_CONFIG.appKey;

  const apiUrl = getApiUrl();
  // Flutter passes auth_token as query parameter: apiUrl("broadcasting/auth", queryParameters: {'auth_token': authToken})
  const authEndpoint = `${apiUrl}broadcasting/auth?auth_token=${encodeURIComponent(authToken)}`;

  try {
    pusherInstance = new Pusher(appKey, {
      wsHost: host,
      wsPort: useTLS ? port : 6001,
      wssPort: port,
      forceTLS: useTLS,
      disableStats: true,
      enabledTransports: ['ws', 'wss'],
      cluster: SOKETI_CONFIG.cluster,
      authEndpoint: authEndpoint,
      auth: {
        headers: {
          'Accept': 'application/json',
        },
      },
    });

    pusherInstance.connection.bind('connected', () => {
      isConnected = true;
      console.log('[Pusher] Connected successfully');
    });

    pusherInstance.connection.bind('disconnected', () => {
      isConnected = false;
      console.log('[Pusher] Disconnected');
    });

    pusherInstance.connection.bind('error', (error: any) => {
      console.error('[Pusher] Connection error:', error);
    });

    isInitialized = true;
    console.log('[Pusher] Initialized with host:', host, 'appKey:', appKey);
  } catch (error) {
    console.error('[Pusher] Init failed:', error);
    throw error;
  }
}

/**
 * Subscribe to a channel with a unique listener ID.
 * Multiple listeners can subscribe to the same channel.
 * The actual Pusher subscription only happens once per channel.
 * 
 * @param channelName - The Pusher channel name
 * @param callbacks - Event and error callbacks
 * @param listenerId - Unique ID for this listener (e.g., 'home', 'chat-screen')
 *                     If not provided, defaults to 'default' (backward compatible)
 */
export function subscribeToChannel(
  channelName: string,
  callbacks: SubscriptionCallbacks,
  listenerId: string = 'default'
): void {
  if (!pusherInstance) {
    console.error('[Pusher] Not initialized');
    return;
  }

  try {
    // Add this listener to the channel's listener list
    const listeners = channelListeners.get(channelName) || [];
    // Remove existing listener with same ID (replace)
    const filteredListeners = listeners.filter(l => l.listenerId !== listenerId);
    filteredListeners.push({ listenerId, callbacks });
    channelListeners.set(channelName, filteredListeners);

    // Only subscribe at the Pusher level if not already subscribed
    if (!subscribedChannels.has(channelName)) {
      const channel = pusherInstance.subscribe(channelName);

      channel.bind_global((eventName: string, data: any) => {
        // Skip internal pusher events
        if (eventName.startsWith('pusher:')) return;

        console.log(`[Pusher] Event on ${channelName}:`, eventName);
        
        // Notify ALL listeners for this channel
        const currentListeners = channelListeners.get(channelName) || [];
        currentListeners.forEach(listener => {
          try {
            listener.callbacks.onEvent(eventName, data);
          } catch (err) {
            console.error(`[Pusher] Error in listener ${listener.listenerId}:`, err);
          }
        });
      });

      channel.bind('pusher:subscription_error', (error: any) => {
        console.error(`[Pusher] Subscription error on ${channelName}:`, error);
        const currentListeners = channelListeners.get(channelName) || [];
        currentListeners.forEach(listener => {
          if (listener.callbacks.onSubscriptionError) {
            listener.callbacks.onSubscriptionError(error);
          }
        });
      });

      channel.bind('pusher:subscription_succeeded', () => {
        console.log(`[Pusher] Subscribed to ${channelName}`);
      });

      subscribedChannels.add(channelName);
    }

    console.log(`[Pusher] Listener '${listenerId}' added to ${channelName} (total: ${(channelListeners.get(channelName) || []).length})`);
  } catch (error) {
    console.error(`[Pusher] Subscribe error for ${channelName}:`, error);
  }
}

/**
 * Remove a specific listener from a channel.
 * The Pusher subscription is only removed when no listeners remain.
 */
export function removeListener(channelName: string, listenerId: string): void {
  const listeners = channelListeners.get(channelName) || [];
  const filtered = listeners.filter(l => l.listenerId !== listenerId);
  
  if (filtered.length > 0) {
    channelListeners.set(channelName, filtered);
    console.log(`[Pusher] Listener '${listenerId}' removed from ${channelName} (remaining: ${filtered.length})`);
  } else {
    // No more listeners - unsubscribe from the channel
    channelListeners.delete(channelName);
    if (pusherInstance && subscribedChannels.has(channelName)) {
      pusherInstance.unsubscribe(channelName);
      subscribedChannels.delete(channelName);
      console.log(`[Pusher] Unsubscribed from ${channelName} (no listeners left)`);
    }
  }
}

export function unsubscribeFromChannel(channelName: string): void {
  if (!pusherInstance) return;

  try {
    pusherInstance.unsubscribe(channelName);
    channelListeners.delete(channelName);
    subscribedChannels.delete(channelName);
    console.log(`[Pusher] Unsubscribed from ${channelName}`);
  } catch (error) {
    console.error(`[Pusher] Unsubscribe error for ${channelName}:`, error);
  }
}

export function disconnectPusher(): void {
  if (pusherInstance) {
    pusherInstance.disconnect();
    isInitialized = false;
    isConnected = false;
    channelListeners.clear();
    subscribedChannels.clear();
    pusherInstance = null;
    console.log('[Pusher] Disconnected and cleaned up');
  }
}

export function reconnectPusher(): void {
  if (pusherInstance && !isConnected) {
    pusherInstance.connect();
    console.log('[Pusher] Reconnecting...');
  }
}

export function getPusherState(): { isInitialized: boolean; isConnected: boolean } {
  return { isInitialized, isConnected };
}

export { SOKETI_CONFIG };
