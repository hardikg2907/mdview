// Host header allow-list — the DNS-rebinding boundary.
//
// Binding 127.0.0.1 keeps other machines out, but it does not keep out a page
// the user is already browsing. In a rebinding attack evil.com resolves to the
// attacker's IP long enough to load their page, then re-resolves to 127.0.0.1;
// the page is still same-origin with evil.com, so it can now read every file
// mdview serves. What gives it away is the Host header: the browser sends the
// name the page was loaded from, not ours.
//
// So the allow-list holds only names that cannot be made to mean anything but
// this machine. `localhost` and `*.localhost` are reserved to loopback by
// RFC 6761 and hardcoded by browsers, so an attacker cannot point one at their
// own address.
//
// The port is deliberately NOT checked. A name on this list cannot resolve off
// this machine, so the port adds no security, and requiring it would break
// running behind a local proxy (portless, Caddy) that forwards the original
// Host.

const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

// RFC 1035 caps a full domain name at 253 characters; anything longer is not a
// hostname and there is no reason to run a regex over it.
const MAX_HOST_LEN = 253;

/** Strip the port from a Host header value, keeping IPv6 brackets intact. */
function hostOnly(value: string): string {
  const h = value.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end === -1 ? h : h.slice(0, end + 1);
  }
  // A bare IPv6 literal in Host is malformed (brackets are required) but cheap
  // to accept: more than one colon means it cannot be a host:port pair.
  if (h.indexOf(':') !== h.lastIndexOf(':')) return h;
  const colon = h.indexOf(':');
  return colon === -1 ? h : h.slice(0, colon);
}

export function isAllowedHost(value: string | undefined): boolean {
  // No Host at all (HTTP/1.0) is not something a browser does — fail closed.
  if (!value || value.length > MAX_HOST_LEN) return false;
  // Printable ASCII only: rejects control characters, CR/LF and spaces before
  // the value reaches any comparison.
  if (!/^[\x21-\x7e]+$/.test(value)) return false;
  const host = hostOnly(value);
  return LOOPBACK_NAMES.has(host) || /^[a-z0-9][a-z0-9.-]*\.localhost$/.test(host);
}
