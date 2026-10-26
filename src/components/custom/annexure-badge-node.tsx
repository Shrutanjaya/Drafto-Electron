import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useFormContext } from 'react-hook-form';
import type { DraftoProject } from '@/lib/schema';
import { annexureRowsOf } from '@/lib/wp/facts-mode';
import { annexPrefixFor } from '@/lib/annex-prefix';
import { annexureNumbering } from '@/lib/annexure-numbering';
import { Bookmark, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function resolveAnnexureBadgeInfo(project: Partial<DraftoProject>, annexureId: string): {
  label: string;
  details: string;
  exists: boolean;
} {
  const activeRows = annexureRowsOf(project);
  const courtType = project.courtType || 'SLP';
  const prefix = annexPrefixFor(courtType);
  const numberMap = annexureNumbering(activeRows, courtType);

  let foundAnnex: any = null;
  for (const row of activeRows) {
    for (const a of row.annexures || []) {
      if (a.id === annexureId) {
        foundAnnex = a;
        break;
      }
    }
    if (foundAnnex) break;
  }

  if (!foundAnnex) {
    return {
      label: 'Annexure [Removed]',
      details: 'The referenced annexure was deleted from the List of Dates / Facts.',
      exists: false,
    };
  }

  const num = numberMap.get(annexureId);
  const label = num !== undefined ? `Annexure ${prefix}-${num}` : `Annexure ${prefix}-?`;
  const parts: string[] = [];
  if (foundAnnex.particulars?.trim()) parts.push(foundAnnex.particulars.trim());
  if (foundAnnex.date?.trim()) parts.push(`dated ${foundAnnex.date.trim()}`);
  const details = parts.join(' ') || 'No particulars';

  return { label, details, exists: true };
}

const AnnexureBadgeComponent: React.FC<NodeViewProps> = ({ node, selected }) => {
  const annexureId = node.attrs.annexureId || '';
  const form = useFormContext<DraftoProject>();
  const proj = form?.getValues() || {};

  const info = resolveAnnexureBadgeInfo(proj, annexureId);
  const displayLabel = info.exists ? info.label : (node.attrs.fallbackLabel || info.label);

  return (
    <NodeViewWrapper as="span" className="inline-block align-baseline mx-0.5 select-none not-prose">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold tracking-tight border cursor-pointer transition-colors',
                info.exists
                  ? 'bg-primary/10 text-primary border-primary/25 hover:bg-primary/15 dark:bg-primary/20 dark:border-primary/30'
                  : 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/15',
                selected && 'ring-2 ring-ring ring-offset-1'
              )}
            >
              {info.exists ? (
                <Bookmark className="h-3 w-3 shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
              )}
              <span>{displayLabel}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-xs">
            <div className="font-semibold">{info.label}</div>
            <div className="text-muted-foreground text-[11px] mt-0.5">{info.details}</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </NodeViewWrapper>
  );
};

export const AnnexureBadge = Node.create({
  name: 'annexureBadge',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      annexureId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-annexure-id') || '',
        renderHTML: (attrs) => ({
          'data-annexure-id': attrs.annexureId,
        }),
      },
      fallbackLabel: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-fallback-label') || el.textContent || '',
        renderHTML: (attrs) => ({
          'data-fallback-label': attrs.fallbackLabel,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="annexure-badge"]',
      },
      {
        tag: 'span[data-annexure-id]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-type': 'annexure-badge' }, HTMLAttributes),
      node.attrs.fallbackLabel || 'Annexure',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AnnexureBadgeComponent);
  },
});
