"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Themed markdown renderer for analyst answers — turns the model's markdown
 * (headers, bold, tables, lists) into clean styled output instead of raw `###`.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-xs leading-relaxed text-[#c8c8e0] space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#00ff88] mt-3 mb-1">{children}</h3>,
          h2: ({ children }) => <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#00ff88] mt-3 mb-1">{children}</h3>,
          h3: ({ children }) => <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#8b5cf6] mt-3 mb-1">{children}</h4>,
          p: ({ children }) => <p className="text-xs text-[#c8c8e0]">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-[#f0f0ff]">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 text-xs">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 text-xs">{children}</ol>,
          li: ({ children }) => <li className="text-[#c8c8e0]">{children}</li>,
          hr: () => <hr className="border-[#1e1e2e] my-2" />,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#00ff88] hover:underline">{children}</a>
          ),
          code: ({ children }) => <code className="font-mono text-[#f59e0b] bg-white/5 px-1 rounded">{children}</code>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-1">
              <table className="w-full text-[10px] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="text-left text-[#8888aa] font-semibold border-b border-[#1e1e2e] px-1.5 py-1">{children}</th>,
          td: ({ children }) => <td className="border-b border-[#1e1e2e]/50 px-1.5 py-1 text-[#c8c8e0]">{children}</td>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-[#8b5cf6] pl-2 text-[#8888aa] italic">{children}</blockquote>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
