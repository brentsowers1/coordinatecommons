// AuthGate (design.md Component Tree: "AuthGate --> MapPage",
// "AuthGate --> LoginPage", "AuthGate --> SignUpPage"; "AuthGate: Reads the
// shared useSession hook and chooses between MapPage (default, per
// Requirement 1.1), LoginPage, and SignUpPage.").
//
// Navigation-state design choice (documented here since design.md leaves
// the exact mechanism implicit -- see also the comment atop MapPage.js):
//
// design.md's Component Tree says AuthGate "chooses between" its child
// pages, which reads as a decision independent of useSession alone --
// otherwise there would be no way for Requirement 1.2 ("WHEN an
// unauthenticated user selects the login control, THE Coordinate_Commons
// SHALL display the Login_Page") to ever show Login_Page for a user who is
// *not yet* authenticated (useSession is already null before AND after
// they ask to see Login_Page; session state alone can't distinguish those
// two moments). The same reasoning extends to Sign_Up_Page (Requirement
// 12.1/12.2): useSession is null the entire time a visitor signs up (per
// Requirement 12.7, sign-up+confirmation never sets it), so session state
// alone can't distinguish "showing Login_Page" from "showing Sign_Up_Page"
// either. There is no router or other navigation-state concept anywhere
// else in this codebase, and design.md doesn't introduce one, so the
// minimal solution consistent with the project's existing lightweight,
// no-extra-dependency approach is a single local string enum owned by
// AuthGate itself: `currentPage`, one of `'map' | 'login' | 'signup'`,
// defaulting to `'map'` (Requirement 1.1: Map_View is the default view).
// This generalizes the boolean this state used to be (`showLoginPage`)
// to a third value rather than introducing any new state-management
// concept.
//
//   - `currentPage === 'map'` (default): render MapPage. This covers BOTH
//     an unauthenticated visitor who hasn't asked to log in yet, and an
//     authenticated user -- Map_View is what both should see day to day;
//     nothing about being signed in should ever force Login_Page or
//     Sign_Up_Page to appear.
//   - `currentPage === 'login'`: render LoginPage. Reachable from TopNav's
//     "Log in" control invoking `onRequestLogin` (passed down as
//     `() => setCurrentPage('login')`), i.e. only from a deliberate user
//     action (Requirement 1.2), and from LoginPage itself being the
//     destination Sign_Up_Page returns to on successful confirmation (see
//     below).
//   - `currentPage === 'signup'`: render SignUpPage. Only reachable by
//     LoginPage's "Sign up" link invoking `onRequestSignUp` (passed down
//     as `() => setCurrentPage('signup')`), per Requirement 12.1/12.2.
//   - Once `useSession` becomes non-null (a successful login --
//     LoginPage.js's own module comment describes "navigates back to
//     Map_View on success" as being AuthGate's responsibility, not
//     LoginPage's own, precisely because LoginPage has no navigation
//     concept to call into), a `useEffect` watching `session` sets
//     `currentPage` back to `'map'` so AuthGate returns to MapPage
//     post-login (Requirements 1.6/1.7). This is a one-way, session-driven
//     reset: nothing here forces `currentPage` back to `'login'` when the
//     session later clears (logout/expiry) -- Requirement 1.1 already
//     covers that case since `currentPage` will already be `'map'` at that
//     point in the normal flow (a signed-in user was on MapPage, not
//     LoginPage, to begin with).
//   - SignUpPage's `onSignUpComplete` callback (invoked after successful
//     confirmation, Requirement 12.7) sets `currentPage` to `'login'` --
//     NOT `'map'`, and critically, this transition never touches
//     `useSession`. This is a distinct, non-conflicting transition from
//     the useSession-driven `'map'` reset above: successful LOGIN
//     auto-returns home via the session effect; successful
//     SIGN-UP+CONFIRMATION never sets a session, so it can only be
//     navigated by this direct, explicit `setCurrentPage('login')` call --
//     the two never race or override one another because only one of
//     useSession/onSignUpComplete is ever triggered by any given flow.
//
// Sign-up-to-login success message (`loginPageMessage`): `onSignUpComplete`
// now also receives a message string from `SignUpPage` (see that file's
// module comment for why it doesn't render the message itself -- it would
// be unmounted before a user could ever see it). AuthGate is the natural
// place to carry that message across the transition, since it already
// owns navigation between the two pages: `onSignUpComplete` is wired to
// `(message) => { setLoginPageMessage(message); setCurrentPage('login'); }`,
// and `loginPageMessage` is passed down to `LoginPage` as its
// `successMessage` prop.
//
// Lifecycle/clearing: `loginPageMessage` is reset to `null` in the same
// session-driven effect that already resets `currentPage` to `'map'` on a
// successful login (see above). A successful login is the natural point
// at which a stale "you can now log in" message stops being relevant --
// and since that effect already fires exactly when `useSession` goes from
// null to non-null, reusing it avoids introducing a second, separate
// place that has to reason about when the message should disappear. This
// means the message persists across e.g. an unsuccessful login attempt
// (staying visible until dismissed by an actual successful login), but
// never lingers into a *later, unrelated* Sign_Up_Page/Login_Page visit
// unless the user actually completes the sign-up flow again (which would
// simply set a fresh message anyway).
//
// This keeps AuthGate as the single owner of "which top-level page is
// showing" (matching its name and its role in the Component Tree), while
// MapPage/LoginPage/SignUpPage themselves stay free of any navigation
// concept beyond the callback props AuthGate hands them.
//
// TopNav: AuthGate also renders `TopNav`, above whichever page it
// currently renders, so the nav is visible on every page. TopNav is wired
// to the same `currentPage` state AuthGate owns --
// `onNavigateHome={() => setCurrentPage('map')}` (the "Coordinate Commons"
// home control), `onNavigateToMapPage={() => setCurrentPage('map')}` (task
// 24.4: forwarded straight through to `MyPlacesControl`'s identically-
// named prop, called after any My_Places_Control selection per
// Requirement 13.5 -- deliberately the same underlying callback as
// `onNavigateHome`, since both just mean "show MapPage"), and
// `onRequestLogin={() => setCurrentPage('login')}` (the "Log in" control,
// replacing MapPage's former inline login control). Logout itself needs
// no callback from AuthGate -- TopNav handles it internally via
// `handleLogout()`.
//
// Pico.css layout landmarks: AuthGate is effectively the whole page body
// (App renders nothing else), so its output is wrapped to match Pico's
// own documented `<body><header>...</header><main class="container">...
// </main></body>` pattern (see Pico's README/docs "Landmarks & section"
// and "Container" pages) -- both `<header class="container">` (which
// wraps `TopNav`) and `<main class="container">` (which wraps the current
// page, `LoginPage`/`MapPage`) carry Pico's `container` class. This is
// purely presentational: it gives both elements Pico's responsive
// vertical spacing and gives the page content a centered, max-width
// container, with no change to `currentPage`/`useSession` logic or to
// `TopNav`/`MapPage`/`LoginPage`/`SignUpPage` themselves.
//
// `<header>` needs the explicit `container` class (matching `<main>`)
// rather than relying on Pico's class-less semantic containers, because
// this project imports the classed build (`@picocss/pico` resolves to
// `css/pico.min.css` -- see src/index.jsx's import comment); Pico's own
// container docs (picocss.com/docs/container) note that ".container and
// .container-fluid are not available in the class-less version" and that
// semantic (class-less) auto-containers on `<header>`/`<main>`/`<footer>`
// are a separate, unused-here mode. Without this class, `<header>` was
// unconstrained (full viewport width) while `<main>` was constrained to
// Pico's centered, max-width container -- and per Pico's nav docs
// (picocss.com/docs/nav, "Overflow" section), `<nav>` deliberately uses
// `overflow: visible` plus negative margins on its children to align its
// content with whatever container it sits inside (so keyboard
// focus-visible outlines on the links aren't clipped). With `<header>`
// unconstrained, that alignment reference was the bare viewport edge
// instead of the same centered box `<main>` uses, which produced a small
// horizontal overflow (a sliver of the right-most nav link/text got cut
// off, forcing a slight horizontal scroll). Giving `<header>` the same
// `container` class as `<main>` fixes this by making both elements agree
// on the same centered container.

import React from 'react';
import { useSession } from '../state/sharedState';
import { TopNav } from './TopNav';
import { MapPage } from './MapPage';
import { LoginPage } from './LoginPage';
import { SignUpPage } from './SignUpPage';

export function AuthGate() {
  const [session] = useSession();
  const [currentPage, setCurrentPage] = React.useState('map'); // 'map' | 'login' | 'signup'
  const [loginPageMessage, setLoginPageMessage] = React.useState(null);

  // Requirements 1.6/1.7: once authentication succeeds (session goes from
  // null to non-null), automatically return to MapPage. A successful login
  // is also the natural point at which a lingering sign-up success message
  // (see module comment above) stops being relevant, so it is cleared here
  // too.
  React.useEffect(() => {
    if (session) {
      setCurrentPage('map');
      setLoginPageMessage(null);
    }
  }, [session]);

  function handleSignUpComplete(message) {
    setLoginPageMessage(message);
    setCurrentPage('login');
  }

  let page;
  if (currentPage === 'login') {
    page = (
      <LoginPage
        onRequestSignUp={() => setCurrentPage('signup')}
        successMessage={loginPageMessage}
      />
    );
  } else if (currentPage === 'signup') {
    page = <SignUpPage onSignUpComplete={handleSignUpComplete} />;
  } else {
    page = <MapPage />;
  }

  return (
    <>
      <header className="container">
        <TopNav
          onNavigateHome={() => setCurrentPage('map')}
          onNavigateToMapPage={() => setCurrentPage('map')}
          onRequestLogin={() => setCurrentPage('login')}
        />
      </header>
      <main className="container">{page}</main>
    </>
  );
}
