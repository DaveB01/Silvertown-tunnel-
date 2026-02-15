import { Role, ConditionGrade, InspectionStatus, MediaType, AuditAction } from '@prisma/client';

// Re-export Prisma enums
export { Role, ConditionGrade, InspectionStatus, MediaType, AuditAction };

// User types
export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Asset status filter type
export type AssetStatusFilter = 'critical' | 'attention' | 'monitor' | 'due-soon' | 'good' | 'not-inspected';

// Asset types
export interface AssetFilter {
  zone?: string;
  level1?: string;
  level2?: string;
  level3?: string;
  region?: string;
  facility?: string;
  search?: string;
  hasInspections?: boolean;
  status?: AssetStatusFilter;
}

export interface AssetImportRow {
  // Required fields
  assetId: string;      // Unique Identifier (e.g., "M120012S1CMC8428")
  level2: string;       // Sub-category (e.g., "COMMS")
  level3: string;       // Asset type (e.g., "Cables")
  zone: string;         // Zone (e.g., "Northbound")

  // Optional fields
  level1?: string;      // Top category (e.g., "MEP")
  assetCode?: string;   // Short code (e.g., "CMC")
  title?: string;       // Full title
  description?: string; // Detailed description
  region?: string;      // Region (e.g., "Tunnel")
  space?: string;       // Space/location
  facility?: string;    // Facility name
  specification?: string; // Document reference
  assetType?: string;   // Type classification
  system?: string;      // System name
}

export interface ImportValidationResult {
  valid: boolean;
  totalRows: number;
  validRows: number;
  duplicates: number;
  errors: Array<{
    row: number;
    column: string;
    error: string;
  }>;
  preview: Array<{
    row: number;
    data: AssetImportRow;
    status: 'new' | 'duplicate' | 'error';
  }>;
}

// Inspection types
export interface InspectionFilter {
  assetId?: string;
  engineerId?: string;
  zone?: string;
  level3?: string;
  status?: InspectionStatus;
  conditionGrade?: ConditionGrade;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  followUpRequired?: boolean;
  priority?: 'P1' | 'P2' | 'P3' | 'P4';
}

// Condition grade metadata
export const CONDITION_GRADES = {
  GRADE_1: {
    value: 1,
    label: 'No deterioration',
    description: 'No action required',
    color: '#22C55E',
  },
  GRADE_2: {
    value: 2,
    label: 'Minor deterioration',
    description: 'Monitor / Plan maintenance',
    color: '#84CC16',
  },
  GRADE_3: {
    value: 3,
    label: 'Moderate deterioration',
    description: 'Maintenance within 6-12 months',
    color: '#F59E0B',
  },
  GRADE_4: {
    value: 4,
    label: 'Significant deterioration',
    description: 'Programmed works within 1-6 months',
    color: '#F97316',
  },
  GRADE_5: {
    value: 5,
    label: 'Severe deterioration / failure',
    description: 'Urgent immediate action required',
    color: '#EF4444',
  },
} as const;

// Sync types
export interface SyncOperation {
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'inspection' | 'media';
  clientId?: string;
  id?: string;
  data: Record<string, unknown>;
  localTimestamp: string;
  syncVersion?: number;
}

export interface SyncResult {
  clientId?: string;
  id?: string;
  status: 'created' | 'updated' | 'deleted' | 'conflict' | 'error';
  serverVersion?: Record<string, unknown>;
  resolution?: 'server_wins' | 'client_wins' | 'merged';
  error?: string;
}

// Media types
export interface MediaUploadRequest {
  filename: string;
  mimeType: string;
  fileSize: number;
}

export interface PresignedUploadResponse {
  mediaId: string;
  uploadUrl: string;
  expiresAt: Date;
  maxFileSize: number;
  // Cloudinary-specific fields (only present when using Cloudinary)
  cloudinaryData?: {
    signature: string;
    timestamp: number;
    apiKey: string;
    folder: string;
    publicId: string;
  };
}

// Report types
export interface ReportGenerationRequest {
  inspectionId: string;
  templateVersion?: string;
}

export interface EmailReportRequest {
  recipients: string[];
  includeMedia: boolean;
  message?: string;
}

// Audit types
export interface AuditLogEntry {
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// Fastify augmentation
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
