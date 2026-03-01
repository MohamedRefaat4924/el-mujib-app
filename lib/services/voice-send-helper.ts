/**
 * Voice Send Helper
 * 
 * Prepares voice recordings for direct upload to elmujib.com.
 * expo-audio records in AAC format — we declare audio/aac MIME type
 * which the server accepts directly (no conversion needed).
 * 
 * Server accepts: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
 * We send: audio/aac with .aac extension
 * 
 * On iOS: expo-audio with MPEG4AAC produces M4A container but the actual
 * codec is AAC. PHP's getClientMimeType() reads what we declare in the
 * multipart form data, so declaring audio/aac works.
 * 
 * On Android: aac_adts output format produces raw AAC bitstream (.aac)
 * which is natively audio/aac.
 */

import { Platform } from 'react-native';

export interface VoiceFileInfo {
  uri: string;
  mimeType: string;
  fileName: string;
}

/**
 * Voice MIME type — audio/aac is directly accepted by the server.
 * PHP's getClientMimeType() reads the declared MIME type from multipart form data.
 */
export const VOICE_MIME_TYPE = 'audio/aac';
export const VOICE_EXTENSION = '.aac';

/**
 * Prepare a voice recording for direct upload to elmujib.com.
 * The file is already in AAC format from expo-audio — just set the correct MIME type and extension.
 */
export function prepareVoiceForSending(
  originalUri: string,
  baseName: string
): VoiceFileInfo {
  const fileName = `${baseName}${VOICE_EXTENSION}`;

  console.log('[VoiceSend] Preparing AAC voice for direct upload:', {
    originalUri: originalUri.substring(0, 80),
    fileName,
    mimeType: VOICE_MIME_TYPE,
    platform: Platform.OS,
  });

  return {
    uri: originalUri,
    mimeType: VOICE_MIME_TYPE,
    fileName,
  };
}
