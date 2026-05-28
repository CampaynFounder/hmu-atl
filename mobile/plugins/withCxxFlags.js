const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// C++20 is required by Hermes/Fabric on Expo SDK 56 / RN 0.85. Once C++20 is on,
// folly auto-detects __cpp_impl_coroutine and sets FOLLY_HAS_COROUTINES=1, which
// makes folly/Expected.h include <folly/coro/Coroutine.h> — a header that is not
// shipped in the ReactNativeDependencies prebuilt tarball. folly explicitly
// supports opting out of coroutine support with FOLLY_CFG_NO_COROUTINES; the
// gated co_await Expected/Optional helpers are unused by RN/Expo.
module.exports = function withCxxFlags(config) {
  return withDangerousMod(config, ['ios', async (config) => {
    const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    let contents = fs.readFileSync(podfile, 'utf8');

    const inject = [
      '',
      '  installer.pods_project.targets.each do |target|',
      '    target.build_configurations.each do |cfg|',
      "      cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'",
      "      defs = cfg.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']",
      '      defs = [defs] unless defs.is_a?(Array)',
      "      defs << 'FOLLY_CFG_NO_COROUTINES=1' unless defs.include?('FOLLY_CFG_NO_COROUTINES=1')",
      "      cfg.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs",
      '    end',
      '  end',
      '',
    ].join('\n');

    if (contents.includes('FOLLY_CFG_NO_COROUTINES=1')) {
      return config;
    }

    contents = contents.replace(
      /post_install do \|installer\|/,
      `post_install do |installer|${inject}`,
    );

    fs.writeFileSync(podfile, contents);
    return config;
  }]);
};
