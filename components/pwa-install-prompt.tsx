/**
 * PWA Install Prompt
 * 
 * Shows a banner prompting mobile browser users to add the app to their home screen.
 * - On Android Chrome: Uses the native beforeinstallprompt event
 * - On iOS Safari: Shows manual instructions (iOS doesn't support beforeinstallprompt)
 * - Dismissible with "Don't show again" stored in localStorage
 * - Only shows on web platform, not in standalone/PWA mode
 */

import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, Platform, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISSED_KEY = '@pwa_install_dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Don't show if already in standalone/PWA mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) return;

    // Check if user previously dismissed
    AsyncStorage.getItem(DISMISSED_KEY).then((val) => {
      if (val) {
        const dismissedAt = parseInt(val, 10);
        if (Date.now() - dismissedAt < DISMISS_DURATION_MS) {
          return; // Still within dismiss period
        }
      }

      // Detect iOS
      const ua = navigator.userAgent;
      const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setIsIOS(isiOS);

      if (isiOS) {
        // iOS doesn't fire beforeinstallprompt, show manual instructions
        setShowPrompt(true);
      }
    });

    // Listen for Android Chrome's beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(async () => {
    setShowPrompt(false);
    await AsyncStorage.setItem(DISMISSED_KEY, Date.now().toString());
  }, []);

  if (!showPrompt || Platform.OS !== 'web') return null;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 80,
        left: 16,
        right: 16,
        backgroundColor: '#1A6B3C',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        zIndex: 9999,
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={{ width: 44, height: 44, borderRadius: 10 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
            Install El Mujib
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 }}>
            {isIOS
              ? 'Add to your home screen for the best experience'
              : 'Install the app for quick access'}
          </Text>
        </View>
      </View>

      {/* iOS instructions */}
      {isIOS && (
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: 10,
            padding: 12,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 13, lineHeight: 20 }}>
            {'Tap the '}
            <Text style={{ fontWeight: '700' }}>Share</Text>
            {' button '}
            <Text style={{ fontSize: 16 }}>⎋</Text>
            {' at the bottom of Safari, then tap '}
            <Text style={{ fontWeight: '700' }}>"Add to Home Screen"</Text>
            {' '}
            <Text style={{ fontSize: 16 }}>＋</Text>
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={handleDismiss}
          style={({ pressed }) => ({
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' }}>
            Later
          </Text>
        </Pressable>

        {!isIOS && deferredPrompt && (
          <Pressable
            onPress={handleInstall}
            style={({ pressed }) => ({
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 8,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text style={{ color: '#1A6B3C', fontSize: 14, fontWeight: '700' }}>
              Install
            </Text>
          </Pressable>
        )}

        {isIOS && (
          <Pressable
            onPress={handleDismiss}
            style={({ pressed }) => ({
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 8,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text style={{ color: '#1A6B3C', fontSize: 14, fontWeight: '700' }}>
              Got it
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
