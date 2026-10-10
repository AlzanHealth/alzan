import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Alert } from '../components/common/Alert';
import { useAuth } from '../context/AuthContext';
import { appendDocumentAsset, postActivityImportForm } from '../services/activityImportApi';
import { ParsedRouteImport, SupportedRouteFormat } from '../services/mapService';
import { healthQueryKeys } from '../modules/health/hooks/healthQueryKeys';

const ROUTE_PICKER_TYPES: string[] = Platform.select({
  ios: [
    'public.item',
    'public.content',
    'public.data',
    'public.text',
    'public.xml',
    'public.json',
    'application/octet-stream',
  ],
  android: [
    'application/vnd.ant.fit',
    'application/octet-stream',
    'application/gpx+xml',
    'application/vnd.google-earth.kml+xml',
    'application/json',
    'application/xml',
    'text/xml',
    'text/plain',
    '*/*',
  ],
  web: [
    '.fit',
    '.gpx',
    '.tcx',
    '.kml',
    '.json',
    '.txt',
    '.polyline',
    'application/vnd.ant.fit',
    'application/octet-stream',
    'application/gpx+xml',
    'application/vnd.google-earth.kml+xml',
    'application/json',
    'application/xml',
    'text/xml',
    'text/plain',
    '*/*',
  ],
  default: ['*/*'],
}) ?? ['*/*'];

/** Tag attached to errors thrown by route imports so we can show a specific message */
export const ROUTE_PARSE_ERROR_TAG = 'ROUTE_PARSE_ERROR';

export interface PickedRouteImport extends ParsedRouteImport {
  uploadAsset: DocumentPicker.DocumentPickerAsset;
}

interface UploadPolylineParams {
  sessionId: string;
}

interface ApplyPickedRouteImportParams {
  sessionId: string;
  uploadAsset: DocumentPicker.DocumentPickerAsset;
  estimatedMaxHeartRate?: number | null;
}

interface UseUploadPolylineOptions {
  onPolylineUploaded?: (polyline: string) => void;
}

interface UsePickPolylineOptions {
  onPolylinePicked?: (polyline: string) => void;
  onRoutePicked?: (route: ParsedRouteImport, uploadAsset: DocumentPicker.DocumentPickerAsset) => void;
  estimatedMaxHeartRate?: number | null;
}

interface PickPolylineMutationVars {
  estimatedMaxHeartRate?: number | null;
}

interface ApplyRouteActivityImportResponse {
  format: SupportedRouteFormat;
  parsed: ParsedRouteImport;
}

async function pickRouteFile(): Promise<DocumentPicker.DocumentPickerAsset> {
  let result: DocumentPicker.DocumentPickerResult;

  try {
    result = await DocumentPicker.getDocumentAsync({
      type: ROUTE_PICKER_TYPES,
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

  return result.assets[0];
}

function appendOptionalHeartRate(formData: FormData, estimatedMaxHeartRate?: number | null): void {
  if (estimatedMaxHeartRate == null || !Number.isFinite(estimatedMaxHeartRate)) return;
  formData.append('estimated_max_heart_rate', String(estimatedMaxHeartRate));
}

async function parseRouteImport(params: {
  token: string;
  uploadAsset: DocumentPicker.DocumentPickerAsset;
  estimatedMaxHeartRate?: number | null;
}): Promise<ParsedRouteImport> {
  const formData = new FormData();
  await appendDocumentAsset(formData, 'file', params.uploadAsset);
  appendOptionalHeartRate(formData, params.estimatedMaxHeartRate);
  return postActivityImportForm<ParsedRouteImport>('/activity-imports/route/parse', params.token, formData);
}

async function applyRouteImport(params: {
  token: string;
  sessionId: string;
  uploadAsset: DocumentPicker.DocumentPickerAsset;
  persistDetails: boolean;
  estimatedMaxHeartRate?: number | null;
}): Promise<ParsedRouteImport> {
  const formData = new FormData();
  await appendDocumentAsset(formData, 'file', params.uploadAsset);
  formData.append('session_id', params.sessionId);
  formData.append('persist_details', params.persistDetails ? 'true' : 'false');
  appendOptionalHeartRate(formData, params.estimatedMaxHeartRate);

  const response = await postActivityImportForm<ApplyRouteActivityImportResponse>(
    '/activity-imports/route/apply',
    params.token,
    formData,
  );

  return response.parsed;
}

export const useUploadPolyline = ({ onPolylineUploaded }: UseUploadPolylineOptions = {}) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ sessionId }: UploadPolylineParams): Promise<string> => {
      if (!session?.access_token) throw new Error('AUTH_REQUIRED');

      const uploadAsset = await pickRouteFile();
      const parsedRoute = await applyRouteImport({
        token: session.access_token,
        sessionId,
        uploadAsset,
        persistDetails: false,
      });

      return parsedRoute.polyline;
    },
    onSuccess: polyline => {
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onPolylineUploaded?.(polyline);
    },
    onError: (error: Error) => {
      if (error.message === 'CANCELLED') return;
      const userMessage =
        error.message === ROUTE_PARSE_ERROR_TAG ? t('training.routeParseError') : t('training.routeUploadError');
      Alert.alert(t('training.routeMap'), userMessage);
    },
  });
};

export const usePickPolyline = ({
  onPolylinePicked,
  onRoutePicked,
  estimatedMaxHeartRate,
}: UsePickPolylineOptions = {}) => {
  const { t } = useTranslation();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (vars?: PickPolylineMutationVars): Promise<PickedRouteImport> => {
      if (!session?.access_token) throw new Error('AUTH_REQUIRED');

      const uploadAsset = await pickRouteFile();
      const parsedRoute = await parseRouteImport({
        token: session.access_token,
        uploadAsset,
        estimatedMaxHeartRate: vars?.estimatedMaxHeartRate ?? estimatedMaxHeartRate,
      });

      return { ...parsedRoute, uploadAsset };
    },
    onSuccess: parsedRoute => {
      onPolylinePicked?.(parsedRoute.polyline);
      onRoutePicked?.(parsedRoute, parsedRoute.uploadAsset);
    },
    onError: (error: Error) => {
      if (error.message === 'CANCELLED') return;
      const userMessage =
        error.message === ROUTE_PARSE_ERROR_TAG ? t('training.routeParseError') : t('training.routeUploadError');
      Alert.alert(t('training.routeMap'), userMessage);
    },
  });
};

export const useApplyPickedRouteImport = () => {
  const queryClient = useQueryClient();
  const { session, user } = useAuth();

  return useMutation({
    mutationFn: async ({
      sessionId,
      uploadAsset,
      estimatedMaxHeartRate,
    }: ApplyPickedRouteImportParams): Promise<ParsedRouteImport> => {
      if (!session?.access_token) throw new Error('AUTH_REQUIRED');

      return applyRouteImport({
        token: session.access_token,
        sessionId,
        uploadAsset,
        persistDetails: true,
        estimatedMaxHeartRate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sessionHeartRateZones'] });
    },
  });
};
