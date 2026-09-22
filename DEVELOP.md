# Development contracts

## Responses reasoning replay compatibility (2026-09-12; SUPERSEDED 2026-09-22)

Status: superseded. The `compat.replayResponsesReasoning` resolver default, the `T7` gate, the `QLt`
items/bKe gates, the `Mbe`/`Xni` prepend filters and the `OMP_NO_REPLAY_REASONING=1` master switch
have all been removed from `patch-zh.js`. Do not reintroduce them.

Why: the master switch applied to every provider. With reasoning replay disabled, DeepSeek thinking
mode was rejected upstream with `400 code 11155` ("the reasoning content from the previous turn must
be passed back in thinking mode"), which `wb2api` surfaced as a 503 storm (about 800 lines on
2026-09-22). The astra account-pool problem that motivated the gates is gone.

What is kept: the `encstale` error-classification rules (a/b) that extend the stale-responses-item
regexes so encrypted-content failures are retried. They classify errors only; they never drop
reasoning items from a request.

New contract: no provider- or model-level reasoning-replay switch may exist in `patch-zh.js`;
reasoning replay stays upstream-default for all providers.
## Release digest trust boundary (WS-0916-01, 2026-09-16)

The download path may fetch the executable from any mirror in `MIRRORS`, but a digest obtained from the same mirror proves only that the mirror served matching bytes - not that they came from the publisher. `update-zh.js` therefore separates byte transport from digest provenance.

Contract:
- `MIRRORS` supplies executable bytes only. No mirror may ever supply the expected digest.
- The expected digest is resolved, in order, from: `OMP_TRUST_DIGEST=<64 hex>` supplied by the operator; the official `SHA256SUMS.txt` release asset over a direct official request; the official Releases API `assets[].digest` field (`gh api`, else a direct `api.github.com` request). Upstream v18.2.1 no longer publishes `SHA256SUMS.txt`, so the API digest is the normal live path.
- If none of the three is available, the pipeline fails closed and delivers nothing. The error names `OMP_TRUST_DIGEST` so the operator can verify a digest out of band and re-run.
- A cached digest file is trusted only when `work/SHA256SUMS.provenance.json` records the same tag with source `operator`, `official-sums`, or `official-api`. A cache with no provenance, or with mirror provenance, is ignored and must be re-resolved.
- A digest/byte mismatch deletes both the downloaded file and the cached provenance, so a bad pair cannot be reused.
- The digest is resolved once, before the local-reuse check, so a trust failure surfaces as a trust failure rather than being downgraded into a mirror download error.

Scope is `update-zh.js` and this document. Translation policy, delivery semantics and retry behaviour are unchanged.

Verification: `G:/tmp/ompzh-ws01/verify-digest-trust.js` drives the real `download()` with no network and covers mirror-only digest (fails closed), operator digest against a mirror-tampered exe (rejected), official sums with a matching mirror exe (accepted), mirror-provenance cache (not trusted), malformed operator digest (rejected), and the official API digest fallback (accepted) - 6/6. A live `--force --no-deliver` run confirmed the official sums digest, the official API digest and the downloaded bytes all agree (`fee52652c7b0..`).


## Verify-before-deliver ordering (R15-01, 2026-09-22)

The installer target `G:/omp/omp-zh.exe` is a single-writer slot. Before this change the pipeline
replaced it (or armed a watcher to replace it) *before* running verify, and a patch rule miss only
logged a warning - so an unverified or partially patched binary could reach the target while the run
still reported success and wrote its version marker.

Contract:

- The pipeline order is fixed: patch completeness gate -> isolated build -> `verify-zh.js` -> smoke
  (`--version` + `--help` CJK) -> delivery. Nothing may touch the install target before the last step.
- `patch-zh.js` writes its output only when `warn === 0`, via a temp file plus rename. With any live
  rule miss it leaves the input byte-identical and exits non-zero. A live rule is one whose name
  carries no version tag or the newest version tag; older-tagged anchors report `LEGACY` and do not
  count as misses.
- The `encstale` loop must apply the same `done ? s.includes(done) : s.includes(repl)` fallback as the
  `leak`/`stopcap`/`replay` loops. Without it `s.includes(null)` coerces to `"null"`, which is always
  present in the bundle, and every miss on a rule without a `done` string is misreported as `SKIP`.
- `build-zh.js` cannot deliver. `--deliver` and `OMP_DELIVER` are rejected with exit 2. Build output
  goes to `--dst` only.
- `deliver-zh.js` is the only delivery entry point. It re-checks three things before touching the
  target: the source sha256 equals the caller-supplied `--expect-sha256` (so the bytes delivered are
  the bytes that passed verify and smoke), the artifact self-reports the expected `--version`, and the
  staged copy matches the source. After the atomic rename it re-hashes the target. Any mismatch
  removes the candidate, leaves the target untouched, and exits 1.
- `deliver-pending.js` (the watcher for a target locked by a running session) carries the same
  `--expect-sha256`; it verifies the staged file before renaming and the target after, and deletes the
  candidate instead of delivering when the digest does not match.
- A locked target is a deferral, not a failure: the verified candidate is staged and the watcher
  delivers those exact bytes on release. `work/.omp-zh-last-version` is written only on an actual
  immediate delivery or an explicit `--no-deliver` run - never while a delivery is still pending.

Scope is `update-zh.js`, `patch-zh.js`, `build-zh.js`, `deliver-zh.js`, `deliver-pending.js` and this
document. Download trust, translation policy and digest handling are unchanged.

Verification: `tools-verify-order.js` drives the real updater end to end inside an isolated fixture
(copies of the scripts, dictionaries, `work/` and the target; the 218 MB source exe is hard-linked, so
each scenario costs ~0.55 GB) with `OMP_ZH_*` path overrides, no network, and no write to `G:/omp`.
Scenarios and results are recorded in `DEVLOG.md` (2026-09-22 entry) and the raw logs are under
`G:/omp works/.tmp/report-fixes-20260922/verification/a4-logs/`.