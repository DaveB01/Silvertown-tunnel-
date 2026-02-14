// Shared types for the web application

export type Role = 'ADMIN' | 'MANAGER' | 'ENGINEER';

export type ConditionGrade = 'GRADE_1' | 'GRADE_2' | 'GRADE_3' | 'GRADE_4' | 'GRADE_5';

export type InspectionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'SUBMITTED';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string;
}

export interface Asset {
  id: string;

  // Hierarchy
  level1: string;       // Top category (e.g., "MEP")
  level2: string;       // Sub-category (e.g., "COMMS")
  level3: string;       // Asset type (e.g., "Cables")

  // Identification
  assetId: string;      // Unique identifier (e.g., "M120012S1CMC8428")
  assetCode?: string;   // Short code (e.g., "CMC")
  title?: string;       // Full title

  // Location
  zone: string;         // Zone (e.g., "Northbound")
  region?: string;      // Region (e.g., "Tunnel")
  space?: string;       // Space/location
  location?: string;    // Legacy location field

  // Metadata
  description?: string; // Detailed description
  facility?: string;    // Facility name (e.g., "Silvertown Tunnel")
  specification?: string; // Document reference
  assetType?: string;   // Type classification (e.g., "Project Facilities")
  system?: string;      // System name

  // Timestamps
  createdAt: string;
  updatedAt: string;

  // Inspection tracking (denormalized)
  lastInspectionId?: string;
  lastInspectionDate?: string;
  lastConditionGrade?: ConditionGrade;
  lastRiskScore?: number;
  lastInspectorName?: string;
  inspectionCount?: number;

  // Scheduling
  inspectionFrequencyMonths?: number;
  nextInspectionDue?: string;
}

export interface Inspection {
  id: string;
  assetId: string;
  engineerId: string;
  dateOfInspection: string;
  conditionGrade: ConditionGrade;
  comments?: string;
  status: InspectionStatus;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  asset?: Asset;
  engineer?: Pick<User, 'id' | 'displayName'>;
  media?: Media[];
  reports?: GeneratedReport[];
  mediaCount?: number;
  hasReport?: boolean;
  // New defect assessment fields
  inspectorName?: string;
  defectSeverity?: number;
  riskScore?: number;
  defectDescription?: string;
  observedIssues?: string;
  recommendedAction?: string;
  followUpRequired?: boolean;
}

export interface Media {
  id: string;
  inspectionId: string;
  type: 'PHOTO' | 'VIDEO';
  filename: string;
  mimeType: string;
  fileSize: number;
  storageUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  capturedAt: string;
  signedUrl?: string;
  signedThumbnailUrl?: string;
}

export interface GeneratedReport {
  id: string;
  inspectionId: string;
  pdfUrl: string;
  emailedTo: string[];
  emailStatus: string;
  emailSentAt?: string;
  generatedAt: string;
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

// Condition grade metadata
export const CONDITION_GRADES: Record<
  ConditionGrade,
  { value: number; label: string; description: string; color: string }
> = {
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
};

// Defect severity metadata
export const DEFECT_SEVERITY: Record<
  number,
  { value: number; label: string; description: string; color: string }
> = {
  1: {
    value: 1,
    label: 'Minor',
    description: 'Cosmetic or superficial defect',
    color: '#84CC16',
  },
  2: {
    value: 2,
    label: 'Low',
    description: 'Minor functional impact',
    color: '#EAB308',
  },
  3: {
    value: 3,
    label: 'Medium',
    description: 'Moderate functional impact',
    color: '#F59E0B',
  },
  4: {
    value: 4,
    label: 'High',
    description: 'Significant functional impact',
    color: '#F97316',
  },
  5: {
    value: 5,
    label: 'Critical',
    description: 'Safety hazard or complete failure',
    color: '#EF4444',
  },
};
