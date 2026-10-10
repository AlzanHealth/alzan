import Foundation

@main
struct AlzanAppleHealthSleepSessionGrouperSpec {
  static func main() {
    let records: [[String: Any]] = [
      [
        "source_package": "com.vendor.watch",
        "device": ["localIdentifier": "watch-1"],
        "startDate": "2026-10-09T22:00:00.000Z",
        "endDate": "2026-10-10T00:00:00.000Z",
      ],
      [
        "source_package": "com.vendor.sleep",
        "device": ["localIdentifier": "phone-1"],
        "startDate": "2026-10-09T22:10:00.000Z",
        "endDate": "2026-10-09T23:50:00.000Z",
      ],
      [
        "source_package": "com.vendor.watch",
        "device": ["localIdentifier": "watch-1"],
        "startDate": "2026-10-10T00:00:00.000Z",
        "endDate": "2026-10-10T02:00:00.000Z",
      ],
    ]

    let sessions = AppleHealthSleepSessionGrouper.group(records)
    precondition(sessions.count == 2, "Records from separate sources must stay in separate sessions.")
    precondition(sessions.contains { $0.count == 2 && $0.allSatisfy { $0["source_package"] as? String == "com.vendor.watch" } })
    precondition(sessions.contains { $0.count == 1 && $0.first?["source_package"] as? String == "com.vendor.sleep" })
  }
}
