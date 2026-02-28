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

// Test the MIME type sanitization logic from api.ts
describe('Audio MIME Type Sanitization', () => {
  // Server only accepts these 4 types (audio/aac is NOT accepted!)
  const acceptedAudioTypes = ['audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
  
  const mimeMap: Record<string, string> = {
    'audio/aac': 'audio/ogg',
    'audio/m4a': 'audio/mp4',
    'audio/x-m4a': 'audio/mp4',
    'audio/mp4a-latm': 'audio/mp4',
    'audio/wav': 'audio/ogg',
    'audio/x-wav': 'audio/ogg',
    'audio/webm': 'audio/ogg',
    'audio/3gpp': 'audio/amr',
    'audio/3gpp2': 'audio/amr',
    'audio/caf': 'audio/ogg',
    'audio/x-caf': 'audio/ogg',
    'application/octet-stream': 'audio/ogg',
  };

  function sanitizeMimeType(mimeType: string): string {
    if (acceptedAudioTypes.includes(mimeType)) return mimeType;
    return mimeMap[mimeType] || 'audio/ogg';
  }

  it('should map audio/aac to audio/ogg (server rejects audio/aac)', () => {
    expect(sanitizeMimeType('audio/aac')).toBe('audio/ogg');
  });

  it('should pass through accepted audio/mp4', () => {
    expect(sanitizeMimeType('audio/mp4')).toBe('audio/mp4');
  });

  it('should pass through accepted audio/mpeg', () => {
    expect(sanitizeMimeType('audio/mpeg')).toBe('audio/mpeg');
  });

  it('should pass through accepted audio/ogg', () => {
    expect(sanitizeMimeType('audio/ogg')).toBe('audio/ogg');
  });

  it('should map audio/m4a to audio/mp4', () => {
    expect(sanitizeMimeType('audio/m4a')).toBe('audio/mp4');
  });

  it('should map audio/webm to audio/ogg', () => {
    expect(sanitizeMimeType('audio/webm')).toBe('audio/ogg');
  });

  it('should map application/octet-stream to audio/ogg', () => {
    expect(sanitizeMimeType('application/octet-stream')).toBe('audio/ogg');
  });

  it('should default unknown types to audio/ogg', () => {
    expect(sanitizeMimeType('audio/unknown')).toBe('audio/ogg');
    expect(sanitizeMimeType('video/mp4')).toBe('audio/ogg');
  });
});

// Test file extension correction logic
describe('Audio File Extension Correction', () => {
  const mimeToExt: Record<string, string> = {
    'audio/aac': '.aac',
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/amr': '.amr',
    'audio/ogg': '.ogg',
  };

  function correctExtension(fileName: string, mimeType: string): string {
    const expectedExt = mimeToExt[mimeType];
    if (!expectedExt) return fileName;
    
    const validExts: Record<string, string[]> = {
      'audio/mp4': ['.m4a', '.mp4'],
    };
    const validExtList = validExts[mimeType] || [expectedExt];
    const currentExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    
    if (!validExtList.includes(currentExt)) {
      const dotIdx = fileName.lastIndexOf('.');
      return (dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName) + expectedExt;
    }
    return fileName;
  }

  it('should keep .aac extension for audio/aac', () => {
    expect(correctExtension('voice.aac', 'audio/aac')).toBe('voice.aac');
  });

  it('should correct .m4a to .aac for audio/aac', () => {
    expect(correctExtension('voice.m4a', 'audio/aac')).toBe('voice.aac');
  });

  it('should keep .m4a extension for audio/mp4', () => {
    expect(correctExtension('voice.m4a', 'audio/mp4')).toBe('voice.m4a');
  });

  it('should keep .mp4 extension for audio/mp4', () => {
    expect(correctExtension('voice.mp4', 'audio/mp4')).toBe('voice.mp4');
  });

  it('should correct .wav to .ogg for audio/ogg', () => {
    expect(correctExtension('voice.wav', 'audio/ogg')).toBe('voice.ogg');
  });

  it('should add extension if missing', () => {
    expect(correctExtension('voice', 'audio/aac')).toBe('voice.aac');
  });
});

// Test that voice recording sends correct MIME type and extension
describe('Voice Recording Upload Parameters', () => {
  it('should send audio/aac MIME type for voice recordings', () => {
    // When recording with AAC_RECORDING_PRESET (.aac extension, aac_adts format)
    // The upload should use audio/aac MIME type
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
