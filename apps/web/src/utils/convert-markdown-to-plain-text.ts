export const convertToPlainText = (clinicalSummary: string) => {
  return (
    clinicalSummary
      // Convert headers (## Header -> HEADER:)
      .replace(/^(#{1,6})\s+(.+)$/gm, (_, __, text) => {
        return text.toUpperCase() + ':';
      })
      // Bold text (make it uppercase)
      .replace(/(\*\*|__)(.*?)\1/g, (_, __, text) => {
        return text.toUpperCase();
      })
      // Preserve bullet points
      .replace(/^\s*[-*]\s+(.+)$/gm, '• $1')
      // Remove italic markdown formatting without changing the text
      .replace(/(\*|_)(.*?)\1/g, '$2')
  );
};

export const formatMarkdownToPlainText = (markdown: string) => {
  return (
    markdown
      // Remove headers (# ## ### etc.)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold (**text** or __text__)
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      // Remove italic (*text* or _text_)
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Remove strikethrough (~~text~~)
      .replace(/~~(.*?)~~/g, '$1')
      // Remove inline code (`code`)
      .replace(/`([^`]+)`/g, '$1')
      // Remove links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove images ![alt](url)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Remove blockquotes (> text)
      .replace(/^>\s+/gm, '')
      // Remove unordered list markers (-, *, +, •)
      .replace(/^[\s]*[-*+•]\s+/gm, '')
      // Remove ordered list markers (1. 2. etc)
      .replace(/^[\s]*\d+[.)]\s+/gm, '')
      // Remove task list markers (- [ ] or - [x])
      .replace(/^[\s]*[-*+]\s+\[[ xX]\]\s+/gm, '')
      // Remove horizontal rules (---, ***, ___)
      .replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '')
      // Replace multiple newlines with single space
      .replace(/\n+/g, ' ')
      // Clean up multiple spaces
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
};
