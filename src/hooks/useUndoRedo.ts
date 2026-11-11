"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { UseFormReturn } from 'react-hook-form';
import type { DraftoProject } from '@/lib/schema';
import { isEqual, cloneDeepWith } from 'lodash-es';

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 800;

function cloneProjectState(state: DraftoProject): DraftoProject {
  return cloneDeepWith(state, (val) => {
    if (typeof File !== 'undefined' && val instanceof File) return val;
    if (typeof Blob !== 'undefined' && val instanceof Blob) return val;
    return undefined;
  });
}

export function useUndoRedo(form: UseFormReturn<DraftoProject>) {
  const { watch, reset } = form;
  const historyRef = useRef<DraftoProject[]>([cloneProjectState(form.getValues())]);
  const indexRef = useRef<number>(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isUndoRedoRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncFlags = useCallback(() => {
    setCanUndo(indexRef.current > 0);
    setCanRedo(indexRef.current < historyRef.current.length - 1);
  }, []);

  useEffect(() => {
    const subscription = watch(() => {
      if (isUndoRedoRef.current) {
        isUndoRedoRef.current = false;
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        const currentValues = form.getValues();
        const lastStateInHistory = historyRef.current[indexRef.current];

        if (!isEqual(currentValues, lastStateInHistory)) {
          const nextHistory = historyRef.current.slice(0, indexRef.current + 1);
          nextHistory.push(cloneProjectState(currentValues));
          if (nextHistory.length > MAX_HISTORY) {
            nextHistory.shift();
          }
          historyRef.current = nextHistory;
          indexRef.current = nextHistory.length - 1;
          syncFlags();
        }
      }, DEBOUNCE_MS);
    });

    const handleNewProject = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      historyRef.current = [cloneProjectState(form.getValues())];
      indexRef.current = 0;
      syncFlags();
    };
    window.addEventListener('drafto-new-project', handleNewProject);

    return () => {
      subscription.unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('drafto-new-project', handleNewProject);
    };
  }, [watch, form, syncFlags]);

  const undo = useCallback(() => {
    if (indexRef.current > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      isUndoRedoRef.current = true;
      const newIndex = indexRef.current - 1;
      indexRef.current = newIndex;
      reset(cloneProjectState(historyRef.current[newIndex]), { keepDirty: newIndex > 0 });
      syncFlags();
    }
  }, [reset, syncFlags]);

  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      if (timerRef.current) clearTimeout(timerRef.current);
      isUndoRedoRef.current = true;
      const newIndex = indexRef.current + 1;
      indexRef.current = newIndex;
      reset(cloneProjectState(historyRef.current[newIndex]), { keepDirty: true });
      syncFlags();
    }
  }, [reset, syncFlags]);

  return { undo, redo, canUndo, canRedo };
}
