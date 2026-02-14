import Foundation
import SwiftData

// MARK: - Enums

enum Role: String, Codable {
    case admin = "ADMIN"
    case manager = "MANAGER"
    case engineer = "ENGINEER"
}

enum ConditionGrade: String, Codable, CaseIterable {
    case grade1 = "GRADE_1"
    case grade2 = "GRADE_2"
    case grade3 = "GRADE_3"
    case grade4 = "GRADE_4"
    case grade5 = "GRADE_5"

    var value: Int {
        switch self {
        case .grade1: return 1
        case .grade2: return 2
        case .grade3: return 3
        case .grade4: return 4
        case .grade5: return 5
        }
    }

    var label: String {
        switch self {
        case .grade1: return "No deterioration"
        case .grade2: return "Minor deterioration"
        case .grade3: return "Moderate deterioration"
        case .grade4: return "Significant deterioration"
        case .grade5: return "Severe deterioration / failure"
        }
    }

    var description: String {
        switch self {
        case .grade1: return "No action required"
        case .grade2: return "Monitor / Plan maintenance"
        case .grade3: return "Maintenance within 6-12 months"
        case .grade4: return "Programmed works within 1-6 months"
        case .grade5: return "Urgent immediate action required"
        }
    }

    var color: String {
        switch self {
        case .grade1: return "#22C55E"
        case .grade2: return "#84CC16"
        case .grade3: return "#F59E0B"
        case .grade4: return "#F97316"
        case .grade5: return "#EF4444"
        }
    }

    var shortLabel: String {
        switch self {
        case .grade1: return "Good"
        case .grade2: return "Minor"
        case .grade3: return "Moderate"
        case .grade4: return "Significant"
        case .grade5: return "Severe"
        }
    }
}

enum InspectionStatus: String, Codable {
    case notStarted = "NOT_STARTED"
    case inProgress = "IN_PROGRESS"
    case complete = "COMPLETE"
    case submitted = "SUBMITTED"
}

enum MediaType: String, Codable {
    case photo = "PHOTO"
    case video = "VIDEO"
}

// MARK: - User

struct User: Codable, Identifiable {
    let id: String
    let email: String
    let firstName: String?
    let lastName: String?
    let displayName: String
    let role: Role
}

// MARK: - Asset (SwiftData for offline storage)

@Model
final class Asset {
    @Attribute(.unique) var id: String
    var level1: String
    var level2: String
    var level3: String
    @Attribute(.unique) var assetId: String
    var assetCode: String?
    var title: String?
    var zone: String
    var region: String?
    var space: String?
    var facility: String?
    var assetDescription: String?

    // Inspection tracking (denormalized from server)
    var lastInspectionDate: Date?
    var lastConditionGradeRaw: String?
    var lastRiskScore: Int?
    var inspectionCount: Int
    var nextInspectionDue: Date?

    var updatedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \Inspection.asset)
    var inspections: [Inspection]?

    var lastConditionGrade: ConditionGrade? {
        get {
            guard let raw = lastConditionGradeRaw else { return nil }
            return ConditionGrade(rawValue: raw)
        }
        set { lastConditionGradeRaw = newValue?.rawValue }
    }

    var isOverdue: Bool {
        guard let due = nextInspectionDue else { return false }
        return due < Date()
    }

    var isDueSoon: Bool {
        guard let due = nextInspectionDue else { return false }
        let thirtyDays = Calendar.current.date(byAdding: .day, value: 30, to: Date())!
        return due >= Date() && due <= thirtyDays
    }

    init(
        id: String,
        level1: String = "MEP",
        level2: String,
        level3: String,
        assetId: String,
        assetCode: String? = nil,
        title: String? = nil,
        zone: String,
        region: String? = nil,
        space: String? = nil,
        facility: String? = nil,
        assetDescription: String? = nil,
        lastInspectionDate: Date? = nil,
        lastConditionGrade: ConditionGrade? = nil,
        lastRiskScore: Int? = nil,
        inspectionCount: Int = 0,
        nextInspectionDue: Date? = nil,
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.level1 = level1
        self.level2 = level2
        self.level3 = level3
        self.assetId = assetId
        self.assetCode = assetCode
        self.title = title
        self.zone = zone
        self.region = region
        self.space = space
        self.facility = facility
        self.assetDescription = assetDescription
        self.lastInspectionDate = lastInspectionDate
        self.lastConditionGradeRaw = lastConditionGrade?.rawValue
        self.lastRiskScore = lastRiskScore
        self.inspectionCount = inspectionCount
        self.nextInspectionDue = nextInspectionDue
        self.updatedAt = updatedAt
    }
}

// MARK: - Defect Severity

enum DefectSeverity: Int, CaseIterable, Codable {
    case level1 = 1
    case level2 = 2
    case level3 = 3
    case level4 = 4
    case level5 = 5

    var label: String {
        switch self {
        case .level1: return "Very Low"
        case .level2: return "Low"
        case .level3: return "Moderate"
        case .level4: return "High"
        case .level5: return "Critical"
        }
    }

    var color: String {
        switch self {
        case .level1: return "#22C55E"
        case .level2: return "#84CC16"
        case .level3: return "#F59E0B"
        case .level4: return "#F97316"
        case .level5: return "#EF4444"
        }
    }
}

// MARK: - Sync Status

enum SyncStatus: String, Codable {
    case pending = "pending"
    case syncing = "syncing"
    case synced = "synced"
    case failed = "failed"
    case conflict = "conflict"
}

// MARK: - Inspection (SwiftData for offline storage)

@Model
final class Inspection {
    @Attribute(.unique) var id: String
    var assetId: String
    var engineerId: String
    var engineerName: String
    var dateOfInspection: Date
    var conditionGradeRaw: String
    var comments: String?
    var statusRaw: String
    var submittedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    // Defect Assessment (when grade > 1)
    var defectSeverity: Int?
    var riskScore: Int?
    var defectDescription: String?
    var observedIssues: String?
    var recommendedAction: String?
    var followUpRequired: Bool

    // Offline sync
    @Attribute(.unique) var clientId: String
    var serverId: String?
    var syncStatusRaw: String
    var syncVersion: Int
    var lastSyncedAt: Date?
    var syncError: String?

    // Relationship
    var asset: Asset?

    @Relationship(deleteRule: .cascade, inverse: \MediaItem.inspection)
    var media: [MediaItem]?

    var conditionGrade: ConditionGrade {
        get { ConditionGrade(rawValue: conditionGradeRaw) ?? .grade1 }
        set { conditionGradeRaw = newValue.rawValue }
    }

    var status: InspectionStatus {
        get { InspectionStatus(rawValue: statusRaw) ?? .notStarted }
        set { statusRaw = newValue.rawValue }
    }

    var syncStatus: SyncStatus {
        get { SyncStatus(rawValue: syncStatusRaw) ?? .pending }
        set { syncStatusRaw = newValue.rawValue }
    }

    var hasDefect: Bool {
        conditionGrade != .grade1
    }

    var calculatedRiskScore: Int? {
        guard let severity = defectSeverity else { return nil }
        return conditionGrade.value * severity
    }

    var priority: String? {
        guard let score = riskScore ?? calculatedRiskScore else { return nil }
        if score >= 15 { return "P1" }
        if score >= 10 { return "P2" }
        if score >= 5 { return "P3" }
        return "P4"
    }

    init(
        assetId: String,
        engineerId: String,
        engineerName: String,
        dateOfInspection: Date = Date(),
        conditionGrade: ConditionGrade,
        comments: String? = nil,
        defectSeverity: Int? = nil,
        defectDescription: String? = nil,
        observedIssues: String? = nil,
        recommendedAction: String? = nil,
        followUpRequired: Bool = false,
        status: InspectionStatus = .complete
    ) {
        self.id = UUID().uuidString
        self.clientId = UUID().uuidString
        self.assetId = assetId
        self.engineerId = engineerId
        self.engineerName = engineerName
        self.dateOfInspection = dateOfInspection
        self.conditionGradeRaw = conditionGrade.rawValue
        self.comments = comments
        self.defectSeverity = defectSeverity
        self.defectDescription = defectDescription
        self.observedIssues = observedIssues
        self.recommendedAction = recommendedAction
        self.followUpRequired = followUpRequired
        self.statusRaw = status.rawValue
        self.createdAt = Date()
        self.updatedAt = Date()
        self.syncStatusRaw = SyncStatus.pending.rawValue
        self.syncVersion = 0

        // Calculate risk score
        if let severity = defectSeverity {
            self.riskScore = conditionGrade.value * severity
        }
    }
}

// MARK: - Media Item (SwiftData for offline storage)

@Model
final class MediaItem {
    @Attribute(.unique) var id: String
    var inspectionId: String
    var typeRaw: String
    var filename: String
    var mimeType: String
    var fileSize: Int
    var localPath: String? // Local file path for offline media
    var remoteUrl: String? // Remote URL after upload
    var thumbnailLocalPath: String?
    var thumbnailRemoteUrl: String?
    var caption: String?
    var capturedAt: Date

    // Offline sync
    var clientId: String?
    var needsUpload: Bool

    // Relationship
    var inspection: Inspection?

    var type: MediaType {
        get { MediaType(rawValue: typeRaw) ?? .photo }
        set { typeRaw = newValue.rawValue }
    }

    init(
        id: String = UUID().uuidString,
        inspectionId: String,
        type: MediaType,
        filename: String,
        mimeType: String,
        fileSize: Int,
        localPath: String? = nil,
        caption: String? = nil,
        capturedAt: Date = Date()
    ) {
        self.id = id
        self.inspectionId = inspectionId
        self.typeRaw = type.rawValue
        self.filename = filename
        self.mimeType = mimeType
        self.fileSize = fileSize
        self.localPath = localPath
        self.caption = caption
        self.capturedAt = capturedAt
        self.clientId = UUID().uuidString
        self.needsUpload = true
    }
}

// MARK: - Sync Queue Item

@Model
final class SyncQueueItem {
    @Attribute(.unique) var id: String
    var typeRaw: String // CREATE, UPDATE, DELETE
    var entityType: String // inspection, media
    var entityId: String
    var payload: Data? // JSON encoded data
    var localTimestamp: Date
    var attempts: Int
    var lastAttemptAt: Date?
    var errorMessage: String?

    enum OperationType: String {
        case create = "CREATE"
        case update = "UPDATE"
        case delete = "DELETE"
    }

    var operationType: OperationType {
        get { OperationType(rawValue: typeRaw) ?? .create }
        set { typeRaw = newValue.rawValue }
    }

    init(
        operationType: OperationType,
        entityType: String,
        entityId: String,
        payload: Data? = nil
    ) {
        self.id = UUID().uuidString
        self.typeRaw = operationType.rawValue
        self.entityType = entityType
        self.entityId = entityId
        self.payload = payload
        self.localTimestamp = Date()
        self.attempts = 0
    }
}

// MARK: - API Response Types

struct LoginResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let user: User
}

struct PaginatedResponse<T: Codable>: Codable {
    let data: [T]
    let pagination: Pagination

    struct Pagination: Codable {
        let page: Int
        let limit: Int
        let total: Int
        let totalPages: Int
    }
}

// MARK: - Asset API Response (different from SwiftData model)

struct AssetResponse: Codable, Identifiable {
    let id: String
    let level1: String
    let level2: String
    let level3: String
    let assetId: String
    let assetCode: String?
    let title: String?
    let zone: String
    let region: String?
    let space: String?
    let facility: String?
    let description: String?
    let location: String?
    let lastInspectionDate: String?
    let lastConditionGrade: String?
    let lastRiskScore: Int?
    let inspectionCount: Int?
    let nextInspectionDue: String?
    let createdAt: String
    let updatedAt: String
}

// MARK: - Inspection API Response

struct InspectionResponse: Codable {
    let id: String
    let assetId: String
    let engineerId: String
    let dateOfInspection: String
    let conditionGrade: String
    let comments: String?
    let status: String
    let submittedAt: String?
    let createdAt: String
    let updatedAt: String
    let asset: AssetResponse?
    let engineer: EngineerInfo?

    struct EngineerInfo: Codable {
        let id: String
        let displayName: String
    }
}
