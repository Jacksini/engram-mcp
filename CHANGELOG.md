# Changelog

All notable changes to this project are documented in this file.

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
