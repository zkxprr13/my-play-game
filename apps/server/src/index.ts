import Fastify from 'fastify';
import { HEALTH_RESPONSE, type ErrorResponse } from '@my-play-game/shared';

const app = Fastify({
  logger: true
});

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error.statusCode ?? 500;
  const payload: ErrorResponse = {
    error: {
      code: String(statusCode),
      message: error.message
    }
  };

  reply.status(statusCode).send(payload);
});

app.get('/api/health', async () => HEALTH_RESPONSE);

const start = async (): Promise<void> => {
  try {
    await app.listen({
      port: 3000,
      host: '0.0.0.0'
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
