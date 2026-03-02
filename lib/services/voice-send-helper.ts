/**
 * Voice Send Helper
 * 
 * Prepares voice recordings for direct upload to elmujib.com.
 * 
 * Server accepts: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
 * 
 * We always send as audio/mp4 with .m4a extension on ALL platforms.
 * expo-audio records MPEG4AAC codec in an MP4/M4A container.
 * Using audio/mp4 matches the actual file content (AAC in MP4 container),
 * which passes both the server's MIME check and content inspection.
 */

import { Platform } from 'react-native';

export interface VoiceFileInfo {
  uri: string;
  mimeType: string;
  fileName: string;
}

/**
 * Prepare a voice recording for direct upload to elmujib.com.
 * Always uses audio/mp4 with .m4a extension (matches actual M4A file content).
 */
export function prepareVoiceForSending(
  originalUri: string,
  baseName: string
): VoiceFileInfo {
  // Always use audio/mp4 - matches the actual M4A container that expo-audio produces
  const mimeType = 'audio/mp4';
  const extension = '.m4a';
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
