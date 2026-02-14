import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Role } from '../../types/index.js';
import { assetService } from '../../services/asset.service.js';

const createAssetSchema = z.object({
  level2: z.string().min(1),
  level3: z.string().min(1),
  assetId: z.string().min(1),
  zone: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  region: z.string().optional(),
});

const updateAssetSchema = createAssetSchema.partial();

const statusEnum = z.enum(['critical', 'attention', 'monitor', 'due-soon', 'good', 'not-inspected']);

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  zone: z.string().optional(),
  level2: z.string().optional(),
  level3: z.string().optional(),
  region: z.string().optional(),
  search: z.string().optional(),
  hasInspections: z.enum(['true', 'false']).optional(),
  status: statusEnum.optional(),
  sortBy: z.enum(['assetId', 'zone', 'level3', 'createdAt']).default('assetId'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const assetRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /assets - List assets
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const query = listQuerySchema.parse(request.query);

    return assetService.getAssets(
      {
        zone: query.zone,
        level2: query.level2,
        level3: query.level3,
        region: query.region,
        search: query.search,
        hasInspections: query.hasInspections === 'true' ? true : query.hasInspections === 'false' ? false : undefined,
        status: query.status,
      },
      { page: query.page, limit: query.limit },
      query.sortBy,
      query.sortOrder
    );
  });

  // GET /assets/filters - Get filter options
  fastify.get('/filters', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return assetService.getFilterOptions();
  });

  // GET /assets/:id - Get asset by ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const asset = await assetService.getAssetById(id);

    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found' });
    }

    return asset;
  });

  // POST /assets - Create asset (Admin only)
  fastify.post('/', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const body = createAssetSchema.parse(request.body);

    try {
      const asset = await assetService.createAsset(
        body,
        request.user!.id,
        request.user!.email
      );
      return reply.code(201).send(asset);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return reply.code(409).send({ error: 'Asset ID already exists' });
      }
      throw error;
    }
  });

  // PATCH /assets/:id - Update asset (Admin only)
  fastify.patch('/:id', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateAssetSchema.parse(request.body);

    try {
      const asset = await assetService.updateAsset(
        id,
        body,
        request.user!.id,
        request.user!.email
      );
      return asset;
    } catch (error) {
      if (error instanceof Error && error.message === 'Asset not found') {
        return reply.code(404).send({ error: 'Asset not found' });
      }
      throw error;
    }
  });

  // DELETE /assets/:id - Delete asset (Admin only)
  fastify.delete('/:id', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await assetService.deleteAsset(id, request.user!.id, request.user!.email);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Asset not found') {
          return reply.code(404).send({ error: 'Asset not found' });
        }
        if (error.message.includes('existing inspections')) {
          return reply.code(409).send({ error: error.message });
        }
      }
      throw error;
    }
  });

  // Import routes are in a separate file for clarity
  // POST /assets/import/upload
  // POST /assets/import/validate
  // POST /assets/import/execute
  // GET /assets/import/status/:batchId
};
