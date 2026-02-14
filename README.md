# Silvertown Tunnel Asset Inspection System

A production-ready asset inspection system for the Silvertown Tunnel (London, UK), consisting of a web-based admin system, native iOS app, and branded PDF report generation.

## Project Structure

```
tunnel/
├── docs/                          # Documentation
│   ├── ARCHITECTURE.md            # System architecture & tech stack
│   ├── API_ENDPOINTS.md           # Complete API reference
│   ├── UX_SCREENS.md              # UI/UX wireframes (web & iOS)
│   ├── IMPLEMENTATION_PLAN.md     # Phased implementation plan
│   └── EDGE_CASES_AND_ASSUMPTIONS.md
│
├── backend/                       # Node.js API
│   ├── src/
│   │   ├── api/                   # Routes & plugins
│   │   │   ├── routes/            # API route handlers
│   │   │   └── plugins/           # Fastify plugins (auth, error)
│   │   ├── services/              # Business logic
│   │   ├── config/                # Configuration
│   │   └── types/                 # TypeScript types
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   └── package.json
│
├── web/                           # Next.js web app
│   ├── src/
│   │   ├── app/                   # Next.js 14 app router
│   │   ├── components/            # React components
│   │   ├── hooks/                 # Custom hooks (useAuth)
│   │   ├── services/              # API client
│   │   └── types/                 # TypeScript types
│   └── package.json
│
└── ios/                           # SwiftUI iOS app
    └── SilvertownInspector/
        ├── Models/                # SwiftData models
        ├── Views/                 # SwiftUI views
        ├── ViewModels/            # View models
        └── Services/              # API & Auth services
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend API** | Node.js + TypeScript + Fastify |
| **Database** | PostgreSQL + Prisma ORM |
| **Web Frontend** | Next.js 14 + React + Tailwind CSS |
| **iOS App** | SwiftUI + SwiftData |
| **File Storage** | AWS S3 + CloudFront |
| **PDF Generation** | Puppeteer |
| **Email** | SendGrid |
| **Queue** | Redis + BullMQ |

## Key Features

### Web Admin System
- Asset management with import (CSV/XLSX)
- Inspection tracking with filters and search
- Report generation with export (PDF/CSV)
- User management with RBAC (Admin/Manager/Engineer)
- INFRATEC branded UI

### iOS App (iPhone & iPad)
- Offline-first architecture
- Asset search and selection
- Inspection creation with photo/video capture
- Condition grading (1-5 scale)
- Background sync when connectivity returns

### PDF Reports
- INFRATEC branded header/footer
- Asset and inspection details
- Condition grade visualization
- Embedded photo thumbnails
- Email distribution

## Condition Grading Scale

| Grade | Status | Color | Action |
|-------|--------|-------|--------|
| 1 | No deterioration | 🟢 Green | No action |
| 2 | Minor deterioration | 🟢 Lime | Monitor/plan maintenance |
| 3 | Moderate deterioration | 🟠 Amber | Maintenance within 6-12 months |
| 4 | Significant deterioration | 🟠 Orange | Works within 1-6 months |
| 5 | Severe deterioration/failure | 🔴 Red | Urgent immediate action |

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Xcode 15+ (for iOS development)
- AWS account (S3, CloudFront)
- SendGrid account

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env  # Configure environment variables
npx prisma migrate dev
npm run dev
```

### Web Setup
```bash
cd web
npm install
npm run dev
```

### iOS Setup
```bash
cd ios/SilvertownInspector
open SilvertownInspector.xcodeproj
# Build and run in Xcode
```

## Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/silvertown
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_S3_BUCKET=silvertown-media
SENDGRID_API_KEY=xxx
```

## API Documentation

Full API documentation is available at `/docs` when running the backend server.

See [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) for the complete API reference.

## Data Model

See [backend/prisma/schema.prisma](backend/prisma/schema.prisma) for the complete database schema.

### Core Entities
- **Asset**: level1 (MEP), level2, level3, assetId, zone
- **Inspection**: asset, engineer, date, conditionGrade, comments, status
- **Media**: photos and videos attached to inspections
- **GeneratedReport**: PDF reports with email tracking

## RBAC Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: users, assets, settings, imports |
| **Manager** | View all, export reports, no user management |
| **Engineer** | Create/view own inspections, view assets |

## Offline Sync Strategy

The iOS app uses a **server-wins** conflict resolution strategy:

1. Changes are stored locally in SwiftData
2. When connectivity returns, changes are pushed to server
3. If a conflict is detected (different `syncVersion`), server version wins
4. Client is notified of conflict and receives merged state

## Security Features

- JWT authentication with refresh token rotation
- Pre-signed S3 URLs for media access
- Role-based access control
- Audit logging for all key actions
- TLS encryption in transit
- Server-side encryption at rest (S3)

## Deployment

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the recommended AWS deployment architecture:

- ECS Fargate for API containers
- RDS PostgreSQL (Multi-AZ)
- ElastiCache Redis
- S3 + CloudFront for media
- Route 53 for DNS

## License

Proprietary - INFRATEC

---

© 2024 INFRATEC. All rights reserved.
