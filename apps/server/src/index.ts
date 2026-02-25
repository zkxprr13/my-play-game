import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import {
  HEALTH_RESPONSE,
  type ErrorResponse,
  type UploadResponse,
  uploadResponseSchema
} from '@my-play-game/shared';
import { prisma } from './db/prisma';
import { requireAdmin } from './middleware/requireAdmin';

const app = Fastify({
  logger: true
});

type HttpError = Error & {
  statusCode: number;
  code: string;
};

const IMAGE_MIME_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const createHttpError = (statusCode: number, code: string, message: string): HttpError =>
  Object.assign(new Error(message), {
    statusCode,
    code
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

app.post(
  '/api/uploads',
  {
    preHandler: requireAdmin,
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '10 minutes'
      }
    }
  },
  async (request, reply): Promise<UploadResponse> => {
    const uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads');
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    const uploadMaxBytes = Number(process.env.UPLOAD_MAX_BYTES);

    if (!publicBaseUrl) {
      throw createHttpError(500, 'PUBLIC_BASE_URL_NOT_CONFIGURED', 'Internal Server Error');
    }

    if (!Number.isInteger(uploadMaxBytes) || uploadMaxBytes <= 0) {
      throw createHttpError(500, 'UPLOAD_MAX_BYTES_NOT_CONFIGURED', 'Internal Server Error');
    }

    const part = await request.file({
      limits: {
        files: 1,
        fileSize: uploadMaxBytes
      }
    });

    if (!part) {
      throw createHttpError(400, 'FILE_REQUIRED', 'File is required');
    }

    if (part.fieldname !== 'file') {
      part.file.resume();
      throw createHttpError(400, 'INVALID_MULTIPART_FIELD', 'Multipart field must be "file"');
    }

    if (part.file.truncated) {
      throw createHttpError(413, 'FILE_TOO_LARGE', 'File is too large');
    }

    if (!IMAGE_MIME_TYPES.has(part.mimetype)) {
      part.file.resume();
      throw createHttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported Media Type');
    }

    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = MIME_EXTENSION_MAP[part.mimetype];
    const fileName = `${randomUUID()}.${ext}`;
    const relativePath = path.posix.join(year, month, fileName);
    const targetDir = path.join(uploadDir, year, month);
    const targetPath = path.join(targetDir, fileName);

    await mkdir(targetDir, { recursive: true });
    await pipeline(part.file, createWriteStream(targetPath));

    if (part.file.truncated) {
      throw createHttpError(413, 'FILE_TOO_LARGE', 'File is too large');
    }

    const publicPath = `/uploads/${relativePath}`;
    const baseUrl = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
    const url = `${baseUrl}${publicPath}`;

    await prisma.upload.create({
      data: {
        filename: relativePath,
        mimeType: part.mimetype,
        sizeBytes: part.file.bytesRead,
        url
      }
    });

    const response: UploadResponse = { url };
    uploadResponseSchema.parse(response);

    reply.status(201);
    return response;
  }
);

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
