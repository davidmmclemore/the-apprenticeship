"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { useEffect, useId, useRef } from "react";
import { sanitizeHtml } from "@/lib/sanitize";

/**
 * Lightweight rich text: bold, italic, underline, strikethrough, block
 * quotes, bulleted and numbered lists, paragraphs and line breaks, undo/redo
 * and clear formatting. Pasted content is sanitised before ProseMirror parses
 * it, and the editor's schema only knows these marks and nodes, so foreign
 * formatting (fonts, colours, tables, images, scripts) is dropped.
 */

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  label: string;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  describedBy?: string;
  id?: string;
}

export function RichEditor({ value, onChange, label, placeholder, minHeight = 120, autoFocus, describedBy, id }: RichEditorProps) {
  const lastEmitted = useRef(value);
  const toolbarId = useId();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value || "",
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(id ? { id } : {}),
      },
      transformPastedHTML: (html) => sanitizeHtml(html),
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? "" : sanitizeHtml(ed.getHTML());
      lastEmitted.current = html;
      onChange(html);
    },
  });

  // Accept outside changes (e.g. a recovered draft) without fighting typing.
  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive("bold"),
            italic: ed.isActive("italic"),
            underline: ed.isActive("underline"),
            strike: ed.isActive("strike"),
            quote: ed.isActive("blockquote"),
            bullet: ed.isActive("bulletList"),
            ordered: ed.isActive("orderedList"),
            canUndo: ed.can().undo(),
            canRedo: ed.can().redo(),
          }
        : null,
  });

  const btn = (labelText: string, pressed: boolean | undefined, run: () => void, content: React.ReactNode, disabled = false) => (
    <button
      type="button"
      aria-label={labelText}
      title={labelText}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {content}
    </button>
  );

  return (
    <div className="editor" style={{ ["--editor-min" as string]: `${minHeight}px` }}>
      <div className="editor-toolbar" role="toolbar" aria-label={`Formatting for ${label}`} id={toolbarId}>
        {btn("Bold", state?.bold, () => editor?.chain().focus().toggleBold().run(), <strong>B</strong>)}
        {btn("Italic", state?.italic, () => editor?.chain().focus().toggleItalic().run(), <em className="serif">I</em>)}
        {btn("Underline", state?.underline, () => editor?.chain().focus().toggleUnderline().run(), <u>U</u>)}
        {btn("Strikethrough", state?.strike, () => editor?.chain().focus().toggleStrike().run(), <s>S</s>)}
        <span className="sep" aria-hidden />
        {btn("Block quote", state?.quote, () => editor?.chain().focus().toggleBlockquote().run(), <span className="serif" style={{ fontSize: "1.3rem", lineHeight: 1 }}>“</span>)}
        {btn("Bulleted list", state?.bullet, () => editor?.chain().focus().toggleBulletList().run(), <span aria-hidden>•≡</span>)}
        {btn("Numbered list", state?.ordered, () => editor?.chain().focus().toggleOrderedList().run(), <span aria-hidden>1≡</span>)}
        <span className="sep" aria-hidden />
        {btn("Undo", undefined, () => editor?.chain().focus().undo().run(), <span aria-hidden>↶</span>, !state?.canUndo)}
        {btn("Redo", undefined, () => editor?.chain().focus().redo().run(), <span aria-hidden>↷</span>, !state?.canRedo)}
        {btn(
          "Clear formatting",
          undefined,
          () => editor?.chain().focus().unsetAllMarks().clearNodes().run(),
          <span aria-hidden className="small">Clear</span>,
        )}
      </div>
      <div className="editor-content">
        <EditorContent editor={editor} />
        {!editor && <div className="ProseMirror" aria-hidden style={{ minHeight }} />}
      </div>
    </div>
  );
}

/** Render saved rich text. Always re-sanitised at render time. */
export function RichText({ html, className = "prose" }: { html: string | null | undefined; className?: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
