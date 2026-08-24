"use client";

import { useState, type ReactNode } from "react";
import { SubmissionView, type SubmissionViewModel } from "./SubmissionView";

/**
 * A filed request that the admins haven't reached yet: the read-only summary
 * by default, with the filing form one click away.
 *
 * Editing is an option rather than the default state — most visits to this
 * page are to check where the request got to, not to change it, and swapping
 * the summary out for a form would cost the status banner and the timeline
 * that answer that question. The form arrives as a prop rather than being
 * fetched on click — it's a client component, so the RSC payload already
 * carries its module reference and its props, and opening it costs no round
 * trip even though nothing of it is in the server-rendered HTML.
 */
export function EditableSubmission({
  heading,
  view,
  form,
}: {
  heading: string;
  view: SubmissionViewModel;
  form: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div>
        {form}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-fg transition hover:bg-line"
          >
            Cancel editing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SubmissionView heading={heading} view={view} />
      <div className="mt-2 flex items-center justify-end gap-3">
        <p className="text-xs text-muted-fg">
          Spotted a mistake? You can change it until an admin reviews it.
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-canvas"
        >
          Edit request
        </button>
      </div>
    </div>
  );
}
