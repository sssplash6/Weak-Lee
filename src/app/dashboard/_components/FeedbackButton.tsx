"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useModalFocus } from "@/lib/useModalFocus";
import { submitFeedback } from "../actions";
import { ChatIcon } from "./icons";

const FEEDBACK_EMAIL = "tech@freshman.academy";

/**
 * A "Share feedback" button that opens a small modal form. On submit the message
 * is saved (server-side) for the team at tech@freshman.academy to follow up.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, boxRef);

  // This component swaps its trigger out for the modal, so by the time the
  // modal closes the button the hook memorised is gone. Hand focus back to the
  // fresh one instead of dropping the keyboard user at the top of the page.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const canSend = message.trim().length > 0;

  function close() {
    setOpen(false);
    setMessage("");
    setSent(false);
    setError(null);
  }

  // Close on Escape and lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) close();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isPending]);

  function submit() {
    if (!canSend) return;
    setError(null);
    startTransition(async () => {
      const result = await submitFeedback(message);
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  }

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Share feedback"
        className="group fixed bottom-6 right-6 z-40 inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-2 text-sm font-medium text-muted-fg shadow-md transition hover:text-ink"
      >
        <ChatIcon className="h-4 w-4 shrink-0" />
        <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-[8rem] group-hover:opacity-100">
          Share feedback
        </span>
      </button>
    );
  }

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={() => !isPending && close()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-heading"
    >
      <div
        ref={boxRef}
        className="modal-in w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <div className="text-center">
            <h2 id="feedback-heading" className="text-base font-bold text-ink">
              Thanks for the feedback!
            </h2>
            <p className="mt-1 text-sm text-muted-fg">
              It&rsquo;s on its way to the {FEEDBACK_EMAIL} team.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-5 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 id="feedback-heading" className="text-base font-bold text-ink">
              Share feedback
            </h2>
            <p className="mt-1 text-sm text-muted-fg">
              Found a bug or have an idea? It goes straight to {FEEDBACK_EMAIL}.
            </p>

            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="What's on your mind?"
              className="mt-4 w-full resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
            />

            {error && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={close}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-fg transition hover:bg-line"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !canSend}
                onClick={submit}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
