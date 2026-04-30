/**
 * Lightweight performance tracing for editor first-render.
 *
 * Usage:
 *   const trace = startEditorTrace();        // begins the trace
 *   trace.mark("step-name");                 // records a timestamp
 *   trace.end();                             // logs the full breakdown
 *
 * All times are relative to the trace start so you can see exactly
 * where the 2-3 seconds are being spent.
 */

// Use Date.now() — Hermes doesn't always have performance.now()
function now(): number {
  return Date.now();
}

interface PerfMark {
  label: string;
  ts: number;
}

export interface EditorTrace {
  /** Record a named checkpoint */
  mark: (label: string) => void;
  /** Finish the trace and log a summary table to the console */
  end: () => void;
}

const P = "[EditorPerf]";

export function startEditorTrace(name = "editor-render"): EditorTrace {
  const t0 = now();
  const marks: PerfMark[] = [{ label: "start", ts: t0 }];
  let ended = false;

  const trace: EditorTrace = {
    mark(label: string) {
      if (ended) return;
      const ts = now();
      marks.push({ label, ts });
      // Log each mark immediately so they show up even if end() never fires
      console.log(`${P} +${ts - t0}ms  ${label}`);
    },

    end() {
      if (ended) return;
      ended = true;
      const tEnd = now();
      marks.push({ label: "end", ts: tEnd });

      const total = tEnd - t0;

      console.log(`${P} ── ${name} ── total: ${total}ms`);
      // Log as simple formatted lines (console.table doesn't work in RN)
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i];
        const delta = i === 0 ? 0 : m.ts - marks[i - 1].ts;
        const cumulative = m.ts - t0;
        console.log(
          `${P}   ${m.label.padEnd(40)} delta: ${String(delta).padStart(6)}ms   cumulative: ${String(cumulative).padStart(6)}ms`,
        );
      }
    },
  };

  // Safety: auto-end after 10s if end() was never called
  setTimeout(() => {
    if (!ended) {
      console.log(`${P} auto-ending trace (10s timeout)`);
      trace.end();
    }
  }, 10000);

  return trace;
}

/**
 * Shared trace instance so JournalComposer and QuillRichEditor can
 * both contribute marks to the same timeline.
 *
 * Call `resetEditorTrace()` when JournalComposer mounts, then access
 * the same trace in QuillRichEditor via `getEditorTrace()`.
 */
let activeTrace: EditorTrace | null = null;

export function resetEditorTrace(): EditorTrace | null {
  if (!__DEV__) return null;
  activeTrace = startEditorTrace("editor-first-render");
  return activeTrace;
}

export function getEditorTrace(): EditorTrace | null {
  if (!__DEV__) return null;
  return activeTrace;
}
