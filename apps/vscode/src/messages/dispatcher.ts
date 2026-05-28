import { log } from '../output';
import { validateIncoming } from './validate';
import type { KnownIncomingMessage } from './types';

type HandlerMap = {
  [T in KnownIncomingMessage['type']]?: (
    msg: Extract<KnownIncomingMessage, { type: T }>,
  ) => void;
};

/**
 * Routes validated incoming messages to registered handlers.
 *
 * Invalid or unknown messages are dropped silently. Missing handlers for
 * valid messages are also silently ignored. Handler exceptions are caught,
 * logged, and never propagated through the message boundary.
 */
export class Dispatcher {
  constructor(private readonly handlers: HandlerMap) {}

  dispatch(raw: unknown): void {
    const msg = validateIncoming(raw);
    if (msg === null) return;

    const handler = this.handlers[msg.type] as
      | ((m: KnownIncomingMessage) => void)
      | undefined;
    if (!handler) return;

    try {
      handler(msg);
    } catch (err) {
      const detail = err instanceof Error ? err.stack ?? err.message : String(err);
      log(`message handler for ${msg.type} threw: ${detail}`);
    }
  }
}
