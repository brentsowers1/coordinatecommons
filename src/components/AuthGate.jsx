// AuthGate (design.md Component Tree: "AuthGate --> MapPage",
// "AuthGate --> LoginPage"; "AuthGate: Reads the shared useSession hook and
// chooses between MapPage (default, per Requirement 1.1) and LoginPage.").
//
// Navigation-state design choice (documented here since design.md leaves
// the exact mechanism implicit -- see also the comment atop MapPage.js):
//
// design.md's Component Tree says AuthGate "chooses between MapPage
// (default) and LoginPage", which reads as a decision independent of
// useSession alone -- otherwise there would be no way for Requirement 1.2
// ("WHEN an unauthenticated user selects the login control, THE
// Coordinate_Commons SHALL display the Login_Page") to ever show
// Login_Page for a user who is *not yet* authenticated (useSession is
// already null before AND after they ask to see Login_Page; session state
// alone can't distinguish those two moments). There is no router or other
// navigation-state concept anywhere else in this codebase, and design.md
// doesn't introduce one, so the minimal solution consistent with the
// project's existing lightweight, no-extra-dependency approach is a single
// local boolean owned by AuthGate itself: `showLoginPage`, defaulting to
// `false` (Requirement 1.1: Map_View is the default view).
//
//   - `showLoginPage === false` (default): render MapPage. This covers
//     BOTH an unauthenticated visitor who hasn't asked to log in yet, and
//     an authenticated user -- Map_View is what both should see day to
//     day; nothing about being signed in should ever force Login_Page to
//     appear.
//   - `showLoginPage === true`: render LoginPage. Only reachable by
//     MapPage's login control invoking `onRequestLogin` (passed down as
//     `() => setShowLoginPage(true)`), i.e. only from a deliberate user
//     action (Requirement 1.2), never automatically.
//   - Once `useSession` becomes non-null (a successful login --
//     LoginPage.js's own module comment describes "navigates back to
//     Map_View on success" as being AuthGate's responsibility, not
//     LoginPage's own, precisely because LoginPage has no navigation
//     concept to call into), a `useEffect` watching `session` flips
//     `showLoginPage` back to `false` so AuthGate returns to MapPage
//     post-login (Requirements 1.6/1.7). This is a one-way, session-driven
//     reset: nothing here forces `showLoginPage` back to `true` when the
//     session later clears (logout/expiry) -- Requirement 1.1 already
//     covers that case since `showLoginPage` will already be `false` at
//     that point in the normal flow (a signed-in user was on MapPage, not
//     LoginPage, to begin with).
//
// This keeps AuthGate as the single owner of "which top-level page is
// showing" (matching its name and its role in the Component Tree), while
// MapPage/LoginPage themselves stay free of any navigation concept beyond
// the callback props AuthGate hands them.
//
// TopNav: AuthGate also renders `TopNav`, above whichever of
// MapPage/LoginPage it currently renders, so the nav is visible on every
// page. TopNav is wired to the exact same `showLoginPage` state AuthGate
// already owns -- `onNavigateHome={() => setShowLoginPage(false)}` (the
// "Coordinate Commons" home control) and `onRequestLogin={() =>
// setShowLoginPage(true)}` (the "Log in" control, replacing MapPage's
// former inline login control). Logout itself needs no callback from
// AuthGate -- TopNav handles it internally via `handleLogout()`.

import React from 'react';
import { useSession } from '../state/sharedState';
import { TopNav } from './TopNav';
import { MapPage } from './MapPage';
import { LoginPage } from './LoginPage';

export function AuthGate() {
  const [session] = useSession();
  const [showLoginPage, setShowLoginPage] = React.useState(false);

  // Requirements 1.6/1.7: once authentication succeeds (session goes from
  // null to non-null), automatically return to MapPage.
  React.useEffect(() => {
    if (session) {
      setShowLoginPage(false);
    }
  }, [session]);

  return (
    <>
      <TopNav
        onNavigateHome={() => setShowLoginPage(false)}
        onRequestLogin={() => setShowLoginPage(true)}
      />
      {showLoginPage ? <LoginPage /> : <MapPage />}
    </>
  );
}
