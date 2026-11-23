// A last line of defence for what B-Side writes to Orca's plugin log: whatever a message holds, a
// bearer token, a JWT, a URL's query (download addresses carry a credential there), a token-like
// form field or any long opaque string (Microsoft's refresh tokens) comes out as [redacted].
// The code never puts a token in a message; this catches a mistake.
export function redact(text) {
  return String(text ?? '')
    .replace(/(bearer\s+)[^\s"',;]+/gi, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]*)?/g, '[redacted]')
    .replace(/\b((?:https?|cloud):\/\/[^\s?#"']+)[?#][^\s"']*/gi, '$1?[redacted]')
    .replace(/\b(access_token|refresh_token|id_token|device_code|client_secret|code|tempauth|token|sig)=[^&\s"']+/gi, '$1=[redacted]')
    .replace(/[A-Za-z0-9!*$._~+/=-]{60,}/g, '[redacted]')
}
