import SwiftUI

struct ConditionGradeBadge: View {
    let grade: ConditionGrade
    var size: Size = .medium
    var showLabel: Bool = false

    enum Size {
        case small, medium, large

        var dimension: CGFloat {
            switch self {
            case .small: return 28
            case .medium: return 36
            case .large: return 48
            }
        }

        var fontSize: Font {
            switch self {
            case .small: return .caption
            case .medium: return .subheadline
            case .large: return .title3
            }
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(Color(hex: grade.color))
                    .frame(width: size.dimension, height: size.dimension)

                Text("\(grade.value)")
                    .font(size.fontSize)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
            }

            if showLabel {
                VStack(alignment: .leading, spacing: 2) {
                    Text(grade.label)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Text(grade.description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

struct ConditionGradeSelector: View {
    @Binding var selectedGrade: ConditionGrade?
    var disabled: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                ForEach(ConditionGrade.allCases, id: \.self) { grade in
                    Button(action: {
                        if !disabled {
                            selectedGrade = grade
                        }
                    }) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(selectedGrade == grade ? Color(hex: grade.color) : Color(.systemGray5))
                                .frame(width: 52, height: 52)

                            Text("\(grade.value)")
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(selectedGrade == grade ? .white : .primary)
                        }
                    }
                    .disabled(disabled)
                    .opacity(disabled ? 0.5 : 1)
                }
            }

            if let grade = selectedGrade {
                HStack {
                    Rectangle()
                        .fill(Color(hex: grade.color))
                        .frame(width: 4)
                        .cornerRadius(2)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(grade.label)
                            .font(.subheadline)
                            .fontWeight(.medium)
                        Text(grade.description)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(12)
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }

    static let brandPrimary = Color(hex: "#003366")
    static let brandSecondary = Color(hex: "#FF6600")
}

#Preview {
    VStack(spacing: 32) {
        HStack(spacing: 16) {
            ConditionGradeBadge(grade: .grade1, size: .small)
            ConditionGradeBadge(grade: .grade2, size: .medium)
            ConditionGradeBadge(grade: .grade3, size: .large)
        }

        ConditionGradeBadge(grade: .grade4, showLabel: true)

        ConditionGradeSelector(selectedGrade: .constant(.grade2))
    }
    .padding()
}
