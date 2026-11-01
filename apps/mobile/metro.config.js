// This app is NOT one of the repo's npm workspaces. Metro must resolve packages from apps/mobile/node_modules
// only: the repo root's node_modules holds the web app's newer React, and two Reacts in one bundle means
// "Invalid hook call" at runtime.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
