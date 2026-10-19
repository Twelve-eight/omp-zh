# Legacy scripts

Superseded build/verify scripts, kept for reproducing historical verification rounds.

**These are archives, not the current pipeline.** The active entry points stay in the repository
root because `package.json` and `DEVELOP.md` reference them there:

| Purpose | Current script |
|---|---|
| Build | `tools-build-18121.js` |
| Verify | `tools-verify-18121.js` |
| Delivery-order regression | `tools-verify-order.js` |
| Update / patch / rebuild / deliver | `update-zh.js`, `patch-zh.js`, `build-zh.js`, `deliver-zh.js` |

## What is here

The `tools-verify-18xxx.js` and `tools-build-18xxx.js` families are per-release snapshots: each
one asserted the invariants of one upstream version and was cloned forward to the next. They are
retained because `DEVLOG.md` cites them by name as the evidence for historical PASS counts.

Moved here on 2026-10-20. `DEVLOG.md` entries deliberately still use the bare filenames, because
that log records what was run at the time; do not rewrite them. When you need to actually re-run a
historical verification, invoke it as `node tools/legacy/<name>.js` and expect it to fail against
a newer upstream — that is the expected outcome, not a regression.
