/**
 * Voice Send Helper
 * 
 * Handles preparing voice messages for sending.
 * 
 * On native devices (iOS/Android), the local Express server is NOT reachable
 * (it runs in the sandbox, not on the user's network). So we skip conversion
 * and send the original recorded format directly.
 * 
 * On web (development), we attempt conversion with a fast timeout.
 * 
 * The server accepts: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
 * So sending the original AAC/M4A format should work fine.
 */

import { Platform } from 'react-native';

// Platform-specific MIME type for voice recordings
const VOICE_MIME_TYPE = Platform.OS === 'ios' ? 'audio/mp4' : 'audio/aac';
const VOICE_EXTENSION = Platform.OS === 'ios' ? '.m4a' : '.aac';

export interface VoiceFileInfo {
  uri: string;
  mimeType: string;
  fileName: string;
}

/**
 * Prepare a voice recording for sending.
 * 
 * On native devices: returns the original file immediately (no conversion attempt).
 * On web: attempts OGG conversion with a 5-second timeout, falls back to original.
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
    mimeType: VOICE_MIME_TYPE,
  });

  // On native devices, the conversion server (sandbox Express) is NOT reachable.
  // Send the original format directly - the server accepts audio/aac and audio/mp4.
  if (Platform.OS !== 'web') {
    console.log('[VoiceSend] Native device - sending original format (no conversion needed)');
    return {
      uri: originalUri,
      mimeType: VOICE_MIME_TYPE,
      fileName: originalFileName,
    };
  }

  // Web: attempt conversion with timeout
  try {
    const { convertAudioToOgg } = await import('./audio-convert');
    
    // Race between conversion and a 5-second timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Conversion timeout (5s)')), 5000);
    });

    const converted = await Promise.race([
      convertAudioToOgg(originalUri, originalFileName),
      timeoutPromise,
    ]);

    console.log('[VoiceSend] ✅ Web conversion successful:', {
      mimeType: converted.mimeType,
      fileName: converted.fileName,
    });

    return {
      uri: converted.uri,
      mimeType: converted.mimeType,
      fileName: converted.fileName,
    };
  } catch (conversionError: any) {
    console.warn('[VoiceSend] ⚠️ Conversion failed/skipped, using original format:', conversionError.message);
    return {
      uri: originalUri,
      mimeType: VOICE_MIME_TYPE,
      fileName: originalFileName,
    };
  }
}
