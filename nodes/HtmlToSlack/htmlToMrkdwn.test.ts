import { describe, it, expect } from 'vitest';
import { htmlToMrkdwn } from './htmlToMrkdwn';

// ─── Inline formatting ────────────────────────────────────────────────────────

describe('inline formatting', () => {
	it('converts <b> to *text*', () => {
		expect(htmlToMrkdwn('<b>text</b>')).toBe('*text*');
	});

	it('converts <strong> to *text*', () => {
		expect(htmlToMrkdwn('<strong>text</strong>')).toBe('*text*');
	});

	it('converts <i> to _text_', () => {
		expect(htmlToMrkdwn('<i>text</i>')).toBe('_text_');
	});

	it('converts <em> to _text_', () => {
		expect(htmlToMrkdwn('<em>text</em>')).toBe('_text_');
	});

	it('converts <s> to ~text~', () => {
		expect(htmlToMrkdwn('<s>text</s>')).toBe('~text~');
	});

	it('converts <del> to ~text~', () => {
		expect(htmlToMrkdwn('<del>text</del>')).toBe('~text~');
	});

	it('converts <code> to `text`', () => {
		expect(htmlToMrkdwn('<code>text</code>')).toBe('`text`');
	});

	it('handles nested <b><i>', () => {
		const result = htmlToMrkdwn('<b><i>text</i></b>');
		expect(result).toContain('text');
		expect(result).toMatch(/\*/);
		expect(result).toMatch(/_/);
	});
});

// ─── Links ────────────────────────────────────────────────────────────────────

describe('links', () => {
	it('converts named link to <url|text>', () => {
		expect(htmlToMrkdwn('<a href="https://x.com">Visit</a>')).toBe('<https://x.com|Visit>');
	});

	it('converts self-referencing link (text === href) to <url>', () => {
		expect(htmlToMrkdwn('<a href="https://x.com">https://x.com</a>')).toBe('<https://x.com>');
	});

	it('converts mailto link to <mailto:x|text>', () => {
		expect(htmlToMrkdwn('<a href="mailto:a@b.com">Email me</a>')).toBe(
			'<mailto:a@b.com|Email me>',
		);
	});

	it('wraps bare https URL in text', () => {
		expect(htmlToMrkdwn('visit https://x.com today')).toBe('visit <https://x.com> today');
	});

	it('wraps two bare URLs independently', () => {
		const result = htmlToMrkdwn('see https://a.com and https://b.com');
		expect(result).toContain('<https://a.com>');
		expect(result).toContain('<https://b.com>');
	});

	it('does not double-wrap already-wrapped URL', () => {
		const result = htmlToMrkdwn('<a href="https://x.com">https://x.com</a>');
		expect(result).toBe('<https://x.com>');
		expect(result).not.toContain('<<');
	});

	it('does not wrap URL inside <code>', () => {
		const result = htmlToMrkdwn('<code>https://x.com</code>');
		expect(result).toBe('`https://x.com`');
		expect(result).not.toContain('<https://x.com>');
	});
});

// ─── Headings ─────────────────────────────────────────────────────────────────

describe('headings', () => {
	const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

	levels.forEach((tag) => {
		it(`converts <${tag}> with headingStyle=bold`, () => {
			const result = htmlToMrkdwn(`<${tag}>Heading</${tag}>`, { headingStyle: 'bold' });
			expect(result).toBe('*Heading*');
		});

		it(`converts <${tag}> with headingStyle=boldWithSeparator`, () => {
			const result = htmlToMrkdwn(`<${tag}>Heading</${tag}>`, {
				headingStyle: 'boldWithSeparator',
			});
			expect(result).toContain('*Heading*');
			expect(result).toContain('───');
		});

		it(`strips <${tag}> with headingStyle=strip`, () => {
			const result = htmlToMrkdwn(`<${tag}>Heading</${tag}>`, { headingStyle: 'strip' });
			expect(result.trim()).toBe('');
		});
	});
});

// ─── Block elements ───────────────────────────────────────────────────────────

describe('block elements', () => {
	it('converts <pre><code> to fenced code block', () => {
		const result = htmlToMrkdwn('<pre><code>fn()</code></pre>');
		expect(result).toContain('```');
		expect(result).toContain('fn()');
	});

	it('converts <blockquote> to > prefix', () => {
		const result = htmlToMrkdwn('<blockquote>quoted</blockquote>');
		expect(result).toContain('> quoted');
	});

	it('converts multi-line blockquote with > on each line', () => {
		const result = htmlToMrkdwn('<blockquote>line1\nline2</blockquote>');
		const lines = result.split('\n').filter((l) => l.trim());
		lines.forEach((line) => expect(line).toMatch(/^> /));
	});

	it('converts <ul> to bullet list', () => {
		const result = htmlToMrkdwn('<ul><li>a</li><li>b</li></ul>');
		expect(result).toContain('• a');
		expect(result).toContain('• b');
	});

	it('converts <ol> to numbered list', () => {
		const result = htmlToMrkdwn('<ol><li>a</li><li>b</li></ol>');
		expect(result).toContain('1. a');
		expect(result).toContain('2. b');
	});

	it('indents nested <ul> items', () => {
		const result = htmlToMrkdwn('<ul><li>Parent<ul><li>Child</li></ul></li></ul>');
		expect(result).toContain('Child');
	});

	it('separates paragraphs with double newline', () => {
		const result = htmlToMrkdwn('<p>foo</p><p>bar</p>');
		expect(result).toContain('foo');
		expect(result).toContain('bar');
	});

	it('converts <br> to newline', () => {
		const result = htmlToMrkdwn('line1<br>line2');
		expect(result).toContain('line1');
		expect(result).toContain('line2');
	});

	it('converts <hr> to separator line', () => {
		const result = htmlToMrkdwn('<hr>');
		expect(result).toMatch(/─+/);
	});
});

// ─── Tables ───────────────────────────────────────────────────────────────────

describe('tables', () => {
	const tableHtml =
		'<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>';

	it('flattens table cells with tab separator when tableHandling=plainText', () => {
		const result = htmlToMrkdwn(tableHtml, { tableHandling: 'plainText' });
		expect(result).toContain('Name');
		expect(result).toContain('Alice');
	});

	it('strips table entirely when tableHandling=strip', () => {
		const result = htmlToMrkdwn(tableHtml, { tableHandling: 'strip' });
		expect(result.trim()).toBe('');
	});
});

// ─── Images ───────────────────────────────────────────────────────────────────

describe('images', () => {
	const imgHtml = '<img alt="logo" src="https://example.com/logo.png">';

	it('returns alt text when imageHandling=altText', () => {
		expect(htmlToMrkdwn(imgHtml, { imageHandling: 'altText' })).toBe('logo');
	});

	it('returns <src> link when imageHandling=asLink', () => {
		const result = htmlToMrkdwn(imgHtml, { imageHandling: 'asLink' });
		expect(result).toBe('<https://example.com/logo.png>');
	});

	it('strips image when imageHandling=strip', () => {
		expect(htmlToMrkdwn(imgHtml, { imageHandling: 'strip' }).trim()).toBe('');
	});
});

// ─── HTML entities ────────────────────────────────────────────────────────────

describe('HTML entities', () => {
	it('decodes &amp; to &', () => {
		expect(htmlToMrkdwn('<p>a &amp; b</p>')).toContain('a & b');
	});

	it('decodes &lt; to <', () => {
		expect(htmlToMrkdwn('<p>&lt;tag&gt;</p>')).toContain('<tag>');
	});

	it('decodes &nbsp; to space', () => {
		const result = htmlToMrkdwn('<p>a&nbsp;b</p>');
		expect(result).toContain('a');
		expect(result).toContain('b');
	});

	it('decodes &quot; to "', () => {
		expect(htmlToMrkdwn('<p>&quot;quoted&quot;</p>')).toContain('"quoted"');
	});
});

// ─── Whitespace ───────────────────────────────────────────────────────────────

describe('whitespace', () => {
	it('collapses 3+ newlines to \\n\\n when trimWhitespace=true', () => {
		const result = htmlToMrkdwn('<p>a</p><p></p><p></p><p>b</p>', { trimWhitespace: true });
		expect(result).not.toMatch(/\n{3,}/);
	});

	it('preserves newlines when trimWhitespace=false', () => {
		const result = htmlToMrkdwn('<p>a</p>\n\n\n<p>b</p>', { trimWhitespace: false });
		expect(result).toBeDefined();
	});
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
	it('returns empty string for empty input', () => {
		expect(htmlToMrkdwn('')).toBe('');
	});

	it('returns empty string for whitespace-only input', () => {
		expect(htmlToMrkdwn('   ')).toBe('');
	});

	it('throws TypeError for null input', () => {
		expect(() => htmlToMrkdwn(null as unknown as string)).toThrow(TypeError);
	});

	it('throws TypeError for undefined input', () => {
		expect(() => htmlToMrkdwn(undefined as unknown as string)).toThrow(TypeError);
	});

	it('does not throw for malformed HTML', () => {
		expect(() => htmlToMrkdwn('<b>unclosed')).not.toThrow();
	});

	it('returns best-effort text for malformed HTML', () => {
		const result = htmlToMrkdwn('<b>unclosed');
		expect(result).toContain('unclosed');
	});

	it('returns plain text as-is (with bare URLs wrapped)', () => {
		const result = htmlToMrkdwn('hello world');
		expect(result).toBe('hello world');
	});

	it('wraps bare URL in plain text input', () => {
		const result = htmlToMrkdwn('see https://example.com for details');
		expect(result).toContain('<https://example.com>');
	});
});
