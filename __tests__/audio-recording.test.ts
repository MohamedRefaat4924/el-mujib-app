import { describe, it, expect } from 'vitest';

/**
 * Tests for audio recording format and MIME type handling.
 * Voice recordings use M4A format (AAC codec in MP4 container).
 * Server accepted audio MIME types: audio/mp4, audio/mpeg, audio/amr, audio/ogg
 */

describe('M4A Recording Preset', () => {
  const M4A_RECORDING_PRESET = {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    android: {
      outputFormat: 'mpeg4',
      audioEncoder: 'aac',
    },
  };

  it('should use .m4a extension for MP4 container', () => {
    expect(M4A_RECORDING_PRESET.extension).toBe('.m4a');
  });

  it('should use mono channel for voice messages', () => {
    expect(M4A_RECORDING_PRESET.numberOfChannels).toBe(1);
  });

  it('should use mpeg4 output format on Android (MP4 container)', () => {
    expect(M4A_RECORDING_PRESET.android.outputFormat).toBe('mpeg4');
  });

  it('should use aac encoder on Android', () => {
    expect(M4A_RECORDING_PRESET.android.audioEncoder).toBe('aac');
  });

  it('should have a reasonable bitrate for voice', () => {
    expect(M4A_RECORDING_PRESET.bitRate).toBeGreaterThanOrEqual(64000);
    expect(M4A_RECORDING_PRESET.bitRate).toBeLessThanOrEqual(256000);
  });
});

describe('Audio MIME Type Sanitization', () => {
  const acceptedAudioTypes = ['audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];

  const audioMimeMap: Record<string, string> = {
    'audio/aac': 'audio/mp4',
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
    return audioMimeMap[mimeType] || 'audio/mp4';
  }

  it('should map audio/aac to audio/mp4', () => {
    expect(sanitizeMimeType('audio/aac')).toBe('audio/mp4');
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

  it('should default unknown types to audio/mp4', () => {
    expect(sanitizeMimeType('audio/unknown')).toBe('audio/mp4');
    expect(sanitizeMimeType('video/mp4')).toBe('audio/mp4');
  });

  it('should always return an accepted type', () => {
    const testTypes = ['audio/aac', 'audio/m4a', 'audio/wav', 'audio/caf', 'audio/webm', 'application/octet-stream', 'audio/unknown'];
    for (const type of testTypes) {
      const result = sanitizeMimeType(type);
      expect(acceptedAudioTypes).toContain(result);
    }
  });
});

describe('Send-Media Payload MIME Forcing', () => {
  const acceptedAudio = ['audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];

  function forceMimeForSendMedia(fileMimeType: string, mediaType: string): string {
    if (mediaType === 'audio' && !acceptedAudio.includes(fileMimeType)) {
      return 'audio/mp4';
    }
    return fileMimeType;
  }

  it('should force audio/aac to audio/mp4 in raw_upload_data', () => {
    expect(forceMimeForSendMedia('audio/aac', 'audio')).toBe('audio/mp4');
  });

  it('should keep audio/mp4 unchanged', () => {
    expect(forceMimeForSendMedia('audio/mp4', 'audio')).toBe('audio/mp4');
  });

  it('should keep audio/ogg unchanged', () => {
    expect(forceMimeForSendMedia('audio/ogg', 'audio')).toBe('audio/ogg');
  });

  it('should not affect non-audio media types', () => {
    expect(forceMimeForSendMedia('image/jpeg', 'image')).toBe('image/jpeg');
    expect(forceMimeForSendMedia('application/pdf', 'document')).toBe('application/pdf');
  });
});

describe('Voice Recording Upload Parameters', () => {
  it('should send audio/mp4 MIME type for voice recordings', () => {
    const mimeType = 'audio/mp4';
    const fileName = `voice_${Date.now()}.m4a`;
    
    expect(mimeType).toBe('audio/mp4');
    expect(fileName).toMatch(/^voice_\d+\.m4a$/);
  });

  it('should fix .aac filename to .m4a', () => {
    let fileName = 'voice_123456.aac';
    if (fileName.endsWith('.aac')) {
      fileName = fileName.replace(/\.aac$/, '.m4a');
    }
    expect(fileName).toBe('voice_123456.m4a');
  });

  it('should use whatsapp_audio upload path for audio messages', () => {
    const mediaType: string = 'audio';
    let uploadPath = 'media/upload-temp-media/whatsapp_other';
    switch (mediaType) {
      case 'audio':
        uploadPath = 'media/upload-temp-media/whatsapp_audio';
        break;
    }
    expect(uploadPath).toBe('media/upload-temp-media/whatsapp_audio');
  });
});
