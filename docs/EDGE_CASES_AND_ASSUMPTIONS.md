# Silvertown Tunnel Inspection System - Edge Cases & Assumptions

## Assumptions Made

### 1. Business Logic Assumptions

| Assumption | Rationale | Alternative Considered |
|------------|-----------|----------------------|
| **Level 1 is always "MEP"** | All assets are MEP (Mechanical, Electrical, Plumbing) infrastructure | Could make configurable, but adds complexity |
| **Single engineer per inspection** | One engineer conducts each inspection; no collaborative inspections | Multi-engineer inspections would require different data model |
| **Zone values are pre-defined** | Zones are consistent across the tunnel (North Portal, South Portal, Northbound Tube, Southbound Tube) | Dynamic zone creation would require admin UI |
| **Inspections are immutable after submission** | Once submitted, inspections cannot be edited (audit trail) | Could allow edits with version history |
| **One inspection per asset per day** | Engineers don't inspect the same asset twice in one day | No hard constraint enforced; UI could warn |

### 2. Technical Assumptions

| Assumption | Rationale |
|------------|-----------|
| **UK timezone for all operations** | System is UK-specific (Europe/London) |
| **English language only** | Initial release; i18n deferred |
| **Maximum 500MB video file size** | Balance between quality and upload time in tunnel environment |
| **Maximum 5-minute video duration** | Reasonable inspection video length |
| **7-year data retention** | UK infrastructure asset management standards; configurable |
| **Signed URLs expire in 1 hour (download) / 5 mins (upload)** | Security vs usability balance |

### 3. Integration Assumptions

| Assumption | Rationale |
|------------|-----------|
| **No real-time collaboration** | Tunnel environment has poor connectivity; sync-based approach preferred |
| **SSO deferred to Phase 2** | Email/password sufficient for initial launch; architecture supports future SSO |
| **PDF generation is server-side** | Consistent branding; no client-side dependencies |
| **SendGrid for email** | Reliable delivery; can switch to AWS SES if needed |

---

## Edge Cases & Handling

### 1. Asset Import Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Duplicate Asset ID in import file** | Detect and show warning; option to skip or fail entire batch |
| **Duplicate Asset ID exists in database** | Option to skip or update existing asset |
| **Empty required field (assetId, level2, level3, zone)** | Row marked as error; not imported |
| **Invalid characters in Asset ID** | Strip/sanitize on import; warn user |
| **Very large import file (>10,000 rows)** | Process in batches; show progress indicator |
| **Excel file with multiple sheets** | Only process first sheet; warn user |
| **CSV encoding issues (UTF-8 BOM, etc.)** | Auto-detect encoding; normalize to UTF-8 |
| **Column header mismatch** | Manual column mapping UI; suggest based on content |

### 2. Offline Sync Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Same inspection edited on multiple devices** | Server-wins conflict resolution; newer changes preserved on server, client notified |
| **Inspection created offline, asset deleted on server** | Reject sync; show error to user; option to reassign to different asset |
| **Media upload fails mid-upload** | Retry with exponential backoff; store locally until success |
| **App killed during sync** | Sync queue persists; resume on next launch |
| **Very long offline period (weeks)** | Full re-sync on reconnect; potential data staleness warning |
| **Storage full on device** | Warn user before capturing; option to delete synced media |
| **Sync during poor connectivity** | Detect connection quality; batch smaller uploads; pause if too slow |

### 3. Media Handling Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Very large video (approaching 500MB limit)** | Progress indicator; chunked upload; compression option |
| **Corrupted image/video file** | Validation on capture; retry capture if corrupt |
| **Photo taken in portrait/landscape** | Preserve EXIF orientation; display correctly |
| **Video codec not supported** | Transcode to H.264/AAC on device before upload |
| **Thumbnail generation fails** | Use placeholder; retry in background |
| **S3 upload timeout** | Exponential backoff retry; max 3 attempts; fallback to queue |
| **CloudFront signed URL expires while viewing** | Auto-refresh URL on 403; seamless to user |

### 4. Authentication Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Token expires during long form submission** | Automatic token refresh; retry failed request |
| **Refresh token stolen/compromised** | Token rotation on every refresh; revoke on anomaly detection |
| **User deactivated while logged in** | Next API call returns 401; force logout; clear local data |
| **Password changed on another device** | Current sessions remain valid until token expires; future: force logout option |
| **Multiple simultaneous login attempts** | Rate limiting (5 attempts per minute per IP) |
| **Brute force attack** | Account lockout after 10 failed attempts; unlock after 30 minutes |

### 5. PDF Report Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Very long comments (>5000 chars)** | Truncate in PDF with "[continued...]"; full text in appendix |
| **Many photos (>20)** | Paginate photos; maintain PDF under 10MB |
| **Photo fails to embed in PDF** | Show placeholder with error message; continue generation |
| **PDF generation fails** | Queue retry; notify admin after 3 failures |
| **Email delivery fails** | Queue retry with exponential backoff; log failure; admin notification |
| **Recipient email invalid** | Validate before sending; skip invalid; log warning |
| **Email blocked by spam filter** | Use verified sender domain; proper SPF/DKIM; manual resend option |

### 6. Permission Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Engineer tries to delete another's inspection** | 403 Forbidden; audit log entry |
| **Manager tries to access admin settings** | 403 Forbidden; UI hides admin routes |
| **Admin deletes asset with inspections** | Block deletion; show count of affected inspections |
| **User role changed while logged in** | New role effective on next API call; UI may need refresh |
| **Deleted user's inspections** | Inspections remain; display "Deleted User" for engineer name |

### 7. Data Integrity Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Database constraint violation** | Return clear error message; suggest resolution |
| **Concurrent inspection creation for same asset** | Both succeed (no uniqueness constraint); valid use case |
| **Timezone confusion in date filters** | All dates stored in UTC; convert to UK time for display |
| **Special characters in comments** | Sanitize for XSS; preserve for PDF rendering |
| **Very old inspection date entered** | Warn if date is >30 days in past; allow with confirmation |
| **Future date entered** | Block dates in future; validation error |

---

## Error Handling Strategy

### API Error Codes

| Code | Meaning | Client Action |
|------|---------|---------------|
| 400 | Validation error | Show field-specific errors |
| 401 | Unauthorized | Redirect to login |
| 403 | Forbidden | Show permission denied message |
| 404 | Not found | Show "not found" message |
| 409 | Conflict (duplicate) | Show specific conflict resolution UI |
| 429 | Rate limited | Retry with backoff; show "slow down" message |
| 500 | Server error | Show generic error; log to Sentry |
| 503 | Service unavailable | Show maintenance message; retry later |

### Mobile App Error Handling

```swift
enum InspectionError: LocalizedError {
    case networkUnavailable
    case serverError(String)
    case syncConflict(serverVersion: Inspection)
    case mediaUploadFailed(reason: String)
    case storageQuotaExceeded
    case sessionExpired

    var errorDescription: String? {
        switch self {
        case .networkUnavailable:
            return "No network connection. Changes saved locally."
        case .serverError(let msg):
            return "Server error: \(msg)"
        case .syncConflict:
            return "This inspection was modified on another device."
        case .mediaUploadFailed(let reason):
            return "Media upload failed: \(reason)"
        case .storageQuotaExceeded:
            return "Device storage full. Please free up space."
        case .sessionExpired:
            return "Session expired. Please log in again."
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .networkUnavailable:
            return "Your changes will sync when you're back online."
        case .syncConflict:
            return "Server version will be used. Your changes are saved locally."
        case .storageQuotaExceeded:
            return "Delete old synced media to free up space."
        default:
            return nil
        }
    }
}
```

---

## Security Considerations

### Input Validation

| Field | Validation |
|-------|------------|
| Email | Valid email format; max 255 chars |
| Password | Min 8 chars; max 128 chars |
| Comments | Max 10,000 chars; HTML sanitized |
| Asset ID | Alphanumeric + hyphen/underscore; max 50 chars |
| Zone | From predefined list |
| Condition Grade | 1-5 only |

### File Upload Security

- **MIME type validation**: Check actual file content, not just extension
- **File size limits**: Enforced at API and storage level
- **Virus scanning**: Optional integration with ClamAV for uploaded files
- **Filename sanitization**: Remove path traversal characters
- **Content-Type enforcement**: S3 objects served with correct MIME types

### API Security

- **Rate limiting**: 100 requests/minute per IP; 1000/minute per user
- **Request size limits**: 50MB max request body (for file uploads)
- **SQL injection prevention**: Parameterized queries via Prisma
- **XSS prevention**: Output encoding; Content-Security-Policy headers
- **CSRF protection**: SameSite cookies; token validation

---

## Performance Considerations

### Database Indexes

```sql
-- Most frequently queried columns
CREATE INDEX idx_assets_zone ON "Asset"(zone);
CREATE INDEX idx_assets_level2 ON "Asset"(level2);
CREATE INDEX idx_assets_level3 ON "Asset"(level3);
CREATE INDEX idx_inspections_date ON "Inspection"("dateOfInspection" DESC);
CREATE INDEX idx_inspections_status ON "Inspection"(status);
CREATE INDEX idx_inspections_engineer ON "Inspection"("engineerId");
CREATE INDEX idx_inspections_zone ON "Inspection"(zone);

-- Compound indexes for common filter combinations
CREATE INDEX idx_inspections_date_zone ON "Inspection"("dateOfInspection", zone);
CREATE INDEX idx_assets_search ON "Asset"("assetId", zone, level3);
```

### Caching Strategy

| Data | Cache Duration | Invalidation |
|------|----------------|--------------|
| Asset list | 5 minutes | On import/create/update |
| Filter options (zones, types) | 1 hour | On asset import |
| Inspection summary stats | 1 minute | On inspection create/update |
| User profile | Session duration | On update |
| Branding/settings | 1 hour | On settings update |

### Mobile Performance

- **Lazy loading**: Load inspection list in pages of 20
- **Image optimization**: Generate thumbnails; lazy load full images
- **Offline-first**: Always read from local DB; sync in background
- **Batch sync**: Group pending changes; sync in single request
- **Background fetch**: Sync new assets periodically when on WiFi

---

## Monitoring & Alerting

### Key Metrics to Monitor

| Metric | Threshold | Alert |
|--------|-----------|-------|
| API response time (p95) | > 2s | Warning |
| API response time (p99) | > 5s | Critical |
| Error rate (5xx) | > 1% | Critical |
| PDF generation time | > 30s | Warning |
| Sync queue backlog | > 100 items | Warning |
| Media storage growth | > 80% quota | Warning |
| Login failures | > 50/hour | Security alert |

### Audit Log Events

- User login/logout
- Inspection create/update/delete
- Inspection submit
- Asset import
- User create/update/deactivate
- Settings change
- Report generation
- Email sent
- API errors (4xx, 5xx)

---

## Disaster Recovery

### Backup Schedule

| Data | Frequency | Retention |
|------|-----------|-----------|
| PostgreSQL (full) | Daily | 30 days |
| PostgreSQL (transaction log) | Continuous | 7 days |
| S3 media | Cross-region replication | Indefinite |
| Redis (if persistent) | Hourly snapshot | 24 hours |

### Recovery Procedures

1. **Database failure**: Restore from latest snapshot; apply transaction logs
2. **S3 region outage**: Failover to replicated region
3. **Complete infrastructure loss**: Terraform redeploy; restore from backups
4. **Data corruption**: Point-in-time recovery; manual data verification

### Recovery Time Objectives

- **RTO (Recovery Time Objective)**: 4 hours
- **RPO (Recovery Point Objective)**: 1 hour (transaction log backup)
