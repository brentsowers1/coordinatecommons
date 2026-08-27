import { config } from './config';

describe('config', () => {
  it('exports the expected shape', () => {
    expect(typeof config.visitRecordApiBaseUrl).toBe('string');
    expect(typeof config.googleMaps.apiKey).toBe('string');
    expect(typeof config.cognito.userPoolId).toBe('string');
    expect(typeof config.cognito.clientId).toBe('string');
    expect(typeof config.cognito.region).toBe('string');
  });
});
