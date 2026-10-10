import Foundation

enum AppleHealthSleepSessionGrouper {
  private static let maximumGapSeconds: TimeInterval = 6 * 60 * 60

  static func group(_ records: [[String: Any]]) -> [[[String: Any]]] {
    let sourceGroups = Dictionary(grouping: records, by: sourceKey)
    let sessions = sourceGroups.values.flatMap(groupByTimeGap)
    return sessions.sorted { startDate($0.first) < startDate($1.first) }
  }

  private static func groupByTimeGap(_ records: [[String: Any]]) -> [[[String: Any]]] {
    let sortedRecords = records.sorted { startDate($0) < startDate($1) }
    var sessions: [[[String: Any]]] = []
    var currentSession: [[String: Any]] = []
    var previousEnd: Date?

    for record in sortedRecords {
      let start = parseDate(record["startDate"] as? String)
      if let previousEnd, let start, start.timeIntervalSince(previousEnd) > maximumGapSeconds, !currentSession.isEmpty {
        sessions.append(currentSession)
        currentSession = []
      }
      currentSession.append(record)
      previousEnd = parseDate(record["endDate"] as? String) ?? previousEnd
    }

    if !currentSession.isEmpty {
      sessions.append(currentSession)
    }
    return sessions
  }

  private static func sourceKey(_ record: [String: Any]) -> String {
    let device = record["device"] as? [String: Any] ?? [:]
    let sourceRevision = record["sourceRevision"] as? [String: Any] ?? [:]
    let sourcePackage = record["source_package"] as? String ?? "unknown-source"
    let deviceIdentifier =
      device["localIdentifier"] as? String
      ?? [device["manufacturer"] as? String, device["model"] as? String, device["name"] as? String]
        .compactMap { $0 }
        .joined(separator: "|")
    let productType = sourceRevision["productType"] as? String ?? ""
    return "\(sourcePackage)|\(deviceIdentifier)|\(productType)"
  }

  private static func startDate(_ record: [String: Any]?) -> Date {
    parseDate(record?["startDate"] as? String) ?? .distantPast
  }

  private static func parseDate(_ value: String?) -> Date? {
    guard let value else { return nil }
    let fractionalFormatter = ISO8601DateFormatter()
    fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractionalFormatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }
}
