/**
 * Voice Send Helper
 * 
 * Handles the complete flow of converting and sending voice messages:
 * 1. Convert recorded audio to real OGG format via local server
 * 2. If conversion succeeds, send the OGG file
 * 3. If conversion fails (e.g., server not available), fall back to original format
 */

import { Platform } from 'react-native';
import { convertAudioToOgg } from './audio-convert';

// Platform-specific MIME type for voice recordings
const VOICE_MIME_TYPE = Platform.OS === 'ios' ? 'audio/mp4' : 'audio/aac';
const VOICE_EXTENSION = Platform.OS === 'ios' ? '.m4a' : '.aac';

export interface VoiceFileInfo {
  uri: string;
  mimeType: string;
  fileName: string;
}

/**
 * Prepare a voice recording for sending by converting to OGG format.
 * Falls back to original format if conversion fails.
 * 
 * @param originalUri - The URI of the recorded audio file
 * @param baseName - Base name for the file (without extension)
 * @returns VoiceFileInfo with the file ready for upload
 */
export async function prepareVoiceForSending(
  originalUri: string,
  baseName: string
): Promise<VoiceFileInfo> {
  const originalFileName = `${baseName}${VOICE_EXTENSION}`;
  
  console.log('[VoiceSend] Preparing voice for sending:', {
    originalUri: originalUri.substring(0, 80),
    originalFileName,
    platform: Platform.OS,
  });

  try {
    // Attempt to convert to real OGG format
    console.log('[VoiceSend] Attempting OGG conversion via local server...');
    const converted = await convertAudioToOgg(originalUri, originalFileName);
    
    console.log('[VoiceSend] ✅ Conversion successful:', {
      uri: converted.uri.substring(0, 80),
      mimeType: converted.mimeType,
      fileName: converted.fileName,
      originalSize: converted.originalSize,
      convertedSize: converted.convertedSize,
      compressionRatio: ((converted.convertedSize / converted.originalSize) * 100).toFixed(1) + '%',
    });

    return {
      uri: converted.uri,
      mimeType: converted.mimeType,
      fileName: converted.fileName,
    };
  } catch (conversionError: any) {
    // Conversion failed - fall back to original format
    console.warn('[VoiceSend] ⚠️ OGG conversion failed, falling back to original format:', conversionError.message);
    console.log('[VoiceSend] Falling back to:', {
      mimeType: VOICE_MIME_TYPE,
      fileName: originalFileName,
    });

    return {
      uri: originalUri,
      mimeType: VOICE_MIME_TYPE,
      fileName: originalFileName,
    };
  }
}
