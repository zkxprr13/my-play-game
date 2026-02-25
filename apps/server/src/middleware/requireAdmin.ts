import type { FastifyReply, FastifyRequest } from 'fastify';

type HttpError = Error & {
  statusCode: number;
  code: string;
};

const BEARER_PREFIX = 'Bearer ';

const createHttpError = (statusCode: number, code: string, message: string): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

export const requireAdmin = async (
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> => {
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    throw createHttpError(500, 'ADMIN_TOKEN_NOT_CONFIGURED', 'Internal Server Error');
  }

  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    throw createHttpError(401, 'UNAUTHORIZED', 'Unauthorized');
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length);

  if (token !== adminToken) {
    throw createHttpError(401, 'UNAUTHORIZED', 'Unauthorized');
  }
};
