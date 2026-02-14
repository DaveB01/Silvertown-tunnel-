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

    // Get unique level2 types from assets
    private var assetTypes: [String] {
        Array(Set(assets.map { $0.level2 })).sorted()
    }

    // Filtered assets
    private var filteredAssets: [Asset] {
        assets.filter { asset in
            // Zone filter
            if let zone = selectedZone, asset.zone != zone {
                return false
            }

            // Type filter
            if let type = selectedType, asset.level2 != type {
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
                        Text(selectedZone ?? "All Zones")
                            .font(.subheadline)
                        Image(systemName: "chevron.down")
                            .font(.caption)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(selectedZone != nil ? Color.brandPrimary.opacity(0.1) : Color(.systemGray6))
                    .foregroundColor(selectedZone != nil ? .brandPrimary : .primary)
                    .cornerRadius(8)
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
                        Text(selectedType ?? "All Types")
                            .font(.subheadline)
                        Image(systemName: "chevron.down")
                            .font(.caption)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(selectedType != nil ? Color.brandPrimary.opacity(0.1) : Color(.systemGray6))
                    .foregroundColor(selectedType != nil ? .brandPrimary : .primary)
                    .cornerRadius(8)
                }

                Spacer()

                // Clear button
                if selectedZone != nil || selectedType != nil {
                    Button("Clear") {
                        selectedZone = nil
                        selectedType = nil
                    }
                    .font(.subheadline)
                    .foregroundColor(.brandPrimary)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color(.systemBackground))

            // Results count
            HStack {
                Text("\(filteredAssets.count) assets")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
            }
            .padding(.horizontal)
            .padding(.vertical, 4)
            .background(Color(.systemGray6))
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
        VStack(spacing: 16) {
            Image(systemName: "cube")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("No Assets Found")
                .font(.headline)

            if selectedZone != nil || selectedType != nil || !searchText.isEmpty {
                Text("Try adjusting your filters")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Button("Clear Filters") {
                    selectedZone = nil
                    selectedType = nil
                    searchText = ""
                }
                .buttonStyle(.borderedProminent)
            } else {
                Text("Pull down to sync assets from server")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Asset Row

struct AssetRow: View {
    let asset: Asset

    var body: some View {
        HStack(spacing: 12) {
            // Condition indicator
            if let grade = asset.lastConditionGrade {
                ConditionGradeBadge(grade: grade, size: .small)
            } else {
                Circle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 32, height: 32)
                    .overlay(
                        Text("?")
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundColor(.gray)
                    )
            }

            // Info
            VStack(alignment: .leading, spacing: 2) {
                Text(asset.assetId)
                    .font(.subheadline)
                    .fontWeight(.medium)
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
                    }
                    .foregroundColor(.red)
                } else if asset.isDueSoon {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.caption2)
                        Text("Due soon")
                            .font(.caption2)
                    }
                    .foregroundColor(.orange)
                }
            }

            Spacer()

            // Zone
            Text(asset.zone)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Asset Detail View (Placeholder)

struct AssetDetailView: View {
    @Environment(\.modelContext) private var modelContext
    let asset: Asset
    @State private var showNewInspection = false

    var body: some View {
        List {
            // Asset info section
            Section("Asset Information") {
                LabeledContent("Asset ID", value: asset.assetId)
                LabeledContent("Type", value: asset.level3)
                LabeledContent("Category", value: asset.level2)
                LabeledContent("Zone", value: asset.zone)
                if let region = asset.region {
                    LabeledContent("Region", value: region)
                }
                if let space = asset.space {
                    LabeledContent("Space", value: space)
                }
            }

            // Inspection status section
            Section("Inspection Status") {
                if let date = asset.lastInspectionDate {
                    LabeledContent("Last Inspected", value: date.formatted(date: .abbreviated, time: .omitted))
                } else {
                    LabeledContent("Last Inspected", value: "Never")
                }

                if let grade = asset.lastConditionGrade {
                    HStack {
                        Text("Last Grade")
                        Spacer()
                        ConditionGradeBadge(grade: grade, size: .small)
                    }
                }

                if let due = asset.nextInspectionDue {
                    HStack {
                        Text("Next Due")
                        Spacer()
                        Text(due.formatted(date: .abbreviated, time: .omitted))
                            .foregroundColor(asset.isOverdue ? .red : (asset.isDueSoon ? .orange : .secondary))
                    }
                }

                LabeledContent("Total Inspections", value: "\(asset.inspectionCount)")
            }

            // Action section
            Section {
                Button {
                    showNewInspection = true
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("New Inspection")
                    }
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

// MARK: - Preview

#Preview {
    AssetListView()
        .modelContainer(for: [Asset.self, Inspection.self, MediaItem.self])
}
