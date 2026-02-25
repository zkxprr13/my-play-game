export const APP_NAME = 'My Play Game Monorepo';

export interface HealthResponse {
  ok: true;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export const HEALTH_RESPONSE: HealthResponse = {
  ok: true
};
