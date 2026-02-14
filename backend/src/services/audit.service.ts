import { prisma } from '../config/database.js';
import { AuditLogEntry, AuditAction, PaginationParams, PaginatedResponse } from '../types/index.js';
import { AuditLog } from '@prisma/client';

export interface AuditFilter {
  userId?: string;
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export const auditService = {
  /**
   * Log an audit entry
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          userEmail: entry.userEmail,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          description: entry.description,
          metadata: entry.metadata ?? undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });
    } catch (error) {
      // Log to console but don't throw - audit logging should not break main flow
      console.error('Failed to create audit log:', error);
    }
  },

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(
    filter: AuditFilter,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<AuditLog>> {
    const where: Record<string, unknown> = {};

    if (filter.userId) {
      where.userId = filter.userId;
    }
    if (filter.action) {
      where.action = filter.action;
    }
    if (filter.entityType) {
      where.entityType = filter.entityType;
    }
    if (filter.entityId) {
      where.entityId = filter.entityId;
    }
    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {};
      if (filter.dateFrom) {
        (where.createdAt as Record<string, Date>).gte = filter.dateFrom;
      }
      if (filter.dateTo) {
        (where.createdAt as Record<string, Date>).lte = filter.dateTo;
      }
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

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
   * Get audit logs for a specific entity
   */
  async getEntityAuditLogs(entityType: string, entityId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },
};
