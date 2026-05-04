import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { cacheDirectory, copyAsync, getInfoAsync, readAsStringAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Database } from '../types/database.types';
import {
  getDatabaseProviderForStrengthImport,
  ImportedStrengthActivitySummary,
  parseStrengthActivityFile,
  STRENGTH_ACTIVITY_PARSE_ERROR_TAG,
  STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG,
} from '../services/strengthActivityImportService';

const STRENGTH_ACTIVITY_PICKER_TYPES: string[] = Platform.select({
  ios: ['public.item', 'public.content', 'public.data', 'public.json', 'application/octet-stream'],
  android: ['application/vnd.ant.fit', 'application/octet-stream', 'application/json', '*/*'],
  web: ['.fit', '.json', 'application/vnd.ant.fit', 'application/octet-stream', 'application/json', '*/*'],
  default: ['*/*'],
}) ?? ['*/*'];

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = (() => {
  const table = new Int16Array(123);
  table.fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

type ActivitySessionUpdate = Database['public']['Tables']['activity_sessions']['Update'];
type DeviceInsert = Database['public']['Tables']['devices']['Insert'];
type DeviceRow = Database['public']['Tables']['devices']['Row'];
type HeartRateZoneInsert = Database['public']['Tables']['activity_heart_rate_zones']['Insert'];
type ActivityStreamInsert = Database['public']['Tables']['activity_streams']['Insert'];
type ActivityStreamData = ActivityStreamInsert['data'];

function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/\s/g, '');
  if (clean.length === 0) return new Uint8Array(0);

  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outputLength = (clean.length / 4) * 3 - padding;
  const output = new Uint8Array(outputLength);
  let buffer = 0;
  let bits = 0;
  let outIndex = 0;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (char === '=') break;

    const code = clean.charCodeAt(index);
    const value = code < BASE64_LOOKUP.length ? BASE64_LOOKUP[code] : -1;
    if (value < 0) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output[outIndex] = (buffer >> bits) & 0xff;
      outIndex += 1;
    }
  }

  return output.subarray(0, outIndex);
}

async function readFileAsText(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    return response.text();
  }

  try {
    return await new File(uri).text();
  } catch {
    try {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
      return response.text();
    } catch {
      return readAsStringAsync(uri, { encoding: 'utf8' });
    }
  }
}

async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    return new Uint8Array(await response.arrayBuffer());
  }

  try {
    return await new File(uri).bytes();
  } catch {
    try {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      const base64 = await readAsStringAsync(uri, { encoding: 'base64' });
      return decodeBase64(base64);
    }
  }
}

function deriveFilename(asset: DocumentPicker.DocumentPickerAsset): string {
  if (asset.name && asset.name.trim().length > 0) return asset.name;
  const uriTail = asset.uri.split('/').pop();
  if (!uriTail) return 'strength-activity.fit';
  const decoded = decodeURIComponent(uriTail).trim();
  return decoded.length > 0 ? decoded : 'strength-activity.fit';
}

function extractFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex) : '';
}

async function resolveReadableNativeUri(uri: string, filename: string): Promise<string> {
  if (Platform.OS === 'web' || uri.startsWith('file://')) return uri;

  try {
    if (!cacheDirectory) return uri;

    const extension = extractFileExtension(filename);
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const destination = `${cacheDirectory}strength-activity-upload-${unique}${extension}`;
    await copyAsync({ from: uri, to: destination });
    const info = await getInfoAsync(destination);
    if (info.exists) return destination;
  } catch {
    return uri;
  }

  return uri;
}

function isFitBinary(binary: Uint8Array): boolean {
  if (binary.length < 12) return false;
  return String.fromCharCode(binary[8], binary[9], binary[10], binary[11]) === '.FIT';
}

function withExtension(filename: string, extension: 'fit' | 'json'): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(`.${extension}`)) return filename;
  return `${filename}.${extension}`;
}

async function pickAndParseStrengthActivityFile(): Promise<ImportedStrengthActivitySummary> {
  let result: DocumentPicker.DocumentPickerResult;

  try {
    result = await DocumentPicker.getDocumentAsync({
      type: STRENGTH_ACTIVITY_PICKER_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch (pickerError) {
    if (Platform.OS !== 'ios') throw pickerError;
    result = await DocumentPicker.getDocumentAsync({
      type: ['public.item'],
      copyToCacheDirectory: true,
      multiple: false,
    });
  }

  if (result.canceled || !result.assets || result.assets.length === 0) {
    throw new Error('CANCELLED');
  }

  const asset = result.assets[0];
  const filename = deriveFilename(asset);
  const uri = await resolveReadableNativeUri(asset.uri, filename);
  const lowerName = filename.toLowerCase();
  const mimeType = (asset.mimeType ?? '').toLowerCase();

  try {
    if (lowerName.endsWith('.fit') || mimeType.includes('fit') || mimeType.includes('octet-stream')) {
      const binary = await readFileAsBytes(uri);
      if (isFitBinary(binary)) return parseStrengthActivityFile(binary, withExtension(filename, 'fit'));
    }

    if (lowerName.endsWith('.json') || mimeType.includes('json')) {
      const text = await readFileAsText(uri);
      return parseStrengthActivityFile(text, withExtension(filename, 'json'));
    }

    const binary = await readFileAsBytes(uri);
    if (isFitBinary(binary)) return parseStrengthActivityFile(binary, withExtension(filename, 'fit'));

    const text = await readFileAsText(uri);
    return parseStrengthActivityFile(text, withExtension(filename, 'json'));
  } catch (error) {
    if (error instanceof Error && error.message === STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG) {
      throw error;
    }
    throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
  }
}

async function ensureDevice(userId: string, summary: ImportedStrengthActivitySummary): Promise<string | null> {
  if (!summary.device) return null;

  const provider = getDatabaseProviderForStrengthImport(summary.provider);
  const serial = summary.device.serial?.trim() || null;
  const name = summary.device.name?.trim() || null;
  const model = summary.device.model?.trim() || null;

  if (!serial && !name && !model) return null;

  if (serial) {
    const { data: existingDevice, error: existingError } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('device_serial', serial)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existingDevice) return existingDevice.id;
  }

  const payload: DeviceInsert = {
    user_id: userId,
    provider,
    device_name: name,
    device_model: model,
    device_serial: serial,
  };

  const { data: createdDevice, error: createError } = await supabase
    .from('devices')
    .insert(payload)
    .select('id')
    .single<DeviceRow>();

  if (createError) throw createError;
  return createdDevice.id;
}

function buildSessionUpdate(summary: ImportedStrengthActivitySummary, deviceId: string | null): ActivitySessionUpdate {
  const update: ActivitySessionUpdate = {
    provider: getDatabaseProviderForStrengthImport(summary.provider),
    imported_at: new Date().toISOString(),
  };

  if (deviceId) update.device_id = deviceId;
  if (summary.startedAt) update.start_time = summary.startedAt;
  if (summary.endedAt) update.end_time = summary.endedAt;
  if (summary.durationSeconds != null) update.duration_s = summary.durationSeconds;
  if (summary.caloriesKcal != null) update.calories_kcal = summary.caloriesKcal;
  if (summary.avgHeartRate != null) update.avg_heart_rate = summary.avgHeartRate;
  if (summary.maxHeartRate != null) update.max_heart_rate = summary.maxHeartRate;
  if (summary.minHeartRate != null) update.min_heart_rate = summary.minHeartRate;
  if (summary.totalSteps != null) update.total_steps = summary.totalSteps;
  if (summary.recoveryTimeSeconds != null) update.recovery_time_s = summary.recoveryTimeSeconds;
  if (summary.tss != null) update.tss_hr = summary.tss;
  if (summary.epoc != null) update.epoc = summary.epoc;
  if (summary.pte != null) update.pte = summary.pte;

  return update;
}

export const usePickStrengthActivityImport = () =>
  useMutation({
    mutationFn: pickAndParseStrengthActivityFile,
  });

export const useApplyStrengthActivityImport = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      sessionId,
      summary,
    }: {
      sessionId: string;
      summary: ImportedStrengthActivitySummary;
    }): Promise<void> => {
      if (!user?.id) throw new Error('AUTH_REQUIRED');

      const deviceId = await ensureDevice(user.id, summary);
      const sessionUpdate = buildSessionUpdate(summary, deviceId);

      const { error: updateError } = await supabase
        .from('activity_sessions')
        .update(sessionUpdate)
        .eq('id', sessionId)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      const { error: deleteZonesError } = await supabase
        .from('activity_heart_rate_zones')
        .delete()
        .eq('session_id', sessionId);
      if (deleteZonesError) throw deleteZonesError;

      if (summary.heartRateZones.length > 0) {
        const zoneRows: HeartRateZoneInsert[] = summary.heartRateZones.map(zone => ({
          session_id: sessionId,
          zone: zone.zone,
          duration_s: zone.durationSeconds,
          percentage: zone.percentage,
        }));

        const { error: insertZonesError } = await supabase.from('activity_heart_rate_zones').insert(zoneRows);
        if (insertZonesError) throw insertZonesError;
      }

      const { error: deleteStreamsError } = await supabase
        .from('activity_streams')
        .delete()
        .eq('session_id', sessionId)
        .eq('source', 'strength_file_import');

      if (deleteStreamsError) throw deleteStreamsError;

      const streamSamples: ActivityStreamData[] = summary.heartRateStream.map(sample => ({
        bpm: sample.bpm,
        timestamp: sample.timestamp,
        offsetSeconds: sample.offsetSeconds,
      }));
      const streamData: ActivityStreamData = {
        provider: summary.provider,
        sourceFileType: summary.sourceFileType,
        trainingLoadPeak: summary.trainingLoadPeak,
        avgHeartRate: summary.avgHeartRate,
        maxHeartRate: summary.maxHeartRate,
        minHeartRate: summary.minHeartRate,
        caloriesKcal: summary.caloriesKcal,
        totalSteps: summary.totalSteps,
        recoveryTimeSeconds: summary.recoveryTimeSeconds,
        epoc: summary.epoc,
        pte: summary.pte,
        tss: summary.tss,
        samples: streamSamples,
      };
      const streamRows: ActivityStreamInsert[] = [
        {
          session_id: sessionId,
          user_id: user.id,
          stream_type: 'heart_rate',
          unit: 'bpm',
          source: 'strength_file_import',
          data: streamData,
        },
      ];

      const { error: insertStreamsError } = await supabase.from('activity_streams').insert(streamRows);
      if (insertStreamsError) throw insertStreamsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sessionHeartRateZones'] });
    },
  });
};
