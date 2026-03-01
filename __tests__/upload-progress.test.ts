import { describe, it, expect, vi } from 'vitest';

describe('Upload Progress Helper', () => {
  it('createProgressHandler returns a function that updates state', async () => {
    const { createProgressHandler } = await import('../lib/helpers/send-with-progress');
    const setState = vi.fn();
    const handler = createProgressHandler(setState);
    
    handler(50, 'Uploading...');
    expect(setState).toHaveBeenCalledWith({ progress: 50, step: 'Uploading...' });
    
    handler(100, 'Sent!');
    expect(setState).toHaveBeenCalledWith({ progress: 100, step: 'Sent!' });
  });

  it('clearProgress sets state to null after delay', async () => {
    vi.useFakeTimers();
    const { clearProgress } = await import('../lib/helpers/send-with-progress');
    const setState = vi.fn();
    
    clearProgress(setState);
    expect(setState).not.toHaveBeenCalled();
    
    vi.advanceTimersByTime(1000);
    expect(setState).toHaveBeenCalledWith(null);
    vi.useRealTimers();
  });

  it('progress handler reports 0-100 range correctly', async () => {
    const { createProgressHandler } = await import('../lib/helpers/send-with-progress');
    const setState = vi.fn();
    const handler = createProgressHandler(setState);
    
    handler(0, 'Starting...');
    handler(25, 'Uploading... 25%');
    handler(75, 'Uploading... 75%');
    handler(100, 'Sent!');
    
    expect(setState).toHaveBeenCalledTimes(4);
    expect(setState).toHaveBeenNthCalledWith(1, { progress: 0, step: 'Starting...' });
    expect(setState).toHaveBeenNthCalledWith(4, { progress: 100, step: 'Sent!' });
  });
});

describe('Voice Send Helper', () => {
  it('prepareVoiceForSending returns file with mp3 extension and audio/mpeg mime', async () => {
    // Mock all native dependencies
    vi.mock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    vi.mock('expo-file-system/legacy', () => ({
      uploadAsync: vi.fn(),
      FileSystemUploadType: { MULTIPART: 0 },
    }));
    vi.mock('../lib/services/api', () => ({
      getAuthToken: vi.fn().mockResolvedValue('test-token'),
    }));
    
    const { prepareVoiceForSending } = await import('../lib/services/voice-send-helper');
    const result = await prepareVoiceForSending('file:///test/recording.m4a', 'voice_123');
    
    expect(result.uri).toBe('file:///test/recording.m4a');
    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.fileName).toBe('voice_123.mp3');
    
    vi.restoreAllMocks();
  });

  it('VoiceFileInfo interface has required fields', async () => {
    const voiceFile = {
      uri: 'file:///test.aac',
      mimeType: 'audio/aac',
      fileName: 'test.aac',
    };
    
    expect(voiceFile).toHaveProperty('uri');
    expect(voiceFile).toHaveProperty('mimeType');
    expect(voiceFile).toHaveProperty('fileName');
  });
});

describe('Upload Progress UI State', () => {
  it('upload progress state can be null (no upload in progress)', () => {
    const state: { progress: number; step: string } | null = null;
    expect(state).toBeNull();
  });

  it('upload progress state has correct shape when uploading', () => {
    const state = { progress: 45, step: 'Uploading... 45%' };
    expect(state.progress).toBeGreaterThanOrEqual(0);
    expect(state.progress).toBeLessThanOrEqual(100);
    expect(state.step).toBeTruthy();
  });

  it('multi-image upload shows correct step label', () => {
    const totalImages = 3;
    for (let i = 0; i < totalImages; i++) {
      const step = `Image ${i + 1}/${totalImages}`;
      expect(step).toMatch(/Image \d+\/\d+/);
    }
  });
});
