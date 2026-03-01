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
 * This completely bypasses the iOS MIME type 406 issue since the server
 * handles the actual upload to elmujib.com.
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
 * Get the local Express server URL.
 * On web: localhost:3000
 * On native: use the Expo dev server host IP with port 3000
 */
function getLocalServerUrl(): string {
  if (Platform.OS === 'web') {
    return 'http://127.0.0.1:3000';
  }
  try {
    const Constants = require('expo-constants').default;
    const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
    if (debuggerHost) {
      const host = debuggerHost.split(':')[0];
      return `http://${host}:3000`;
    }
  } catch (e) {
    // Fallback
  }
  return 'http://127.0.0.1:3000';
}

/**
 * Send a voice message through the server proxy.
 * 
 * The server handles:
 * 1. Converting the audio to MP3 via FFmpeg
 * 2. Uploading to elmujib.com
 * 3. Sending the media message to the contact
 * 
 * @param audioUri - The URI of the recorded audio file
 * @param contactUid - The contact to send to
 * @param caption - Optional caption
 * @param onProgress - Optional progress callback
 * @returns VoiceProxyResult
 */
export async function sendVoiceViaProxy(
  audioUri: string,
  contactUid: string,
  caption: string = '',
  onProgress?: (progress: number, step: string) => void,
): Promise<VoiceProxyResult> {
  const serverUrl = getLocalServerUrl();
  const proxyUrl = `${serverUrl}/api/voice-proxy/upload-and-send`;
  const authToken = await getAuthToken();

  console.log('[VoiceProxy Client] Starting voice proxy send:', {
    audioUri: audioUri.substring(0, 80),
    contactUid,
    serverUrl,
    hasToken: !!authToken,
    platform: Platform.OS,
  });

  if (!authToken) {
    throw new Error('Not authenticated - no auth token available');
  }

  if (onProgress) onProgress(5, 'Preparing voice...');

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

      const proxyResponse = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        body: formData,
      });

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

      const uploadResult = await FileSystem.uploadAsync(proxyUrl, audioUri, {
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
