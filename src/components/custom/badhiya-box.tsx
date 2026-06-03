
"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import { useContext, useEffect } from 'react'
import { EditorContext } from './editor-provider'
import { useFieldReveal } from './field-reveal-provider'
import { escapeRegExp } from '@/lib/find-replace'
import TextAlign from '@tiptap/extension-text-align'
import { Paragraph } from '@tiptap/extension-paragraph'
import ListItem from '@tiptap/extension-list-item'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { joinTextblockBackward } from '@tiptap/pm/commands'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'


interface BadhiyaBoxProps {
  value: string
  onChange: (richText: string) => void
  disabled?: boolean
  onTab?: (shiftKey: boolean) => void
  onCtrlSpace?: () => void
  /** RHF field path; when set, the editor registers itself for Find & Replace navigation. */
  path?: string
}

// Custom extension to handle Tab key and Ctrl+Space
const TabHandler = Extension.create({
  name: 'tabHandler',

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const onTab = (editor as any).options.editorProps?.onTab;
        if (onTab) {
          onTab(false);
          return true;
        }
        // Cap list nesting at 5 levels: if already 5 listItems deep, swallow Tab
        // so no deeper sub-list can be created (matches the 5-level docx scheme).
        if (editor.isActive('listItem')) {
          const { $from } = editor.state.selection;
          let depth = 0;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'listItem') depth++;
          }
          if (depth >= 5) return true;
        }
        return false; // fall through to the default sink-list-item behaviour
      },
      'Shift-Tab': ({ editor }) => {
        const onTab = (editor as any).options.editorProps?.onTab;
        if (onTab) {
          onTab(true);
          return true;
        }
        return false;
      },
      'Ctrl-Space': ({ editor }) => {
        const onCtrlSpace = (editor as any).options.editorProps?.onCtrlSpace;
        if (onCtrlSpace) {
          onCtrlSpace();
          return true;
        }
        return false;
      },
      'Ctrl-h': ({ editor }) => {
        editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run();
        return true;
      },
      'Mod-l': ({ editor }) => {
        editor.chain().focus().setTextAlign('left').run();
        return true;
      },
      'Mod-e': ({ editor }) => {
        editor.chain().focus().setTextAlign('center').run();
        return true;
      },
      'Mod-r': ({ editor }) => {
        editor.chain().focus().setTextAlign('right').run();
        return true;
      },
      'Mod-j': ({ editor }) => {
        editor.chain().focus().setTextAlign('justify').run();
        return true;
      },
    }
  },
})

// Marks each blockquote with classes indicating where an opening/closing smart
// quote will be auto-added on export, so the editor can show faint corner cues.
// Mirrors the strict boundary check in html-to-docx.ts (both straight & curly,
// single quote counts; an empty block shows both cues → bare "" on export).
const LEADING_QUOTE_CHARS = ['"', '“', "'", '‘'];
const TRAILING_QUOTE_CHARS = ['"', '”', "'", '’'];
const SINGLE_QUOTE_CHARS = ["'", '‘', '’'];

const QuoteCue = Extension.create({
  name: 'quoteCue',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('quoteCue'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'blockquote') return;
              const trimmed = node.textContent.trim();
              const firstChar = trimmed[0];
              const lastChar = trimmed[trimmed.length - 1];
              const hasLead = trimmed.length > 0 && LEADING_QUOTE_CHARS.includes(firstChar);
              const hasTrail = trimmed.length > 0 && TRAILING_QUOTE_CHARS.includes(lastChar);
              const showOpen = !hasLead;
              const showClose = !hasTrail;
              // Mirror export: if exactly one end is a single quote, the cue at the
              // other (auto-added) end shows the matching single mark.
              const openSingle = showOpen && hasTrail && SINGLE_QUOTE_CHARS.includes(lastChar);
              const closeSingle = showClose && hasLead && SINGLE_QUOTE_CHARS.includes(firstChar);
              const classes = [
                showOpen && 'quote-show-open',
                openSingle && 'quote-open-single',
                showClose && 'quote-show-close',
                closeSingle && 'quote-close-single',
              ].filter(Boolean) as string[];
              if (classes.length) {
                decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: classes.join(' ') }));
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

// High-priority list-editing keymaps (run before the default list/blockquote keys):
//  • Enter — when in an empty trailing line of a blockquote inside a list item, leave
//    the quote and start a NEW list item, rather than dropping an unnumbered paragraph
//    into the same item (keeps the quote marker-less and the next text a real point).
//  • Backspace — at the start of a paragraph that directly follows a list, join it into
//    the last item's text ("rejoin the final point") instead of the default, which wraps
//    the paragraph into a spurious new trailing list item.
const ListEditingKeys = Extension.create({
  name: 'listEditingKeys',
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if ($from.parentOffset !== 0) return false; // only at the very start of the block
        const before = $from.before($from.depth);
        const nodeBefore = state.doc.resolve(before).nodeBefore;
        if (!nodeBefore) return false;
        const name = nodeBefore.type.name;
        if (name !== 'bulletList' && name !== 'orderedList') return false;
        // Join into the previous textblock (the last point) rather than re-listing.
        return joinTextblockBackward(state, view.dispatch);
      },
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        const d = $from.depth;
        if (d < 2) return false;
        // Empty paragraph, directly inside a blockquote, directly inside a list item.
        if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false;
        if ($from.node(d - 1).type.name !== 'blockquote') return false;
        if ($from.node(d - 2).type.name !== 'listItem') return false;
        // Only at the quote's last line (the natural "exit" position).
        if ($from.index(d - 1) !== $from.node(d - 1).childCount - 1) return false;

        const listItemType = state.schema.nodes.listItem;
        const newLi = listItemType.createAndFill();
        if (!newLi) return false;

        const pStart = $from.before(d);
        const pEnd = $from.after(d);
        const liEnd = $from.after(d - 2);

        const tr = state.tr;
        tr.delete(pStart, pEnd);                        // drop the empty quote line
        const insertPos = liEnd - (pEnd - pStart);      // end of the list item, post-delete
        tr.insert(insertPos, newLi);                    // new sibling list item after it
        tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
        tr.scrollIntoView();
        view.dispatch(tr);
        return true;
      },
    };
  },
});

export const BadhiyaBox = ({ value, onChange, disabled, onTab, onCtrlSpace, path }: BadhiyaBoxProps) => {
  const { setActiveEditor } = useContext(EditorContext);
  const fieldReveal = useFieldReveal();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
        // Replaced below with a ListItem that permits a leading blockquote, so the
        // Quote button works inside lists (default 'paragraph block*' forbids it).
        listItem: false,
        blockquote: {}, // Enable blockquote
        paragraph: false, // Disable default paragraph to customize
      }),
      // Allow a list item to start with a paragraph OR a blockquote (then any
      // blocks). Keeps normal list behaviour while letting users quote inside lists.
      ListItem.extend({ content: '(paragraph | blockquote) block*' }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Paragraph.extend({
        addOptions() {
          return {
            HTMLAttributes: {
              class: 'mb-2.5', // Corresponds to 10px
            },
          }
        },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TabHandler,
      QuoteCue,
      ListEditingKeys,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    onFocus: ({ editor }) => {
      setActiveEditor(editor);
    },
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert min-h-[40px] w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      },
      onTab: onTab,
      onCtrlSpace: onCtrlSpace,
    },
  })

  useEffect(() => {
    if (editor && editor.isEditable !== !disabled) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  // Register this editor for Find & Replace navigation: select + scroll to the
  // Nth match of a query. Offsets are computed against the editor's own text, so
  // ProseMirror positions line up exactly with what's highlighted.
  useEffect(() => {
    if (!editor || !path || !fieldReveal) return;
    fieldReveal.register(path, (query, caseSensitive, occurrence) => {
      const { doc } = editor.state;
      let text = '';
      const posMap: number[] = [];
      doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          for (let i = 0; i < node.text.length; i++) posMap.push(pos + i);
          text += node.text;
        }
        return true;
      });
      const re = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
      let m: RegExpExecArray | null;
      let k = 0;
      while ((m = re.exec(text)) !== null) {
        if (k === occurrence) {
          const from = posMap[m.index];
          const to = (posMap[m.index + m[0].length - 1] ?? from) + 1;
          editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
          return;
        }
        k++;
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      // Occurrence not found in live text (rare drift): at least scroll the field in.
      editor.view.dom.scrollIntoView({ block: 'center' });
    });
    return () => fieldReveal.unregister(path);
  }, [editor, path, fieldReveal]);

  return (
    <EditorContent editor={editor} />
  )
}
