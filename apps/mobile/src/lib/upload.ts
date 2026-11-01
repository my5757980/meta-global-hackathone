import { Platform } from "react-native";
import { File as FsFile, UploadType } from "expo-file-system";
import { api, ApiError } from "./api";
import { absUrl, authHeaders } from "./config";

type UploadReply = { files: { id: string }[] };

/**
 * Upload one picture or voice note to the chat and return its file id.
 * On a phone the native uploader sends the file from disk; a plain React Native FormData upload of a fresh
 * recording can fail before it reaches the server, so FormData is only the fallback. The web build uses FormData.
 */
export async function uploadChatFile(uri: string, mime: string, name: string): Promise<string> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    const fd = new FormData();
    fd.append("files", new globalThis.File([blob], name, { type: mime || blob.type }));
    const r = await api.post<UploadReply>("/api/chat/upload", fd);
    return r.files[0]!.id;
  }
  const fileUri = /^(file|content):\/\//.test(uri) ? uri : `file://${uri}`;
  try {
    const res = await new FsFile(fileUri).upload(absUrl("/api/chat/upload"), {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "files",
      mimeType: mime,
      headers: { "x-autofte-client": "app", ...authHeaders() },
    });
    let data: { error?: string; files?: { id: string }[] } | null = null;
    try {
      data = JSON.parse(res.body);
    } catch {
      /* not JSON */
    }
    if (res.status < 200 || res.status >= 300 || !data?.files?.[0]) throw new ApiError(res.status, data?.error ?? `Upload failed (${res.status})`);
    return data.files[0].id;
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400) throw e; // the server answered: do not retry blindly
    const fd = new FormData();
    fd.append("files", { uri: fileUri, name, type: mime } as unknown as Blob);
    const r = await api.post<UploadReply>("/api/chat/upload", fd);
    return r.files[0]!.id;
  }
}
