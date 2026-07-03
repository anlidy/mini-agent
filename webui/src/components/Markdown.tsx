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
        p: ({ children: content }) => (
          <p className="my-0 leading-relaxed">{content}</p>
        ),
        pre: ({ children: content }) => (
          <pre className="my-2.5 overflow-x-auto rounded-xl border border-line/20 bg-muted/70 p-3.5 font-mono text-[13px] leading-relaxed text-ink">
            {content}
          </pre>
        ),
        code: ({ children: content, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] text-ink">
                {content}
              </code>
            );
          }
          return <code className={className}>{content}</code>;
        },
        ul: ({ children: content }) => (
          <ul className="my-1.5 list-disc pl-5 space-y-0.5">{content}</ul>
        ),
        ol: ({ children: content }) => (
          <ol className="my-1.5 list-decimal pl-5 space-y-0.5">{content}</ol>
        ),
        li: ({ children: content }) => (
          <li className="my-0.5 leading-relaxed">{content}</li>
        ),
        h1: ({ children: content }) => (
          <h1 className="my-3 text-lg font-semibold text-ink">{content}</h1>
        ),
        h2: ({ children: content }) => (
          <h2 className="my-2.5 text-base font-semibold text-ink">{content}</h2>
        ),
        h3: ({ children: content }) => (
          <h3 className="my-2 text-sm font-semibold text-ink">{content}</h3>
        ),
        blockquote: ({ children: content }) => (
          <blockquote className="my-1.5 border-l-[3px] border-accent/30 pl-3.5 text-ink-secondary italic">
            {content}
          </blockquote>
        ),
        a: ({ href, children: content }) => (
          <a
            className="text-accent decoration-accent/30 underline underline-offset-2 transition-colors duration-fast hover:decoration-accent"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {content}
          </a>
        ),
        hr: () => <hr className="my-4 border-line/20" />,
        table: ({ children: content }) => (
          <div className="my-2.5 overflow-x-auto rounded-xl border border-line/20">
            <table className="min-w-full border-collapse text-sm">{content}</table>
          </div>
        ),
        th: ({ children: content }) => (
          <th className="border-b border-line/20 bg-muted/50 px-3.5 py-2 text-left text-[13px] font-medium text-ink">
            {content}
          </th>
        ),
        td: ({ children: content }) => (
          <td className="border-b border-line/20 px-3.5 py-2 text-[13px]">{content}</td>
        ),
        strong: ({ children: content }) => (
          <strong className="font-semibold text-ink">{content}</strong>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
