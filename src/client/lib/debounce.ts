/**
 * Trailing-edge debounce: calls to the returned function are coalesced so
 * `fn` runs once, `ms` milliseconds after the last call. Each call's
 * arguments overwrite the pending ones, so `fn` always sees the most
 * recent invocation.
 *
 * The returned wrapper exposes:
 *  - `cancel()` — drop any pending invocation.
 *  - `flush()`  — invoke immediately with the last pending args (no-op
 *                  if nothing is pending).
 */
export interface Debounced<F extends (...args: never[]) => void> {
  (...args: Parameters<F>): void;
  cancel: () => void;
  flush: () => void;
}

export function debounce<F extends (...args: never[]) => void>(
  fn: F,
  ms: number,
): Debounced<F> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<F> | null = null;

  const wrapped = ((...args: Parameters<F>) => {
    pendingArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const callArgs = pendingArgs;
      pendingArgs = null;
      if (callArgs) fn(...callArgs);
    }, ms);
  }) as Debounced<F>;

  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingArgs = null;
  };

  wrapped.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const callArgs = pendingArgs;
    pendingArgs = null;
    if (callArgs) fn(...callArgs);
  };

  return wrapped;
}
