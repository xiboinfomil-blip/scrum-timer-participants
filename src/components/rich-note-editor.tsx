'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';

export type RichNoteEditorHandle = { focus: () => void };

type Props = {
  ref?: Ref<RichNoteEditorHandle>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

// Soft line breaks stay compatible with existing LF-only notes.
const markdownValue = (editor: NonNullable<ReturnType<typeof useEditor>>) => editor.getMarkdown().replace(/ {2}\n/g, '\n');

export function RichNoteEditor({ ref, value, onChange, disabled, invalid, id = 'note', placeholder = 'Ce que j’aimerais partager avec l’équipe…', autoFocus = true }: Props) {
  const lastValue = useRef(value);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, link: false, underline: false, trailingNode: false }),
      Markdown.configure({ markedOptions: { breaks: true, gfm: true } }),
    ],
    content: value,
    contentType: 'markdown',
    editable: !disabled,
    editorProps: {
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          const form = (event.target as HTMLElement).closest('form');
          const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
          if (submit && !submit.disabled && !event.repeat) form?.requestSubmit();
          return true;
        }
        return false;
      },
      attributes: {
        id, role: 'textbox', 'aria-multiline': 'true',
        'aria-labelledby': `${id}-label`, 'aria-describedby': 'note-help note-format-help note-count',
        'aria-invalid': String(invalid), 'aria-disabled': String(disabled),
        'data-placeholder': placeholder,
        class: 'rich-note-content note-rich-text',
      },
    },
    onUpdate: ({ editor }) => {
      lastValue.current = markdownValue(editor);
      onChange(lastValue.current);
    },
    onCreate: ({ editor }) => { if (autoFocus) editor.view.dom.focus({ preventScroll: true }); },
  });
  useImperativeHandle(ref, () => ({ focus: () => { editor?.view.dom.focus({ preventScroll: true }); } }), [editor]);
  useEffect(() => {
    if (editor && value !== lastValue.current) {
      lastValue.current = value;
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    }
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled, false);
    if (editor) editor.setOptions({ editorProps: { attributes: { ...editor.options.editorProps.attributes, 'aria-invalid': String(invalid), 'aria-disabled': String(disabled) } } });
  }, [editor, disabled, invalid]);
  const state = useEditorState({ editor, selector: ({ editor }) => editor ? {
    bold: editor.isActive('bold'), italic: editor.isActive('italic'), strike: editor.isActive('strike'),
    bulletList: editor.isActive('bulletList'), orderedList: editor.isActive('orderedList'),
    undo: editor.can().undo(), redo: editor.can().redo(),
  } : null });
  const tools = [
    { label: 'Gras', icon: <strong>G</strong>, active: state?.bold, run: () => editor?.chain().focus().toggleBold().run() },
    { label: 'Italique', icon: <em>I</em>, active: state?.italic, run: () => editor?.chain().focus().toggleItalic().run() },
    { label: 'Barré', icon: <s>S</s>, active: state?.strike, run: () => editor?.chain().focus().toggleStrike().run() },
    { label: 'Liste à puces', icon: '• ≡', active: state?.bulletList, run: () => editor?.chain().focus().toggleBulletList().run() },
    { label: 'Liste numérotée', icon: '1. ≡', active: state?.orderedList, run: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: 'Annuler', icon: '↶', unavailable: !state?.undo, run: () => editor?.chain().focus().undo().run() },
    { label: 'Rétablir', icon: '↷', unavailable: !state?.redo, run: () => editor?.chain().focus().redo().run() },
  ];
  return <div className={`rich-note-editor ${invalid ? 'is-invalid' : ''} ${disabled ? 'is-disabled' : ''}`}>
    <div className="rich-note-toolbar" role="group" aria-label="Mise en forme de la note">
      {tools.map(tool => <button key={tool.label} type="button" aria-label={tool.label} title={tool.label} aria-pressed={tool.active} disabled={!editor || disabled || tool.unavailable} onMouseDown={event => event.preventDefault()} onClick={tool.run}>{tool.icon}</button>)}
    </div>
    <EditorContent editor={editor} />
  </div>;
}