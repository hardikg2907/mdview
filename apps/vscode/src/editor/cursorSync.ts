/**
 * Breaks the editor <-> preview cursor-sync feedback loop.
 *
 * When a heading click in the preview moves the editor cursor, VS Code fires a
 * selection-change event that would otherwise be echoed back to the preview as
 * a cursor-changed message, causing a jitter loop. After applying an inbound
 * position we open a short suppression window during which the next outbound
 * selection event is skipped.
 *
 * The clock is injectable so the window is testable without real timers.
 */
export class LoopGuard {
  private suppressUntil = 0;

  constructor(
    private readonly windowMs: number = 250,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Open the suppression window — call right after applying an inbound position. */
  suppressOutbound(): void {
    this.suppressUntil = this.now() + this.windowMs;
  }

  /** True when an outbound selection event should be skipped. */
  shouldSkipOutbound(): boolean {
    return this.now() < this.suppressUntil;
  }
}
