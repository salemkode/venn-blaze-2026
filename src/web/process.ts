// Minimal `process` for libraries that probe it in a browser.
export default {
  browser: true,
  env: { NODE_ENV: __DEV__ ? 'development' : 'production' },
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
    Promise.resolve().then(() => callback(...args)),
  version: '',
  versions: {},
};
