/**
 * Voice Recorder Hook
 * 
 * Uses react-native-audio-recorder-player to record audio directly in AMR format.
 * AMR is natively accepted by the elmujib.com server (audio/amr) — no conversion needed.
 * 
 * On Android: Records AMR_NB format natively
 * On iOS: Records AMR format natively via AVFormatIDKeyIOS = 'amr'
 * On Web: Falls back to webm (not supported by this library)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

// Types from react-native-audio-recorder-player
interface RecorderState {
  isRecording: boolean;
  durationMs: number;
  uri: string | null;
}

let AudioRecorderPlayer: any = null;

// Lazy-load the native module (not available on web)
function getRecorderModule() {
  if (!AudioRecorderPlayer) {
    try {
      const mod = require('react-native-audio-recorder-player');
      AudioRecorderPlayer = mod.default || mod;
    } catch (e) {
      console.warn('[VoiceRecorder] react-native-audio-recorder-player not available:', e);
      return null;
    }
  }
  return AudioRecorderPlayer;
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const recorderRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recorderRef.current && isRecording) {
        try {
          recorderRef.current.stopRecorder();
        } catch (e) {
          // ignore cleanup errors
        }
      }
    };
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      console.warn('[VoiceRecorder] Not supported on web');
      return false;
    }

    try {
      const RecorderClass = getRecorderModule();
      if (!RecorderClass) {
        console.error('[VoiceRecorder] Module not available');
        return false;
      }

      // Create a new instance for each recording
      const recorder = new RecorderClass();
      recorderRef.current = recorder;

      // Configure for AMR recording
      const audioSet = Platform.OS === 'android' ? {
        // Android: AMR_NB format with AMR_NB encoder
        AudioSourceAndroid: 1, // MIC
        OutputFormatAndroid: 3, // AMR_NB
        AudioEncoderAndroid: 1, // AMR_NB
        AudioSamplingRate: 8000, // AMR-NB uses 8kHz
        AudioChannels: 1, // Mono
        AudioEncodingBitRate: 12200, // Standard AMR-NB bitrate
      } : {
        // iOS: AMR encoding
        AVFormatIDKeyIOS: 'amr',
        AVSampleRateKeyIOS: 8000,
        AVNumberOfChannelsKeyIOS: 1,
        AVEncoderAudioQualityKeyIOS: 0x60, // high quality
      };

      // Generate a unique filename with .amr extension
      const fileName = `voice_${Date.now()}.amr`;
      
      console.log('[VoiceRecorder] Starting AMR recording:', {
        platform: Platform.OS,
        fileName,
        audioSet,
      });

      // Add recording back listener for duration updates
      recorder.addRecordBackListener((e: any) => {
        setDurationMs(Math.floor(e.currentPosition));
      });

      // Start recording
      const uri = await recorder.startRecorder(
        undefined, // use default path
        audioSet,
        true, // enable metering
      );

      console.log('[VoiceRecorder] Recording started, URI:', uri);
      
      setIsRecording(true);
      setDurationMs(0);
      setRecordingUri(null);
      startTimeRef.current = Date.now();

      return true;
    } catch (e: any) {
      console.error('[VoiceRecorder] Start error:', e);
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<{ uri: string; durationMs: number } | null> => {
    if (!recorderRef.current) return null;

    try {
      const recorder = recorderRef.current;
      const uri = await recorder.stopRecorder();
      recorder.removeRecordBackListener();
      
      const finalDuration = durationMs || (Date.now() - startTimeRef.current);
      
      console.log('[VoiceRecorder] Recording stopped:', {
        uri,
        durationMs: finalDuration,
      });

      setIsRecording(false);
      setRecordingUri(uri);
      recorderRef.current = null;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      return { uri, durationMs: finalDuration };
    } catch (e: any) {
      console.error('[VoiceRecorder] Stop error:', e);
      setIsRecording(false);
      recorderRef.current = null;
      return null;
    }
  }, [durationMs]);

  const cancelRecording = useCallback(async () => {
    if (!recorderRef.current) return;

    try {
      const recorder = recorderRef.current;
      await recorder.stopRecorder();
      recorder.removeRecordBackListener();
    } catch (e) {
      // ignore
    }

    setIsRecording(false);
    setDurationMs(0);
    setRecordingUri(null);
    recorderRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    isRecording,
    durationMs,
    recordingUri,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
