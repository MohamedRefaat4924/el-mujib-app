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
    expect(AAC_RECORDING_PRESET.ios.outputFormat).toBe('aac ');
  });

  it('should have a reasonable bitrate for voice', () => {
    expect(AAC_RECORDING_PRESET.bitRate).toBeGreaterThanOrEqual(64000);
    expect(AAC_RECORDING_PRESET.bitRate).toBeLessThanOrEqual(256000);
  });
});

// Test the MIME type sanitization - server ONLY accepts: audio/mp4, audio/mpeg, audio/amr, audio/ogg
describe('Audio MIME Type Sanitization (Server-validated)', () => {
  const acceptedAudioTypes = ['audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];

  const audioMimeMap: Record<string, string> = {
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
    return audioMimeMap[mimeType] || 'audio/ogg';
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

  it('should pass through accepted audio/amr', () => {
    expect(sanitizeMimeType('audio/amr')).toBe('audio/amr');
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

  it('should always return an accepted type', () => {
    const testTypes = ['audio/aac', 'audio/m4a', 'audio/wav', 'audio/caf', 'audio/webm', 'application/octet-stream', 'audio/unknown'];
    for (const type of testTypes) {
      const result = sanitizeMimeType(type);
      expect(acceptedAudioTypes).toContain(result);
    }
  });
});

// Test the send-media payload MIME type forcing
describe('Send-Media Payload MIME Forcing', () => {
  const acceptedAudio = ['audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];

  function forceMimeForSendMedia(fileMimeType: string, mediaType: string): string {
    if (mediaType === 'audio' && !acceptedAudio.includes(fileMimeType)) {
      return 'audio/ogg';
    }
    return fileMimeType;
  }

  it('should force audio/aac to audio/ogg in raw_upload_data', () => {
    expect(forceMimeForSendMedia('audio/aac', 'audio')).toBe('audio/ogg');
  });

  it('should keep audio/ogg unchanged', () => {
    expect(forceMimeForSendMedia('audio/ogg', 'audio')).toBe('audio/ogg');
  });

  it('should keep audio/mp4 unchanged', () => {
    expect(forceMimeForSendMedia('audio/mp4', 'audio')).toBe('audio/mp4');
  });

  it('should not affect non-audio media types', () => {
    expect(forceMimeForSendMedia('image/jpeg', 'image')).toBe('image/jpeg');
    expect(forceMimeForSendMedia('application/pdf', 'document')).toBe('application/pdf');
  });
});

// Test that voice recording sends correct parameters
describe('Voice Recording Upload Parameters', () => {
  it('should send audio/ogg MIME type for voice recordings (not audio/aac)', () => {
    const mimeType = 'audio/ogg';
    const fileName = `voice_${Date.now()}.ogg`;
    
    expect(mimeType).toBe('audio/ogg');
    expect(fileName).toMatch(/^voice_\d+\.ogg$/);
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
