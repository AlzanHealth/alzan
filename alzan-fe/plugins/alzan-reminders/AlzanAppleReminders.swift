import EventKit
import Foundation

@objc(AlzanAppleReminders)
class AlzanAppleReminders: NSObject {
  private let eventStore = EKEventStore()

  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(createReminders:resolver:rejecter:)
  func createReminders(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let items = options?["items"] as? [[String: Any]] ?? []
    let requestedListName = (options?["listName"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let listName = requestedListName?.isEmpty == false ? requestedListName! : "Compra Josep"

    guard !items.isEmpty else {
      resolve(["created": 0, "listName": listName])
      return
    }

    let saveAfterAuthorization: (Bool, Error?) -> Void = { [weak self] granted, error in
      guard let self else { return }
      if let error {
        reject("APPLE_REMINDERS_PERMISSION_FAILED", error.localizedDescription, error)
        return
      }
      guard granted else {
        reject("APPLE_REMINDERS_PERMISSION_DENIED", "Reminders access was not granted.", nil)
        return
      }

      do {
        let created = try self.save(items: items, listName: listName)
        resolve(["created": created, "listName": listName])
      } catch {
        reject("APPLE_REMINDERS_SAVE_FAILED", error.localizedDescription, error)
      }
    }

    if #available(iOS 17.0, *) {
      eventStore.requestFullAccessToReminders { granted, error in
        saveAfterAuthorization(granted, error)
      }
    } else {
      eventStore.requestAccess(to: .reminder) { granted, error in
        saveAfterAuthorization(granted, error)
      }
    }
  }

  private func save(items: [[String: Any]], listName: String) throws -> Int {
    let calendar = try reminderList(named: listName)
    var created = 0

    for item in items {
      guard let title = item["title"] as? String, !title.isEmpty else { continue }

      let reminder = EKReminder(eventStore: eventStore)
      reminder.title = title
      reminder.notes = item["notes"] as? String
      reminder.calendar = calendar
      try eventStore.save(reminder, commit: false)
      created += 1
    }

    try eventStore.commit()
    return created
  }

  private func reminderList(named listName: String) throws -> EKCalendar {
    if let existing = eventStore.calendars(for: .reminder).first(where: {
      $0.title.caseInsensitiveCompare(listName) == .orderedSame
    }) {
      return existing
    }

    guard let source = eventStore.defaultCalendarForNewReminders()?.source ?? eventStore.sources.first else {
      throw NSError(
        domain: "AlzanAppleReminders",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "No Reminders account is available on this device."]
      )
    }

    let calendar = EKCalendar(for: .reminder, eventStore: eventStore)
    calendar.title = listName
    calendar.source = source
    try eventStore.saveCalendar(calendar, commit: true)
    return calendar
  }
}
