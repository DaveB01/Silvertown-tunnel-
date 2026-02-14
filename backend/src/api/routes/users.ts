import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { Role, AuditAction } from '../../types/index.js';
import { authService } from '../../services/auth.service.js';
import { auditService } from '../../services/audit.service.js';

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'MANAGER', 'ENGINEER']),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'ENGINEER']).optional(),
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  role: z.enum(['ADMIN', 'MANAGER', 'ENGINEER']).optional(),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /users - List users (Admin only)
  fastify.get('/', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request) => {
    const query = listQuerySchema.parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.role) {
      where.role = query.role;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // GET /users/:id - Get user (Admin only)
  fastify.get('/:id', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { inspections: true } },
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return user;
  });

  // POST /users - Create user (Admin only)
  fastify.post('/', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (existing) {
      return reply.code(409).send({ error: 'Email already exists' });
    }

    const passwordHash = await authService.hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        firstName: body.firstName,
        lastName: body.lastName,
        displayName: `${body.firstName} ${body.lastName}`,
        passwordHash,
        role: body.role as Role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        role: true,
        isActive: true,
      },
    });

    await auditService.log({
      userId: request.user!.id,
      userEmail: request.user!.email,
      action: AuditAction.CREATE,
      entityType: 'user',
      entityId: user.id,
      description: `Created user ${user.email}`,
    });

    return reply.code(201).send(user);
  });

  // PATCH /users/:id - Update user (Admin only)
  fastify.patch('/:id', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateUserSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const updateData: Record<string, unknown> = { ...body };
    if (body.firstName || body.lastName) {
      updateData.displayName = `${body.firstName || existing.firstName} ${body.lastName || existing.lastName}`;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        role: true,
        isActive: true,
      },
    });

    await auditService.log({
      userId: request.user!.id,
      userEmail: request.user!.email,
      action: AuditAction.UPDATE,
      entityType: 'user',
      entityId: user.id,
      description: `Updated user ${user.email}`,
      metadata: { changes: body },
    });

    return user;
  });

  // DELETE /users/:id - Deactivate user (Admin only)
  fastify.delete('/:id', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Prevent self-deletion
    if (id === request.user!.id) {
      return reply.code(400).send({ error: 'Cannot deactivate your own account' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await auditService.log({
      userId: request.user!.id,
      userEmail: request.user!.email,
      action: AuditAction.DELETE,
      entityType: 'user',
      entityId: id,
      description: `Deactivated user ${user.email}`,
    });

    return reply.code(204).send();
  });
};
