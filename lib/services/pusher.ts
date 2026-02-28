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

const channelSubscriptions: Map<string, SubscriptionCallbacks> = new Map();

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

  const apiUrl = await getApiUrl();
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

export function subscribeToChannel(
  channelName: string,
  callbacks: SubscriptionCallbacks
): void {
  if (!pusherInstance) {
    console.error('[Pusher] Not initialized');
    return;
  }

  try {
    const channel = pusherInstance.subscribe(channelName);

    channel.bind_global((eventName: string, data: any) => {
      // Skip internal pusher events
      if (eventName.startsWith('pusher:')) return;

      console.log(`[Pusher] Event on ${channelName}:`, eventName);
      callbacks.onEvent(eventName, data);
    });

    channel.bind('pusher:subscription_error', (error: any) => {
      console.error(`[Pusher] Subscription error on ${channelName}:`, error);
      if (callbacks.onSubscriptionError) {
        callbacks.onSubscriptionError(error);
      }
    });

    channel.bind('pusher:subscription_succeeded', () => {
      console.log(`[Pusher] Subscribed to ${channelName}`);
    });

    channelSubscriptions.set(channelName, callbacks);
  } catch (error) {
    console.error(`[Pusher] Subscribe error for ${channelName}:`, error);
  }
}

export function unsubscribeFromChannel(channelName: string): void {
  if (!pusherInstance) return;

  try {
    pusherInstance.unsubscribe(channelName);
    channelSubscriptions.delete(channelName);
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
    channelSubscriptions.clear();
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
