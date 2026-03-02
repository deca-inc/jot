#!/usr/bin/env bun
/**
 * Build jot-server for all supported platforms
 *
 * Usage:
 *   bun run scripts/build-all.ts           # Build all platforms
 *   bun run scripts/build-all.ts --current # Build for current platform only
 *   bun run scripts/build-all.ts --target darwin-arm64  # Build specific target
 */

import { existsSync } from "fs";
import { mkdir, rm } from "fs/promises";
import path from "path";
import { $ } from "bun";

const TARGETS = [
  { target: "darwin-arm64", name: "macos-arm64", ext: "" },
  { target: "darwin-x64", name: "macos-x64", ext: "" },
  { target: "linux-x64", name: "linux-x64", ext: "" },
  { target: "linux-arm64", name: "linux-arm64", ext: "" },
  { target: "windows-x64", name: "windows-x64", ext: ".exe" },
] as const;

type Target = (typeof TARGETS)[number];

const DIST_DIR = path.join(import.meta.dir, "..", "dist");

async function getCurrentPlatform(): Promise<string> {
  const os = process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${os}-${arch}`;
}

async function buildTarget(target: Target): Promise<boolean> {
  const outfile = path.join(DIST_DIR, `jot-server-${target.name}${target.ext}`);
  console.log(`\n📦 Building for ${target.name}...`);

  try {
    await $`bun build --compile src/cli.ts --outfile ${outfile} --target=bun-${target.target}`.quiet();
    console.log(`   ✅ Built: ${outfile}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to build for ${target.name}`);
    if (error instanceof Error) {
      console.error(`      ${error.message}`);
    }
    return false;
  }
}

async function createArchive(target: Target): Promise<boolean> {
  const binaryName = `jot-server-${target.name}${target.ext}`;
  const binaryPath = path.join(DIST_DIR, binaryName);

  if (!existsSync(binaryPath)) {
    console.error(`   ❌ Binary not found: ${binaryPath}`);
    return false;
  }

  if (target.target.startsWith("windows")) {
    const archiveName = `jot-server-${target.name}.zip`;
    const archivePath = path.join(DIST_DIR, archiveName);
    console.log(`   📁 Creating ${archiveName}...`);

    // Use zip command if available, otherwise skip
    try {
      await $`cd ${DIST_DIR} && zip -j ${archiveName} ${binaryName}`.quiet();
      console.log(`   ✅ Created: ${archivePath}`);
      return true;
    } catch {
      console.log(`   ⚠️  zip not available, skipping archive creation`);
      return true;
    }
  } else {
    const archiveName = `jot-server-${target.name}.tar.gz`;
    const archivePath = path.join(DIST_DIR, archiveName);
    console.log(`   📁 Creating ${archiveName}...`);

    try {
      await $`tar -czvf ${archivePath} -C ${DIST_DIR} ${binaryName}`.quiet();
      console.log(`   ✅ Created: ${archivePath}`);
      return true;
    } catch {
      console.error(`   ❌ Failed to create archive`);
      return false;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const currentOnly = args.includes("--current");
  const targetIndex = args.indexOf("--target");
  const specificTarget = targetIndex !== -1 ? args[targetIndex + 1] : null;
  const createArchives = args.includes("--archive");
  const clean = args.includes("--clean");

  console.log("🚀 Jot Server Build Script\n");

  // Clean dist directory if requested
  if (clean && existsSync(DIST_DIR)) {
    console.log("🧹 Cleaning dist directory...");
    await rm(DIST_DIR, { recursive: true });
  }

  // Create dist directory
  await mkdir(DIST_DIR, { recursive: true });

  let targetsTooBuild: Target[];

  if (currentOnly) {
    const currentPlatform = await getCurrentPlatform();
    const target = TARGETS.find((t) => t.target === currentPlatform);
    if (!target) {
      console.error(`❌ Current platform ${currentPlatform} not supported`);
      process.exit(1);
    }
    targetsTooBuild = [target];
    console.log(`Building for current platform: ${currentPlatform}`);
  } else if (specificTarget) {
    const target = TARGETS.find((t) => t.target === specificTarget || t.name === specificTarget);
    if (!target) {
      console.error(`❌ Unknown target: ${specificTarget}`);
      console.log(`Available targets: ${TARGETS.map((t) => t.target).join(", ")}`);
      process.exit(1);
    }
    targetsTooBuild = [target];
  } else {
    targetsTooBuild = [...TARGETS];
    console.log("Building for all platforms...");
  }

  const results: { target: Target; success: boolean }[] = [];

  for (const target of targetsTooBuild) {
    const success = await buildTarget(target);
    results.push({ target, success });

    if (success && createArchives) {
      await createArchive(target);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Build Summary\n");

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (successful.length > 0) {
    console.log(`✅ Successful (${successful.length}):`);
    for (const { target } of successful) {
      console.log(`   - ${target.name}`);
    }
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed (${failed.length}):`);
    for (const { target } of failed) {
      console.log(`   - ${target.name}`);
    }
  }

  console.log(`\n📁 Output directory: ${DIST_DIR}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
