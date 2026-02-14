import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { Role, JwtPayload, AuthenticatedUser } from '../../types/index.js';
import { authService } from '../../services/auth.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (...roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPluginAsync: FastifyPluginAsync = async (fastify) => {
  // Authentication decorator
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        const token = await request.jwtVerify<JwtPayload>();
        const user = await authService.getUserById(token.userId);

        if (!user) {
          return reply.code(401).send({ error: 'User not found or inactive' });
        }

        request.user = user;
      } catch (err) {
        return reply.code(401).send({ error: 'Invalid or expired token' });
      }
    }
  );

  // Authorization decorator (role-based)
  fastify.decorate(
    'authorize',
    function (...allowedRoles: Role[]) {
      return async function (request: FastifyRequest, reply: FastifyReply) {
        // First authenticate
        await fastify.authenticate(request, reply);

        if (!request.user) {
          return; // Already handled in authenticate
        }

        if (!allowedRoles.includes(request.user.role)) {
          return reply.code(403).send({ error: 'Insufficient permissions' });
        }
      };
    }
  );
};

export const authPlugin = fp(authPluginAsync, {
  name: 'auth-plugin',
  dependencies: ['@fastify/jwt'],
});
