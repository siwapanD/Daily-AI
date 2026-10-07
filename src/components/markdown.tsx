import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Safe markdown: raw HTML is not rendered and unsafe URLs are stripped (react-markdown defaults). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-dark">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noopener noreferrer nofollow" /> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
