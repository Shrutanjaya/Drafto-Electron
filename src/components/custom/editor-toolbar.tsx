"use client"

import { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Eraser,
  Highlighter,
  Table as TableIcon,
  Columns2,
  Rows2,
  Trash2,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronsUp,
  ChevronsDown,
  TableCellsMerge,
  TableCellsSplit,
} from 'lucide-react'
import { TextSelection } from '@tiptap/pm/state'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useContext, useState, useRef, useEffect } from 'react';
import { EditorContext } from './editor-provider';

// Move the table row containing the cursor up or down by one, preserving cell
// content (TipTap ships no moveRow command). Deletes the row node and reinserts
// it past its sibling; positions are recomputed relative to the post-delete doc.
function moveTableRow(editor: Editor, dir: -1 | 1): boolean {
  const { state } = editor;
  const { $from } = state.selection;
  let rowDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'tableRow') { rowDepth = d; break; }
  }
  if (rowDepth < 0) return false;
  const tableNode = $from.node(rowDepth - 1);
  const rowIndex = $from.index(rowDepth - 1);
  const target = rowIndex + dir;
  if (target < 0 || target >= tableNode.childCount) return false;

  const rowStart = $from.before(rowDepth);
  const rowEnd = $from.after(rowDepth);
  const rowSlice = state.doc.slice(rowStart, rowEnd);
  const siblingSize = tableNode.child(target).nodeSize;
  // After deleting the row, the sibling occupies the freed space; insert past it.
  const insertPos = dir < 0 ? rowStart - siblingSize : rowStart + siblingSize;

  const tr = state.tr;
  tr.delete(rowStart, rowEnd);
  tr.insert(insertPos, rowSlice.content);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
  tr.scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

const HIGHLIGHT_COLORS = [
  { label: 'Yellow',  color: '#fef08a' },
  { label: 'Green',   color: '#bbf7d0' },
  { label: 'Cyan',    color: '#a5f3fc' },
  { label: 'Pink',    color: '#fbcfe8' },
  { label: 'Orange',  color: '#fed7aa' },
  { label: 'None',    color: 'none'    },
];

export const EditorToolbar = () => {
    const { activeEditor: editor } = useContext(EditorContext);
    const [showHighlightPicker, setShowHighlightPicker] = useState(false);
    const [showTableMenu, setShowTableMenu] = useState(false);
    const [activeHighlightColor, setActiveHighlightColor] = useState('#fef08a');
    const [customRows, setCustomRows] = useState(2);
    const [customCols, setCustomCols] = useState(3);
    const pickerRef = useRef<HTMLDivElement>(null);
    const tableMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowHighlightPicker(false);
            }
            if (tableMenuRef.current && !tableMenuRef.current.contains(e.target as Node)) {
                setShowTableMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

  const applyHighlight = (color: string) => {
    if (!editor) return;
    if (color === 'none') {
      editor?.chain().focus().unsetHighlight().run();
    } else {
      editor?.chain().focus().toggleHighlight({ color }).run();
      setActiveHighlightColor(color);
    }
    setShowHighlightPicker(false);
  };

  const isHighlightActive = editor?.isActive('highlight');

  const toggleBold = () => editor?.chain().focus().toggleBold().run()
  const toggleItalic = () => editor?.chain().focus().toggleItalic().run()
  const toggleUnderline = () => editor?.chain().focus().toggleUnderline().run()
  const toggleBulletList = () => editor?.chain().focus().toggleBulletList().run()
  const toggleOrderedList = () => editor?.chain().focus().toggleOrderedList().run()
  
  return (
    <div className={cn("flex flex-wrap items-center gap-0.5 p-0.5 border border-input rounded-md bg-muted/50", !editor && "opacity-50 pointer-events-none")}>
      <Button variant="ghost" size="icon" onClick={toggleBold} className={cn("h-6 w-6 p-1", editor?.isActive('bold') ? 'bg-accent' : '')}><Bold /></Button>
      <Button variant="ghost" size="icon" onClick={toggleItalic} className={cn("h-6 w-6 p-1", editor?.isActive('italic') ? 'bg-accent' : '')}><Italic /></Button>
      <Button variant="ghost" size="icon" onClick={toggleUnderline} className={cn("h-6 w-6 p-1", editor?.isActive('underline') ? 'bg-accent' : '')}><UnderlineIcon /></Button>
      <Button variant="ghost" size="icon" onClick={toggleBulletList} className={cn("h-6 w-6 p-1", editor?.isActive('bulletList') ? 'bg-accent' : '')}><List /></Button>
      <Button variant="ghost" size="icon" onClick={toggleOrderedList} className={cn("h-6 w-6 p-1", editor?.isActive('orderedList') ? 'bg-accent' : '')}><ListOrdered /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={cn("h-6 w-6 p-1", editor?.isActive('blockquote') ? 'bg-accent' : '')}><Quote /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor?.chain().focus().setTextAlign('left').run()} className={cn("h-6 w-6 p-1", editor?.isActive({ textAlign: 'left' }) ? 'bg-accent' : '')}><AlignLeft /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor?.chain().focus().setTextAlign('center').run()} className={cn("h-6 w-6 p-1", editor?.isActive({ textAlign: 'center' }) ? 'bg-accent' : '')}><AlignCenter /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor?.chain().focus().setTextAlign('right').run()} className={cn("h-6 w-6 p-1", editor?.isActive({ textAlign: 'right' }) ? 'bg-accent' : '')}><AlignRight /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor?.chain().focus().setTextAlign('justify').run()} className={cn("h-6 w-6 p-1", editor?.isActive({ textAlign: 'justify' }) ? 'bg-accent' : '')}><AlignJustify /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} className="h-6 w-6 p-1"><Eraser /></Button>
      {/* Highlight picker */}
      <div className="relative" ref={pickerRef}>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-6 w-6 p-1 relative', isHighlightActive ? 'bg-accent' : '')}
          onClick={() => setShowHighlightPicker(p => !p)}
          title="Highlight (Ctrl+H)"
        >
          <Highlighter className="h-3.5 w-3.5" />
          <span
            className="absolute bottom-0.5 left-0.5 right-0.5 h-1 rounded-sm"
            style={{ backgroundColor: activeHighlightColor }}
          />
        </Button>
        {showHighlightPicker && (
          <div className="absolute top-full left-0 mt-1 z-50 flex gap-1 p-1.5 rounded-md border bg-popover shadow-md">
            {HIGHLIGHT_COLORS.map(({ label, color }) => (
              <button
                key={color}
                title={label}
                onClick={() => applyHighlight(color)}
                className={cn(
                  'h-5 w-5 rounded-sm border border-border flex items-center justify-center text-[9px] transition-transform hover:scale-110',
                  color === 'none' && 'bg-background text-foreground font-bold text-[8px]'
                )}
                style={{ backgroundColor: color === 'none' ? undefined : color }}
              >
                {color === 'none' ? '✕' : ''}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Table menu */}
      <div className="relative" ref={tableMenuRef}>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-6 w-6 p-1', editor?.isActive('table') ? 'bg-accent' : '')}
          onClick={() => setShowTableMenu(p => !p)}
          title="Table"
        >
          <TableIcon className="h-3.5 w-3.5" />
        </Button>
        {showTableMenu && (
          <div className="absolute top-full left-0 mt-1 z-50 flex flex-col min-w-[180px] rounded-md border bg-popover shadow-md py-1">
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left"
              onClick={() => { editor?.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run(); setShowTableMenu(false); }}
            >
              <TableIcon className="h-3 w-3" /> Insert 2×2 table
            </button>
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left"
              onClick={() => { editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run(); setShowTableMenu(false); }}
            >
              <TableIcon className="h-3 w-3" /> Insert 3×3 table
            </button>
            {/* Custom size */}
            <div className="px-3 py-1.5 flex items-center gap-1.5">
              <TableIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              <input
                type="number"
                min={1}
                max={20}
                value={customRows}
                onChange={e => setCustomRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                onClick={e => e.stopPropagation()}
                className="w-10 h-5 text-xs text-center border border-input rounded bg-background"
                title="Rows"
              />
              <span className="text-xs text-muted-foreground">×</span>
              <input
                type="number"
                min={1}
                max={20}
                value={customCols}
                onChange={e => setCustomCols(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                onClick={e => e.stopPropagation()}
                className="w-10 h-5 text-xs text-center border border-input rounded bg-background"
                title="Columns"
              />
              <button
                className="text-xs px-1.5 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90"
                onClick={() => { editor?.chain().focus().insertTable({ rows: customRows, cols: customCols, withHeaderRow: false }).run(); setShowTableMenu(false); }}
              >
                Insert
              </button>
            </div>
            <div className="border-t my-1" />
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left disabled:opacity-40"
              disabled={!editor?.isActive('table')}
              onClick={() => { editor?.chain().focus().addColumnBefore().run(); setShowTableMenu(false); }}
            >
              <ArrowLeftToLine className="h-3 w-3" /> Add column before
            </button>
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left disabled:opacity-40"
              disabled={!editor?.isActive('table')}
              onClick={() => { editor?.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }}
            >
              <ArrowRightToLine className="h-3 w-3" /> Add column after
            </button>
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left disabled:opacity-40"
              disabled={!editor?.isActive('table')}
              onClick={() => { editor?.chain().focus().addRowBefore().run(); setShowTableMenu(false); }}
            >
              <ArrowUpToLine className="h-3 w-3" /> Add row above
            </button>
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left disabled:opacity-40"
              disabled={!editor?.isActive('table')}
              onClick={() => { editor?.chain().focus().addRowAfter().run(); setShowTableMenu(false); }}
            >
              <ArrowDownToLine className="h-3 w-3" /> Add row below
            </button>
            <div className="border-t my-1" />
            {/* Reorder the current row */}
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left disabled:opacity-40"
              disabled={!editor?.isActive('table')}
              onClick={() => { if (editor) moveTableRow(editor, -1); setShowTableMenu(false); }}
            >
              <ChevronsUp className="h-3 w-3" /> Move row up
            </button>
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left disabled:opacity-40"
              disabled={!editor?.isActive('table')}
              onClick={() => { if (editor) moveTableRow(editor, 1); setShowTableMenu(false); }}
            >
              <ChevronsDown className="h-3 w-3" /> Move row down
            </button>
            <div className="border-t my-1" />
            {/* Merge / split cells */}
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left disabled:opacity-40"
              disabled={!editor?.can().mergeCells()}
              onClick={() => { editor?.chain().focus().mergeCells().run(); setShowTableMenu(false); }}
            >
              <TableCellsMerge className="h-3 w-3" /> Merge selected cells
            </button>
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left disabled:opacity-40"
              disabled={!editor?.can().splitCell()}
              onClick={() => { editor?.chain().focus().splitCell().run(); setShowTableMenu(false); }}
            >
              <TableCellsSplit className="h-3 w-3" /> Split cell
            </button>
            <div className="border-t my-1" />
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left text-destructive disabled:opacity-40"
              disabled={!editor?.isActive('table')}
              onClick={() => { editor?.chain().focus().deleteColumn().run(); setShowTableMenu(false); }}
            >
              <Columns2 className="h-3 w-3" /> Delete column
            </button>
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left text-destructive disabled:opacity-40"
              disabled={!editor?.isActive('table')}
              onClick={() => { editor?.chain().focus().deleteRow().run(); setShowTableMenu(false); }}
            >
              <Rows2 className="h-3 w-3" /> Delete row
            </button>
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 text-left text-destructive disabled:opacity-40"
              disabled={!editor?.isActive('table')}
              onClick={() => { editor?.chain().focus().deleteTable().run(); setShowTableMenu(false); }}
            >
              <Trash2 className="h-3 w-3" /> Delete table
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
