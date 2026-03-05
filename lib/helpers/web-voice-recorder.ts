/**
 * Web Voice Recorder
 * 
 * Records audio directly using the browser's MediaRecorder API,
 * then ALWAYS converts to MP3 via lamejs before uploading.
 * 
 * This matches the blade file's approach exactly:
 * 1. Record in whatever format the browser supports (WebM/OGG)
 * 2. Decode to PCM using AudioContext.decodeAudioData
 * 3. Encode to MP3 using lamejs
 * 4. Upload as audio/mpeg (.mp3)
 * 
 * Why always MP3? Chrome's MediaRecorder with "audio/ogg;codecs=opus" actually
 * produces WebM container bytes (not true OGG). PHP's finfo_file() detects the
 * real binary content and returns "audio/webm" which the server rejects.
 * Lamejs produces genuine MP3 frames that PHP correctly identifies as "audio/mpeg".
 */

export interface WebRecordingResult {
  blob: Blob;
  uri: string;
  mimeType: string;
  fileName: string;
  duration: number;
}

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let recordingStartTime = 0;
let recordingStream: MediaStream | null = null;
let recordingMimeType = '';

/**
 * Get the best supported MIME type for recording.
 * We don't care which format the browser records in because we always
 * convert to MP3 afterwards. Just pick the best quality available.
 */
function getBestRecordingMimeType(): string {
  const supportedTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];

  for (const type of supportedTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log('[WebVoice] Selected recording MIME type:', type);
      return type;
    }
  }

  console.log('[WebVoice] No preferred type supported, using default');
  return '';
}

/**
 * Start recording audio using the browser's MediaRecorder API.
 */
export async function startWebRecording(): Promise<void> {
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
      },
    });

    recordingMimeType = getBestRecordingMimeType();
    const options = recordingMimeType ? { mimeType: recordingMimeType } : {};

    mediaRecorder = new MediaRecorder(recordingStream, options);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(100); // Collect data every 100ms
    recordingStartTime = Date.now();

    console.log('[WebVoice] Recording started with MIME:', recordingMimeType || 'default');
  } catch (error: any) {
    console.error('[WebVoice] Failed to start recording:', error);
    throw error;
  }
}

/**
 * Stop recording and ALWAYS convert to MP3 via lamejs.
 * This matches the blade file's sendVoiceMessage → convertToMp3 flow exactly.
 */
export function stopWebRecording(): Promise<WebRecordingResult> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      reject(new Error('No active recording'));
      return;
    }

    const currentRecorder = mediaRecorder;
    const duration = Math.round((Date.now() - recordingStartTime) / 1000);

    currentRecorder.onstop = async () => {
      // Stop all tracks
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
      }

      if (audioChunks.length === 0) {
        reject(new Error('No audio data recorded'));
        return;
      }

      const mimeType = recordingMimeType || audioChunks[0]?.type || 'audio/webm';
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      audioChunks = [];

      console.log('[WebVoice] Recording stopped. Blob size:', audioBlob.size, 'type:', mimeType, 'duration:', duration, 's');

      if (audioBlob.size < 1000) {
        reject(new Error('Recording too short'));
        return;
      }

      try {
        // ALWAYS convert to MP3 — matching the blade file exactly.
        // The blade file's convertToMp3() uses lamejs to:
        // 1. Decode audio to PCM via AudioContext
        // 2. Encode PCM to MP3 via lamejs.Mp3Encoder
        console.log('[WebVoice] Converting to MP3 via lamejs (matching blade file)...');
        const mp3Blob = await convertBlobToMp3(audioBlob);
        const fileName = `voice_${Date.now()}.mp3`;
        const uri = URL.createObjectURL(mp3Blob);

        console.log('[WebVoice] MP3 conversion complete. Size:', mp3Blob.size);

        // Verify MP3 has valid header bytes (should start with 0xFF 0xFB for MPEG1 Layer3)
        const header = new Uint8Array(await mp3Blob.slice(0, 4).arrayBuffer());
        console.log('[WebVoice] MP3 header bytes:', Array.from(header).map(b => '0x' + b.toString(16)).join(' '));
        
        // Check for valid MP3 sync word (0xFF followed by 0xFB, 0xF3, 0xF2, or 0xE0-0xFF)
        const isValidMp3 = header[0] === 0xFF && (header[1] & 0xE0) === 0xE0;
        console.log('[WebVoice] Valid MP3 header:', isValidMp3);

        if (!isValidMp3 || mp3Blob.size < 1000) {
          throw new Error('MP3 conversion produced invalid output');
        }

        resolve({
          blob: mp3Blob,
          uri,
          mimeType: 'audio/mpeg',
          fileName,
          duration,
        });
      } catch (convError) {
        console.error('[WebVoice] MP3 conversion failed:', convError);
        reject(new Error(`MP3 conversion failed: ${convError}`));
      }
    };

    currentRecorder.stop();
    mediaRecorder = null;
  });
}

/**
 * Cancel the current recording without saving.
 */
export function cancelWebRecording(): void {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (recordingStream) {
    recordingStream.getTracks().forEach(track => track.stop());
    recordingStream = null;
  }
  audioChunks = [];
  mediaRecorder = null;
}

/**
 * Check if currently recording.
 */
export function isWebRecording(): boolean {
  return mediaRecorder !== null && mediaRecorder.state === 'recording';
}

/**
 * Get current recording duration in seconds.
 */
export function getWebRecordingDuration(): number {
  if (!recordingStartTime || !mediaRecorder) return 0;
  return Math.round((Date.now() - recordingStartTime) / 1000);
}

/**
 * Convert audio blob to MP3 using lamejs.
 * This is an exact port of the blade file's convertToMp3 function:
 * 
 * Blade file (JavaScript):
 *   function convertToMp3(audioBlob) {
 *     return new Promise((resolve, reject) => {
 *       const reader = new FileReader();
 *       reader.onload = function() {
 *         const audioContext = new (window.AudioContext || window.webkitAudioContext)();
 *         audioContext.decodeAudioData(reader.result, function(audioBuffer) {
 *           const sampleRate = audioBuffer.sampleRate;
 *           const samples = audioBuffer.getChannelData(0);
 *           const pcmData = new Int16Array(samples.length);
 *           for (let i = 0; i < samples.length; i++) {
 *             const s = Math.max(-1, Math.min(1, samples[i]));
 *             pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
 *           }
 *           const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
 *           ...
 *         });
 *       };
 *       reader.readAsArrayBuffer(audioBlob);
 *     });
 *   }
 */
async function convertBlobToMp3(audioBlob: Blob): Promise<Blob> {
  const lamejs = await import('lamejs');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContext.decodeAudioData(
        reader.result as ArrayBuffer,
        (audioBuffer) => {
          try {
            const sampleRate = audioBuffer.sampleRate;
            const samples = audioBuffer.getChannelData(0);

            // Convert float samples to 16-bit PCM (matching blade file exactly)
            const pcmData = new Int16Array(samples.length);
            for (let i = 0; i < samples.length; i++) {
              const s = Math.max(-1, Math.min(1, samples[i]));
              pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Encode to MP3 (matching blade file: 1 channel, sampleRate, 128kbps)
            const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
            const mp3Data: Blob[] = [];

            const blockSize = 1152;
            for (let i = 0; i < pcmData.length; i += blockSize) {
              const chunk = pcmData.subarray(i, i + blockSize);
              const mp3buf = mp3encoder.encodeBuffer(chunk);
              if (mp3buf.length > 0) {
                mp3Data.push(new Blob([new Uint8Array(mp3buf as unknown as ArrayBuffer)]));
              }
            }

            const mp3buf = mp3encoder.flush();
            if (mp3buf.length > 0) {
              mp3Data.push(new Blob([new Uint8Array(mp3buf as unknown as ArrayBuffer)]));
            }

            const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });
            audioContext.close();
            
            console.log('[WebVoice] MP3 encoded:', {
              inputSampleRate: sampleRate,
              inputSamples: samples.length,
              outputSize: mp3Blob.size,
              outputChunks: mp3Data.length,
            });
            
            resolve(mp3Blob);
          } catch (encodeError) {
            audioContext.close();
            reject(encodeError);
          }
        },
        (error) => {
          audioContext.close();
          reject(new Error(`AudioContext.decodeAudioData failed: ${error}`));
        }
      );
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(audioBlob);
  });
}
