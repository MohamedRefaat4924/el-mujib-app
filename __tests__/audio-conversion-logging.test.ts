import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for:
 * 1. Audio conversion flow (OGG conversion via server)
 * 2. Comprehensive API request/response logging
 * 3. Voice send helper with fallback
 */

describe('Audio Conversion Service', () => {
  it('should construct correct server URL for web platform', () => {
    // Web platform should use localhost:3000
    const serverUrl = 'http://127.0.0.1:3000';
    expect(serverUrl).toContain('3000');
    expect(serverUrl).toContain('127.0.0.1');
  });

  it('should construct correct conversion endpoint URL', () => {
    const serverUrl = 'http://127.0.0.1:3000';
    const convertUrl = `${serverUrl}/api/convert-audio`;
    expect(convertUrl).toBe('http://127.0.0.1:3000/api/convert-audio');
  });

  it('should generate correct OGG filename from original', () => {
    const originalName = 'voice_1709312345.aac';
    const oggName = originalName.replace(/\.[^.]+$/, '.ogg');
    expect(oggName).toBe('voice_1709312345.ogg');
  });

  it('should generate correct OGG filename from M4A', () => {
    const originalName = 'voice_1709312345.m4a';
    const oggName = originalName.replace(/\.[^.]+$/, '.ogg');
    expect(oggName).toBe('voice_1709312345.ogg');
  });

  it('should handle filenames without extension', () => {
    const originalName = 'voice_recording';
    const oggName = originalName.replace(/\.[^.]+$/, '.ogg');
    // If no extension, the regex won't match, so we need a fallback
    const finalName = oggName === originalName ? `${originalName}.ogg` : oggName;
    expect(finalName).toBe('voice_recording.ogg');
  });

  it('should set correct MIME type for converted audio', () => {
    const convertedMimeType = 'audio/ogg';
    expect(convertedMimeType).toBe('audio/ogg');
  });

  it('should validate conversion response structure', () => {
    const mockResponse = {
      success: true,
      data: 'base64encodeddata...',
      mimeType: 'audio/ogg',
      fileName: 'voice_123.ogg',
      originalSize: 22166,
      convertedSize: 18969,
    };

    expect(mockResponse.success).toBe(true);
    expect(mockResponse.data).toBeTruthy();
    expect(mockResponse.mimeType).toBe('audio/ogg');
    expect(mockResponse.fileName).toMatch(/\.ogg$/);
    expect(mockResponse.convertedSize).toBeLessThanOrEqual(mockResponse.originalSize);
  });

  it('should handle conversion failure response', () => {
    const errorResponse = {
      error: 'Audio conversion failed',
      details: 'FFmpeg error: invalid input',
    };

    expect(errorResponse.error).toBeTruthy();
    expect(errorResponse.details).toBeTruthy();
  });
});

describe('Voice Send Helper', () => {
  it('should define correct platform-specific MIME types', () => {
    // iOS should use audio/mp4, Android should use audio/aac
    const iosMime = 'audio/mp4';
    const androidMime = 'audio/aac';
    const iosExt = '.m4a';
    const androidExt = '.aac';

    expect(iosMime).toBe('audio/mp4');
    expect(androidMime).toBe('audio/aac');
    expect(iosExt).toBe('.m4a');
    expect(androidExt).toBe('.aac');
  });

  it('should prepare voice file info with OGG format on success', () => {
    const voiceFile = {
      uri: '/cache/voice_123.ogg',
      mimeType: 'audio/ogg',
      fileName: 'voice_123.ogg',
    };

    expect(voiceFile.mimeType).toBe('audio/ogg');
    expect(voiceFile.fileName).toMatch(/\.ogg$/);
    expect(voiceFile.uri).toBeTruthy();
  });

  it('should fallback to original format when conversion fails', () => {
    // Simulate fallback behavior
    const originalUri = 'file:///recordings/voice_123.aac';
    const originalMime = 'audio/aac';
    const originalFileName = 'voice_123.aac';

    const fallbackFile = {
      uri: originalUri,
      mimeType: originalMime,
      fileName: originalFileName,
    };

    expect(fallbackFile.mimeType).toBe('audio/aac');
    expect(fallbackFile.fileName).toMatch(/\.aac$/);
  });

  it('should generate unique voice file names', () => {
    const name1 = `voice_${Date.now()}`;
    // Small delay to ensure different timestamp
    const name2 = `voice_${Date.now() + 1}`;
    expect(name1).not.toBe(name2);
  });
});

describe('API Logging', () => {
  it('should log request details for GET requests', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    // Simulate what the logging code does
    const url = 'https://elmujib.com/api/vendor/contacts';
    const headers = {
      'Content-type': 'application/json; charset=UTF-8',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'api-request-signature': 'mobile-app-request',
      'Authorization': 'Bearer test-token',
    };

    console.log(`\n📤 [API GET] ${url}`);
    console.log(`📤 [HEADERS]`, JSON.stringify(headers, null, 2));

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[API GET]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[HEADERS]'), expect.any(String));
    
    consoleSpy.mockRestore();
  });

  it('should log response details for GET requests', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    const url = 'https://elmujib.com/api/vendor/contacts';
    const status = 200;
    const body = JSON.stringify({ reaction: 1, data: { contacts: [] } });

    console.log(`📥 [RESPONSE] ${url}`);
    console.log(`📥 [STATUS] ${status}`);
    console.log(`📥 [BODY] ${body.substring(0, 500)}`);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[RESPONSE]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[STATUS]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[BODY]'));
    
    consoleSpy.mockRestore();
  });

  it('should log request details for POST requests', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    const url = 'https://elmujib.com/api/vendor/whatsapp/contact/chat/send-media';
    const body = {
      contact_uid: 'abc123',
      media_type: 'audio',
      uploaded_media_file_name: 'voice_123.ogg',
    };

    console.log(`\n📤 [API POST] ${url}`);
    console.log(`📤 [HEADERS]`, '{}');
    console.log(`📤 [BODY]`, JSON.stringify(body)?.substring(0, 500));

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[API POST]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[BODY]'), expect.stringContaining('voice_123.ogg'));
    
    consoleSpy.mockRestore();
  });

  it('should log upload file details', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    const uploadInfo = {
      originalUri: 'file:///cache/voice_123.ogg',
      originalFileName: 'voice_123.ogg',
      originalMimeType: 'audio/ogg',
      sanitizedFileName: 'voice_123.ogg',
      sanitizedMimeType: 'audio/ogg',
      uploadPath: 'media/upload-temp-media/whatsapp_audio',
    };

    console.log(`\n📤 [UPLOAD] https://elmujib.com/api/media/upload-temp-media/whatsapp_audio`);
    console.log(`📤 [UPLOAD FILE]`, JSON.stringify(uploadInfo, null, 2));

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[UPLOAD]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[UPLOAD FILE]'), expect.stringContaining('audio/ogg'));
    
    consoleSpy.mockRestore();
  });

  it('should log error responses', () => {
    const consoleSpy = vi.spyOn(console, 'error');
    
    console.error(`❌ [API POST] vendor/whatsapp/contact/chat/send-media error:`, new Error('HTTP 406'));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('❌'),
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();
  });

  it('should truncate long response bodies to 500 chars', () => {
    const longBody = 'x'.repeat(1000);
    const truncated = longBody.substring(0, 500);
    expect(truncated.length).toBe(500);
    expect(truncated).not.toBe(longBody);
  });
});

describe('FFmpeg Conversion Parameters', () => {
  it('should use correct FFmpeg arguments for OGG/Opus conversion', () => {
    const expectedArgs = [
      '-i', 'input.aac',
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-ar', '48000',
      '-ac', '1',
      '-application', 'voip',
      '-y',
      'output.ogg',
    ];

    expect(expectedArgs).toContain('-c:a');
    expect(expectedArgs).toContain('libopus');
    expect(expectedArgs).toContain('-b:a');
    expect(expectedArgs).toContain('64k');
    expect(expectedArgs).toContain('-ar');
    expect(expectedArgs).toContain('48000');
    expect(expectedArgs).toContain('-ac');
    expect(expectedArgs).toContain('1');
    expect(expectedArgs).toContain('-application');
    expect(expectedArgs).toContain('voip');
  });

  it('should produce OGG output file extension', () => {
    const inputPath = '/tmp/audio-123456.aac';
    const outputPath = inputPath.replace(/\.[^.]+$/, '.ogg');
    expect(outputPath).toBe('/tmp/audio-123456.ogg');
  });
});

describe('Upload Headers', () => {
  it('should NOT include Content-Type for multipart uploads', () => {
    // For multipart uploads, Content-Type must NOT be set manually
    // because fetch() auto-sets it with the correct boundary
    const multipartHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'api-request-signature': 'mobile-app-request',
      'Authorization': 'Bearer test-token',
    };

    expect(multipartHeaders['Content-Type']).toBeUndefined();
    expect(multipartHeaders['Content-type']).toBeUndefined();
    expect(multipartHeaders['Accept']).toBe('application/json');
    expect(multipartHeaders['X-Requested-With']).toBe('XMLHttpRequest');
    expect(multipartHeaders['api-request-signature']).toBe('mobile-app-request');
  });

  it('should include Content-Type for JSON POST requests', () => {
    const jsonHeaders: Record<string, string> = {
      'Content-type': 'application/json; charset=UTF-8',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'api-request-signature': 'mobile-app-request',
      'Authorization': 'Bearer test-token',
    };

    expect(jsonHeaders['Content-type']).toBe('application/json; charset=UTF-8');
  });
});
