# Contributing to omp-zh

## Scope

This repository maintains the Chinese localization build of [oh-my-pi](https://github.com/can1357/oh-my-pi). Contributions should stay within the localization and build-pipeline domain:

- Translation dictionary entries (`dict-*.json`)
- Build/verification scripts (`tools-*.js`, `update-zh.js`, `rebuild.js`, etc.)
- Patch anchors and compatibility fixes for new upstream versions
- Documentation improvements

## Process

1. Fork and create a feature branch
2. For translation updates: run `node scan-gaps.js` to discover missing entries
3. For build changes: test against the latest upstream release binary
4. Update DEVLOG.md with your changes
5. Submit a pull request

## Testing

- `node tools-verify-*.js` — run the verification suite
- `node update-zh.js --check-only` — dry-run the update pipeline

## Code Style

- JavaScript (Node.js), no external dependencies beyond built-ins
- Chinese comments allowed; keep code identifiers in English
- Follow existing patterns in `translate.js` and `rebuild.js`

## License

MIT — see [LICENSE](LICENSE)
