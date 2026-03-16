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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useContext, useState, useRef, useEffect } from 'react';
import { EditorContext } from './editor-provider';

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
    const [activeHighlightColor, setActiveHighlightColor] = useState('#fef08a');
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowHighlightPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

  if (!editor) {
    return null
  }

  const applyHighlight = (color: string) => {
    if (color === 'none') {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().toggleHighlight({ color }).run();
      setActiveHighlightColor(color);
    }
    setShowHighlightPicker(false);
  };

  const isHighlightActive = editor.isActive('highlight');

  const toggleBold = () => editor.chain().focus().toggleBold().run()
  const toggleItalic = () => editor.chain().focus().toggleItalic().run()
  const toggleUnderline = () => editor.chain().focus().toggleUnderline().run()
  const toggleBulletList = () => editor.chain().focus().toggleBulletList().run()
  const toggleOrderedList = () => editor.chain().focus().toggleOrderedList().run()
  
  return (
    <div className="flex flex-wrap items-center gap-0.5 p-0.5 border border-input rounded-md bg-muted/50">
      <Button variant="ghost" size="icon" onClick={toggleBold} className={cn("h-6 w-6 p-1", editor.isActive('bold') ? 'bg-accent' : '')}><Bold /></Button>
      <Button variant="ghost" size="icon" onClick={toggleItalic} className={cn("h-6 w-6 p-1", editor.isActive('italic') ? 'bg-accent' : '')}><Italic /></Button>
      <Button variant="ghost" size="icon" onClick={toggleUnderline} className={cn("h-6 w-6 p-1", editor.isActive('underline') ? 'bg-accent' : '')}><UnderlineIcon /></Button>
      <Button variant="ghost" size="icon" onClick={toggleBulletList} className={cn("h-6 w-6 p-1", editor.isActive('bulletList') ? 'bg-accent' : '')}><List /></Button>
      <Button variant="ghost" size="icon" onClick={toggleOrderedList} className={cn("h-6 w-6 p-1", editor.isActive('orderedList') ? 'bg-accent' : '')}><ListOrdered /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={cn("h-6 w-6 p-1", editor.isActive('blockquote') ? 'bg-accent' : '')}><Quote /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={cn("h-6 w-6 p-1", editor.isActive({ textAlign: 'left' }) ? 'bg-accent' : '')}><AlignLeft /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={cn("h-6 w-6 p-1", editor.isActive({ textAlign: 'center' }) ? 'bg-accent' : '')}><AlignCenter /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={cn("h-6 w-6 p-1", editor.isActive({ textAlign: 'right' }) ? 'bg-accent' : '')}><AlignRight /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={cn("h-6 w-6 p-1", editor.isActive({ textAlign: 'justify' }) ? 'bg-accent' : '')}><AlignJustify /></Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className="h-6 w-6 p-1"><Eraser /></Button>
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
    </div>
  )
}
