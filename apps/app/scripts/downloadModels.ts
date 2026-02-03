#!/usr/bin/env tsx
/**
 * Script to download AI model files for local development
 * Downloads quantized models to assets/models/{model-name}/ directory for bundling with the app
 *
 * Usage:
 *   pnpm download:models              # Download default model (Llama 3.2 1B)
 *   pnpm download:models --all        # Download all available models
 *   pnpm download:models --model glm-4-9b-chat  # Download specific model
 */

import * as fs from "fs";
import * as https from "https";
import * as path from "path";

const MODELS_DIR = path.join(__dirname, "../assets/models");

// Model download configurations
interface ModelDownloadConfig {
  modelId: string;
  displayName: string;
  folderName: string;
  available: boolean;
  files: Array<{
    url: string;
    filename: string;
    description: string;
  }>;
}

// Using commit hashes instead of 'main' for stable, permanent URLs
const LLAMA_BASE_URL =
  "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/76ab87fe4ceb2e00c19a24b18326e9c1506f3f20";
const QWEN_BASE_URL =
  "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069";

const MODEL_CONFIGS: ModelDownloadConfig[] = [
  // Llama 3.2 models
  {
    modelId: "llama-3.2-1b-instruct",
    displayName: "Llama 3.2 1B Instruct",
    folderName: "llama-3.2-1b-instruct",
    available: true,
    files: [
      {
        url: `${LLAMA_BASE_URL}/llama-3.2-1B/spinquant/llama3_2_spinquant.pte`,
        filename: "llama3_2_spinquant.pte",
        description: "Model PTE (~1.1GB)",
      },
      {
        url: `${LLAMA_BASE_URL}/tokenizer.json`,
        filename: "tokenizer.json",
        description: "Tokenizer (~10MB)",
      },
      {
        url: `${LLAMA_BASE_URL}/tokenizer_config.json`,
        filename: "tokenizer_config.json",
        description: "Tokenizer Config (~55KB)",
      },
    ],
  },
  {
    modelId: "llama-3.2-3b-instruct",
    displayName: "Llama 3.2 3B Instruct",
    folderName: "llama-3.2-3b-instruct",
    available: true,
    files: [
      {
        url: `${LLAMA_BASE_URL}/llama-3.2-3B/spinquant/llama3_2_3B_spinquant.pte`,
        filename: "llama3_2_3B_spinquant.pte",
        description: "Model PTE (~2.4GB)",
      },
      {
        url: `${LLAMA_BASE_URL}/tokenizer.json`,
        filename: "tokenizer.json",
        description: "Tokenizer (~10MB)",
      },
      {
        url: `${LLAMA_BASE_URL}/tokenizer_config.json`,
        filename: "tokenizer_config.json",
        description: "Tokenizer Config (~55KB)",
      },
    ],
  },
  // Qwen 3 models
  {
    modelId: "qwen-3-0.6b",
    displayName: "Qwen 3 0.6B",
    folderName: "qwen-3-0.6b",
    available: true,
    files: [
      {
        url: `${QWEN_BASE_URL}/qwen-3-0.6B/quantized/qwen3_0_6b_8da4w.pte`,
        filename: "qwen3_0_6b_8da4w.pte",
        description: "Model PTE (~900MB)",
      },
      {
        url: `${QWEN_BASE_URL}/tokenizer.json`,
        filename: "tokenizer.json",
        description: "Tokenizer (~11MB)",
      },
      {
        url: `${QWEN_BASE_URL}/tokenizer_config.json`,
        filename: "tokenizer_config.json",
        description: "Tokenizer Config (~10KB)",
      },
    ],
  },
  {
    modelId: "qwen-3-1.7b",
    displayName: "Qwen 3 1.7B",
    folderName: "qwen-3-1.7b",
    available: true,
    files: [
      {
        url: `${QWEN_BASE_URL}/qwen-3-1.7B/quantized/qwen3_1_7b_8da4w.pte`,
        filename: "qwen3_1_7b_8da4w.pte",
        description: "Model PTE (~2.0GB)",
      },
      {
        url: `${QWEN_BASE_URL}/tokenizer.json`,
        filename: "tokenizer.json",
        description: "Tokenizer (~11MB)",
      },
      {
        url: `${QWEN_BASE_URL}/tokenizer_config.json`,
        filename: "tokenizer_config.json",
        description: "Tokenizer Config (~10KB)",
      },
    ],
  },
  {
    modelId: "qwen-3-4b",
    displayName: "Qwen 3 4B",
    folderName: "qwen-3-4b",
    available: true,
    files: [
      {
        url: `${QWEN_BASE_URL}/qwen-3-4B/quantized/qwen3_4b_8da4w.pte`,
        filename: "qwen3_4b_8da4w.pte",
        description: "Model PTE (~3.5GB)",
      },
      {
        url: `${QWEN_BASE_URL}/tokenizer.json`,
        filename: "tokenizer.json",
        description: "Tokenizer (~11MB)",
      },
      {
        url: `${QWEN_BASE_URL}/tokenizer_config.json`,
        filename: "tokenizer_config.json",
        description: "Tokenizer Config (~10KB)",
      },
    ],
  },
];

function downloadFile(
  url: string,
  dest: string,
  redirectCount = 0,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Too many redirects"));
      return;
    }

    const file = fs.createWriteStream(dest);
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    };

    const req = https.request(options, (response) => {
      if (
        response.statusCode === 302 ||
        response.statusCode === 301 ||
        response.statusCode === 307 ||
        response.statusCode === 308
      ) {
        // Handle redirect
        file.close();
        fs.unlinkSync(dest); // Delete the file
        const location = response.headers.location;
        if (!location) {
          reject(new Error("Redirect with no location header"));
          return;
        }
        const redirectUrl = location.startsWith("http")
          ? location
          : `${parsedUrl.protocol}//${parsedUrl.hostname}${location}`;
        return downloadFile(redirectUrl, dest, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode && response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers["content-length"] || "0", 10);
      let downloadedSize = 0;

      response.on("data", (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(
            `\r  ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(
              2,
            )}MB / ${(totalSize / 1024 / 1024).toFixed(2)}MB)`,
          );
        } else {
          process.stdout.write(
            `\r  Downloaded: ${(downloadedSize / 1024 / 1024).toFixed(2)}MB`,
          );
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        process.stdout.write("\n");
        resolve();
      });

      file.on("error", (err) => {
        try {
          fs.unlinkSync(dest); // Delete the file on error
        } catch {
          // Ignore cleanup errors
        }
        reject(err);
      });

      response.on("error", (err) => {
        try {
          fs.unlinkSync(dest);
        } catch {
          // Ignore cleanup errors
        }
        reject(err);
      });
    });

    req.on("error", (err) => {
      try {
        fs.unlinkSync(dest);
      } catch {
        // Ignore cleanup errors
      }
      reject(err);
    });

    req.end();
  });
}

async function downloadModel(config: ModelDownloadConfig): Promise<void> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Downloading ${config.displayName}...`);
  console.log(`${"=".repeat(80)}\n`);

  if (!config.available) {
    console.log(`⚠️  ${config.displayName} is not yet available for download.`);
    console.log(
      `   ExecuTorch PTE files are not ready. Check the model page for updates.\n`,
    );
    return;
  }

  // Create model-specific directory
  const modelDir = path.join(MODELS_DIR, config.folderName);
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
    console.log(`Created directory: ${modelDir}\n`);
  }

  for (const file of config.files) {
    const destPath = path.join(modelDir, file.filename);

    // Check if file already exists
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 0) {
        console.log(
          `✓ ${file.description} already exists (${(
            stats.size /
            1024 /
            1024
          ).toFixed(2)}MB)`,
        );
        continue;
      }
    }

    console.log(`Downloading ${file.description}...`);
    console.log(`  URL: ${file.url}`);
    console.log(`  Destination: ${destPath}`);

    try {
      await downloadFile(file.url, destPath);
      const stats = fs.statSync(destPath);
      console.log(
        `✓ Downloaded ${file.description} (${(stats.size / 1024 / 1024).toFixed(
          2,
        )}MB)\n`,
      );
    } catch (error) {
      console.error(`✗ Failed to download ${file.description}:`, error);
      throw error;
    }
  }

  console.log(`✓ ${config.displayName} downloaded successfully!\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const downloadAll = args.includes("--all");
  const modelFlag = args.indexOf("--model");
  const specificModel = modelFlag !== -1 ? args[modelFlag + 1] : null;

  console.log("AI Model Downloader");
  console.log(`${"=".repeat(80)}\n`);

  // Create models directory if it doesn't exist
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    console.log(`Created directory: ${MODELS_DIR}\n`);
  }

  // Determine which models to download
  let modelsToDownload: ModelDownloadConfig[];

  if (specificModel) {
    const config = MODEL_CONFIGS.find((m) => m.modelId === specificModel);
    if (!config) {
      console.error(`✗ Model "${specificModel}" not found.`);
      console.log("\nAvailable models:");
      MODEL_CONFIGS.forEach((m) => {
        console.log(
          `  - ${m.modelId} (${
            m.available ? "Available" : "Not available yet"
          })`,
        );
      });
      process.exit(1);
    }
    modelsToDownload = [config];
  } else if (downloadAll) {
    modelsToDownload = MODEL_CONFIGS;
  } else {
    // Default: download only Llama model
    modelsToDownload = MODEL_CONFIGS.filter(
      (m) => m.modelId === "llama-3.2-1b-instruct",
    );
  }

  // Download models
  for (const config of modelsToDownload) {
    try {
      await downloadModel(config);
    } catch (_error) {
      console.error(`✗ Failed to download ${config.displayName}`);
      if (!downloadAll) {
        process.exit(1);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("Download complete!");
  console.log("=".repeat(80));
  console.log(`\nModels are located in: ${MODELS_DIR}`);
  console.log("\nNext steps:");
  console.log("1. Restart Metro bundler to pick up new files");
  console.log("2. Go to Settings > AI Model to select a model");
  console.log("\nAvailable commands:");
  console.log("  pnpm download:models              - Download default model");
  console.log(
    "  pnpm download:models --all        - Download all available models",
  );
  console.log(
    "  pnpm download:models --model <id> - Download specific model\n",
  );

  // Explicitly exit to close any lingering network connections
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
