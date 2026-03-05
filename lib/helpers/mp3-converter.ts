/**
 * MP3 Converter for Web Platform
 * 
 * Converts audio recordings to MP3 format using lamejs, matching the
 * blade file's web app behavior exactly:
 * 1. Record audio (any format browser supports)
 * 2. Decode to PCM using AudioContext
 * 3. Encode to MP3 using lamejs Mp3Encoder
 * 4. Return as Blob with audio/mpeg MIME type
 */

import { Platform } from 'react-native';

/**
 * Convert an audio blob/URI to MP3 format (web only).
 * On native platforms, returns the original file info unchanged.
 */
export async function convertToMp3Web(
  audioUri: string,
  baseName: string
): Promise<{ uri: string; mimeType: string; fileName: string }> {
  if (Platform.OS !== 'web') {
    // On native, return as-is (native uses M4A/AAC which server accepts)
    return {
      uri: audioUri,
      mimeType: 'audio/mp4',
      fileName: `${baseName}.m4a`,
    };
  }

  try {
    console.log('[MP3Converter] Starting conversion for web...');
    
    // Dynamically import lamejs (only on web)
    const lamejs = await import('lamejs');
    
    // Fetch the audio blob from the URI
    const response = await fetch(audioUri);
    const audioBlob = await response.blob();
    
    console.log('[MP3Converter] Audio blob size:', audioBlob.size, 'type:', audioBlob.type);
    
    if (audioBlob.size < 1000) {
      throw new Error('Recording too short');
    }
    
    // Decode audio to PCM using AudioContext
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    console.log('[MP3Converter] Decoded audio:', {
      channels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
    });
    
    // Get PCM data from first channel (mono)
    const samples = audioBuffer.getChannelData(0);
    
    // Convert float32 samples to Int16
    const pcmData = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    // Encode to MP3 using lamejs (matching blade file exactly)
    const mp3encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, 128);
    const mp3Data: any[] = [];
    
    const blockSize = 1152;
    for (let i = 0; i < pcmData.length; i += blockSize) {
      const chunk = pcmData.subarray(i, i + blockSize);
      const mp3buf = mp3encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
    
    // Create MP3 blob
    const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });
    const mp3Url = URL.createObjectURL(mp3Blob);
    
    console.log('[MP3Converter] Conversion complete. MP3 size:', mp3Blob.size);
    
    // Clean up AudioContext
    audioContext.close();
    
    return {
      uri: mp3Url,
      mimeType: 'audio/mpeg',
      fileName: `${baseName}.mp3`,
    };
  } catch (error) {
    console.error('[MP3Converter] Conversion failed:', error);
    // Fallback: return original with audio/mpeg MIME (server may still accept)
    console.log('[MP3Converter] Falling back to original audio with audio/mpeg MIME');
    return {
      uri: audioUri,
      mimeType: 'audio/mpeg',
      fileName: `${baseName}.mp3`,
    };
  }
}
