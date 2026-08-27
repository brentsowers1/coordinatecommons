// Configuration module.
//
// Single source of truth for environment-specific, build/deploy-time
// settings consumed by visitRecordApiClient.js, authenticationService.js,
// and useGoogleMapsLoader().
//
// Values are sourced from environment variables (populated at build/deploy
// time) with local-development placeholder fallbacks. This module holds no
// secrets: the Google Maps API key and Cognito app client id are inherently
// client-visible values shipped to the browser by design.

export const config = {
  visitRecordApiBaseUrl:
    process.env.VISIT_RECORD_API_BASE_URL || 'https://api.example.com/prod',
  googleMaps: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  },
  cognito: {
    userPoolId: process.env.COGNITO_USER_POOL_ID || '',
    clientId: process.env.COGNITO_CLIENT_ID || '',
    region: process.env.COGNITO_REGION || 'us-east-1',
  },
};
