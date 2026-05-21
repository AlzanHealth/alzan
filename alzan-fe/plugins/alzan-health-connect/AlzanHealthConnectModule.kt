package com.alzanhealth.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.reflect.KClass

class AlzanHealthConnectModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var pendingPermissionPromise: Promise? = null
  private var pendingPermissionLauncher: ActivityResultLauncher<Set<String>>? = null

  override fun getName(): String = "AlzanHealthConnect"

  @ReactMethod
  fun getAvailableOrigins(promise: Promise) {
    scope.launch {
      try {
        val client = getClient()
        val end = Instant.now()
        val start = end.minus(Duration.ofDays(DEFAULT_SYNC_DAYS_BACK.toLong()))
        val origins = linkedMapOf<String, WritableMap>()

        collectOrigins(client, StepsRecord::class, start, end, origins)
        collectOrigins(client, HeartRateRecord::class, start, end, origins)
        collectOrigins(client, ExerciseSessionRecord::class, start, end, origins)
        collectOrigins(client, SleepSessionRecord::class, start, end, origins)
        collectOrigins(client, RestingHeartRateRecord::class, start, end, origins)
        collectOrigins(client, HeartRateVariabilityRmssdRecord::class, start, end, origins)
        collectOrigins(client, WeightRecord::class, start, end, origins)

        val result = Arguments.createArray()
        origins.values.forEach { result.pushMap(it) }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("HEALTH_CONNECT_ORIGINS_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun requestReadPermissions(options: ReadableMap, promise: Promise) {
    scope.launch {
      try {
        val client = getClient()
        val granted = client.permissionController.getGrantedPermissions()
        val missing = readPermissions - granted
        logDebug(
          "requestReadPermissions androidSdk=${android.os.Build.VERSION.SDK_INT} requested=${readPermissions.joinToString()} granted=${granted.size} missing=${missing.joinToString()}",
        )
        if (granted.containsAll(readPermissions)) {
          logDebug("Health Connect permissions already granted.")
          promise.resolve(true)
          return@launch
        }

        val activity = reactContext.currentActivity
        if (activity == null) {
          promise.reject("HEALTH_CONNECT_ACTIVITY_REQUIRED", "Current Android activity is not available.")
          return@launch
        }
        if (pendingPermissionPromise != null) {
          promise.reject("HEALTH_CONNECT_PERMISSION_IN_PROGRESS", "A Health Connect permission request is already running.")
          return@launch
        }

        pendingPermissionPromise = promise
        requestHealthConnectPermissions(activity)
      } catch (error: ActivityNotFoundException) {
        pendingPermissionPromise = null
        Log.w(TAG, "Health Connect permission activity was not found: ${error.message}", error)
        promise.reject(
          "HEALTH_CONNECT_PERMISSION_ACTIVITY_NOT_FOUND",
          "Health Connect permission screen is not available. Install or update Health Connect, then try again.",
          error,
        )
      } catch (error: Exception) {
        pendingPermissionPromise = null
        Log.w(TAG, "Health Connect permission request failed: ${error.message}", error)
        promise.reject("HEALTH_CONNECT_PERMISSION_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun readSyncBatch(options: ReadableMap, promise: Promise) {
    scope.launch {
      try {
        val selectedPackage = options.getString("selectedPackageName")?.trim()
        if (selectedPackage.isNullOrEmpty()) {
          promise.reject("HEALTH_CONNECT_SOURCE_PACKAGE_REQUIRED", "selectedPackageName is required.")
          return@launch
        }

        val daysBack = if (options.hasKey("syncDaysBack")) options.getInt("syncDaysBack") else DEFAULT_SYNC_DAYS_BACK
        val end = Instant.now()
        val start = end.minus(Duration.ofDays(daysBack.coerceIn(1, 365).toLong()))
        val origin = DataOrigin(selectedPackage)
        val origins = linkedMapOf<String, WritableMap>()
        val records = Arguments.createArray()

        readSteps(client = getClient(), start = start, end = end, origin = origin, origins = origins, records = records)
        readHeartRate(client = getClient(), start = start, end = end, origin = origin, origins = origins, records = records)
        readExercises(client = getClient(), start = start, end = end, origin = origin, origins = origins, records = records)
        readSleep(client = getClient(), start = start, end = end, origin = origin, origins = origins, records = records)
        readRecoverySamples(client = getClient(), start = start, end = end, origin = origin, origins = origins, records = records)
        readWeight(client = getClient(), start = start, end = end, origin = origin, origins = origins, records = records)

        val originArray = Arguments.createArray()
        origins.values.forEach { originArray.pushMap(it) }

        val batch = Arguments.createMap()
        batch.putString("selectedPackageName", selectedPackage)
        batch.putArray("origins", originArray)
        batch.putArray("records", records)
        batch.putString("traceId", "health-connect-android-${Instant.now().toEpochMilli()}")
        promise.resolve(batch)
      } catch (error: Exception) {
        promise.reject("HEALTH_CONNECT_READ_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    promise.resolve(null)
  }

  private fun requestHealthConnectPermissions(activity: Activity) {
    val componentActivity =
      activity as? ComponentActivity
        ?: throw IllegalStateException("Current Android activity cannot request Health Connect permissions.")
    val contract = PermissionController.createRequestPermissionResultContract()
    try {
      logDebug("Launching Health Connect permission contract.")
      pendingPermissionLauncher =
        componentActivity.activityResultRegistry.register("alzan-health-connect-permissions-${System.nanoTime()}", contract) {
          grantedPermissions ->
          val promise = pendingPermissionPromise
          pendingPermissionPromise = null
          pendingPermissionLauncher?.unregister()
          pendingPermissionLauncher = null

          if (promise == null) return@register
          val missing = readPermissions - grantedPermissions
          logDebug(
            "Permission contract result granted=${grantedPermissions.size} missing=${missing.joinToString()}",
          )
          promise.resolve(missing.isEmpty())
        }
      pendingPermissionLauncher?.launch(readPermissions)
    } catch (error: ActivityNotFoundException) {
      pendingPermissionPromise = null
      pendingPermissionLauncher?.unregister()
      pendingPermissionLauncher = null
      Log.w(TAG, "Permission contract unavailable, opening Health Connect settings fallback: ${error.message}", error)
      openHealthConnectSettings(activity)
      throw error
    } catch (error: SecurityException) {
      pendingPermissionPromise = null
      pendingPermissionLauncher?.unregister()
      pendingPermissionLauncher = null
      Log.w(TAG, "Health Connect permission contract was denied by Android: ${error.message}", error)
      openHealthConnectSettings(activity)
      throw error
    }
  }

  private fun openHealthConnectSettings(activity: Activity) {
    runCatching {
      val settingsAction =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          HEALTH_CONNECT_HOME_SETTINGS_ACTION
        } else {
          HEALTH_CONNECT_SETTINGS_ACTION
        }
      activity.startActivity(Intent(settingsAction))
    }.onFailure {
      Log.w(TAG, "Unable to open Health Connect settings fallback: ${it.message}", it)
    }
  }

  private fun getClient(): HealthConnectClient {
    val status = HealthConnectClient.getSdkStatus(reactContext)
    logDebug("Health Connect sdkStatus=$status androidSdk=${android.os.Build.VERSION.SDK_INT}")
    if (status == HealthConnectClient.SDK_UNAVAILABLE) {
      throw IllegalStateException("Health Connect is not available on this device.")
    }
    if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      throw IllegalStateException("Health Connect is installed but must be updated.")
    }
    return HealthConnectClient.getOrCreate(reactContext)
  }

  private fun logDebug(message: String) {
    if (BuildConfig.DEBUG) Log.d(TAG, message)
  }

  private suspend fun <T : Record> readRecords(
    client: HealthConnectClient,
    type: KClass<T>,
    start: Instant,
    end: Instant,
    origin: DataOrigin? = null,
  ): List<T> {
    val all = mutableListOf<T>()
    var pageToken: String? = null
    do {
      val response =
        client.readRecords(
          ReadRecordsRequest(
            recordType = type,
            timeRangeFilter = TimeRangeFilter.between(start, end),
            dataOriginFilter = if (origin == null) emptySet() else setOf(origin),
            pageToken = pageToken,
            pageSize = 1000,
          ),
        )
      all.addAll(response.records)
      pageToken = response.pageToken
    } while (pageToken != null)
    return all
  }

  private suspend fun <T : Record> collectOrigins(
    client: HealthConnectClient,
    type: KClass<T>,
    start: Instant,
    end: Instant,
    origins: MutableMap<String, WritableMap>,
  ) {
    runCatching {
      readRecords(client, type, start, end).forEach { addOrigin(it.metadata.dataOrigin.packageName, origins) }
    }.onFailure { Log.w("AlzanHealthConnect", "Unable to inspect ${type.simpleName}: ${it.message}") }
  }

  private suspend fun readSteps(
    client: HealthConnectClient,
    start: Instant,
    end: Instant,
    origin: DataOrigin,
    origins: MutableMap<String, WritableMap>,
    records: WritableArray,
  ) {
    val byDate = linkedMapOf<LocalDate, MutableList<StepsRecord>>()
    readRecords(client, StepsRecord::class, start, end, origin).forEach { record ->
      addOrigin(record.metadata.dataOrigin.packageName, origins)
      val date = LocalDate.ofInstant(record.startTime, ZoneId.systemDefault())
      byDate.getOrPut(date) { mutableListOf() }.add(record)
    }
    byDate.forEach { (date, dayRecords) ->
      val total = dayRecords.sumOf { it.count }
      val payload = basePayload(dayRecords.first())
      payload.putString("date", date.toString())
      payload.putDouble("totalSteps", total.toDouble())
      val intervals = Arguments.createArray()
      dayRecords.forEach { record ->
        val interval = Arguments.createMap()
        interval.putString("startTime", record.startTime.toString())
        interval.putString("endTime", record.endTime.toString())
        interval.putDouble("steps", record.count.toDouble())
        interval.putMap("metadata", metadataMap(record))
        intervals.pushMap(interval)
      }
      payload.putArray("intervals", intervals)
      records.pushMap(localRecord("daily_activity", "steps-$date-${origin.packageName}", origin.packageName, payload))
    }
  }

  private suspend fun readHeartRate(
    client: HealthConnectClient,
    start: Instant,
    end: Instant,
    origin: DataOrigin,
    origins: MutableMap<String, WritableMap>,
    records: WritableArray,
  ) {
    readRecords(client, HeartRateRecord::class, start, end, origin).forEach { record ->
      addOrigin(record.metadata.dataOrigin.packageName, origins)
      record.samples.forEach { sample ->
        val payload = basePayload(record)
        payload.putString("timestamp", sample.time.toString())
        payload.putDouble("value", sample.beatsPerMinute.toDouble())
        payload.putString("unit", "bpm")
        payload.putString("metric_type", "heart_rate")
        records.pushMap(
          localRecord(
            "health_sample",
            "${record.metadata.id}-${sample.time}",
            origin.packageName,
            payload,
            "heart_rate",
            sample.beatsPerMinute.toDouble(),
            "bpm",
            sample.time.toString(),
          ),
        )
      }
    }
  }

  private suspend fun readExercises(
    client: HealthConnectClient,
    start: Instant,
    end: Instant,
    origin: DataOrigin,
    origins: MutableMap<String, WritableMap>,
    records: WritableArray,
  ) {
    readRecords(client, ExerciseSessionRecord::class, start, end, origin).forEach { record ->
      addOrigin(record.metadata.dataOrigin.packageName, origins)
      val payload = basePayload(record)
      payload.putString("provider", "health_connect")
      payload.putString("exerciseType", exerciseTypeName(record.exerciseType))
      payload.putString("startTime", record.startTime.toString())
      payload.putString("endTime", record.endTime.toString())
      payload.putDouble("durationSeconds", Duration.between(record.startTime, record.endTime).seconds.toDouble())
      record.title?.let { payload.putString("title", it) }
      record.notes?.let { payload.putString("notes", it) }
      records.pushMap(localRecord("activity", record.metadata.id, origin.packageName, payload))
    }
  }

  private suspend fun readSleep(
    client: HealthConnectClient,
    start: Instant,
    end: Instant,
    origin: DataOrigin,
    origins: MutableMap<String, WritableMap>,
    records: WritableArray,
  ) {
    readRecords(client, SleepSessionRecord::class, start, end, origin).forEach { record ->
      addOrigin(record.metadata.dataOrigin.packageName, origins)
      val payload = basePayload(record)
      payload.putString("startTime", record.startTime.toString())
      payload.putString("endTime", record.endTime.toString())
      payload.putDouble("durationMinutes", Duration.between(record.startTime, record.endTime).seconds / 60.0)
      record.title?.let { payload.putString("title", it) }
      val stages = Arguments.createArray()
      record.stages.forEach { stage ->
        val stageMap = Arguments.createMap()
        stageMap.putString("startTime", stage.startTime.toString())
        stageMap.putString("endTime", stage.endTime.toString())
        stageMap.putString("stage", sleepStageName(stage.stage))
        stages.pushMap(stageMap)
      }
      payload.putArray("stages", stages)
      records.pushMap(localRecord("sleep", record.metadata.id, origin.packageName, payload))
    }
  }

  private suspend fun readRecoverySamples(
    client: HealthConnectClient,
    start: Instant,
    end: Instant,
    origin: DataOrigin,
    origins: MutableMap<String, WritableMap>,
    records: WritableArray,
  ) {
    readRecords(client, RestingHeartRateRecord::class, start, end, origin).forEach { record ->
      addOrigin(record.metadata.dataOrigin.packageName, origins)
      val payload = basePayload(record)
      payload.putString("timestamp", record.time.toString())
      payload.putDouble("value", record.beatsPerMinute.toDouble())
      payload.putString("unit", "bpm")
      payload.putString("metric_type", "resting_heart_rate")
      records.pushMap(localRecord("health_sample", record.metadata.id, origin.packageName, payload, "resting_heart_rate", record.beatsPerMinute.toDouble(), "bpm", record.time.toString()))
    }
    readRecords(client, HeartRateVariabilityRmssdRecord::class, start, end, origin).forEach { record ->
      addOrigin(record.metadata.dataOrigin.packageName, origins)
      val payload = basePayload(record)
      payload.putString("timestamp", record.time.toString())
      payload.putDouble("value", record.heartRateVariabilityMillis)
      payload.putString("unit", "ms")
      payload.putString("metric_type", "hrv_rmssd")
      records.pushMap(localRecord("health_sample", record.metadata.id, origin.packageName, payload, "hrv_rmssd", record.heartRateVariabilityMillis, "ms", record.time.toString()))
    }
  }

  private suspend fun readWeight(
    client: HealthConnectClient,
    start: Instant,
    end: Instant,
    origin: DataOrigin,
    origins: MutableMap<String, WritableMap>,
    records: WritableArray,
  ) {
    readRecords(client, WeightRecord::class, start, end, origin).forEach { record ->
      addOrigin(record.metadata.dataOrigin.packageName, origins)
      val payload = basePayload(record)
      payload.putString("recordedAt", record.time.toString())
      payload.putDouble("weightKg", record.weight.inKilograms)
      records.pushMap(localRecord("weight", record.metadata.id, origin.packageName, payload, "weight_kg", record.weight.inKilograms, "kg", record.time.toString()))
    }
  }

  private fun addOrigin(packageName: String, origins: MutableMap<String, WritableMap>) {
    if (origins.containsKey(packageName)) return
    val origin = Arguments.createMap()
    origin.putString("packageName", packageName)
    origin.putString("appName", appName(packageName))
    origin.putString("providerKey", inferProviderKey(packageName))
    origin.putString("platform", "android")
    val raw = Arguments.createMap()
    raw.putString("packageName", packageName)
    origin.putMap("raw", raw)
    origins[packageName] = origin
  }

  private fun basePayload(record: Record): WritableMap {
    val payload = Arguments.createMap()
    payload.putString("provider", "health_connect")
    payload.putMap("metadata", metadataMap(record))
    payload.putString("sourcePackage", record.metadata.dataOrigin.packageName)
    payload.putString("sourceProviderKey", inferProviderKey(record.metadata.dataOrigin.packageName))
    return payload
  }

  private fun metadataMap(record: Record): WritableMap {
    val metadata = Arguments.createMap()
    metadata.putString("id", record.metadata.id)
    record.metadata.clientRecordId?.let { metadata.putString("clientRecordId", it) }
    record.metadata.lastModifiedTime?.let { metadata.putString("lastModifiedTime", it.toString()) }
    val dataOrigin = Arguments.createMap()
    dataOrigin.putString("packageName", record.metadata.dataOrigin.packageName)
    metadata.putMap("dataOrigin", dataOrigin)
    return metadata
  }

  private fun localRecord(
    objectType: String,
    sourceRecordId: String,
    sourcePackage: String,
    payload: WritableMap,
    metricType: String? = null,
    value: Double? = null,
    unit: String? = null,
    recordedAt: String? = null,
  ): WritableMap {
    val record = Arguments.createMap()
    record.putString("object_type", objectType)
    record.putString("source_record_id", sourceRecordId)
    record.putString("source_package", sourcePackage)
    record.putMap("payload", payload)
    metricType?.let { record.putString("metric_type", it) }
    value?.let { record.putDouble("value", it) }
    unit?.let { record.putString("unit", it) }
    recordedAt?.let { record.putString("recorded_at", it) }
    return record
  }

  private fun appName(packageName: String): String =
    try {
      val info = reactContext.packageManager.getApplicationInfo(packageName, 0)
      reactContext.packageManager.getApplicationLabel(info).toString()
    } catch (_: PackageManager.NameNotFoundException) {
      packageName
    }

  private fun inferProviderKey(packageName: String): String =
    when {
      packageName.contains("samsung", ignoreCase = true) -> "samsung_health"
      packageName.contains("fitbit", ignoreCase = true) -> "fitbit"
      packageName.contains("garmin", ignoreCase = true) -> "garmin"
      packageName.contains("strava", ignoreCase = true) -> "strava"
      packageName.contains("google", ignoreCase = true) -> "google_fit"
      else -> packageName
    }

  private fun exerciseTypeName(type: Int): String =
    when (type) {
      ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "EXERCISE_SESSION_TYPE_RUNNING"
      ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "EXERCISE_SESSION_TYPE_RUNNING_TREADMILL"
      ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "EXERCISE_SESSION_TYPE_BIKING"
      ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "EXERCISE_SESSION_TYPE_BIKING_STATIONARY"
      ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "EXERCISE_SESSION_TYPE_SWIMMING_OPEN_WATER"
      ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "EXERCISE_SESSION_TYPE_SWIMMING_POOL"
      ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "EXERCISE_SESSION_TYPE_WALKING"
      ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "EXERCISE_SESSION_TYPE_HIKING"
      ExerciseSessionRecord.EXERCISE_TYPE_TENNIS -> "EXERCISE_SESSION_TYPE_TENNIS"
      ExerciseSessionRecord.EXERCISE_TYPE_SOCCER -> "EXERCISE_SESSION_TYPE_SOCCER"
      ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL -> "EXERCISE_SESSION_TYPE_BASKETBALL"
      ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "EXERCISE_SESSION_TYPE_WEIGHTLIFTING"
      else -> "EXERCISE_SESSION_TYPE_OTHER_WORKOUT"
    }

  private fun sleepStageName(stage: Int): String =
    when (stage) {
      SleepSessionRecord.STAGE_TYPE_AWAKE -> "awake"
      SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> "awake"
      SleepSessionRecord.STAGE_TYPE_SLEEPING -> "sleeping"
      SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> "out_of_bed"
      SleepSessionRecord.STAGE_TYPE_LIGHT -> "light"
      SleepSessionRecord.STAGE_TYPE_DEEP -> "deep"
      SleepSessionRecord.STAGE_TYPE_REM -> "rem"
      else -> "unknown"
    }

  companion object {
    private const val DEFAULT_SYNC_DAYS_BACK = 90
    private const val HEALTH_CONNECT_HOME_SETTINGS_ACTION = "android.health.connect.action.HEALTH_HOME_SETTINGS"
    private const val HEALTH_CONNECT_SETTINGS_ACTION = "androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"
    private const val TAG = "AlzanHealthConnect"
    private val readPermissions =
      setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
      )
  }
}
