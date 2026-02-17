import SwiftUI
import SwiftData
import PhotosUI

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
                    Label("Home", systemImage: "house.fill")
                }
                .tag(0)

            AssetListView()
                .tabItem {
                    Label("Assets", systemImage: "cube.box.fill")
                }
                .tag(1)

            InspectionsListView()
                .tabItem {
                    Label("Inspections", systemImage: "clipboard.fill")
                }
                .tag(2)

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.fill")
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
                    .font(.caption)
                    .fontWeight(.medium)
            } else if !syncManager.isOnline {
                Image(systemName: "wifi.slash")
                    .foregroundColor(.orange)
                Text("Offline - changes saved locally")
                    .font(.caption)
            } else if syncManager.pendingInspections > 0 {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .foregroundColor(.brandPrimary)
                Text("\(syncManager.pendingInspections) pending sync")
                    .font(.caption)
            }

            Spacer()

            if syncManager.syncError != nil {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.red)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }
}

// MARK: - Sync Toast Notification

struct SyncToast: View {
    let message: String
    let type: SyncEvent.SyncEventType

    private var backgroundColor: Color {
        switch type {
        case .success: return .grade1Color
        case .warning: return .grade3Color
        case .error: return .grade5Color
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
        HStack(spacing: 10) {
            Image(systemName: icon)
            Text(message)
                .fontWeight(.medium)
        }
        .font(.subheadline)
        .foregroundColor(.white)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(backgroundColor)
        .cornerRadius(25)
        .shadow(color: backgroundColor.opacity(0.3), radius: 8, y: 4)
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
                VStack(alignment: .leading, spacing: 24) {
                    // Welcome Header
                    welcomeHeader
                        .padding(.horizontal)

                    // Quick Stats
                    statsSection
                        .padding(.horizontal)

                    // Quick Actions
                    quickActionsSection

                    // Recent Inspections
                    recentSection
                }
                .padding(.vertical)
            }
            .background(Color(.systemGray6))
            .navigationTitle("Silvertown Tunnel")
            .sheet(isPresented: $showAssetPicker) {
                AssetPickerView()
            }
        }
    }

    // MARK: - Welcome Header

    private var welcomeHeader: some View {
        HStack(spacing: 16) {
            // Avatar
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [.brandPrimary, .brandPrimaryDark],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)

                Text(String(authManager.currentUser?.displayName.prefix(1) ?? "?"))
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
            }
            .shadow(color: .brandPrimary.opacity(0.3), radius: 8, y: 4)

            VStack(alignment: .leading, spacing: 4) {
                Text("Welcome back,")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Text(authManager.currentUser?.displayName.components(separatedBy: " ").first ?? "Engineer")
                    .font(.title2)
                    .fontWeight(.bold)

                HStack(spacing: 6) {
                    Circle()
                        .fill(syncManager.isOnline ? Color.grade1Color : Color.grade3Color)
                        .frame(width: 8, height: 8)
                    Text(syncManager.isOnline ? "Online" : "Offline")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.06), radius: 12, y: 6)
    }

    // MARK: - Stats Section

    private var statsSection: some View {
        HStack(spacing: 12) {
            StatCard(
                title: "Today",
                value: "\(todayInspectionCount)",
                subtitle: "inspections",
                icon: "checkmark.circle.fill",
                accentColor: .brandPrimary
            )

            StatCard(
                title: "Pending",
                value: "\(syncManager.pendingInspections)",
                subtitle: "to sync",
                icon: "arrow.triangle.2.circlepath",
                accentColor: syncManager.pendingInspections > 0 ? .grade3Color : .grade1Color
            )
        }
    }

    // MARK: - Quick Actions Section

    private var quickActionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Actions")
                .font(.headline)
                .fontWeight(.semibold)
                .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    QuickActionCard(
                        icon: "plus.circle.fill",
                        title: "New\nInspection",
                        color: .brandPrimary
                    ) {
                        showAssetPicker = true
                    }

                    NavigationLink {
                        InspectionsListView()
                    } label: {
                        QuickActionCardContent(
                            icon: "clipboard.fill",
                            title: "My\nInspections",
                            color: .brandSecondary
                        )
                    }

                    NavigationLink {
                        AssetListView()
                    } label: {
                        QuickActionCardContent(
                            icon: "cube.fill",
                            title: "Browse\nAssets",
                            color: .brandPrimaryLight
                        )
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    // MARK: - Recent Section

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recent Inspections")
                    .font(.headline)
                    .fontWeight(.semibold)

                Spacer()

                if !recentInspections.isEmpty {
                    NavigationLink {
                        InspectionsListView()
                    } label: {
                        Text("See All")
                            .font(.subheadline)
                            .foregroundColor(.brandPrimary)
                    }
                }
            }
            .padding(.horizontal)

            if recentInspections.isEmpty {
                EmptyStateCard(
                    icon: "clipboard",
                    title: "No inspections yet",
                    subtitle: "Your recent inspections will appear here"
                )
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
                                date: formatDate(inspection.dateOfInspection),
                                syncStatus: inspection.syncStatus
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
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
                            .background(selectedZone.isEmpty ? Color(.systemGray6) : Color.brandPrimary.opacity(0.1))
                            .cornerRadius(10)
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
                            .background(selectedAssetType.isEmpty ? Color(.systemGray6) : Color.brandPrimary.opacity(0.1))
                            .cornerRadius(10)
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
                    .cornerRadius(10)

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
                            AssetPickerRow(asset: asset)
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
                print("Failed to load filter options: \(error)")
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
                print("Failed to load assets: \(error)")
                await MainActor.run {
                    errorMessage = "Failed to load assets: \(error.localizedDescription)"
                    isLoading = false
                }
            }
        }
    }
}

// MARK: - Asset Picker Row

struct AssetPickerRow: View {
    let asset: AssetResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
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
                        HStack(spacing: 4) {
                            Image(systemName: "clock.badge.checkmark")
                            Text("Recent")
                        }
                        .font(.caption)
                        .foregroundColor(.grade3Color)
                    }
                }
            }

            Text(asset.title ?? asset.level3)
                .font(.subheadline)
                .foregroundColor(.secondary)

            HStack(spacing: 12) {
                Label(asset.zone, systemImage: "mappin.circle.fill")
                Label(asset.level2, systemImage: "cube.fill")
            }
            .font(.caption)
            .foregroundColor(.secondary)
        }
        .padding(.vertical, 8)
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

    // Photos
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var capturedImages: [CapturedImage] = []
    @State private var showCamera = false
    @State private var showCameraUnavailableAlert = false

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
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(asset.assetId)
                            .font(.headline)
                            .fontDesign(.monospaced)
                        Text(asset.level3)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Text(asset.zone)
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.brandPrimary.opacity(0.1))
                        .foregroundColor(.brandPrimary)
                        .cornerRadius(8)
                }
            }

            Section {
                VStack(alignment: .leading, spacing: 16) {
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
                                VStack(spacing: 6) {
                                    ZStack {
                                        Circle()
                                            .fill(Color(hex: grade.color))
                                            .frame(width: 48, height: 48)

                                        Text("\(grade.value)")
                                            .font(.title3)
                                            .fontWeight(.bold)
                                            .foregroundColor(.white)
                                    }
                                    .overlay(
                                        Circle()
                                            .stroke(selectedGrade == grade ? Color.primary : Color.clear, lineWidth: 3)
                                    )
                                    .shadow(color: selectedGrade == grade ? Color(hex: grade.color).opacity(0.4) : .clear, radius: 6, y: 3)

                                    Text(grade.shortLabel)
                                        .font(.caption2)
                                        .foregroundColor(selectedGrade == grade ? .primary : .secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if let grade = selectedGrade {
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(Color(hex: grade.color))
                                .frame(width: 4)

                            Text(grade.description)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(12)
                        .background(Color(hex: grade.color).opacity(0.1))
                        .cornerRadius(8)
                    }
                }
                .padding(.vertical, 8)
            }

            if hasDefect {
                Section("Defect Assessment") {
                    VStack(alignment: .leading, spacing: 12) {
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
                                        .frame(width: 40, height: 40)
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
                                        .shadow(color: defectSeverity == level ? severityColor(level).opacity(0.4) : .clear, radius: 4, y: 2)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if let score = riskScore {
                        HStack {
                            Text("Risk Score")
                                .fontWeight(.medium)
                            Spacer()
                            Text("\(score)")
                                .font(.title)
                                .fontWeight(.bold)
                                .foregroundColor(riskScoreColor(score))
                        }
                        .padding()
                        .background(riskScoreColor(score).opacity(0.1))
                        .cornerRadius(12)
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

            // Photos section
            Section("Photos") {
                if !capturedImages.isEmpty {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 80))], spacing: 8) {
                        ForEach(capturedImages.indices, id: \.self) { index in
                            ZStack(alignment: .topTrailing) {
                                Image(uiImage: capturedImages[index].image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 80, height: 80)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))

                                Button {
                                    capturedImages.remove(at: index)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(.red)
                                        .background(Circle().fill(.white))
                                }
                                .offset(x: 4, y: -4)
                            }
                        }
                    }
                }

                HStack {
                    Button {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            showCamera = true
                        } else {
                            showCameraUnavailableAlert = true
                        }
                    } label: {
                        Label("Take Photo", systemImage: "camera")
                    }

                    Spacer()

                    PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 10, matching: .images) {
                        Label("Library", systemImage: "photo.on.rectangle")
                    }
                }
                .onChange(of: selectedPhotos) { _, newItems in
                    Task {
                        for item in newItems {
                            if let data = try? await item.loadTransferable(type: Data.self),
                               let image = UIImage(data: data) {
                                capturedImages.append(CapturedImage(image: image))
                            }
                        }
                        selectedPhotos = []
                    }
                }
            }
        }
        .navigationTitle("New Inspection")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    saveInspection()
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Save")
                            .fontWeight(.semibold)
                    }
                }
                .disabled(!canSave || isSaving)
            }
        }
        .sheet(isPresented: $showCamera) {
            CameraView { image in
                if let image = image {
                    capturedImages.append(CapturedImage(image: image))
                }
            }
        }
        .alert("Camera Unavailable", isPresented: $showCameraUnavailableAlert) {
            Button("OK") { }
        } message: {
            Text("Camera is not available on this device. Please use the photo library instead.")
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
        }
    }

    private func severityColor(_ level: Int) -> Color {
        switch level {
        case 1: return .grade1Color
        case 2: return .grade2Color
        case 3: return .grade3Color
        case 4: return .grade4Color
        case 5: return .grade5Color
        default: return .gray
        }
    }

    private func riskScoreColor(_ score: Int) -> Color {
        if score >= 15 { return .grade5Color }
        if score >= 10 { return .grade4Color }
        if score >= 5 { return .grade3Color }
        return .grade1Color
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
                // Save photos locally
                var photoCaptures: [PhotoCapture] = []
                for captured in capturedImages {
                    if let data = captured.image.jpegData(compressionQuality: 0.8) {
                        let filename = "photo_\(UUID().uuidString).jpg"
                        let localPath = savePhotoLocally(data: data, filename: filename)
                        photoCaptures.append(PhotoCapture(
                            filename: filename,
                            data: data,
                            localPath: localPath,
                            capturedAt: Date()
                        ))
                    }
                }

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
                    photos: photoCaptures
                )

                onComplete()

            } catch {
                errorMessage = "Failed to save: \(error.localizedDescription)"
                showError = true
                isSaving = false
            }
        }
    }

    private func savePhotoLocally(data: Data, filename: String) -> String {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let photosPath = documentsPath.appendingPathComponent("Photos", isDirectory: true)

        try? FileManager.default.createDirectory(at: photosPath, withIntermediateDirectories: true)

        let filePath = photosPath.appendingPathComponent(filename)
        try? data.write(to: filePath)

        return filePath.path
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
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(inspection.asset?.assetId ?? inspection.assetId)
                            .font(.headline)
                            .fontDesign(.monospaced)
                        if let title = inspection.asset?.title {
                            Text(title)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    Spacer()
                    Text(inspection.asset?.zone ?? "-")
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.brandPrimary.opacity(0.1))
                        .foregroundColor(.brandPrimary)
                        .cornerRadius(8)
                }
            }

            Section("Inspection") {
                HStack {
                    Text("Condition Grade")
                    Spacer()
                    ConditionGradeBadge(grade: inspection.conditionGrade, size: .small)
                }

                LabeledContent("Date", value: inspection.dateOfInspection.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Inspector", value: inspection.engineerName ?? "-")

                HStack {
                    Text("Status")
                    Spacer()
                    SyncStatusBadge(status: inspection.syncStatus)
                }
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
                        HStack {
                            Text("Risk Score")
                            Spacer()
                            Text("\(riskScore)")
                                .font(.title3)
                                .fontWeight(.bold)
                                .foregroundColor(riskScoreColor(riskScore))
                        }
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
                            .foregroundColor(.grade3Color)
                    }
                }
            }
        }
        .navigationTitle("Inspection")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func riskScoreColor(_ score: Int) -> Color {
        if score >= 15 { return .grade5Color }
        if score >= 10 { return .grade4Color }
        if score >= 5 { return .grade3Color }
        return .grade1Color
    }
}

// MARK: - Supporting Views

struct StatCard: View {
    let title: String
    let value: String
    let subtitle: String
    var icon: String = "chart.bar.fill"
    var accentColor: Color = .brandPrimary

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.secondary)

                Spacer()

                Image(systemName: icon)
                    .font(.caption)
                    .foregroundColor(accentColor.opacity(0.6))
            }

            Text(value)
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(.primary)

            Text(subtitle)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.06), radius: 12, y: 6)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(accentColor.opacity(0.1), lineWidth: 1)
        )
    }
}

struct QuickActionCard: View {
    let icon: String
    let title: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            QuickActionCardContent(icon: icon, title: title, color: color)
        }
    }
}

struct QuickActionCardContent: View {
    let icon: String
    let title: String
    let color: Color

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 56, height: 56)

                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(color)
            }

            Text(title)
                .font(.caption)
                .fontWeight(.medium)
                .multilineTextAlignment(.center)
                .foregroundColor(.primary)
        }
        .frame(width: 100, height: 120)
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.06), radius: 12, y: 6)
    }
}

struct EmptyStateCard: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 40))
                .foregroundColor(.secondary.opacity(0.5))

            Text(title)
                .font(.headline)
                .foregroundColor(.secondary)

            Text(subtitle)
                .font(.caption)
                .foregroundColor(.secondary.opacity(0.8))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(32)
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.04), radius: 8, y: 4)
    }
}

struct RecentInspectionRow: View {
    let assetId: String
    let grade: ConditionGrade
    let date: String
    var syncStatus: SyncStatus = .synced

    var body: some View {
        HStack(spacing: 12) {
            ConditionGradeBadge(grade: grade, size: .small)

            VStack(alignment: .leading, spacing: 4) {
                Text(assetId)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .fontDesign(.monospaced)
                Text(date)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            SyncStatusBadge(status: syncStatus)

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(14)
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.04), radius: 6, y: 3)
    }
}

struct SyncStatusBadge: View {
    let status: SyncStatus

    var body: some View {
        Group {
            switch status {
            case .pending:
                Image(systemName: "clock")
                    .foregroundColor(.grade3Color)
            case .syncing:
                ProgressView()
                    .scaleEffect(0.7)
            case .synced:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.grade1Color)
            case .failed:
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundColor(.grade5Color)
            case .conflict:
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.grade3Color)
            }
        }
        .font(.subheadline)
    }
}

// MARK: - Inspections List View

struct InspectionsListView: View {
    @Query(sort: \Inspection.dateOfInspection, order: .reverse)
    private var inspections: [Inspection]
    @State private var filterStatus: SyncStatus?
    @State private var filterZone: String?
    @State private var filterType: String?
    @State private var syncManager = SyncManager.shared

    // Get unique zones from inspections
    private var zones: [String] {
        Array(Set(inspections.compactMap { $0.asset?.zone })).sorted()
    }

    // Get unique types (level3) from inspections
    private var assetTypes: [String] {
        Array(Set(inspections.compactMap { $0.asset?.level3 })).sorted()
    }

    var filteredInspections: [Inspection] {
        inspections.filter { inspection in
            // Status filter
            if let status = filterStatus, inspection.syncStatus != status {
                return false
            }
            // Zone filter
            if let zone = filterZone, inspection.asset?.zone != zone {
                return false
            }
            // Type filter
            if let type = filterType, inspection.asset?.level3 != type {
                return false
            }
            return true
        }
    }

    private var hasActiveFilters: Bool {
        filterStatus != nil || filterZone != nil || filterType != nil
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter bar
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        // Zone filter
                        Menu {
                            Button("All Zones") { filterZone = nil }
                            Divider()
                            ForEach(zones, id: \.self) { zone in
                                Button(zone) { filterZone = zone }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "mappin.circle.fill")
                                Text(filterZone ?? "Zone")
                                    .lineLimit(1)
                            }
                            .font(.subheadline)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(filterZone != nil ? Color.brandPrimary.opacity(0.1) : Color(.systemGray6))
                            .foregroundColor(filterZone != nil ? .brandPrimary : .secondary)
                            .cornerRadius(8)
                        }

                        // Type filter
                        Menu {
                            Button("All Types") { filterType = nil }
                            Divider()
                            ForEach(assetTypes, id: \.self) { type in
                                Button(type) { filterType = type }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "cube.fill")
                                Text(filterType ?? "Type")
                                    .lineLimit(1)
                            }
                            .font(.subheadline)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(filterType != nil ? Color.brandPrimary.opacity(0.1) : Color(.systemGray6))
                            .foregroundColor(filterType != nil ? .brandPrimary : .secondary)
                            .cornerRadius(8)
                        }

                        // Clear filters button
                        if hasActiveFilters {
                            Button {
                                filterStatus = nil
                                filterZone = nil
                                filterType = nil
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "xmark.circle.fill")
                                    Text("Clear")
                                }
                                .font(.subheadline)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Color.red.opacity(0.1))
                                .foregroundColor(.red)
                                .cornerRadius(8)
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .background(Color(.systemBackground))

                List {
                    if inspections.isEmpty {
                        ContentUnavailableView(
                            "No Inspections",
                            systemImage: "clipboard",
                            description: Text("Inspections you create will appear here")
                        )
                    } else if filteredInspections.isEmpty {
                        ContentUnavailableView(
                            "No Matching Inspections",
                            systemImage: "line.3.horizontal.decrease.circle",
                            description: Text("Try adjusting your filters")
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
                                .foregroundColor(.grade3Color)
                                .font(.caption)
                        } else if syncManager.pendingInspections > 0 {
                            Image(systemName: "clock")
                                .foregroundColor(.grade3Color)
                                .font(.caption)
                            Text("\(syncManager.pendingInspections)")
                                .font(.caption)
                                .foregroundColor(.grade3Color)
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("All Status") { filterStatus = nil }
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
                            .foregroundColor(.brandPrimary)
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
                    .fontDesign(.monospaced)
                Text(inspection.dateOfInspection.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            SyncStatusBadge(status: inspection.syncStatus)
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
                    HStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [.brandPrimary, .brandPrimaryDark],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 70, height: 70)

                            Text(String(authManager.currentUser?.displayName.prefix(1) ?? "?"))
                                .font(.title)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                        }
                        .shadow(color: .brandPrimary.opacity(0.3), radius: 8, y: 4)

                        VStack(alignment: .leading, spacing: 4) {
                            Text(authManager.currentUser?.displayName ?? "")
                                .font(.headline)
                            Text(authManager.currentUser?.email ?? "")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            Text(authManager.currentUser?.role.rawValue ?? "")
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.brandPrimary.opacity(0.1))
                                .foregroundColor(.brandPrimary)
                                .cornerRadius(6)
                        }
                    }
                    .padding(.vertical, 8)
                }

                Section("App") {
                    NavigationLink(destination: Text("Statistics")) {
                        Label("My Statistics", systemImage: "chart.bar.fill")
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
                        HStack {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                            Text("Sign Out")
                        }
                        .foregroundColor(.grade5Color)
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
