// Globals the WizardConnect relay needs on Hermes: a full URL, and a strict UTF-8 decoder
// (the one react-native-libauth installs rejects the `fatal` option).
import 'react-native-url-polyfill/auto';
import encoding from 'text-encoding';

function strictDecoder(Decoder: typeof TextDecoder | undefined) {
  try {
    new Decoder!('utf-8', { fatal: true }).decode(Uint8Array.of(0xff));
    return false;
  } catch (error) {
    return error instanceof TypeError;
  }
}

if (!strictDecoder(globalThis.TextDecoder))
  Object.defineProperty(globalThis, 'TextDecoder', { value: encoding.TextDecoder, configurable: true, writable: true });
if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = encoding.TextEncoder;
