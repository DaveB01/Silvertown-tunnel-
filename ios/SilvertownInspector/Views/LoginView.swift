import SwiftUI

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Logo
            VStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.brandPrimary)
                    .frame(width: 80, height: 80)
                    .overlay(
                        Text("I")
                            .font(.system(size: 40, weight: .bold))
                            .foregroundColor(.white)
                    )

                Text("INFRATEC")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(.brandPrimary)

                Text("Silvertown Tunnel\nInspection System")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.bottom, 32)

            // Form
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Email")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.secondary)

                    TextField("you@infratec.co.uk", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .autocorrectionDisabled()
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Password")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.secondary)

                    SecureField("••••••••", text: $password)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.password)
                }

                if let error = errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal)

            // Login Button
            Button(action: login) {
                HStack {
                    if isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Sign In")
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.brandPrimary)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(isLoading || email.isEmpty || password.isEmpty)
            .padding(.horizontal)

            Spacer()

            // Footer
            Text("© \(Calendar.current.component(.year, from: Date())) INFRATEC")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
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
