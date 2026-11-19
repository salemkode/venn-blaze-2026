import { sha256 } from './crypto';

/** Fail closed if the native backend is absent or does not pass a known hash vector. */
export async function initializeLibauth() {
  const digest = Array.from(sha256.hash(new Uint8Array()), byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    throw new Error('Native crypto self-check failed.');
}
