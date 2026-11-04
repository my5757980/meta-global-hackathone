/** Fonts for the documents the server draws. Windows has Arial; the Docker image installs Liberation (see the Dockerfile).
 *  On Linux resvg's own system scan finds nothing in a slim image (no fontconfig), so every text came out blank:
 *  the font folder is named as well. */
export const resvgFonts =
  process.platform === "win32"
    ? { loadSystemFonts: true, defaultFontFamily: "Arial" }
    : { loadSystemFonts: true, fontDirs: ["/usr/share/fonts"], defaultFontFamily: "Liberation Sans", sansSerifFamily: "Liberation Sans", serifFamily: "Liberation Serif" };
