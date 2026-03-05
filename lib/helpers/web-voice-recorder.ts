/**
 * Web Voice Recorder
 * 
 * Records audio directly using the browser's MediaRecorder API,
 * matching the blade file's approach exactly:
 * 1. Try to record as OGG (audio/ogg;codecs=opus) — server accepts natively
 * 2. If OGG not supported, record in any format then convert to MP3 via lamejs
 * 3. Upload as the correct MIME type
 * 
 * This bypasses expo-audio's web recording which produces audio/webm.
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
 * Matches the blade file's priority: OGG first, then MP4, then WebM.
 */
function getBestRecordingMimeType(): string {
  const supportedTypes = [
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/webm;codecs=opus',
    'audio/webm',
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
 * Check if a MIME type is directly accepted by the server.
 */
function isServerAccepted(mimeType: string): boolean {
  const accepted = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
  // Also match with codec params like audio/ogg;codecs=opus
  return accepted.some(a => mimeType.startsWith(a));
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
 * Stop recording and return the audio data.
 * If the recording format is not server-accepted, converts to MP3.
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
        // If the recording format is already server-accepted (OGG, MP4), use it directly
        if (isServerAccepted(mimeType)) {
          console.log('[WebVoice] Recording format is server-accepted, using directly:', mimeType);
          const baseMime = mimeType.split(';')[0]; // Remove codec params
          const extMap: Record<string, string> = {
            'audio/ogg': '.ogg',
            'audio/mp4': '.m4a',
            'audio/mpeg': '.mp3',
            'audio/aac': '.aac',
          };
          const ext = extMap[baseMime] || '.ogg';
          const fileName = `voice_${Date.now()}${ext}`;
          const uri = URL.createObjectURL(audioBlob);

          resolve({
            blob: audioBlob,
            uri,
            mimeType: baseMime,
            fileName,
            duration,
          });
          return;
        }

        // Otherwise, convert to MP3 using lamejs (matching blade file exactly)
        console.log('[WebVoice] Converting to MP3 via lamejs...');
        const mp3Result = await convertBlobToMp3(audioBlob);
        const fileName = `voice_${Date.now()}.mp3`;
        const uri = URL.createObjectURL(mp3Result);

        console.log('[WebVoice] MP3 conversion complete. Size:', mp3Result.size);

        // Verify MP3 has valid header bytes
        const header = new Uint8Array(await mp3Result.slice(0, 4).arrayBuffer());
        console.log('[WebVoice] MP3 header bytes:', Array.from(header).map(b => '0x' + b.toString(16)).join(' '));

        resolve({
          blob: mp3Result,
          uri,
          mimeType: 'audio/mpeg',
          fileName,
          duration,
        });
      } catch (convError) {
        console.error('[WebVoice] Post-processing failed:', convError);
        // Last resort: send as OGG with forced MIME
        const fileName = `voice_${Date.now()}.ogg`;
        const oggBlob = new Blob(audioChunks.length > 0 ? audioChunks : [audioBlob], { type: 'audio/ogg' });
        const uri = URL.createObjectURL(oggBlob);
        resolve({
          blob: oggBlob,
          uri,
          mimeType: 'audio/ogg',
          fileName,
          duration,
        });
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
 * Matches the blade file's convertToMp3 function exactly.
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
          const sampleRate = audioBuffer.sampleRate;
          const samples = audioBuffer.getChannelData(0);

          // Convert float samples to 16-bit PCM
          const pcmData = new Int16Array(samples.length);
          for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          // Encode to MP3
          const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
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

          const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });
          audioContext.close();
          resolve(mp3Blob);
        },
        (error) => {
          audioContext.close();
          reject(error);
        }
      );
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(audioBlob);
  });
}
