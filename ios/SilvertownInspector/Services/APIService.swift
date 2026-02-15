import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case noData
    case decodingError
    case networkError(Error)
    case serverError(Int, String)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .noData:
            return "No data received"
        case .decodingError:
            return "Failed to decode response"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .unauthorized:
            return "Unauthorized - please login again"
        }
    }
}

actor APIService {
    static let shared = APIService()

    private let baseURL: String
    private let session: URLSession
    private var accessToken: String?

    private init() {
        // Use localhost for simulator, production URL for device builds
        #if targetEnvironment(simulator)
        self.baseURL = ProcessInfo.processInfo.environment["API_BASE_URL"]
            ?? "http://localhost:3000/v1"
        #else
        self.baseURL = ProcessInfo.processInfo.environment["API_BASE_URL"]
            ?? "https://silvertown-api.onrender.com/v1"
        #endif

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
    }

    func setAccessToken(_ token: String?) {
        self.accessToken = token
    }

    // MARK: - Generic Request

    func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        requiresAuth: Bool = true,
        isRetry: Bool = false
    ) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if requiresAuth, let token = accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            request.httpBody = body
        }

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.noData
            }

            if httpResponse.statusCode == 401 {
                // If this is already a retry, don't try again
                if isRetry {
                    throw APIError.unauthorized
                }

                // Try to refresh the token
                print("🔄 Got 401, attempting token refresh...")
                do {
                    try await AuthManager.shared.refreshAccessToken()
                    print("✅ Token refreshed successfully, retrying request...")

                    // Retry the request with the new token
                    return try await self.request(
                        endpoint: endpoint,
                        method: method,
                        body: body,
                        requiresAuth: requiresAuth,
                        isRetry: true
                    )
                } catch {
                    // Refresh failed, throw unauthorized
                    print("❌ Token refresh failed: \(error)")
                    throw APIError.unauthorized
                }
            }

            if httpResponse.statusCode >= 400 {
                let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
                throw APIError.serverError(httpResponse.statusCode, errorMessage)
            }

            // Handle empty response (204 No Content)
            if httpResponse.statusCode == 204 || data.isEmpty {
                if T.self == EmptyResponse.self {
                    return EmptyResponse() as! T
                }
            }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601

            return try decoder.decode(T.self, from: data)
        } catch let error as APIError {
            throw error
        } catch let error as DecodingError {
            print("Decoding error: \(error)")
            throw APIError.decodingError
        } catch {
            throw APIError.networkError(error)
        }
    }

    // MARK: - Auth

    func login(email: String, password: String) async throws -> LoginResponse {
        let body = try JSONEncoder().encode(["email": email, "password": password])
        return try await request(endpoint: "/auth/login", method: "POST", body: body, requiresAuth: false)
    }

    func refreshToken(_ refreshToken: String) async throws -> LoginResponse {
        let body = try JSONEncoder().encode(["refreshToken": refreshToken])
        return try await request(endpoint: "/auth/refresh", method: "POST", body: body, requiresAuth: false)
    }

    func logout(refreshToken: String) async throws {
        let body = try JSONEncoder().encode(["refreshToken": refreshToken])
        let _: EmptyResponse = try await request(endpoint: "/auth/logout", method: "POST", body: body)
    }

    // MARK: - Assets

    func getAssets(page: Int = 1, limit: Int = 100, zone: String? = nil, level2: String? = nil, search: String? = nil) async throws -> PaginatedResponse<AssetResponse> {
        var components = URLComponents(string: "/assets")!
        var queryItems = [URLQueryItem(name: "page", value: "\(page)"), URLQueryItem(name: "limit", value: "\(limit)")]
        if let zone = zone { queryItems.append(URLQueryItem(name: "zone", value: zone)) }
        if let level2 = level2 { queryItems.append(URLQueryItem(name: "level2", value: level2)) }
        if let search = search { queryItems.append(URLQueryItem(name: "search", value: search)) }
        components.queryItems = queryItems

        return try await request(endpoint: components.string ?? "/assets")
    }

    func getAsset(id: String) async throws -> AssetResponse {
        return try await request(endpoint: "/assets/\(id)")
    }

    func getFilterOptions() async throws -> FilterOptionsResponse {
        return try await request(endpoint: "/assets/filters")
    }

    // MARK: - Inspections

    func getInspections(
        page: Int = 1,
        limit: Int = 50,
        assetId: String? = nil,
        zone: String? = nil,
        status: String? = nil,
        dateFrom: Date? = nil,
        dateTo: Date? = nil
    ) async throws -> PaginatedResponse<InspectionResponse> {
        var components = URLComponents(string: "/inspections")!
        var queryItems = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let assetId = assetId { queryItems.append(URLQueryItem(name: "assetId", value: assetId)) }
        if let zone = zone { queryItems.append(URLQueryItem(name: "zone", value: zone)) }
        if let status = status { queryItems.append(URLQueryItem(name: "status", value: status)) }
        if let dateFrom = dateFrom {
            queryItems.append(URLQueryItem(name: "dateFrom", value: ISO8601DateFormatter().string(from: dateFrom)))
        }
        if let dateTo = dateTo {
            queryItems.append(URLQueryItem(name: "dateTo", value: ISO8601DateFormatter().string(from: dateTo)))
        }
        components.queryItems = queryItems

        return try await request(endpoint: components.string ?? "/inspections")
    }

    func getInspection(id: String) async throws -> InspectionResponse {
        return try await request(endpoint: "/inspections/\(id)")
    }

    func createInspection(_ data: CreateInspectionRequest) async throws -> InspectionResponse {
        let body = try JSONEncoder().encode(data)
        return try await request(endpoint: "/inspections", method: "POST", body: body)
    }

    func updateInspection(id: String, _ data: UpdateInspectionRequest) async throws -> InspectionResponse {
        let body = try JSONEncoder().encode(data)
        return try await request(endpoint: "/inspections/\(id)", method: "PATCH", body: body)
    }

    func submitInspection(id: String) async throws -> InspectionResponse {
        return try await request(endpoint: "/inspections/\(id)/submit", method: "POST")
    }

    // MARK: - Media

    func getMediaUploadURL(inspectionId: String, filename: String, mimeType: String, fileSize: Int) async throws -> MediaUploadURLResponse {
        struct UploadRequest: Codable {
            let filename: String
            let mimeType: String
            let fileSize: Int
        }
        let body = try JSONEncoder().encode(UploadRequest(filename: filename, mimeType: mimeType, fileSize: fileSize))
        return try await request(
            endpoint: "/media/inspections/\(inspectionId)/upload-url",
            method: "POST",
            body: body
        )
    }

    func confirmMediaUpload(inspectionId: String, mediaId: String, caption: String?, capturedAt: Date) async throws -> MediaResponse {
        struct ConfirmRequest: Codable {
            let mediaId: String
            let capturedAt: String
            let caption: String?
        }
        let body = try JSONEncoder().encode(ConfirmRequest(
            mediaId: mediaId,
            capturedAt: ISO8601DateFormatter().string(from: capturedAt),
            caption: caption
        ))
        return try await request(
            endpoint: "/media/inspections/\(inspectionId)/confirm",
            method: "POST",
            body: body
        )
    }

    // MARK: - Sync

    func syncPull(lastSyncAt: Date?, entities: [String]) async throws -> SyncPullResponse {
        var data: [String: Any] = ["entities": entities]
        if let lastSyncAt = lastSyncAt {
            data["lastSyncAt"] = ISO8601DateFormatter().string(from: lastSyncAt)
        }
        let body = try JSONSerialization.data(withJSONObject: data)
        return try await request(endpoint: "/sync/pull", method: "POST", body: body)
    }

    func syncPush(changes: [SyncChange]) async throws -> SyncPushResponse {
        let body = try JSONEncoder().encode(["changes": changes])
        return try await request(endpoint: "/sync/push", method: "POST", body: body)
    }
}

// MARK: - Request/Response Types

struct EmptyResponse: Codable {}

struct CreateInspectionRequest: Codable {
    let assetId: String
    let dateOfInspection: String
    let conditionGrade: String
    let comments: String?
    let status: String?
    let clientId: String?
    let inspectorName: String?
    let defectSeverity: Int?
    let defectDescription: String?
    let observedIssues: String?
    let recommendedAction: String?
    let followUpRequired: Bool?
}

struct FilterOptionsResponse: Codable {
    let zones: [String]
    let level2Values: [String]
}

struct UpdateInspectionRequest: Codable {
    let conditionGrade: String?
    let comments: String?
    let status: String?
}

struct MediaUploadURLResponse: Codable {
    let mediaId: String
    let uploadUrl: String
    let expiresAt: String
    let maxFileSize: Int
}

struct MediaResponse: Codable {
    let id: String
    let inspectionId: String
    let type: String
    let filename: String
    let storageUrl: String
    let thumbnailUrl: String?
    let caption: String?
}

struct SyncPullResponse: Codable {
    let syncedAt: String
    let changes: SyncChanges

    struct SyncChanges: Codable {
        let assets: EntityChanges<AssetResponse>?
        let inspections: EntityChanges<InspectionResponse>?
    }

    struct EntityChanges<T: Codable>: Codable {
        let created: [T]
        let updated: [T]
        let deleted: [String]
    }
}

struct SyncChange: Codable {
    let type: String
    let entity: String
    let clientId: String?
    let id: String?
    let data: [String: AnyCodable]
    let localTimestamp: String
    let syncVersion: Int?
}

struct SyncPushResponse: Codable {
    let results: [SyncResult]
    let syncedAt: String

    struct SyncResult: Codable {
        let clientId: String?
        let id: String?
        let status: String
        let error: String?
    }
}

// Helper for encoding arbitrary dictionaries
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else {
            value = ""
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let string = value as? String {
            try container.encode(string)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        }
    }
}
