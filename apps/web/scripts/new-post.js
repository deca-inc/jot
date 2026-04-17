#!/usr/bin/env node
/* global require, process, console, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toCamelCase(slug) {
  return slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log("\n📝 Create a new blog post\n");

  const title = await question("Title: ");
  if (!title.trim()) {
    console.error("Error: Title is required");
    process.exit(1);
  }

  const slugSuggestion = slugify(title);
  const slugInput = await question(`Slug (${slugSuggestion}): `);
  const slug = slugInput.trim() || slugSuggestion;

  const excerpt = await question("Excerpt (short description): ");

  const dateStr = getDateString();
  const filename = `${dateStr}-${slug}.md`;
  const filepath = path.join(__dirname, "..", "content", "blog", filename);

  // Create the markdown file
  const template = `---
title: "${title}"
slug: ${slug}
date: ${dateStr}
excerpt: ${excerpt || "TODO: Add excerpt"}
---

Write your post here...
`;

  fs.writeFileSync(filepath, template);

  // Update posts.ts
  const postsPath = path.join(__dirname, "..", "app", "posts.ts");
  let postsContent = fs.readFileSync(postsPath, "utf-8");

  const varName = toCamelCase(slug);
  const importLine = `import * as ${varName} from "../content/blog/${filename}";\n`;

  // Add import after the comment line
  postsContent = postsContent.replace(
    /(\/\/ Posts are auto-added.*\n)/,
    `$1${importLine}`,
  );

  // Add to rawPosts array
  postsContent = postsContent.replace(
    /export const rawPosts = \[\n/,
    `export const rawPosts = [\n  ${varName},\n`,
  );

  fs.writeFileSync(postsPath, postsContent);

  console.log(`\n✅ Created: content/blog/${filename}`);
  console.log(`✅ Added to app/posts.ts`);
  console.log(`\n📝 Edit your post at: content/blog/${filename}\n`);

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
