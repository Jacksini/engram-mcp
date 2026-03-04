# Changelog

All notable changes to this project are documented in this file.

## [1.1.1] - 2026-03-03

### Added
- Handler-level MCP tests for `list_projects`, `suggest_links`, and `migrate_to_project`.
- Shared ISO datetime validators in tool schemas (`IsoDateTimeParam`, nullable/optional variants, and `DateRangeParams`).
- Operational startup log with database path and default project.

### Changed
- `migrate_to_project` now requires `source_project` and only migrates tagged memories from that source project to destination.
- CLI command syntax updated to `migrate-to-project <tag> <source_project> <project>`.
- CLI internals refactored with reusable helpers for string/int flag parsing, CSV parsing, JSON parsing, and consistent fatal errors.
- `list_memories` and `search_memories` now reuse centralized date-range schema params.

### Fixed
- Removed silent auto-link failure swallowing; auto-link inference errors are now logged with context.
- Added defensive error handling/logging around periodic purge and FTS optimize loops.

## [1.1.0] - 2026-03-02

### Added
- Global `--project` support in `engram-cli`.
- New CLI commands:
  - `get-related-deep`
  - `suggest-links`
  - `list-projects`
  - `migrate-to-project`
- Dedicated CLI tests for parser/help and new command coverage.
- `CHANGELOG.md` as the centralized change log.

### Changed
- Enforced project-scoped graph behavior in core DB methods.
- Scoped related and link listing queries by project.
- Updated deep traversal to respect project boundaries and exclude expired nodes.
- Improved CLI help and command coverage documentation.
- Updated README to reflect current implementation, commands, migrations, and test count.

### Fixed
- Blocked cross-project link creation in link operations.
- Made CLI import-safe for testing (entrypoint guard).
