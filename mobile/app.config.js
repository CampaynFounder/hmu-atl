// Dynamic Expo config. app.json remains the source of truth; this only injects
// the Mapbox SECRET download token (sk., Downloads:Read) into the
// @rnmapbox/maps config plugin at build time from an env var / EAS secret, so
// the secret is never committed. Set it as an EAS project secret:
//   eas secret:create --scope project --name RNMAPBOX_DOWNLOAD_TOKEN --value <sk_token> --type string
// (The public pk. runtime token stays in EXPO_PUBLIC_MAPBOX_TOKEN.)

module.exports = ({ config }) => {
  const downloadToken = process.env.RNMAPBOX_DOWNLOAD_TOKEN;

  const plugins = (config.plugins || []).map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name === '@rnmapbox/maps') {
      return ['@rnmapbox/maps', { RNMapboxMapsDownloadToken: downloadToken }];
    }
    return plugin;
  });

  return { ...config, plugins };
};
