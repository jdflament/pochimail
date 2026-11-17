/** Content-Security-Policy for the renderer. Production is strict: no remote origin, no inline script, no network (data arrives over the MessagePort). */
export const buildCsp = (options: { dev: boolean }): string => {
  const directives: Record<string, string[]> = {
    "default-src": ["'none'"],
    "script-src": options.dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    "style-src": options.dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    "font-src": ["'self'"],
    "img-src": ["'self'", "data:"],
    "connect-src": options.dev ? ["'self'", "ws://localhost:*", "http://localhost:*"] : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
    "frame-src": ["'none'"],
    "worker-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
};
