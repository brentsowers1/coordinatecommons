import React from 'react';
import { makeSharedStateHook } from 'make-shared-state-hook';

// Session: null when signed out, otherwise { username, accessToken, expiresAt }
export const useSession = makeSharedStateHook(React, null);

// Visited states: an object map of { [stateId]: true } for O(1) membership checks
export const useVisitedStateIds = makeSharedStateHook(React, {});

// Hover/last-click info panel target: null | stateId
export const useInfoPanelStateId = makeSharedStateHook(React, null);

// Set of stateIds with an in-flight save request: { [stateId]: true }
export const usePendingStateIds = makeSharedStateHook(React, {});

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
