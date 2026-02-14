# Silvertown Tunnel Inspection System - Implementation Plan

## Phase Overview

| Phase | Duration | Focus |
|-------|----------|-------|
| 1 | Foundation | Backend API, Database, Auth |
| 2 | Core Features | Assets, Inspections, Media |
| 3 | Web Application | Admin UI, Reports |
| 4 | iOS Application | Native app, Offline support |
| 5 | PDF & Email | Report generation, Distribution |
| 6 | Polish & Launch | Testing, Security audit, Deployment |

---

## Phase 1: Foundation

### Milestone 1.1: Project Setup
- [ ] Initialize monorepo structure
- [ ] Setup backend Node.js project with TypeScript
- [ ] Configure ESLint, Prettier, Husky
- [ ] Setup Prisma with PostgreSQL
- [ ] Create database schema migrations
- [ ] Configure Docker for local development
- [ ] Setup CI/CD pipeline (GitHub Actions)

### Milestone 1.2: Authentication System
- [ ] Implement user registration (admin-only creation)
- [ ] Implement email/password login
- [ ] JWT access token generation
- [ ] Refresh token rotation
- [ ] Password hashing with bcrypt
- [ ] Role-based middleware (ADMIN, MANAGER, ENGINEER)
- [ ] Prepare SSO integration points (future)

### Milestone 1.3: Core Infrastructure
- [ ] Setup AWS S3 bucket for media storage
- [ ] Configure CloudFront CDN
- [ ] Setup Redis for caching/sessions
- [ ] Implement audit logging service
- [ ] Setup error tracking (Sentry)
- [ ] Configure application logging (structured JSON)

**Deliverables:**
- Working API with authentication
- Database with all tables
- S3 bucket configured
- CI pipeline running tests

---

## Phase 2: Core Features

### Milestone 2.1: Asset Management
- [ ] CRUD endpoints for assets
- [ ] Asset list with filtering & pagination
- [ ] Asset search (assetId, zone, type)
- [ ] CSV/XLSX import service
  - [ ] File upload endpoint
  - [ ] Column detection & mapping
  - [ ] Validation with detailed errors
  - [ ] Preview before import
  - [ ] Batch import with transaction
  - [ ] Duplicate handling (skip/update)
- [ ] Export assets to CSV

### Milestone 2.2: Inspection Management
- [ ] CRUD endpoints for inspections
- [ ] Inspection list with filters (date, zone, status, engineer)
- [ ] Inspection status workflow (NOT_STARTED → IN_PROGRESS → COMPLETE → SUBMITTED)
- [ ] Condition grade validation (1-5)
- [ ] Link inspections to assets
- [ ] Audit logging for all inspection changes

### Milestone 2.3: Media Management
- [ ] Pre-signed URL generation for upload
- [ ] Media upload confirmation endpoint
- [ ] Thumbnail generation (Lambda or server-side)
- [ ] Media deletion (soft delete + S3 cleanup)
- [ ] Signed URL generation for viewing
- [ ] Video handling (size limits, duration)

**Deliverables:**
- Full CRUD for assets and inspections
- Working import system
- Media upload/download working

---

## Phase 3: Web Application

### Milestone 3.1: Web Setup
- [ ] Initialize Next.js 14 project
- [ ] Configure Tailwind CSS with INFRATEC theme
- [ ] Setup authentication context/hooks
- [ ] Create layout components (sidebar, header)
- [ ] Implement protected routes
- [ ] Setup API client (fetch wrapper or React Query)

### Milestone 3.2: Authentication Pages
- [ ] Login page
- [ ] Password reset flow
- [ ] Session management (auto-refresh, logout)

### Milestone 3.3: Dashboard
- [ ] Summary statistics cards
- [ ] Condition grade distribution chart
- [ ] Recent inspections list
- [ ] Assets requiring attention alerts

### Milestone 3.4: Assets Module
- [ ] Asset list table with sorting
- [ ] Filter sidebar (zone, level2, level3)
- [ ] Asset detail page
- [ ] Inspection history on asset detail
- [ ] Condition trend chart
- [ ] Add/edit asset modal
- [ ] Delete asset confirmation

### Milestone 3.5: Asset Import
- [ ] File upload dropzone
- [ ] Column mapping interface
- [ ] Validation results display
- [ ] Import progress indicator
- [ ] Error report display

### Milestone 3.6: Inspections Module
- [ ] Inspection list with filters
- [ ] Quick filter buttons (Today, This Week, Pending)
- [ ] Inspection detail page
- [ ] Condition grade visual display
- [ ] Photo/video gallery with lightbox
- [ ] Report section with PDF viewer

### Milestone 3.7: Reports Module
- [ ] Report generation forms
- [ ] Date range, zone, status filters
- [ ] CSV export functionality
- [ ] PDF export integration
- [ ] Report history list

### Milestone 3.8: User Management (Admin)
- [ ] User list with filters
- [ ] Add user form
- [ ] Edit user form
- [ ] Deactivate user
- [ ] Role assignment

### Milestone 3.9: Settings (Admin)
- [ ] Branding configuration
- [ ] Email recipients configuration
- [ ] System settings

**Deliverables:**
- Fully functional web admin system
- All CRUD operations working
- Responsive design complete

---

## Phase 4: iOS Application

### Milestone 4.1: iOS Setup
- [ ] Initialize Xcode project (SwiftUI)
- [ ] Configure project structure (MVVM)
- [ ] Setup Core Data for offline storage
- [ ] Configure networking layer
- [ ] Setup INFRATEC theming
- [ ] Configure app icons and launch screen

### Milestone 4.2: Authentication
- [ ] Login screen
- [ ] Secure token storage (Keychain)
- [ ] Auto-refresh logic
- [ ] Logout functionality
- [ ] Biometric authentication option

### Milestone 4.3: Main Navigation
- [ ] Tab bar implementation
- [ ] Home dashboard view
- [ ] Inspections list view
- [ ] Profile view
- [ ] iPad split view adaptation

### Milestone 4.4: Asset Selection
- [ ] Asset search interface
- [ ] Filter by zone
- [ ] Asset detail view
- [ ] QR code scanning (future)

### Milestone 4.5: Inspection Creation
- [ ] Inspection form view
- [ ] Condition grade picker (1-5 with colors)
- [ ] Comments text editor
- [ ] Date/time picker
- [ ] Form validation

### Milestone 4.6: Media Capture
- [ ] Camera integration (photo)
- [ ] Camera integration (video)
- [ ] Photo gallery picker
- [ ] Thumbnail preview
- [ ] Caption entry
- [ ] Media deletion

### Milestone 4.7: Inspection List & Detail
- [ ] Inspections list with filters
- [ ] Pull-to-refresh
- [ ] Inspection detail view
- [ ] Media gallery viewer
- [ ] PDF report viewer (in-app)

### Milestone 4.8: Offline Support
- [ ] Core Data schema mirroring API
- [ ] Offline asset cache
- [ ] Offline inspection creation
- [ ] Local media storage
- [ ] Sync queue management
- [ ] Conflict resolution (server-wins)
- [ ] Background sync
- [ ] Offline indicator UI
- [ ] Pending changes indicator

### Milestone 4.9: Push Notifications
- [ ] Push notification setup
- [ ] Inspection submitted notification
- [ ] Report ready notification

**Deliverables:**
- Universal iOS app (iPhone + iPad)
- Full offline capability
- Published to TestFlight

---

## Phase 5: PDF & Email

### Milestone 5.1: PDF Generation
- [ ] HTML template design (INFRATEC branded)
- [ ] Puppeteer service setup
- [ ] Asset details section
- [ ] Inspection details section
- [ ] Condition grade visual
- [ ] Photo embedding (thumbnails)
- [ ] Video links
- [ ] Header/footer with branding
- [ ] PDF storage to S3

### Milestone 5.2: Email Service
- [ ] SendGrid integration
- [ ] Email template design
- [ ] PDF attachment logic
- [ ] Large file handling (links vs attachments)
- [ ] Email status tracking
- [ ] Retry logic for failures
- [ ] Configurable recipients

### Milestone 5.3: Automated Triggers
- [ ] PDF generation on inspection submit
- [ ] Queue-based processing (BullMQ)
- [ ] Webhook for manual generation
- [ ] Batch report generation

**Deliverables:**
- Branded PDF reports
- Email distribution working
- Queue system for reliability

---

## Phase 6: Polish & Launch

### Milestone 6.1: Testing
- [ ] Backend unit tests (Jest)
- [ ] Backend integration tests
- [ ] Web E2E tests (Playwright)
- [ ] iOS unit tests
- [ ] iOS UI tests
- [ ] Load testing
- [ ] Security penetration testing

### Milestone 6.2: Security Audit
- [ ] OWASP top 10 review
- [ ] Authentication security review
- [ ] Authorization edge cases
- [ ] Data encryption verification
- [ ] API rate limiting
- [ ] Input sanitization
- [ ] SQL injection prevention
- [ ] XSS prevention

### Milestone 6.3: Performance Optimization
- [ ] Database query optimization
- [ ] Index verification
- [ ] API response caching
- [ ] Image optimization
- [ ] Web bundle optimization
- [ ] iOS performance profiling

### Milestone 6.4: Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] User manual (web)
- [ ] User manual (iOS)
- [ ] Admin guide
- [ ] Deployment runbook

### Milestone 6.5: Deployment
- [ ] Production AWS infrastructure
- [ ] Database migration to RDS
- [ ] S3 bucket configuration
- [ ] CloudFront setup
- [ ] SSL certificates
- [ ] Domain configuration
- [ ] Environment variables
- [ ] Monitoring dashboards
- [ ] Alerting rules
- [ ] Backup verification

### Milestone 6.6: Launch
- [ ] iOS App Store submission
- [ ] Production deployment
- [ ] Smoke testing
- [ ] User training materials
- [ ] Handover documentation

**Deliverables:**
- Production-ready system
- iOS app in App Store
- Complete documentation
- Monitoring in place

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Tunnel connectivity issues | Robust offline-first architecture, local caching |
| Large video uploads | Chunked uploads, compression, size limits |
| Data loss | Automated backups, transaction logging, sync confirmation |
| Security breach | OWASP compliance, encryption, audit logging |
| Performance degradation | Caching, CDN, database indexing, load testing |
| Import errors | Detailed validation, preview, rollback capability |

---

## Assumptions Made

1. **Asset hierarchy is fixed**: MEP > Level2 > Level3. No deeper nesting needed.
2. **Single engineer per inspection**: One engineer conducts each inspection.
3. **Zones are predefined**: Zone values will be consistent across imports.
4. **Media size limits**: Photos max 20MB, videos max 500MB.
5. **Report recipients**: Configurable list, not per-inspection.
6. **SSO**: Deferred to future phase, but architecture supports it.
7. **Language**: English only for initial release.
8. **Timezone**: UK timezone (Europe/London) for all date displays.
9. **Retention**: 7-year data retention for inspections (configurable).
10. **Video streaming**: Not required; download-only sufficient.

---

## Dependencies

### External Services
- AWS (S3, CloudFront, RDS, ECS, ElastiCache)
- SendGrid (email)
- Sentry (error tracking)
- Apple Developer Account (iOS deployment)

### Third-party Libraries
- **Backend**: Fastify, Prisma, BullMQ, Puppeteer, Sharp
- **Web**: Next.js, React Query, Tailwind, Recharts
- **iOS**: SwiftUI, Core Data, Alamofire, Kingfisher
