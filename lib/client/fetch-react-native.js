// This adds streaming support to react-native fetch
// when react-native-fetch-api polyfill is installed
module.exports = function fetch(url, options) {
  // @ts-ignore
  return window.fetch(url, {
    ...options,
    reactNative: { textStreaming: true },
  });
};
