import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { copyTextToClipboard } from '../../../utils/clipboard';
import { fetchTrainingExerciseAiCatalog } from '../services/trainingPlanAiCatalogService';
import { buildTrainingPlanAiPrompt } from '../services/trainingPlanAiPrompt';
import {
  buildTrainingAiLaunchTarget,
  type TrainingAiLaunchResult,
  type TrainingAiProvider,
} from '../services/trainingPlanAiProvider';

const openTrainingAiTarget = async (url: string, reservedWindow: Window | null): Promise<void> => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (reservedWindow) {
      reservedWindow.location.href = url;
      return;
    }

    const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (!openedWindow) throw new Error('Unable to open AI provider');
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
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.open('about:blank', '_blank', 'noopener,noreferrer')
          : null;

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

        const prompt = buildTrainingPlanAiPrompt(catalog);
        try {
          await copyTextToClipboard(prompt);
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'clipboard-error' };
        }

        const target = buildTrainingAiLaunchTarget(provider, prompt);
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
