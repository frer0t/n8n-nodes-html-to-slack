# n8n-nodes-html-to-slack

An n8n community node that converts raw HTML into Slack-compatible **mrkdwn** formatted text.

---

## Install

### In n8n (recommended)

Go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-html-to-slack
```

### Manual (custom nodes directory)

```bash
cd ~/.n8n/custom
pnpm install n8n-nodes-html-to-slack
```

---

## Usage

Add the **HTML to Slack** node to your workflow. Connect any node that produces HTML (e.g. an HTTP Request, a webhook body, or a Gmail node) and map its HTML field to the **HTML** input.

```
[Webhook] → [HTML to Slack] → [Slack]
```

The node outputs all original fields plus a new field (default: `text`) containing the converted mrkdwn string, ready to pass directly to the Slack **Send Message** node.

---

## Input / Output Example

**Input HTML:**
```html
<p>Check out <a href="https://slack.com"><strong>Slack</strong></a> and visit https://n8n.io</p>
```

**Output mrkdwn:**
```
Check out <https://slack.com|*Slack*> and visit <https://n8n.io>
```

---

## Full HTML → mrkdwn Mapping

| HTML                              | Slack mrkdwn                              |
|-----------------------------------|-------------------------------------------|
| `<b>`, `<strong>`                 | `*text*`                                  |
| `<i>`, `<em>`                     | `_text_`                                  |
| `<s>`, `<del>`, `<strike>`        | `~text~`                                  |
| `<code>` (inline)                 | `` `code` ``                              |
| `<pre>`                           | ` ```\ncode\n``` `                        |
| `<a href="U">T</a>`               | `<U\|T>` (named link)                    |
| `<a href="U">U</a>`               | `<U>` (text equals href)                  |
| `<a href="mailto:x">T</a>`        | `<mailto:x\|T>`                           |
| Bare URL in text                  | `<URL>` (post-processed)                  |
| `<blockquote>`                    | `> ` prefix on each line                  |
| `<ul><li>`                        | `• item`                                  |
| `<ol><li>`                        | `1. item`, `2. item` …                   |
| `<h1>`–`<h6>`                     | See **headingStyle** option               |
| `<table>`                         | See **tableHandling** option              |
| `<img>`                           | See **imageHandling** option              |
| `<br>`                            | `\n`                                      |
| `<p>`                             | content + `\n\n`                          |
| `<hr>`                            | `───────────────`                         |
| `<div>`, `<span>`, `<section>` …  | Tags stripped, inner text preserved       |
| HTML entities (`&amp;`, `&lt;` …) | Decoded before conversion                 |

---

## Slack mrkdwn Limitations

Slack's mrkdwn format is a subset of Markdown — several HTML features have no equivalent:

- **No headings** — `<h1>`–`<h6>` are approximated as bold text
- **No tables** — flattened to tab-separated plain text or stripped
- **No inline images** — replaced with alt text, a link, or stripped
- **No underline** — `<u>` content is preserved as plain text
- **No text colours** — `style` attributes are ignored
- **All URLs must use angle-bracket syntax** — bare URLs are not reliably auto-linked when posted via the API; this node wraps them automatically

---

## Options Reference

| Option            | Values                                          | Default       | Description                                                  |
|-------------------|-------------------------------------------------|---------------|--------------------------------------------------------------|
| `headingStyle`    | `bold` \| `boldWithSeparator` \| `strip`        | `bold`        | `bold` → `*text*`; `boldWithSeparator` adds a `───` divider; `strip` removes headings entirely |
| `tableHandling`   | `plainText` \| `strip`                          | `plainText`   | `plainText` flattens cells tab-separated; `strip` removes the whole table |
| `imageHandling`   | `altText` \| `asLink` \| `strip`                | `altText`     | `altText` uses the `alt` attribute; `asLink` wraps `src` as `<url>`; `strip` removes the image |
| `trimWhitespace`  | `true` \| `false`                               | `true`        | Collapses 3+ consecutive newlines to a single blank line and trims the result |

---

## Development

```bash
# Clone and install
git clone https://github.com/<you>/n8n-nodes-html-to-slack.git
cd n8n-nodes-html-to-slack
pnpm install

# Unit tests (vitest, no n8n required)
pnpm test

# Hot-reload dev server (starts local n8n with this node loaded)
pnpm dev

# Type-check + build
pnpm run build

# Lint
pnpm run lint
```

### File structure

```
nodes/HtmlToSlack/
├── HtmlToSlack.node.ts   — n8n integration layer
├── HtmlToSlack.node.json — codex / search metadata
├── htmlToMrkdwn.ts       — pure conversion logic (zero n8n deps)
├── htmlToMrkdwn.test.ts  — vitest unit tests
└── htmlToSlack.svg       — node icon
```

`htmlToMrkdwn.ts` has no n8n imports and can be used as a standalone library outside of n8n.

---

## License

[MIT](LICENSE.md)
