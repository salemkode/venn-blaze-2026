// Browser-only WASM initialization, retaining the previous adapter initialization contract.
import { instantiateSha1 } from '@bitauth/libauth/build/lib/crypto/sha1.js';
import { instantiateSha256 } from '@bitauth/libauth/build/lib/crypto/sha256.js';
import { instantiateSha512 } from '@bitauth/libauth/build/lib/crypto/sha512.js';
import { instantiateRipemd160 } from '@bitauth/libauth/build/lib/crypto/ripemd160.js';
import { instantiateSecp256k1 } from '@bitauth/libauth/build/lib/crypto/secp256k1.js';
const state = { instances: {}, promise: undefined };
function deferred(name) {
  return new Proxy({}, { get(_target, property) {
    const instance = state.instances[name];
    if (!instance) throw new Error('Call and await initializeLibauth() before using libauth crypto.');
    return instance[property];
  }, ownKeys() {
    const instance = state.instances[name];
    if (!instance) throw new Error('Call and await initializeLibauth() before inspecting libauth crypto.');
    return Reflect.ownKeys(instance);
  }, getOwnPropertyDescriptor(_target, property) {
    const instance = state.instances[name];
    if (!instance || !(property in instance)) return undefined;
    return { configurable: true, enumerable: true, value: instance[property], writable: false };
  }});
}
export const sha1 = deferred('sha1');
export const sha256 = deferred('sha256');
export const sha512 = deferred('sha512');
export const ripemd160 = deferred('ripemd160');
export const secp256k1 = deferred('secp256k1');
export function initializeNativeCrypto() {
  if (!state.promise) {
    state.promise = Promise.all([instantiateSha1(), instantiateSha256(), instantiateSha512(), instantiateRipemd160(), instantiateSecp256k1()])
      .then(instances => { state.instances.sha1 = instances[0]; state.instances.sha256 = instances[1]; state.instances.sha512 = instances[2]; state.instances.ripemd160 = instances[3]; state.instances.secp256k1 = instances[4]; })
      .catch(error => { state.promise = undefined; throw error; });
  }
  return state.promise;
}
