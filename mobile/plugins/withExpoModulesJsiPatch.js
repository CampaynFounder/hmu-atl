const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// expo-modules-jsi 56.x (Xcode 26.2): hermes/hermes.h transitively requires
// folly/coro/Coroutine.h during build-xcframework.sh's inner xcodebuild.
// RCT-Folly.podspec doesn't copy coro headers into Pods/RCT-Folly/, so the
// include fails even with buildReactNativeFromSource: true.
// Fix: create a stub that satisfies the preprocessor (FOLLY_CFG_NO_COROUTINES=1
// means no coroutine types are actually used), then prepend its directory to
// Package.swift's headerSearchPaths using the already-defined packageDir var.
module.exports = function withExpoModulesJsiPatch(config) {
  return withDangerousMod(config, ['ios', async (config) => {
    const appleDir = path.join(
      config.modRequest.projectRoot,
      'node_modules', 'expo-modules-jsi', 'apple'
    );
    const packageSwiftPath = path.join(appleDir, 'Package.swift');

    if (!fs.existsSync(packageSwiftPath)) return config;

    // Create folly/coro/Coroutine.h stub
    const stubDir = path.join(appleDir, 'folly-stubs', 'folly', 'coro');
    if (!fs.existsSync(stubDir)) {
      fs.mkdirSync(stubDir, { recursive: true });
    }
    fs.writeFileSync(path.join(stubDir, 'Coroutine.h'), [
      '#pragma once',
      '// Stub: folly/coro/Coroutine.h',
      '// RN sets FOLLY_CFG_NO_COROUTINES=1 so no coroutine types are needed.',
      '// This file exists solely to satisfy the preprocessor include resolution.',
      '#if !defined(FOLLY_CFG_NO_COROUTINES) || !FOLLY_CFG_NO_COROUTINES',
      '#  if __has_include(<coroutine>)',
      '#    include <coroutine>',
      '#  endif',
      '#endif',
    ].join('\n') + '\n');

    // Prepend stub dir to Package.swift headerSearchPaths (packageDir is already
    // defined in Package.swift as URL(fileURLWithPath: #filePath).deletingLastPathComponent().path)
    let contents = fs.readFileSync(packageSwiftPath, 'utf8');
    const marker = 'let headerSearchPaths = [\n  publicHeaders,';
    if (!contents.includes('"\\(packageDir)/folly-stubs"') && contents.includes(marker)) {
      contents = contents.replace(
        marker,
        'let headerSearchPaths = [\n  "\\(packageDir)/folly-stubs",\n  publicHeaders,'
      );
      fs.writeFileSync(packageSwiftPath, contents);
    }

    return config;
  }]);
};
