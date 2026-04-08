/**
 * Web shim for expo-file-system
 *
 * Provides stub implementations for file system operations on web.
 * TODO: Replace with @tauri-apps/plugin-fs for production Tauri builds
 */

/** Stub document directory - uses a virtual path on web */
export const documentDirectory = "/web-documents/";
export const cacheDirectory = "/web-cache/";
export const bundleDirectory = "/web-bundle/";

export enum FileSystemUploadType {
  BINARY_CONTENT = 0,
  MULTIPART = 1,
}

export enum EncodingType {
  UTF8 = "utf8",
  Base64 = "base64",
}

export async function getInfoAsync(
  fileUri: string,
  _options?: { md5?: boolean; size?: boolean },
): Promise<{
  exists: boolean;
  isDirectory: boolean;
  size: number;
  uri: string;
  md5?: string;
}> {
  console.warn("[fileSystem.web] getInfoAsync is a stub:", fileUri);
  return { exists: false, isDirectory: false, size: 0, uri: fileUri };
}

export async function readAsStringAsync(
  fileUri: string,
  _options?: { encoding?: EncodingType },
): Promise<string> {
  console.warn("[fileSystem.web] readAsStringAsync is a stub:", fileUri);
  return "";
}

export async function writeAsStringAsync(
  fileUri: string,
  _contents: string,
  _options?: { encoding?: EncodingType },
): Promise<void> {
  console.warn("[fileSystem.web] writeAsStringAsync is a stub:", fileUri);
}

export async function deleteAsync(
  fileUri: string,
  _options?: { idempotent?: boolean },
): Promise<void> {
  console.warn("[fileSystem.web] deleteAsync is a stub:", fileUri);
}

export async function moveAsync(options: {
  from: string;
  to: string;
}): Promise<void> {
  console.warn("[fileSystem.web] moveAsync is a stub:", options);
}

export async function copyAsync(options: {
  from: string;
  to: string;
}): Promise<void> {
  console.warn("[fileSystem.web] copyAsync is a stub:", options);
}

export async function makeDirectoryAsync(
  fileUri: string,
  _options?: { intermediates?: boolean },
): Promise<void> {
  console.warn("[fileSystem.web] makeDirectoryAsync is a stub:", fileUri);
}

export async function readDirectoryAsync(fileUri: string): Promise<string[]> {
  console.warn("[fileSystem.web] readDirectoryAsync is a stub:", fileUri);
  return [];
}

export async function downloadAsync(
  uri: string,
  fileUri: string,
  _options?: Record<string, unknown>,
): Promise<{
  uri: string;
  status: number;
  headers: Record<string, string>;
  md5?: string;
}> {
  console.warn("[fileSystem.web] downloadAsync is a stub:", uri);
  return { uri: fileUri, status: 200, headers: {} };
}

export function createDownloadResumable(
  uri: string,
  fileUri: string,
  _options?: Record<string, unknown>,
  _callback?: (progress: {
    totalBytesWritten: number;
    totalBytesExpectedToWrite: number;
  }) => void,
) {
  return {
    downloadAsync: () => downloadAsync(uri, fileUri),
    pauseAsync: async () => ({}),
    resumeAsync: async () => ({ uri: fileUri, status: 200, headers: {} }),
    cancelAsync: async () => {},
  };
}

export async function getFreeDiskStorageAsync(): Promise<number> {
  // Estimate: report 1GB available on web
  return 1_073_741_824;
}

export class DownloadResumable {
  _url: string;
  _fileUri: string;
  constructor(
    url: string,
    fileUri: string,
    _options?: Record<string, unknown>,
    _callback?: unknown,
  ) {
    this._url = url;
    this._fileUri = fileUri;
  }
  async downloadAsync() {
    console.warn("[fileSystem.web] DownloadResumable.downloadAsync is a stub");
    return { uri: this._fileUri, status: 200, headers: {} };
  }
  async pauseAsync() {
    return {};
  }
  async resumeAsync() {
    return { uri: this._fileUri, status: 200, headers: {} };
  }
  async cancelAsync() {}
}

/** Stub Paths API for expo-file-system new API */
export const Paths = {
  document: { uri: "/web-documents/" },
  cache: { uri: "/web-cache/" },
  appleSharedContainers: {},
};

/** Stub File class for expo-file-system new API */
export class File {
  uri: string;
  constructor(uri: string) {
    this.uri = uri;
  }
  get path() {
    return this.uri;
  }
  async text() {
    return "";
  }
  async exists() {
    return false;
  }
}
