# Changelog

## [0.2.0](https://github.com/frer0t/n8n-nodes-html-to-slack/compare/0.1.0...0.2.0) (2026-06-04)

### Features

* add From Input Field mode to read HTML from any previous node ([a883da6](https://github.com/frer0t/n8n-nodes-html-to-slack/commit/a883da6664fb116bf0834b5134f85d9b6ba6b433))
* simplify to single html field, run once on zero-item input ([c76878b](https://github.com/frer0t/n8n-nodes-html-to-slack/commit/c76878baab28ea723557ef8dcb937eefc631114a))

## [0.1.0] — 2026-06-04

### Added
- Initial release
- HTML → Slack mrkdwn conversion via `turndown` + `slackify-markdown` pipeline
- Options: `headingStyle`, `tableHandling`, `imageHandling`, `trimWhitespace`
- All URLs automatically wrapped in Slack angle-bracket syntax
- `continueOnFail` support with per-item error handling
