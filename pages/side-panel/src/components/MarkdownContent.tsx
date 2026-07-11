import { memo, type ReactNode } from 'react';

/**
 * Lightweight markdown renderer (no extra dependency).
 * Supports: headings, bold/italic, inline code, fenced code, links, lists, paragraphs.
 */
export default memo(function MarkdownContent({
  content,
  isDarkMode = false,
}: {
  content: string;
  isDarkMode?: boolean;
}) {
  const blocks = splitBlocks(content);

  return (
    <div className={`space-y-2 text-sm ${isDarkMode ? 'text-gray-300' : 'text-slate-700'}`}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} isDarkMode={isDarkMode} />
      ))}
    </div>
  );
});

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; text: string };

function splitBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({ kind: 'code', lang, text: codeLines.join('\n') });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ kind: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i += 1;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: true, items });
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Paragraph (consume consecutive non-blank, non-special lines)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

function Block({ block, isDarkMode }: { block: Block; isDarkMode: boolean }) {
  switch (block.kind) {
    case 'heading': {
      const Tag = `h${Math.min(block.level, 4)}` as 'h1' | 'h2' | 'h3' | 'h4';
      const size =
        block.level === 1 ? 'text-base font-bold' : block.level === 2 ? 'text-sm font-bold' : 'text-sm font-semibold';
      return (
        <Tag className={`${size} ${isDarkMode ? 'text-gray-100' : 'text-slate-800'}`}>
          {renderInline(block.text, isDarkMode)}
        </Tag>
      );
    }
    case 'code':
      return (
        <pre
          className={`overflow-x-auto rounded-xl border border-planet9-border p-3 font-mono text-xs ${
            isDarkMode ? 'bg-planet9-surface text-indigo-200' : 'bg-gray-50 text-gray-800'
          }`}>
          <code>{block.text}</code>
        </pre>
      );
    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag className={`ml-4 space-y-0.5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, idx) => (
            <li key={idx}>{renderInline(item, isDarkMode)}</li>
          ))}
        </ListTag>
      );
    }
    case 'paragraph':
      return <p className="whitespace-pre-wrap break-words">{renderInline(block.text, isDarkMode)}</p>;
    default:
      return null;
  }
}

function renderInline(text: string, isDarkMode: boolean): ReactNode[] {
  // Tokenize: code, bold, italic, links
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);
  return parts.filter(Boolean).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className={`rounded px-1 py-0.5 font-mono text-xs ${isDarkMode ? 'bg-slate-700 text-indigo-200' : 'bg-gray-100 text-indigo-600'}`}>
          {part.slice(1, -1)}
        </code>
      );
    }
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const href = linkMatch[2];
      const safe = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:');
      if (safe) {
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
            {linkMatch[1]}
          </a>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}
