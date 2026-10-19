import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// No raw HTML, links, images, or embedded resources from shared notes.
export function NoteContent({ value, className = '' }: { value: string; className?: string }) {
  return <div className={`note-rich-text ${className}`}><Markdown remarkPlugins={[remarkGfm]} allowedElements={['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li']} unwrapDisallowed>{value}</Markdown></div>;
}