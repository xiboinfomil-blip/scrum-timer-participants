import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NOTE_SECTIONS, parseNoteSections } from '@/lib/note-sections';

// No raw HTML, links, images, or embedded resources from shared notes.
export function NoteContent({ value, className = '' }: { value: string; className?: string }) {
  if (className === 'note-preview' && /^\*\*(Récemment|Maintenant|Ensuite)\*\*\n\n/.test(value)) {
    const sections = parseNoteSections(value);
    return <div className="note-preview note-section-preview">{NOTE_SECTIONS.filter(section => sections[section.key].trim()).map(section => <div key={section.key}><span>{section.heading}</span><NoteContent value={sections[section.key]} /></div>)}</div>;
  }
  return <div className={`note-rich-text ${className}`}><Markdown remarkPlugins={[remarkGfm]} allowedElements={['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li']} unwrapDisallowed>{value}</Markdown></div>;
}