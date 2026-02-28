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

export async function initPusher(options: {
  authToken: string;
  host: string;
  port: number;
  useTLS: boolean;
  appKey?: string;
}): Promise<void> {
  if (isInitialized && pusherInstance) {
    console.log('[Pusher] Already initialized');
    return;
  }

  const apiUrl = await getApiUrl();
  const authEndpoint = `${apiUrl}broadcasting/auth`;

  try {
    // Pusher/Soketi initialization
    pusherInstance = new Pusher(options.appKey || 'app-key', {
      wsHost: options.host,
      wsPort: options.useTLS ? options.port : 6001,
      wssPort: options.port,
      forceTLS: options.useTLS,
      disableStats: true,
      enabledTransports: ['ws', 'wss'],
      cluster: 'mt1',
      authEndpoint: authEndpoint,
      auth: {
        headers: {
          'Authorization': `Bearer ${options.authToken}`,
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
    console.log('[Pusher] Initialized with host:', options.host);
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
