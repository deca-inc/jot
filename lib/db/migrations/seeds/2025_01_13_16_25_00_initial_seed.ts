import { type MigrationRunner } from "../../migrationTypes";

export const up: MigrationRunner = async (db) => {
  const now = Date.now();

  // Sample journal entry
  const journalBlocks = JSON.stringify([
    {
      type: "heading1",
      content: "My First Journal Entry",
    },
    {
      type: "paragraph",
      content: "This is a sample journal entry with some rich content.",
    },
    {
      type: "paragraph",
      content: "I can write about my thoughts, feelings, and experiences here.",
    },
    {
      type: "list",
      ordered: false,
      items: ["Item 1", "Item 2", "Item 3"],
    },
    {
      type: "checkbox",
      checked: true,
      content: "Completed task",
    },
    {
      type: "checkbox",
      checked: false,
      content: "Pending task",
    },
  ]);

  await db.runAsync(
    `INSERT INTO entries (type, title, blocks, tags, attachments, isFavorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "journal",
      "My First Journal Entry",
      journalBlocks,
      JSON.stringify(["personal", "reflection"]),
      JSON.stringify([]),
      0,
      now,
      now,
    ]
  );

  // Sample AI chat entry
  // Note: Order is important - user message first, then assistant responses
  const aiChatBlocks = JSON.stringify([
    {
      type: "markdown",
      content: "I'd like to understand more about journaling.",
      role: "user",
    },
    {
      type: "markdown",
      content:
        "Journaling is a great practice for self-reflection and personal growth. It helps you track your thoughts, feelings, and experiences over time.",
      role: "assistant",
    },
  ]);

  await db.runAsync(
    `INSERT INTO entries (type, title, blocks, tags, attachments, isFavorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "ai_chat",
      "I'd like to understand more about journaling.", // Title is now the user's first message
      aiChatBlocks,
      JSON.stringify(["ai", "conversation"]),
      JSON.stringify([]),
      0,
      now - 3600000, // 1 hour ago
      now - 3600000,
    ]
  );

  // Favorite journal entry
  const favoriteBlocks = JSON.stringify([
    {
      type: "heading2",
      content: "Important Thoughts",
    },
    {
      type: "paragraph",
      content: "This is an important entry that I've marked as a favorite.",
    },
    {
      type: "quote",
      content: "The journey of a thousand miles begins with a single step.",
    },
  ]);

  await db.runAsync(
    `INSERT INTO entries (type, title, blocks, tags, attachments, isFavorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "journal",
      "Important Thoughts",
      favoriteBlocks,
      JSON.stringify(["important", "quote"]),
      JSON.stringify([]),
      1, // favorite
      now - 86400000, // 1 day ago
      now - 86400000,
    ]
  );

  // Entry with code block
  const codeBlocks = JSON.stringify([
    {
      type: "paragraph",
      content: "Here's some code I wrote:",
    },
    {
      type: "code",
      language: "typescript",
      content: `function greet(name: string) {
  return \`Hello, \${name}!\`;
}`,
    },
  ]);

  await db.runAsync(
    `INSERT INTO entries (type, title, blocks, tags, attachments, isFavorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "journal",
      "Code Snippet",
      codeBlocks,
      JSON.stringify(["code", "programming"]),
      JSON.stringify([]),
      0,
      now - 172800000, // 2 days ago
      now - 172800000,
    ]
  );

  // Sample setting
  await db.runAsync(
    `INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
    ["test_setting", JSON.stringify({ enabled: true, theme: "light" }), now]
  );
};

export const down: MigrationRunner = async (db) => {
  await db.runAsync("DELETE FROM entries");
  await db.runAsync("DELETE FROM settings");
  await db.runAsync("DELETE FROM entries_fts");
};

