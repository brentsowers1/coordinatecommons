// Login-prompt visibility predicate (design.md: "LoginPromptBanner",
// Property 17).
//
// Rendered by `MapPage` below `MapView` whenever `useSession` is `null`
// (Requirement 9.2), and never when it is non-null (Requirement 9.3).

/**
 * Pure function: should the login-prompt banner be shown right now?
 *
 * @param {{ username: string, accessToken: string, expiresAt: number } | null} session
 *   the current Session, or `null` for an unauthenticated visitor.
 * @returns {boolean} `true` if and only if `session === null`.
 */
export function shouldShowLoginPrompt(session) {
  return session === null;
}
