import SwiftUI

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Premium gradient background
                LinearGradient(
                    colors: [
                        Color.brandPrimary,
                        Color.brandPrimaryDark
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                // Decorative circles
                Circle()
                    .fill(Color.white.opacity(0.05))
                    .frame(width: 300, height: 300)
                    .offset(x: -150, y: -200)

                Circle()
                    .fill(Color.white.opacity(0.03))
                    .frame(width: 400, height: 400)
                    .offset(x: 200, y: 300)

                ScrollView {
                    VStack(spacing: 0) {
                        Spacer()
                            .frame(height: geometry.size.height * 0.1)

                        // Logo Section
                        VStack(spacing: 12) {
                            // Logo icon with glow effect
                            ZStack {
                                Circle()
                                    .fill(Color.white.opacity(0.1))
                                    .frame(width: 100, height: 100)
                                    .blur(radius: 20)

                                RoundedRectangle(cornerRadius: 20)
                                    .fill(Color.white)
                                    .frame(width: 80, height: 80)
                                    .shadow(color: .black.opacity(0.2), radius: 20, y: 10)
                                    .overlay(
                                        Text("I")
                                            .font(.system(size: 44, weight: .bold))
                                            .foregroundColor(.brandPrimary)
                                    )
                            }

                            Text("INFRATEC")
                                .font(.system(size: 32, weight: .bold))
                                .foregroundColor(.white)
                                .tracking(2)

                            Text("Silvertown Tunnel\nInspection System")
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.8))
                                .multilineTextAlignment(.center)
                        }
                        .padding(.bottom, 48)

                        // Login Card
                        VStack(spacing: 24) {
                            // Form Fields
                            VStack(spacing: 20) {
                                // Email Field
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Email")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.secondary)

                                    HStack(spacing: 12) {
                                        Image(systemName: "envelope.fill")
                                            .foregroundColor(.brandPrimary.opacity(0.6))
                                            .frame(width: 20)

                                        TextField("you@infratec.co.uk", text: $email)
                                            .textContentType(.emailAddress)
                                            .keyboardType(.emailAddress)
                                            .autocapitalization(.none)
                                            .autocorrectionDisabled()
                                    }
                                    .padding()
                                    .background(Color(.systemGray6))
                                    .cornerRadius(12)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.brandPrimary.opacity(0.1), lineWidth: 1)
                                    )
                                }

                                // Password Field
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Password")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.secondary)

                                    HStack(spacing: 12) {
                                        Image(systemName: "lock.fill")
                                            .foregroundColor(.brandPrimary.opacity(0.6))
                                            .frame(width: 20)

                                        SecureField("Enter your password", text: $password)
                                            .textContentType(.password)
                                    }
                                    .padding()
                                    .background(Color(.systemGray6))
                                    .cornerRadius(12)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.brandPrimary.opacity(0.1), lineWidth: 1)
                                    )
                                }
                            }

                            // Error Message
                            if let error = errorMessage {
                                HStack(spacing: 8) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .foregroundColor(.red)
                                    Text(error)
                                        .font(.caption)
                                        .foregroundColor(.red)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding()
                                .background(Color.red.opacity(0.1))
                                .cornerRadius(8)
                            }

                            // Sign In Button
                            Button(action: login) {
                                HStack(spacing: 8) {
                                    if isLoading {
                                        ProgressView()
                                            .tint(.white)
                                    } else {
                                        Text("Sign In")
                                            .fontWeight(.semibold)
                                        Image(systemName: "arrow.right")
                                            .font(.subheadline)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(
                                    LinearGradient(
                                        colors: (email.isEmpty || password.isEmpty) ?
                                            [Color.gray.opacity(0.3), Color.gray.opacity(0.3)] :
                                            [Color.brandPrimary, Color.brandPrimaryDark],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .foregroundColor(.white)
                                .cornerRadius(12)
                                .shadow(color: (email.isEmpty || password.isEmpty) ? .clear : Color.brandPrimary.opacity(0.3), radius: 8, y: 4)
                            }
                            .disabled(isLoading || email.isEmpty || password.isEmpty)
                        }
                        .padding(28)
                        .background(Color(.systemBackground))
                        .cornerRadius(24)
                        .shadow(color: .black.opacity(0.15), radius: 30, y: 15)
                        .padding(.horizontal, 24)

                        Spacer()
                            .frame(height: 40)

                        // Footer
                        VStack(spacing: 8) {
                            Text("Powered by INFRATEC")
                                .font(.caption)
                                .foregroundColor(.white.opacity(0.6))
                            Text("\(Calendar.current.component(.year, from: Date()))")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.4))
                        }
                        .padding(.bottom, 24)
                    }
                }
            }
        }
    }

    private func login() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                try await AuthManager.shared.login(email: email, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

#Preview {
    LoginView()
}
