/**
 * Compute normalized amplitude [0,1] from an audio frame buffer.
 * Supports both Int16Array (raw PCM) and Float32Array (normalized [-1,1]).
 */
export function getAudioAmplitude(
  buffer: ArrayLike<number> | Int16Array | Float32Array | number[]
): number {
  if (!buffer || buffer.length === 0) return 0;

  let maxAbs = 0;
  let denom = 32767; // default for Int16

  const isFloat = buffer instanceof Float32Array;
  if (isFloat) denom = 1;

  for (let i = 0; i < buffer.length; i++) {
    const value = Math.abs(buffer[i]);
    if (value > maxAbs) maxAbs = value;
  }

  // Heuristic: if values are in [-1,1] range, treat as normalized floats
  if (!isFloat && maxAbs > 0 && maxAbs <= 1.0001) {
    denom = 1;
  }

  const normalized = maxAbs / denom;
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Boost raw amplitude for UI visualization.
 * Applies power curve + scaling for better visual feedback.
 */
export function mapAmplitudeForUi(raw: number): number {
  const boosted = Math.pow(raw, 0.5);
  return Math.max(0, Math.min(1, boosted * 1.5));
}
