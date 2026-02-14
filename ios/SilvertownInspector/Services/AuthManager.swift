import Foundation
import SwiftUI
import Security

@MainActor
@Observable
final class AuthManager {
    static let shared = AuthManager()

    var isAuthenticated = false
    var currentUser: User?
    var isLoading = false

    private var accessToken: String?
    private var refreshToken: String?

    private let keychainService = "com.infratec.silvertown-inspector"

    private init() {
        // Try to restore session from keychain
        restoreSession()
    }

    // MARK: - Login

    func login(email: String, password: String) async throws {
        isLoading = true
        defer { isLoading = false }

        let response = try await APIService.shared.login(email: email, password: password)

        self.accessToken = response.accessToken
        self.refreshToken = response.refreshToken
        self.currentUser = response.user
        self.isAuthenticated = true

        await APIService.shared.setAccessToken(response.accessToken)

        // Save to keychain
        saveToKeychain(key: "accessToken", value: response.accessToken)
        saveToKeychain(key: "refreshToken", value: response.refreshToken)
        saveToKeychain(key: "user", value: try? JSONEncoder().encode(response.user))
    }

    // MARK: - Logout

    func logout() async {
        // Try to revoke token on server
        if let refreshToken = refreshToken {
            try? await APIService.shared.logout(refreshToken: refreshToken)
        }

        // Clear local state
        accessToken = nil
        refreshToken = nil
        currentUser = nil
        isAuthenticated = false

        await APIService.shared.setAccessToken(nil)

        // Clear keychain
        deleteFromKeychain(key: "accessToken")
        deleteFromKeychain(key: "refreshToken")
        deleteFromKeychain(key: "user")
    }

    // MARK: - Token Refresh

    func refreshAccessToken() async throws {
        guard let refreshToken = refreshToken else {
            throw AuthError.noRefreshToken
        }

        let response = try await APIService.shared.refreshToken(refreshToken)

        self.accessToken = response.accessToken
        self.refreshToken = response.refreshToken

        await APIService.shared.setAccessToken(response.accessToken)

        // Update keychain
        saveToKeychain(key: "accessToken", value: response.accessToken)
        saveToKeychain(key: "refreshToken", value: response.refreshToken)
    }

    // MARK: - Session Restore

    private func restoreSession() {
        if let accessToken = loadFromKeychain(key: "accessToken") as? String,
           let refreshToken = loadFromKeychain(key: "refreshToken") as? String,
           let userData = loadFromKeychain(key: "user") as? Data,
           let user = try? JSONDecoder().decode(User.self, from: userData) {

            self.accessToken = accessToken
            self.refreshToken = refreshToken
            self.currentUser = user
            self.isAuthenticated = true

            Task {
                await APIService.shared.setAccessToken(accessToken)

                // Try to refresh token in background
                try? await refreshAccessToken()
            }
        }
    }

    // MARK: - Keychain Helpers

    private func saveToKeychain(key: String, value: Any) {
        let data: Data
        if let stringValue = value as? String {
            data = stringValue.data(using: .utf8)!
        } else if let dataValue = value as? Data {
            data = dataValue
        } else {
            return
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]

        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    private func loadFromKeychain(key: String) -> Any? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)

        if status == errSecSuccess, let data = dataTypeRef as? Data {
            if key == "user" {
                return data
            }
            return String(data: data, encoding: .utf8)
        }
        return nil
    }

    private func deleteFromKeychain(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Role Checking

    func hasRole(_ roles: Role...) -> Bool {
        guard let user = currentUser else { return false }
        return roles.contains(user.role)
    }
}

enum AuthError: Error, LocalizedError {
    case noRefreshToken
    case sessionExpired

    var errorDescription: String? {
        switch self {
        case .noRefreshToken:
            return "No refresh token available"
        case .sessionExpired:
            return "Your session has expired. Please login again."
        }
    }
}
