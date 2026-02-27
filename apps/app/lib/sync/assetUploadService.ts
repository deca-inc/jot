/**
 * Asset Upload Service
 *
 * REST API client for uploading and downloading assets with E2EE support.
 * Assets are encrypted before upload and decrypted after download.
 */

import * as FileSystem from "expo-file-system/legacy";
import {
  decryptAttachmentFromDownload,
  encryptAttachmentForUpload,
  hasUEK,
} from "./encryption";
import { getValidAccessToken } from "./syncTokenManager";

export interface AssetMetadata {
  id: string;
  entryId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: number;
  isEncrypted?: boolean;
  encryption?: {
    wrappedDek: string;
    dekNonce: string;
    dekAuthTag: string;
    contentNonce: string;
    contentAuthTag: string;
  };
}

export interface UploadResponse {
  id: string;
  url: string;
  isEncrypted?: boolean;
}

/**
 * AssetUploadService handles asset upload/download API calls
 */
export class AssetUploadService {
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
  }

  /**
   * Upload an asset file with E2EE
   *
   * If the user has a UEK, the file is encrypted before upload.
   * The encrypted content and wrapped DEK are sent to the server.
   */
  async uploadAsset(
    localPath: string,
    entryId: number,
    _onProgress?: (progress: number) => void,
  ): Promise<UploadResponse> {
    const token = await getValidAccessToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (!fileInfo.exists) {
      throw new Error(`File not found: ${localPath}`);
    }

    // Extract filename from path
    const filename = localPath.split("/").pop() ?? "attachment";

    // Determine mime type from extension
    const mimeType = this.getMimeType(filename);

    // Check if we should encrypt
    const shouldEncrypt = await hasUEK();

    // Create form data
    const formData = new FormData();

    if (shouldEncrypt) {
      // Read file content
      const base64Content = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const binaryString = atob(base64Content);
      const content = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        content[i] = binaryString.charCodeAt(i);
      }

      // Encrypt the content
      const encrypted = await encryptAttachmentForUpload(content);

      // Convert encrypted ciphertext to base64 for Blob
      let binary = "";
      for (let i = 0; i < encrypted.ciphertext.length; i++) {
        binary += String.fromCharCode(encrypted.ciphertext[i]);
      }
      const encryptedBase64 = btoa(binary);

      // Create a Blob from the encrypted content
      const blob = new Blob(
        [Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0))],
        { type: "application/octet-stream" },
      );

      formData.append("file", blob, filename);

      // Add encryption metadata
      formData.append("wrappedDek", encrypted.wrappedDek);
      formData.append("dekNonce", encrypted.dekNonce);
      formData.append("dekAuthTag", encrypted.dekAuthTag);
      formData.append("contentNonce", encrypted.contentNonce);
      formData.append("contentAuthTag", encrypted.contentAuthTag);
    } else {
      // No encryption - send file directly
      formData.append("file", {
        uri: localPath,
        name: filename,
        type: mimeType,
      } as unknown as Blob);
    }

    formData.append("entryId", String(entryId));
    formData.append("filename", filename);
    formData.append("mimeType", mimeType);

    // Upload using fetch
    const response = await fetch(`${this.serverUrl}/api/assets/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Upload failed with status ${response.status}: ${errorText}`,
      );
    }

    const result = (await response.json()) as UploadResponse;
    return result;
  }

  /**
   * Download an asset file with E2EE decryption
   *
   * If the asset is encrypted, it is decrypted after download.
   * The decrypted content is written to the destination path.
   */
  async downloadAsset(
    assetId: string,
    destinationPath: string,
    _onProgress?: (progress: number) => void,
  ): Promise<void> {
    const token = await getValidAccessToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    // First, get metadata to check if encrypted
    const metadata = await this.getAssetMetadata(assetId);

    if (metadata.isEncrypted && metadata.encryption) {
      // Download encrypted file using fetch to get headers
      const response = await fetch(`${this.serverUrl}/api/assets/${assetId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      // Read encrypted content
      const encryptedBuffer = await response.arrayBuffer();
      const encryptedContent = new Uint8Array(encryptedBuffer);

      // Decrypt content
      const decryptedContent = await decryptAttachmentFromDownload({
        ciphertext: encryptedContent,
        wrappedDek: metadata.encryption.wrappedDek,
        dekNonce: metadata.encryption.dekNonce,
        dekAuthTag: metadata.encryption.dekAuthTag,
        contentNonce: metadata.encryption.contentNonce,
        contentAuthTag: metadata.encryption.contentAuthTag,
      });

      // Convert to base64 and write to file
      const chunkSize = 0x8000; // 32KB chunks to avoid stack overflow
      const chunks: string[] = [];
      for (let i = 0; i < decryptedContent.length; i += chunkSize) {
        const chunk = decryptedContent.subarray(i, i + chunkSize);
        chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
      }
      const decryptedBase64 = btoa(chunks.join(""));

      await FileSystem.writeAsStringAsync(destinationPath, decryptedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else {
      // Not encrypted - download directly
      const downloadResult = await FileSystem.downloadAsync(
        `${this.serverUrl}/api/assets/${assetId}`,
        destinationPath,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }
    }
  }

  /**
   * Get asset metadata
   */
  async getAssetMetadata(assetId: string): Promise<AssetMetadata> {
    const token = await getValidAccessToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(
      `${this.serverUrl}/api/assets/${assetId}/metadata`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get asset metadata: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Delete an asset
   */
  async deleteAsset(assetId: string): Promise<void> {
    const token = await getValidAccessToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${this.serverUrl}/api/assets/${assetId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete asset: ${response.status}`);
    }
  }

  /**
   * Update server URL
   */
  updateServerUrl(serverUrl: string): void {
    this.serverUrl = serverUrl.replace(/\/$/, "");
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";

    const mimeTypes: Record<string, string> = {
      // Images
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      heic: "image/heic",
      heif: "image/heif",
      svg: "image/svg+xml",

      // Audio
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      ogg: "audio/ogg",
      aac: "audio/aac",

      // Video
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      avi: "video/x-msvideo",

      // Documents
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

      // Other
      json: "application/json",
      txt: "text/plain",
      md: "text/markdown",
    };

    return mimeTypes[ext] ?? "application/octet-stream";
  }
}

// Singleton instance
let assetService: AssetUploadService | null = null;

/**
 * Initialize the asset upload service
 */
export function initializeAssetService(serverUrl: string): AssetUploadService {
  assetService = new AssetUploadService(serverUrl);
  return assetService;
}

/**
 * Get the asset upload service singleton
 */
export function getAssetService(): AssetUploadService | null {
  return assetService;
}

/**
 * Create upload function for use with AssetUploadQueue
 */
export function createUploadFunction(
  serverUrl: string,
): (localPath: string, entryId: number) => Promise<string> {
  const service = new AssetUploadService(serverUrl);

  return async (localPath: string, entryId: number): Promise<string> => {
    const result = await service.uploadAsset(localPath, entryId);
    return result.url;
  };
}
