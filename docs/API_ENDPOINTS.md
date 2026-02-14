# Silvertown Tunnel API Endpoints

Base URL: `https://api.silvertown-inspect.infratec.co.uk/v1`

## Authentication

### POST /auth/login
Login with email and password.

**Request:**
```json
{
  "email": "engineer@infratec.co.uk",
  "password": "securePassword123"
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 900,
  "user": {
    "id": "clx123...",
    "email": "engineer@infratec.co.uk",
    "displayName": "John Smith",
    "role": "ENGINEER"
  }
}
```

### POST /auth/refresh
Refresh access token.

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 900
}
```

### POST /auth/logout
Revoke refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response:** `204 No Content`

### GET /auth/me
Get current user profile.

**Response:** `200 OK`
```json
{
  "id": "clx123...",
  "email": "engineer@infratec.co.uk",
  "firstName": "John",
  "lastName": "Smith",
  "displayName": "John Smith",
  "role": "ENGINEER",
  "lastLoginAt": "2024-01-15T10:30:00Z"
}
```

---

## Users (Admin only)

### GET /users
List all users with pagination.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `role` (filter: ADMIN, MANAGER, ENGINEER)
- `search` (searches email, firstName, lastName)
- `isActive` (true/false)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "clx123...",
      "email": "engineer@infratec.co.uk",
      "displayName": "John Smith",
      "role": "ENGINEER",
      "isActive": true,
      "lastLoginAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### POST /users
Create a new user.

**Request:**
```json
{
  "email": "new.engineer@infratec.co.uk",
  "firstName": "Jane",
  "lastName": "Doe",
  "password": "temporaryPass123",
  "role": "ENGINEER"
}
```

**Response:** `201 Created`

### GET /users/:id
Get user details.

### PATCH /users/:id
Update user.

### DELETE /users/:id
Soft-delete user (sets isActive = false).

---

## Assets

### GET /assets
List assets with filtering and pagination.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `zone` (filter by zone)
- `level2` (filter by level2)
- `level3` (filter by level3/asset type)
- `search` (searches assetId, description)
- `hasInspections` (true/false - filter assets with/without inspections)
- `sortBy` (assetId, zone, level3, createdAt)
- `sortOrder` (asc, desc)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "clx456...",
      "level1": "MEP",
      "level2": "Electrical",
      "level3": "Distribution Board",
      "assetId": "DB-NP-001",
      "zone": "North Portal",
      "description": "Main distribution board, north portal entrance",
      "createdAt": "2024-01-01T00:00:00Z",
      "inspectionCount": 3,
      "lastInspectionDate": "2024-01-10T14:30:00Z",
      "lastConditionGrade": "GRADE_2"
    }
  ],
  "pagination": { ... }
}
```

### GET /assets/:id
Get asset details including recent inspections.

**Response:** `200 OK`
```json
{
  "id": "clx456...",
  "level1": "MEP",
  "level2": "Electrical",
  "level3": "Distribution Board",
  "assetId": "DB-NP-001",
  "zone": "North Portal",
  "description": "Main distribution board, north portal entrance",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-05T10:00:00Z",
  "inspections": [
    {
      "id": "clx789...",
      "dateOfInspection": "2024-01-10T14:30:00Z",
      "conditionGrade": "GRADE_2",
      "status": "SUBMITTED",
      "engineer": { "id": "...", "displayName": "John Smith" }
    }
  ]
}
```

### POST /assets (Admin only)
Create a single asset.

**Request:**
```json
{
  "level2": "Electrical",
  "level3": "Distribution Board",
  "assetId": "DB-NP-002",
  "zone": "North Portal",
  "description": "Secondary distribution board"
}
```

### PATCH /assets/:id (Admin only)
Update asset.

### DELETE /assets/:id (Admin only)
Delete asset (fails if inspections exist).

---

## Asset Import (Admin only)

### POST /assets/import/upload
Upload CSV/XLSX file for import.

**Request:** `multipart/form-data`
- `file`: The CSV or XLSX file

**Response:** `200 OK`
```json
{
  "batchId": "clx111...",
  "filename": "assets_2024.xlsx",
  "rowCount": 150,
  "columns": ["A", "B", "C", "D", "E"],
  "preview": [
    { "A": "Electrical", "B": "Distribution Board", "C": "DB-001", "D": "Zone A", "E": "" },
    { "A": "Mechanical", "B": "AHU", "C": "AHU-001", "D": "Zone B", "E": "Air handling unit 1" }
  ],
  "suggestedMapping": {
    "level2": "A",
    "level3": "B",
    "assetId": "C",
    "zone": "D",
    "description": "E"
  }
}
```

### POST /assets/import/validate
Validate import with column mapping.

**Request:**
```json
{
  "batchId": "clx111...",
  "columnMapping": {
    "level2": "A",
    "level3": "B",
    "assetId": "C",
    "zone": "D",
    "description": "E"
  }
}
```

**Response:** `200 OK`
```json
{
  "valid": true,
  "totalRows": 150,
  "validRows": 148,
  "duplicates": 2,
  "errors": [
    { "row": 45, "column": "C", "error": "Asset ID already exists: DB-001" },
    { "row": 89, "column": "C", "error": "Asset ID is empty" }
  ],
  "preview": [
    {
      "row": 1,
      "data": { "level2": "Electrical", "level3": "Distribution Board", "assetId": "DB-002", "zone": "Zone A" },
      "status": "new"
    },
    {
      "row": 2,
      "data": { "level2": "Mechanical", "level3": "AHU", "assetId": "AHU-001", "zone": "Zone B" },
      "status": "duplicate"
    }
  ]
}
```

### POST /assets/import/execute
Execute the import.

**Request:**
```json
{
  "batchId": "clx111...",
  "columnMapping": { ... },
  "skipDuplicates": true,
  "updateExisting": false
}
```

**Response:** `202 Accepted`
```json
{
  "batchId": "clx111...",
  "status": "processing",
  "message": "Import started. Check status at /assets/import/status/{batchId}"
}
```

### GET /assets/import/status/:batchId
Get import status.

**Response:** `200 OK`
```json
{
  "batchId": "clx111...",
  "status": "complete",
  "successCount": 145,
  "errorCount": 3,
  "skipCount": 2,
  "completedAt": "2024-01-15T11:00:00Z"
}
```

---

## Inspections

### GET /inspections
List inspections with filtering.

**Query Parameters:**
- `page`, `limit`
- `assetId` (filter by asset)
- `engineerId` (filter by engineer)
- `zone` (filter by zone)
- `level3` (filter by asset type)
- `status` (NOT_STARTED, IN_PROGRESS, COMPLETE, SUBMITTED)
- `conditionGrade` (GRADE_1 through GRADE_5)
- `dateFrom` (ISO date)
- `dateTo` (ISO date)
- `search` (searches asset ID, comments)
- `sortBy` (dateOfInspection, createdAt, conditionGrade)
- `sortOrder` (asc, desc)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "clx789...",
      "asset": {
        "id": "clx456...",
        "assetId": "DB-NP-001",
        "level2": "Electrical",
        "level3": "Distribution Board",
        "zone": "North Portal"
      },
      "engineer": {
        "id": "clx123...",
        "displayName": "John Smith"
      },
      "dateOfInspection": "2024-01-10T14:30:00Z",
      "conditionGrade": "GRADE_2",
      "status": "SUBMITTED",
      "mediaCount": 3,
      "hasReport": true
    }
  ],
  "pagination": { ... }
}
```

### GET /inspections/:id
Get inspection details with media and reports.

**Response:** `200 OK`
```json
{
  "id": "clx789...",
  "asset": { ... },
  "engineer": { ... },
  "dateOfInspection": "2024-01-10T14:30:00Z",
  "conditionGrade": "GRADE_2",
  "comments": "Minor corrosion observed on cable entry points. Recommend monitoring.",
  "status": "SUBMITTED",
  "submittedAt": "2024-01-10T15:00:00Z",
  "media": [
    {
      "id": "clxm01...",
      "type": "PHOTO",
      "filename": "IMG_001.jpg",
      "url": "https://...", // Signed URL
      "thumbnailUrl": "https://...",
      "caption": "Cable entry corrosion",
      "capturedAt": "2024-01-10T14:32:00Z"
    }
  ],
  "reports": [
    {
      "id": "clxr01...",
      "pdfUrl": "https://...", // Signed URL
      "generatedAt": "2024-01-10T15:05:00Z",
      "emailedTo": ["manager@infratec.co.uk"],
      "emailStatus": "sent"
    }
  ],
  "createdAt": "2024-01-10T14:30:00Z",
  "updatedAt": "2024-01-10T15:05:00Z"
}
```

### POST /inspections
Create a new inspection.

**Request:**
```json
{
  "assetId": "clx456...",
  "dateOfInspection": "2024-01-15T10:00:00Z",
  "conditionGrade": "GRADE_2",
  "comments": "Minor wear observed.",
  "status": "IN_PROGRESS",
  "clientId": "550e8400-e29b-41d4-a716-446655440000" // For offline sync
}
```

**Response:** `201 Created`

### PATCH /inspections/:id
Update inspection.

**Request:**
```json
{
  "conditionGrade": "GRADE_3",
  "comments": "Updated: Moderate wear, recommend maintenance.",
  "status": "COMPLETE"
}
```

### POST /inspections/:id/submit
Submit inspection and trigger PDF generation.

**Response:** `200 OK`
```json
{
  "id": "clx789...",
  "status": "SUBMITTED",
  "submittedAt": "2024-01-15T10:30:00Z",
  "reportGenerationQueued": true
}
```

### DELETE /inspections/:id
Delete inspection (Engineer: own only, Admin: any).

---

## Media

### POST /inspections/:inspectionId/media/upload-url
Get pre-signed URL for media upload.

**Request:**
```json
{
  "filename": "IMG_001.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 2500000
}
```

**Response:** `200 OK`
```json
{
  "mediaId": "clxm01...",
  "uploadUrl": "https://s3.eu-west-2.amazonaws.com/...", // Pre-signed PUT URL
  "expiresAt": "2024-01-15T10:35:00Z",
  "maxFileSize": 104857600
}
```

### POST /inspections/:inspectionId/media/confirm
Confirm media upload completion.

**Request:**
```json
{
  "mediaId": "clxm01...",
  "caption": "Cable entry corrosion",
  "capturedAt": "2024-01-15T10:15:00Z"
}
```

### DELETE /inspections/:inspectionId/media/:mediaId
Delete media.

---

## Reports

### POST /inspections/:id/report/generate
Manually trigger report generation.

**Response:** `202 Accepted`
```json
{
  "reportId": "clxr02...",
  "status": "queued",
  "message": "Report generation queued"
}
```

### POST /inspections/:id/report/email
Email report to recipients.

**Request:**
```json
{
  "recipients": ["manager@infratec.co.uk", "client@company.com"],
  "includeMedia": false,
  "message": "Please find attached the inspection report."
}
```

**Response:** `202 Accepted`

### GET /reports/:id/download
Get signed download URL for report PDF.

**Response:** `200 OK`
```json
{
  "url": "https://...",
  "expiresAt": "2024-01-15T11:30:00Z"
}
```

---

## Sync (Mobile App)

### POST /sync/pull
Pull changes from server.

**Request:**
```json
{
  "lastSyncAt": "2024-01-14T10:00:00Z",
  "entities": ["assets", "inspections"]
}
```

**Response:** `200 OK`
```json
{
  "syncedAt": "2024-01-15T10:30:00Z",
  "changes": {
    "assets": {
      "created": [ ... ],
      "updated": [ ... ],
      "deleted": ["clx123...", "clx456..."]
    },
    "inspections": {
      "created": [ ... ],
      "updated": [ ... ],
      "deleted": []
    }
  }
}
```

### POST /sync/push
Push local changes to server.

**Request:**
```json
{
  "changes": [
    {
      "type": "CREATE",
      "entity": "inspection",
      "clientId": "local-uuid-123",
      "data": { ... },
      "localTimestamp": "2024-01-15T09:00:00Z"
    },
    {
      "type": "UPDATE",
      "entity": "inspection",
      "id": "clx789...",
      "data": { ... },
      "syncVersion": 2,
      "localTimestamp": "2024-01-15T09:30:00Z"
    }
  ]
}
```

**Response:** `200 OK`
```json
{
  "results": [
    {
      "clientId": "local-uuid-123",
      "serverId": "clxnew...",
      "status": "created"
    },
    {
      "id": "clx789...",
      "status": "conflict",
      "serverVersion": { ... },
      "resolution": "server_wins"
    }
  ],
  "syncedAt": "2024-01-15T10:30:00Z"
}
```

---

## Reporting / Analytics

### GET /reports/summary
Get inspection summary statistics.

**Query Parameters:**
- `dateFrom`, `dateTo`
- `zone`
- `level3`

**Response:** `200 OK`
```json
{
  "period": { "from": "2024-01-01", "to": "2024-01-31" },
  "totalInspections": 245,
  "byStatus": {
    "NOT_STARTED": 12,
    "IN_PROGRESS": 8,
    "COMPLETE": 45,
    "SUBMITTED": 180
  },
  "byConditionGrade": {
    "GRADE_1": 80,
    "GRADE_2": 65,
    "GRADE_3": 35,
    "GRADE_4": 15,
    "GRADE_5": 5
  },
  "byZone": {
    "North Portal": 45,
    "South Portal": 42,
    "Southbound Tube": 88,
    "Northbound Tube": 70
  }
}
```

### GET /reports/export
Export data as CSV.

**Query Parameters:**
- `type` (inspections, assets, summary)
- `format` (csv, xlsx)
- Other filters as per list endpoints

**Response:** File download

---

## System Settings (Admin only)

### GET /settings
Get all system settings.

### GET /settings/:key
Get specific setting.

### PUT /settings/:key
Update setting.

---

## Audit Logs (Admin/Manager)

### GET /audit-logs
List audit logs with filtering.

**Query Parameters:**
- `page`, `limit`
- `userId`
- `action`
- `entityType`
- `entityId`
- `dateFrom`, `dateTo`

---

## Health

### GET /health
Health check endpoint.

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "s3": "healthy"
  }
}
```
