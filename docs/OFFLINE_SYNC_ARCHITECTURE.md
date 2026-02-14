# Silvertown Tunnel - Offline Sync Architecture

## Overview

The iOS app is designed for offline-first operation, critical for tunnel environments where cellular coverage may be limited or non-existent.

## Current Implementation

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   iOS App       │     │   SwiftData     │     │   Backend API   │
│   (UI Layer)    │────▶│   (Local DB)    │────▶│   (PostgreSQL)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │                        │
                              │    SyncManager         │
                              │◀───────────────────────│
                              │   (Bi-directional)     │
```

### Sync States

- `pending` - Saved locally, waiting to sync
- `syncing` - Currently being uploaded
- `synced` - Successfully synchronized with server
- `failed` - Sync attempted but failed (will retry)
- `conflict` - Server has different version (needs resolution)

### Inspection Workflow

1. **Create Inspection**
   - Save to local SwiftData immediately
   - Mark as `pending` sync status
   - Generate unique `clientId` for conflict detection

2. **Sync Trigger**
   - Automatic when network becomes available
   - Manual via pull-to-refresh
   - Periodic background sync

3. **Push to Server**
   - Send inspection with `clientId`
   - Server returns `serverId` on success
   - Update local record with server ID

4. **Conflict Resolution**
   - If another inspector submitted for same asset
   - Server tracks all inspections (doesn't reject)
   - Dashboard shows multiple inspections for review

## Multi-Inspector Scenarios

### Scenario 1: Same Asset, Different Times
```
Inspector A: Inspects Asset X at 10:00 (offline)
Inspector B: Inspects Asset X at 10:30 (offline)
Both sync at 11:00

Result: Both inspections saved with different timestamps
```

### Scenario 2: Simultaneous Inspection
```
Both inspectors scan same asset, inspect simultaneously

Result: Both inspections accepted, flagged for manager review
```

### Scenario 3: Duplicate Prevention
```
Inspector A syncs inspection for Asset X
Inspector B tries to sync for same asset

Server: Warns but accepts (different clientId = different device)
Dashboard: Shows potential duplicate for review
```

## Backend Requirements

### Sync Endpoints Needed

1. **POST /sync/inspection** (exists)
   - Accept inspection with clientId
   - Return serverId and syncVersion
   - Check for recent inspections on same asset (warn, don't reject)

2. **GET /sync/assets/all** (exists)
   - Return all assets (with pagination)
   - Include last inspection date/grade
   - Support `since` parameter for delta sync

3. **POST /sync/pull** (needs enhancement)
   - Return inspections created by other inspectors
   - Allow app to show "others also inspected this"

### Conflict Detection Logic

```typescript
// Server-side pseudo-code
async function handleInspectionSync(data: SyncInspectionRequest) {
  // Check for recent inspection on same asset
  const recentInspection = await findRecentInspection(data.assetId, {
    within: '1 hour',
    excludeClientId: data.clientId
  });

  // Always accept the inspection
  const inspection = await createInspection(data);

  // Flag if potential duplicate
  if (recentInspection) {
    await flagForReview(inspection.id, {
      reason: 'POTENTIAL_DUPLICATE',
      relatedInspectionId: recentInspection.id
    });
  }

  return { serverId: inspection.id, warning: recentInspection ? 'Recent inspection exists' : null };
}
```

## iOS Implementation Details

### SyncManager Key Methods

- `createInspection()` - Saves locally, triggers sync
- `triggerSync()` - Initiates sync if online
- `pushPendingInspections()` - Uploads pending inspections
- `pullAssets()` - Downloads asset updates
- `updatePendingCounts()` - Updates UI counters

### Network Monitoring

```swift
// Automatic sync when connectivity restored
networkMonitor.pathUpdateHandler = { path in
    if path.status == .satisfied {
        self.triggerSync()
    }
}
```

## UI Indicators

### Home Screen Stats
- **Today**: Count of inspections done today
- **Pending**: Count of inspections waiting to sync

### Sync Status Badge
- 🟢 Synced - All data synchronized
- 🟡 Pending - Items waiting to sync
- 🔴 Failed - Sync failed, will retry
- ⚠️ Conflict - Needs manual resolution

## Future Enhancements

1. **Background Sync** - Sync when app is backgrounded
2. **Photo Queue** - Separate queue for large media uploads
3. **Conflict UI** - Show conflicts and allow resolution
4. **Sync History** - Log of all sync operations
5. **Selective Sync** - Choose what to sync on metered connections
