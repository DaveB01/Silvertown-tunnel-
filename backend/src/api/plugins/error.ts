import { FastifyPluginAsync, FastifyError } from 'fastify';
import fp from 'fastify-plugin';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

const errorPluginAsync: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    // Log error
    if (statusCode >= 500) {
      fastify.log.error({
        err: error,
        request: {
          method: request.method,
          url: request.url,
          headers: request.headers,
        },
      });
    } else {
      fastify.log.warn({
        err: error,
        request: {
          method: request.method,
          url: request.url,
        },
      });
    }

    // Handle Prisma errors
    if (error.code === 'P2002') {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'A record with this value already exists',
      });
    }

    if (error.code === 'P2025') {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Record not found',
      });
    }

    // Handle validation errors
    if (error.code === 'FST_ERR_VALIDATION') {
      return reply.code(400).send({
        error: 'Validation Error',
        message: error.message,
        details: (error as FastifyError).validation,
      });
    }

    // Default error response
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : 'Error',
      message: statusCode >= 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : message,
    });
  });

  // Handle 404s
  fastify.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
    });
  });
};

export const errorPlugin = fp(errorPluginAsync, {
  name: 'error-plugin',
});
