import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authService } from '../../services/auth.service.js';
import { JwtPayload } from '../../types/index.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    try {
      const result = await authService.login(
        body.email,
        body.password,
        (payload: JwtPayload) => fastify.jwt.sign(payload),
        request.ip,
        request.headers['user-agent'],
        request.headers['x-device-id'] as string | undefined
      );

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: 900, // 15 minutes
        user: result.user,
      };
    } catch (error) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
  });

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);

    try {
      const result = await authService.refreshAccessToken(
        body.refreshToken,
        (payload: JwtPayload) => fastify.jwt.sign(payload)
      );

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: 900,
      };
    } catch (error) {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' });
    }
  });

  // POST /auth/logout
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = refreshSchema.parse(request.body);

    await authService.revokeRefreshToken(
      body.refreshToken,
      request.user!.id,
      request.ip,
      request.headers['user-agent']
    );

    return reply.code(204).send();
  });

  // GET /auth/me
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    return request.user;
  });
};
