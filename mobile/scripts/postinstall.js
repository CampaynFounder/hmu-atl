#!/usr/bin/env node
// expo-modules-autolinking hardcodes the macro plugin path as
// `<expo-modules-core>/node_modules/@expo/expo-modules-macros-plugin`, but npm
// hoists @expo/expo-modules-macros-plugin to top-level node_modules. Symlink it
// where autolinking expects so swiftc's -load-plugin-executable resolves.

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const src = path.join(projectRoot, 'node_modules', '@expo', 'expo-modules-macros-plugin');
const destDir = path.join(projectRoot, 'node_modules', 'expo-modules-core', 'node_modules', '@expo');
const dest = path.join(destDir, 'expo-modules-macros-plugin');

if (!fs.existsSync(src)) {
  process.exit(0);
}

if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })) {
  fs.rmSync(dest, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });
fs.symlinkSync(path.relative(destDir, src), dest, 'dir');
