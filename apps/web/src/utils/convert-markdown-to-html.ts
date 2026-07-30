// Convert markdown to HTML matching ReactMarkdown's output
export const convertToHTML = (markdown: string) => {
  if (!markdown) return '';

  // Process line by line to handle different elements
  const lines = markdown.split('\n');
  const htmlParts: string[] = [];
  let inList = false;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const formattedLines = paragraphLines.map(line =>
        line
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/__(.+?)__/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/_(.+?)_/g, '<em>$1</em>')
      );
      // Join with space to match ReactMarkdown's soft line break behavior
      htmlParts.push(`<p>${formattedLines.join(' ')}</p>`);
      paragraphLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.match(/^### /)) {
      flushParagraph();
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<h3>${line.replace(/^### /, '')}</h3>`);
      continue;
    }
    if (line.match(/^## /)) {
      flushParagraph();
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<h2>${line.replace(/^## /, '')}</h2>`);
      continue;
    }
    if (line.match(/^# /)) {
      flushParagraph();
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<h1>${line.replace(/^# /, '')}</h1>`);
      continue;
    }

    // Bullet lists
    if (line.match(/^\s*[-*]\s+/)) {
      flushParagraph();
      if (!inList) {
        htmlParts.push('<ul>');
        inList = true;
      }
      const text = line.replace(/^\s*[-*]\s+/, '');
      // Process inline formatting (bold, italic)
      const formatted = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>');
      htmlParts.push(`<li>${formatted}</li>`);
      continue;
    }

    // Empty line - flush paragraph
    if (line.trim() === '') {
      flushParagraph();
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Regular text line - accumulate into paragraph
    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }
    paragraphLines.push(line);
  }

  // Flush any remaining paragraph
  flushParagraph();

  // Close list if still open
  if (inList) {
    htmlParts.push('</ul>');
  }

  return htmlParts.join('');
};

// Convert HTML back to markdown ensuring proper spacing for ReactMarkdown
export const htmlToMarkdown = (html: string): string => {
  if (!html) return '';

  let markdown = html
    // Remove wrapper paragraphs first
    .replace(/<\/?p[^>]*>/gi, '\n')

    // Headers (preserve with double newline after for proper spacing)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')

    // Lists - handle <ul> blocks specially to ensure proper spacing
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_match, content) => {
      // Extract list items and format them
      const items = content.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
      const formattedItems = items
        .map((item: string) => {
          const text = item.replace(/<\/?li[^>]*>/gi, '').trim();
          return `- ${text}`;
        })
        .join('\n');
      return '\n' + formattedItems + '\n\n';
    })

    // Bold (handle nested content)
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')

    // Italic (handle nested content)
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')

    // Line breaks (contenteditable uses <br>)
    .replace(/<br\s*\/?>/gi, '\n')

    // Divs (contenteditable wraps lines in divs)
    .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1\n')

    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, '')

    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

    // Clean up whitespace while preserving markdown structure
    // Remove more than 2 consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Remove trailing spaces on lines
    .replace(/ +\n/g, '\n')
    // Remove leading/trailing whitespace
    .trim();

  return markdown;
};
