import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false, // We play our own sound
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let notificationSoundPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let isAudioModeSet = false;

/**
 * Request notification permissions (required for local notifications)
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notification] Permission not granted');
      return false;
    }

    console.log('[Notification] Permission granted');
    return true;
  } catch (error) {
    console.error('[Notification] Permission request error:', error);
    return false;
  }
}

/**
 * Play notification sound using expo-audio
 */
export async function playNotificationSound(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    // Set audio mode for playback (only once)
    if (!isAudioModeSet) {
      await setAudioModeAsync({ playsInSilentMode: true });
      isAudioModeSet = true;
    }

    // Release previous player if exists
    if (notificationSoundPlayer) {
      try {
        notificationSoundPlayer.release();
      } catch (e) {
        // Ignore release errors
      }
      notificationSoundPlayer = null;
    }

    // Create new player with the notification sound
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const soundSource = require('@/assets/sounds/notification.mp3');
    notificationSoundPlayer = createAudioPlayer(soundSource);
    notificationSoundPlayer.volume = 0.7;
    notificationSoundPlayer.play();

    console.log('[Notification] Sound played');
  } catch (error) {
    console.error('[Notification] Sound play error:', error);
  }
}

/**
 * Show a local push notification for a new message
 */
export async function showLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: data || {},
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Show immediately
    });
    console.log('[Notification] Local notification shown:', title);
  } catch (error) {
    console.error('[Notification] Show notification error:', error);
  }
}

/**
 * Handle a new incoming message - play sound and show notification
 * Only shows notification if app is in background or on a different screen
 */
export async function handleNewMessageNotification(
  contactName: string,
  messagePreview: string,
  contactUid: string,
  options?: {
    isInChatScreen?: boolean;
    currentChatContactUid?: string;
  }
): Promise<void> {
  // If user is viewing this exact chat, just play a subtle sound
  if (options?.isInChatScreen && options?.currentChatContactUid === contactUid) {
    await playNotificationSound();
    return;
  }

  // Play notification sound
  await playNotificationSound();

  // Show local notification if app is in background or on different screen
  const appState = AppState.currentState;
  if (appState !== 'active' || !options?.isInChatScreen) {
    await showLocalNotification(
      contactName || 'New Message',
      messagePreview || 'You have a new message',
      { contactUid, type: 'new_message' }
    );
  }
}

/**
 * Set up notification response handler (when user taps on notification)
 */
export function setupNotificationResponseHandler(
  onNotificationTap: (contactUid: string) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      if (data?.contactUid && data?.type === 'new_message') {
        onNotificationTap(data.contactUid as string);
      }
    }
  );

  return () => subscription.remove();
}

/**
 * Clean up notification resources
 */
export function cleanupNotifications(): void {
  if (notificationSoundPlayer) {
    try {
      notificationSoundPlayer.release();
    } catch (e) {
      // Ignore
    }
    notificationSoundPlayer = null;
  }
}
