import TurndownService from 'turndown';
import slackifyMarkdown from 'slackify-markdown';

export type HeadingStyle = 'bold' | 'boldWithSeparator' | 'strip';
export type TableHandling = 'plainText' | 'strip';
export type ImageHandling = 'altText' | 'asLink' | 'strip';

export interface ConversionOptions {
	headingStyle?: HeadingStyle;
	tableHandling?: TableHandling;
	imageHandling?: ImageHandling;
	trimWhitespace?: boolean;
}

const SEPARATOR = '───────────────';

// Matches bare http/https/mailto URLs not already inside < > or a backtick code span
const BARE_URL_RE = /(?<![<|`])(https?:\/\/[^\s<>")\]`]+|mailto:[^\s<>")\]`]+)/g;

// Split text on code spans/blocks and apply transform only to non-code parts
const applyOutsideCode = (text: string, fn: (s: string) => string): string => {
	const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
	return parts
		.map((part, i) => (i % 2 === 1 ? part : fn(part)))
		.join('');
};

// Safety net: wrap bare URLs that slipped past slackify as `url` inline code
const wrapBareUrls = (text: string): string =>
	applyOutsideCode(text, (s) => s.replace(BARE_URL_RE, '`$1`'));

// <url|url> → <url>  (slackify autolinks produce these for self-ref URLs)
const deduplicateSelfRefLinks = (text: string): string =>
	text.replace(/<([^|>\s]+)\|([^>\s]+)>/g, (match, url, linkText) =>
		url === linkText ? `<${url}>` : match,
	);

// Bare Slack links <url> (no display text) → `url` inline code.
// Named links <url|text> are left as-is so they stay clickable in Slack.
const wrapBareSlackLinks = (text: string): string =>
	applyOutsideCode(text, (s) =>
		s.replace(/<(https?:\/\/[^\s|>`]+|mailto:[^\s|>`]+)>/g, '`$1`'),
	);

// turndown re-encodes bare & to &amp; — decode it outside code regions
const decodeAmpersands = (text: string): string =>
	applyOutsideCode(text, (s) => s.replace(/&amp;/g, '&'));

const configureTurndown = (opts: Required<ConversionOptions>): TurndownService => {
	// Use standard Markdown delimiters so slackify-markdown converts them correctly:
	//   **bold**  → *bold*   (Slack bold)
	//   _italic_  → _italic_ (Slack italic)
	const td = new TurndownService({
		emDelimiter: '_',
		strongDelimiter: '**',
		hr: SEPARATOR,
		headingStyle: 'atx',
	});

	// GFM strikethrough: ~~text~~ → slackify → ~text~
	td.addRule('strikethrough', {
		filter: ['s', 'del', 'strike' as keyof HTMLElementTagNameMap],
		replacement: (content) => `~~${content}~~`,
	});

	// Links → `url` inline code (monospace, non-clickable)
	td.addRule('link', {
		filter: 'a',
		replacement: (content, node) => {
			const el = node as unknown as HTMLAnchorElement;
			const href = el.getAttribute('href') ?? '';
			const text = content.trim();
			if (!href) return text;
			return `\`${href}\``;
		},
	});

	// Inline code (must precede code-block rule)
	td.addRule('inlineCode', {
		filter: (node) => node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE',
		replacement: (content) => `\`${content}\``,
	});

	// Fenced code blocks
	td.addRule('codeBlock', {
		filter: 'pre',
		replacement: (content) => {
			const code = content.replace(/^`+|`+$/g, '').replace(/^\n|\n$/g, '');
			return `\`\`\`\n${code}\n\`\`\``;
		},
	});

	// Blockquote: prefix every line with "> "
	td.addRule('blockquote', {
		filter: 'blockquote',
		replacement: (content) => {
			const lines = content.trim().split('\n');
			return lines.map((l) => `> ${l}`).join('\n') + '\n\n';
		},
	});

	// List items with • for unordered, numbered for ordered
	td.addRule('listItem', {
		filter: 'li',
		replacement: (content, node) => {
			const clean = content.replace(/^\n+/, '').replace(/\n+$/, '').replace(/\n/g, '\n  ');
			const parent = node.parentNode;
			if (parent?.nodeName === 'OL') {
				const siblings = Array.from(parent.childNodes).filter(
					(n) => (n as Element).nodeName === 'LI',
				);
				const index = siblings.indexOf(node as ChildNode) + 1;
				return `${index}. ${clean}\n`;
			}
			return `• ${clean}\n`;
		},
	});

	// Headings — output **text** so slackify converts to Slack *text* (bold)
	td.addRule('heading', {
		filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
		replacement: (content) => {
			if (opts.headingStyle === 'strip') return '';
			if (opts.headingStyle === 'boldWithSeparator') {
				return `**${content}**\n${SEPARATOR}\n\n`;
			}
			return `**${content}**\n\n`;
		},
	});

	// Tables
	td.addRule('table', {
		filter: 'table',
		replacement: (_content, node) => {
			if (opts.tableHandling === 'strip') return '';
			const el = node as Element;
			// Layout table (contains nested tables) — let inner content bubble up naturally.
			// Re-reading textContent here would duplicate content already processed by inner tables.
			if (el.querySelector('table')) return _content;
			// Leaf data table — flatten rows to tab-separated text
			const rows = Array.from(el.querySelectorAll('tr'));
			const lines = rows.map((row) => {
				const cells = Array.from(row.querySelectorAll('th, td'));
				return cells
					.map((c) => {
						// textContent concatenates adjacent block children (e.g. <p> elements) without
						// any separator, causing "f@example.comLogin Time:" runons. Split on direct
						// block children when there are multiple, and join with newlines.
						const blockChildren = Array.from(c.childNodes).filter((n) =>
							['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(
								(n as Element).nodeName,
							),
						);
						if (blockChildren.length > 1) {
							return blockChildren
								.map((ch) => (ch as Element).textContent?.trim() ?? '')
								.filter(Boolean)
								.join('\n');
						}
						return c.textContent?.trim() ?? '';
					})
					.join('\t');
			});
			return lines.filter((l) => l.trim()).join('\n') + '\n\n';
		},
	});

	// Suppress individual table sub-elements (handled by the table rule above)
	td.addRule('tableCell', {
		filter: ['thead', 'tbody', 'tfoot', 'tr', 'th', 'td'],
		replacement: (content) => content,
	});

	// Images
	td.addRule('image', {
		filter: 'img',
		replacement: (_content, node) => {
			const el = node as unknown as HTMLImageElement;
			const alt = el.getAttribute('alt') ?? '';
			const src = el.getAttribute('src') ?? '';
			if (opts.imageHandling === 'strip') return '';
			if (opts.imageHandling === 'asLink') return src ? `[${alt || 'image'}](${src})` : '';
			return alt;
		},
	});

	// Line break
	td.addRule('lineBreak', {
		filter: 'br',
		replacement: () => '\n',
	});

	// Strip generic structural tags, preserve inner content
	td.addRule('stripContainers', {
		filter: ['div', 'span', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav'],
		replacement: (content) => content,
	});

	// Strip hidden elements (email preheaders, tracking pixels, spacer divs).
	// Must be added last so it takes precedence over stripContainers for hidden <div>s.
	td.addRule('removeHidden', {
		filter: (node) => {
			const style = (node as HTMLElement).getAttribute('style') ?? '';
			return (
				(node as HTMLElement).getAttribute('data-skip-in-text') === 'true' ||
				/display\s*:\s*none/.test(style) ||
				/opacity\s*:\s*0\b/.test(style)
			);
		},
		replacement: () => '',
	});

	return td;
};

export const htmlToMrkdwn = (html: string, options: ConversionOptions = {}): string => {
	if (html === null || html === undefined) {
		throw new TypeError('htmlToMrkdwn: html argument must be a string, got ' + typeof html);
	}

	if (!html || !html.trim()) return '';

	const opts: Required<ConversionOptions> = {
		headingStyle: options.headingStyle ?? 'bold',
		tableHandling: options.tableHandling ?? 'plainText',
		imageHandling: options.imageHandling ?? 'altText',
		trimWhitespace: options.trimWhitespace ?? true,
	};

	const td = configureTurndown(opts);
	const md = td.turndown(html);
	let mrkdwn = slackifyMarkdown(md);

	// Strip zero-width and invisible Unicode chars (slackify delimiters + email preheader padding).
	mrkdwn = mrkdwn.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '');

	// slackify GFM autolinks produce <url|url> for bare URLs — deduplicate
	mrkdwn = deduplicateSelfRefLinks(mrkdwn);

	// Bare Slack links <url> → `<url>` inline code; named links <url|text> stay clickable
	mrkdwn = wrapBareSlackLinks(mrkdwn);

	// remark-stringify pads ordered list markers: "1.  item" — normalize to single space
	mrkdwn = mrkdwn.replace(/^(\d+)\.\s{2,}/gm, '$1. ');

	// turndown re-encodes bare & as &amp; — decode outside code regions
	mrkdwn = decodeAmpersands(mrkdwn);

	// Wrap any remaining bare URLs (safety net; skips code regions)
	mrkdwn = wrapBareUrls(mrkdwn);

	if (opts.trimWhitespace) {
		return mrkdwn.replace(/\n{3,}/g, '\n\n').trim();
	}
	return mrkdwn;
};
