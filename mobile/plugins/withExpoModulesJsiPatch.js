const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// On Xcode 26.2, hermes/hermes.h transitively requires folly/coro/Coroutine.h
// during expo-modules-jsi's build-xcframework.sh inner xcodebuild.
// Neither ReactNativeDependencies prebuilt nor RCT-Folly.podspec expose
// folly/coro/*.h, so the preprocessor fails.
//
// Fix: inject into the existing Podfile post_install block (same pattern as
// withCxxFlags) to write a no-op stub at Pods/Headers/Public/folly/coro/
// Coroutine.h. Package.swift's first search path is publicHeaders =
// "$(PODS_ROOT)/Headers/Public", so the include resolves without patching
// Package.swift itself. FOLLY_CFG_NO_COROUTINES=1 means no actual
// coroutine types are used — the file just needs to exist.
//
// Key fix vs. previous attempt: installer.sandbox.root is a Pathname, not
// a String. File.join(Pathname, ...) raises TypeError — use .to_s explicitly.
// Heredocs are avoided entirely. begin/rescue prevents pod install failure
// if the stub creation ever errors.
module.exports = function withExpoModulesJsiPatch(config) {
  return withDangerousMod(config, ['ios', async (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let contents = fs.readFileSync(podfilePath, 'utf8');
    if (contents.includes('folly-coro-coroutine-stub')) return config;
    if (!contents.match(/post_install do \|installer\|/)) return config;

    // Inject into the existing post_install block (same strategy as withCxxFlags).
    // Uses .to_s on sandbox.root (Pathname) and avoids heredocs for reliability.
    const lines = [
      '',
      '  # folly-coro-coroutine-stub',
      '  begin',
      "    require 'fileutils'",
      "    __folly_stub = installer.sandbox.root.to_s + '/Headers/Public/folly/coro'",
      '    FileUtils.mkdir_p(__folly_stub)',
      "    File.write(__folly_stub + '/Coroutine.h', \"#pragma once\\n\") unless File.exist?(__folly_stub + '/Coroutine.h')",
      '  rescue => e',
      '    puts "[folly-coro-stub] #{e}"',
      '  end',
      '',
    ];
    const inject = lines.join('\n');

    contents = contents.replace(
      /post_install do \|installer\|/,
      `post_install do |installer|${inject}`,
    );

    fs.writeFileSync(podfilePath, contents);
    return config;
  }]);
};
