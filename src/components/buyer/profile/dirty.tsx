"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/Modal";

/**
 * Tracks whether the form on screen has unsaved changes, so that closing the tab, reloading or moving to another section does not
 * silently throw the changes away. Forms report their state; the section links ask `confirmLeave()`, which answers (true = go ahead)
 * after the buyer chose in the site's own dialog. Closing or reloading the tab still uses the browser's warning (a page cannot style it).
 */
interface DirtyApi {
  dirty: boolean;
  setDirty: (value: boolean) => void;
  confirmLeave: () => Promise<boolean>;
}

const Ctx = createContext<DirtyApi>({ dirty: false, setDirty: () => undefined, confirmLeave: () => Promise.resolve(true) });

export function DirtyProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirtyState] = useState(false);
  const [ask, setAsk] = useState<{ resolve: (leave: boolean) => void } | null>(null);
  const ref = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    ref.current = value;
    setDirtyState(value);
  }, []);
  const confirmLeave = useCallback(
    () =>
      !ref.current
        ? Promise.resolve(true)
        : new Promise<boolean>((resolve) =>
            setAsk((previous) => {
              previous?.resolve(false);
              return { resolve };
            }),
          ),
    [],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!ref.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const value = useMemo(() => ({ dirty, setDirty, confirmLeave }), [dirty, setDirty, confirmLeave]);
  const answer = (leave: boolean) => {
    ask?.resolve(leave);
    setAsk(null);
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {ask && <ConfirmDialog title="Leave without saving?" message="You have unsaved changes. If you leave now they will be lost." confirmLabel="Leave without saving" cancelLabel="Keep editing" tone="danger" onConfirm={() => answer(true)} onCancel={() => answer(false)} />}
    </Ctx.Provider>
  );
}

export const useDirty = () => useContext(Ctx);
