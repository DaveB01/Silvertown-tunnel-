import Foundation
import SwiftData
import Network
import Observation

/// Sync event for UI notifications
struct SyncEvent: Identifiable {
    let id = UUID()
    let type: SyncEventType
    let message: String
    let timestamp: Date = Date()

    enum SyncEventType {
        case success
        case warning
        case error
    }
}

/// Manages offline sync between local SwiftData and the server
@Observable
final class SyncManager {
    static let shared = SyncManager()

    // MARK: - Published State

    var isOnline: Bool = false
    var isSyncing: Bool = false
    var lastSyncDate: Date?
    var pendingInspections: Int = 0
    var pendingPhotos: Int = 0
    var syncError: String?

    // Sync events for UI notifications
    var lastSyncEvent: SyncEvent?
    var syncedCount: Int = 0 // Count of inspections synced in last batch

    // MARK: - Private

    private let networkMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "NetworkMonitor")
    private var modelContext: ModelContext?
    private var syncTask: Task<Void, Never>?

    private init() {
        startNetworkMonitoring()
    }

    // MARK: - Setup

    func configure(modelContext: ModelContext) {
        self.modelContext = modelContext
        Task { @MainActor in
            updatePendingCounts()
        }
    }

    // MARK: - Network Monitoring

    private func startNetworkMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                let wasOffline = !(self?.isOnline ?? false)
                self?.isOnline = path.status == .satisfied

                // Auto-sync when coming back online
                if wasOffline && path.status == .satisfied {
                    self?.triggerSync()
                }
            }
        }
        networkMonitor.start(queue: monitorQueue)
    }

    // MARK: - Sync Trigger

    func triggerSync() {
        guard isOnline && !isSyncing else { return }

        syncTask?.cancel()
        syncTask = Task {
            await performSync()
        }
    }

    // MARK: - Main Sync Logic

    @MainActor
    private func performSync() async {
        guard let context = modelContext else { return }

        isSyncing = true
        syncError = nil
        syncedCount = 0

        do {
            // 1. Pull latest assets from server
            try await pullAssets(context: context)

            // 2. Pull inspections from server (created on web or other devices)
            _ = try await pullInspections(context: context)

            // 3. Push pending inspections (returns count synced)
            let pushed = try await pushPendingInspections(context: context)
            syncedCount = pushed

            // 4. Upload pending photos
            try await uploadPendingPhotos(context: context)

            lastSyncDate = Date()
            updatePendingCounts()

            // Emit success event if we synced anything
            if pushed > 0 {
                lastSyncEvent = SyncEvent(
                    type: .success,
                    message: "Synced \(pushed) inspection\(pushed == 1 ? "" : "s")"
                )
            }

        } catch {
            syncError = error.localizedDescription
            lastSyncEvent = SyncEvent(
                type: .error,
                message: "Sync failed: \(error.localizedDescription)"
            )
            print("Sync error: \(error)")
        }

        isSyncing = false
    }

    // MARK: - Pull Assets

    @MainActor
    private func pullAssets(context: ModelContext) async throws {
        let api = APIService.shared

        // Get assets updated since last sync
        let response = try await api.syncAssetsAll(since: lastSyncDate)

        for assetData in response.assets {
            // Check if asset exists locally
            let descriptor = FetchDescriptor<Asset>(
                predicate: #Predicate { $0.id == assetData.id }
            )
            let existing = try context.fetch(descriptor).first

            if let existing = existing {
                // Update existing
                updateAsset(existing, from: assetData)
            } else {
                // Create new
                let asset = createAsset(from: assetData)
                context.insert(asset)
            }
        }

        try context.save()
        print("Pulled \(response.assets.count) assets")
    }

    // MARK: - Pull Inspections

    @MainActor
    private func pullInspections(context: ModelContext) async throws -> Int {
        let api = APIService.shared

        // Get inspections from server
        let response = try await api.syncInspectionsAll(since: lastSyncDate)

        var newCount = 0

        for inspectionData in response.inspections {
            // Check if inspection exists locally by serverId
            let serverIdToCheck = inspectionData.id
            let descriptor = FetchDescriptor<Inspection>(
                predicate: #Predicate { $0.serverId == serverIdToCheck }
            )
            let existingByServerId = try context.fetch(descriptor).first

            // Also check by clientId if available
            var existingByClientId: Inspection? = nil
            if let clientId = inspectionData.clientId {
                let clientIdDescriptor = FetchDescriptor<Inspection>(
                    predicate: #Predicate { $0.clientId == clientId }
                )
                existingByClientId = try context.fetch(clientIdDescriptor).first
            }

            if existingByServerId != nil || existingByClientId != nil {
                // Already have this inspection locally, skip
                continue
            }

            // Need to get or create the asset first
            let assetId = inspectionData.assetId
            let assetDescriptor = FetchDescriptor<Asset>(
                predicate: #Predicate { $0.id == assetId }
            )
            let asset = try context.fetch(assetDescriptor).first

            // Create new local inspection from server data
            let inspection = Inspection(
                assetId: inspectionData.assetId,
                engineerId: inspectionData.engineerId,
                engineerName: inspectionData.inspectorName ?? "Unknown",
                dateOfInspection: ISO8601DateFormatter().date(from: inspectionData.dateOfInspection) ?? Date(),
                conditionGrade: ConditionGrade(rawValue: inspectionData.conditionGrade) ?? .grade1,
                comments: inspectionData.comments,
                defectSeverity: inspectionData.defectSeverity,
                defectDescription: inspectionData.defectDescription,
                observedIssues: inspectionData.observedIssues,
                recommendedAction: inspectionData.recommendedAction,
                followUpRequired: inspectionData.followUpRequired ?? false
            )

            // Set server sync info
            inspection.serverId = inspectionData.id
            inspection.clientId = inspectionData.clientId ?? UUID().uuidString
            inspection.syncVersion = inspectionData.syncVersion ?? 1
            inspection.syncStatus = SyncStatus.synced
            inspection.lastSyncedAt = Date()
            inspection.asset = asset

            context.insert(inspection)
            newCount += 1
        }

        try context.save()
        print("Pulled \(newCount) new inspections from server")
        return newCount
    }

    private func createAsset(from data: SyncAssetResponse) -> Asset {
        Asset(
            id: data.id,
            level1: data.level1,
            level2: data.level2,
            level3: data.level3,
            assetId: data.assetId,
            assetCode: data.assetCode,
            title: data.title,
            zone: data.zone,
            region: data.region,
            space: data.space,
            facility: data.facility,
            assetDescription: nil,
            lastInspectionDate: data.lastInspectionDate,
            lastConditionGrade: data.lastConditionGrade.flatMap { ConditionGrade(rawValue: $0) },
            lastRiskScore: data.lastRiskScore,
            inspectionCount: data.inspectionCount ?? 0,
            nextInspectionDue: data.nextInspectionDue,
            updatedAt: data.updatedAt ?? Date()
        )
    }

    private func updateAsset(_ asset: Asset, from data: SyncAssetResponse) {
        asset.level1 = data.level1
        asset.level2 = data.level2
        asset.level3 = data.level3
        asset.assetCode = data.assetCode
        asset.title = data.title
        asset.zone = data.zone
        asset.region = data.region
        asset.space = data.space
        asset.facility = data.facility
        asset.lastInspectionDate = data.lastInspectionDate
        asset.lastConditionGradeRaw = data.lastConditionGrade
        asset.lastRiskScore = data.lastRiskScore
        asset.inspectionCount = data.inspectionCount ?? 0
        asset.nextInspectionDue = data.nextInspectionDue
        asset.updatedAt = data.updatedAt ?? Date()
    }

    // MARK: - Push Inspections

    @MainActor
    private func pushPendingInspections(context: ModelContext) async throws -> Int {
        let descriptor = FetchDescriptor<Inspection>(
            predicate: #Predicate { $0.syncStatusRaw == "pending" }
        )
        let pending = try context.fetch(descriptor)

        guard !pending.isEmpty else { return 0 }

        let api = APIService.shared
        var syncedCount = 0

        for inspection in pending {
            inspection.syncStatus = .syncing

            do {
                let request = SyncInspectionRequest(
                    clientId: inspection.clientId,
                    assetId: inspection.assetId,
                    dateOfInspection: ISO8601DateFormatter().string(from: inspection.dateOfInspection),
                    inspectorName: inspection.engineerName,
                    conditionGrade: inspection.conditionGradeRaw,
                    comments: inspection.comments,
                    defectSeverity: inspection.defectSeverity,
                    defectDescription: inspection.defectDescription,
                    observedIssues: inspection.observedIssues,
                    recommendedAction: inspection.recommendedAction,
                    followUpRequired: inspection.followUpRequired
                )

                let response = try await api.syncInspection(request)

                inspection.serverId = response.serverId
                inspection.syncVersion = response.syncVersion ?? 1
                inspection.syncStatus = .synced
                inspection.lastSyncedAt = Date()
                inspection.syncError = nil
                syncedCount += 1

                print("Synced inspection \(inspection.clientId) -> \(response.serverId ?? "?")")

            } catch {
                inspection.syncStatus = .failed
                inspection.syncError = error.localizedDescription
                print("Failed to sync inspection \(inspection.clientId): \(error)")
            }
        }

        try context.save()
        return syncedCount
    }

    // MARK: - Upload Photos

    @MainActor
    private func uploadPendingPhotos(context: ModelContext) async throws {
        let descriptor = FetchDescriptor<MediaItem>(
            predicate: #Predicate { $0.needsUpload == true }
        )
        let pending = try context.fetch(descriptor)

        guard !pending.isEmpty else { return }

        let api = APIService.shared

        for photo in pending {
            // Get the inspection's server ID
            guard let inspection = photo.inspection,
                  let serverId = inspection.serverId,
                  let localPath = photo.localPath else {
                continue
            }

            do {
                // Read local file
                let fileURL = URL(fileURLWithPath: localPath)
                let data = try Data(contentsOf: fileURL)

                // Upload
                try await api.uploadMedia(
                    inspectionId: serverId,
                    data: data,
                    filename: photo.filename,
                    mimeType: photo.mimeType
                )

                photo.needsUpload = false
                print("Uploaded photo \(photo.filename)")

            } catch {
                print("Failed to upload photo \(photo.filename): \(error)")
            }
        }

        try context.save()
    }

    // MARK: - Pending Counts

    @MainActor
    func updatePendingCounts() {
        guard let context = modelContext else { return }

        do {
            let inspectionDescriptor = FetchDescriptor<Inspection>(
                predicate: #Predicate { $0.syncStatusRaw == "pending" || $0.syncStatusRaw == "failed" }
            )
            pendingInspections = try context.fetchCount(inspectionDescriptor)

            let photoDescriptor = FetchDescriptor<MediaItem>(
                predicate: #Predicate { $0.needsUpload == true }
            )
            pendingPhotos = try context.fetchCount(photoDescriptor)

        } catch {
            print("Error counting pending items: \(error)")
        }
    }

    // MARK: - Get or Create Asset from API Response

    @MainActor
    func getOrCreateAsset(from response: AssetResponse) throws -> Asset {
        guard let context = modelContext else {
            throw SyncError.notConfigured
        }

        // Check if asset exists locally
        let descriptor = FetchDescriptor<Asset>(
            predicate: #Predicate { $0.id == response.id }
        )

        if let existing = try context.fetch(descriptor).first {
            return existing
        }

        // Create new local asset from API response
        let asset = Asset(
            id: response.id,
            level1: response.level1,
            level2: response.level2,
            level3: response.level3,
            assetId: response.assetId,
            assetCode: response.assetCode,
            title: response.title,
            zone: response.zone,
            region: response.region,
            space: response.space,
            facility: response.facility,
            assetDescription: response.description
        )
        context.insert(asset)
        try context.save()

        return asset
    }

    // MARK: - Create Local Inspection

    @MainActor
    func createInspection(
        asset: Asset,
        engineerId: String,
        engineerName: String,
        conditionGrade: ConditionGrade,
        comments: String?,
        defectSeverity: Int?,
        defectDescription: String?,
        observedIssues: String?,
        recommendedAction: String?,
        followUpRequired: Bool,
        photos: [PhotoCapture]
    ) throws -> Inspection {
        guard let context = modelContext else {
            throw SyncError.notConfigured
        }

        // Create inspection
        let inspection = Inspection(
            assetId: asset.id,
            engineerId: engineerId,
            engineerName: engineerName,
            dateOfInspection: Date(),
            conditionGrade: conditionGrade,
            comments: comments,
            defectSeverity: defectSeverity,
            defectDescription: defectDescription,
            observedIssues: observedIssues,
            recommendedAction: recommendedAction,
            followUpRequired: followUpRequired
        )
        inspection.asset = asset

        context.insert(inspection)

        // Save photos
        for photo in photos {
            let mediaItem = MediaItem(
                id: UUID().uuidString,
                inspectionId: inspection.id,
                type: .photo,
                filename: photo.filename,
                mimeType: "image/jpeg",
                fileSize: photo.data.count,
                localPath: photo.localPath,
                capturedAt: photo.capturedAt
            )
            mediaItem.inspection = inspection
            context.insert(mediaItem)
        }

        try context.save()
        updatePendingCounts()

        // Trigger sync if online
        if isOnline {
            triggerSync()
        }

        return inspection
    }

    // MARK: - Recent Inspection Check

    /// Check if there's a recent inspection for an asset (for conflict warnings)
    @MainActor
    func getRecentInspection(for assetId: String, within hours: Int = 24) -> Inspection? {
        guard let context = modelContext else { return nil }

        let cutoffDate = Calendar.current.date(byAdding: .hour, value: -hours, to: Date())!

        let descriptor = FetchDescriptor<Inspection>(
            predicate: #Predicate { inspection in
                inspection.assetId == assetId && inspection.dateOfInspection > cutoffDate
            },
            sortBy: [SortDescriptor(\.dateOfInspection, order: .reverse)]
        )

        return try? context.fetch(descriptor).first
    }

    /// Check if asset was recently inspected by someone else
    @MainActor
    func wasRecentlyInspectedByOther(assetId: String, currentUserId: String) -> (wasInspected: Bool, inspector: String?, date: Date?) {
        guard let recent = getRecentInspection(for: assetId) else {
            return (false, nil, nil)
        }

        // Check if it was by someone else
        if recent.engineerId != currentUserId {
            return (true, recent.engineerName, recent.dateOfInspection)
        }

        return (false, nil, nil)
    }
}

// MARK: - Supporting Types

struct PhotoCapture {
    let filename: String
    let data: Data
    let localPath: String
    let capturedAt: Date
}

enum SyncError: Error, LocalizedError {
    case notConfigured
    case networkUnavailable
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Sync manager not configured"
        case .networkUnavailable: return "No network connection"
        case .serverError(let message): return message
        }
    }
}

// MARK: - API Extensions

extension APIService {
    func syncAssetsAll(since: Date?) async throws -> SyncAssetsResponse {
        var endpoint = "/sync/assets/all"
        if let since = since {
            endpoint += "?since=\(ISO8601DateFormatter().string(from: since))"
        }
        return try await request(endpoint: endpoint)
    }

    func syncInspection(_ data: SyncInspectionRequest) async throws -> SyncInspectionResponse {
        let body = try JSONEncoder().encode(data)
        return try await request(endpoint: "/sync/inspection", method: "POST", body: body)
    }

    func syncInspectionsAll(since: Date?) async throws -> SyncInspectionsResponse {
        var endpoint = "/sync/inspections/all"
        if let since = since {
            endpoint += "?since=\(ISO8601DateFormatter().string(from: since))"
        }
        return try await request(endpoint: endpoint)
    }

    func uploadMedia(inspectionId: String, data: Data, filename: String, mimeType: String) async throws {
        // Create multipart form data
        let boundary = UUID().uuidString
        var body = Data()

        // Add file field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n".data(using: .utf8)!)

        // Add type field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"type\"\r\n\r\n".data(using: .utf8)!)
        body.append("PHOTO\r\n".data(using: .utf8)!)

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        // Make request
        #if targetEnvironment(simulator)
        let baseURL = "http://localhost:3000/v1"
        #else
        let baseURL = "https://silvertown-api.onrender.com/v1"
        #endif
        guard let url = URL(string: "\(baseURL)/media/inspections/\(inspectionId)/upload") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        // Add auth header - would need to access token here
        request.httpBody = body

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode < 400 else {
            throw APIError.serverError(0, "Upload failed")
        }
    }
}

// MARK: - Sync Response Types

struct SyncAssetsResponse: Codable {
    let assets: [SyncAssetResponse]
    let count: Int
    let hasMore: Bool
    let syncTimestamp: String
}

struct SyncAssetResponse: Codable {
    let id: String
    let assetId: String
    let assetCode: String?
    let title: String?
    let level1: String
    let level2: String
    let level3: String
    let zone: String
    let region: String?
    let space: String?
    let facility: String?
    let lastInspectionDate: Date?
    let lastConditionGrade: String?
    let lastRiskScore: Int?
    let inspectionCount: Int?
    let nextInspectionDue: Date?
    let updatedAt: Date?
}

struct SyncInspectionRequest: Codable {
    let clientId: String
    let assetId: String
    let dateOfInspection: String
    let inspectorName: String?
    let conditionGrade: String
    let comments: String?
    let defectSeverity: Int?
    let defectDescription: String?
    let observedIssues: String?
    let recommendedAction: String?
    let followUpRequired: Bool?
}

struct SyncInspectionResponse: Codable {
    let status: String
    let serverId: String?
    let clientId: String?
    let syncVersion: Int?
}

// MARK: - Sync Inspections Response (for pulling from server)

struct SyncInspectionsResponse: Codable {
    let inspections: [SyncInspectionData]
    let count: Int
    let hasMore: Bool
    let syncTimestamp: String
}

struct SyncInspectionData: Codable {
    let id: String
    let clientId: String?
    let assetId: String
    let engineerId: String
    let inspectorName: String?
    let dateOfInspection: String
    let conditionGrade: String
    let comments: String?
    let defectSeverity: Int?
    let riskScore: Int?
    let defectDescription: String?
    let observedIssues: String?
    let recommendedAction: String?
    let followUpRequired: Bool?
    let status: String?
    let syncVersion: Int?
    let createdAt: String?
    let updatedAt: String?
}
