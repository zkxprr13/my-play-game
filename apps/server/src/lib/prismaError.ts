import { Prisma } from '@prisma/client';
import { createHttpError, type HttpError } from './httpError.js';

const mapPrismaClientKnownError = (error: Prisma.PrismaClientKnownRequestError): HttpError => {
  switch (error.code) {
    case 'P2025':
      return createHttpError(404, 'NOT_FOUND', 'Resource not found');
    case 'P2002':
      return createHttpError(409, 'CONFLICT', 'Resource already exists');
    case 'P2000':
    case 'P2005':
    case 'P2006':
    case 'P2011':
    case 'P2012':
    case 'P2013':
      return createHttpError(400, 'BAD_REQUEST', 'Invalid data for database operation');
    default:
      return createHttpError(500, 'PRISMA_ERROR', 'Internal Server Error');
  }
};

export const mapPrismaError = (error: unknown): Error => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaClientKnownError(error);
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return createHttpError(400, 'BAD_REQUEST', 'Invalid database query');
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return createHttpError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable');
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return createHttpError(500, 'DATABASE_PANIC', 'Internal Server Error');
  }

  return error instanceof Error ? error : createHttpError(500, 'INTERNAL_SERVER_ERROR', 'Internal Server Error');
};
