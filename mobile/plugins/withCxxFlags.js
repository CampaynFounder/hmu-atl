const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withCxxFlags(config) {
  return withDangerousMod(config, ['ios', async (config) => {
    const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    let contents = fs.readFileSync(podfile, 'utf8');

    const inject = [
      '',
      '  installer.pods_project.targets.each do |target|',
      '    target.build_configurations.each do |cfg|',
      "      cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'",
      '    end',
      '  end',
      '',
    ].join('\n');

    if (contents.includes("cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD']")) {
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
