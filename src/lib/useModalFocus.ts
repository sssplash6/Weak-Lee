"use client";

import { useEffect, type RefObject } from "react";

// What counts as reachable by Tab. Deliberately narrow — anything exotic can
// opt in with an explicit tabindex.
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keyboard containment for a modal dialog. Three things a visually-modal
 * overlay doesn't get for free: focus moves into it when it opens, Tab cycles
 * inside it instead of walking off into the page behind (which stays visible
 * but unreachable by mouse, so a keyboard user ends up typing into controls
 * they can't see), and whatever opened it gets focus back on close.
 *
 * Pair with `useDismissible` or an Escape handler — this hook only manages
 * focus, leaving scroll locking and close behaviour to the component.
 *
 * The trigger must stay mounted while the dialog is open for focus to be
 * restorable; a component that swaps its button out for the dialog gets the
 * trap but lands focus on the body when it closes.
 */
export function useModalFocus(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement as HTMLElement | null;

    // Hidden controls (a collapsed section, a closed dropdown) are in the DOM
    // but not tabbable, so they're filtered out every time rather than cached.
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      );

    if (!node.contains(document.activeElement)) {
      const first = focusables()[0];
      if (first) {
        first.focus();
      } else {
        // Nothing to focus (a message-only dialog) — hold focus on the box
        // itself so it's still announced and Escape still reaches it.
        node.tabIndex = -1;
        node.focus();
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Only if it's still on the page — a dialog that deleted the row it was
      // opened from has nowhere to put focus back.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, ref]);
}
