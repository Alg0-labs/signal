"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Themed markdown renderer for analyst answers — turns the model's markdown
 * (headers, bold, tables, lists) into clean styled output instead of raw `###`.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-xs leading-relaxed text-[var(--text-secondary)] space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)] mt-3 mb-1">{children}</h3>,
          h2: ({ children }) => <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)] mt-3 mb-1">{children}</h3>,
          h3: ({ children }) => <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-3 mb-1">{children}</h4>,
          p: ({ children }) => <p className="text-xs text-[var(--text-secondary)]">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 text-xs">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 text-xs">{children}</ol>,
          li: ({ children }) => <li className="text-[var(--text-secondary)]">{children}</li>,
          hr: () => <hr className="border-[var(--border)] my-2" />,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">{children}</a>
          ),
          code: ({ children }) => <code className="font-mono text-[var(--warning)] bg-white/5 px-1 rounded">{children}</code>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-1">
              <table className="w-full text-[10px] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="text-left text-[var(--text-secondary)] font-semibold border-b border-[var(--border)] px-1.5 py-1">{children}</th>,
          td: ({ children }) => <td className="border-b border-[var(--border)]/50 px-1.5 py-1 text-[var(--text-secondary)]">{children}</td>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--accent)] pl-2 text-[var(--text-secondary)] italic">{children}</blockquote>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
