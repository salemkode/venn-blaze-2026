module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'], plugins: [require.resolve('./modules/libauth-native/babel-plugin')] };
};
