/**
 * Web implementation of QuillRichEditor.
 *
 * Uses Quill.js directly in the DOM instead of going through a React Native
 * WebView wrapper (react-native-cn-quill). This is used when running on
 * Expo Web / Tauri where the WebView abstraction is unnecessary.
 *
 * Exposes the same ref interface (QuillRichEditorRef) and accepts the same
 * props as the native version so consuming screens need no changes.
 */

import Quill from "quill";
import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useState,
} from "react";
import { View, StyleSheet } from "react-native";
import "quill/dist/quill.snow.css";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import type { VoiceRecordButtonResult } from "./VoiceRecordButton";

// ---------------------------------------------------------------------------
// Types for Quill v1 (no bundled TS defs)
// ---------------------------------------------------------------------------

interface QuillRange {
  index: number;
  length: number;
}

interface QuillFormats {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  header?: number | false;
  list?: string | false;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Public ref interface (must match the native version exactly)
// ---------------------------------------------------------------------------

export interface QuillRichEditorRef {
  getHtml: () => Promise<string | undefined>;
  focus: () => void;
  blur: () => void;
  /** Insert text at current cursor position (or end if no cursor) */
  insertText: (text: string) => Promise<void>;
  /** Insert HTML at current cursor position (or end if no cursor) */
  insertHtml: (html: string) => Promise<void>;
  /** Replace all editor content with new HTML (for sync) */
  setHtml: (html: string) => Promise<void>;
  /** Insert an audio attachment embed */
  insertAudioAttachment: (options: {
    id: string;
    src: string;
    duration: number;
  }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Props interface (must match the native version)
// ---------------------------------------------------------------------------

interface QuillRichEditorProps {
  initialHtml?: string;
  placeholder?: string;
  onChangeHtml?: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  editorPadding?: number;
  autoFocus?: boolean;
  hideToolbar?: boolean;
  /** Callback when voice transcription completes with final text and audio file */
  onTranscriptionComplete?: (result: VoiceRecordButtonResult) => void;
  /** Callback when no voice model is downloaded - should open model manager */
  onNoModelAvailable?: () => void;
}

// ---------------------------------------------------------------------------
// Register the custom AudioAttachment blot (once)
// ---------------------------------------------------------------------------

let blotRegistered = false;

function registerAudioAttachmentBlot() {
  if (blotRegistered) return;
  blotRegistered = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Quill's import returns untyped blot classes
  const BlockEmbed = Quill.import("blots/block/embed") as any;

  class AudioAttachmentBlot extends BlockEmbed {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Quill blot value is untyped
    static create(value: any) {
      const node = super.create() as HTMLDivElement;

      let data: { id?: string; src?: string; duration?: number } = {};
      try {
        data = typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        // ignore parse errors
      }

      const id = data.id || "";
      const src = data.src || "";
      const duration = parseFloat(String(data.duration)) || 0;

      const mins = Math.floor(duration / 60);
      const secs = Math.floor(duration % 60);
      const durationStr = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

      node.setAttribute("data-attachment-id", id);
      node.setAttribute(
        "data-value",
        typeof value === "string" ? value : JSON.stringify(value),
      );
      node.setAttribute("contenteditable", "false");

      node.innerHTML =
        '<button class="audio-delete-btn" type="button" title="Delete audio">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
        "</button>" +
        '<button class="audio-play-btn" type="button">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>' +
        "</button>" +
        '<div class="audio-progress"><div class="audio-progress-bar"></div></div>' +
        '<span class="audio-duration">' +
        durationStr +
        "</span>" +
        '<audio src="' +
        src +
        '" preload="metadata"></audio>';

      return node;
    }

    static value(node: HTMLElement) {
      const dataValue = node.getAttribute("data-value") || "{}";
      try {
        const parsed = JSON.parse(dataValue);
        const result: { id: string; duration: number; src?: string } = {
          id: parsed.id || "",
          duration: parsed.duration || 0,
        };
        if (parsed.src && !parsed.src.startsWith("data:")) {
          result.src = parsed.src;
        }
        return JSON.stringify(result);
      } catch {
        return dataValue;
      }
    }
  }

  AudioAttachmentBlot.blotName = "audio-attachment";
  AudioAttachmentBlot.tagName = "DIV";
  AudioAttachmentBlot.className = "audio-attachment";

  Quill.register(AudioAttachmentBlot, true);
}

// ---------------------------------------------------------------------------
// Audio player logic (attaches once per editor container)
// ---------------------------------------------------------------------------

function attachAudioPlayer(container: HTMLElement) {
  let currentAudio: HTMLAudioElement | null = null;
  let currentBtn: HTMLElement | null = null;
  let currentProgressBar: HTMLElement | null = null;
  let currentDurationEl: HTMLElement | null = null;
  let animationFrame: number | null = null;

  const playSvg =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const pauseSvg =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

  function updateProgress() {
    if (currentAudio && currentProgressBar && currentDurationEl) {
      const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
      currentProgressBar.style.width = `${progress}%`;
      currentDurationEl.textContent = formatTime(currentAudio.currentTime);
      if (!currentAudio.paused) {
        animationFrame = requestAnimationFrame(updateProgress);
      }
    }
  }

  function stopCurrent() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    if (currentBtn) {
      currentBtn.innerHTML = playSvg;
      currentBtn.classList.remove("playing");
    }
    if (currentProgressBar) {
      currentProgressBar.style.width = "0%";
    }
    if (currentDurationEl && currentAudio) {
      currentDurationEl.textContent = formatTime(currentAudio.duration || 0);
    }
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    currentAudio = null;
    currentBtn = null;
    currentProgressBar = null;
    currentDurationEl = null;
  }

  // Delete button handler
  const handleDelete = (e: Event) => {
    const target = e.target as HTMLElement;
    const deleteBtn = target.closest?.(".audio-delete-btn");
    if (!deleteBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const attachmentEl = deleteBtn.closest(".audio-attachment");
    if (!attachmentEl) return;

    const audio = attachmentEl.querySelector("audio");
    if (audio && currentAudio === audio) {
      audio.pause();
      currentAudio = null;
      currentBtn = null;
      currentProgressBar = null;
      currentDurationEl = null;
      if (animationFrame) cancelAnimationFrame(animationFrame);
    }

    // Remove the DOM node (Quill will pick up the mutation)
    attachmentEl.remove();
  };

  // Play button handler
  const handlePlay = (e: Event) => {
    const target = e.target as HTMLElement;
    const playBtn = target.closest?.(".audio-play-btn") as HTMLElement | null;
    if (!playBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const attachmentEl = playBtn.closest(".audio-attachment");
    if (!attachmentEl) return;

    const audio = attachmentEl.querySelector("audio") as HTMLAudioElement;
    const progressBar = attachmentEl.querySelector(
      ".audio-progress-bar",
    ) as HTMLElement | null;
    const durationEl = attachmentEl.querySelector(
      ".audio-duration",
    ) as HTMLElement | null;

    if (!audio) return;

    if (currentAudio === audio) {
      if (audio.paused) {
        audio.play();
        playBtn.innerHTML = pauseSvg;
        playBtn.classList.add("playing");
        updateProgress();
      } else {
        audio.pause();
        playBtn.innerHTML = playSvg;
        playBtn.classList.remove("playing");
      }
      return;
    }

    stopCurrent();

    currentAudio = audio;
    currentBtn = playBtn;
    currentProgressBar = progressBar;
    currentDurationEl = durationEl;

    audio.play();
    playBtn.innerHTML = pauseSvg;
    playBtn.classList.add("playing");
    updateProgress();

    audio.onended = () => {
      stopCurrent();
    };
  };

  // Seek handler
  const handleSeek = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const progressContainer = target.closest?.(
      ".audio-progress",
    ) as HTMLElement | null;
    if (!progressContainer) return;

    const attachmentEl = progressContainer.closest(".audio-attachment");
    if (!attachmentEl) return;

    const audio = attachmentEl.querySelector("audio") as HTMLAudioElement;
    if (!audio || !audio.duration) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = progressContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    audio.currentTime = percent * audio.duration;

    const progressBar = attachmentEl.querySelector(
      ".audio-progress-bar",
    ) as HTMLElement | null;
    if (progressBar) {
      progressBar.style.width = `${percent * 100}%`;
    }

    const durationEl = attachmentEl.querySelector(
      ".audio-duration",
    ) as HTMLElement | null;
    if (durationEl) {
      durationEl.textContent = formatTime(audio.currentTime);
    }
  };

  container.addEventListener("click", handleDelete, true);
  container.addEventListener("click", handlePlay, true);
  container.addEventListener("click", handleSeek as EventListener, true);

  // Return cleanup function
  return () => {
    stopCurrent();
    container.removeEventListener("click", handleDelete, true);
    container.removeEventListener("click", handlePlay, true);
    container.removeEventListener("click", handleSeek as EventListener, true);
  };
}

// ---------------------------------------------------------------------------
// Generate dynamic CSS to match the native editor styling
// ---------------------------------------------------------------------------

function generateEditorCSS(
  theme: {
    gradient: { middle: string };
    textPrimary: string;
    textSecondary: string;
    isDark: boolean;
  },
  editorPadding: number,
) {
  const checkColor = theme.isDark ? "%230f172a" : "%23ffffff";
  return `
    /* Reset Quill Snow theme chrome — we provide our own toolbar */
    .ql-toolbar.ql-snow {
      display: none !important;
    }
    .ql-container.ql-snow {
      border: none !important;
    }

    /* General */
    * {
      -webkit-user-select: text;
      user-select: text;
    }
    .ql-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 18px;
      background-color: ${theme.gradient.middle};
    }
    .ql-editor {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 18px;
      line-height: 1.5;
      color: ${theme.textPrimary};
      padding: ${editorPadding}px;
      padding-bottom: 120px;
      background-color: ${theme.gradient.middle};
      min-height: 100%;
    }
    .ql-editor.ql-blank::before {
      color: ${theme.textSecondary} !important;
      font-style: normal !important;
      opacity: 0.7 !important;
    }

    /* Paragraphs & headings */
    .ql-editor p {
      margin-bottom: 12px;
    }
    .ql-editor h1 {
      font-size: 37px;
      font-weight: bold;
      line-height: 1.2;
      margin-bottom: 12px;
      color: ${theme.textPrimary};
    }
    .ql-editor h2 {
      font-size: 29px;
      font-weight: bold;
      line-height: 1.25;
      margin-bottom: 10px;
      color: ${theme.textPrimary};
    }
    .ql-editor h3 {
      font-size: 23px;
      font-weight: bold;
      line-height: 1.3;
      margin-bottom: 8px;
      color: ${theme.textPrimary};
    }

    /* Lists */
    .ql-editor ul, .ql-editor ol {
      padding-left: 0 !important;
      margin-left: 0 !important;
      margin-bottom: 16px;
      list-style: none !important;
    }
    .ql-editor li {
      margin-bottom: 4px;
      line-height: 27px;
      padding-left: 28px !important;
      position: relative;
    }
    .ql-editor li::before {
      position: absolute !important;
      left: 0 !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      width: 18px !important;
      text-align: center !important;
    }
    .ql-editor ul li::before {
      font-size: 1.2em !important;
    }
    .ql-editor ul > li::marker {
      color: ${theme.textPrimary};
      font-size: 0.7em;
    }
    .ql-editor ol > li::marker {
      color: ${theme.textPrimary};
    }

    /* Checklist styling */
    .ql-editor ul[data-checked=true],
    .ql-editor ul[data-checked=false] {
      padding-left: 0 !important;
      margin: 0 !important;
      margin-bottom: 0 !important;
    }
    .ql-editor ul[data-checked=true] + :not(ul[data-checked]),
    .ql-editor ul[data-checked=false] + :not(ul[data-checked]) {
      margin-top: 16px !important;
    }
    .ql-editor ul[data-checked=true]:last-child,
    .ql-editor ul[data-checked=false]:last-child {
      margin-bottom: 16px !important;
    }
    .ql-editor ul[data-checked=false] > li,
    .ql-editor ul[data-checked=true] > li {
      padding-left: 28px !important;
      min-height: 27px !important;
      line-height: 27px !important;
      margin: 0 !important;
      margin-bottom: 4px !important;
      position: relative !important;
    }
    .ql-editor ul[data-checked=false] > li {
      color: ${theme.textPrimary};
      text-decoration: none;
    }
    .ql-editor ul[data-checked=true] > li {
      color: ${theme.textSecondary};
      text-decoration: line-through;
    }
    .ql-editor ul[data-checked=false] > li::before,
    .ql-editor ul[data-checked=true] > li::before {
      content: '' !important;
      font-size: 0 !important;
      color: transparent !important;
      position: absolute !important;
      left: 0 !important;
      top: 4px !important;
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      max-width: 18px !important;
      max-height: 18px !important;
      border-radius: 4px !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
      background-size: 12px 12px !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
      cursor: pointer !important;
      pointer-events: all !important;
    }
    .ql-editor ul[data-checked=false] > li::before {
      border: 2px solid ${theme.textSecondary} !important;
      background-color: transparent !important;
      background-image: none !important;
    }
    .ql-editor ul[data-checked=true] > li::before {
      border: 2px solid ${theme.textPrimary} !important;
      background-color: ${theme.textPrimary} !important;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${checkColor}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E") !important;
    }

    /* Blockquote & code */
    .ql-editor blockquote {
      border-left: 4px solid ${theme.textSecondary};
      padding-left: 16px;
      margin-left: 0;
      font-style: italic;
      color: ${theme.textSecondary};
    }
    .ql-editor pre {
      background-color: ${theme.isDark ? "#1e1e1e" : "#f5f5f5"};
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
    }

    /* Audio attachment player */
    .audio-attachment {
      display: flex;
      align-items: center;
      gap: 12px;
      background: ${theme.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"};
      border-radius: 12px;
      padding: 12px 16px;
      margin: 12px 0;
      user-select: none;
      -webkit-user-select: none;
      width: 100%;
      box-sizing: border-box;
      position: relative;
    }
    .audio-attachment audio { display: none; }
    .audio-delete-btn {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: none;
      background: ${theme.isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"};
      color: ${theme.textPrimary};
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      padding: 0;
      opacity: 0.7;
      z-index: 10;
    }
    .audio-delete-btn:hover {
      background: ${theme.isDark ? "rgba(255,100,100,0.4)" : "rgba(200,50,50,0.3)"};
      opacity: 1;
    }
    .audio-delete-btn:active { transform: scale(0.9); }
    .audio-delete-btn svg { width: 14px; height: 14px; }
    .audio-play-btn {
      width: 40px;
      height: 40px;
      min-width: 40px;
      border-radius: 50%;
      border: none;
      background: ${theme.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)"};
      color: ${theme.textPrimary};
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      padding: 0;
    }
    .audio-play-btn:hover {
      background: ${theme.isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)"};
    }
    .audio-play-btn:active { transform: scale(0.95); }
    .audio-play-btn svg { width: 20px; height: 20px; }
    .audio-progress {
      flex: 1;
      height: 6px;
      background: ${theme.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
      border-radius: 3px;
      overflow: hidden;
      cursor: pointer;
    }
    .audio-progress-bar {
      height: 100%;
      width: 0%;
      background: ${theme.textPrimary};
      border-radius: 3px;
      transition: width 0.1s linear;
    }
    .audio-duration {
      font-size: 13px;
      color: ${theme.textSecondary};
      min-width: 40px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* Bubble toolbar (selection-based, desktop) */
    .bubble-toolbar {
      position: absolute;
      display: none;
      flex-direction: row;
      align-items: center;
      gap: 2px;
      padding: 4px 6px;
      border-radius: 8px;
      background: ${theme.isDark ? "rgba(50, 50, 50, 0.95)" : "rgba(255, 255, 255, 0.97)"};
      box-shadow: 0 2px 12px rgba(0, 0, 0, ${theme.isDark ? "0.4" : "0.15"}),
                  0 0 0 1px rgba(${theme.isDark ? "255,255,255,0.1" : "0,0,0,0.06"});
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.15s ease;
      pointer-events: none;
      white-space: nowrap;
    }
    .bubble-toolbar.visible {
      display: flex;
      opacity: 1;
      pointer-events: auto;
    }
    .bubble-toolbar .bubble-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: none;
      border-radius: 5px;
      background: transparent;
      color: ${theme.textPrimary};
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.12s ease;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .bubble-toolbar .bubble-btn:hover {
      background: ${theme.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)"};
    }
    .bubble-toolbar .bubble-btn.active {
      background: ${theme.isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)"};
      color: ${theme.isDark ? "#fff" : "#000"};
    }
    .bubble-toolbar .bubble-sep {
      width: 1px;
      height: 18px;
      background: ${theme.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"};
      margin: 0 3px;
    }
    .bubble-toolbar .bubble-btn svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
  `;
}

// ---------------------------------------------------------------------------
// Bubble toolbar (shown on text selection)
// ---------------------------------------------------------------------------

function createBubbleToolbar(
  quill: InstanceType<typeof Quill>,
  containerEl: HTMLElement,
) {
  const toolbar = document.createElement("div");
  toolbar.className = "bubble-toolbar";
  toolbar.innerHTML =
    '<button class="bubble-btn" data-format="bold" title="Bold"><strong>B</strong></button>' +
    '<button class="bubble-btn" data-format="italic" title="Italic"><em>I</em></button>' +
    '<button class="bubble-btn" data-format="underline" title="Underline"><u>U</u></button>' +
    '<button class="bubble-btn" data-format="strike" title="Strikethrough"><s>S</s></button>' +
    '<div class="bubble-sep"></div>' +
    '<button class="bubble-btn" data-format="header" data-value="1" title="Heading 1" style="font-size:16px">H1</button>' +
    '<button class="bubble-btn" data-format="header" data-value="2" title="Heading 2" style="font-size:14px">H2</button>' +
    '<button class="bubble-btn" data-format="header" data-value="3" title="Heading 3" style="font-size:13px">H3</button>' +
    '<div class="bubble-sep"></div>' +
    '<button class="bubble-btn" data-format="list" data-value="bullet" title="Bullet List"><svg viewBox="0 0 24 24"><circle cx="4" cy="7" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="4" cy="17" r="2"/><rect x="9" y="6" width="12" height="2" rx="1"/><rect x="9" y="11" width="12" height="2" rx="1"/><rect x="9" y="16" width="12" height="2" rx="1"/></svg></button>' +
    '<button class="bubble-btn" data-format="list" data-value="ordered" title="Numbered List"><svg viewBox="0 0 24 24"><text x="2" y="9" font-size="7" font-weight="bold" fill="currentColor">1</text><text x="2" y="14.5" font-size="7" font-weight="bold" fill="currentColor">2</text><text x="2" y="20" font-size="7" font-weight="bold" fill="currentColor">3</text><rect x="10" y="6" width="11" height="2" rx="1"/><rect x="10" y="11" width="11" height="2" rx="1"/><rect x="10" y="16" width="11" height="2" rx="1"/></svg></button>' +
    '<button class="bubble-btn" data-format="list" data-value="unchecked" title="Checklist"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><polyline points="7 12 10 15 17 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';

  containerEl.appendChild(toolbar);

  // Prevent clicks from stealing selection
  toolbar.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });

  // Handle format button clicks
  toolbar.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(
      ".bubble-btn",
    ) as HTMLElement | null;
    if (!btn) return;

    const format = btn.getAttribute("data-format");
    const value = btn.getAttribute("data-value");
    if (!format) return;

    const currentFormat = quill.getFormat() as QuillFormats;

    if (format === "header") {
      const headerVal = parseInt(value || "0", 10);
      quill.format(
        "header",
        currentFormat.header === headerVal ? false : headerVal,
      );
    } else if (format === "list") {
      quill.format(
        "list",
        currentFormat.list === value ? false : (value as string),
      );
    } else {
      quill.format(format, !currentFormat[format]);
    }

    updateActiveStates();
  });

  function updateActiveStates() {
    const range = quill.getSelection() as QuillRange | null;
    if (!range || range.length === 0) return;

    const formats = quill.getFormat(range) as QuillFormats;
    const buttons = toolbar.querySelectorAll(".bubble-btn");
    buttons.forEach((btn) => {
      const fmt = btn.getAttribute("data-format");
      const val = btn.getAttribute("data-value");
      let isActive = false;

      if (fmt === "header") {
        isActive = formats.header === parseInt(val || "0", 10);
      } else if (fmt === "list") {
        isActive = formats.list === val;
      } else if (fmt) {
        isActive = !!formats[fmt];
      }

      if (isActive) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function positionToolbar(range: QuillRange) {
    const bounds = quill.getBounds(range.index, range.length);
    if (!bounds) {
      toolbar.classList.remove("visible");
      return;
    }

    const toolbarHeight = 38;
    const gap = 6;
    const qlContainer = containerEl.querySelector(
      ".ql-container",
    ) as HTMLElement | null;
    if (!qlContainer) return;

    const containerRect = qlContainer.getBoundingClientRect();
    const toolbarWidth = toolbar.offsetWidth || 320;

    let top = bounds.top - toolbarHeight - gap;
    if (top < 8) {
      top = bounds.top + bounds.height + gap;
    }

    let left = bounds.left + bounds.width / 2 - toolbarWidth / 2;
    if (left < 8) left = 8;
    if (left + toolbarWidth > containerRect.width - 8) {
      left = containerRect.width - toolbarWidth - 8;
    }

    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
    toolbar.classList.add("visible");
  }

  // Wire up Quill events
  quill.on("selection-change", (range: QuillRange | null) => {
    if (range && range.length > 0) {
      updateActiveStates();
      positionToolbar(range);
    } else {
      toolbar.classList.remove("visible");
    }
  });

  // Reposition on scroll
  const editorEl = containerEl.querySelector(".ql-editor");
  if (editorEl) {
    editorEl.addEventListener("scroll", () => {
      const range = quill.getSelection() as QuillRange | null;
      if (range && range.length > 0) {
        positionToolbar(range);
      }
    });
  }

  // Update on text change
  quill.on("text-change", () => {
    const range = quill.getSelection() as QuillRange | null;
    if (range && range.length > 0) {
      updateActiveStates();
    }
  });

  return () => {
    toolbar.remove();
  };
}

// ---------------------------------------------------------------------------
// Checkbox fix (same as native version — prevent double-toggle)
// ---------------------------------------------------------------------------

function attachCheckboxFix(
  quill: InstanceType<typeof Quill>,
  containerEl: HTMLElement,
) {
  let lastToggleTime = 0;
  let lastToggleTarget: HTMLElement | null = null;
  const DEBOUNCE_MS = 300;

  function findChecklistLi(target: HTMLElement) {
    let el: HTMLElement | null = target;
    while (el && el !== document.body) {
      if (el.tagName === "LI") {
        const ul = el.parentElement;
        if (ul && ul.hasAttribute("data-checked")) {
          return { li: el, ul };
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  function toggleCheckbox(li: HTMLElement, ul: HTMLElement) {
    const now = Date.now();
    if (lastToggleTarget === li && now - lastToggleTime < DEBOUNCE_MS) {
      return;
    }
    lastToggleTime = now;
    lastToggleTarget = li;

    const currentChecked = ul.getAttribute("data-checked");
    const newValue = currentChecked === "true" ? "unchecked" : "checked";

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Quill.find is not in the v1 type defs
      let blot = (Quill as any).find(li);
      if (!blot) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        blot = (Quill as any).find(ul);
      }
      if (!blot && li.firstChild) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        blot = (Quill as any).find(li.firstChild, true);
      }

      if (blot) {
        const index = quill.getIndex(blot);
        quill.formatLine(index, 1, "list", newValue, "user");
      }
    } catch (err) {
      console.warn("Checkbox toggle error:", err);
    }
  }

  const handler = (e: Event) => {
    const result = findChecklistLi(e.target as HTMLElement);
    if (result) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleCheckbox(result.li, result.ul);
    }
  };

  containerEl.addEventListener("mousedown", handler, true);

  return () => {
    containerEl.removeEventListener("mousedown", handler, true);
  };
}

// ---------------------------------------------------------------------------
// Auto-scroll cursor into view
// ---------------------------------------------------------------------------

function attachAutoScroll(quill: InstanceType<typeof Quill>) {
  function scrollCursorIntoView() {
    const selection = quill.getSelection() as QuillRange | null;
    if (!selection) return;

    const bounds = quill.getBounds(selection.index);
    if (!bounds) return;

    const editor = document.querySelector(".ql-editor") as HTMLElement | null;
    if (!editor) return;

    const toolbarHeight = 80;
    const cursorBottom = bounds.top + bounds.height;
    const visibleBottom =
      editor.scrollTop + editor.clientHeight - toolbarHeight;

    if (cursorBottom > visibleBottom) {
      editor.scrollTop =
        cursorBottom - editor.clientHeight + toolbarHeight + 48;
    }
  }

  quill.on("text-change", () => {
    setTimeout(scrollCursorIntoView, 10);
  });

  quill.root.addEventListener("focus", () => {
    setTimeout(scrollCursorIntoView, 200);
  });

  quill.on("selection-change", (range: QuillRange | null) => {
    if (range) {
      setTimeout(scrollCursorIntoView, 50);
    }
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const QuillRichEditor = forwardRef<
  QuillRichEditorRef,
  QuillRichEditorProps
>(function QuillRichEditor(
  {
    initialHtml = "<p></p>",
    placeholder = "Start writing...",
    onChangeHtml,
    onFocus,
    onBlur,
    editorPadding = spacingPatterns.screen,
    autoFocus = false,
    hideToolbar: _hideToolbar = false,
  },
  ref,
) {
  const seasonalTheme = useSeasonalTheme();

  // DOM refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<InstanceType<typeof Quill> | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Track whether the initial HTML has been set (avoid overwriting user edits)
  const [isReady, setIsReady] = useState(false);

  // Store latest callback refs so we can use them without re-creating Quill
  const onChangeHtmlRef = useRef(onChangeHtml);
  onChangeHtmlRef.current = onChangeHtml;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  // -------------------------------------------------------------------------
  // Expose ref methods
  // -------------------------------------------------------------------------

  useImperativeHandle(
    ref,
    () => ({
      getHtml: async () => {
        return quillRef.current?.root.innerHTML;
      },
      focus: () => {
        quillRef.current?.focus();
      },
      blur: () => {
        quillRef.current?.blur();
      },
      insertText: async (text: string) => {
        const quill = quillRef.current;
        if (!quill) return;

        const selection = quill.getSelection() as QuillRange | null;
        const index = selection?.index ?? quill.getLength() - 1;
        quill.insertText(index, text);
        quill.setSelection(index + text.length, 0);
      },
      insertHtml: async (html: string) => {
        const quill = quillRef.current;
        if (!quill) return;

        const selection = quill.getSelection() as QuillRange | null;
        const index = selection?.index ?? quill.getLength() - 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- clipboard.dangerouslyPasteHTML isn't in v1 types
        (quill as any).clipboard.dangerouslyPasteHTML(index, html);
      },
      setHtml: async (html: string) => {
        const quill = quillRef.current;
        if (!quill) return;

        const length = quill.getLength();
        if (length > 1) {
          quill.deleteText(0, length);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (quill as any).clipboard.dangerouslyPasteHTML(0, html);
      },
      insertAudioAttachment: async (options: {
        id: string;
        src: string;
        duration: number;
      }) => {
        const quill = quillRef.current;
        if (!quill) return;

        const selection = quill.getSelection() as QuillRange | null;
        const index = selection?.index ?? quill.getLength() - 1;

        quill.insertText(index, "\n");
        const value = JSON.stringify({
          id: options.id,
          src: options.src,
          duration: options.duration,
        });
        quill.insertEmbed(index + 1, "audio-attachment", value);
        quill.setSelection(index + 2, 0);
      },
    }),
    [],
  );

  // -------------------------------------------------------------------------
  // Initialize Quill (once)
  // -------------------------------------------------------------------------

  const initQuill = useCallback(() => {
    const container = containerRef.current;
    if (!container || quillRef.current) return;

    // Register custom blot
    registerAudioAttachmentBlot();

    // Create editor div inside the container
    const editorDiv = document.createElement("div");
    editorDiv.id = "quill-editor-web";
    container.appendChild(editorDiv);

    const quill = new Quill(editorDiv, {
      theme: "snow",
      placeholder,
      modules: {
        toolbar: false, // We use the bubble toolbar instead
        clipboard: { matchVisual: false },
      },
    });

    quillRef.current = quill;

    // Set initial HTML
    if (initialHtml && initialHtml !== "<p></p>") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (quill as any).clipboard.dangerouslyPasteHTML(0, initialHtml);
    }

    // Wire up events using stable refs
    quill.on("text-change", () => {
      const html = quill.root.innerHTML;
      onChangeHtmlRef.current?.(html);
    });

    quill.root.addEventListener("focus", () => {
      onFocusRef.current?.();
    });

    quill.root.addEventListener("blur", () => {
      onBlurRef.current?.();
    });

    // Auto-scroll cursor into view
    attachAutoScroll(quill);

    // Checkbox fix
    attachCheckboxFix(quill, container);

    // Bubble toolbar (selection-based formatting)
    createBubbleToolbar(quill, container);

    // Audio player
    attachAudioPlayer(container);

    // Auto-focus
    if (autoFocus) {
      setTimeout(() => quill.focus(), 100);
    }

    setIsReady(true);
  }, []);

  // Mount effect
  useEffect(() => {
    initQuill();

    return () => {
      // Cleanup: destroy Quill instance
      const container = containerRef.current;
      if (container) {
        // Remove all child elements (the editor div)
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
      quillRef.current = null;
    };
  }, [initQuill]);

  // -------------------------------------------------------------------------
  // Dynamic style injection (updates when theme or padding changes)
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Inject or update the <style> tag for our editor CSS
    if (!styleRef.current) {
      const style = document.createElement("style");
      style.setAttribute("data-quill-editor-web", "true");
      document.head.appendChild(style);
      styleRef.current = style;
    }

    styleRef.current.textContent = generateEditorCSS(
      seasonalTheme,
      editorPadding,
    );

    return () => {
      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
    };
  }, [seasonalTheme, editorPadding]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Container style with the matching background
  const containerStyle = {
    flex: 1,
    backgroundColor: seasonalTheme.gradient.middle,
    position: "relative" as const,
    overflow: "hidden" as const,
  };

  return (
    <View style={styles.container}>
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        style={containerStyle}
        // Suppress the "cannot be rendered inside a <div>" warning for RN Web
        data-quill-ready={isReady ? "true" : "false"}
      />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
