// Discriminated union types for the postMessage protocol between the extension
// and the SPA running inside the webview iframe.

// ---------------------------------------------------------------------------
// Incoming — SPA → Extension (untrusted; always run through validateIncoming)
// ---------------------------------------------------------------------------

export interface MsgReady {
  type: 'mdview/ready';
}

export interface MsgInternalLinkClicked {
  type: 'mdview/internal-link-clicked';
  relPath: string;
  fromFile: string;
}

export interface MsgHeadingClicked {
  type: 'mdview/heading-clicked';
  line: number;
  file: string;
}

export interface MsgError {
  type: 'mdview/error';
  message: string;
}

export type KnownIncomingMessage =
  | MsgReady
  | MsgInternalLinkClicked
  | MsgHeadingClicked
  | MsgError;

// ---------------------------------------------------------------------------
// Outgoing — Extension → SPA (trusted; extension constructs these)
// ---------------------------------------------------------------------------

export interface MsgInit {
  type: 'mdview/init';
  webviewPort: number;
}

export interface MsgSetFile {
  type: 'mdview/set-file';
  relPath: string;
}

export interface MsgCursorChanged {
  type: 'mdview/cursor-changed';
  line: number;
  file: string;
}

export interface MsgPaletteChanged {
  type: 'mdview/palette-changed';
  palette: string;
}

export type OutgoingMessage =
  | MsgInit
  | MsgSetFile
  | MsgCursorChanged
  | MsgPaletteChanged;

// ---------------------------------------------------------------------------
// Type-narrowing helpers
// ---------------------------------------------------------------------------

export function isIncomingType(type: unknown): type is KnownIncomingMessage['type'] {
  return (
    type === 'mdview/ready' ||
    type === 'mdview/internal-link-clicked' ||
    type === 'mdview/heading-clicked' ||
    type === 'mdview/error'
  );
}
