# Silvertown Tunnel - Offline-First iOS App Architecture

## Overview

This document outlines the architecture for a native iOS app that allows engineers to conduct inspections in the tunnel without cellular coverage, storing data locally and syncing when connectivity is restored.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         iOS App                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   UI Layer  │  │ Sync Engine │  │    Local Storage        │  │
│  │  (SwiftUI)  │  │             │  │  ┌─────────────────┐    │  │
│  │             │  │  • Queue    │  │  │   Core Data     │    │  │
│  │  • Assets   │◄─┤  • Conflict │◄─┤  │   (Inspections, │    │  │
│  │  • Inspect  │  │    Resolve  │  │  │    Assets)      │    │  │
│  │  • History  │  │  • Retry    │  │  └─────────────────┘    │  │
│  │             │  │             │  │  ┌─────────────────┐    │  │
│  └─────────────┘  └──────┬──────┘  │  │  File System    │    │  │
│                          │         │  │  (Photos/Media) │    │  │
│                          │         │  └─────────────────┘    │  │
└──────────────────────────┼─────────┴─────────────────────────────┘
                           │
                           │ HTTPS (when available)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend API                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Fastify   │  │   Sync      │  │      PostgreSQL         │  │
│  │   REST API  │──│   Endpoints │──│   (Source of Truth)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Local Data Model (Core Data)

### 2.1 LocalAsset
```swift
@Model
class LocalAsset {
    @Attribute(.unique) var id: String           // Server ID
    var assetId: String                          // e.g., "L112000N1CMS0011"
    var assetCode: String?
    var title: String?
    var level1: String
    var level2: String
    var level3: String
    var zone: String
    var region: String?
    var space: String?
    var facility: String?

    // Inspection tracking (cached from server)
    var lastInspectionDate: Date?
    var lastConditionGrade: Int?
    var lastRiskScore: Int?
    var inspectionCount: Int
    var nextInspectionDue: Date?

    // Sync metadata
    var serverUpdatedAt: Date?
    var localUpdatedAt: Date?

    @Relationship(deleteRule: .cascade)
    var inspections: [LocalInspection]
}
```

### 2.2 LocalInspection
```swift
@Model
class LocalInspection {
    @Attribute(.unique) var clientId: String     // UUID generated locally
    var serverId: String?                        // Assigned after sync

    // Core data
    var assetId: String                          // Reference to LocalAsset
    var dateOfInspection: Date
    var inspectorName: String
    var conditionGrade: Int                      // 1-5
    var comments: String?

    // Defect assessment
    var defectSeverity: Int?                     // 1-5
    var riskScore: Int?                          // Calculated
    var defectDescription: String?
    var observedIssues: String?
    var recommendedAction: String?
    var followUpRequired: Bool

    // Sync status
    var syncStatus: SyncStatus                   // .pending, .syncing, .synced, .failed
    var syncVersion: Int                         // For conflict detection
    var syncError: String?
    var lastSyncAttempt: Date?
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .cascade)
    var photos: [LocalPhoto]

    @Relationship
    var asset: LocalAsset?
}

enum SyncStatus: String, Codable {
    case pending    // Created/modified offline, needs sync
    case syncing    // Currently uploading
    case synced     // Successfully synced with server
    case failed     // Sync failed, needs retry
    case conflict   // Server has newer version
}
```

### 2.3 LocalPhoto
```swift
@Model
class LocalPhoto {
    @Attribute(.unique) var clientId: String     // UUID generated locally
    var serverId: String?                        // Assigned after upload

    var inspectionClientId: String               // Reference to LocalInspection
    var filename: String
    var localPath: String                        // Path in app documents
    var mimeType: String
    var fileSize: Int
    var capturedAt: Date
    var caption: String?

    // Sync status
    var uploadStatus: UploadStatus               // .pending, .uploading, .uploaded, .failed
    var uploadProgress: Double                   // 0.0 - 1.0
    var uploadError: String?
    var lastUploadAttempt: Date?

    @Relationship
    var inspection: LocalInspection?
}

enum UploadStatus: String, Codable {
    case pending    // Waiting to upload
    case uploading  // Currently uploading
    case uploaded   // Successfully uploaded
    case failed     // Upload failed
}
```

---

## 3. Sync Engine

### 3.1 Sync Queue Manager
```swift
class SyncQueueManager: ObservableObject {
    @Published var pendingInspections: Int = 0
    @Published var pendingPhotos: Int = 0
    @Published var isSyncing: Bool = false
    @Published var lastSyncDate: Date?

    private let networkMonitor = NWPathMonitor()
    private var isConnected: Bool = false

    // Start monitoring network and auto-sync
    func startMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            self?.isConnected = path.status == .satisfied
            if path.status == .satisfied {
                self?.triggerSync()
            }
        }
        networkMonitor.start(queue: DispatchQueue.global())
    }

    // Manual sync trigger
    func triggerSync() async {
        guard isConnected && !isSyncing else { return }

        isSyncing = true
        defer { isSyncing = false }

        // 1. Pull latest assets (lightweight, always safe)
        await syncAssets()

        // 2. Push pending inspections
        await syncPendingInspections()

        // 3. Upload pending photos
        await uploadPendingPhotos()

        lastSyncDate = Date()
    }
}
```

### 3.2 Sync Protocol

#### Push Inspection (Offline-created)
```
1. App creates inspection with clientId (UUID)
2. When online, POST /v1/sync/inspections
   {
     "clientId": "550e8400-e29b-41d4-a716-446655440000",
     "assetId": "cml9m585901ywzkwzr5wn7kzm",
     "dateOfInspection": "2026-02-13T10:30:00Z",
     "conditionGrade": "GRADE_3",
     "defectSeverity": 3,
     ...
   }
3. Server checks if clientId exists
   - If not: Create new inspection, return { serverId, syncVersion }
   - If exists: Return existing { serverId, syncVersion } (idempotent)
4. App updates local record with serverId
```

#### Pull Assets (Server → App)
```
1. App requests GET /v1/sync/assets?since={lastSyncDate}
2. Server returns assets modified since that date
3. App upserts into Core Data
4. App updates lastSyncDate
```

#### Photo Upload
```
1. For each pending photo:
   POST /v1/media/inspections/{serverId}/upload
   - Multipart form with image data
   - Include clientId in form data
2. Server stores photo, returns { serverId }
3. App marks photo as uploaded
4. App can delete local file after confirmed upload (optional)
```

### 3.3 Conflict Resolution

```swift
enum ConflictResolution {
    case keepLocal      // User's offline changes win
    case keepServer     // Server changes win
    case merge          // Attempt to merge (complex)
}

// Simple strategy: Last-write-wins with user confirmation
func resolveConflict(local: LocalInspection, server: ServerInspection) -> ConflictResolution {
    // If local was modified after server version, keep local
    if local.updatedAt > server.updatedAt {
        return .keepLocal
    }

    // If server is newer but local has unsynced changes, prompt user
    if local.syncStatus == .pending {
        // Show UI: "This inspection was modified on another device. Keep your changes or use server version?"
        return .promptUser
    }

    // Otherwise, accept server version
    return .keepServer
}
```

---

## 4. Photo Handling

### 4.1 Storage Strategy
```
App Documents/
└── Photos/
    └── {inspectionClientId}/
        ├── {photoClientId}_original.jpg    # Full resolution
        ├── {photoClientId}_thumbnail.jpg   # 200x200 for list views
        └── {photoClientId}_preview.jpg     # 800x800 for detail view
```

### 4.2 Photo Capture Flow
```swift
func capturePhoto(for inspection: LocalInspection) async {
    // 1. Capture using camera
    let image = await cameraService.capture()

    // 2. Generate client ID
    let clientId = UUID().uuidString

    // 3. Save to local storage
    let originalPath = saveOriginal(image, clientId: clientId, inspectionId: inspection.clientId)
    let thumbnailPath = saveThumbnail(image, clientId: clientId, inspectionId: inspection.clientId)

    // 4. Create database record
    let photo = LocalPhoto(
        clientId: clientId,
        inspectionClientId: inspection.clientId,
        filename: "\(clientId).jpg",
        localPath: originalPath,
        mimeType: "image/jpeg",
        fileSize: image.jpegData.count,
        capturedAt: Date(),
        uploadStatus: .pending
    )

    // 5. Save to Core Data
    modelContext.insert(photo)
}
```

### 4.3 Storage Limits & Cleanup
```swift
class StorageManager {
    let maxLocalStorage: Int = 2_000_000_000  // 2GB limit

    func checkStorage() -> StorageStatus {
        let used = calculateUsedStorage()
        let available = maxLocalStorage - used

        if available < 100_000_000 {  // Less than 100MB
            return .warning
        }
        if available < 10_000_000 {   // Less than 10MB
            return .critical
        }
        return .ok
    }

    // Clean up uploaded photos older than 30 days
    func cleanupUploadedPhotos() {
        let cutoff = Calendar.current.date(byAdding: .day, value: -30, to: Date())!
        let uploaded = fetchPhotos(where: {
            $0.uploadStatus == .uploaded && $0.capturedAt < cutoff
        })

        for photo in uploaded {
            deleteLocalFile(at: photo.localPath)
            // Keep database record for history, just remove file
            photo.localPath = nil
        }
    }
}
```

---

## 5. Backend API Changes

### 5.1 New Sync Endpoints

```typescript
// POST /v1/sync/inspections - Create or acknowledge inspection
// Idempotent: same clientId always returns same result
fastify.post('/sync/inspections', async (request, reply) => {
  const { clientId, ...inspectionData } = request.body;

  // Check if already exists
  const existing = await prisma.inspection.findUnique({
    where: { clientId }
  });

  if (existing) {
    // Already synced, return existing data
    return {
      serverId: existing.id,
      syncVersion: existing.syncVersion,
      status: 'already_synced'
    };
  }

  // Create new
  const inspection = await prisma.inspection.create({
    data: {
      clientId,
      ...inspectionData,
      engineerId: request.user.id,
      syncVersion: 1,
      lastSyncedAt: new Date(),
    }
  });

  // Update asset tracking fields
  await assetService.updateInspectionTracking(inspection.assetId, inspection);

  return {
    serverId: inspection.id,
    syncVersion: inspection.syncVersion,
    status: 'created'
  };
});

// GET /v1/sync/assets - Get assets modified since date
fastify.get('/sync/assets', async (request) => {
  const { since, limit = 500 } = request.query;

  const where = since
    ? { updatedAt: { gte: new Date(since) } }
    : {};

  const assets = await prisma.asset.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: 'asc' }
  });

  return {
    assets,
    syncTimestamp: new Date().toISOString(),
    hasMore: assets.length === limit
  };
});

// GET /v1/sync/status - Get sync status for user
fastify.get('/sync/status', async (request) => {
  const pendingCount = await prisma.inspection.count({
    where: {
      engineerId: request.user.id,
      lastSyncedAt: null
    }
  });

  return {
    serverTime: new Date().toISOString(),
    pendingOnServer: pendingCount,
    lastAssetUpdate: await getLastAssetUpdate()
  };
});
```

### 5.2 Batch Operations

```typescript
// POST /v1/sync/batch - Sync multiple inspections at once
fastify.post('/sync/batch', async (request, reply) => {
  const { inspections } = request.body;  // Array of inspections

  const results = await Promise.all(
    inspections.map(async (inspection) => {
      try {
        const result = await syncSingleInspection(inspection, request.user);
        return { clientId: inspection.clientId, success: true, ...result };
      } catch (error) {
        return { clientId: inspection.clientId, success: false, error: error.message };
      }
    })
  );

  return { results };
});
```

---

## 6. App Screens

### 6.1 Screen Flow
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Login     │────▶│   Asset      │────▶│    New       │
│              │     │   List       │     │  Inspection  │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │    Asset     │     │   Camera     │
                     │   Detail     │     │   Capture    │
                     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │   Pending    │
                                          │    Sync      │
                                          └──────────────┘
```

### 6.2 Key UI Components

#### Sync Status Bar
```
┌────────────────────────────────────────────────┐
│ ● Offline          3 inspections pending sync  │
│ ○ Online           Last sync: 10:30 AM         │
└────────────────────────────────────────────────┘
```

#### Asset List with Offline Indicator
```
┌────────────────────────────────────────────────┐
│ 🔍 Search assets...          [Zone ▼]          │
├────────────────────────────────────────────────┤
│ L112000N1CMS0011                    Northbound │
│ Cable Duct                                     │
│ Last inspected: 9 Feb 2026          Grade: 3  │
├────────────────────────────────────────────────┤
│ L113714N2CAB9001                    Northbound │
│ Fire Hose Cabinet                   ⏳ Pending │
│ Inspected today (not synced)        Grade: 2  │
└────────────────────────────────────────────────┘
```

#### Inspection Form with Photo Grid
```
┌────────────────────────────────────────────────┐
│ ← New Inspection                               │
├────────────────────────────────────────────────┤
│ Asset: L112000N1CMS0011                        │
│ Cable Duct · Northbound                        │
├────────────────────────────────────────────────┤
│ Date: [13 Feb 2026        ]                    │
│ Inspector: [D Bullock     ▼]                   │
├────────────────────────────────────────────────┤
│ Condition Grade                                │
│ [1] [2] [●3] [4] [5]                          │
├────────────────────────────────────────────────┤
│ Photos                                         │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
│ │ 📷  │ │ IMG │ │ IMG │ │  +  │              │
│ └─────┘ └─────┘ └─────┘ └─────┘              │
├────────────────────────────────────────────────┤
│           [ Save Inspection ]                  │
│     Will sync when connection available        │
└────────────────────────────────────────────────┘
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Core)
- [ ] Set up iOS project (SwiftUI + SwiftData/Core Data)
- [ ] Implement local data models
- [ ] Build asset list with local storage
- [ ] Basic network connectivity detection

### Phase 2: Offline Inspections
- [ ] Inspection creation form
- [ ] Photo capture and local storage
- [ ] Offline inspection queue
- [ ] Sync status UI

### Phase 3: Sync Engine
- [ ] Backend sync endpoints
- [ ] Push inspection sync
- [ ] Photo upload queue
- [ ] Pull asset updates

### Phase 4: Polish
- [ ] Conflict resolution UI
- [ ] Storage management
- [ ] Background sync
- [ ] Error handling and retry logic

### Phase 5: Advanced
- [ ] Push notifications for sync status
- [ ] Batch operations
- [ ] Offline asset search optimization
- [ ] Analytics and sync metrics

---

## 8. Technical Considerations

### 8.1 iOS Versions
- Minimum: iOS 16 (for SwiftData) or iOS 14 (for Core Data)
- Recommended: iOS 17+ for latest SwiftUI features

### 8.2 Dependencies
```swift
// Package.swift or via SPM
dependencies: [
    .package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.8.0"),
    .package(url: "https://github.com/onevcat/Kingfisher.git", from: "7.10.0"),
]
```

### 8.3 Security
- Store auth tokens in Keychain
- Encrypt local database (SQLCipher or iOS Data Protection)
- Photos stored with iOS Data Protection enabled
- Certificate pinning for API calls

### 8.4 Testing Strategy
- Unit tests for sync logic
- Integration tests for API endpoints
- UI tests for critical flows
- Offline simulation testing

---

## 9. Questions to Resolve

1. **Multi-device sync**: Can an inspector use multiple devices? If so, how do we handle inspections started on one device and continued on another?

2. **Asset updates while offline**: If an asset is modified on the server while user is offline, how do we notify them?

3. **Photo retention**: How long should synced photos be kept locally? Immediately delete after upload, or keep for X days?

4. **Partial inspections**: Can an inspection be saved as draft and completed later? Or must it be finished in one session?

5. **Maximum offline duration**: What's the longest expected time without connectivity? This affects storage planning.

---

## 10. Estimated Effort

| Phase | Effort | Prerequisites |
|-------|--------|---------------|
| Phase 1: Foundation | 2-3 weeks | iOS developer |
| Phase 2: Offline Inspections | 2-3 weeks | Phase 1 |
| Phase 3: Sync Engine | 2-3 weeks | Phase 2 + Backend changes |
| Phase 4: Polish | 1-2 weeks | Phase 3 |
| Phase 5: Advanced | 2-3 weeks | Phase 4 |

**Total: 9-14 weeks** for a production-ready offline-first iOS app.

---

*Document created: 13 Feb 2026*
*Last updated: 13 Feb 2026*
