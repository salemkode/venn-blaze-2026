# Expo libauth adapter

This local Expo Modules package provides the native LibauthNative module for Expo 58 / React Native 0.88. Its native kernels, bridge and Metro redirects were reused from Focus Garden's local module, with storage adapters removed. License notices are included for [the Expo module](LICENSE), [Libauth-derived code](LICENSE.libauth), and [the vendored secp256k1 fork](cpp/secp256k1/COPYING).

The package is named react-native-libauth with version 0.2.2-rc.1 to meet react-native-xo's existing adapter peer contract. It is a private local compatibility implementation, not the separately published RN 0.81 adapter release. Do not publish this folder as that release. Only initializeLibauth is required by the wallet package; on native it performs a known SHA-256 self-check and fails if native crypto is absent or incorrect. Metro redirects libauth's crypto imports to the Expo native backend.

On web, the adapter uses libauth WASM with deferred initialization. The app's extensionless entry resolves index.web.ts, which awaits this backend before starting Router. Node tests use unmodified libauth WASM.

Run npm run test:native-core from the app root for C/WASM differential checks. Device proof uses the Expo developer menu → Development checks in a signed development build. Never use wallet recovery phrases in checks or debugger output.
