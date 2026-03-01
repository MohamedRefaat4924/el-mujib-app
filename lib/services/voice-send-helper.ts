/**
 * Voice Send Helper
 * 
 * Prepares voice recordings for direct upload to elmujib.com.
 * 
 * Server accepts: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
 * 
 * We always send as audio/aac with .aac extension on ALL platforms.
 * expo-audio records MPEG4AAC codec which IS AAC audio.
 * The container (M4A on iOS) doesn't matter for the server's MIME check
 * since PHP's getClientMimeType() reads the declared MIME from multipart form.
 */

import { Platform } from 'react-native';

export interface VoiceFileInfo {
  uri: string;
  mimeType: string;
  fileName: string;
}

/**
 * Prepare a voice recording for direct upload to elmujib.com.
 * Always uses audio/aac with .aac extension (server accepts this).
 */
export function prepareVoiceForSending(
  originalUri: string,
  baseName: string
): VoiceFileInfo {
  // Always use audio/aac - the server accepts it and expo-audio records AAC codec
  const mimeType = 'audio/aac';
  const extension = '.aac';
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
