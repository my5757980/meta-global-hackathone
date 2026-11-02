import { Linking, Platform } from "react-native";
import { File as FsFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { absUrl, authHeaders } from "./config";

/**
 * A buyer's invoice or shipping document: fetched with the session (a phone's browser would not have it),
 * then handed to the phone's own share sheet to open, save or send.
 */
export async function downloadAndShare(path: string, name: string, mime?: string): Promise<void> {
  const url = absUrl(path);
  if (Platform.OS === "web") {
    await Linking.openURL(url); // the preview build: the browser sends its own cookie
    return;
  }
  const file = new FsFile(Paths.cache, name.replace(/[^\w.\- ]+/g, "_").slice(-80) || "document");
  if (file.exists) file.delete();
  const saved = await FsFile.downloadFileAsync(url, file, { headers: { "x-autofte-client": "app", ...authHeaders() } });
  await Sharing.shareAsync(saved.uri, { mimeType: mime, dialogTitle: name });
}
