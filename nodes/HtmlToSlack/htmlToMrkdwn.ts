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

// Matches bare http/https/mailto URLs not already inside < > context
const BARE_URL_RE = /(?<![<|])(https?:\/\/[^\s<>")\]]+|mailto:[^\s<>")\]]+)/g;

// Split text on code spans/blocks and apply transform only to non-code parts
const applyOutsideCode = (text: string, fn: (s: string) => string): string => {
	const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
	return parts
		.map((part, i) => (i % 2 === 1 ? part : fn(part)))
		.join('');
};

// Wrap bare URLs — skip content inside code spans/blocks
const wrapBareUrls = (text: string): string =>
	applyOutsideCode(text, (s) => s.replace(BARE_URL_RE, '<$1>'));

// <url|url> → <url>  (slackify autolinks produce these for self-ref URLs)
const deduplicateSelfRefLinks = (text: string): string =>
	text.replace(/<([^|>\s]+)\|([^>\s]+)>/g, (match, url, linkText) =>
		url === linkText ? `<${url}>` : match,
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

	// Links → standard markdown [text](url); slackify converts to <url|text>
	td.addRule('link', {
		filter: 'a',
		replacement: (content, node) => {
			const el = node as unknown as HTMLAnchorElement;
			const href = el.getAttribute('href') ?? '';
			const text = content.trim();
			if (!href || !text) return text;
			return `[${text}](${href})`;
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
			const rows = Array.from((node as Element).querySelectorAll('tr'));
			const lines = rows.map((row) => {
				const cells = Array.from(row.querySelectorAll('th, td'));
				return cells.map((c) => c.textContent?.trim() ?? '').join('\t');
			});
			return lines.join('\n') + '\n\n';
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
			if (opts.imageHandling === 'asLink') return src ? `[${src}](${src})` : '';
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

	// slackify adds U+200B zero-width spaces as format delimiters — strip them
	mrkdwn = mrkdwn.replace(/[\u200B\uFEFF]/g, '');

	// slackify GFM autolinks produce <url|url> for bare URLs — deduplicate
	mrkdwn = deduplicateSelfRefLinks(mrkdwn);

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
