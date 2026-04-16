/**
 * Asset Sync Service
 *
 * Handles uploading local attachments to the sync server and
 * downloading missing attachments from the server.
 *
 * Upload flow: decrypt local .enc → upload via AssetUploadService (re-encrypts with UEK)
 * Download flow: fetch from server → decrypt UEK → re-encrypt with local key → store as .enc
 */

import * as FileSystem from "expo-file-system/legacy";
import { encryptFile } from "../attachments/fileEncryption";
import { AssetUploadService } from "./assetUploadService";
import { getValidAccessToken } from "./syncTokenManager";

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments`;
const TEMP_DIR = `${FileSystem.cacheDirectory}asset-sync/`;

/**
 * Ensure temp directory exists
 */
async function ensureTempDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(TEMP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(TEMP_DIR, { intermediates: true });
  }
}

/**
 * Upload a locally encrypted attachment to the sync server.
 *
 * 1. Decrypt the .enc file (remove local encryption)
 * 2. Upload via AssetUploadService (which re-encrypts with UEK)
 * 3. Clean up temp file
 *
 * The filename sent to the server is `{attachmentId}.wav` so other
 * devices can match server assets to attachment IDs in the HTML.
 */
export async function uploadAttachmentForSync(
  serverUrl: string,
  entryId: number,
  entryUuid: string,
  attachmentId: string,
): Promise<string | null> {
  await ensureTempDir();

  const encPath = `${ATTACHMENTS_DIR}/${entryId}/${attachmentId}.enc`;
  const tempPath = `${TEMP_DIR}${attachmentId}.wav`;

  // Check encrypted file exists
  const encInfo = await FileSystem.getInfoAsync(encPath);
  if (!encInfo.exists) {
    console.warn(
      `[AssetSync] Cannot upload - encrypted file not found: ${attachmentId}`,
    );
    return null;
  }

  try {
    // Decrypt to temp file (removes local encryption)
    const { decryptFile } = await import("../attachments/fileEncryption");
    await decryptFile(encPath, tempPath);

    // Upload using asset service (re-encrypts with UEK for server storage)
    // Use entry UUID as the entryId so other devices can look it up
    const service = new AssetUploadService(serverUrl);
    const result = await service.uploadAsset(tempPath, entryUuid);

    console.log(
      `[AssetSync] Uploaded attachment ${attachmentId} as server asset ${result.id}`,
    );
    return result.id;
  } catch (error) {
    console.warn(
      `[AssetSync] Failed to upload attachment ${attachmentId}:`,
      error,
    );
    return null;
  } finally {
    // Clean up temp file
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
  }
}

/**
 * Download a missing attachment from the sync server.
 *
 * 1. Query server for assets by entry UUID
 * 2. Find matching asset by attachment ID (encoded in filename)
 * 3. Download and decrypt (UEK) via AssetUploadService
 * 4. Re-encrypt with local master key
 * 5. Store as attachments/{entryId}/{attachmentId}.enc
 */
export async function downloadAttachmentFromServer(
  serverUrl: string,
  entryId: number,
  entryUuid: string,
  attachmentId: string,
): Promise<boolean> {
  await ensureTempDir();

  const token = await getValidAccessToken();
  if (!token) {
    console.warn("[AssetSync] Cannot download - not authenticated");
    return false;
  }

  try {
    // Query server for assets belonging to this entry
    const cleanUrl = serverUrl.replace(/\/$/, "");
    const response = await fetch(`${cleanUrl}/api/assets/entry/${entryUuid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.warn(
        `[AssetSync] Failed to list assets for entry ${entryUuid}: ${response.status}`,
      );
      return false;
    }

    const { assets } = (await response.json()) as {
      assets: Array<{ id: string; filename: string }>;
    };

    // Find the asset whose filename matches this attachment ID
    const asset = assets.find(
      (a) =>
        a.filename.startsWith(attachmentId) ||
        a.filename === `${attachmentId}.wav` ||
        a.filename === `${attachmentId}.enc`,
    );

    if (!asset) {
      console.warn(
        `[AssetSync] No server asset found for attachment ${attachmentId} in entry ${entryUuid}`,
      );
      return false;
    }

    // Download to temp file (AssetUploadService handles UEK decryption)
    const tempPath = `${TEMP_DIR}${attachmentId}.wav`;
    const encPath = `${ATTACHMENTS_DIR}/${entryId}/${attachmentId}.enc`;

    const service = new AssetUploadService(cleanUrl);
    await service.downloadAsset(asset.id, tempPath);

    // Ensure entry attachments directory exists
    const entryDir = `${ATTACHMENTS_DIR}/${entryId}`;
    const dirInfo = await FileSystem.getInfoAsync(entryDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(entryDir, { intermediates: true });
    }

    // Re-encrypt with local master key for at-rest storage
    await encryptFile(tempPath, encPath);

    // Clean up temp file
    await FileSystem.deleteAsync(tempPath, { idempotent: true });

    console.log(
      `[AssetSync] Downloaded attachment ${attachmentId} from server asset ${asset.id}`,
    );
    return true;
  } catch (error) {
    console.warn(
      `[AssetSync] Failed to download attachment ${attachmentId}:`,
      error,
    );
    // Clean up any partial temp files
    await FileSystem.deleteAsync(`${TEMP_DIR}${attachmentId}.wav`, {
      idempotent: true,
    });
    return false;
  }
}
