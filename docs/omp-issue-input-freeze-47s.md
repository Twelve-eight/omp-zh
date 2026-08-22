# Issue: UI event loop blocks for ~47s during /tree navigation / startup restore on large sessions (Windows) — input frozen

*This issue is drafted by an AI assistant on behalf of the reporter, based on diagnostic evidence collected from the reporter's own session logs.*

## Summary

On omp **17.2.12 / Windows 10 Pro 19045 / Windows Terminal**, navigating the session tree (`/tree`) or restoring a **large session** (~42% of a 1M-token context window, ~3.2MB jsonl) blocks the **UI event loop synchronously for ~47 seconds**. During the block, keyboard events reach the app (prompt cursor blink refreshes on keypress) but characters are **not inserted** — input appears frozen. The freeze ends on its own when the synchronous rebuild completes.

Reproduced on both the original build and a byte-identical copy (SHA-256 verified) with the same user configuration — **not related to any localization or config customization**.

## Evidence

### 1. `ui.loop-blocked` in session log (`~/.omp/logs/omp.<pid>.log`)

```
{"timestamp":"2026-08-10T12:34:06.788+08:00","level":"warn","pid":17264,
 "message":"ui.loop-blocked","blockedMs":47337,"phase":"unknown"}
```

The block timestamp coincides with the user's `/tree` action on a session at 42.1% / 1M tokens (~420k tokens, 3.2MB jsonl, hundreds of nodes including tool calls and branch summaries). A second, startup-time block of 312ms is also present (normal init).

### 2. Observed symptoms during the freeze
- Keyboard input refreshes the prompt cursor blink (events arrive at the terminal layer) but text is not inserted — ASCII and IME alike.
- A single-core CPU usage of ~20% persists during the freeze (render/rebuild work inside the blocked synchronous section).
- Freeze self-resolves; no error-level log entries.
- `Get-Process` shows no busy threads outside the freeze window (all threads idle at rest), confirming the block is a discrete synchronous stall, not a background leak.

### 3. What the block is
`showTreeSelector` → node pick → `session.navigateTree()` → `renderInitialMessages({ clearTerminalHistory: true })`, which **synchronously rebuilds the entire transcript** (component tree for every message/tool node). On a ~420k-token session this stalls the event loop for tens of seconds. The same synchronous path runs during startup restore of a large session, matching the "input dead right after startup" reports.

### 4. Control experiment (user-verified, original build)
| Scenario | Result |
|---|---|
| `autoResume: false` + fresh start (new session) | **no freeze** — no restore, no full rebuild |
| Manual `resume` of the large session | **freeze** — restore runs the same synchronous `renderInitialMessages({clearTerminalHistory:true})` |
| `/tree` switch in the large session | **freeze** — `ui.loop-blocked blockedMs=47337` (evidence above) |

The trigger is precisely: **loading a large session (restore or tree switch) runs a synchronous full-transcript rebuild**. Startup mode (auto vs manual) is irrelevant; `handleResumeSession` and `showTreeSelector` share the same rebuild path.

## Why this is not the same as #3349

#3349 is a **focus** bug: the selector's done callback calls `setFocus(editor)` against a stale editor instance, so keys route to a ghost component. The stall described here is a **synchronous event-loop block** — no input processing happens at all, regardless of focus. They produce similar symptoms (input unresponsive, recovers on its own) but are distinct mechanisms. Both affect `/tree` navigation.

## Environment

- omp 17.2.12 (also reproduced on a SHA-256-identical copy in an isolated config dir)
- Windows 10 Pro 19045 (x64), Windows Terminal, ConPTY
- Provider: opencode-go (DeepSeek V4 Flash); large session ~420k tokens / 42% of 1M context
- Config: `autoResume: true`, `branchSummary.enabled: true` (defaults also affected)

## Repro steps

1. Start omp with a **large session** (~400k+ tokens, many messages/tool nodes) — either restore it at startup or switch to it.
2. Run `/tree`, pick a node on a different branch, press Enter.
3. (If `branchSummary.enabled`) choose "No summary".
4. During the switch, try typing: keystrokes refresh the prompt cursor but nothing is inserted.
5. After tens of seconds (47s in our case), input works again.

Note: on a small session (a few messages) the switch is instant and nothing is noticeable — the stall scales with transcript size.

## Suggested fix

Make the transcript rebuild path (`renderInitialMessages` with `clearTerminalHistory`) incremental or asynchronous:
- avoid fully re-creating the message component tree synchronously on navigation/restore; reuse stable nodes, or
- chunk the rebuild across frames/ticks so the event loop keeps servicing input, or
- yield before/after the rebuild (the existing `ui.loop-blocked` watchdog could also surface a budget/limit).

At minimum, consider logging the rebuild duration separately so the cost is attributable.
