/**
 * Voice Send Helper
 * 
 * Prepares voice recordings for upload to elmujib.com.
 * 
 * Web: Converts to MP3 using lamejs (matching the blade file's web app behavior exactly)
 * Native (iOS/Android): Sends as audio/mp4 (.m4a) — AAC in MP4 container
 * 
 * Server accepts: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
 */

import { Platform } from 'react-native';
import { convertToMp3Web } from '@/lib/helpers/mp3-converter';

export interface VoiceFileInfo {
  uri: string;
  mimeType: string;
  fileName: string;
}

/**
 * Prepare a voice recording for upload to elmujib.com.
 * 
 * On web: converts to MP3 (audio/mpeg) matching the blade file's lamejs approach.
 * On native: sends as M4A (audio/mp4) which the server accepts.
 */
export async function prepareVoiceForSending(
  originalUri: string,
  baseName: string
): Promise<VoiceFileInfo> {
  if (Platform.OS === 'web') {
    // Web: Convert to MP3 using lamejs (matching blade file exactly)
    console.log('[VoiceSend] Web platform - converting to MP3...');
    const result = await convertToMp3Web(originalUri, baseName);
    console.log('[VoiceSend] MP3 conversion result:', {
      fileName: result.fileName,
      mimeType: result.mimeType,
    });
    return result;
  }

  // Native: Use audio/mp4 with .m4a extension (AAC in MP4 container)
  const mimeType = 'audio/mp4';
  const extension = '.m4a';
  const fileName = `${baseName}${extension}`;

  console.log('[VoiceSend] Native platform - preparing M4A for direct upload:', {
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
