import * as FileSystem from "expo-file-system/legacy";
import { Paths } from "expo-file-system";
import { Asset } from "expo-asset";
import { Llama32_1B_Instruct, LlmModelConfig } from "./modelConfig";

export interface EnsureResult {
  ptePath: string;
  tokenizerPath?: string;
  tokenizerConfigPath?: string;
}

function joinPaths(base: string, segment: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const s = segment.startsWith("/") ? segment.slice(1) : segment;
  return `${b}/${s}`;
}

// Use the new Paths API for expo-file-system v19+ (compatible with newer iOS versions)
// Falls back to legacy API if Paths is not available
function getBaseDir(): string {
  try {
    const documentsDir = Paths.document.uri;
    if (documentsDir) {
      return documentsDir;
    }
  } catch (e) {
    console.warn("Paths API not available, falling back to legacy API:", e);
  }
  // Fallback to legacy API
  return FileSystem.documentDirectory || FileSystem.cacheDirectory || "/";
}

const baseDir = getBaseDir();
const modelsDir = joinPaths(baseDir, "models");

async function ensureModelsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(modelsDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });
  }
}

async function ensureFromBundled(
  source: any,
  fileName: string
): Promise<string> {
  try {
    // Handle file path directly (for large .pte files loaded from filesystem)
    if (source.uri && typeof source.uri === "string") {
      // File path from filesystem - use directly
      const fileInfo = await FileSystem.getInfoAsync(source.uri);
      if (fileInfo.exists) {
        // Copy to models dir for consistency
        await ensureModelsDir();
        const dest = joinPaths(modelsDir, fileName);
        const existing = await FileSystem.getInfoAsync(dest);
        if (!existing.exists) {
          await FileSystem.copyAsync({ from: source.uri, to: dest });
        }
        return dest;
      } else {
        throw new Error(`File not found: ${source.uri}`);
      }
    }

    // Handle bundled asset (for small files like tokenizer.json)
    const asset = Asset.fromModule(source);
    await asset.downloadAsync();
    // Copy to models dir with deterministic name for simplicity
    await ensureModelsDir();
    const dest = joinPaths(modelsDir, fileName);
    // If already copied, skip
    const existing = await FileSystem.getInfoAsync(dest);
    if (!existing.exists) {
      await FileSystem.copyAsync({ from: asset.localUri!, to: dest });
    }
    return dest;
  } catch (error) {
    // If bundled asset doesn't exist or fails, throw to allow fallback
    throw new Error(
      `Bundled asset not available: ${fileName}. Run 'pnpm download:models' to download models.`
    );
  }
}

async function ensureFromRemote(
  url: string,
  fileName: string
): Promise<string> {
  await ensureModelsDir();
  const dest = joinPaths(modelsDir, fileName);
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists && existing.size && existing.size > 0) {
    return dest;
  }
  const tmp = dest + ".download";
  try {
    const res = await FileSystem.downloadAsync(url, tmp);
    if (res.status !== 200) {
      throw new Error(`Download failed with status ${res.status}`);
    }
    await FileSystem.moveAsync({ from: tmp, to: dest });
    return dest;
  } catch (e) {
    // Cleanup partial
    try {
      await FileSystem.deleteAsync(tmp, { idempotent: true });
    } catch {}
    throw e;
  }
}

export async function ensureModelPresent(
  config: LlmModelConfig = Llama32_1B_Instruct
): Promise<EnsureResult> {
  let ptePath: string;

  await ensureModelsDir();

  // Check document directory first (for already downloaded/copied files)
  const docModelPath = joinPaths(modelsDir, config.pteFileName);
  console.log(`[ensureModelPresent] Checking for model at: ${docModelPath}`);
  console.log(`[ensureModelPresent] Base directory: ${baseDir}`);
  const docModelInfo = await FileSystem.getInfoAsync(docModelPath);

  if (docModelInfo.exists && docModelInfo.size && docModelInfo.size > 0) {
    // Use already downloaded/cached file
    ptePath = docModelPath;
    console.log(
      `[ensureModelPresent] Using cached model from: ${docModelPath} (${(
        docModelInfo.size /
        1024 /
        1024
      ).toFixed(2)}MB)`
    );
  } else if (config.pteSource.kind === "bundled") {
    // Try bundled asset (for small files)
    try {
      ptePath = await ensureFromBundled(
        config.pteSource.requireId,
        config.pteFileName
      );
    } catch (e) {
      // Fall back to remote if bundled fails
      console.warn("Bundled model not available, falling back to remote:", e);
      // Use the default remote URL from config
      const fallbackUrl =
        "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/v0.5.0/llama-3.2-1B/spinquant/llama3_2_spinquant.pte";
      ptePath = await ensureFromRemote(fallbackUrl, config.pteFileName);
    }
  } else {
    // Download from remote
    console.log(`Downloading model from remote: ${config.pteSource.url}`);
    ptePath = await ensureFromRemote(config.pteSource.url, config.pteFileName);
  }

  let tokenizerPath: string | undefined;
  if (config.tokenizerSource) {
    if (config.tokenizerSource.kind === "bundled") {
      tokenizerPath = await ensureFromBundled(
        config.tokenizerSource.requireId,
        config.tokenizerFileName || "tokenizer.bin"
      );
    } else {
      tokenizerPath = await ensureFromRemote(
        config.tokenizerSource.url,
        config.tokenizerFileName || "tokenizer.bin"
      );
    }
  }

  let tokenizerConfigPath: string | undefined;
  if (config.tokenizerConfigSource) {
    if ((config.tokenizerConfigSource as any).kind === "bundled") {
      tokenizerConfigPath = await ensureFromBundled(
        (config.tokenizerConfigSource as any).requireId,
        config.tokenizerConfigFileName || "tokenizer.json"
      );
    } else {
      tokenizerConfigPath = await ensureFromRemote(
        (config.tokenizerConfigSource as any).url,
        config.tokenizerConfigFileName || "tokenizer.json"
      );
    }
  }

  return { ptePath, tokenizerPath, tokenizerConfigPath };
}
