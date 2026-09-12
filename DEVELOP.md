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
