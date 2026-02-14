import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var authManager = AuthManager.shared

    var body: some View {
        Group {
            if authManager.isAuthenticated {
                MainTabView()
                    .onAppear {
                        // Configure sync manager with model context
                        SyncManager.shared.configure(modelContext: modelContext)
                        // Trigger initial sync
                        SyncManager.shared.triggerSync()
                    }
            } else {
                LoginView()
            }
        }
    }
}

struct MainTabView: View {
    @State private var selectedTab = 0
    @State private var syncManager = SyncManager.shared
    @State private var showSyncToast = false
    @State private var syncToastMessage = ""
    @State private var syncToastType: SyncEvent.SyncEventType = .success

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(0)

            AssetListView()
                .tabItem {
                    Label("Assets", systemImage: "cube.box")
                }
                .tag(1)

            InspectionsListView()
                .tabItem {
                    Label("Inspections", systemImage: "clipboard")
                }
                .tag(2)

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person")
                }
                .tag(3)
        }
        .tint(.brandPrimary)
        .overlay(alignment: .top) {
            VStack(spacing: 0) {
                // Sync status bar
                if syncManager.isSyncing || syncManager.pendingInspections > 0 {
                    SyncStatusBar(syncManager: syncManager)
                }

                // Toast notification
                if showSyncToast {
                    SyncToast(message: syncToastMessage, type: syncToastType)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .onAppear {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                                withAnimation {
                                    showSyncToast = false
                                }
                            }
                        }
                }
            }
        }
        .onChange(of: syncManager.lastSyncEvent?.id) { _, _ in
            if let event = syncManager.lastSyncEvent {
                syncToastMessage = event.message
                syncToastType = event.type
                withAnimation {
                    showSyncToast = true
                }
            }
        }
    }
}

// MARK: - Sync Status Bar

struct SyncStatusBar: View {
    let syncManager: SyncManager

    var body: some View {
        HStack(spacing: 8) {
            if syncManager.isSyncing {
                ProgressView()
                    .scaleEffect(0.8)
                Text("Syncing...")
            } else if !syncManager.isOnline {
                Image(systemName: "wifi.slash")
                    .foregroundColor(.orange)
                Text("Offline - changes saved locally")
            } else if syncManager.pendingInspections > 0 {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .foregroundColor(.blue)
                Text("\(syncManager.pendingInspections) pending sync")
            }

            Spacer()

            if syncManager.syncError != nil {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.red)
            }
        }
        .font(.caption)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
    }
}

// MARK: - Sync Toast Notification

struct SyncToast: View {
    let message: String
    let type: SyncEvent.SyncEventType

    private var backgroundColor: Color {
        switch type {
        case .success: return .green
        case .warning: return .orange
        case .error: return .red
        }
    }

    private var icon: String {
        switch type {
        case .success: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .error: return "xmark.circle.fill"
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
            Text(message)
                .fontWeight(.medium)
        }
        .font(.subheadline)
        .foregroundColor(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(backgroundColor)
        .cornerRadius(20)
        .shadow(radius: 4)
        .padding(.top, 8)
    }
}

// MARK: - Home View

struct HomeView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var authManager = AuthManager.shared
    @State private var syncManager = SyncManager.shared
    @State private var showAssetPicker = false
    @Query(sort: \Inspection.dateOfInspection, order: .reverse)
    private var recentInspections: [Inspection]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Welcome
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Welcome, \(authManager.currentUser?.displayName.components(separatedBy: " ").first ?? "Engineer")")
                            .font(.title2)
                            .fontWeight(.bold)

                        HStack {
                            Circle()
                                .fill(syncManager.isOnline ? Color.green : Color.orange)
                                .frame(width: 8, height: 8)
                            Text(syncManager.isOnline ? "Online" : "Offline")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding()

                    // Quick Stats
                    HStack(spacing: 12) {
                        StatCard(title: "Today", value: "\(todayInspectionCount)", subtitle: "inspections")
                        StatCard(title: "Pending", value: "\(syncManager.pendingInspections)", subtitle: "sync")
                    }
                    .padding(.horizontal)

                    // Quick Actions
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Quick Actions")
                            .font(.headline)
                            .padding(.horizontal)

                        VStack(spacing: 8) {
                            Button {
                                showAssetPicker = true
                            } label: {
                                QuickActionRow(icon: "plus.circle", title: "New Inspection", color: .brandPrimary)
                            }
                            .buttonStyle(.plain)

                            NavigationLink {
                                InspectionsListView()
                            } label: {
                                QuickActionRow(icon: "clipboard", title: "My Inspections", color: .brandPrimary)
                            }
                            .buttonStyle(.plain)

                            NavigationLink {
                                AssetListView()
                            } label: {
                                QuickActionRow(icon: "cube", title: "Asset Search", color: .brandPrimary)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal)
                    }

                    // Recent
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent")
                            .font(.headline)
                            .padding(.horizontal)

                        if recentInspections.isEmpty {
                            Text("No recent inspections")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .padding(.horizontal)
                        } else {
                            VStack(spacing: 8) {
                                ForEach(recentInspections.prefix(5)) { inspection in
                                    NavigationLink {
                                        InspectionDetailView(inspection: inspection)
                                    } label: {
                                        RecentInspectionRow(
                                            assetId: inspection.asset?.assetId ?? inspection.assetId,
                                            grade: inspection.conditionGrade,
                                            date: formatDate(inspection.dateOfInspection)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                }
            }
            .navigationTitle("Silvertown Tunnel")
            .sheet(isPresented: $showAssetPicker) {
                AssetPickerView()
            }
        }
    }

    private var todayInspectionCount: Int {
        let calendar = Calendar.current
        return recentInspections.filter { calendar.isDateInToday($0.dateOfInspection) }.count
    }

    private func formatDate(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return "Today"
        } else if calendar.isDateInYesterday(date) {
            return "Yesterday"
        } else {
            let formatter = DateFormatter()
            formatter.dateStyle = .short
            return formatter.string(from: date)
        }
    }
}

// MARK: - Asset Picker for New Inspection

struct AssetPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @State private var searchText = ""
    @State private var selectedZone = ""
    @State private var selectedAssetType = ""
    @State private var assets: [AssetResponse] = []
    @State private var filterOptions: (zones: [String], types: [String]) = ([], [])
    @State private var isLoading = false
    @State private var errorMessage: String?

    // Use optional asset for sheet(item:) binding - cleaner than separate bool
    @State private var assetForInspection: AssetResponse?

    // Conflict warning state
    @State private var showConflictWarning = false
    @State private var conflictInspectorName: String?
    @State private var conflictDate: Date?
    @State private var pendingAsset: AssetResponse?  // Asset waiting for conflict confirmation
    @State private var authManager = AuthManager.shared

    private var conflictAlertMessage: String {
        if let inspector = conflictInspectorName, let date = conflictDate {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .full
            let timeAgo = formatter.localizedString(for: date, relativeTo: Date())
            return "This asset was inspected by \(inspector) \(timeAgo). Do you want to create another inspection?"
        }
        return "This asset was recently inspected. Do you want to create another inspection?"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter Section
                VStack(spacing: 12) {
                    // Zone and Asset Type Pickers
                    HStack(spacing: 12) {
                        // Zone Picker
                        Menu {
                            Button("All Zones") {
                                selectedZone = ""
                                loadAssets()
                            }
                            Divider()
                            ForEach(filterOptions.zones, id: \.self) { zone in
                                Button(zone) {
                                    selectedZone = zone
                                    loadAssets()
                                }
                            }
                        } label: {
                            HStack {
                                Text(selectedZone.isEmpty ? "All Zones" : selectedZone)
                                    .font(.subheadline)
                                    .foregroundColor(selectedZone.isEmpty ? .secondary : .primary)
                                Spacer()
                                Image(systemName: "chevron.down")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Color(.systemGray6))
                            .cornerRadius(8)
                        }

                        // Asset Type Picker
                        Menu {
                            Button("All Types") {
                                selectedAssetType = ""
                                loadAssets()
                            }
                            Divider()
                            ForEach(filterOptions.types, id: \.self) { type in
                                Button(type) {
                                    selectedAssetType = type
                                    loadAssets()
                                }
                            }
                        } label: {
                            HStack {
                                Text(selectedAssetType.isEmpty ? "All Types" : selectedAssetType)
                                    .font(.subheadline)
                                    .foregroundColor(selectedAssetType.isEmpty ? .secondary : .primary)
                                    .lineLimit(1)
                                Spacer()
                                Image(systemName: "chevron.down")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Color(.systemGray6))
                            .cornerRadius(8)
                        }
                    }

                    // Search Field
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)
                        TextField("Search by asset ID...", text: $searchText)
                            .textFieldStyle(.plain)
                            .onSubmit { loadAssets() }
                        if !searchText.isEmpty {
                            Button {
                                searchText = ""
                                loadAssets()
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)

                    // Results count and clear filters
                    HStack {
                        if isLoading {
                            ProgressView()
                                .scaleEffect(0.8)
                            Text("Loading...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            Text("\(assets.count) assets")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        if !selectedZone.isEmpty || !selectedAssetType.isEmpty {
                            Button {
                                selectedZone = ""
                                selectedAssetType = ""
                                loadAssets()
                            } label: {
                                Text("Clear filters")
                                    .font(.caption)
                                    .foregroundColor(.brandPrimary)
                            }
                        }
                    }
                }
                .padding()
                .background(Color(.systemBackground))

                Divider()

                // Content
                if let error = errorMessage {
                    ContentUnavailableView(
                        "Error Loading Assets",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                } else if assets.isEmpty && !isLoading && selectedZone.isEmpty && selectedAssetType.isEmpty && searchText.isEmpty {
                    ContentUnavailableView(
                        "Select Filters",
                        systemImage: "line.3.horizontal.decrease.circle",
                        description: Text("Choose a zone or asset type to browse assets, or search by ID above")
                    )
                } else if assets.isEmpty && !isLoading {
                    ContentUnavailableView(
                        "No Assets Found",
                        systemImage: "magnifyingglass",
                        description: Text("Try adjusting your filters or search term")
                    )
                } else {
                    List(assets) { asset in
                        Button {
                            selectAsset(asset)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(asset.assetId)
                                        .font(.headline)
                                        .fontDesign(.monospaced)
                                        .foregroundColor(.primary)

                                    Spacer()

                                    // Show indicator if recently inspected
                                    if asset.lastInspectionDate != nil {
                                        if let dateStr = asset.lastInspectionDate,
                                           let date = ISO8601DateFormatter().date(from: dateStr),
                                           Date().timeIntervalSince(date) < 86400 {
                                            Image(systemName: "clock.badge.checkmark")
                                                .foregroundColor(.orange)
                                                .font(.caption)
                                        }
                                    }
                                }
                                Text(asset.title ?? asset.level3)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                HStack(spacing: 8) {
                                    Label(asset.zone, systemImage: "mappin")
                                    Label(asset.level2, systemImage: "cube")
                                }
                                .font(.caption)
                                .foregroundColor(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Select Asset")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                loadFilterOptions()
            }
            .sheet(item: $assetForInspection) { asset in
                NavigationStack {
                    InspectionFormView(asset: asset) {
                        assetForInspection = nil
                        dismiss()
                    }
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { assetForInspection = nil }
                        }
                    }
                }
                .environment(\.modelContext, modelContext)
            }
            .alert("Recent Inspection", isPresented: $showConflictWarning) {
                Button("Continue Anyway") {
                    // User confirmed, proceed with pending asset
                    if let asset = pendingAsset {
                        assetForInspection = asset
                    }
                    pendingAsset = nil
                }
                Button("Cancel", role: .cancel) {
                    pendingAsset = nil
                }
            } message: {
                Text(conflictAlertMessage)
            }
        }
    }

    private func selectAsset(_ asset: AssetResponse) {
        // Check for recent inspection by another user
        if let userId = authManager.currentUser?.id {
            let (wasInspected, inspector, date) = SyncManager.shared.wasRecentlyInspectedByOther(
                assetId: asset.id,
                currentUserId: userId
            )

            if wasInspected {
                // Store pending asset and show warning
                pendingAsset = asset
                conflictInspectorName = inspector
                conflictDate = date
                showConflictWarning = true
                return
            }
        }

        // No conflict, proceed directly to inspection form
        assetForInspection = asset
    }

    private func loadFilterOptions() {
        Task {
            do {
                let options = try await APIService.shared.getFilterOptions()
                await MainActor.run {
                    filterOptions = (options.zones, options.level2Values)
                }
            } catch {
                print("❌ Failed to load filter options: \(error)")
            }
        }
    }

    private func loadAssets() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let response = try await APIService.shared.getAssets(
                    page: 1,
                    limit: 100,
                    zone: selectedZone.isEmpty ? nil : selectedZone,
                    level2: selectedAssetType.isEmpty ? nil : selectedAssetType,
                    search: searchText.isEmpty ? nil : searchText
                )
                await MainActor.run {
                    assets = response.data
                    isLoading = false
                }
            } catch {
                print("❌ Failed to load assets: \(error)")
                await MainActor.run {
                    errorMessage = "Failed to load assets: \(error.localizedDescription)"
                    isLoading = false
                }
            }
        }
    }
}

// Simple inspection form that works with API response
struct InspectionFormView: View {
    let asset: AssetResponse
    let onComplete: () -> Void

    @Environment(\.modelContext) private var modelContext
    @State private var authManager = AuthManager.shared

    @State private var selectedGrade: ConditionGrade?

    init(asset: AssetResponse, onComplete: @escaping () -> Void) {
        self.asset = asset
        self.onComplete = onComplete
        print("📋 InspectionFormView init for asset: \(asset.assetId)")
    }
    @State private var comments = ""
    @State private var defectSeverity: Int?
    @State private var defectDescription = ""
    @State private var observedIssues = ""
    @State private var recommendedAction = ""
    @State private var followUpRequired = false
    @State private var isSaving = false
    @State private var showError = false
    @State private var errorMessage = ""

    private var hasDefect: Bool {
        guard let grade = selectedGrade else { return false }
        return grade != .grade1
    }

    private var riskScore: Int? {
        guard let grade = selectedGrade, let severity = defectSeverity else { return nil }
        return grade.value * severity
    }

    private var canSave: Bool {
        guard selectedGrade != nil else { return false }
        if hasDefect && defectSeverity == nil { return false }
        return true
    }

    var body: some View {
        Form {
            Section("Asset") {
                Text("Asset ID: \(asset.assetId)")
                Text("Type: \(asset.level3)")
                Text("Zone: \(asset.zone)")
            }

            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Condition Grade")
                        .font(.headline)

                    HStack(spacing: 8) {
                        ForEach(ConditionGrade.allCases, id: \.self) { grade in
                            Button {
                                selectedGrade = grade
                                if grade == .grade1 {
                                    defectSeverity = nil
                                }
                            } label: {
                                VStack(spacing: 4) {
                                    Circle()
                                        .fill(Color(hex: grade.color))
                                        .frame(width: 44, height: 44)
                                        .overlay(
                                            Text("\(grade.value)")
                                                .font(.headline)
                                                .fontWeight(.bold)
                                                .foregroundColor(.white)
                                        )
                                        .overlay(
                                            Circle()
                                                .stroke(selectedGrade == grade ? Color.primary : Color.clear, lineWidth: 3)
                                        )
                                    Text(grade.shortLabel)
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if let grade = selectedGrade {
                        Text(grade.description)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            if hasDefect {
                Section("Defect Assessment") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Defect Severity")
                            .font(.subheadline)
                            .fontWeight(.medium)

                        HStack(spacing: 8) {
                            ForEach(1...5, id: \.self) { level in
                                Button {
                                    defectSeverity = level
                                } label: {
                                    Circle()
                                        .fill(severityColor(level))
                                        .frame(width: 36, height: 36)
                                        .overlay(
                                            Text("\(level)")
                                                .font(.subheadline)
                                                .fontWeight(.bold)
                                                .foregroundColor(.white)
                                        )
                                        .overlay(
                                            Circle()
                                                .stroke(defectSeverity == level ? Color.primary : Color.clear, lineWidth: 2)
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if let score = riskScore {
                        HStack {
                            Text("Risk Score")
                            Spacer()
                            Text("\(score)")
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(riskScoreColor(score))
                        }
                    }

                    TextField("Defect Description", text: $defectDescription, axis: .vertical)
                        .lineLimit(3...6)

                    TextField("Observed Issues", text: $observedIssues, axis: .vertical)
                        .lineLimit(3...6)

                    TextField("Recommended Action", text: $recommendedAction, axis: .vertical)
                        .lineLimit(3...6)

                    Toggle("Follow-up Required", isOn: $followUpRequired)
                }
            }

            Section("Additional Comments") {
                TextField("Any additional observations...", text: $comments, axis: .vertical)
                    .lineLimit(3...6)
            }
        }
        .navigationTitle("New Inspection")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    saveInspection()
                }
                .disabled(!canSave || isSaving)
            }
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
        }
    }

    private func severityColor(_ level: Int) -> Color {
        switch level {
        case 1: return .green
        case 2: return Color(red: 0.52, green: 0.8, blue: 0.09)
        case 3: return .orange
        case 4: return Color(red: 0.98, green: 0.45, blue: 0.09)
        case 5: return .red
        default: return .gray
        }
    }

    private func riskScoreColor(_ score: Int) -> Color {
        if score >= 15 { return .red }
        if score >= 10 { return .orange }
        if score >= 5 { return .yellow }
        return .green
    }

    private func saveInspection() {
        guard let grade = selectedGrade,
              let user = authManager.currentUser else {
            errorMessage = "Missing required data"
            showError = true
            return
        }

        isSaving = true

        // Use offline-first approach via SyncManager
        Task { @MainActor in
            do {
                // Get or create local Asset from API response
                let localAsset = try SyncManager.shared.getOrCreateAsset(from: asset)

                // Create inspection locally (will sync when online)
                _ = try SyncManager.shared.createInspection(
                    asset: localAsset,
                    engineerId: user.id,
                    engineerName: user.displayName,
                    conditionGrade: grade,
                    comments: comments.isEmpty ? nil : comments,
                    defectSeverity: hasDefect ? defectSeverity : nil,
                    defectDescription: hasDefect && !defectDescription.isEmpty ? defectDescription : nil,
                    observedIssues: hasDefect && !observedIssues.isEmpty ? observedIssues : nil,
                    recommendedAction: hasDefect && !recommendedAction.isEmpty ? recommendedAction : nil,
                    followUpRequired: hasDefect ? followUpRequired : false,
                    photos: [] // TODO: Add photo capture support
                )

                print("✅ Inspection saved locally (will sync when online)")
                onComplete()

            } catch {
                print("❌ Failed to save inspection: \(error)")
                errorMessage = "Failed to save: \(error.localizedDescription)"
                showError = true
                isSaving = false
            }
        }
    }
}

struct AssetRowView: View {
    let asset: Asset

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(asset.assetId)
                    .font(.headline)
                    .fontDesign(.monospaced)

                Text(asset.title ?? asset.level3)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                HStack(spacing: 8) {
                    Label(asset.zone, systemImage: "mappin")
                    Label(asset.level2, systemImage: "cube")
                }
                .font(.caption)
                .foregroundColor(.secondary)
            }

            Spacer()

            // Show last inspection grade if available
            if let grade = asset.lastConditionGrade {
                ConditionGradeBadge(grade: grade, size: .small)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Inspection Detail View

struct InspectionDetailView: View {
    let inspection: Inspection

    var body: some View {
        List {
            Section("Asset") {
                LabeledContent("Asset ID", value: inspection.asset?.assetId ?? inspection.assetId)
                if let title = inspection.asset?.title {
                    LabeledContent("Title", value: title)
                }
                LabeledContent("Zone", value: inspection.asset?.zone ?? "-")
            }

            Section("Inspection") {
                HStack {
                    Text("Condition Grade")
                    Spacer()
                    ConditionGradeBadge(grade: inspection.conditionGrade, size: .small)
                }
                LabeledContent("Date", value: inspection.dateOfInspection.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Inspector", value: inspection.engineerName ?? "-")
                LabeledContent("Status", value: inspection.syncStatus.rawValue.capitalized)
            }

            if let comments = inspection.comments, !comments.isEmpty {
                Section("Comments") {
                    Text(comments)
                }
            }

            if inspection.conditionGrade != .grade1 {
                Section("Defect Assessment") {
                    if let severity = inspection.defectSeverity {
                        LabeledContent("Severity", value: "\(severity)")
                    }
                    if let riskScore = inspection.riskScore {
                        LabeledContent("Risk Score", value: "\(riskScore)")
                    }
                    if let description = inspection.defectDescription, !description.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Description")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(description)
                        }
                    }
                    if let issues = inspection.observedIssues, !issues.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Observed Issues")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(issues)
                        }
                    }
                    if let action = inspection.recommendedAction, !action.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Recommended Action")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(action)
                        }
                    }
                    if inspection.followUpRequired {
                        Label("Follow-up Required", systemImage: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                    }
                }
            }
        }
        .navigationTitle("Inspection")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Supporting Views

struct StatCard: View {
    let title: String
    let value: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(value)
                .font(.title)
                .fontWeight(.bold)
            Text(subtitle)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4)
    }
}

struct QuickActionRow: View {
    let icon: String
    let title: String
    let color: Color

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(color)
                .frame(width: 32)

            Text(title)
                .fontWeight(.medium)

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
    }
}

struct RecentInspectionRow: View {
    let assetId: String
    let grade: ConditionGrade
    let date: String

    var body: some View {
        HStack {
            ConditionGradeBadge(grade: grade, size: .small)

            VStack(alignment: .leading) {
                Text(assetId)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(date)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Inspections List View

struct InspectionsListView: View {
    @Query(sort: \Inspection.dateOfInspection, order: .reverse)
    private var inspections: [Inspection]
    @State private var filterStatus: SyncStatus?
    @State private var syncManager = SyncManager.shared

    var filteredInspections: [Inspection] {
        if let status = filterStatus {
            return inspections.filter { $0.syncStatus == status }
        }
        return inspections
    }

    var body: some View {
        NavigationStack {
            List {
                if inspections.isEmpty {
                    ContentUnavailableView(
                        "No Inspections",
                        systemImage: "clipboard",
                        description: Text("Inspections you create will appear here")
                    )
                } else {
                    ForEach(filteredInspections) { inspection in
                        NavigationLink {
                            InspectionDetailView(inspection: inspection)
                        } label: {
                            InspectionRowView(inspection: inspection)
                        }
                    }
                }
            }
            .refreshable {
                // Pull to refresh triggers sync
                await withCheckedContinuation { continuation in
                    SyncManager.shared.triggerSync()
                    // Wait a moment for sync to start, then complete
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                        continuation.resume()
                    }
                }
            }
            .navigationTitle("Inspections")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    // Sync status indicator
                    HStack(spacing: 4) {
                        if syncManager.isSyncing {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else if !syncManager.isOnline {
                            Image(systemName: "wifi.slash")
                                .foregroundColor(.orange)
                                .font(.caption)
                        } else if syncManager.pendingInspections > 0 {
                            Image(systemName: "clock")
                                .foregroundColor(.orange)
                                .font(.caption)
                            Text("\(syncManager.pendingInspections)")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("All") { filterStatus = nil }
                        Divider()
                        Button {
                            filterStatus = .pending
                        } label: {
                            Label("Pending (\(inspections.filter { $0.syncStatus == .pending }.count))", systemImage: "clock")
                        }
                        Button {
                            filterStatus = .synced
                        } label: {
                            Label("Synced (\(inspections.filter { $0.syncStatus == .synced }.count))", systemImage: "checkmark.circle")
                        }
                        Button {
                            filterStatus = .failed
                        } label: {
                            Label("Failed (\(inspections.filter { $0.syncStatus == .failed }.count))", systemImage: "exclamationmark.circle")
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
            }
        }
    }
}

struct InspectionRowView: View {
    let inspection: Inspection

    var body: some View {
        HStack(spacing: 12) {
            ConditionGradeBadge(grade: inspection.conditionGrade, size: .small)

            VStack(alignment: .leading, spacing: 4) {
                Text(inspection.asset?.assetId ?? inspection.assetId)
                    .font(.headline)
                Text(inspection.dateOfInspection.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Sync status indicator
            switch inspection.syncStatus {
            case .pending:
                Image(systemName: "clock")
                    .foregroundColor(.orange)
            case .syncing:
                ProgressView()
                    .scaleEffect(0.7)
            case .synced:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
            case .failed:
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundColor(.red)
            case .conflict:
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
            }
        }
        .padding(.vertical, 4)
    }
}

struct NewInspectionView: View {
    var body: some View {
        NavigationStack {
            Text("New Inspection Form")
                .navigationTitle("New Inspection")
        }
    }
}

struct ProfileView: View {
    @State private var authManager = AuthManager.shared

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Circle()
                            .fill(Color.brandPrimary)
                            .frame(width: 60, height: 60)
                            .overlay(
                                Text(String(authManager.currentUser?.displayName.prefix(1) ?? "?"))
                                    .font(.title)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                            )

                        VStack(alignment: .leading) {
                            Text(authManager.currentUser?.displayName ?? "")
                                .font(.headline)
                            Text(authManager.currentUser?.email ?? "")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            Text(authManager.currentUser?.role.rawValue ?? "")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Section("App") {
                    NavigationLink(destination: Text("Statistics")) {
                        Label("My Statistics", systemImage: "chart.bar")
                    }
                    NavigationLink(destination: Text("Settings")) {
                        Label("Settings", systemImage: "gear")
                    }
                    NavigationLink(destination: Text("Sync Status")) {
                        Label("Sync Status", systemImage: "arrow.triangle.2.circlepath")
                    }
                }

                Section {
                    Button(action: {
                        Task { await authManager.logout() }
                    }) {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}

#Preview {
    ContentView()
}
