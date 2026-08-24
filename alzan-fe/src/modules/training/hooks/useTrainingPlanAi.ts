import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { copyTextToClipboard } from '../../../utils/clipboard';
import { fetchTrainingExerciseAiCatalog } from '../services/trainingPlanAiCatalogService';
import { buildTrainingPlanAiPrompt, serializeTrainingExerciseAiClipboardCsv } from '../services/trainingPlanAiPrompt';
import {
  buildTrainingAiLaunchTarget,
  type TrainingAiLaunchResult,
  type TrainingAiProvider,
} from '../services/trainingPlanAiProvider';

const openTrainingAiTarget = async (url: string, reservedWindow: Window | null): Promise<void> => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (!reservedWindow) throw new Error('Unable to open AI provider in a new window');
    reservedWindow.location.href = url;
    return;
  }

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error('Unable to open AI provider');
  await Linking.openURL(url);
};

export const useTrainingPlanAi = () => {
  const [isLaunching, setIsLaunching] = useState(false);

  const launchWithAi = useCallback(
    async (provider: TrainingAiProvider): Promise<TrainingAiLaunchResult> => {
      if (isLaunching) return { ok: false, kind: 'open-error' };

      const reservedWindow =
        Platform.OS === 'web' && typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;

      setIsLaunching(true);
      try {
        let catalog;
        try {
          catalog = await fetchTrainingExerciseAiCatalog();
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'catalog-error' };
        }

        if (catalog.length === 0) {
          reservedWindow?.close();
          return { ok: false, kind: 'catalog-error' };
        }

        try {
          await copyTextToClipboard(serializeTrainingExerciseAiClipboardCsv(catalog));
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'clipboard-error' };
        }

        const prompt = buildTrainingPlanAiPrompt(catalog);
        const target = buildTrainingAiLaunchTarget(provider, prompt);
        if (!target) {
          reservedWindow?.close();
          return { ok: false, kind: 'open-error' };
        }
        try {
          await openTrainingAiTarget(target.url, reservedWindow);
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'open-error' };
        }

        return { ok: true, provider, mode: target.mode };
      } finally {
        setIsLaunching(false);
      }
    },
    [isLaunching],
  );

  return { isLaunching, launchWithAi };
};
