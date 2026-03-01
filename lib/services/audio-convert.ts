/**
 * Audio Conversion Service
 * 
 * Converts recorded audio files to real OGG format via the local Express server.
 * The server uses FFmpeg to perform genuine format conversion (not just renaming).
 * 
 * Flow:
 * 1. Record audio (AAC/M4A from expo-audio)
 * 2. Upload to local server /api/convert-audio
 * 3. Server converts to OGG/Opus via FFmpeg
 * 4. Returns base64 data of the converted file
 * 5. Save converted file locally and use for upload to elmujib.com
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// The local Express server URL - same as the API server
function getLocalServerUrl(): string {
  // In development, the Express server runs on port 3000
  // On device via Expo Go, we need to use the machine's IP
  // The API_URL env var or a fallback
  if (Platform.OS === 'web') {
    return 'http://127.0.0.1:3000';
  }
  // For native devices, use the same host as the Expo dev server
  // This is typically the machine's local IP
  // We'll use the API URL from Constants if available
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
 * Convert an audio file to real OGG format via the local server.
 * 
 * @param audioUri - The URI of the audio file to convert (file:// or content://)
 * @param originalFileName - The original file name
 * @returns Object with the converted file URI, MIME type, and file name
 */
export async function convertAudioToOgg(
  audioUri: string,
  originalFileName: string
): Promise<{
  uri: string;
  mimeType: string;
  fileName: string;
  originalSize: number;
  convertedSize: number;
}> {
  const serverUrl = getLocalServerUrl();
  const convertUrl = `${serverUrl}/api/convert-audio`;
  
  console.log('[AudioConvert] Starting conversion:', {
    audioUri: audioUri.substring(0, 100),
    originalFileName,
    serverUrl: convertUrl,
  });

  try {
    if (Platform.OS === 'web') {
      // Web: Use standard fetch with FormData
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const formData = new FormData();
      formData.append('audio', new File([blob], originalFileName, { type: 'audio/aac' }));

      const convertResponse = await fetch(convertUrl, {
        method: 'POST',
        body: formData,
      });

      if (!convertResponse.ok) {
        const errorText = await convertResponse.text();
        throw new Error(`Conversion failed: ${convertResponse.status} - ${errorText}`);
      }

      const result = await convertResponse.json();
      
      if (!result.success || !result.data) {
        throw new Error(`Conversion failed: ${result.error || 'No data returned'}`);
      }

      // Create a blob URL from the base64 data
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const oggBlob = new Blob([bytes], { type: 'audio/ogg' });
      const oggUrl = URL.createObjectURL(oggBlob);

      console.log('[AudioConvert] Web conversion success:', {
        mimeType: result.mimeType,
        fileName: result.fileName,
        originalSize: result.originalSize,
        convertedSize: result.convertedSize,
      });

      return {
        uri: oggUrl,
        mimeType: 'audio/ogg',
        fileName: result.fileName,
        originalSize: result.originalSize,
        convertedSize: result.convertedSize,
      };
    } else {
      // Native: Use expo-file-system uploadAsync for reliable file upload
      console.log('[AudioConvert] Uploading audio file for conversion...');
      
      const uploadResult = await FileSystem.uploadAsync(convertUrl, audioUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'audio',
        mimeType: 'audio/aac',
        parameters: {},
        headers: {
          'Accept': 'application/json',
        },
      });

      console.log('[AudioConvert] Upload response status:', uploadResult.status);
      console.log('[AudioConvert] Upload response body (first 200):', uploadResult.body?.substring(0, 200));

      if (uploadResult.status !== 200) {
        throw new Error(`Conversion failed: HTTP ${uploadResult.status} - ${uploadResult.body?.substring(0, 200)}`);
      }

      let result: any;
      try {
        result = JSON.parse(uploadResult.body);
      } catch (e) {
        throw new Error(`Invalid response from conversion server: ${uploadResult.body?.substring(0, 200)}`);
      }

      if (!result.success || !result.data) {
        throw new Error(`Conversion failed: ${result.error || 'No data returned'}`);
      }

      // Save the converted base64 data to a local file
      const oggFileName = originalFileName.replace(/\.[^.]+$/, '.ogg');
      const oggFilePath = `${FileSystem.cacheDirectory}${oggFileName}`;
      
      await FileSystem.writeAsStringAsync(oggFilePath, result.data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Verify the file was written
      const fileInfo = await FileSystem.getInfoAsync(oggFilePath);
      console.log('[AudioConvert] Saved converted file:', {
        path: oggFilePath,
        exists: fileInfo.exists,
        size: (fileInfo as any).size,
        mimeType: 'audio/ogg',
        fileName: oggFileName,
        originalSize: result.originalSize,
        convertedSize: result.convertedSize,
      });

      return {
        uri: oggFilePath,
        mimeType: 'audio/ogg',
        fileName: oggFileName,
        originalSize: result.originalSize,
        convertedSize: result.convertedSize,
      };
    }
  } catch (error: any) {
    console.error('[AudioConvert] Conversion error:', error.message);
    console.error('[AudioConvert] Full error:', error);
    
    // Re-throw so the caller can decide to fallback to original format
    throw error;
  }
}

/**
 * Check if the audio conversion server is available.
 * Useful for determining whether to attempt conversion or fall back.
 */
export async function isConversionServerAvailable(): Promise<boolean> {
  try {
    const serverUrl = getLocalServerUrl();
    const response = await fetch(`${serverUrl}/api/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}
