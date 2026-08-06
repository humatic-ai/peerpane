import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * GFM markdown renderer (react-markdown + remark-gfm).
 * Bundled only — no rehype-raw / CDN (MV3 CSP).
 */
export default memo(function MarkdownContent({
  content,
  isDarkMode = false,
  variant = 'default',
}: {
  content: string;
  isDarkMode?: boolean;
  /** Planet 9 assistant prose uses 16/26 body; default keeps compact side-panel style. */
  variant?: 'default' | 'assistant';
}) {
  const assistant = variant === 'assistant';
  const rootClass = assistant
    ? `space-y-3 text-[16px] leading-[26px] ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`
    : `space-y-2 text-sm ${isDarkMode ? 'text-gray-300' : 'text-slate-700'}`;

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const safe =
          typeof href === 'string' &&
          (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'));
        if (!safe) {
          return <span>{children}</span>;
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
            {children}
          </a>
        );
      },
      code: ({ className, children, ...props }) => {
        const isBlock = Boolean(className?.includes('language-')) || String(children).includes('\n');
        if (!isBlock) {
          return (
            <code
              className={`rounded px-1 py-0.5 font-mono text-xs ${
                isDarkMode ? 'bg-slate-700 text-indigo-200' : 'bg-gray-100 text-indigo-600'
              }`}
              {...props}>
              {children}
            </code>
          );
        }
        return (
          <code className={`font-mono text-xs ${className ?? ''}`} {...props}>
            {children}
          </code>
        );
      },
      pre: ({ children }) => (
        <pre
          className={`overflow-x-auto rounded-xl border p-3 font-mono text-xs ${
            isDarkMode ? 'border-slate-700 bg-slate-900 text-indigo-200' : 'border-gray-200 bg-gray-50 text-gray-800'
          }`}>
          {children}
        </pre>
      ),
      table: ({ children }) => (
        <div className="my-2 w-full overflow-x-auto">
          <table
            className={`w-full border-collapse text-left text-sm ${
              isDarkMode ? 'border-slate-700' : 'border-gray-200'
            }`}>
            {children}
          </table>
        </div>
      ),
      th: ({ children }) => (
        <th
          className={`border px-2 py-1 font-semibold ${
            isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'
          }`}>
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className={`border px-2 py-1 ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>{children}</td>
      ),
      h1: ({ children }) => (
        <h1
          className={`${
            assistant ? 'text-[20px] leading-[25px] font-semibold tracking-tight' : 'text-base font-bold'
          } ${isDarkMode ? 'text-gray-100' : assistant ? 'text-gray-900' : 'text-slate-800'}`}>
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2
          className={`${
            assistant ? 'text-[18px] leading-[23px] font-semibold tracking-tight' : 'text-sm font-bold'
          } ${isDarkMode ? 'text-gray-100' : assistant ? 'text-gray-900' : 'text-slate-800'}`}>
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3
          className={`${
            assistant ? 'text-[16px] leading-[20px] font-semibold tracking-tight' : 'text-sm font-semibold'
          } ${isDarkMode ? 'text-gray-100' : assistant ? 'text-gray-900' : 'text-slate-800'}`}>
          {children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4
          className={`${
            assistant ? 'text-[16px] leading-[20px] font-semibold tracking-tight' : 'text-sm font-semibold'
          } ${isDarkMode ? 'text-gray-100' : assistant ? 'text-gray-900' : 'text-slate-800'}`}>
          {children}
        </h4>
      ),
      ul: ({ children }) => (
        <ul className={`ml-4 list-disc space-y-1 ${assistant ? 'leading-[26px]' : ''}`}>{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className={`ml-4 list-decimal space-y-1 ${assistant ? 'leading-[26px]' : ''}`}>{children}</ol>
      ),
      p: ({ children }) => (
        <p
          className={`whitespace-pre-wrap break-words ${
            assistant ? 'my-3 text-[16px] leading-[26px] first:mt-0 last:mb-0' : ''
          }`}>
          {children}
        </p>
      ),
      blockquote: ({ children }) => (
        <blockquote
          className={`border-l-4 pl-3 italic ${
            isDarkMode ? 'border-slate-600 text-gray-300' : 'border-gray-300 text-gray-600'
          }`}>
          {children}
        </blockquote>
      ),
      hr: () => <hr className={`my-3 ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`} />,
      del: ({ children }) => <del className="opacity-80">{children}</del>,
      input: ({ checked, ...props }) => (
        <input type="checkbox" checked={checked} disabled readOnly className="mr-1 align-middle" {...props} />
      ),
    }),
    [assistant, isDarkMode],
  );

  return (
    <div className={rootClass}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
