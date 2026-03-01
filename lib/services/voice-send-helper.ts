/**
 * Voice Send Helper
 * 
 * Prepares voice recordings for direct upload to elmujib.com.
 * 
 * expo-audio records in AAC format:
 * - iOS: MPEG4AAC produces M4A container (which is MP4 audio) → send as audio/mp4
 * - Android: aac_adts produces raw AAC bitstream → send as audio/aac
 * 
 * Server accepts: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
 * 
 * PHP's getClientMimeType() reads what we declare in the multipart form data,
 * so the declared MIME type must be in the accepted list.
 */

import { Platform } from 'react-native';

export interface VoiceFileInfo {
  uri: string;
  mimeType: string;
  fileName: string;
}

/**
 * Get the correct MIME type and extension based on platform.
 * iOS records M4A (MP4 audio container) → audio/mp4
 * Android records raw AAC (ADTS) → audio/aac
 */
function getVoiceMimeAndExt(): { mimeType: string; extension: string } {
  if (Platform.OS === 'ios') {
    // iOS MPEG4AAC produces M4A container = MP4 audio
    return { mimeType: 'audio/mp4', extension: '.m4a' };
  }
  // Android aac_adts produces raw AAC bitstream
  return { mimeType: 'audio/aac', extension: '.aac' };
}

/**
 * Prepare a voice recording for direct upload to elmujib.com.
 * Sets the correct platform-specific MIME type and extension.
 */
export function prepareVoiceForSending(
  originalUri: string,
  baseName: string
): VoiceFileInfo {
  const { mimeType, extension } = getVoiceMimeAndExt();
  const fileName = `${baseName}${extension}`;

  console.log('[VoiceSend] Preparing voice for direct upload:', {
    originalUri: originalUri.substring(0, 80),
    fileName,
    mimeType,
    platform: Platform.OS,
  });

  return {
    uri: originalUri,
    mimeType,
    fileName,
  };
}
