/**
 * Voice Send Helper
 * 
 * Uses the server-side voice proxy to handle voice message uploads:
 * 1. Client uploads recorded audio to our Express server (/api/voice-proxy/upload-and-send)
 * 2. Server converts to MP3 using FFmpeg
 * 3. Server uploads the MP3 to elmujib.com (server-to-server, no MIME issues)
 * 4. Server sends the media message to the contact
 * 5. Returns the result to the client
 * 
 * The server is accessed via the public proxy URL (same domain pattern as Metro/API).
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getAuthToken } from './api';

export interface VoiceFileInfo {
  uri: string;
  mimeType: string;
  fileName: string;
}

export interface VoiceProxyResult {
  success: boolean;
  uploadResult?: any;
  sendResult?: any;
  error?: string;
}

/**
 * Get the Express server URL that is reachable from the device.
 * 
 * The server runs on port 3000 in the sandbox. For the phone to reach it,
 * we use the public proxy URL (same pattern as the Metro bundler URL but port 3000).
 * 
 * The Metro URL looks like: https://8081-ip57ioln204m6h53ct4xj-39ad8c2e.sg1.manus.computer
 * The API URL looks like:   https://3000-ip57ioln204m6h53ct4xj-39ad8c2e.sg1.manus.computer
 */
function getServerUrl(): string {
  if (Platform.OS === 'web') {
    // On web (dev), use localhost directly
    return 'http://127.0.0.1:3000';
  }

  // On native devices, derive the API URL from the Metro bundler URL
  // The Metro URL has the pattern: https://{port}-{id}.{region}.manus.computer
  // We just need to replace the port prefix
  try {
    const Constants = require('expo-constants').default;
    
    // Try to get the Expo dev server URL
    const hostUri = Constants.expoConfig?.hostUri;
    const debuggerHost = Constants.manifest2?.extra?.expoGo?.debuggerHost;
    
    // The hostUri looks like: "8081-ip57ioln204m6h53ct4xj-39ad8c2e.sg1.manus.computer"
    // or it could be "192.168.x.x:8081"
    const host = hostUri || debuggerHost || '';
    
    console.log('[VoiceProxy] hostUri:', hostUri, 'debuggerHost:', debuggerHost);
    
    if (host.includes('manus.computer')) {
      // It's a manus proxy URL - replace the port prefix
      const apiUrl = 'https://' + host.replace(/^8081-/, '3000-').replace(/:8081$/, '');
      console.log('[VoiceProxy] Using manus proxy URL:', apiUrl);
      return apiUrl;
    }
    
    if (host) {
      // It's a local IP - use it with port 3000
      const ip = host.split(':')[0];
      return `http://${ip}:3000`;
    }
  } catch (e) {
    console.warn('[VoiceProxy] Failed to get server URL from Constants:', e);
  }

  // Fallback to the known public proxy URL
  return 'https://3000-ip57ioln204m6h53ct4xj-39ad8c2e.sg1.manus.computer';
}

/**
 * Send a voice message through the server proxy.
 * 
 * The server handles:
 * 1. Converting the audio to MP3 via FFmpeg
 * 2. Uploading to elmujib.com
 * 3. Sending the media message to the contact
 * 
 * Includes a 30-second timeout to prevent hanging.
 */
export async function sendVoiceViaProxy(
  audioUri: string,
  contactUid: string,
  caption: string = '',
  onProgress?: (progress: number, step: string) => void,
): Promise<VoiceProxyResult> {
  const serverUrl = getServerUrl();
  const proxyUrl = `${serverUrl}/api/voice-proxy/upload-and-send`;
  const authToken = await getAuthToken();

  console.log('[VoiceProxy Client] Starting voice proxy send:', {
    audioUri: audioUri.substring(0, 80),
    contactUid,
    serverUrl,
    proxyUrl,
    hasToken: !!authToken,
    platform: Platform.OS,
  });

  if (!authToken) {
    throw new Error('Not authenticated - no auth token available');
  }

  if (onProgress) onProgress(5, 'Preparing voice...');

  // Create a timeout promise to prevent hanging
  const TIMEOUT_MS = 30000; // 30 seconds
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Voice proxy timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
  });

  try {
    if (Platform.OS === 'web') {
      // Web: use standard fetch with FormData
      const response = await fetch(audioUri);
      const blob = await response.blob();
      
      const formData = new FormData();
      formData.append('audio', blob, `voice_${Date.now()}.m4a`);
      formData.append('contact_uid', contactUid);
      formData.append('caption', caption);

      if (onProgress) onProgress(15, 'Uploading to server...');

      const proxyResponse = await Promise.race([
        fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
          body: formData,
        }),
        timeoutPromise,
      ]);

      const result = await proxyResponse.json();
      console.log('[VoiceProxy Client] Web response:', JSON.stringify(result).substring(0, 300));

      if (!result.success) {
        throw new Error(result.error || 'Voice proxy failed');
      }

      if (onProgress) onProgress(100, 'Sent!');
      return result;

    } else {
      // Native: use FileSystem.uploadAsync for reliable file upload from device
      if (onProgress) onProgress(15, 'Uploading to server...');

      console.log('[VoiceProxy Client] Using FileSystem.uploadAsync to:', proxyUrl);

      const uploadPromise = FileSystem.uploadAsync(proxyUrl, audioUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'audio',
        mimeType: 'audio/mp4', // iOS records as M4A - server will convert to MP3
        parameters: {
          contact_uid: contactUid,
          caption: caption,
        },
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });

      // Race between upload and timeout
      const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);

      console.log('[VoiceProxy Client] Upload response status:', uploadResult.status);
      console.log('[VoiceProxy Client] Upload response body:', uploadResult.body?.substring(0, 500));

      if (onProgress) onProgress(80, 'Processing...');

      let result;
      try {
        result = JSON.parse(uploadResult.body);
      } catch {
        throw new Error(`Server returned non-JSON: ${uploadResult.body?.substring(0, 200)}`);
      }

      if (uploadResult.status >= 400 || !result.success) {
        throw new Error(result.error || `Server error: HTTP ${uploadResult.status}`);
      }

      if (onProgress) onProgress(100, 'Sent!');
      return result;
    }
  } catch (error: any) {
    console.error('[VoiceProxy Client] Error:', error.message);
    throw error;
  }
}

/**
 * Prepare a voice recording for sending (legacy - for fallback if proxy fails).
 * Returns file info that can be used with the standard sendMediaMessage flow.
 */
export async function prepareVoiceForSending(
  originalUri: string,
  baseName: string
): Promise<VoiceFileInfo> {
  const fileName = `${baseName}.mp3`;
  
  console.log('[VoiceSend] Preparing voice (fallback):', {
    originalUri: originalUri.substring(0, 80),
    fileName,
    platform: Platform.OS,
  });

  return {
    uri: originalUri,
    mimeType: 'audio/mpeg',
    fileName,
  };
}
