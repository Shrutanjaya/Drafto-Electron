
"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import { useContext, useEffect } from 'react'
import { EditorContext } from './editor-provider'
import TextAlign from '@tiptap/extension-text-align'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Extension } from '@tiptap/core'
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
        return false;
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

export const BadhiyaBox = ({ value, onChange, disabled, onTab, onCtrlSpace }: BadhiyaBoxProps) => {
  const { setActiveEditor } = useContext(EditorContext);

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
        listItem: {},
        blockquote: {}, // Enable blockquote
        paragraph: false, // Disable default paragraph to customize
      }),
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

  return (
    <EditorContent editor={editor} />
  )
}
