# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 18.12.x | Yes |
| < 18.12 | No |

## Reporting a Vulnerability

Please report security issues via GitHub Issues with the tag `security`. Do NOT report security issues to the upstream oh-my-pi repository — this is an unofficial localization build.

## Scope

- Build pipeline integrity (digest verification, path validation)
- Binary patch correctness
- Translation accuracy

## Known Limitations

- This is a binary-patching localization; it does not modify upstream source code
- Delivery to user machines uses deferred atomic rename (see `deliver-zh.js`)
