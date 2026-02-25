export type HttpError = Error & {
  statusCode: number;
  code: string;
};

export const createHttpError = (statusCode: number, code: string, message: string): HttpError =>
  Object.assign(new Error(message), {
    statusCode,
    code
  });
