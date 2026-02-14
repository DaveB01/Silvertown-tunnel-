import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { inspectionService } from '../../services/inspection.service.js';
import { assetService } from '../../services/asset.service.js';
import { SyncOperation, SyncResult, ConditionGrade, InspectionStatus } from '../../types/index.js';

const pullSchema = z.object({
  lastSyncAt: z.string().datetime().optional(),
  entities: z.array(z.enum(['assets', 'inspections'])),
});

const pushSchema = z.object({
  changes: z.array(z.object({
    type: z.enum(['CREATE', 'UPDATE', 'DELETE']),
    entity: z.enum(['inspection', 'media']),
    clientId: z.string().optional(),
    id: z.string().optional(),
    data: z.record(z.unknown()),
    localTimestamp: z.string().datetime(),
    syncVersion: z.number().optional(),
  })),
});

export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /sync/pull - Pull changes from server
  fastify.post('/pull', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const body = pullSchema.parse(request.body);
    const userId = request.user!.id;
    const lastSyncAt = body.lastSyncAt ? new Date(body.lastSyncAt) : undefined;
    const syncedAt = new Date();

    const changes: Record<string, { created: unknown[]; updated: unknown[]; deleted: string[] }> = {};

    if (body.entities.includes('assets')) {
      // Assets: get all (they don't change often and are needed for offline)
      const assets = await prisma.asset.findMany({
        where: lastSyncAt ? { updatedAt: { gt: lastSyncAt } } : undefined,
        orderBy: { updatedAt: 'desc' },
      });

      changes.assets = {
        created: lastSyncAt ? [] : assets,
        updated: lastSyncAt ? assets : [],
        deleted: [], // Assets are rarely deleted
      };
    }

    if (body.entities.includes('inspections')) {
      // Inspections: get user's inspections
      const inspections = await prisma.inspection.findMany({
        where: {
          engineerId: userId,
          ...(lastSyncAt ? { updatedAt: { gt: lastSyncAt } } : {}),
        },
        include: {
          asset: true,
          media: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      changes.inspections = {
        created: lastSyncAt ? [] : inspections,
        updated: lastSyncAt ? inspections : [],
        deleted: [],
      };
    }

    return {
      syncedAt: syncedAt.toISOString(),
      changes,
    };
  });

  // POST /sync/push - Push local changes to server
  fastify.post('/push', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const body = pushSchema.parse(request.body);
    const userId = request.user!.id;
    const userEmail = request.user!.email;
    const results: SyncResult[] = [];
    const syncedAt = new Date();

    for (const operation of body.changes as SyncOperation[]) {
      try {
        if (operation.entity === 'inspection') {
          const result = await processInspectionSync(operation, userId, userEmail);
          results.push(result);
        } else if (operation.entity === 'media') {
          // Media sync is handled separately via upload URLs
          results.push({
            clientId: operation.clientId,
            status: 'error',
            error: 'Media should be synced via upload URLs',
          });
        }
      } catch (error) {
        results.push({
          clientId: operation.clientId,
          id: operation.id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      results,
      syncedAt: syncedAt.toISOString(),
    };
  });

  // ============================================================================
  // MOBILE-FRIENDLY ENDPOINTS (simpler for iOS app)
  // ============================================================================

  // POST /sync/inspection - Create single inspection (idempotent by clientId)
  const mobileInspectionSchema = z.object({
    clientId: z.string().uuid(),
    assetId: z.string(),
    dateOfInspection: z.string().datetime(),
    inspectorName: z.string().optional(),
    conditionGrade: z.enum(['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5']),
    comments: z.string().optional(),
    defectSeverity: z.number().min(1).max(5).optional(),
    defectDescription: z.string().optional(),
    observedIssues: z.string().optional(),
    recommendedAction: z.string().optional(),
    followUpRequired: z.boolean().optional(),
  });

  fastify.post('/inspection', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = mobileInspectionSchema.parse(request.body);
    const userId = request.user!.id;

    // Check if already exists by clientId (idempotent)
    const existing = await prisma.inspection.findUnique({
      where: { clientId: data.clientId },
    });

    if (existing) {
      return {
        status: 'already_synced',
        serverId: existing.id,
        clientId: existing.clientId,
        syncVersion: existing.syncVersion,
      };
    }

    // Verify asset exists
    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
    });

    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found', assetId: data.assetId });
    }

    // Calculate risk score
    const gradeValue = parseInt(data.conditionGrade.replace('GRADE_', ''));
    const riskScore = data.defectSeverity ? gradeValue * data.defectSeverity : null;

    // Create inspection
    const inspection = await prisma.inspection.create({
      data: {
        clientId: data.clientId,
        assetId: data.assetId,
        engineerId: userId,
        dateOfInspection: new Date(data.dateOfInspection),
        inspectorName: data.inspectorName,
        conditionGrade: data.conditionGrade,
        comments: data.comments,
        defectSeverity: data.defectSeverity,
        riskScore,
        defectDescription: data.defectDescription,
        observedIssues: data.observedIssues,
        recommendedAction: data.recommendedAction,
        followUpRequired: data.followUpRequired ?? false,
        status: 'COMPLETE',
        zone: asset.zone,
        syncVersion: 1,
        lastSyncedAt: new Date(),
      },
    });

    // Update asset's denormalized inspection tracking
    await assetService.updateAfterInspection(asset.id, inspection);

    return {
      status: 'created',
      serverId: inspection.id,
      clientId: inspection.clientId,
      syncVersion: inspection.syncVersion,
    };
  });

  // POST /sync/inspections/batch - Sync multiple inspections at once
  fastify.post('/inspections/batch', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const schema = z.object({ inspections: z.array(mobileInspectionSchema) });
    const { inspections } = schema.parse(request.body);
    const userId = request.user!.id;

    const results = await Promise.all(
      inspections.map(async (data) => {
        try {
          const existing = await prisma.inspection.findUnique({
            where: { clientId: data.clientId },
          });

          if (existing) {
            return {
              clientId: data.clientId,
              status: 'already_synced',
              serverId: existing.id,
              syncVersion: existing.syncVersion,
            };
          }

          const asset = await prisma.asset.findUnique({
            where: { id: data.assetId },
          });

          if (!asset) {
            return { clientId: data.clientId, status: 'failed', error: 'Asset not found' };
          }

          const gradeValue = parseInt(data.conditionGrade.replace('GRADE_', ''));
          const riskScore = data.defectSeverity ? gradeValue * data.defectSeverity : null;

          const inspection = await prisma.inspection.create({
            data: {
              clientId: data.clientId,
              assetId: data.assetId,
              engineerId: userId,
              dateOfInspection: new Date(data.dateOfInspection),
              inspectorName: data.inspectorName,
              conditionGrade: data.conditionGrade,
              comments: data.comments,
              defectSeverity: data.defectSeverity,
              riskScore,
              defectDescription: data.defectDescription,
              observedIssues: data.observedIssues,
              recommendedAction: data.recommendedAction,
              followUpRequired: data.followUpRequired ?? false,
              status: 'COMPLETE',
              zone: asset.zone,
              syncVersion: 1,
              lastSyncedAt: new Date(),
            },
          });

          await assetService.updateAfterInspection(asset.id, inspection);

          return {
            clientId: data.clientId,
            status: 'created',
            serverId: inspection.id,
            syncVersion: inspection.syncVersion,
          };
        } catch (error) {
          return {
            clientId: data.clientId,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return {
      summary: {
        created: results.filter(r => r.status === 'created').length,
        alreadySynced: results.filter(r => r.status === 'already_synced').length,
        failed: results.filter(r => r.status === 'failed').length,
        total: results.length,
      },
      results,
    };
  });

  // GET /sync/assets/all - Get all assets for initial sync
  fastify.get('/assets/all', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { since, limit } = z.object({
      since: z.string().datetime().optional(),
      limit: z.coerce.number().min(1).max(2000).default(1000),
    }).parse(request.query);

    const where = since ? { updatedAt: { gte: new Date(since) } } : {};

    const assets = await prisma.asset.findMany({
      where,
      take: limit,
      orderBy: { updatedAt: 'asc' },
      select: {
        id: true,
        assetId: true,
        assetCode: true,
        title: true,
        level1: true,
        level2: true,
        level3: true,
        zone: true,
        region: true,
        space: true,
        facility: true,
        description: true,
        lastInspectionDate: true,
        lastConditionGrade: true,
        lastRiskScore: true,
        inspectionCount: true,
        nextInspectionDue: true,
        updatedAt: true,
      },
    });

    return {
      assets,
      count: assets.length,
      hasMore: assets.length === limit,
      syncTimestamp: new Date().toISOString(),
    };
  });

  // GET /sync/inspections/all - Get all inspections for current user (for initial sync to device)
  fastify.get('/inspections/all', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user!.id;
    const { since, limit } = z.object({
      since: z.string().datetime().optional(),
      limit: z.coerce.number().min(1).max(500).default(200),
    }).parse(request.query);

    const where = {
      engineerId: userId,
      ...(since ? { updatedAt: { gte: new Date(since) } } : {}),
    };

    const inspections = await prisma.inspection.findMany({
      where,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        asset: {
          select: {
            id: true,
            assetId: true,
            assetCode: true,
            title: true,
            level1: true,
            level2: true,
            level3: true,
            zone: true,
          },
        },
      },
    });

    return {
      inspections: inspections.map(i => ({
        id: i.id,
        clientId: i.clientId,
        assetId: i.assetId,
        engineerId: i.engineerId,
        inspectorName: i.inspectorName,
        dateOfInspection: i.dateOfInspection.toISOString(),
        conditionGrade: i.conditionGrade,
        comments: i.comments,
        defectSeverity: i.defectSeverity,
        riskScore: i.riskScore,
        defectDescription: i.defectDescription,
        observedIssues: i.observedIssues,
        recommendedAction: i.recommendedAction,
        followUpRequired: i.followUpRequired,
        status: i.status,
        syncVersion: i.syncVersion,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
        asset: i.asset,
      })),
      count: inspections.length,
      hasMore: inspections.length === limit,
      syncTimestamp: new Date().toISOString(),
    };
  });

  // GET /sync/status - Get sync status for current user
  fastify.get('/status', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user!.id;

    const [totalInspections, totalAssets, lastAsset] = await Promise.all([
      prisma.inspection.count({ where: { engineerId: userId } }),
      prisma.asset.count(),
      prisma.asset.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);

    return {
      serverTime: new Date().toISOString(),
      user: { id: userId, totalInspections },
      assets: {
        total: totalAssets,
        lastUpdated: lastAsset?.updatedAt?.toISOString() || null,
      },
    };
  });
};

async function processInspectionSync(
  operation: SyncOperation,
  userId: string,
  userEmail: string
): Promise<SyncResult> {
  if (operation.type === 'CREATE') {
    // Check if already exists (by clientId)
    if (operation.clientId) {
      const existing = await prisma.inspection.findUnique({
        where: { clientId: operation.clientId },
      });

      if (existing) {
        return {
          clientId: operation.clientId,
          id: existing.id,
          status: 'conflict',
          serverVersion: existing as unknown as Record<string, unknown>,
          resolution: 'server_wins',
        };
      }
    }

    const data = operation.data as {
      assetId: string;
      dateOfInspection: string;
      conditionGrade: string;
      comments?: string;
      status?: string;
    };

    const inspection = await inspectionService.createInspection(
      {
        assetId: data.assetId,
        dateOfInspection: new Date(data.dateOfInspection),
        conditionGrade: data.conditionGrade as ConditionGrade,
        comments: data.comments,
        status: data.status as InspectionStatus | undefined,
        clientId: operation.clientId,
      },
      userId,
      userEmail
    );

    return {
      clientId: operation.clientId,
      id: inspection.id,
      status: 'created',
    };
  }

  if (operation.type === 'UPDATE') {
    if (!operation.id) {
      return {
        clientId: operation.clientId,
        status: 'error',
        error: 'ID required for update',
      };
    }

    // Check for conflicts using syncVersion
    const existing = await prisma.inspection.findUnique({
      where: { id: operation.id },
    });

    if (!existing) {
      return {
        id: operation.id,
        status: 'error',
        error: 'Inspection not found',
      };
    }

    // Server-wins conflict resolution
    if (operation.syncVersion && existing.syncVersion > operation.syncVersion) {
      return {
        id: operation.id,
        status: 'conflict',
        serverVersion: existing as unknown as Record<string, unknown>,
        resolution: 'server_wins',
      };
    }

    const data = operation.data as {
      dateOfInspection?: string;
      conditionGrade?: string;
      comments?: string;
      status?: string;
    };

    const inspection = await inspectionService.updateInspection(
      operation.id,
      {
        dateOfInspection: data.dateOfInspection ? new Date(data.dateOfInspection) : undefined,
        conditionGrade: data.conditionGrade as ConditionGrade | undefined,
        comments: data.comments,
        status: data.status as InspectionStatus | undefined,
      },
      userId,
      userEmail
    );

    return {
      id: inspection.id,
      status: 'updated',
    };
  }

  if (operation.type === 'DELETE') {
    if (!operation.id) {
      return {
        clientId: operation.clientId,
        status: 'error',
        error: 'ID required for delete',
      };
    }

    await inspectionService.deleteInspection(operation.id, userId, userEmail, false);

    return {
      id: operation.id,
      status: 'deleted',
    };
  }

  return {
    clientId: operation.clientId,
    status: 'error',
    error: 'Unknown operation type',
  };
}
