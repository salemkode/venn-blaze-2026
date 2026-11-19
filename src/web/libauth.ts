// Browser stand-in for react-native-libauth: libauth's own WASM crypto.
import { initializeNativeCrypto } from '@bitauth/libauth/build/lib/crypto/default-crypto-instances.js';

let ready: Promise<void> | undefined;
export const initializeLibauth = () => (ready ??= initializeNativeCrypto());
