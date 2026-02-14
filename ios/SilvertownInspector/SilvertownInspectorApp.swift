import SwiftUI
import SwiftData

@main
struct SilvertownInspectorApp: App {
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            Asset.self,
            Inspection.self,
            MediaItem.self,
            SyncQueueItem.self,
        ])
        let modelConfiguration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true
        )

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(sharedModelContainer)
    }
}
