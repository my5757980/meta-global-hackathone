// Config plugin for the Android build (applied on every `expo prebuild`, so nothing is hand-edited in android/).
const { withAndroidManifest, withGradleProperties } = require("expo/config-plugins");

/** The demo server is often a laptop on the same Wi-Fi (http://192.168.x.x:8787), so plain http must be allowed. */
function withCleartext(config) {
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application && c.modResults.manifest.application[0];
    if (app) app.$["android:usesCleartextTraffic"] = "true";
    return c;
  });
}

/**
 * Builds on a 4 GB laptop: one Gradle worker, a 1.5 GB heap, no daemon left holding RAM, Kotlin in the same
 * JVM (a second compiler JVM is what kills the build), and only the two phone ABIs.
 */
function withLowMemoryBuild(config) {
  return withGradleProperties(config, (c) => {
    const set = (key, value) => {
      const i = c.modResults.findIndex((p) => p.type === "property" && p.key === key);
      if (i >= 0) c.modResults[i].value = value;
      else c.modResults.push({ type: "property", key, value });
    };
    set("org.gradle.jvmargs", "-Xmx1536m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8");
    set("org.gradle.parallel", "false");
    set("org.gradle.workers.max", "1");
    set("org.gradle.daemon", "false");
    set("kotlin.compiler.execution.strategy", "in-process");
    set("kotlin.daemon.jvmargs", "-Xmx512m");
    set("reactNativeArchitectures", "arm64-v8a,armeabi-v7a");
    return c;
  });
}

module.exports = (config) => withLowMemoryBuild(withCleartext(config));
