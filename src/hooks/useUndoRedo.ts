
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { UseFormReturn } from 'react-hook-form';
import type { DraftoProject } from '@/lib/schema';
import { isEqual } from 'lodash-es';

// Using lodash-es for deep equality check as it's tree-shakable.
// If not available, a simple JSON.stringify comparison can be a fallback,
// but it's less reliable for complex objects.

export function useUndoRedo(form: UseFormReturn<DraftoProject>) {
  const { watch, reset } = form;
  const [history, setHistory] = useState<DraftoProject[]>([form.getValues()]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isUndoRedoRef = useRef(false);
  
  const watchedValues = watch();

  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    const currentValues = form.getValues();
    const lastStateInHistory = history[currentIndex];

    // Using a deep equality check is more reliable than JSON.stringify
    if (!isEqual(currentValues, lastStateInHistory)) {
      const newHistory = history.slice(0, currentIndex + 1);
      newHistory.push(currentValues);
      setHistory(newHistory);
      setCurrentIndex(newHistory.length - 1);
    }

  }, [watchedValues]); // This depends on watchedValues to trigger on change

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const undo = useCallback(() => {
    if (canUndo) {
      isUndoRedoRef.current = true;
      const newIndex = currentIndex - 1;
      reset(history[newIndex]);
      setCurrentIndex(newIndex);
    }
  }, [canUndo, currentIndex, history, reset]);

  const redo = useCallback(() => {
    if (canRedo) {
      isUndoRedoRef.current = true;
      const newIndex = currentIndex + 1;
      reset(history[newIndex]);
      setCurrentIndex(newIndex);
    }
  }, [canRedo, currentIndex, history, reset]);

  return { undo, redo, canUndo, canRedo };
}
