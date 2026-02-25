import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import {
  billboardItemSchema,
  createLevelRequestSchema,
  levelSchema,
  levelsListResponseSchema,
  updateLevelRequestSchema,
  uploadResponseSchema,
  type BillboardItem,
  type Level
} from '@my-play-game/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { createHttpError } from '../lib/httpError.js';
import { mapPrismaError } from '../lib/prismaError.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

const itemsSchema = z.array(billboardItemSchema);

const parseItems = (value: unknown): BillboardItem[] => {
  const parsed = itemsSchema.safeParse(value);

  if (!parsed.success) {
    throw createHttpError(500, 'INVALID_LEVEL_ITEMS', 'Stored level items are invalid');
  }

  return parsed.data;
};

const toLevel = (level: {
  id: string;
  name: string;
  items: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Level => {
  const payload = {
    id: level.id,
    name: level.name,
    items: parseItems(level.items),
    createdAt: level.createdAt.toISOString(),
    updatedAt: level.updatedAt.toISOString()
  };

  return levelSchema.parse(payload);
};

const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === 'image/png') {
    return '.png';
  }

  if (mimeType === 'image/jpeg') {
    return '.jpg';
  }

  if (mimeType === 'image/webp') {
    return '.webp';
  }

  return '.gif';
}

function uploadPublicUrl(fileName: string): string {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;

  if (!publicBaseUrl) {
    throw createHttpError(500, 'PUBLIC_BASE_URL_NOT_CONFIGURED', 'Internal Server Error');
  }

  return new URL(`/uploads/${fileName}`, publicBaseUrl).toString();
}

async function handleImageUpload(request: FastifyRequest) {
  const uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads');
  await mkdir(uploadDir, { recursive: true });

  const file = await request.file();

  if (!file) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'File is required');
  }

  if (!allowedMimeTypes.has(file.mimetype)) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'Unsupported file type');
  }

  const fileName = `${Date.now()}-${randomUUID()}${extensionFromMimeType(file.mimetype)}`;
  const absolutePath = path.join(uploadDir, fileName);

  await pipeline(file.file, createWriteStream(absolutePath));

  return uploadResponseSchema.parse({
    url: uploadPublicUrl(fileName)
  });
}

export const registerLevelsRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/api/levels', async (request) => {
    const queryResult = paginationQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Invalid query parameters');
    }

    const { limit, offset } = queryResult.data;

    try {
      const [levels, total] = await Promise.all([
        prisma.level.findMany({
          orderBy: {
            createdAt: 'desc'
          },
          take: limit,
          skip: offset
        }),
        prisma.level.count()
      ]);

      return levelsListResponseSchema.parse({
        items: levels.map(toLevel),
        total
      });
    } catch (error) {
      throw mapPrismaError(error);
    }
  });

  app.get('/api/levels/:id', async (request) => {
    const paramsResult = z.object({ id: z.string().min(1) }).safeParse(request.params);

    if (!paramsResult.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Invalid level id');
    }

    const { id } = paramsResult.data;

    try {
      const level = await prisma.level.findUnique({
        where: { id }
      });

      if (!level) {
        throw createHttpError(404, 'NOT_FOUND', 'Level not found');
      }

      return toLevel(level);
    } catch (error) {
      throw mapPrismaError(error);
    }
  });

  app.post('/api/levels', { preHandler: requireAdmin }, async (request, reply) => {
    const bodyResult = createLevelRequestSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Invalid request body');
    }

    const { name, items } = bodyResult.data;

    try {
      const level = await prisma.level.create({
        data: {
          name,
          items
        }
      });

      reply.status(201);
      return toLevel(level);
    } catch (error) {
      throw mapPrismaError(error);
    }
  });

  app.put('/api/levels/:id', { preHandler: requireAdmin }, async (request) => {
    const paramsResult = z.object({ id: z.string().min(1) }).safeParse(request.params);

    if (!paramsResult.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Invalid level id');
    }

    const bodyResult = updateLevelRequestSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Invalid request body');
    }

    const { id } = paramsResult.data;

    try {
      const level = await prisma.level.update({
        where: { id },
        data: bodyResult.data
      });

      return toLevel(level);
    } catch (error) {
      throw mapPrismaError(error);
    }
  });

  app.post('/api/uploads', { preHandler: requireAdmin }, async (request) => {
    return handleImageUpload(request);
  });

  app.post('/api/uploads/image', { preHandler: requireAdmin }, async (request) => {
    return handleImageUpload(request);
  });
};
