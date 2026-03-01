import { describe, it, expect } from 'vitest';

describe('Android Keystore Secrets', () => {
  it('ANDROID_KEYSTORE_PASSWORD is set', () => {
    expect(process.env.ANDROID_KEYSTORE_PASSWORD).toBeDefined();
    expect(process.env.ANDROID_KEYSTORE_PASSWORD!.length).toBeGreaterThan(0);
  });

  it('ANDROID_KEY_ALIAS is set', () => {
    expect(process.env.ANDROID_KEY_ALIAS).toBeDefined();
    expect(process.env.ANDROID_KEY_ALIAS).toBe('upload');
  });

  it('ANDROID_KEY_PASSWORD is set', () => {
    expect(process.env.ANDROID_KEY_PASSWORD).toBeDefined();
    expect(process.env.ANDROID_KEY_PASSWORD!.length).toBeGreaterThan(0);
  });
});
