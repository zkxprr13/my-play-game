import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { HEALTH_RESPONSE, type ErrorResponse } from '@my-play-game/shared';

const app = Fastify({
  logger: true
});

const toErrorPayload = (error: Error & { statusCode?: number; code?: string }): ErrorResponse => {
  const statusCode = error.statusCode ?? 500;

  return {
    error: {
      code: error.code ?? String(statusCode),
      message: statusCode >= 500 ? 'Internal Server Error' : error.message
    }
  };
};

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error.statusCode ?? reply.statusCode ?? 500;
  const payload = toErrorPayload({
    message: error.message,
    name: error.name,
    stack: error.stack,
    code: error.code,
    statusCode
  });

  reply.status(statusCode).send(payload);
});

const registerPlugins = async (): Promise<void> => {
  const corsOrigin = process.env.CORS_ORIGIN;

  if (!corsOrigin) {
    throw new Error('CORS_ORIGIN is not configured');
  }

  const uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads');

  await app.register(cors, {
    origin: corsOrigin
  });

  await app.register(helmet);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  await app.register(multipart);

  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/'
  });
};

app.get('/api/health', async () => HEALTH_RESPONSE);

const start = async (): Promise<void> => {
  try {
    await registerPlugins();

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
