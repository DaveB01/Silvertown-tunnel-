import { prisma } from '../config/database.js';
import { Inspection, Prisma, ConditionGrade, InspectionStatus } from '@prisma/client';
import {
  InspectionFilter,
  PaginationParams,
  PaginatedResponse,
  AuditAction,
} from '../types/index.js';
import { auditService } from './audit.service.js';
import { reportService } from './report.service.js';
import { mediaService } from './media.service.js';

export interface CreateInspectionInput {
  assetId: string;
  dateOfInspection: Date;
  conditionGrade: ConditionGrade;
  comments?: string;
  status?: InspectionStatus;
  clientId?: string;
  // New fields
  inspectorName?: string;
  defectSeverity?: number;
  defectDescription?: string;
  observedIssues?: string;
  recommendedAction?: string;
  followUpRequired?: boolean;
}

export interface UpdateInspectionInput {
  dateOfInspection?: Date;
  conditionGrade?: ConditionGrade;
  comments?: string;
  status?: InspectionStatus;
  // New fields
  inspectorName?: string;
  defectSeverity?: number | null;
  defectDescription?: string | null;
  observedIssues?: string | null;
  recommendedAction?: string | null;
  followUpRequired?: boolean | null;
}

// Helper to calculate risk score from condition grade and defect severity
function calculateRiskScore(conditionGrade: ConditionGrade, defectSeverity?: number | null): number | null {
  if (!defectSeverity) return null;
  const gradeValue = parseInt(conditionGrade.replace('GRADE_', ''));
  return gradeValue * defectSeverity;
}

// Helper to update asset's denormalized inspection tracking fields
async function updateAssetInspectionTracking(assetId: string): Promise<void> {
  // Get the latest completed/submitted inspection for this asset
  const latestInspection = await prisma.inspection.findFirst({
    where: {
      assetId,
      status: { in: [InspectionStatus.COMPLETE, InspectionStatus.SUBMITTED] },
    },
    orderBy: { dateOfInspection: 'desc' },
  });

  // Count total inspections for this asset
  const inspectionCount = await prisma.inspection.count({
    where: { assetId },
  });

  // Get the asset to read its frequency setting
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { inspectionFrequencyMonths: true },
  });

  const frequencyMonths = asset?.inspectionFrequencyMonths || 12;

  // Calculate next inspection due date
  let nextInspectionDue: Date | null = null;
  if (latestInspection?.dateOfInspection) {
    nextInspectionDue = new Date(latestInspection.dateOfInspection);
    nextInspectionDue.setMonth(nextInspectionDue.getMonth() + frequencyMonths);
  }

  // Update the asset
  await prisma.asset.update({
    where: { id: assetId },
    data: {
      lastInspectionId: latestInspection?.id || null,
      lastInspectionDate: latestInspection?.dateOfInspection || null,
      lastConditionGrade: latestInspection?.conditionGrade || null,
      lastRiskScore: latestInspection?.riskScore || null,
      lastInspectorName: latestInspection?.inspectorName || null,
      inspectionCount,
      nextInspectionDue,
    },
  });
}

export interface InspectionWithRelations extends Inspection {
  asset: {
    id: string;
    assetId: string;
    level2: string;
    level3: string;
    zone: string;
  };
  engineer: {
    id: string;
    displayName: string;
  };
  mediaCount?: number;
  hasReport?: boolean;
}

export const inspectionService = {
  /**
   * Get inspections with filtering and pagination
   */
  async getInspections(
    filter: InspectionFilter,
    pagination: PaginationParams,
    sortBy: string = 'dateOfInspection',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedResponse<InspectionWithRelations>> {
    const where: Prisma.InspectionWhereInput = {};

    if (filter.assetId) {
      where.assetId = filter.assetId;
    }
    if (filter.engineerId) {
      where.engineerId = filter.engineerId;
    }
    if (filter.zone) {
      where.zone = filter.zone;
    }
    if (filter.level3) {
      where.asset = { level3: filter.level3 };
    }
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.conditionGrade) {
      where.conditionGrade = filter.conditionGrade;
    }
    if (filter.dateFrom || filter.dateTo) {
      where.dateOfInspection = {};
      if (filter.dateFrom) {
        where.dateOfInspection.gte = filter.dateFrom;
      }
      if (filter.dateTo) {
        where.dateOfInspection.lte = filter.dateTo;
      }
    }
    if (filter.search) {
      where.OR = [
        { asset: { assetId: { contains: filter.search, mode: 'insensitive' } } },
        { comments: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    if (filter.followUpRequired !== undefined) {
      where.followUpRequired = filter.followUpRequired;
    }
    if (filter.priority) {
      // P1: >= 15, P2: 10-14, P3: 5-9, P4: < 5
      switch (filter.priority) {
        case 'P1':
          where.riskScore = { gte: 15 };
          break;
        case 'P2':
          where.riskScore = { gte: 10, lt: 15 };
          break;
        case 'P3':
          where.riskScore = { gte: 5, lt: 10 };
          break;
        case 'P4':
          where.riskScore = { lt: 5 };
          break;
      }
    }

    const orderBy: Prisma.InspectionOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [inspections, total] = await Promise.all([
      prisma.inspection.findMany({
        where,
        orderBy,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: {
          asset: {
            select: {
              id: true,
              assetId: true,
              level2: true,
              level3: true,
              zone: true,
            },
          },
          engineer: {
            select: {
              id: true,
              displayName: true,
            },
          },
          _count: {
            select: { media: true, reports: true },
          },
        },
      }),
      prisma.inspection.count({ where }),
    ]);

    const data: InspectionWithRelations[] = inspections.map((inspection) => ({
      ...inspection,
      mediaCount: inspection._count.media,
      hasReport: inspection._count.reports > 0,
      _count: undefined,
    }));

    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  },

  /**
   * Get inspection by ID with full details including signed media URLs
   */
  async getInspectionById(id: string): Promise<(Inspection & { media?: Array<{ signedUrl: string; signedThumbnailUrl?: string }> }) | null> {
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: {
        asset: true,
        engineer: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        reports: {
          orderBy: { generatedAt: 'desc' },
        },
      },
    });

    if (!inspection) {
      return null;
    }

    // Get media with signed URLs
    const mediaWithUrls = await mediaService.getInspectionMediaWithUrls(id);

    return {
      ...inspection,
      media: mediaWithUrls,
      mediaCount: mediaWithUrls.length,
      hasReport: inspection.reports && inspection.reports.length > 0,
    };
  },

  /**
   * Create a new inspection
   */
  async createInspection(
    input: CreateInspectionInput,
    engineerId: string,
    engineerEmail: string
  ): Promise<Inspection> {
    // Verify asset exists
    const asset = await prisma.asset.findUnique({
      where: { id: input.assetId },
    });
    if (!asset) {
      throw new Error('Asset not found');
    }

    // Check for duplicate clientId (offline sync)
    if (input.clientId) {
      const existing = await prisma.inspection.findUnique({
        where: { clientId: input.clientId },
      });
      if (existing) {
        return existing; // Return existing inspection if created offline
      }
    }

    const inspection = await prisma.inspection.create({
      data: {
        assetId: input.assetId,
        engineerId,
        dateOfInspection: input.dateOfInspection,
        conditionGrade: input.conditionGrade,
        comments: input.comments,
        status: input.status || InspectionStatus.IN_PROGRESS,
        clientId: input.clientId,
        zone: asset.zone, // Denormalized for faster queries
        // New fields
        inspectorName: input.inspectorName,
        defectSeverity: input.defectSeverity,
        riskScore: calculateRiskScore(input.conditionGrade, input.defectSeverity),
        defectDescription: input.defectDescription,
        observedIssues: input.observedIssues,
        recommendedAction: input.recommendedAction,
        followUpRequired: input.followUpRequired,
      },
      include: {
        asset: true,
        engineer: {
          select: { id: true, displayName: true },
        },
      },
    });

    await auditService.log({
      userId: engineerId,
      userEmail: engineerEmail,
      action: AuditAction.CREATE,
      entityType: 'inspection',
      entityId: inspection.id,
      description: `Created inspection for asset ${asset.assetId}`,
      metadata: { assetId: asset.assetId, conditionGrade: input.conditionGrade },
    });

    // Update asset's inspection tracking fields
    await updateAssetInspectionTracking(input.assetId);

    return inspection;
  },

  /**
   * Update an inspection
   */
  async updateInspection(
    id: string,
    input: UpdateInspectionInput,
    userId: string,
    userEmail: string
  ): Promise<Inspection> {
    const existing = await prisma.inspection.findUnique({
      where: { id },
      include: { asset: true },
    });

    if (!existing) {
      throw new Error('Inspection not found');
    }

    // Calculate risk score if condition grade or defect severity changed
    const newConditionGrade = input.conditionGrade || existing.conditionGrade;
    const newDefectSeverity = input.defectSeverity !== undefined ? input.defectSeverity : existing.defectSeverity;
    const riskScore = calculateRiskScore(newConditionGrade, newDefectSeverity);

    const inspection = await prisma.inspection.update({
      where: { id },
      data: {
        ...input,
        riskScore,
        syncVersion: { increment: 1 },
        lastSyncedAt: new Date(),
      },
    });

    await auditService.log({
      userId,
      userEmail,
      action: AuditAction.UPDATE,
      entityType: 'inspection',
      entityId: id,
      description: `Updated inspection for asset ${existing.asset.assetId}`,
      metadata: { changes: input },
    });

    return inspection;
  },

  /**
   * Submit an inspection and trigger PDF generation
   */
  async submitInspection(
    id: string,
    userId: string,
    userEmail: string
  ): Promise<Inspection> {
    const inspection = await prisma.inspection.update({
      where: { id },
      data: {
        status: InspectionStatus.SUBMITTED,
        submittedAt: new Date(),
        syncVersion: { increment: 1 },
      },
      include: { asset: true },
    });

    await auditService.log({
      userId,
      userEmail,
      action: AuditAction.UPDATE,
      entityType: 'inspection',
      entityId: id,
      description: `Submitted inspection for asset ${inspection.asset.assetId}`,
    });

    // Update asset's inspection tracking fields
    await updateAssetInspectionTracking(inspection.assetId);

    // Queue PDF generation
    await reportService.queueReportGeneration(id);

    return inspection;
  },

  /**
   * Delete an inspection
   */
  async deleteInspection(
    id: string,
    userId: string,
    userEmail: string,
    isAdmin: boolean
  ): Promise<void> {
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: { asset: true },
    });

    if (!inspection) {
      throw new Error('Inspection not found');
    }

    // Engineers can only delete their own inspections
    if (!isAdmin && inspection.engineerId !== userId) {
      throw new Error('Not authorized to delete this inspection');
    }

    // Delete associated media and reports
    await prisma.media.deleteMany({ where: { inspectionId: id } });
    await prisma.generatedReport.deleteMany({ where: { inspectionId: id } });
    await prisma.inspection.delete({ where: { id } });

    await auditService.log({
      userId,
      userEmail,
      action: AuditAction.DELETE,
      entityType: 'inspection',
      entityId: id,
      description: `Deleted inspection for asset ${inspection.asset.assetId}`,
    });
  },

  /**
   * Get inspection summary statistics
   */
  async getInspectionSummary(
    dateFrom?: Date,
    dateTo?: Date,
    zone?: string,
    level3?: string
  ): Promise<{
    totalInspections: number;
    byStatus: Record<string, number>;
    byConditionGrade: Record<string, number>;
    byZone: Record<string, number>;
    followUpCount: number;
    byPriority: { P1: number; P2: number; P3: number; P4: number };
  }> {
    const where: Prisma.InspectionWhereInput = {};
    if (dateFrom || dateTo) {
      where.dateOfInspection = {};
      if (dateFrom) where.dateOfInspection.gte = dateFrom;
      if (dateTo) where.dateOfInspection.lte = dateTo;
    }
    if (zone) where.zone = zone;
    if (level3) where.asset = { level3 };

    const [totalInspections, byStatus, byConditionGrade, byZone, followUpCount, inspectionsWithRisk] = await Promise.all([
      prisma.inspection.count({ where }),
      prisma.inspection.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      prisma.inspection.groupBy({
        by: ['conditionGrade'],
        where,
        _count: true,
      }),
      prisma.inspection.groupBy({
        by: ['zone'],
        where,
        _count: true,
      }),
      prisma.inspection.count({
        where: { ...where, followUpRequired: true },
      }),
      prisma.inspection.findMany({
        where: { ...where, riskScore: { not: null } },
        select: { riskScore: true },
      }),
    ]);

    // Calculate priority breakdown based on risk score
    // P1: >= 15, P2: 10-14, P3: 5-9, P4: < 5
    const byPriority = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const insp of inspectionsWithRisk) {
      const score = insp.riskScore!;
      if (score >= 15) byPriority.P1++;
      else if (score >= 10) byPriority.P2++;
      else if (score >= 5) byPriority.P3++;
      else byPriority.P4++;
    }

    return {
      totalInspections,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byConditionGrade: Object.fromEntries(byConditionGrade.map((g) => [g.conditionGrade, g._count])),
      byZone: Object.fromEntries(
        byZone.filter((z) => z.zone).map((z) => [z.zone!, z._count])
      ),
      followUpCount,
      byPriority,
    };
  },

  /**
   * Get inspections for sync (mobile app)
   */
  async getInspectionsForSync(
    userId: string,
    lastSyncAt?: Date
  ): Promise<Inspection[]> {
    const where: Prisma.InspectionWhereInput = {
      engineerId: userId,
    };

    if (lastSyncAt) {
      where.updatedAt = { gt: lastSyncAt };
    }

    return prisma.inspection.findMany({
      where,
      include: {
        asset: true,
        media: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  },
};
