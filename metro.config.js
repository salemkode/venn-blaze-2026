const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withLibauthNative } = require('./modules/libauth-native/metro');

const config = withLibauthNative(getDefaultConfig(__dirname));
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-keychain')
    return { type: 'sourceFile', filePath: path.join(__dirname, 'src/web/keychain.ts') };
  const result = upstream(context, moduleName, platform);
  if (platform === 'web' && result.type === 'sourceFile' && result.filePath.endsWith('/crypto/default-crypto-instances.js'))
    return { type: 'sourceFile', filePath: path.join(__dirname, 'modules/libauth-native/src/web-crypto.js') };
  return result;
};
module.exports = config;
