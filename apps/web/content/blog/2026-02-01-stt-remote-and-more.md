---
title: "Speech to Text, On-Device and Remote Models"
slug: stt-foundation-and-more
date: 2026-02-01
excerpt: The most requested feature is finally here. Voice input that respects your privacy, with the flexibility to use on-device models or connect to your own remote servers.
---

The most requested feature is finally here. Today we're releasing a major update packed with new AI capabilities:

1. **Speech to Text in Journal Entries** - Speak your thoughts instead of typing
2. **Access to Gemini Nano (Android) and Apple Foundation Models (iOS)** - Use built-in platform AI
3. **Custom downloadable models** - Grab models directly from Hugging Face
4. **Remote models** - Connect to your own servers for both Speech to Text and LLM

## The Journey

Speech to Text was by far the most requested feature. While apps like WhisperFlow exist, none of them focus on offline-first or privacy. As I started building this, I ran into some real challenges:

1. Would first-time users now need to download _two_ models before using the app? That's a rough first impression.
2. How do I give people access to high-quality models without forcing huge downloads?
3. The app's complexity is growing - how do I keep things stable as a solo dev working on this after hours?

## Solving the First-Time User Experience

Something always felt off about requiring a model download before you could use the app. While researching solutions, I discovered that both Apple and Google started shipping platform models as of a few months ago! Starting today, if available on your device, you can select these platform models for both LLM and voice features.

Fair warning: they come with limitations. The platform LLMs lack personality (somehow even worse than the small local models we recommend), and neither voice model records audio - they only offer real-time transcription. That said, for users on lower-end devices, this is still a much better experience than downloading nothing and having no AI at all.

## When You Need More Power

Sometimes you really do need better models. With this release, you can now connect to a remote model - whether that's running on your own computer or through a third-party provider. Just head to settings and configure your endpoint.

This feature is still early. There are probably edge cases I haven't hit yet. We make some assumptions (inspired by the Vercel AI SDK) about how these endpoints handle auth and what responses they return. [If you run into issues, please let me know](https://jot.canny.io/features-bugs).

## Keeping the Codebase Under Control

Claude Code does a lot of the heavy lifting while I focus on architecture, performance and testing. But as these features get more complex and start interacting with many other features, I needed guardrails to prevent the codebase from turning into AI slop.

My solution: I built a custom TDD skill for Claude Code and set up proper test harnesses. Now Claude shows me the tests first, I review them, and only then do we start writing implementation code. The result? This release adds over 500 tests to the repo.

## What's Next?

Jot is starting to feel like my "everything" app for the things I care about - AI, media, notes, and maybe even chat someday. Here's what's on my radar:

1. **Media server & Photos** - it's always felt a bit strange that Google/Apple has my photos. Hey did y'all know Apple's storage for photos is also Google? And Google ain't perfect, people have cited it loses stuff. A personal server/command center, would also pair well with automating remote LLMs.
2. **Shared notes** - If you got a server, you can have shared notes. Maybe I'd even host that server for people.
3. **Desktop app** - it's needed
4. **Tool calling for remote models** - things like search and weather lookups
5. **Tagging system** - with folders becoming smart links to tags
6. **Vector search** - already accounted for in the design, just haven't built it yet
7. **Memory for LLMs** - optional context that persists across conversations
8. **Note summarization/trends features**
9. **More integrations outside the app**
10. **Design polish** - once usage picks up, I want to streamline things further
11. **Export/import** - still on the list, I promise!

Oh, and I really need to add a proper changelog to the app.

See y'all next time.

---

_Have questions or feedback? Check out our [feature requests and bug reports](https://jot.canny.io/features-bugs) page._
