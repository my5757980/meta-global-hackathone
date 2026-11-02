// Config plugin for the Android build (applied on every `expo prebuild`, so nothing is hand-edited in android/).
const { withAndroidManifest, withGradleProperties, withProjectBuildGradle } = require("expo/config-plugins");

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
 * JVM (a second compiler JVM is what kills the build), and the one ABI every current phone runs.
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
    set("reactNativeArchitectures", "arm64-v8a");
    return c;
  });
}

/**
 * Native modules compile through CMake and ninja, and ninja starts one compiler per CPU thread: on 4 GB six clangs die
 * mid-build without a word. Two compilers and one linker for every module. The block goes above the React Native
 * root plugin because that plugin evaluates :app at once; withId then fires as each module applies the Android plugin.
 */
const JOB_POOLS = "// autofte: ninja job pools";
function withNinjaJobPools(config) {
  return withProjectBuildGradle(config, (c) => {
    const text = c.modResults.contents;
    const anchor = 'apply plugin: "expo-root-project"';
    if (c.modResults.language !== "groovy" || text.includes(JOB_POOLS)) return c;
    if (!text.includes(anchor)) throw new Error("withAppBuild: the root build.gradle changed, job pools have no place to go");
    const block = `${JOB_POOLS}
subprojects { module ->
  ['com.android.library', 'com.android.application'].each { pluginId ->
    module.plugins.withId(pluginId) {
      module.android.defaultConfig.externalNativeBuild.cmake.arguments(
        '-DCMAKE_JOB_POOLS=autofte_cc=2;autofte_ld=1',
        '-DCMAKE_JOB_POOL_COMPILE=autofte_cc',
        '-DCMAKE_JOB_POOL_LINK=autofte_ld')
    }
  }
}

`;
    c.modResults.contents = text.replace(anchor, block + anchor);
    return c;
  });
}

module.exports = (config) => withNinjaJobPools(withLowMemoryBuild(withCleartext(config)));
