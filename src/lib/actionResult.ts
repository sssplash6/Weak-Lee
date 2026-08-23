// How a server action reports a refusal the user can do something about.
//
// Next strips the message off anything THROWN out of a server action in
// production — the client gets a generic string and a digest, and the reason
// only exists in the server log. That's the right default for a bug, and
// exactly wrong for "you've already submitted this period": the person needs
// to read it. So expected refusals are RETURNED, and only genuine faults are
// thrown, where the error boundary belongs.

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * An expected, user-facing refusal: failed validation, a closed window, a
 * permission the caller doesn't hold. Anything else is a fault.
 */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

/**
 * Run an action body, turning ActionError into a returned result and letting
 * everything else through to the error boundary. Lets an action validate with
 * plain `throw new ActionError(...)` at whatever depth it likes without
 * threading a result type back up by hand.
 */
export async function actionResult(
  body: () => Promise<void>,
): Promise<ActionResult> {
  try {
    await body();
    return { ok: true };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    throw e;
  }
}
