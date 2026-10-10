import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { appendDocumentAsset, postActivityImportForm } from '../services/activityImportApi';
import { ImportedStrengthActivitySummary } from '../services/strengthActivityImportService';
import { healthQueryKeys } from '../modules/health/hooks/healthQueryKeys';

const STRENGTH_ACTIVITY_PICKER_TYPES: string[] = Platform.select({
  ios: ['public.item', 'public.content', 'public.data', 'public.json', 'application/octet-stream'],
  android: ['application/vnd.ant.fit', 'application/octet-stream', 'application/json', '*/*'],
  web: ['.fit', '.json', 'application/vnd.ant.fit', 'application/octet-stream', 'application/json', '*/*'],
  default: ['*/*'],
}) ?? ['*/*'];

interface ApplyStrengthActivityImportParams {
  sessionId: string;
}

async function pickStrengthActivityFile(): Promise<DocumentPicker.DocumentPickerAsset> {
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

  return result.assets[0];
}

export const useApplyStrengthActivityImport = () => {
  const queryClient = useQueryClient();
  const { session, user } = useAuth();

  return useMutation({
    mutationFn: async ({ sessionId }: ApplyStrengthActivityImportParams): Promise<ImportedStrengthActivitySummary> => {
      if (!session?.access_token) throw new Error('AUTH_REQUIRED');

      const asset = await pickStrengthActivityFile();
      const formData = new FormData();
      await appendDocumentAsset(formData, 'file', asset);
      formData.append('session_id', sessionId);

      return postActivityImportForm<ImportedStrengthActivitySummary>(
        '/activity-imports/strength/apply',
        session.access_token,
        formData,
      );
    },
    onSuccess: (_summary, variables) => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sessionHeartRateZones'] });
      queryClient.invalidateQueries({ queryKey: ['sessionImportedStrengthSummary', variables.sessionId] });
    },
  });
};
