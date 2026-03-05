/**
 * PWA Service Worker Registration
 * 
 * Registers the service worker on web platform only.
 * Call this once in the root layout on mount.
 */

import { Platform } from 'react-native';

export function registerServiceWorker() {
  if (Platform.OS !== 'web') return;
  
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration.scope);
        })
        .catch((error) => {
          console.log('[PWA] Service Worker registration failed:', error);
        });
    });
  }
}
