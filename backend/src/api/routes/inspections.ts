import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ConditionGrade, InspectionStatus, Role } from '../../types/index.js';
import { inspectionService } from '../../services/inspection.service.js';
import { prisma } from '../../config/database.js';

const conditionGradeEnum = z.enum(['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5']);
const statusEnum = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'SUBMITTED']);

const createInspectionSchema = z.object({
  assetId: z.string().min(1),
  dateOfInspection: z.string().datetime(),
  conditionGrade: conditionGradeEnum,
  comments: z.string().optional(),
  status: statusEnum.optional(),
  clientId: z.string().uuid().optional(),
  // New fields
  inspectorName: z.string().optional(),
  defectSeverity: z.number().min(1).max(5).optional(),
  defectDescription: z.string().optional(),
  observedIssues: z.string().optional(),
  recommendedAction: z.string().optional(),
  followUpRequired: z.boolean().optional(),
});

const updateInspectionSchema = z.object({
  dateOfInspection: z.string().datetime().optional(),
  conditionGrade: conditionGradeEnum.optional(),
  comments: z.string().optional(),
  status: statusEnum.optional(),
  // New fields
  inspectorName: z.string().optional(),
  defectSeverity: z.number().min(1).max(5).optional().nullable(),
  defectDescription: z.string().optional().nullable(),
  observedIssues: z.string().optional().nullable(),
  recommendedAction: z.string().optional().nullable(),
  followUpRequired: z.boolean().optional().nullable(),
});

const priorityEnum = z.enum(['P1', 'P2', 'P3', 'P4']);

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(5000).default(20),
  assetId: z.string().optional(),
  engineerId: z.string().optional(),
  zone: z.string().optional(),
  level3: z.string().optional(),
  status: statusEnum.optional(),
  conditionGrade: conditionGradeEnum.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().optional(),
  followUpRequired: z.enum(['true', 'false']).optional(),
  priority: priorityEnum.optional(),
  sortBy: z.enum(['dateOfInspection', 'createdAt', 'conditionGrade']).default('dateOfInspection'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const inspectionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /inspections - List inspections
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const query = listQuerySchema.parse(request.query);

    return inspectionService.getInspections(
      {
        assetId: query.assetId,
        engineerId: query.engineerId,
        zone: query.zone,
        level3: query.level3,
        status: query.status as InspectionStatus | undefined,
        conditionGrade: query.conditionGrade as ConditionGrade | undefined,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        search: query.search,
        followUpRequired: query.followUpRequired === 'true' ? true : query.followUpRequired === 'false' ? false : undefined,
        priority: query.priority,
      },
      { page: query.page, limit: query.limit },
      query.sortBy,
      query.sortOrder
    );
  });

  // GET /inspections/summary - Get summary statistics
  fastify.get('/summary', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const query = z.object({
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      zone: z.string().optional(),
      level3: z.string().optional(),
    }).parse(request.query);

    return inspectionService.getInspectionSummary(
      query.dateFrom ? new Date(query.dateFrom) : undefined,
      query.dateTo ? new Date(query.dateTo) : undefined,
      query.zone,
      query.level3
    );
  });

  // GET /inspections/engineers - Get list of engineers for filter dropdown
  fastify.get('/engineers', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const engineers = await prisma.user.findMany({
      where: {
        isActive: true,
        inspections: { some: {} }, // Only users who have done inspections
      },
      select: {
        id: true,
        displayName: true,
      },
      orderBy: { displayName: 'asc' },
    });
    return engineers;
  });

  // GET /inspections/:id - Get inspection by ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const inspection = await inspectionService.getInspectionById(id);

    if (!inspection) {
      return reply.code(404).send({ error: 'Inspection not found' });
    }

    return inspection;
  });

  // POST /inspections - Create inspection
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = createInspectionSchema.parse(request.body);

    const inspection = await inspectionService.createInspection(
      {
        assetId: body.assetId,
        dateOfInspection: new Date(body.dateOfInspection),
        conditionGrade: body.conditionGrade as ConditionGrade,
        comments: body.comments,
        status: body.status as InspectionStatus | undefined,
        clientId: body.clientId,
        // New fields
        inspectorName: body.inspectorName,
        defectSeverity: body.defectSeverity,
        defectDescription: body.defectDescription,
        observedIssues: body.observedIssues,
        recommendedAction: body.recommendedAction,
        followUpRequired: body.followUpRequired,
      },
      request.user!.id,
      request.user!.email
    );

    return reply.code(201).send(inspection);
  });

  // PATCH /inspections/:id - Update inspection
  fastify.patch('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateInspectionSchema.parse(request.body);

    // Check ownership (engineers can only edit their own, admins can edit any)
    const existing = await inspectionService.getInspectionById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Inspection not found' });
    }

    if (request.user!.role !== Role.ADMIN && existing.engineerId !== request.user!.id) {
      return reply.code(403).send({ error: 'Not authorized to edit this inspection' });
    }

    const inspection = await inspectionService.updateInspection(
      id,
      {
        dateOfInspection: body.dateOfInspection ? new Date(body.dateOfInspection) : undefined,
        conditionGrade: body.conditionGrade as ConditionGrade | undefined,
        comments: body.comments,
        status: body.status as InspectionStatus | undefined,
        // New fields
        inspectorName: body.inspectorName,
        defectSeverity: body.defectSeverity,
        defectDescription: body.defectDescription,
        observedIssues: body.observedIssues,
        recommendedAction: body.recommendedAction,
        followUpRequired: body.followUpRequired,
      },
      request.user!.id,
      request.user!.email
    );

    return inspection;
  });

  // POST /inspections/:id/submit - Submit inspection
  fastify.post('/:id/submit', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Check ownership
    const existing = await inspectionService.getInspectionById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Inspection not found' });
    }

    if (request.user!.role !== Role.ADMIN && existing.engineerId !== request.user!.id) {
      return reply.code(403).send({ error: 'Not authorized to submit this inspection' });
    }

    const inspection = await inspectionService.submitInspection(
      id,
      request.user!.id,
      request.user!.email
    );

    return {
      ...inspection,
      reportGenerationQueued: true,
    };
  });

  // DELETE /inspections/:id - Delete inspection
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await inspectionService.deleteInspection(
        id,
        request.user!.id,
        request.user!.email,
        request.user!.role === Role.ADMIN
      );
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Inspection not found') {
          return reply.code(404).send({ error: 'Inspection not found' });
        }
        if (error.message.includes('Not authorized')) {
          return reply.code(403).send({ error: error.message });
        }
      }
      throw error;
    }
  });
};
