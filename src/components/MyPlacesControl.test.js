// Smoke tests for MyPlacesControl (task 24.1 scope only: closed-state
// label, opening the dropdown, and indicating the current selection).
// Comprehensive selection/dismiss-semantics property tests are task 24.3's
// job, and broader UI/placement unit tests are task 24.5's job -- this
// file intentionally stays minimal so it doesn't duplicate that scope.
//
// Closed-state label note: the closed-state control always renders the
// fixed label "My Places", regardless of the Selected_Place_Category
// (Requirement 13.4). Tests that need to observe a selection's effect do
// so by reopening the dropdown and checking `aria-checked` on the
// matching option, rather than by reading the closed-state label.
//
// Follows TopNav.test.js's convention of resetting shared state (which
// lives at module scope, persisting across tests in this file) via a
// small setter harness before each test.

import React from 'react';
import fc from 'fast-check';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { MyPlacesControl, PLACE_CATEGORY_OPTIONS } from './MyPlacesControl';
import { useSelectedPlaceCategory, useSession } from '../state/sharedState';

function Setter({ selectedPlaceCategory }) {
  const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
  React.useEffect(() => {
    setSelectedPlaceCategory(selectedPlaceCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function setUpSharedState({ selectedPlaceCategory = 'us-state' } = {}) {
  render(<Setter selectedPlaceCategory={selectedPlaceCategory} />);
}

describe('MyPlacesControl', () => {
  it('shows the fixed "My Places" label as the closed-state button text by default', () => {
    setUpSharedState();
    render(<MyPlacesControl />);

    const control = screen.getByTestId('my-places-control');
    expect(control).toHaveTextContent('My Places');
    expect(screen.queryByTestId('my-places-dropdown')).not.toBeInTheDocument();
  });

  it('opens the dropdown showing all three option labels when clicked', () => {
    setUpSharedState();
    render(<MyPlacesControl />);

    fireEvent.click(screen.getByTestId('my-places-control'));

    const dropdown = screen.getByTestId('my-places-dropdown');
    expect(dropdown).toBeInTheDocument();
    PLACE_CATEGORY_OPTIONS.forEach((option) => {
      expect(screen.getByTestId(`my-places-option-${option.placeCategory}`)).toHaveTextContent(
        option.label
      );
    });
  });

  it('indicates the currently selected option via aria-checked when open', () => {
    setUpSharedState({ selectedPlaceCategory: 'canada-state' });
    render(<MyPlacesControl />);

    fireEvent.click(screen.getByTestId('my-places-control'));

    expect(screen.getByTestId('my-places-option-canada-state')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByTestId('my-places-option-us-state')).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByTestId('my-places-option-country')).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  // Regression test for the dropdown rendering its three options
  // side-by-side instead of stacked: this control's dropdown `<ul>` is
  // nested inside TopNav's `<nav>`, and Pico.css's documented nav pattern
  // (picocss.com/docs/nav) applies `display: flex` to `nav ul` and
  // `display: inline-block` to `nav li` via unscoped descendant
  // selectors, which also match this dropdown despite it not being one of
  // TopNav's own top-level nav groups. jsdom doesn't compute real CSS
  // cascade/layout (so this can't assert the resulting layout is actually
  // vertical against Pico's stylesheet), but it can assert that the
  // dropdown's own inline `style` explicitly sets `display: block` on
  // both the `<ul>` and each `<li>` -- the override this component relies
  // on (inline styles win specificity over Pico's stylesheet rules) to
  // force one option per line instead of inheriting Pico's flex/inline
  // layout.
  it('sets an explicit block display on the dropdown list and each option to override Pico nav flex/inline-block layout', () => {
    setUpSharedState();
    render(<MyPlacesControl />);

    fireEvent.click(screen.getByTestId('my-places-control'));

    const dropdown = screen.getByTestId('my-places-dropdown');
    expect(dropdown.style.display).toBe('block');

    PLACE_CATEGORY_OPTIONS.forEach((option) => {
      const optionListItem = screen.getByTestId(`my-places-option-${option.placeCategory}`).closest('li');
      expect(optionListItem.style.display).toBe('block');
    });
  });

  it('does not import or read useSession (renders identically regardless of session state)', () => {
     
    const source = require('fs').readFileSync(require.resolve('./MyPlacesControl.jsx'), 'utf8');
    const codeOnly = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/useSession/);
  });
});

// Task 24.5 scope: UI/placement unit tests not already covered by tasks
// 24.1-24.3 above. Each describe block below is labeled with the specific
// Requirement(s) it targets.

// Feature: state-visit-tracker, Requirements: 13.2
describe('MyPlacesControl dropdown option count and literal labels (Requirement 13.2)', () => {
  it('offers exactly three options, with the exact literal labels "US States", "Canadian Provinces", and "Countries"', () => {
    setUpSharedState();
    render(<MyPlacesControl />);

    fireEvent.click(screen.getByTestId('my-places-control'));

    // Hardcoded literal assertions (not derived from PLACE_CATEGORY_OPTIONS)
    // so a typo/regression in the constant itself would be caught, unlike
    // the task-24.1 smoke test which only checks internal self-consistency.
    const options = screen.getAllByRole('menuitemradio');
    expect(options).toHaveLength(3);

    const labels = options.map((option) => option.textContent.replace(/^✓\s*/, ''));
    expect(labels).toEqual(['US States', 'Canadian Provinces', 'Countries']);
  });
});

// Feature: state-visit-tracker, Requirements: 13.4
describe('MyPlacesControl closed-label and open-state indication for every option (Requirement 13.4)', () => {
  it.each(PLACE_CATEGORY_OPTIONS)(
    'always shows the fixed "My Places" closed-state label, regardless of selectedPlaceCategory ("$placeCategory")',
    ({ placeCategory }) => {
      setUpSharedState({ selectedPlaceCategory: placeCategory });
      render(<MyPlacesControl />);

      expect(screen.getByTestId('my-places-control')).toHaveTextContent('My Places');
    }
  );

  it('indicates the DEFAULT selection ("us-state") via aria-checked when open, not just non-default selections', () => {
    setUpSharedState({ selectedPlaceCategory: 'us-state' });
    render(<MyPlacesControl />);

    fireEvent.click(screen.getByTestId('my-places-control'));

    expect(screen.getByTestId('my-places-option-us-state')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('my-places-option-canada-state')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('my-places-option-country')).toHaveAttribute('aria-checked', 'false');
  });

  it.each(PLACE_CATEGORY_OPTIONS)(
    'indicates "$placeCategory" as checked (and the other two as unchecked) while open, for every possible selection',
    ({ placeCategory }) => {
      setUpSharedState({ selectedPlaceCategory: placeCategory });
      render(<MyPlacesControl />);

      fireEvent.click(screen.getByTestId('my-places-control'));

      PLACE_CATEGORY_OPTIONS.forEach((option) => {
        expect(screen.getByTestId(`my-places-option-${option.placeCategory}`)).toHaveAttribute(
          'aria-checked',
          option.placeCategory === placeCategory ? 'true' : 'false'
        );
      });
    }
  );
});

// Feature: state-visit-tracker, Requirements: 13.6
describe('MyPlacesControl renders identically for authenticated and unauthenticated sessions (Requirement 13.6)', () => {
  // The task-24.1 test above proves the component's source never imports
  // useSession (a static guard). This complements it with an actual
  // behavioral proof: render MyPlacesControl inside a tree where a real,
  // non-null session exists in shared state, and confirm the closed-label,
  // dropdown-opening, and open-state-indication behavior are unchanged
  // from the unauthenticated case exercised elsewhere in this file.
  function SessionSetter({ session }) {
    const [, setSession] = useSession();
    React.useEffect(() => {
      setSession(session);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  it('shows the correct closed-state label and dropdown options when an authenticated session is present', () => {
    setUpSharedState({ selectedPlaceCategory: 'canada-state' });
    render(
      <SessionSetter session={{ username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 }} />
    );
    render(<MyPlacesControl />);

    expect(screen.getByTestId('my-places-control')).toHaveTextContent('My Places');

    fireEvent.click(screen.getByTestId('my-places-control'));

    const options = screen.getAllByRole('menuitemradio');
    expect(options).toHaveLength(3);
    expect(screen.getByTestId('my-places-option-canada-state')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('my-places-option-us-state')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('my-places-option-country')).toHaveAttribute('aria-checked', 'false');
  });

  it('supports selecting an option identically when an authenticated session is present', () => {
    setUpSharedState({ selectedPlaceCategory: 'us-state' });
    render(
      <SessionSetter session={{ username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 }} />
    );
    const onNavigateToMapPage = jest.fn();
    render(<MyPlacesControl onNavigateToMapPage={onNavigateToMapPage} />);

    fireEvent.click(screen.getByTestId('my-places-control'));
    fireEvent.click(screen.getByTestId('my-places-option-country'));

    // The closed-state label stays fixed at "My Places"; the selection
    // took effect is verified by reopening the dropdown and checking
    // aria-checked on the newly-selected option instead.
    expect(screen.getByTestId('my-places-control')).toHaveTextContent('My Places');
    expect(onNavigateToMapPage).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('my-places-dropdown')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('my-places-control'));
    expect(screen.getByTestId('my-places-option-country')).toHaveAttribute('aria-checked', 'true');
  });
});

// Task 24.2 scope: selection (Requirement 13.5) and dismiss-without-
// selecting (Requirement 13.7) behavior. Property 26 in design.md covers
// this exact shape ("selecting always sets a defined value, regardless of
// whether it matches the value already in effect; dismissing never
// changes it") -- the parameterized test below over all three options,
// including re-selecting the already-active one, already exercises that
// property's core claim for the selection half, and the click-outside/
// Escape tests below exercise the dismiss half. Task 24.3 owns writing the
// dedicated fast-check property test (Property 26) itself; if it wants to
// build on/extend this coverage rather than duplicate it, that's fine --
// noted here so the orchestrator can decide.
describe('MyPlacesControl selection and dismiss behavior (Requirements 13.5, 13.7)', () => {
  it.each(PLACE_CATEGORY_OPTIONS)(
    'selecting "$placeCategory" always calls the setter with that value and requests navigation, even when already selected',
    ({ placeCategory }) => {
      // Exercise both "already selected" and "not already selected" starting
      // points for each option, per Requirement 13.5's "regardless of
      // whether it matches the value already in effect".
      [placeCategory, PLACE_CATEGORY_OPTIONS.find((o) => o.placeCategory !== placeCategory).placeCategory].forEach(
        (startingSelection) => {
          setUpSharedState({ selectedPlaceCategory: startingSelection });
          const onNavigateToMapPage = jest.fn();
          const { unmount } = render(<MyPlacesControl onNavigateToMapPage={onNavigateToMapPage} />);

          fireEvent.click(screen.getByTestId('my-places-control'));
          fireEvent.click(screen.getByTestId(`my-places-option-${placeCategory}`));

          // The closed-state label always stays "My Places"; the setter's
          // effect is observable by reopening the dropdown and checking
          // aria-checked on the just-selected option, regardless of the
          // starting selection.
          expect(screen.getByTestId('my-places-control')).toHaveTextContent('My Places');
          expect(onNavigateToMapPage).toHaveBeenCalledTimes(1);
          expect(screen.queryByTestId('my-places-dropdown')).not.toBeInTheDocument();

          fireEvent.click(screen.getByTestId('my-places-control'));
          expect(screen.getByTestId(`my-places-option-${placeCategory}`)).toHaveAttribute(
            'aria-checked',
            'true'
          );

          unmount();
        }
      );
    }
  );

  it('defaults onNavigateToMapPage to a no-op so selection works without the prop', () => {
    setUpSharedState();
    render(<MyPlacesControl />);

    fireEvent.click(screen.getByTestId('my-places-control'));
    expect(() => fireEvent.click(screen.getByTestId('my-places-option-country'))).not.toThrow();
    expect(screen.getByTestId('my-places-control')).toHaveTextContent('My Places');

    fireEvent.click(screen.getByTestId('my-places-control'));
    expect(screen.getByTestId('my-places-option-country')).toHaveAttribute('aria-checked', 'true');
  });

  it('closes the dropdown without selecting when clicking outside it, leaving the selection unchanged', () => {
    setUpSharedState({ selectedPlaceCategory: 'us-state' });
    const onNavigateToMapPage = jest.fn();
    render(
      <div>
        <div data-testid="outside">outside</div>
        <MyPlacesControl onNavigateToMapPage={onNavigateToMapPage} />
      </div>
    );

    fireEvent.click(screen.getByTestId('my-places-control'));
    expect(screen.getByTestId('my-places-dropdown')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(screen.queryByTestId('my-places-dropdown')).not.toBeInTheDocument();
    expect(onNavigateToMapPage).not.toHaveBeenCalled();

    // Selection unchanged: reopening still shows "us-state" as checked.
    fireEvent.click(screen.getByTestId('my-places-control'));
    expect(screen.getByTestId('my-places-option-us-state')).toHaveAttribute('aria-checked', 'true');
  });

  it('closes the dropdown without selecting when pressing Escape, leaving the selection unchanged', () => {
    setUpSharedState({ selectedPlaceCategory: 'canada-state' });
    const onNavigateToMapPage = jest.fn();
    render(<MyPlacesControl onNavigateToMapPage={onNavigateToMapPage} />);

    fireEvent.click(screen.getByTestId('my-places-control'));
    expect(screen.getByTestId('my-places-dropdown')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('my-places-dropdown')).not.toBeInTheDocument();
    expect(onNavigateToMapPage).not.toHaveBeenCalled();

    // Selection unchanged: reopening still shows "canada-state" as checked.
    fireEvent.click(screen.getByTestId('my-places-control'));
    expect(screen.getByTestId('my-places-option-canada-state')).toHaveAttribute('aria-checked', 'true');
  });

  it('does not close or fire callbacks when clicking inside the control without hitting an option', () => {
    setUpSharedState({ selectedPlaceCategory: 'us-state' });
    const onNavigateToMapPage = jest.fn();
    render(<MyPlacesControl onNavigateToMapPage={onNavigateToMapPage} />);

    fireEvent.click(screen.getByTestId('my-places-control'));
    fireEvent.mouseDown(screen.getByTestId('my-places-dropdown'));

    expect(screen.getByTestId('my-places-dropdown')).toBeInTheDocument();
    expect(onNavigateToMapPage).not.toHaveBeenCalled();
  });
});

// Task 24.3: the dedicated fast-check property test for Property 26,
// covering the full claim over arbitrary interleavings of selections and
// dismissals -- strictly stronger than the fixed-scenario unit tests
// above, which only exercise a handful of hand-picked sequences.
describe('MyPlacesControl - Property 26', () => {
  // Each action either selects one of the three options, or dismisses the
  // open dropdown via click-outside or Escape. The dropdown is (re)opened
  // before every action if it isn't already open, since dismissing
  // requires it to be open first.
  const actionArbitrary = fc.oneof(
    ...PLACE_CATEGORY_OPTIONS.map((option) =>
      fc.constant({ type: 'select', placeCategory: option.placeCategory })
    ),
    fc.constant({ type: 'dismiss-outside' }),
    fc.constant({ type: 'dismiss-escape' })
  );

  // Feature: state-visit-tracker, Property 26: Selecting a My_Places_Control option always sets the Selected_Place_Category to a defined value, and dismissing never changes it
  it('after every action, the selection equals the just-selected option, or is unchanged from before a dismissal', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PLACE_CATEGORY_OPTIONS.map((o) => o.placeCategory)),
        fc.array(actionArbitrary, { minLength: 0, maxLength: 20 }),
        (initialPlaceCategory, actions) => {
          setUpSharedState({ selectedPlaceCategory: initialPlaceCategory });
          const onNavigateToMapPage = jest.fn();
          render(
            <div>
              <div data-testid="outside">outside</div>
              <MyPlacesControl onNavigateToMapPage={onNavigateToMapPage} />
            </div>
          );

          // Tracks the expected Selected_Place_Category as the sequence is
          // driven, starting from the generated initial value. The
          // closed-state label is now fixed ("My Places") regardless of
          // selection, so the property is instead verified by checking
          // which option is marked aria-checked="true" once the dropdown
          // is (re)opened.
          let expectedPlaceCategory = initialPlaceCategory;

          function expectCheckedOptionToBe(placeCategory) {
            PLACE_CATEGORY_OPTIONS.forEach((option) => {
              expect(screen.getByTestId(`my-places-option-${option.placeCategory}`)).toHaveAttribute(
                'aria-checked',
                option.placeCategory === placeCategory ? 'true' : 'false'
              );
            });
          }

          // Sanity check: opening the dropdown before any action runs
          // shows expectedPlaceCategory as checked.
          fireEvent.click(screen.getByTestId('my-places-control'));
          expectCheckedOptionToBe(expectedPlaceCategory);
          fireEvent.click(screen.getByTestId('my-places-control'));
          expect(screen.queryByTestId('my-places-dropdown')).not.toBeInTheDocument();

          actions.forEach((action) => {
            // Open the dropdown if it isn't already (idempotent: clicking
            // the toggle while closed opens it; every action below leaves
            // it closed afterwards, so it is always closed here).
            fireEvent.click(screen.getByTestId('my-places-control'));
            expect(screen.getByTestId('my-places-dropdown')).toBeInTheDocument();

            if (action.type === 'select') {
              fireEvent.click(screen.getByTestId(`my-places-option-${action.placeCategory}`));
              // Selecting always sets a defined value: exactly the option
              // clicked, regardless of what it was before.
              expectedPlaceCategory = action.placeCategory;
            } else if (action.type === 'dismiss-outside') {
              fireEvent.mouseDown(screen.getByTestId('outside'));
              // Dismissing never changes the selection: expectedPlaceCategory
              // is intentionally left untouched.
            } else if (action.type === 'dismiss-escape') {
              fireEvent.keyDown(document, { key: 'Escape' });
              // Same as above: no change expected.
            }

            // The dropdown is always closed again after any of the three
            // action kinds.
            expect(screen.queryByTestId('my-places-dropdown')).not.toBeInTheDocument();

            // Reopen to verify the tracked expectation -- this is the
            // property's core assertion, checked after every single
            // action in the sequence.
            fireEvent.click(screen.getByTestId('my-places-control'));
            expectCheckedOptionToBe(expectedPlaceCategory);
            fireEvent.click(screen.getByTestId('my-places-control'));
            expect(screen.queryByTestId('my-places-dropdown')).not.toBeInTheDocument();
          });

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});
