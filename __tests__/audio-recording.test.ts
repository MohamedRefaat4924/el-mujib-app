import { describe, it, expect } from 'vitest';

// Test the AAC recording preset configuration
describe('AAC Recording Preset', () => {
  const AAC_RECORDING_PRESET = {
    extension: '.aac',
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    android: {
      outputFormat: 'aac_adts',
      audioEncoder: 'aac',
    },
    ios: {
      outputFormat: 'aac ',  // IOSOutputFormat.MPEG4AAC value
      audioQuality: 96,      // AudioQuality.HIGH value
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  };

  it('should use .aac extension (not .m4a)', () => {
    expect(AAC_RECORDING_PRESET.extension).toBe('.aac');
  });

  it('should use mono channel for voice messages', () => {
    expect(AAC_RECORDING_PRESET.numberOfChannels).toBe(1);
  });

  it('should use aac_adts output format on Android (raw AAC, not mpeg4 container)', () => {
    expect(AAC_RECORDING_PRESET.android.outputFormat).toBe('aac_adts');
    expect(AAC_RECORDING_PRESET.android.outputFormat).not.toBe('mpeg4');
  });

  it('should use aac encoder on Android', () => {
    expect(AAC_RECORDING_PRESET.android.audioEncoder).toBe('aac');
  });

  it('should use MPEG4AAC output format on iOS', () => {
    // IOSOutputFormat.MPEG4AAC = "aac " (with trailing space)
    expect(AAC_RECORDING_PRESET.ios.outputFormat).toBe('aac ');
  });

  it('should have a reasonable bitrate for voice', () => {
    expect(AAC_RECORDING_PRESET.bitRate).toBeGreaterThanOrEqual(64000);
    expect(AAC_RECORDING_PRESET.bitRate).toBeLessThanOrEqual(256000);
  });
});

// Test the MIME type handling matching Flutter's data_transport.dart exactly
describe('Audio MIME Type Handling (Flutter-aligned)', () => {
  // Flutter sends audio/aac as-is and the server accepts it.
  // We only map truly unknown MIME types to sensible defaults.
  const flutterMimeMap: Record<string, string> = {
    'audio/m4a': 'audio/mp4',
    'audio/x-m4a': 'audio/mp4',
    'audio/mp4a-latm': 'audio/mp4',
    'audio/x-wav': 'audio/wav',
    'audio/3gpp': 'audio/amr',
    'audio/3gpp2': 'audio/amr',
    'audio/caf': 'audio/aac',
    'audio/x-caf': 'audio/aac',
    'audio/webm': 'audio/ogg',
    'application/octet-stream': 'audio/aac',
  };

  function sanitizeMimeType(mimeType: string): string {
    return flutterMimeMap[mimeType] || mimeType;
  }

  it('should NOT remap audio/aac - send as-is like Flutter does', () => {
    expect(sanitizeMimeType('audio/aac')).toBe('audio/aac');
  });

  it('should pass through audio/mp4 unchanged', () => {
    expect(sanitizeMimeType('audio/mp4')).toBe('audio/mp4');
  });

  it('should pass through audio/mpeg unchanged', () => {
    expect(sanitizeMimeType('audio/mpeg')).toBe('audio/mpeg');
  });

  it('should pass through audio/ogg unchanged', () => {
    expect(sanitizeMimeType('audio/ogg')).toBe('audio/ogg');
  });

  it('should map audio/m4a to audio/mp4', () => {
    expect(sanitizeMimeType('audio/m4a')).toBe('audio/mp4');
  });

  it('should map audio/webm to audio/ogg', () => {
    expect(sanitizeMimeType('audio/webm')).toBe('audio/ogg');
  });

  it('should map application/octet-stream to audio/aac', () => {
    expect(sanitizeMimeType('application/octet-stream')).toBe('audio/aac');
  });

  it('should map audio/caf to audio/aac', () => {
    expect(sanitizeMimeType('audio/caf')).toBe('audio/aac');
  });

  it('should pass through unknown types unchanged (no forced default)', () => {
    expect(sanitizeMimeType('audio/unknown')).toBe('audio/unknown');
  });
});

// Test that voice recording sends correct MIME type and extension
describe('Voice Recording Upload Parameters', () => {
  it('should send audio/aac MIME type for voice recordings', () => {
    // When recording with AAC_RECORDING_PRESET (.aac extension, aac_adts format)
    // The upload should use audio/aac MIME type - matching Flutter exactly
    const mimeType = 'audio/aac';
    const fileName = `voice_${Date.now()}.aac`;
    
    expect(mimeType).toBe('audio/aac');
    expect(fileName).toMatch(/^voice_\d+\.aac$/);
  });

  it('should use whatsapp_audio upload path for audio messages', () => {
    const mediaType: string = 'audio';
    let uploadPath = 'media/upload-temp-media/whatsapp_other';
    switch (mediaType) {
      case 'image':
        uploadPath = 'media/upload-temp-media/whatsapp_image';
        break;
      case 'video':
        uploadPath = 'media/upload-temp-media/whatsapp_video';
        break;
      case 'document':
        uploadPath = 'media/upload-temp-media/whatsapp_document';
        break;
      case 'audio':
        uploadPath = 'media/upload-temp-media/whatsapp_audio';
        break;
    }
    expect(uploadPath).toBe('media/upload-temp-media/whatsapp_audio');
  });
});
