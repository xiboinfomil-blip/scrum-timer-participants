import { Pin, ChevronDown, X, Search, ArrowRight, Clock, ShieldCheck, Sparkles, Check, CircleHelp, NotebookPen, ChartNoAxesColumn, ClipboardCheck, RefreshCw, Users, Contrast, Bold, Italic, Strikethrough, List, ListOrdered, Undo2, Redo2, Meh, Smile, Laugh, type LucideProps } from 'lucide-react';

const icons = {
  pin: Pin, chevron: ChevronDown, close: X, search: Search, arrow: ArrowRight,
  clock: Clock, shield: ShieldCheck, spark: Sparkles, check: Check, help: CircleHelp,
  notes: NotebookPen, statistics: ChartNoAxesColumn, summary: ClipboardCheck,
  refresh: RefreshCw, people: Users, appearance: Contrast, bold: Bold, italic: Italic,
  strike: Strikethrough, bulletList: List, orderedList: ListOrdered, undo: Undo2,
  redo: Redo2, moodCalm: Meh, moodHappy: Smile, moodGreat: Laugh,
} as const;

export function PortalIcon({ name, ...props }: LucideProps & { name: keyof typeof icons }) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" focusable="false" {...props} />;
}