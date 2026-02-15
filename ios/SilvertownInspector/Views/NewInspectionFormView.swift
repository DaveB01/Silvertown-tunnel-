import SwiftUI
import SwiftData
import PhotosUI
import UIKit

struct NewInspectionFormView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    let asset: Asset

    // Form state
    @State private var selectedGrade: ConditionGrade?
    @State private var comments: String = ""

    // Defect assessment (when grade > 1)
    @State private var defectSeverity: Int?
    @State private var defectDescription: String = ""
    @State private var observedIssues: String = ""
    @State private var recommendedAction: String = ""
    @State private var followUpRequired: Bool = false

    // Photos
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var capturedImages: [CapturedImage] = []
    @State private var showCamera = false
    @State private var showCameraUnavailableAlert = false

    // UI state
    @State private var isSaving = false
    @State private var showError = false
    @State private var errorMessage = ""

    @State private var authManager = AuthManager.shared

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
            // Asset info (read-only)
            assetSection

            // Condition grade selection
            conditionGradeSection

            // Defect assessment (when grade > 1)
            if hasDefect {
                defectAssessmentSection
            }

            // Comments
            commentsSection

            // Photos
            photosSection
        }
        .navigationTitle("New Inspection")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { saveInspection() }
                    .disabled(!canSave || isSaving)
            }
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
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
    }

    // MARK: - Sections

    private var assetSection: some View {
        Section("Asset") {
            LabeledContent("Asset ID", value: asset.assetId)
            LabeledContent("Type", value: asset.level3)
            LabeledContent("Zone", value: asset.zone)
        }
    }

    private var conditionGradeSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                Text("Condition Grade")
                    .font(.headline)

                HStack(spacing: 8) {
                    ForEach(ConditionGrade.allCases, id: \.self) { grade in
                        GradeButton(
                            grade: grade,
                            isSelected: selectedGrade == grade
                        ) {
                            withAnimation {
                                selectedGrade = grade
                                // Reset defect fields when switching to Grade 1
                                if grade == .grade1 {
                                    defectSeverity = nil
                                    defectDescription = ""
                                    observedIssues = ""
                                    recommendedAction = ""
                                    followUpRequired = false
                                }
                            }
                        }
                    }
                }

                if let grade = selectedGrade {
                    Text(grade.description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.top, 4)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private var defectAssessmentSection: some View {
        Section("Defect Assessment") {
            // Severity
            VStack(alignment: .leading, spacing: 8) {
                Text("Defect Severity")
                    .font(.subheadline)
                    .fontWeight(.medium)

                HStack(spacing: 8) {
                    ForEach(1...5, id: \.self) { level in
                        SeverityButton(
                            level: level,
                            isSelected: defectSeverity == level
                        ) {
                            defectSeverity = level
                        }
                    }
                }
            }

            // Risk score display
            if let score = riskScore {
                HStack {
                    Text("Risk Score")
                    Spacer()
                    Text("\(score)")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(riskScoreColor(score))
                }
                .padding(.vertical, 4)
            }

            // Description
            VStack(alignment: .leading, spacing: 4) {
                Text("Defect Description")
                    .font(.subheadline)
                    .fontWeight(.medium)
                TextField("Describe the defect...", text: $defectDescription, axis: .vertical)
                    .lineLimit(3...6)
            }

            // Observed issues
            VStack(alignment: .leading, spacing: 4) {
                Text("Observed Issues")
                    .font(.subheadline)
                    .fontWeight(.medium)
                TextField("List observed issues...", text: $observedIssues, axis: .vertical)
                    .lineLimit(3...6)
            }

            // Recommended action
            VStack(alignment: .leading, spacing: 4) {
                Text("Recommended Action")
                    .font(.subheadline)
                    .fontWeight(.medium)
                TextField("Recommended remediation...", text: $recommendedAction, axis: .vertical)
                    .lineLimit(3...6)
            }

            // Follow-up required
            Toggle("Follow-up Required", isOn: $followUpRequired)
        }
    }

    private var commentsSection: some View {
        Section("Additional Comments") {
            TextField("Any additional observations...", text: $comments, axis: .vertical)
                .lineLimit(3...6)
        }
    }

    private var photosSection: some View {
        Section("Photos") {
            // Photo grid
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

            // Add photo buttons
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

    // MARK: - Actions

    private func saveInspection() {
        guard let grade = selectedGrade,
              let user = authManager.currentUser else {
            errorMessage = "Missing required data"
            showError = true
            return
        }

        isSaving = true

        Task {
            do {
                // Save photos locally
                var photoCaptures: [PhotoCapture] = []
                for (index, captured) in capturedImages.enumerated() {
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

                // Create inspection
                let inspection = Inspection(
                    assetId: asset.id,
                    engineerId: user.id,
                    engineerName: user.displayName,
                    dateOfInspection: Date(),
                    conditionGrade: grade,
                    comments: comments.isEmpty ? nil : comments,
                    defectSeverity: hasDefect ? defectSeverity : nil,
                    defectDescription: hasDefect && !defectDescription.isEmpty ? defectDescription : nil,
                    observedIssues: hasDefect && !observedIssues.isEmpty ? observedIssues : nil,
                    recommendedAction: hasDefect && !recommendedAction.isEmpty ? recommendedAction : nil,
                    followUpRequired: hasDefect ? followUpRequired : false
                )
                inspection.asset = asset

                modelContext.insert(inspection)

                // Add photos
                for photo in photoCaptures {
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
                    modelContext.insert(mediaItem)
                }

                try modelContext.save()

                // Trigger sync if online
                SyncManager.shared.triggerSync()

                await MainActor.run {
                    dismiss()
                }

            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    showError = true
                    isSaving = false
                }
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

    private func riskScoreColor(_ score: Int) -> Color {
        if score >= 15 { return .red }
        if score >= 10 { return .orange }
        if score >= 5 { return .yellow }
        return .green
    }
}

// MARK: - Supporting Views

struct GradeButton: View {
    let grade: ConditionGrade
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
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
                            .stroke(isSelected ? Color.primary : Color.clear, lineWidth: 3)
                    )

                Text(grade.label.components(separatedBy: " ").first ?? "")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }
}

struct SeverityButton: View {
    let level: Int
    let isSelected: Bool
    let action: () -> Void

    private var color: Color {
        switch level {
        case 1: return .green
        case 2: return Color(red: 0.52, green: 0.8, blue: 0.09)
        case 3: return .orange
        case 4: return Color(red: 0.98, green: 0.45, blue: 0.09)
        case 5: return .red
        default: return .gray
        }
    }

    var body: some View {
        Button(action: action) {
            Circle()
                .fill(color)
                .frame(width: 36, height: 36)
                .overlay(
                    Text("\(level)")
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                )
                .overlay(
                    Circle()
                        .stroke(isSelected ? Color.primary : Color.clear, lineWidth: 2)
                )
        }
        .buttonStyle(.plain)
    }
}

struct CapturedImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

// MARK: - Camera View

struct CameraView: UIViewControllerRepresentable {
    let onCapture: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        // Check if camera is available, otherwise fall back to photo library
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            picker.sourceType = .camera
        } else {
            picker.sourceType = .photoLibrary
        }
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture)
    }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (UIImage?) -> Void

        init(onCapture: @escaping (UIImage?) -> Void) {
            self.onCapture = onCapture
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            let image = info[.originalImage] as? UIImage
            onCapture(image)
            picker.dismiss(animated: true)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCapture(nil)
            picker.dismiss(animated: true)
        }
    }
}

#Preview {
    NavigationStack {
        NewInspectionFormView(asset: Asset(
            id: "test",
            level2: "Power",
            level3: "Distribution Board",
            assetId: "DB-NB-001",
            zone: "Northbound"
        ))
    }
    .modelContainer(for: [Asset.self, Inspection.self, MediaItem.self])
}
