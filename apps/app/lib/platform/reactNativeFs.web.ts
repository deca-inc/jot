/**
 * Web shim for @dr.pogodin/react-native-fs
 *
 * Stub implementation to prevent TurboModuleRegistry errors on web.
 * TODO: Replace with Tauri fs plugin calls for production
 */

export const DocumentDirectoryPath = "/web-documents";
export const CachesDirectoryPath = "/web-cache";
export const TemporaryDirectoryPath = "/web-tmp";
export const LibraryDirectoryPath = "/web-library";
export const MainBundlePath = "/web-bundle";

export async function exists(_path: string): Promise<boolean> {
  return false;
}

export async function readFile(
  _path: string,
  _encoding?: string,
): Promise<string> {
  console.warn("[reactNativeFs.web] readFile is a stub");
  return "";
}

export async function writeFile(
  _path: string,
  _data: string,
  _encoding?: string,
): Promise<void> {
  console.warn("[reactNativeFs.web] writeFile is a stub");
}

export async function unlink(_path: string): Promise<void> {
  console.warn("[reactNativeFs.web] unlink is a stub");
}

export async function mkdir(_path: string): Promise<void> {
  console.warn("[reactNativeFs.web] mkdir is a stub");
}

export async function stat(_path: string): Promise<{
  size: number;
  isFile: () => boolean;
  isDirectory: () => boolean;
}> {
  return { size: 0, isFile: () => false, isDirectory: () => false };
}

export async function readDir(_path: string): Promise<
  {
    name: string;
    path: string;
    size: number;
    isFile: () => boolean;
    isDirectory: () => boolean;
  }[]
> {
  return [];
}

export async function copyFile(_from: string, _to: string): Promise<void> {
  console.warn("[reactNativeFs.web] copyFile is a stub");
}

export async function moveFile(_from: string, _to: string): Promise<void> {
  console.warn("[reactNativeFs.web] moveFile is a stub");
}

export default {
  DocumentDirectoryPath,
  CachesDirectoryPath,
  TemporaryDirectoryPath,
  LibraryDirectoryPath,
  MainBundlePath,
  exists,
  readFile,
  writeFile,
  unlink,
  mkdir,
  stat,
  readDir,
  copyFile,
  moveFile,
};
