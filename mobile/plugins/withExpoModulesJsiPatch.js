const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// On Xcode 26.2, hermes/hermes.h transitively requires folly/coro/Coroutine.h
// during expo-modules-jsi's build-xcframework.sh inner xcodebuild.
// Neither ReactNativeDependencies prebuilt nor RCT-Folly.podspec expose
// folly/coro/*.h to the header search paths, so the preprocessor fails.
//
// Fix: inject a Podfile post_install hook that writes a no-op stub at
// Pods/Headers/Public/folly/coro/Coroutine.h. Package.swift's first search
// path is publicHeaders = "$(PODS_ROOT)/Headers/Public", so the include
// resolves without any Package.swift patching. FOLLY_CFG_NO_COROUTINES=1
// (set by RCT-Folly compile flags) means no actual coroutine types are used.
module.exports = function withExpoModulesJsiPatch(config) {
  return withDangerousMod(config, ['ios', async (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let contents = fs.readFileSync(podfilePath, 'utf8');

    // Guard: only inject once
    if (contents.includes('folly-coro-coroutine-stub')) return config;

    const hook = [
      '',
      '# folly-coro-coroutine-stub: satisfy folly/coro/Coroutine.h include for ExpoModulesJSI',
      'post_install do |installer|',
      "  require 'fileutils'",
      "  stub_dir = File.join(installer.sandbox.root, 'Headers', 'Public', 'folly', 'coro')",
      '  FileUtils.mkdir_p(stub_dir)',
      "  stub_path = File.join(stub_dir, 'Coroutine.h')",
      '  unless File.exist?(stub_path)',
      "    File.write(stub_path, <<~STUB)",
      '      #pragma once',
      '      /* Stub: folly/coro/Coroutine.h */',
      '      /* RN sets FOLLY_CFG_NO_COROUTINES=1 - no coroutine types are consumed. */',
      '      /* This file exists solely to satisfy the preprocessor include. */',
      '      #if !defined(FOLLY_CFG_NO_COROUTINES) || !FOLLY_CFG_NO_COROUTINES',
      '      # if __has_include(<coroutine>)',
      '      #  include <coroutine>',
      '      # endif',
      '      #endif',
      '    STUB',
      '  end',
      'end',
      '',
    ].join('\n');

    contents = contents + hook;
    fs.writeFileSync(podfilePath, contents);
    return config;
  }]);
};
