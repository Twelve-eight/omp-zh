# Development contracts

## Responses reasoning replay compatibility (2026-09-12)

The 18.1.17 bundle validates `compat.replayResponsesReasoning` but resolves Responses compatibility through `n6s()`. Its helper `fG()` applies only keys already present in the destination. Without a resolver default, the setting survives in `compatConfig` but disappears from runtime `compat`; replay gates consequently do not see `false`.

Contract:
- Add `replayResponsesReasoning: true` to the Responses resolver defaults before `fG()` applies overrides. Preserve default replay behavior and existing compatibility key filtering.
- Provider and model overrides that resolve to `false` must disable reasoning replay through existing main-turn and compaction gates.
- Preserve `OMP_NO_REPLAY_REASONING=1` as an overriding opt-out.
- Repair the two compaction source anchors to use valid three-dot spreads. Patching must work on a clean 18.1.17 extraction and remain idempotent on previously patched input.
- Scope is patch-zh.js and project documentation. Do not alter credentials, provider configuration, or unrelated upstream behavior.

Verification required before delivery: clean extraction patch application, repeated patch application, resolved compatibility with absent/true/false values, and actual executable requests covering continued conversation and resumed remote-compaction history. The coordinator performs builds and runtime verification. These checks are pending at design time; static investigation alone is not proof that the upstream 400 is eliminated.

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
