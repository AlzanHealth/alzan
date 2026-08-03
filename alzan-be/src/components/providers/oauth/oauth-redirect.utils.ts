const NATIVE_OAUTH_REDIRECTS = new Set(['alzan://oauth/success', 'alzan://oauth/error']);

/**
 * Accept only redirects owned by Alzan. Native clients use the registered
 * deep links; web clients may return to any route on the configured frontend
 * origin so provider-specific callback pages continue to work.
 */
export function isAllowedOAuthRedirectUri(redirectUri: string, frontendBaseUrl: string): boolean {
  if (NATIVE_OAUTH_REDIRECTS.has(redirectUri)) return true;
  if (!redirectUri) return false;

  let redirect: URL;
  let frontend: URL;
  try {
    redirect = new URL(redirectUri);
    frontend = new URL(frontendBaseUrl);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(redirect.protocol) || !['http:', 'https:'].includes(frontend.protocol)) {
    return false;
  }

  return redirect.origin === frontend.origin && !redirect.username && !redirect.password;
}
