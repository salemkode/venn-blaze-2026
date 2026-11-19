import './src/polyfills';
import { initializeLibauth } from 'react-native-libauth';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Load only after the platform backend is ready.
initializeLibauth().then(() => require('expo-router/entry'));
