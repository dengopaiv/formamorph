// Local servers hand out a base URL, not a chat-completions URL: LM Studio's "Reachable at" chip copies
// the bare origin, and the OpenAI-SDK convention everyone else documents stops at `/v1`. We send to a full
// URL, so we fill in the rest — append-only, and only for the two shapes that are unambiguous.

/** Path suffix the app actually POSTs to. */
const CHAT_PATH = '/chat/completions';

/**
 * Complete a user-entered endpoint into a full chat-completions URL.
 *
 * Only a bare origin (no path) or a bare `/v1` gets completed. Anything else — an already-complete URL, a
 * gateway served under its own prefix, a non-standard path — is returned untouched, since guessing there
 * would break a working setup. Unparseable input is returned as-is for the caller's error handling.
 */
export function normalizeEndpointUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return trimmed;

  const path = url.pathname.replace(/\/+$/, '');
  if (path === '') url.pathname = `/v1${CHAT_PATH}`;
  else if (path === '/v1') url.pathname = `/v1${CHAT_PATH}`;
  else return trimmed;

  return url.toString();
}

/** True when normalization would change the URL — drives the "we'll actually call…" hint in Settings. */
export function endpointUrlWasCompleted(raw: string): boolean {
  const normalized = normalizeEndpointUrl(raw);
  return normalized !== raw.trim() && normalized !== '';
}

// Everything the app sends a text endpoint is play text: the world, the characters, whatever just
// happened in the scene. Over `http://` that crosses the internet as readable bytes — every hop between
// the machine and the host sees it, and so does anyone sharing the coffee-shop wifi. The app can't fix
// that transport, but it can refuse to let it happen silently, which is what the two exports below are for.

/**
 * Hosts reached over a link the player already controls, where plain HTTP never leaves that link.
 *
 * Loopback and the RFC1918 ranges are the obvious ones. `100.64/10` is here because that is the CGNAT
 * block Tailscale hands out, and a Tailscale address is WireGuard-encrypted underneath regardless of the
 * `http://` in front of it — warning about those would train the player to ignore the warning that matters.
 */
function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') ||                       // mDNS — a name that only resolves on the LAN
    host === '::1' || /^127\./.test(host) ||         // loopback
    /^10\./.test(host) ||                            // RFC1918
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) || /^fe80:/.test(host) ||  // link-local
    /^f[cd]/.test(host) ||                           // IPv6 unique-local, fc00::/7
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)  // CGNAT, i.e. Tailscale
  );
}

/**
 * True when this endpoint would send its prompts across the open internet in the clear.
 *
 * Deliberately quiet in two cases. Input that doesn't parse yet returns false, because the field is
 * validated on every keystroke and half a URL is not yet a mistake. And a private or tunnelled host
 * returns false even on `http://`, per {@link isLocalHost} — the danger is the public hop, not the scheme.
 */
export function endpointSendsInTheClear(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return false;
  return !isLocalHost(url.hostname);
}
