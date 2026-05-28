const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// expo-modules-jsi 56.x ships Package.swift with swift-tools-version: 6.2,
// which requires Xcode 26 (Swift 6.2). Xcode 16.4 ships Swift 6.1.2 and
// refuses to parse the manifest, surfacing as "Could not resolve package
// dependencies" during build-xcframework.sh's inner xcodebuild call.
//
// The package's Swift sources only use Swift 6.0 features (sending, typed
// throws, nonisolated), so downgrading the manifest to 6.0 is safe.
module.exports = function withExpoModulesJsiPatch(config) {
  return withDangerousMod(config, ['ios', async (config) => {
    const packageSwiftPath = path.join(
      config.modRequest.projectRoot,
      'node_modules',
      'expo-modules-jsi',
      'apple',
      'Package.swift'
    );

    if (!fs.existsSync(packageSwiftPath)) {
      return config;
    }

    let contents = fs.readFileSync(packageSwiftPath, 'utf8');

    if (!contents.includes('swift-tools-version: 6.2')) {
      return config;
    }

    contents = contents.replace(
      '// swift-tools-version: 6.2',
      '// swift-tools-version: 6.0'
    );

    fs.writeFileSync(packageSwiftPath, contents);
    return config;
  }]);
};
