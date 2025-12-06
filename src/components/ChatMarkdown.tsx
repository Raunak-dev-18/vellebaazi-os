import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface ChatMarkdownProps {
  content: string;
  isOwnMessage?: boolean;
}

export function ChatMarkdown({ content, isOwnMessage = false }: ChatMarkdownProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Code blocks with syntax highlighting
        code(props) {
          const { children, className, ...rest } = props;
          const match = /language-(\w+)/.exec(className || "");
          const codeString = String(children).replace(/\n$/, "");
          const isInline = !match && !codeString.includes("\n");

          if (isInline) {
            return (
              <code
                className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                  isOwnMessage
                    ? "bg-white/20 text-blue-100"
                    : "bg-secondary text-foreground"
                }`}
                {...rest}
              >
                {children}
              </code>
            );
          }

          return (
            <div className="relative group my-2 rounded-lg overflow-hidden">
              <div className={`flex items-center justify-between px-3 py-1.5 text-xs ${
                isOwnMessage ? "bg-black/30" : "bg-zinc-800"
              }`}>
                <span className="text-zinc-400">{match?.[1] || "code"}</span>
                <button
                  onClick={() => copyToClipboard(codeString)}
                  className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
                >
                  {copiedCode === codeString ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <SyntaxHighlighter
                style={oneDark}
                language={match?.[1] || "text"}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  padding: "12px",
                  fontSize: "12px",
                  borderRadius: 0,
                  background: isOwnMessage ? "rgba(0,0,0,0.3)" : "#1e1e1e",
                }}
              >
                {codeString}
              </SyntaxHighlighter>
            </div>
          );
        },

        // Paragraphs
        p(props) {
          const { children } = props;
          return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
        },

        // Links
        a(props) {
          const { href, children } = props;
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-2 ${
                isOwnMessage ? "text-blue-200 hover:text-blue-100" : "text-blue-500 hover:text-blue-600"
              }`}
            >
              {children}
            </a>
          );
        },

        // Lists
        ul(props) {
          const { children } = props;
          return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
        },
        ol(props) {
          const { children } = props;
          return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
        },
        li(props) {
          const { children } = props;
          return <li className="leading-relaxed">{children}</li>;
        },

        // Blockquotes
        blockquote(props) {
          const { children } = props;
          return (
            <blockquote className={`border-l-2 pl-3 my-2 italic ${
              isOwnMessage ? "border-blue-300/50 text-blue-100" : "border-muted-foreground/30 text-muted-foreground"
            }`}>
              {children}
            </blockquote>
          );
        },

        // Headings
        h1(props) {
          const { children } = props;
          return <h1 className="text-lg font-bold mb-2">{children}</h1>;
        },
        h2(props) {
          const { children } = props;
          return <h2 className="text-base font-bold mb-2">{children}</h2>;
        },
        h3(props) {
          const { children } = props;
          return <h3 className="text-sm font-bold mb-1">{children}</h3>;
        },

        // Tables
        table(props) {
          const { children } = props;
          return (
            <div className="overflow-x-auto my-2">
              <table className={`min-w-full text-xs border-collapse ${
                isOwnMessage ? "border-blue-300/30" : "border-border"
              }`}>
                {children}
              </table>
            </div>
          );
        },
        th(props) {
          const { children } = props;
          return (
            <th className={`px-2 py-1 text-left font-semibold border ${
              isOwnMessage ? "border-blue-300/30 bg-white/10" : "border-border bg-secondary"
            }`}>
              {children}
            </th>
          );
        },
        td(props) {
          const { children } = props;
          return (
            <td className={`px-2 py-1 border ${
              isOwnMessage ? "border-blue-300/30" : "border-border"
            }`}>
              {children}
            </td>
          );
        },

        // Horizontal rule
        hr() {
          return <hr className={`my-3 ${isOwnMessage ? "border-blue-300/30" : "border-border"}`} />;
        },

        // Strong/Bold
        strong(props) {
          const { children } = props;
          return <strong className="font-semibold">{children}</strong>;
        },

        // Emphasis/Italic
        em(props) {
          const { children } = props;
          return <em className="italic">{children}</em>;
        },

        // Strikethrough
        del(props) {
          const { children } = props;
          return <del className="line-through opacity-70">{children}</del>;
        },

        // Pre tag
        pre(props) {
          const { children } = props;
          return <>{children}</>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
