"use client";

import { useEffect, type RefObject } from "react";

/**
 * Close a popover/panel on Escape or outside mousedown. Listeners attach only
 * while the panel is open (replaces the per-component outside-click effects).
 *
 * Escape is handled in the capture phase and stopped, so a dropdown inside a
 * modal closes without also closing the modal behind it.
 */
export function useDismissible(
  open: boolean,
  onClose: () => void,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose, ref]);
}
