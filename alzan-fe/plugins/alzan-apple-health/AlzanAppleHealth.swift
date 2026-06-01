import CoreLocation
import Foundation
import HealthKit

@objc(AlzanAppleHealth)
class AlzanAppleHealth: NSObject {
  private let healthStore = HKHealthStore()
  private let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(requestReadPermissions:resolver:rejecter:)
  func requestReadPermissions(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      NSLog("[AlzanAppleHealth] HealthKit is not available on this device")
      resolve(false)
      return
    }

    let types = readTypes()
    NSLog("[AlzanAppleHealth] Requesting read authorization for \(types.count) HealthKit types")
    healthStore.requestAuthorization(toShare: Set<HKSampleType>(), read: types) { success, error in
      if let error {
        NSLog("[AlzanAppleHealth] Authorization failed: \(error.localizedDescription)")
        reject("APPLE_HEALTH_AUTH_FAILED", error.localizedDescription, error)
        return
      }
      NSLog("[AlzanAppleHealth] Authorization request completed. success=\(success)")
      resolve(success)
    }
  }

  @objc(readSyncBatch:resolver:rejecter:)
  func readSyncBatch(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      reject("APPLE_HEALTH_NOT_AVAILABLE", "HealthKit is not available on this device.", nil)
      return
    }

    Task {
      do {
        let batch = try await buildSyncBatch(options: options)
        resolve(batch)
      } catch {
        reject("APPLE_HEALTH_SYNC_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc(disconnect:rejecter:)
  func disconnect(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(nil)
  }

  private func buildSyncBatch(options: NSDictionary?) async throws -> [String: Any] {
    let syncDaysBack = max(1, min(readSyncDaysBack(options), 365))
    let now = Date()
    let start = Calendar.current.date(byAdding: .day, value: -syncDaysBack, to: now) ?? now

    var records: [[String: Any]] = []
    var sourceRevision: [String: Any]?
    var lastRecordByDomain: [String: Date] = [:]

    let workouts = try await fetchWorkouts(start: start, end: now)
    for workout in workouts {
      let workoutPayload = buildWorkoutPayload(workout)
      let linkedRecords = try await fetchWorkoutQuantityRecords(for: workout)
      let route = try await fetchRoutePoints(for: workout)
      var enrichedWorkoutPayload = workoutPayload
      if !route.isEmpty {
        enrichedWorkoutPayload["route"] = route
      }

      let sourcePackage = sourcePackage(for: workout)
      sourceRevision = sourceRevision ?? sourceRevisionPayload(workout.sourceRevision)
      records.append(
        localRecord(
          objectType: "activity",
          sourceRecordId: workout.uuid.uuidString,
          sourcePackage: sourcePackage,
          payload: [
            "provider": "apple_health",
            "data": [
              "workouts": [enrichedWorkoutPayload],
              "records": linkedRecords,
            ],
          ]
        )
      )
      lastRecordByDomain["activities"] = maxDate(lastRecordByDomain["activities"], workout.endDate)
    }

    let dailyRecords = try await fetchDailyActivityRecords(start: start, end: now)
    for (dateKey, dayRecords) in groupByLocalDate(dailyRecords) {
      guard let first = dayRecords.first else { continue }
      let sourcePackage = readString(first["source_package"])
      records.append(
        localRecord(
          objectType: "daily_activity",
          sourceRecordId: "apple-health-daily-\(dateKey)",
          sourcePackage: sourcePackage,
          payload: ["records": dayRecords]
        )
      )
      sourceRevision = sourceRevision ?? readDictionary(first["sourceRevision"])
      lastRecordByDomain["daily_activity"] = maxDate(lastRecordByDomain["daily_activity"], latestEndDate(dayRecords))
    }

    let sleepRecords = try await fetchSleepRecords(start: start, end: now)
    for sleepSession in groupSleepSessions(sleepRecords) {
      guard let first = sleepSession.first else { continue }
      let sourceRecordId = "apple-health-sleep-\(readLocalDate(first["startDate"] as? String ?? ""))-\(readString(first["uuid"]) ?? UUID().uuidString)"
      let sourcePackage = readString(first["source_package"])
      records.append(
        localRecord(
          objectType: "sleep",
          sourceRecordId: sourceRecordId,
          sourcePackage: sourcePackage,
          payload: ["sleep": sleepSession]
        )
      )
      sourceRevision = sourceRevision ?? readDictionary(first["sourceRevision"])
      lastRecordByDomain["sleep"] = maxDate(lastRecordByDomain["sleep"], latestEndDate(sleepSession))
    }

    let recoveryRecords = try await fetchRecoveryRecords(start: start, end: now)
    for (dateKey, dayRecords) in groupByLocalDate(recoveryRecords) {
      guard let first = dayRecords.first else { continue }
      let sourcePackage = readString(first["source_package"])
      records.append(
        localRecord(
          objectType: "recovery",
          sourceRecordId: "apple-health-recovery-\(dateKey)",
          sourcePackage: sourcePackage,
          payload: ["records": dayRecords]
        )
      )
      sourceRevision = sourceRevision ?? readDictionary(first["sourceRevision"])
      lastRecordByDomain["recovery"] = maxDate(lastRecordByDomain["recovery"], latestEndDate(dayRecords))
    }

    let healthSampleRecords = try await fetchDirectHealthSampleRecords(start: start, end: now)
    for record in healthSampleRecords {
      records.append(record)
      lastRecordByDomain["health_metrics"] = maxDate(
        lastRecordByDomain["health_metrics"],
        parseIsoDate(readNestedString(record, path: ["payload", "recordedAt"]))
      )
      if (record["object_type"] as? String) == "weight" {
        lastRecordByDomain["body"] = maxDate(
          lastRecordByDomain["body"],
          parseIsoDate(readNestedString(record, path: ["payload", "recordedAt"]))
        )
      }
    }

    return compactDictionary([
      "sourceRevision": sourceRevision,
      "traceId": "apple-health-ios-\(isoFormatter.string(from: now))",
      "records": records,
      "syncStates": buildSyncStates(lastRecordByDomain),
    ])
  }

  private func readTypes() -> Set<HKObjectType> {
    var types = Set<HKObjectType>()
    types.insert(HKObjectType.workoutType())
    types.insert(HKSeriesType.workoutRoute())

    if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      types.insert(sleep)
    }

    for descriptor in allQuantityDescriptors() {
      if let type = HKObjectType.quantityType(forIdentifier: descriptor.identifier) {
        types.insert(type)
      }
    }

    return types
  }

  private func readSyncDaysBack(_ options: NSDictionary?) -> Int {
    if let value = options?["syncDaysBack"] as? NSNumber {
      return value.intValue
    }
    return 90
  }

  private func allQuantityDescriptors() -> [QuantityDescriptor] {
    var descriptors: [QuantityDescriptor] = [
      .init(identifier: .heartRate, unit: HKUnit.count().unitDivided(by: HKUnit.minute()), unitLabel: "bpm"),
      .init(identifier: .stepCount, unit: HKUnit.count(), unitLabel: "count"),
      .init(identifier: .activeEnergyBurned, unit: HKUnit.kilocalorie(), unitLabel: "kcal"),
      .init(identifier: .basalEnergyBurned, unit: HKUnit.kilocalorie(), unitLabel: "kcal"),
      .init(identifier: .distanceWalkingRunning, unit: HKUnit.meter(), unitLabel: "m"),
      .init(identifier: .distanceCycling, unit: HKUnit.meter(), unitLabel: "m"),
      .init(identifier: .distanceSwimming, unit: HKUnit.meter(), unitLabel: "m"),
      .init(identifier: .swimmingStrokeCount, unit: HKUnit.count(), unitLabel: "count"),
      .init(identifier: .heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli), unitLabel: "ms", metricType: "hrv_sdnn"),
      .init(identifier: .restingHeartRate, unit: HKUnit.count().unitDivided(by: HKUnit.minute()), unitLabel: "bpm", metricType: "resting_heart_rate"),
      .init(identifier: .respiratoryRate, unit: HKUnit.count().unitDivided(by: HKUnit.minute()), unitLabel: "rpm", metricType: "respiratory_rate"),
      .init(identifier: .oxygenSaturation, unit: HKUnit.percent(), unitLabel: "%", metricType: "spo2", multiplier: 100),
      .init(identifier: .bodyTemperature, unit: HKUnit.degreeCelsius(), unitLabel: "C", metricType: "body_temperature"),
      .init(identifier: .vo2Max, unit: vo2MaxUnit(), unitLabel: "ml/kg/min", metricType: "vo2_max"),
      .init(identifier: .bodyMass, unit: HKUnit.gramUnit(with: .kilo), unitLabel: "kg", metricType: "weight_kg"),
      .init(identifier: .bodyFatPercentage, unit: HKUnit.percent(), unitLabel: "%", metricType: "body_fat_percent", multiplier: 100),
    ]

    if #available(iOS 16.0, *) {
      descriptors.append(contentsOf: [
        .init(identifier: .runningSpeed, unit: HKUnit.meter().unitDivided(by: HKUnit.second()), unitLabel: "m/s"),
        .init(identifier: .runningPower, unit: HKUnit.watt(), unitLabel: "W"),
        .init(identifier: .runningStrideLength, unit: HKUnit.meter(), unitLabel: "m"),
        .init(identifier: .runningGroundContactTime, unit: HKUnit.secondUnit(with: .milli), unitLabel: "ms"),
        .init(identifier: .runningVerticalOscillation, unit: HKUnit.meter(), unitLabel: "m"),
        .init(identifier: .appleSleepingWristTemperature, unit: HKUnit.degreeCelsius(), unitLabel: "C", metricType: "wrist_temperature"),
      ])
    }

    if #available(iOS 17.0, *) {
      descriptors.append(contentsOf: [
        .init(identifier: .cyclingPower, unit: HKUnit.watt(), unitLabel: "W"),
        .init(identifier: .cyclingCadence, unit: HKUnit.count().unitDivided(by: HKUnit.minute()), unitLabel: "rpm"),
        .init(identifier: .cyclingFunctionalThresholdPower, unit: HKUnit.watt(), unitLabel: "W"),
      ])
    }

    return descriptors
  }

  private func dailyQuantityDescriptors() -> [QuantityDescriptor] {
    allQuantityDescriptors().filter { descriptor in
      [
        HKQuantityTypeIdentifier.stepCount,
        .activeEnergyBurned,
        .basalEnergyBurned,
        .distanceWalkingRunning,
        .distanceCycling,
        .distanceSwimming,
      ].contains(descriptor.identifier)
    }
  }

  private func workoutQuantityDescriptors() -> [QuantityDescriptor] {
    allQuantityDescriptors().filter { descriptor in
      ![
        HKQuantityTypeIdentifier.basalEnergyBurned,
        .bodyMass,
        .bodyFatPercentage,
        .heartRateVariabilitySDNN,
        .restingHeartRate,
        .respiratoryRate,
        .oxygenSaturation,
        .bodyTemperature,
        .vo2Max,
      ].contains(descriptor.identifier)
    }
  }

  private func recoveryQuantityDescriptors() -> [QuantityDescriptor] {
    allQuantityDescriptors().filter { descriptor in
      [
        HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
        .restingHeartRate,
        .respiratoryRate,
        .oxygenSaturation,
        .bodyTemperature,
      ].contains(descriptor.identifier) || descriptor.identifier.rawValue.contains("AppleSleepingWristTemperature")
    }
  }

  private func directHealthQuantityDescriptors() -> [QuantityDescriptor] {
    allQuantityDescriptors().filter { descriptor in
      [
        HKQuantityTypeIdentifier.vo2Max,
        .bodyMass,
        .bodyFatPercentage,
        .heartRateVariabilitySDNN,
        .restingHeartRate,
        .respiratoryRate,
        .oxygenSaturation,
        .bodyTemperature,
      ].contains(descriptor.identifier) || descriptor.identifier.rawValue.contains("AppleSleepingWristTemperature")
    }
  }

  private func fetchWorkouts(start: Date, end: Date) async throws -> [HKWorkout] {
    try await withCheckedThrowingContinuation { continuation in
      let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictEndDate)
      let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
      let query = HKSampleQuery(
        sampleType: HKObjectType.workoutType(),
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: samples?.compactMap { $0 as? HKWorkout } ?? [])
      }
      healthStore.execute(query)
    }
  }

  private func fetchWorkoutQuantityRecords(for workout: HKWorkout) async throws -> [[String: Any]] {
    var records: [[String: Any]] = []
    for descriptor in workoutQuantityDescriptors() {
      let samples = try await fetchQuantitySamples(descriptor: descriptor, start: workout.startDate, end: workout.endDate)
      records.append(contentsOf: samples.map { quantityRecord($0, descriptor: descriptor, parentId: workout.uuid.uuidString) })
    }
    return records.sorted { (left, right) in
      (left["startDate"] as? String ?? "") < (right["startDate"] as? String ?? "")
    }
  }

  private func fetchDailyActivityRecords(start: Date, end: Date) async throws -> [[String: Any]] {
    var records: [[String: Any]] = []
    for descriptor in dailyQuantityDescriptors() {
      let samples = try await fetchQuantitySamples(descriptor: descriptor, start: start, end: end)
      records.append(contentsOf: samples.map { quantityRecord($0, descriptor: descriptor, parentId: nil) })
    }
    return records
  }

  private func fetchRecoveryRecords(start: Date, end: Date) async throws -> [[String: Any]] {
    var records: [[String: Any]] = []
    for descriptor in recoveryQuantityDescriptors() {
      let samples = try await fetchQuantitySamples(descriptor: descriptor, start: start, end: end)
      records.append(contentsOf: samples.map { quantityRecord($0, descriptor: descriptor, parentId: nil) })
    }
    return records
  }

  private func fetchDirectHealthSampleRecords(start: Date, end: Date) async throws -> [[String: Any]] {
    var records: [[String: Any]] = []
    for descriptor in directHealthQuantityDescriptors() {
      let samples = try await fetchQuantitySamples(descriptor: descriptor, start: start, end: end)
      for sample in samples {
        let sourcePackage = sourcePackage(for: sample)
        let sourceRecordId = sample.uuid.uuidString
        let recordedAt = isoFormatter.string(from: sample.startDate)
        let value = sample.quantity.doubleValue(for: descriptor.unit) * descriptor.multiplier
        let payload = compactDictionary([
          "uuid": sourceRecordId,
          "id": sourceRecordId,
          "type": descriptor.identifier.rawValue,
          "metric_type": descriptor.metricType,
          "recordedAt": recordedAt,
          "startDate": recordedAt,
          "endDate": isoFormatter.string(from: sample.endDate),
          "value": value,
          "unit": descriptor.unitLabel,
          "timezone": TimeZone.current.identifier,
          "source": sourcePayload(sample.sourceRevision.source),
          "sourceRevision": sourceRevisionPayload(sample.sourceRevision),
          "device": devicePayload(sample.device),
          "metadata": metadataPayload(sample.metadata),
        ])

        if descriptor.identifier == .bodyMass {
          records.append(
            localRecord(
              objectType: "weight",
              sourceRecordId: sourceRecordId,
              sourcePackage: sourcePackage,
              payload: payload.merging(["weight_kg": value]) { _, new in new }
            )
          )
          continue
        }

        records.append(
          localRecord(
            objectType: descriptor.identifier == .vo2Max ? "vo2_max" : "health_sample",
            sourceRecordId: sourceRecordId,
            sourcePackage: sourcePackage,
            metricType: descriptor.metricType,
            value: value,
            unit: descriptor.unitLabel,
            recordedAt: recordedAt,
            payload: payload
          )
        )
      }
    }
    return records
  }

  private func fetchQuantitySamples(descriptor: QuantityDescriptor, start: Date, end: Date) async throws -> [HKQuantitySample] {
    guard let quantityType = HKObjectType.quantityType(forIdentifier: descriptor.identifier) else {
      return []
    }
    return try await withCheckedThrowingContinuation { continuation in
      let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictEndDate)
      let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
      let query = HKSampleQuery(
        sampleType: quantityType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: samples?.compactMap { $0 as? HKQuantitySample } ?? [])
      }
      healthStore.execute(query)
    }
  }

  private func fetchSleepRecords(start: Date, end: Date) async throws -> [[String: Any]] {
    guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
      return []
    }
    let samples: [HKCategorySample] = try await withCheckedThrowingContinuation { continuation in
      let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictEndDate)
      let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
      let query = HKSampleQuery(
        sampleType: sleepType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: samples?.compactMap { $0 as? HKCategorySample } ?? [])
      }
      healthStore.execute(query)
    }
    return samples.map(sleepRecord)
  }

  private func fetchRoutePoints(for workout: HKWorkout) async throws -> [[String: Any]] {
    let predicate = HKQuery.predicateForObjects(from: workout)
    let routes: [HKWorkoutRoute] = try await withCheckedThrowingContinuation { continuation in
      let query = HKSampleQuery(
        sampleType: HKSeriesType.workoutRoute(),
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: nil
      ) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: samples?.compactMap { $0 as? HKWorkoutRoute } ?? [])
      }
      healthStore.execute(query)
    }

    var points: [[String: Any]] = []
    for route in routes {
      let locations = try await fetchLocations(for: route)
      points.append(contentsOf: locations.map(routePoint))
    }
    return points.sorted { (left, right) in
      (left["timestamp"] as? String ?? "") < (right["timestamp"] as? String ?? "")
    }
  }

  private func fetchLocations(for route: HKWorkoutRoute) async throws -> [CLLocation] {
    try await withCheckedThrowingContinuation { continuation in
      var locations: [CLLocation] = []
      var didResume = false
      let query = HKWorkoutRouteQuery(route: route) { _, batch, done, error in
        if didResume {
          return
        }
        if let error {
          didResume = true
          continuation.resume(throwing: error)
          return
        }
        if let batch {
          locations.append(contentsOf: batch)
        }
        if done {
          didResume = true
          continuation.resume(returning: locations)
        }
      }
      healthStore.execute(query)
    }
  }

  private func buildWorkoutPayload(_ workout: HKWorkout) -> [String: Any] {
    compactDictionary([
      "uuid": workout.uuid.uuidString,
      "id": workout.uuid.uuidString,
      "workoutActivityType": workoutActivityTypeName(workout.workoutActivityType),
      "type": workoutActivityTypeName(workout.workoutActivityType),
      "title": workoutActivityTypeName(workout.workoutActivityType),
      "startDate": isoFormatter.string(from: workout.startDate),
      "endDate": isoFormatter.string(from: workout.endDate),
      "duration": workout.duration,
      "totalDistance": workout.totalDistance?.doubleValue(for: HKUnit.meter()),
      "distance": workout.totalDistance?.doubleValue(for: HKUnit.meter()),
      "totalEnergyBurned": workout.totalEnergyBurned?.doubleValue(for: HKUnit.kilocalorie()),
      "activeEnergyBurned": workout.totalEnergyBurned?.doubleValue(for: HKUnit.kilocalorie()),
      "source": sourcePayload(workout.sourceRevision.source),
      "sourceRevision": sourceRevisionPayload(workout.sourceRevision),
      "device": devicePayload(workout.device),
      "metadata": metadataPayload(workout.metadata),
      "events": workout.workoutEvents?.map(workoutEventPayload),
    ])
  }

  private func quantityRecord(_ sample: HKQuantitySample, descriptor: QuantityDescriptor, parentId: String?) -> [String: Any] {
    let value = sample.quantity.doubleValue(for: descriptor.unit) * descriptor.multiplier
    return compactDictionary([
      "uuid": sample.uuid.uuidString,
      "id": sample.uuid.uuidString,
      "parentId": parentId,
      "type": descriptor.identifier.rawValue,
      "quantityType": descriptor.identifier.rawValue,
      "metric_type": descriptor.metricType,
      "startDate": isoFormatter.string(from: sample.startDate),
      "endDate": isoFormatter.string(from: sample.endDate),
      "timestamp": isoFormatter.string(from: sample.startDate),
      "value": value,
      "unit": descriptor.unitLabel,
      "source_package": sourcePackage(for: sample),
      "source": sourcePayload(sample.sourceRevision.source),
      "sourceRevision": sourceRevisionPayload(sample.sourceRevision),
      "device": devicePayload(sample.device),
      "metadata": metadataPayload(sample.metadata),
    ])
  }

  private func sleepRecord(_ sample: HKCategorySample) -> [String: Any] {
    compactDictionary([
      "uuid": sample.uuid.uuidString,
      "id": sample.uuid.uuidString,
      "type": HKCategoryTypeIdentifier.sleepAnalysis.rawValue,
      "stage": sleepStageName(sample.value),
      "value": sleepStageName(sample.value),
      "startDate": isoFormatter.string(from: sample.startDate),
      "endDate": isoFormatter.string(from: sample.endDate),
      "source_package": sourcePackage(for: sample),
      "source": sourcePayload(sample.sourceRevision.source),
      "sourceRevision": sourceRevisionPayload(sample.sourceRevision),
      "device": devicePayload(sample.device),
      "metadata": metadataPayload(sample.metadata),
      "timezone": TimeZone.current.identifier,
    ])
  }

  private func routePoint(_ location: CLLocation) -> [String: Any] {
    compactDictionary([
      "timestamp": isoFormatter.string(from: location.timestamp),
      "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude,
      "altitude": location.verticalAccuracy >= 0 ? location.altitude : nil,
      "speed": location.speed >= 0 ? location.speed : nil,
      "horizontalAccuracy": location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil,
      "verticalAccuracy": location.verticalAccuracy >= 0 ? location.verticalAccuracy : nil,
      "course": location.course >= 0 ? location.course : nil,
    ])
  }

  private func localRecord(
    objectType: String,
    sourceRecordId: String?,
    sourcePackage: String?,
    metricType: String? = nil,
    value: Double? = nil,
    unit: String? = nil,
    recordedAt: String? = nil,
    payload: [String: Any]
  ) -> [String: Any] {
    compactDictionary([
      "object_type": objectType,
      "source_record_id": sourceRecordId,
      "source_package": sourcePackage,
      "metric_type": metricType,
      "value": value,
      "unit": unit,
      "recorded_at": recordedAt,
      "payload": payload,
    ])
  }

  private func buildSyncStates(_ lastRecordByDomain: [String: Date]) -> [[String: Any]] {
    lastRecordByDomain.map { domain, date in
      [
        "sync_domain": domain,
        "last_record_at": isoFormatter.string(from: date),
      ]
    }
  }

  private func groupByLocalDate(_ records: [[String: Any]]) -> [String: [[String: Any]]] {
    Dictionary(grouping: records) { record in
      readLocalDate(readString(record["startDate"]) ?? readString(record["recordedAt"]) ?? readString(record["timestamp"]) ?? "")
    }
  }

  private func groupSleepSessions(_ records: [[String: Any]]) -> [[[String: Any]]] {
    let sorted = records.sorted { (left, right) in
      (left["startDate"] as? String ?? "") < (right["startDate"] as? String ?? "")
    }
    var groups: [[[String: Any]]] = []
    var current: [[String: Any]] = []
    var previousEnd: Date?

    for record in sorted {
      let start = parseIsoDate(readString(record["startDate"]))
      if let previousEnd, let start, start.timeIntervalSince(previousEnd) > 6 * 60 * 60, !current.isEmpty {
        groups.append(current)
        current = []
      }
      current.append(record)
      previousEnd = parseIsoDate(readString(record["endDate"])) ?? previousEnd
    }

    if !current.isEmpty {
      groups.append(current)
    }
    return groups
  }

  private func latestEndDate(_ records: [[String: Any]]) -> Date? {
    records.compactMap { parseIsoDate(readString($0["endDate"]) ?? readString($0["recordedAt"])) }.max()
  }

  private func maxDate(_ left: Date?, _ right: Date?) -> Date? {
    guard let left else { return right }
    guard let right else { return left }
    return max(left, right)
  }

  private func parseIsoDate(_ value: String?) -> Date? {
    guard let value else { return nil }
    return isoFormatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  private func readLocalDate(_ value: String) -> String {
    guard let date = parseIsoDate(value) else {
      return value.prefix(10).isEmpty ? isoFormatter.string(from: Date()).prefix(10).description : String(value.prefix(10))
    }
    let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
    let year = components.year ?? 1970
    let month = components.month ?? 1
    let day = components.day ?? 1
    return String(format: "%04d-%02d-%02d", year, month, day)
  }

  private func workoutActivityTypeName(_ type: HKWorkoutActivityType) -> String {
    switch type {
    case .running: return "running"
    case .walking: return "walking"
    case .cycling: return "cycling"
    case .swimming: return "swimming"
    case .hiking: return "hiking"
    case .traditionalStrengthTraining: return "traditionalStrengthTraining"
    case .functionalStrengthTraining: return "functionalStrengthTraining"
    case .coreTraining: return "coreTraining"
    case .soccer: return "soccer"
    case .basketball: return "basketball"
    case .tennis: return "tennis"
    case .badminton: return "badminton"
    case .pickleball: return "pickleball"
    case .paddleSports: return "paddleSports"
    case .yoga: return "yoga"
    case .mindAndBody: return "mindAndBody"
    case .downhillSkiing: return "downhillSkiing"
    case .crossCountrySkiing: return "crossCountrySkiing"
    case .snowboarding: return "snowboarding"
    case .volleyball: return "volleyball"
    default: return "other"
    }
  }

  private func sleepStageName(_ value: Int) -> String {
    if #available(iOS 16.0, *) {
      if value == HKCategoryValueSleepAnalysis.awake.rawValue { return "awake" }
      if value == HKCategoryValueSleepAnalysis.asleepCore.rawValue { return "asleepCore" }
      if value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue { return "asleepDeep" }
      if value == HKCategoryValueSleepAnalysis.asleepREM.rawValue { return "asleepREM" }
    }
    if value == HKCategoryValueSleepAnalysis.inBed.rawValue { return "inBed" }
    if #available(iOS 16.0, *) {
      if value == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue { return "asleep" }
    } else if value == HKCategoryValueSleepAnalysis.asleep.rawValue {
      return "asleep"
    }
    return "unknown"
  }

  private func workoutEventPayload(_ event: HKWorkoutEvent) -> [String: Any] {
    compactDictionary([
      "type": "\(event.type.rawValue)",
      "startDate": isoFormatter.string(from: event.dateInterval.start),
      "endDate": isoFormatter.string(from: event.dateInterval.end),
      "metadata": metadataPayload(event.metadata),
    ])
  }

  private func sourcePackage(for object: HKObject) -> String? {
    object.sourceRevision.source.bundleIdentifier
  }

  private func sourcePayload(_ source: HKSource) -> [String: Any] {
    compactDictionary([
      "name": source.name,
      "bundleIdentifier": source.bundleIdentifier,
    ])
  }

  private func sourceRevisionPayload(_ sourceRevision: HKSourceRevision) -> [String: Any] {
    let os = sourceRevision.operatingSystemVersion
    return compactDictionary([
      "bundleIdentifier": sourceRevision.source.bundleIdentifier,
      "productType": sourceRevision.productType,
      "version": sourceRevision.version,
      "operatingSystemVersion": "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)",
      "source": sourcePayload(sourceRevision.source),
    ])
  }

  private func devicePayload(_ device: HKDevice?) -> [String: Any]? {
    guard let device else { return nil }
    return compactDictionary([
      "name": device.name,
      "manufacturer": device.manufacturer,
      "model": device.model,
      "hardwareVersion": device.hardwareVersion,
      "firmwareVersion": device.firmwareVersion,
      "softwareVersion": device.softwareVersion,
      "localIdentifier": device.localIdentifier,
      "udiDeviceIdentifier": device.udiDeviceIdentifier,
    ])
  }

  private func metadataPayload(_ metadata: [String: Any]?) -> [String: Any]? {
    guard let metadata else { return nil }
    return compactDictionary(metadata.mapValues { Optional(jsonValue($0)) })
  }

  private func compactDictionary(_ values: [String: Any?]) -> [String: Any] {
    values.reduce(into: [String: Any]()) { result, pair in
      guard let value = pair.value else { return }
      result[pair.key] = jsonValue(value)
    }
  }

  private func jsonValue(_ value: Any) -> Any {
    if let date = value as? Date {
      return isoFormatter.string(from: date)
    }
    if let url = value as? URL {
      return url.absoluteString
    }
    if let array = value as? [Any] {
      return array.map(jsonValue)
    }
    if let dictionary = value as? [String: Any] {
      return compactDictionary(dictionary.mapValues { Optional($0) })
    }
    if value is String || value is NSNumber || value is NSNull {
      return value
    }
    return String(describing: value)
  }

  private func readString(_ value: Any?) -> String? {
    guard let value else { return nil }
    if let string = value as? String, !string.isEmpty {
      return string
    }
    return nil
  }

  private func readDictionary(_ value: Any?) -> [String: Any]? {
    value as? [String: Any]
  }

  private func readNestedString(_ dictionary: [String: Any], path: [String]) -> String? {
    var current: Any? = dictionary
    for key in path {
      guard let object = current as? [String: Any] else { return nil }
      current = object[key]
    }
    return readString(current)
  }

  private func vo2MaxUnit() -> HKUnit {
    HKUnit.literUnit(with: .milli)
      .unitDivided(by: HKUnit.gramUnit(with: .kilo))
      .unitDivided(by: HKUnit.minute())
  }
}

private struct QuantityDescriptor {
  let identifier: HKQuantityTypeIdentifier
  let unit: HKUnit
  let unitLabel: String
  let metricType: String?
  let multiplier: Double

  init(
    identifier: HKQuantityTypeIdentifier,
    unit: HKUnit,
    unitLabel: String,
    metricType: String? = nil,
    multiplier: Double = 1
  ) {
    self.identifier = identifier
    self.unit = unit
    self.unitLabel = unitLabel
    self.metricType = metricType
    self.multiplier = multiplier
  }
}
