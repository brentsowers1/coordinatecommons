// MyPlacesControl component (design.md "Place Category Selection
// (`MyPlacesControl`, `useSelectedPlaceCategory`)"; Requirements 13.2,
// 13.3, 13.4, 13.5, 13.6, 13.7).
//
// Closed-state label (Requirement 13.4): the closed-state control always
// renders the fixed, static label "My Places", regardless of the current
// Selected_Place_Category. This is a deliberate, confirmed change from
// this control's original behavior (which showed the current selection's
// own label, e.g. "US States", as the closed-state text) -- the current
// selection is still indicated once the dropdown is open, via
// `aria-checked` on the matching option, exactly as before.
//
// Dropdown overlay positioning (Requirement 13.2): the open dropdown is
// rendered as an absolutely-positioned overlay anchored below the
// closed-state control, rather than in normal document flow. The outer
// `<div data-testid="my-places-control-container">` establishes the
// positioning context (`position: relative`), and the dropdown `<ul>` is
// `position: absolute` relative to it (`top: 100%`, `left: 0`), so opening
// it floats on top of whatever page content sits beneath it (e.g. the
// map) instead of pushing that content down. Each of the three options
// still renders on its own line inside the overlay -- only the
// positioning mechanism changed, not the open-state content or the
// selection-indication logic.
//
// Task 24.1 scope: the `PLACE_CATEGORY_OPTIONS` constant, the dropdown
// open/close UI, and the closed-state/open-state rendering.
//
// Task 24.2 scope (this task): full selection semantics and
// dismiss-without-selecting semantics.
//   - Selection (Requirement 13.5): `handleOptionClick` unconditionally
//     calls `setSelectedPlaceCategory(option.placeCategory)` -- there is
//     no equality check against the current selection, so re-selecting
//     the already-active option still calls the setter -- and then calls
//     the new `onNavigateToMapPage` prop, regardless of which page was
//     showing when the option was clicked. `onNavigateToMapPage` follows
//     the exact navigation-callback-prop pattern `TopNav`'s
//     `onNavigateHome` prop uses (see TopNav.jsx's module comment and
//     AuthGate.jsx's `onNavigateHome={() => setCurrentPage('map')}`):
//     `MyPlacesControl` itself has no navigation-state concept, so it
//     just asks whatever parent eventually renders it (task 24.4 wires it
//     into `TopNav`, which is itself rendered by `AuthGate`) to navigate
//     to MapPage. It defaults to a no-op (`() => {}`), matching
//     `StateBoundaryOverlay`'s `onStateBoundaryClick` default-no-op
//     convention, so this component remains fully functional/testable
//     standalone before task 24.4 wires a real callback through.
//   - Dismiss (Requirement 13.7): while the dropdown is open, a
//     `document`-level `mousedown` listener (click-outside, checked via a
//     ref on the outer wrapper and `!ref.current.contains(event.target)`)
//     and a `document`-level `keydown` listener (`Escape`) both simply
//     call `setIsOpen(false)` and return -- neither calls
//     `setSelectedPlaceCategory` nor `onNavigateToMapPage`, and neither
//     listener is registered while the dropdown is closed.
//
// Markup follows TopNav.jsx's established convention for this codebase:
// `<a href="#">` elements with `onClick` calling `event.preventDefault()`
// first (there is still no router in this SPA), rather than `<button>`
// elements. The dropdown options use `role="menuitemradio"` +
// `aria-checked` (a standard accessible pattern for a set of
// mutually-exclusive choices in a menu), and the whole dropdown is a
// `role="menu"` list; the closed-state control is `aria-haspopup="true"`
// and `aria-expanded` reflects open/closed state.
//
// Deliberately does NOT import or read `useSession` anywhere, so it
// renders identically for authenticated and unauthenticated users
// (Requirement 13.6) -- matching LoginPromptBanner.jsx's/
// PlaceVisitStatusLists.jsx's own pattern of components that read only the
// shared state relevant to their concern.

import React from 'react';

import { useSelectedPlaceCategory } from '../state/sharedState';

// The three selectable options, in dropdown display order, each mapped 1:1
// to a PlaceCategory (Requirement 13.2).
export const PLACE_CATEGORY_OPTIONS = [
  { placeCategory: 'us-state', label: 'US States' },
  { placeCategory: 'canada-state', label: 'Canadian Provinces' },
  { placeCategory: 'country', label: 'Countries' },
];

/**
 * The My_Places_Control (Requirement 13). Displays the fixed label
 * "My Places" as its closed-state text (regardless of the current
 * Selected_Place_Category), and an open dropdown -- rendered as an
 * absolutely-positioned overlay below the control -- indicating which of
 * the three options matches the current Selected_Place_Category.
 *
 * @param {Object} props
 * @param {() => void} [props.onNavigateToMapPage] - called after selecting
 *   any option (Requirement 13.5), regardless of which page was showing.
 *   Follows the same navigation-callback-prop pattern as `TopNav`'s
 *   `onNavigateHome`. Defaults to a no-op.
 */
export function MyPlacesControl({ onNavigateToMapPage = () => {} }) {
  const [selectedPlaceCategory, setSelectedPlaceCategory] = useSelectedPlaceCategory();
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef(null);

  function handleToggleClick(event) {
    event.preventDefault();
    setIsOpen((previous) => !previous);
  }

  // Requirement 13.5: always call the setter -- even when the clicked
  // option already matches the current selection -- and always request
  // navigation to MapPage, regardless of which page was showing.
  function handleOptionClick(option) {
    return (event) => {
      event.preventDefault();
      setSelectedPlaceCategory(option.placeCategory);
      onNavigateToMapPage();
      setIsOpen(false);
    };
  }

  // Requirement 13.7: dismissing the open dropdown without selecting
  // (click-outside or Escape) closes it without calling the setter or
  // requesting navigation. Both listeners are registered only while the
  // dropdown is open, and removed on cleanup/close.
  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleDocumentMouseDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleDocumentKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      data-testid="my-places-control-container"
      ref={containerRef}
      style={{ position: 'relative' }}
    >
      <a
        href="#"
        onClick={handleToggleClick}
        data-testid="my-places-control"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        My Places
      </a>
      {isOpen && (
        <ul
          role="menu"
          data-testid="my-places-dropdown"
          style={{
            // Override Pico's `nav ul { display: flex; }` (picocss.com's
            // documented nav pattern -- see TopNav.jsx's own Pico markup
            // comment): that rule is a `nav ul` descendant selector, not
            // scoped to only NAV's direct `<ul>` children, so it also
            // matches this dropdown `<ul>` since it's nested inside
            // TopNav's `<nav>` (inside this control's own `<li>`). Left
            // unoverridden, that inherited `display: flex` (Pico's default
            // flex-direction is row) lays the three options out
            // side-by-side instead of stacked. Inline styles have higher
            // specificity than Pico's stylesheet selectors, so setting the
            // same `display` property here wins and restores normal
            // block/list layout.
            display: 'block',
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            backgroundColor: 'var(--pico-background-color)',
            border: '1px solid var(--pico-muted-border-color)',
            borderRadius: 'var(--pico-border-radius)',
            padding: '0.5rem 0',
            margin: 0,
            minWidth: '100%',
            whiteSpace: 'nowrap',
            listStyle: 'none',
          }}
        >
          {PLACE_CATEGORY_OPTIONS.map((option) => {
            const isSelected = option.placeCategory === selectedPlaceCategory;
            return (
              <li
                key={option.placeCategory}
                // Override Pico's `nav li { display: inline-block; ... }`,
                // the same kind of unscoped descendant selector as `nav
                // ul` above -- it also matches these option `<li>`s since
                // they're nested inside the same `<nav>`. `inline-block`
                // would let the options sit side-by-side on one line even
                // if the parent `<ul>`'s `display: block` override above
                // were the only fix; each option needs its own full-width
                // block box to actually render on its own line.
                style={{ display: 'block' }}
              >
                <a
                  href="#"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={handleOptionClick(option)}
                  data-testid={`my-places-option-${option.placeCategory}`}
                >
                  {isSelected ? '✓ ' : ''}
                  {option.label}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
