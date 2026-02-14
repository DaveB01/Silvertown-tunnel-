import { prisma } from '../config/database.js';
import { Asset, Prisma } from '@prisma/client';
import {
  AssetFilter,
  AssetImportRow,
  ImportValidationResult,
  PaginationParams,
  PaginatedResponse,
  AuditAction,
  AssetStatusFilter,
} from '../types/index.js';
import { ConditionGrade } from '@prisma/client';
import { auditService } from './audit.service.js';

export interface AssetWithStats extends Asset {
  inspectionCount?: number;
  lastInspectionDate?: Date | null;
  lastConditionGrade?: string | null;
}

export interface CreateAssetInput {
  // Required fields
  assetId: string;      // Unique identifier
  level2: string;       // Sub-category
  level3: string;       // Asset type
  zone: string;         // Zone

  // Optional fields
  level1?: string;      // Top category (defaults to "MEP")
  assetCode?: string;   // Short code
  title?: string;       // Full title
  description?: string; // Description
  region?: string;      // Region
  space?: string;       // Space/location
  facility?: string;    // Facility name
  specification?: string; // Document reference
  assetType?: string;   // Type classification
  system?: string;      // System name
  location?: string;    // Legacy location field
}

export const assetService = {
  /**
   * Get assets with filtering and pagination
   */
  async getAssets(
    filter: AssetFilter,
    pagination: PaginationParams,
    sortBy: string = 'assetId',
    sortOrder: 'asc' | 'desc' = 'asc'
  ): Promise<PaginatedResponse<AssetWithStats>> {
    const where: Prisma.AssetWhereInput = {};

    if (filter.zone) {
      where.zone = filter.zone;
    }
    if (filter.level1) {
      where.level1 = filter.level1;
    }
    if (filter.level2) {
      where.level2 = filter.level2;
    }
    if (filter.level3) {
      where.level3 = filter.level3;
    }
    if (filter.region) {
      where.region = filter.region;
    }
    if (filter.facility) {
      where.facility = filter.facility;
    }
    if (filter.search) {
      where.OR = [
        { assetId: { contains: filter.search, mode: 'insensitive' } },
        { assetCode: { contains: filter.search, mode: 'insensitive' } },
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    if (filter.hasInspections !== undefined) {
      if (filter.hasInspections) {
        where.inspections = { some: {} };
      } else {
        where.inspections = { none: {} };
      }
    }

    // Status filter based on condition grade and next inspection due date
    if (filter.status) {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      switch (filter.status) {
        case 'critical':
          // GRADE_5
          where.lastConditionGrade = ConditionGrade.GRADE_5;
          break;
        case 'attention':
          // GRADE_4, GRADE_5, or overdue
          where.OR = [
            { lastConditionGrade: ConditionGrade.GRADE_5 },
            { lastConditionGrade: ConditionGrade.GRADE_4 },
            { nextInspectionDue: { lt: now } },
          ];
          break;
        case 'monitor':
          // GRADE_3
          where.lastConditionGrade = ConditionGrade.GRADE_3;
          break;
        case 'due-soon':
          // Due within 30 days but not overdue
          where.AND = [
            { nextInspectionDue: { gte: now } },
            { nextInspectionDue: { lte: thirtyDaysFromNow } },
            { lastConditionGrade: { notIn: [ConditionGrade.GRADE_3, ConditionGrade.GRADE_4, ConditionGrade.GRADE_5] } },
          ];
          break;
        case 'good':
          // GRADE_1 or GRADE_2, not due soon
          where.AND = [
            { lastConditionGrade: { in: [ConditionGrade.GRADE_1, ConditionGrade.GRADE_2] } },
            {
              OR: [
                { nextInspectionDue: { gt: thirtyDaysFromNow } },
                { nextInspectionDue: null },
              ],
            },
          ];
          break;
        case 'not-inspected':
          // No inspection data
          where.lastConditionGrade = null;
          break;
      }
    }

    const orderBy: Prisma.AssetOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: {
          inspections: {
            orderBy: { dateOfInspection: 'desc' },
            take: 1,
            select: {
              dateOfInspection: true,
              conditionGrade: true,
            },
          },
          _count: {
            select: { inspections: true },
          },
        },
      }),
      prisma.asset.count({ where }),
    ]);

    const data: AssetWithStats[] = assets.map((asset) => ({
      ...asset,
      inspectionCount: asset._count.inspections,
      lastInspectionDate: asset.inspections[0]?.dateOfInspection || null,
      lastConditionGrade: asset.inspections[0]?.conditionGrade || null,
      inspections: undefined,
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
   * Get asset by ID with inspection history
   */
  async getAssetById(id: string): Promise<Asset | null> {
    return prisma.asset.findUnique({
      where: { id },
      include: {
        inspections: {
          orderBy: { dateOfInspection: 'desc' },
          take: 20,
          include: {
            engineer: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });
  },

  /**
   * Get asset by external asset ID
   */
  async getAssetByAssetId(assetId: string): Promise<Asset | null> {
    return prisma.asset.findUnique({
      where: { assetId },
    });
  },

  /**
   * Create a new asset
   */
  async createAsset(
    input: CreateAssetInput,
    userId: string,
    userEmail: string
  ): Promise<Asset> {
    const asset = await prisma.asset.create({
      data: {
        level1: input.level1 || 'MEP',
        level2: input.level2,
        level3: input.level3,
        assetId: input.assetId,
        assetCode: input.assetCode,
        title: input.title,
        zone: input.zone,
        region: input.region,
        space: input.space,
        description: input.description,
        facility: input.facility,
        specification: input.specification,
        assetType: input.assetType,
        system: input.system,
        location: input.location,
      },
    });

    await auditService.log({
      userId,
      userEmail,
      action: AuditAction.CREATE,
      entityType: 'asset',
      entityId: asset.id,
      description: `Created asset ${asset.assetId}`,
      metadata: { assetId: asset.assetId, zone: asset.zone },
    });

    return asset;
  },

  /**
   * Update an asset
   */
  async updateAsset(
    id: string,
    input: Partial<CreateAssetInput>,
    userId: string,
    userEmail: string
  ): Promise<Asset> {
    const asset = await prisma.asset.update({
      where: { id },
      data: input,
    });

    await auditService.log({
      userId,
      userEmail,
      action: AuditAction.UPDATE,
      entityType: 'asset',
      entityId: asset.id,
      description: `Updated asset ${asset.assetId}`,
      metadata: { changes: input },
    });

    return asset;
  },

  /**
   * Delete an asset (only if no inspections exist)
   */
  async deleteAsset(id: string, userId: string, userEmail: string): Promise<void> {
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: { _count: { select: { inspections: true } } },
    });

    if (!asset) {
      throw new Error('Asset not found');
    }

    if (asset._count.inspections > 0) {
      throw new Error('Cannot delete asset with existing inspections');
    }

    await prisma.asset.delete({ where: { id } });

    await auditService.log({
      userId,
      userEmail,
      action: AuditAction.DELETE,
      entityType: 'asset',
      entityId: id,
      description: `Deleted asset ${asset.assetId}`,
    });
  },

  /**
   * Validate import data
   */
  async validateImport(
    rows: AssetImportRow[],
    skipDuplicates: boolean
  ): Promise<ImportValidationResult> {
    const errors: ImportValidationResult['errors'] = [];
    const preview: ImportValidationResult['preview'] = [];
    let duplicates = 0;
    let validRows = 0;

    // Get existing asset IDs for duplicate check
    const existingAssetIds = new Set(
      (await prisma.asset.findMany({ select: { assetId: true } })).map((a) => a.assetId)
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      let status: 'new' | 'duplicate' | 'error' = 'new';

      // Validate required fields
      if (!row.assetId || row.assetId.trim() === '') {
        errors.push({ row: rowNum, column: 'assetId', error: 'Asset ID is required' });
        status = 'error';
      }
      if (!row.level2 || row.level2.trim() === '') {
        errors.push({ row: rowNum, column: 'level2', error: 'Level 2 is required' });
        status = 'error';
      }
      if (!row.level3 || row.level3.trim() === '') {
        errors.push({ row: rowNum, column: 'level3', error: 'Level 3 (Asset Type) is required' });
        status = 'error';
      }
      if (!row.zone || row.zone.trim() === '') {
        errors.push({ row: rowNum, column: 'zone', error: 'Zone is required' });
        status = 'error';
      }

      // Check for duplicates
      if (status !== 'error' && existingAssetIds.has(row.assetId)) {
        if (skipDuplicates) {
          status = 'duplicate';
          duplicates++;
        } else {
          errors.push({
            row: rowNum,
            column: 'assetId',
            error: `Asset ID already exists: ${row.assetId}`,
          });
          status = 'error';
        }
      }

      if (status === 'new') {
        validRows++;
        existingAssetIds.add(row.assetId); // Track for duplicates within the file
      }

      // Add to preview (first 10 rows)
      if (preview.length < 10) {
        preview.push({ row: rowNum, data: row, status });
      }
    }

    return {
      valid: errors.length === 0 || (skipDuplicates && errors.length === duplicates),
      totalRows: rows.length,
      validRows,
      duplicates,
      errors,
      preview,
    };
  },

  /**
   * Execute import
   */
  async executeImport(
    rows: AssetImportRow[],
    batchId: string,
    userId: string,
    userEmail: string,
    skipDuplicates: boolean
  ): Promise<{ success: number; skipped: number; errors: number }> {
    let success = 0;
    let skipped = 0;
    let errorCount = 0;

    const existingAssetIds = new Set(
      (await prisma.asset.findMany({ select: { assetId: true } })).map((a) => a.assetId)
    );

    for (const row of rows) {
      try {
        if (existingAssetIds.has(row.assetId)) {
          if (skipDuplicates) {
            skipped++;
            continue;
          }
        }

        await prisma.asset.create({
          data: {
            level1: row.level1?.trim() || 'MEP',
            level2: row.level2.trim(),
            level3: row.level3.trim(),
            assetId: row.assetId.trim(),
            assetCode: row.assetCode?.trim(),
            title: row.title?.trim(),
            zone: row.zone.trim(),
            region: row.region?.trim(),
            space: row.space?.trim(),
            description: row.description?.trim(),
            facility: row.facility?.trim(),
            specification: row.specification?.trim(),
            assetType: row.assetType?.trim(),
            system: row.system?.trim(),
            importBatchId: batchId,
          },
        });
        success++;
        existingAssetIds.add(row.assetId);
      } catch (error) {
        errorCount++;
      }
    }

    await auditService.log({
      userId,
      userEmail,
      action: AuditAction.IMPORT,
      entityType: 'asset',
      description: `Imported ${success} assets (${skipped} skipped, ${errorCount} errors)`,
      metadata: { batchId, success, skipped, errors: errorCount },
    });

    return { success, skipped, errors: errorCount };
  },

  /**
   * Update asset's denormalized inspection tracking fields after an inspection
   */
  async updateAfterInspection(
    assetId: string,
    inspection: {
      id: string;
      dateOfInspection: Date;
      conditionGrade: ConditionGrade;
      riskScore: number | null;
      inspectorName?: string | null;
    }
  ): Promise<void> {
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: { inspectionFrequencyMonths: true },
    });

    if (!asset) return;

    // Calculate next inspection due date
    const nextInspectionDue = new Date(inspection.dateOfInspection);
    nextInspectionDue.setMonth(nextInspectionDue.getMonth() + (asset.inspectionFrequencyMonths || 12));

    await prisma.asset.update({
      where: { id: assetId },
      data: {
        lastInspectionId: inspection.id,
        lastInspectionDate: inspection.dateOfInspection,
        lastConditionGrade: inspection.conditionGrade,
        lastRiskScore: inspection.riskScore,
        lastInspectorName: inspection.inspectorName,
        nextInspectionDue,
        inspectionCount: { increment: 1 },
      },
    });
  },

  /**
   * Get distinct values for filters
   */
  async getFilterOptions(): Promise<{
    zones: string[];
    level1Values: string[];
    level2Values: string[];
    level3Values: string[];
    regions: string[];
    facilities: string[];
  }> {
    const [zones, level1Values, level2Values, level3Values, regions, facilities] = await Promise.all([
      prisma.asset.findMany({
        distinct: ['zone'],
        select: { zone: true },
        orderBy: { zone: 'asc' },
      }),
      prisma.asset.findMany({
        distinct: ['level1'],
        select: { level1: true },
        orderBy: { level1: 'asc' },
      }),
      prisma.asset.findMany({
        distinct: ['level2'],
        select: { level2: true },
        orderBy: { level2: 'asc' },
      }),
      prisma.asset.findMany({
        distinct: ['level3'],
        select: { level3: true },
        orderBy: { level3: 'asc' },
      }),
      prisma.asset.findMany({
        distinct: ['region'],
        select: { region: true },
        where: { region: { not: null } },
        orderBy: { region: 'asc' },
      }),
      prisma.asset.findMany({
        distinct: ['facility'],
        select: { facility: true },
        where: { facility: { not: null } },
        orderBy: { facility: 'asc' },
      }),
    ]);

    return {
      zones: zones.map((z) => z.zone),
      level1Values: level1Values.map((l) => l.level1),
      level2Values: level2Values.map((l) => l.level2),
      level3Values: level3Values.map((l) => l.level3),
      regions: regions.map((r) => r.region).filter((r): r is string => r !== null),
      facilities: facilities.map((f) => f.facility).filter((f): f is string => f !== null),
    };
  },
};
