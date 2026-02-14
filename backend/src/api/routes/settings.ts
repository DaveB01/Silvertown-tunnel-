import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { Role, AuditAction } from '../../types/index.js';
import { auditService } from '../../services/audit.service.js';

const updateSettingSchema = z.object({
  value: z.unknown(),
});

// Predefined settings keys
const SETTINGS_KEYS = [
  'branding', // { primaryColor, secondaryColor, logoUrl, companyName }
  'emailRecipients', // { default: string[], cc: string[] }
  'retentionDays', // { auditLogs: number, media: number }
] as const;

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /settings - Get all settings (Admin only)
  fastify.get('/', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async () => {
    const settings = await prisma.systemSetting.findMany();

    // Convert to key-value object
    const result: Record<string, unknown> = {};
    for (const setting of settings) {
      result[setting.key] = setting.value;
    }

    return result;
  });

  // GET /settings/:key - Get specific setting
  fastify.get('/:key', {
    preHandler: [fastify.authorize(Role.ADMIN, Role.MANAGER)],
  }, async (request, reply) => {
    const { key } = request.params as { key: string };

    const setting = await prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      return reply.code(404).send({ error: 'Setting not found' });
    }

    return { key: setting.key, value: setting.value };
  });

  // PUT /settings/:key - Update setting (Admin only)
  fastify.put('/:key', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const body = updateSettingSchema.parse(request.body);

    // Validate key is allowed
    if (!SETTINGS_KEYS.includes(key as typeof SETTINGS_KEYS[number])) {
      return reply.code(400).send({ error: `Invalid setting key. Allowed: ${SETTINGS_KEYS.join(', ')}` });
    }

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: body.value as object,
        updatedBy: request.user!.id,
      },
      update: {
        value: body.value as object,
        updatedBy: request.user!.id,
      },
    });

    await auditService.log({
      userId: request.user!.id,
      userEmail: request.user!.email,
      action: AuditAction.UPDATE,
      entityType: 'setting',
      entityId: key,
      description: `Updated setting: ${key}`,
      metadata: { value: body.value },
    });

    return { key: setting.key, value: setting.value };
  });

  // GET /settings/branding/public - Get branding for unauthenticated users
  fastify.get('/branding/public', async () => {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'branding' },
    });

    if (!setting) {
      // Return defaults
      return {
        companyName: 'INFRATEC',
        primaryColor: '#003366',
        secondaryColor: '#FF6600',
        logoUrl: '/assets/infratec-logo.png',
      };
    }

    return setting.value;
  });
};
