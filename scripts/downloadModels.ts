#!/usr/bin/env tsx
/**
 * Script to download Llama 3.2 1B Instruct model files for local development
 * Downloads models to assets/models/ directory for bundling with the app
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const MODELS_DIR = path.join(__dirname, '../assets/models');
const BASE_URL = 'https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/v0.5.0';

const FILES_TO_DOWNLOAD = [
  {
    url: `${BASE_URL}/llama-3.2-1B/original/llama3_2_bf16.pte`,
    filename: 'llama3_2_bf16.pte',
    description: 'Llama 3.2 1B Model (~1.5GB)',
  },
  {
    url: `${BASE_URL}/tokenizer.json`,
    filename: 'tokenizer.json',
    description: 'Tokenizer (~1MB)',
  },
  {
    url: `${BASE_URL}/tokenizer_config.json`,
    filename: 'tokenizer_config.json',
    description: 'Tokenizer Config (~5KB)',
  },
];

function downloadFile(url: string, dest: string, redirectCount = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    const file = fs.createWriteStream(dest);
    const parsedUrl = new URL(url);
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    };

    const req = https.request(options, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301 || response.statusCode === 307 || response.statusCode === 308) {
        // Handle redirect
        file.close();
        fs.unlinkSync(dest); // Delete the file
        const location = response.headers.location;
        if (!location) {
          reject(new Error('Redirect with no location header'));
          return;
        }
        const redirectUrl = location.startsWith('http') ? location : `${parsedUrl.protocol}//${parsedUrl.hostname}${location}`;
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

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r  ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)}MB / ${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
        } else {
          process.stdout.write(`\r  Downloaded: ${(downloadedSize / 1024 / 1024).toFixed(2)}MB`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        process.stdout.write('\n');
        resolve();
      });

      file.on('error', (err) => {
        try {
          fs.unlinkSync(dest); // Delete the file on error
        } catch {}
        reject(err);
      });

      response.on('error', (err) => {
        try {
          fs.unlinkSync(dest);
        } catch {}
        reject(err);
      });
    });

    req.on('error', (err) => {
      try {
        fs.unlinkSync(dest);
      } catch {}
      reject(err);
    });

    req.end();
  });
}

async function main() {
  console.log('Downloading Llama 3.2 1B Instruct models...\n');

  // Create models directory if it doesn't exist
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    console.log(`Created directory: ${MODELS_DIR}\n`);
  }

  for (const file of FILES_TO_DOWNLOAD) {
    const destPath = path.join(MODELS_DIR, file.filename);
    
    // Check if file already exists
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 0) {
        console.log(`✓ ${file.description} already exists (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
        continue;
      }
    }

    console.log(`Downloading ${file.description}...`);
    console.log(`  URL: ${file.url}`);
    console.log(`  Destination: ${destPath}`);
    
    try {
      await downloadFile(file.url, destPath);
      const stats = fs.statSync(destPath);
      console.log(`✓ Downloaded ${file.description} (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n`);
    } catch (error) {
      console.error(`✗ Failed to download ${file.description}:`, error);
      process.exit(1);
    }
  }

  console.log('All models downloaded successfully!');
  console.log(`\nModels are located in: ${MODELS_DIR}`);
  console.log('\nNext steps:');
  console.log('1. Update lib/ai/modelConfig.ts to use bundled sources');
  console.log('2. Restart Metro bundler');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

