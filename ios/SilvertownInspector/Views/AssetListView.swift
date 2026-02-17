import SwiftUI
import SwiftData

struct AssetListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var assets: [Asset]

    @State private var searchText = ""
    @State private var selectedZone: String?
    @State private var selectedType: String?

    // Get unique zones from assets
    private var zones: [String] {
        Array(Set(assets.map { $0.zone })).sorted()
    }

    // Get unique level3 types from assets (e.g., CCTV Cameras, Cables)
    private var assetTypes: [String] {
        Array(Set(assets.map { $0.level3 })).sorted()
    }

    // Filtered assets
    private var filteredAssets: [Asset] {
        assets.filter { asset in
            // Zone filter
            if let zone = selectedZone, asset.zone != zone {
                return false
            }

            // Type filter (level3)
            if let type = selectedType, asset.level3 != type {
                return false
            }

            // Search filter
            if !searchText.isEmpty {
                let search = searchText.lowercased()
                return asset.assetId.lowercased().contains(search) ||
                       asset.level3.lowercased().contains(search) ||
                       (asset.title?.lowercased().contains(search) ?? false)
            }

            return true
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter bar
                filterBar

                // Asset list
                if filteredAssets.isEmpty {
                    emptyState
                } else {
                    assetList
                }
            }
            .background(Color(.systemGray6))
            .navigationTitle("Assets")
            .searchable(text: $searchText, prompt: "Search by ID or type")
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        VStack(spacing: 8) {
            // Filter controls - always visible
            HStack(spacing: 12) {
                // Zone picker
                Menu {
                    Button("All Zones") { selectedZone = nil }
                    Divider()
                    ForEach(zones, id: \.self) { zone in
                        Button(zone) { selectedZone = zone }
                    }
                } label: {
                    HStack {
                        Image(systemName: "mappin.circle.fill")
                            .foregroundColor(selectedZone != nil ? .brandPrimary : .secondary)
                        Text(selectedZone ?? "All Zones")
                            .font(.subheadline)
                        Image(systemName: "chevron.down")
                            .font(.caption)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(selectedZone != nil ? Color.brandPrimary.opacity(0.1) : Color(.systemGray6))
                    .foregroundColor(selectedZone != nil ? .brandPrimary : .primary)
                    .cornerRadius(10)
                }

                // Type picker
                Menu {
                    Button("All Types") { selectedType = nil }
                    Divider()
                    ForEach(assetTypes, id: \.self) { type in
                        Button(type) { selectedType = type }
                    }
                } label: {
                    HStack {
                        Image(systemName: "cube.fill")
                            .foregroundColor(selectedType != nil ? .brandPrimary : .secondary)
                        Text(selectedType ?? "All Types")
                            .font(.subheadline)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.caption)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(selectedType != nil ? Color.brandPrimary.opacity(0.1) : Color(.systemGray6))
                    .foregroundColor(selectedType != nil ? .brandPrimary : .primary)
                    .cornerRadius(10)
                }

                Spacer()

                // Clear button
                if selectedZone != nil || selectedType != nil {
                    Button {
                        withAnimation {
                            selectedZone = nil
                            selectedType = nil
                        }
                    } label: {
                        Text("Clear")
                            .font(.subheadline)
                            .foregroundColor(.brandPrimary)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color(.systemBackground))

            // Results count
            HStack {
                Text("\(filteredAssets.count) assets")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.secondary)
                Spacer()
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
            .background(Color(.systemGray6).opacity(0.5))
        }
    }

    // MARK: - Asset List

    private var assetList: some View {
        List(filteredAssets) { asset in
            NavigationLink(destination: AssetDetailView(asset: asset)) {
                AssetRow(asset: asset)
            }
        }
        .listStyle(.plain)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Color.brandPrimary.opacity(0.1))
                    .frame(width: 100, height: 100)

                Image(systemName: "cube")
                    .font(.system(size: 40))
                    .foregroundColor(.brandPrimary.opacity(0.6))
            }

            VStack(spacing: 8) {
                Text("No Assets Found")
                    .font(.headline)
                    .fontWeight(.semibold)

                if selectedZone != nil || selectedType != nil || !searchText.isEmpty {
                    Text("Try adjusting your filters or search term")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)

                    Button {
                        withAnimation {
                            selectedZone = nil
                            selectedType = nil
                            searchText = ""
                        }
                    } label: {
                        Text("Clear Filters")
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 12)
                            .background(Color.brandPrimary)
                            .cornerRadius(12)
                    }
                    .padding(.top, 8)
                } else {
                    Text("Pull down to sync assets from server")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Asset Row

struct AssetRow: View {
    let asset: Asset

    var body: some View {
        HStack(spacing: 14) {
            // Condition indicator
            if let grade = asset.lastConditionGrade {
                ConditionGradeBadge(grade: grade, size: .small)
            } else {
                ZStack {
                    Circle()
                        .fill(Color.gray.opacity(0.15))
                        .frame(width: 32, height: 32)

                    Text("?")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.gray)
                }
            }

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(asset.assetId)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .fontDesign(.monospaced)

                Text(asset.level3)
                    .font(.caption)
                    .foregroundColor(.secondary)

                if asset.isOverdue {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption2)
                        Text("Overdue")
                            .font(.caption2)
                            .fontWeight(.medium)
                    }
                    .foregroundColor(.grade5Color)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.grade5Color.opacity(0.1))
                    .cornerRadius(4)
                } else if asset.isDueSoon {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.caption2)
                        Text("Due soon")
                            .font(.caption2)
                            .fontWeight(.medium)
                    }
                    .foregroundColor(.grade3Color)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.grade3Color.opacity(0.1))
                    .cornerRadius(4)
                }
            }

            Spacer()

            // Zone badge
            Text(asset.zone)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(.brandPrimary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.brandPrimary.opacity(0.1))
                .cornerRadius(6)
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Asset Detail View

struct AssetDetailView: View {
    @Environment(\.modelContext) private var modelContext
    let asset: Asset
    @State private var showNewInspection = false

    var body: some View {
        List {
            // Asset info section
            Section {
                VStack(alignment: .leading, spacing: 16) {
                    // Header with asset ID
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Asset ID")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(asset.assetId)
                                .font(.title2)
                                .fontWeight(.bold)
                                .fontDesign(.monospaced)
                        }

                        Spacer()

                        // Zone badge
                        Text(asset.zone)
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.brandPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.brandPrimary.opacity(0.1))
                            .cornerRadius(8)
                    }

                    Divider()

                    // Asset details
                    VStack(spacing: 12) {
                        DetailRow(label: "Type", value: asset.level3, icon: "cube.fill")
                        DetailRow(label: "Category", value: asset.level2, icon: "folder.fill")
                        if let region = asset.region {
                            DetailRow(label: "Region", value: region, icon: "map.fill")
                        }
                        if let space = asset.space {
                            DetailRow(label: "Space", value: space, icon: "building.2.fill")
                        }
                    }
                }
                .padding(.vertical, 8)
            } header: {
                Text("Asset Information")
            }

            // Inspection status section
            Section {
                VStack(spacing: 16) {
                    // Last grade with visual indicator
                    if let grade = asset.lastConditionGrade {
                        HStack(spacing: 16) {
                            ConditionGradeBadge(grade: grade, size: .medium)

                            VStack(alignment: .leading, spacing: 4) {
                                Text("Current Condition")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                Text(grade.label)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                            }

                            Spacer()
                        }
                        .padding()
                        .background(Color(hex: grade.color).opacity(0.1))
                        .cornerRadius(12)
                    }

                    // Stats grid
                    HStack(spacing: 12) {
                        InspectionStatBox(
                            title: "Last Inspected",
                            value: asset.lastInspectionDate?.formatted(date: .abbreviated, time: .omitted) ?? "Never",
                            icon: "calendar"
                        )

                        InspectionStatBox(
                            title: "Total",
                            value: "\(asset.inspectionCount)",
                            icon: "clipboard"
                        )
                    }

                    // Next due warning
                    if let due = asset.nextInspectionDue {
                        HStack(spacing: 12) {
                            Image(systemName: asset.isOverdue ? "exclamationmark.triangle.fill" : "clock")
                                .foregroundColor(asset.isOverdue ? .grade5Color : (asset.isDueSoon ? .grade3Color : .secondary))

                            VStack(alignment: .leading, spacing: 2) {
                                Text("Next Inspection Due")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                Text(due.formatted(date: .abbreviated, time: .omitted))
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .foregroundColor(asset.isOverdue ? .grade5Color : (asset.isDueSoon ? .grade3Color : .primary))
                            }

                            Spacer()

                            if asset.isOverdue {
                                Text("OVERDUE")
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color.grade5Color)
                                    .cornerRadius(4)
                            }
                        }
                        .padding()
                        .background((asset.isOverdue ? Color.grade5Color : (asset.isDueSoon ? Color.grade3Color : Color.gray)).opacity(0.1))
                        .cornerRadius(12)
                    }
                }
                .padding(.vertical, 8)
            } header: {
                Text("Inspection Status")
            }

            // Action section
            Section {
                Button {
                    showNewInspection = true
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                        Text("New Inspection")
                            .fontWeight(.semibold)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .foregroundColor(.brandPrimary)
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle(asset.level3)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showNewInspection) {
            NavigationStack {
                NewInspectionFormView(asset: asset)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showNewInspection = false }
                        }
                    }
            }
            .environment(\.modelContext, modelContext)
        }
    }
}

// MARK: - Detail Row

struct DetailRow: View {
    let label: String
    let value: String
    var icon: String = "info.circle.fill"

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(.brandPrimary.opacity(0.6))
                .frame(width: 20)

            Text(label)
                .font(.subheadline)
                .foregroundColor(.secondary)

            Spacer()

            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
        }
    }
}

// MARK: - Inspection Stat Box

struct InspectionStatBox: View {
    let title: String
    let value: String
    var icon: String = "chart.bar.fill"

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(.brandPrimary.opacity(0.6))

            Text(value)
                .font(.headline)
                .fontWeight(.bold)

            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemGray6).opacity(0.5))
        .cornerRadius(12)
    }
}

// MARK: - Preview

#Preview {
    AssetListView()
        .modelContainer(for: [Asset.self, Inspection.self, MediaItem.self])
}
