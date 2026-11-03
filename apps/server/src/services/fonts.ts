/** Fonts for the documents the server draws. Windows has Arial; the Docker image installs Liberation (see the Dockerfile). */
export const resvgFonts =
  process.platform === "win32"
    ? { loadSystemFonts: true, defaultFontFamily: "Arial" }
    : { loadSystemFonts: true, defaultFontFamily: "Liberation Sans", sansSerifFamily: "Liberation Sans", serifFamily: "Liberation Serif" };
