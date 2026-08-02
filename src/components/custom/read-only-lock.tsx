import { useEffect, useRef, type ReactNode } from 'react';

// Elements that must keep working while locked: tab/section navigation, view
// toggles, resize handles, disclosure/accordion triggers, links, and anything
// explicitly opted in. Nav helper components mark themselves with `data-ro-nav`.
const NAV_SELECTOR =
  '[data-ro-nav], [data-ro-allow], [role="tab"], [role="tablist"], [role="separator"], [aria-expanded], a[href]';

// Interactive controls whose activation mutates the document.
const MUTATION_CONTROL =
  'button, select, [role="checkbox"], [role="switch"], [role="radio"], [role="combobox"], input[type="checkbox"], input[type="radio"]';

// Text-editing surfaces: clicks are allowed (so the user can place the caret,
// select and copy) — actual edits are stopped by the beforeinput handler.
const TEXT_SURFACE =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable]';

/**
 * Locks editing of everything inside it without disabling or blurring anything,
 * so the user can still read, select, copy, scroll, and navigate (switch tabs /
 * nav items / views). Used for the read-only (lapsed-subscription) state, and it
 * behaves identically for the SC and HC (WP) interfaces because it wraps both.
 *
 * Edits are blocked at the capture phase before React/Radix/tiptap handlers run:
 *   • beforeinput / paste / cut / drop  → all text mutation (native + tiptap)
 *   • click / keydown on toggles/selects/buttons (except navigation) → no changes
 * Tiptap editors are additionally set non-editable via BadhiyaBox.
 */
export function ReadOnlyLock({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;

    const isNav = (node: Element | null) => !!node && !!node.closest(NAV_SELECTOR);

    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(TEXT_SURFACE)) return; // allow caret/selection in text
      const control = target.closest(MUTATION_CONTROL) as HTMLElement | null;
      if (!control || isNav(control)) return; // plain content or navigation → allow
      stop(e);
    };

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return; // toggle keys only
      const target = e.target as HTMLElement;
      const control = target.closest(
        '[role="checkbox"], [role="switch"], [role="radio"], input[type="checkbox"], input[type="radio"]',
      ) as HTMLElement | null;
      if (control && !isNav(control)) stop(e);
    };

    const onBeforeInput = (e: Event) => e.preventDefault();

    el.addEventListener('beforeinput', onBeforeInput, true);
    el.addEventListener('paste', stop, true);
    el.addEventListener('cut', stop, true);
    el.addEventListener('drop', stop, true);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('keydown', onKeyDownCapture, true);

    return () => {
      el.removeEventListener('beforeinput', onBeforeInput, true);
      el.removeEventListener('paste', stop, true);
      el.removeEventListener('cut', stop, true);
      el.removeEventListener('drop', stop, true);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('keydown', onKeyDownCapture, true);
    };
  }, [active]);

  return (
    <div ref={ref} aria-readonly={active || undefined}>
      {children}
    </div>
  );
}
