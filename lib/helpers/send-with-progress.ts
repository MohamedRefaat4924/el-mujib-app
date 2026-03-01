/**
 * Helper to wrap sendMediaMessage with progress tracking.
 * Provides a callback that updates upload progress state.
 */

export type ProgressCallback = (progress: number, step: string) => void;

export function createProgressHandler(
  setUploadProgress: (p: { progress: number; step: string } | null) => void
): ProgressCallback {
  return (progress: number, step: string) => {
    setUploadProgress({ progress, step });
  };
}

export function clearProgress(
  setUploadProgress: (p: { progress: number; step: string } | null) => void
): void {
  // Small delay so user can see "Sent!" briefly
  setTimeout(() => {
    setUploadProgress(null);
  }, 1000);
}
