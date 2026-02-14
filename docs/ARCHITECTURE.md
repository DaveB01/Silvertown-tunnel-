# Silvertown Tunnel Asset Inspection System - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│   Web Admin         │   iOS App           │   Email Recipients              │
│   (React/Next.js)   │   (SwiftUI)         │   (PDF Reports)                 │
└─────────┬───────────┴─────────┬───────────┴─────────────────────────────────┘
          │                     │
          │ HTTPS/REST          │ HTTPS/REST + Offline Sync
          │                     │
┌─────────▼─────────────────────▼─────────────────────────────────────────────┐
│                         API GATEWAY / LOAD BALANCER                          │
│                         (AWS ALB / Cloudflare)                               │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                              BACKEND API                                     │
│                         (Node.js + Express/Fastify)                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Auth         │ │ Assets       │ │ Inspections  │ │ Reports      │        │
│  │ Service      │ │ Service      │ │ Service      │ │ Service      │        │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Media        │ │ PDF          │ │ Email        │ │ Sync         │        │
│  │ Service      │ │ Generator    │ │ Service      │ │ Service      │        │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘        │
└───────┬─────────────────┬─────────────────┬─────────────────┬───────────────┘
        │                 │                 │                 │
        ▼                 ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  PostgreSQL   │ │  AWS S3       │ │  Redis        │ │  SendGrid     │
│  (Primary DB) │ │  (Media)      │ │  (Cache/Queue)│ │  (Email)      │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
```

## Technology Stack Rationale

### Backend: Node.js + TypeScript + Fastify
- **Why Node.js**: Excellent async I/O for handling media uploads, mature ecosystem
- **Why TypeScript**: Type safety, better maintainability, shared types with frontend
- **Why Fastify**: Faster than Express, built-in validation (Zod/JSON Schema), better DX

### Database: PostgreSQL + Prisma ORM
- **Why PostgreSQL**: ACID compliance, excellent for relational data, JSONB for flexibility
- **Why Prisma**: Type-safe queries, migrations, excellent TypeScript integration

### Web Frontend: Next.js 14 + React
- **Why Next.js**: Server components, API routes, excellent DX, built-in optimization
- **Why React**: Industry standard, large ecosystem, easy hiring

### iOS App: SwiftUI + Swift Data / Core Data
- **Why SwiftUI**: Modern declarative UI, native performance, less code
- **Why Core Data**: Robust offline storage, sync capabilities, Apple-optimized

### File Storage: AWS S3 + CloudFront
- **Why S3**: Scalable, reliable, cost-effective for large media files
- **Why CloudFront**: CDN for fast media delivery, signed URLs for security

### PDF Generation: Puppeteer + HTML templates
- **Why Puppeteer**: Full control over styling, renders HTML/CSS perfectly
- **Alternative considered**: react-pdf (more complex for branded layouts)

### Email: SendGrid
- **Why SendGrid**: Reliable delivery, templates, tracking, good free tier
- **Alternative**: AWS SES (cheaper at scale but more setup)

### Cache/Queue: Redis + BullMQ
- **Why Redis**: Fast caching, session storage, pub/sub for real-time
- **Why BullMQ**: Robust job queue for PDF generation, email sending

## Data Flow

### 1. Asset Import Flow
```
CSV/XLSX Upload → Validation → Preview → Column Mapping →
Dedupe Check → Transaction Insert → Audit Log
```

### 2. Inspection Creation (Online)
```
Select Asset → Fill Form → Capture Media → Upload Media to S3 →
Save Inspection → Trigger PDF Generation (async) → Audit Log
```

### 3. Inspection Creation (Offline)
```
Select Asset → Fill Form → Capture Media → Save to Core Data →
[Connection Restored] → Sync Service → Conflict Resolution →
Upload Media → Save to Server → Audit Log
```

### 4. Report Generation Flow
```
Inspection Submitted → Queue PDF Job → Render HTML Template →
Puppeteer Screenshot → Upload PDF to S3 → Update Inspection Record →
Queue Email Job → Send via SendGrid → Log Email Status
```

## Offline Sync Strategy

### Conflict Resolution: Server-Wins with Merge
- **Rationale**: Inspections are typically done by one engineer per asset. Server-wins ensures data consistency when multiple devices are involved.
- **Implementation**:
  - Each record has `updatedAt` timestamp and `syncVersion`
  - Client sends pending changes with local timestamps
  - Server compares versions, applies server-wins for conflicts
  - Server returns merged state to client
  - Non-conflicting fields (e.g., new media) are always merged

### Sync Queue Structure
```typescript
interface SyncOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'inspection' | 'media';
  payload: object;
  localTimestamp: Date;
  attempts: number;
  status: 'pending' | 'syncing' | 'failed' | 'complete';
}
```

## Security Architecture

### Authentication
- JWT tokens with short expiry (15 min) + refresh tokens (7 days)
- Refresh token rotation on use
- Device fingerprinting for mobile

### Authorization (RBAC)
```
Admin       → All permissions
Manager     → Read all, export, no user management
Engineer    → CRUD own inspections, read assets
```

### Media Security
- Pre-signed S3 URLs for upload (5 min expiry)
- Signed CloudFront URLs for download (1 hour expiry)
- Server-side encryption at rest (SSE-S3)

### Data Protection (GDPR)
- Data stored in EU region (eu-west-2 London)
- Audit logs for all data access
- Data export capability for subject access requests
- Retention policies with automated deletion

## Deployment Architecture

### Recommended: AWS
```
┌─────────────────────────────────────────────────────────────┐
│                        Route 53                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   CloudFront CDN                             │
│         (Static assets + Media delivery)                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│              Application Load Balancer                       │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐ ┌─────────────▼───────────────┐
│      ECS Fargate            │ │      ECS Fargate            │
│    (API Containers)         │ │    (Worker Containers)      │
│    Auto-scaling 2-10        │ │    PDF/Email jobs           │
└──────────────┬──────────────┘ └─────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────────────────────▼───────────────┐
│                         VPC                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   RDS Postgres  │  │   ElastiCache   │  │     S3       │ │
│  │   (Multi-AZ)    │  │   (Redis)       │  │   (Media)    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Scalability Considerations

1. **Database**: Read replicas for reporting queries
2. **Media**: S3 + CloudFront handles unlimited scale
3. **API**: Horizontal scaling via ECS auto-scaling
4. **PDF Generation**: Separate worker pool, rate limited
5. **Search**: Consider Elasticsearch if asset count > 100K

## Monitoring & Observability

- **Logging**: CloudWatch Logs / Datadog
- **Metrics**: CloudWatch Metrics + custom dashboards
- **Tracing**: AWS X-Ray for request tracing
- **Alerts**: PagerDuty integration for critical issues
- **Audit**: Custom audit log table + CloudTrail

## Backup Strategy

- **Database**: Automated daily snapshots, 30-day retention, point-in-time recovery
- **Media**: S3 versioning + cross-region replication
- **Disaster Recovery**: RTO 4 hours, RPO 1 hour
