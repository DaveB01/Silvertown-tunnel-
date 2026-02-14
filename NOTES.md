# Silvertown Tunnel Inspection System - Development Notes

## Current State (9 Feb 2026)

### Completed Features

#### Backend (Fastify + Prisma + PostgreSQL)
- **Authentication**: JWT-based auth with refresh tokens
- **Assets**: CRUD operations, CSV import, filter options endpoint
- **Inspections**: Full CRUD with new assessment fields:
  - `inspectorName`, `defectSeverity`, `riskScore`
  - `defectDescription`, `observedIssues`, `recommendedAction`
  - `followUpRequired` boolean
- **Risk Score**: Calculated as `conditionGrade × defectSeverity` (1-25 range)
- **Priority System**: P1 (≥15), P2 (10-14), P3 (5-9), P4 (<5)
- **Asset Tracking**: Denormalized fields on Asset for fast queries:
  - `lastInspectionId`, `lastInspectionDate`, `lastConditionGrade`
  - `lastRiskScore`, `lastInspectorName`, `inspectionCount`
  - `inspectionFrequencyMonths`, `nextInspectionDue`
- **Media**: Upload endpoint with local file storage (`/uploads`), signed URLs
- **Filters**:
  - Inspections: zone, status, grade, engineer, priority, followUp, dateRange
  - Assets: zone, level2, region, status (critical/attention/monitor/due-soon/good/not-inspected)

#### Frontend (Next.js 14 + Tailwind)
- **Dashboard**:
  - Summary cards: Assets, Inspections, Follow Up, Attention (clickable)
  - Priority section showing P1-P4 breakdown
- **Assets Page**:
  - Collapsible filters panel
  - Status column showing condition-based status
  - URL param support for filter links
- **Asset Detail**:
  - Full asset info, inspection history
  - Next inspection due with overdue/due-soon indicators
  - Grade scale reference
- **Inspections Page**:
  - Collapsible filters (zone, status, grade, inspector, priority, date range, follow-up)
  - Priority column, follow-up badges
  - URL param support
- **Inspection Form**:
  - All new assessment fields
  - Photo upload with preview
  - Auto-sets status to COMPLETE on save
- **Inspection Detail**:
  - Full inspection view with media gallery
  - Risk score and priority display

### Data Model Summary

```
Asset
├── Identification: assetId, assetCode, title
├── Hierarchy: level1, level2, level3
├── Location: zone, region, space, facility
├── Inspection Tracking (denormalized):
│   ├── lastInspectionId, lastInspectionDate
│   ├── lastConditionGrade, lastRiskScore
│   ├── inspectionCount, nextInspectionDue
│   └── inspectionFrequencyMonths (default: 12)

Inspection
├── Core: assetId, engineerId, dateOfInspection
├── Assessment: conditionGrade (1-5), defectSeverity (1-5)
├── Calculated: riskScore (grade × severity)
├── Details: comments, defectDescription, observedIssues
├── Actions: recommendedAction, followUpRequired
├── Status: NOT_STARTED, IN_PROGRESS, COMPLETE, SUBMITTED
└── Media: photos/videos via Media table
```

### Condition Grades
- Grade 1: No deterioration (green)
- Grade 2: Minor deterioration (lime)
- Grade 3: Moderate deterioration (amber)
- Grade 4: Significant deterioration (orange)
- Grade 5: Severe deterioration/failure (red)

### Priority Levels (based on riskScore)
- P1 Critical: ≥15 (e.g., Grade 5 × Severity 3+)
- P2 High: 10-14
- P3 Medium: 5-9
- P4 Low: <5

---

## Next Up: Reports

### Requirements to Clarify
- What should be on the reports page?
- Types of reports needed:
  - Individual inspection PDF?
  - Summary reports (by zone, by date range, by priority)?
  - Export to Excel/CSV?
- Report generation: on-demand vs scheduled?
- Email distribution functionality?

### Existing Report Infrastructure
- `GeneratedReport` model exists in schema
- `reportService.queueReportGeneration()` exists but may need implementation
- Reports are linked to inspections

### Potential Report Features
1. **Inspection Reports**: PDF export of single inspection with photos
2. **Summary Reports**:
   - Assets requiring attention
   - Inspections by date range
   - Priority breakdown
3. **Scheduled Reports**: Weekly/monthly summaries
4. **Export**: CSV/Excel export of filtered data

---

## Running the Project

```bash
# Backend
cd backend
npm run dev          # tsx watch on port 3000

# Frontend
cd web
npm run dev          # Next.js on port 3001

# Database
# PostgreSQL on localhost:5432
# Redis on localhost:6379
```

## Test Credentials
- Email: admin@infratec.co.uk
- Password: admin123
