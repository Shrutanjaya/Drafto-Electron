
"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import { markInputRule, markPasteRule } from '@tiptap/core'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import { useContext, useEffect, useRef } from 'react'
import { EditorContext } from './editor-provider'
import { useFieldReveal } from './field-reveal-provider'
import { useCanEdit } from '@/providers/entitlement-provider'
import { escapeRegExp } from '@/lib/find-replace'
import TextAlign from '@tiptap/extension-text-align'
import { Paragraph } from '@tiptap/extension-paragraph'
import ListItem from '@tiptap/extension-list-item'
import OrderedList from '@tiptap/extension-ordered-list'
import Blockquote from '@tiptap/extension-blockquote'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { joinTextblockBackward } from '@tiptap/pm/commands'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ProportionalTable as Table, hydrateTableColWidths } from './table-proportional'
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
  /** When true, the editor grabs keyboard focus once ready (e.g. a freshly-inserted row). */
  autoFocus?: boolean
}

// ── Table column-ratio annotation ─────────────────────────────────────────────
// TipTap serializes an explicit px width only for columns the user dragged;
// fluid columns carry none, so the docx exporter used to GUESS their share from
// an assumed editor width (wrong in wide panels — the last column collapsed to
// a sliver). Instead, measure every column's actual rendered width when the
// content is serialized and stamp each <col> with its width ÷ table-width ratio
// (data-ratio). The exporter reproduces those exact proportions at the docx
// table width, so the export matches what the user saw regardless of how wide
// the editor really was. Missing annotations (older saves, AI-written HTML)
// fall back to the exporter's px/content heuristics.

function measureColRatios(table: HTMLTableElement): number[] | null {
  const firstRow = table.querySelector('tr')
  if (!firstRow) return null
  const colPx: number[] = []
  for (const el of Array.from(firstRow.children)) {
    if (el.tagName !== 'TD' && el.tagName !== 'TH') continue
    const span = Math.max(1, parseInt(el.getAttribute('colspan') || '1', 10) || 1)
    const w = (el as HTMLElement).offsetWidth / span // spanned cells share evenly
    for (let k = 0; k < span; k++) colPx.push(w)
  }
  const sum = colPx.reduce((s, w) => s + w, 0)
  if (colPx.length === 0 || !sum) return null
  return colPx.map((w) => w / sum)
}

function annotateTableColRatios(html: string, editorRoot: HTMLElement): string {
  if (!html.includes('<table')) return html
  const domTables = Array.from(editorRoot.querySelectorAll('table'))
  if (domTables.length === 0) return html
  let t = 0
  // TipTap disallows nested tables, so a non-greedy table match is safe, and the
  // Nth serialized table corresponds to the Nth rendered table.
  return html.replace(/<table\b[\s\S]*?<\/table>/g, (tableHtml) => {
    const dom = domTables[t++] as HTMLTableElement | undefined
    const ratios = dom ? measureColRatios(dom) : null
    let out = tableHtml.replace(/<table\b([^>]*)>/, (_m, attrs) => {
      const cleanAttrs = attrs.replace(/\s*style="[^"]*"/g, '')
      return `<table${cleanAttrs} style="width: 100%;">`
    })
    if (!ratios) return out
    const colTags = out.match(/<col\b[^>]*>/g) || []
    if (colTags.length !== ratios.length) return out // shape mismatch — don't guess
    let j = 0
    return out.replace(/<col\b[^>]*>/g, (colTag) => {
      const r = ratios[j++]
      const pct = (r * 100).toFixed(4)
      const clean = colTag.replace(/\s*data-ratio="[^"]*"/g, '').replace(/\s*style="[^"]*"/g, '')
      return clean.replace(/^<col/, `<col style="width: ${pct}%;" data-ratio="${r.toFixed(4)}"`)
    })
  })
}

// Markdown-shortcut input/paste rules restricted to the ASTERISK forms only.
// The default Bold/Italic extensions ALSO turn `__x__`/`_x_` into bold/italic;
// legal drafting uses underscores as literal blanks ("____"), so the underscore
// rules are dropped here while `**bold**` / `*italic*` keep working.
const boldStarInput = /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/;
const boldStarPaste = /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))/g;
const italicStarInput = /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/;
const italicStarPaste = /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))/g;

const BoldStarOnly = Bold.extend({
  addInputRules() { return [markInputRule({ find: boldStarInput, type: this.type })]; },
  addPasteRules() { return [markPasteRule({ find: boldStarPaste, type: this.type })]; },
});
const ItalicStarOnly = Italic.extend({
  addInputRules() { return [markInputRule({ find: italicStarInput, type: this.type })]; },
  addPasteRules() { return [markPasteRule({ find: italicStarPaste, type: this.type })]; },
});

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

              // The emphasis label the quote carries ("emphasis supplied" and
              // the like), shown where the document prints it: after the quoted
              // text, on its own line, ranged right.
              //
              // It is a widget rather than a CSS pseudo-element because the
              // closing quotation-mark cue above already owns the quote's
              // ::after, and an element only has one — the label showed up only
              // when the user had typed their own closing quote and that cue had
              // stepped aside.
              const label = (node.attrs?.emphasis || '').trim();
              if (label) {
                decorations.push(
                  Decoration.widget(pos + node.nodeSize - 1, () => {
                    const el = document.createElement('div');
                    el.className = 'quote-emphasis-label';
                    el.textContent = `(${label.replace(/^\(+\s*/, '').replace(/\s*\)+$/, '')})`;
                    el.contentEditable = 'false';
                    return el;
                  }, { side: 1, ignoreSelection: true }),
                );
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

export const BadhiyaBox = ({ value, onChange, disabled: disabledProp, onTab, onCtrlSpace, path, autoFocus }: BadhiyaBoxProps) => {
  // Read-only (lapsed subscription) locks the rich-text editor too — fieldset/
  // capture-phase guards can't disable tiptap's contentEditable, so honor it here.
  const canEdit = useCanEdit();
  const disabled = disabledProp || !canEdit;
  const { setActiveEditor } = useContext(EditorContext);
  const fieldReveal = useFieldReveal();
  // The last HTML this editor emitted (post ratio-annotation). The emitted
  // string differs from editor.getHTML() whenever it contains a table, so the
  // external-value sync below must treat it as "own content", not a reset.
  const lastEmitted = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        // Replaced below with a version that remembers its numbering regime.
        orderedList: false,
        // Replaced below with a ListItem that permits a leading blockquote, so the
        // Quote button works inside lists (default 'paragraph block*' forbids it).
        listItem: false,
        // Replaced below with a version that remembers its emphasis label.
        blockquote: false,
        paragraph: false, // Disable default paragraph to customize
        // Replaced with asterisk-only variants (no underscore markdown shortcut).
        bold: false,
        italic: false,
      }),
      BoldStarOnly,
      ItalicStarOnly,
      // Allow a list item to start with a paragraph OR a blockquote (then any
      // blocks). Keeps normal list behaviour while letting users quote inside lists.
      ListItem.extend({ content: '(paragraph | blockquote) block*' }),
      // A numbered list remembers which regime it follows (1. → a. → i. by
      // default; see lib/list-regimes.ts). The choice rides on the list itself
      // as data-regime, so it is saved, reloaded and exported with the text
      // rather than living in a setting somewhere else. Only the outermost list
      // carries it — the levels below follow from it.
      // A quote remembers the emphasis label the user chose for it ("emphasis
      // supplied" and the like; see lib/quote-emphasis.ts). It rides on the
      // block as data-emphasis so it travels with the quote, and prints on its
      // own line outside the closing quotation mark.
      Blockquote.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            emphasis: {
              default: null,
              parseHTML: (element: HTMLElement) => element.getAttribute('data-emphasis'),
              renderHTML: (attributes: Record<string, any>) =>
                attributes.emphasis ? { 'data-emphasis': attributes.emphasis } : {},
            },
          };
        },
      }),
      OrderedList.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            regime: {
              default: null,
              parseHTML: (element: HTMLElement) => element.getAttribute('data-regime'),
              renderHTML: (attributes: Record<string, any>) =>
                attributes.regime ? { 'data-regime': attributes.regime } : {},
            },
          };
        },
      }).configure({ keepMarks: true, keepAttributes: false }),
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
      // Column resizing on. ProseMirror runs the table in fixed-layout mode and the
      // drag handles are styled in globals.css (.column-resize-handle /
      // .resize-cursor). Columns without a stored colwidth fall back to equal
      // distribution via CSS (table-layout:fixed + width:100%); resized widths
      // serialize into the HTML and the docx exporter honours them.
      // lastColumnResizable:false freezes the table's right edge (like the left),
      // so dragging an inner border redistributes width between adjacent columns.
      Table.configure({ resizable: true, cellMinWidth: 25, lastColumnResizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TabHandler,
      QuoteCue,
      ListEditingKeys,
    ],
    content: hydrateTableColWidths(value),
    onUpdate: ({ editor }) => {
      // Stamp measured column ratios onto any tables before handing the HTML to
      // the form (see annotateTableColRatios above).
      const html = annotateTableColRatios(editor.getHTML(), editor.view.dom as HTMLElement)
      lastEmitted.current = html
      onChange(html)
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

  // Grab focus once the editor is ready when asked to (e.g. a row inserted via
  // Ctrl+Space — the caller wants the cursor in the new row immediately).
  useEffect(() => {
    if (autoFocus && editor && !disabled) {
      editor.commands.focus('end');
    }
    // Only the initial autoFocus/editor-ready transition matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, editor]);

  useEffect(() => {
    if (!editor) return;
    // A non-string value means the form has no value at this path right now —
    // which happens transiently while rows are being reordered inside a nested
    // array. Treat it as "no news" and keep showing what is already here.
    // Blanking on it was destructive: the editor cleared, its own change handler
    // fired, and the empty string was written back over the user's text.
    // A genuine empty value is "", which still syncs normally.
    if (typeof value !== "string") return;
    if (value !== editor.getHTML() && value !== lastEmitted.current) {
      editor.commands.setContent(hydrateTableColWidths(value), false);
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
