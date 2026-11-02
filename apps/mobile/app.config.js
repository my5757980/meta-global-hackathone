const { existsSync } = require("node:fs");
const { join } = require("node:path");

// Push needs a Firebase project's google-services.json, which is not in the repo. Without it the app builds and works, with no push.
module.exports = ({ config }) => {
  if (existsSync(join(__dirname, "google-services.json"))) config.android = { ...config.android, googleServicesFile: "./google-services.json" };
  return config;
};
