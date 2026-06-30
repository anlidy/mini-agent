import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
}

export default function Markdown({ children }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Render paragraphs without extra margins
        p: ({ children: content }) => <p className="my-0">{content}</p>,
        // Code blocks with subtle styling
        pre: ({ children: content }) => (
          <pre className="my-2 overflow-x-auto rounded border border-line bg-[#f8f9fb] p-3 font-mono text-[13px] leading-relaxed text-text">
            {content}
          </pre>
        ),
        // Inline code
        code: ({ children: content, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="rounded bg-[#f0f0f0] px-1 py-0.5 font-mono text-[12px] text-text">
                {content}
              </code>
            );
          }
          return <code className={className}>{content}</code>;
        },
        // Lists
        ul: ({ children: content }) => <ul className="my-1 list-disc pl-5">{content}</ul>,
        ol: ({ children: content }) => <ol className="my-1 list-decimal pl-5">{content}</ol>,
        li: ({ children: content }) => <li className="my-0.5">{content}</li>,
        // Headings
        h1: ({ children: content }) => <h1 className="my-2 text-lg font-bold text-ink">{content}</h1>,
        h2: ({ children: content }) => <h2 className="my-2 text-base font-bold text-ink">{content}</h2>,
        h3: ({ children: content }) => <h3 className="my-1.5 text-sm font-bold text-ink">{content}</h3>,
        // Blockquote
        blockquote: ({ children: content }) => (
          <blockquote className="my-1 border-l-2 border-accent/30 pl-3 italic text-muted">
            {content}
          </blockquote>
        ),
        // Links
        a: ({ href, children: content }) => (
          <a className="text-accent underline" href={href} target="_blank" rel="noopener noreferrer">
            {content}
          </a>
        ),
        // Horizontal rule
        hr: () => <hr className="my-3 border-line" />,
        // Tables
        table: ({ children: content }) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse border border-line text-sm">{content}</table>
          </div>
        ),
        th: ({ children: content }) => (
          <th className="border border-line bg-[#f8f9fb] px-3 py-1.5 text-left font-medium">{content}</th>
        ),
        td: ({ children: content }) => (
          <td className="border border-line px-3 py-1.5">{content}</td>
        ),
        // Strong and emphasis keep default
        strong: ({ children: content }) => <strong className="font-semibold">{content}</strong>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
