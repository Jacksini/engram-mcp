# Release 1.1.1

Date: 2026-03-03

## Pre-release checklist

- [x] Version aligned in `package.json` and runtime server metadata (`src/index.ts`).
- [x] Changelog updated with 1.1.1 entry.
- [x] README updated for current CLI contract (`migrate-to-project <tag> <source_project> <project>`).
- [x] Full test suite green (`513 passed, 0 failed`).
- [x] Build completed (`npm run build`).
- [x] Built CLI smoke-tested (`node build/cli.js help`).
- [x] Built server smoke-tested (`node build/index.js` startup verified).

## Release notes (for GitHub)

### Added
- Handler-level MCP tests for `list_projects`, `suggest_links`, and `migrate_to_project`.
- Shared ISO datetime validation schemas (`IsoDateTimeParam`, optional/nullable variants, and `DateRangeParams`).
- Operational startup logging with DB path and default project visibility.

### Changed
- `migrate_to_project` now requires `source_project` and migrates only tagged memories from source to destination.
- CLI command updated to:
  - `migrate-to-project <tag> <source_project> <project>`
- CLI internals refactored to reduce duplication via shared parsing/error helpers.
- `list_memories` and `search_memories` now reuse centralized date-range validation params.
- Tool catalog wording aligned with the current migration contract.

### Fixed
- Removed silent auto-link failure swallowing; inference errors are now logged with context.
- Added defensive error handling/logging for periodic purge and FTS optimize maintenance loops.
- Resolved version/documentation drift across package metadata, runtime, changelog, and README.

## Suggested publish commands

```bash
npm run build
npm test
# optional: npm run lint
# optional: npm run format:check
```

Then create git tag/release in your SCM flow (example):

```bash
git tag v1.1.1
git push origin v1.1.1
```
