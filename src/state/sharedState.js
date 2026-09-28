import React from 'react';
import { makeSharedStateHook } from 'make-shared-state-hook';

// Session: null when signed out, otherwise { username, accessToken, expiresAt }
export const useSession = makeSharedStateHook(React, null);

// The single Place_Category currently displayed and tracked. Defaults to
// 'us-state' (Requirement 13.3). Introduced by task 21.1 as the foundation
// for the Place_Category-aware rename; nothing reads/writes this yet other
// than defaulting every existing us-states-only call site to that one slice.
export const useSelectedPlaceCategory = makeSharedStateHook(React, 'us-state');

// Visited places, partitioned by Place_Category first, then by placeId, for
// O(1) membership checks scoped to a single category and to keep every
// other category's data untouched when switching (Requirements 14.6, 15.1).
// Replaces the former flat `useVisitedStateIds`'s `{ [stateId]: true }`
// shape -- every existing call site now reads/writes only the 'us-state'
// slice so existing behavior is unchanged (task 21.1).
// { [placeCategory]: { [placeId]: true } }
export const useVisitedPlaceIdsByCategory = makeSharedStateHook(React, {
  'us-state': {},
  'canada-state': {},
  country: {},
});

// Hover/last-click info panel target: null | placeId (scoped implicitly to
// whichever category is Selected_Place_Category at read time -- see
// PlaceInfoPanel, task 21.7). Renamed from `useInfoPanelStateId`.
export const useInfoPanelPlaceId = makeSharedStateHook(React, null);

// Set of placeIds with an in-flight save request, partitioned by
// Place_Category the same way as useVisitedPlaceIdsByCategory:
// { [placeCategory]: { [placeId]: true } }. Replaces the former flat
// `usePendingStateIds`'s `{ [stateId]: true }` shape.
export const usePendingPlaceIds = makeSharedStateHook(React, {
  'us-state': {},
  'canada-state': {},
  country: {},
});

// Non-fatal, user-visible transient error banners (e.g. "update did not save")
export const useToastError = makeSharedStateHook(React, null);

// Short-lived value distinguishing *why* useSession most recently became
// null: 'LOGOUT' for a manual logout, 'SESSION_ENDED' for a token expiry
// or an auth-error response from the Visit_Record_API (see
// sessionHandlers.js's `signOutReason` field), or null if not applicable /
// not yet set (e.g. a guest who was never signed in at all). Read by
// LoginPromptBanner (task 17.3) to distinguish an involuntary sign-out from
// a deliberate one. NOTE: this task only adds this shared-state slot and
// the component that reads it -- wiring every actual session-clearing call
// site (LoginPage's future logout flow, handleApiAuthError,
// checkSessionBeforeApiCall) to also set this value from the corresponding
// handler's `signOutReason` field is a reasonable follow-up, not done here.
export const useSignOutReason = makeSharedStateHook(React, null);
