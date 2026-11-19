declare module 'text-encoding' {
  const encoding: { TextEncoder: typeof TextEncoder; TextDecoder: typeof TextDecoder };
  export default encoding;
}
declare module 'react-native-url-polyfill/auto';
declare module 'react-native-libauth/setup';
declare module '@bitauth/libauth/build/lib/crypto/default-crypto-instances.js' {
  export function initializeNativeCrypto(): Promise<void>;
}
declare const __DEV__: boolean;
