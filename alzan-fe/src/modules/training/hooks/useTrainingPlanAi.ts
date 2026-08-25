import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { copyTextToClipboard, copyTextToClipboardAsync, copyTextToClipboardSync } from '../../../utils/clipboard';
import { preloadTrainingExerciseAiCatalog } from '../services/trainingPlanAiCatalogService';
import { TrainingExerciseAiCatalogTimeoutError } from '../services/trainingPlanAiCatalog';
import { buildTrainingPlanAiPrompt, serializeTrainingExerciseAiClipboardCsv } from '../services/trainingPlanAiPrompt';
import type { TrainingExerciseAiCatalogRow } from '../services/trainingPlanAiPrompt';
import {
  buildAiClipboardText,
  buildTrainingAiLaunchTarget,
  launchTrainingAiOnWeb,
  type TrainingAiLaunchResult,
  type TrainingAiProvider,
} from '../services/trainingPlanAiProvider';

const openTrainingAiTarget = async (url: string): Promise<void> => {
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error('Unable to open AI provider');
  await Linking.openURL(url);
};

export const useTrainingPlanAi = () => {
  const [isLaunching, setIsLaunching] = useState(false);
  const [catalog, setCatalog] = useState<TrainingExerciseAiCatalogRow[] | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogErrorKind, setCatalogErrorKind] = useState<'timeout' | 'load' | null>(null);
  const catalogRequestVersionRef = useRef(0);

  const loadCatalog = useCallback(async (): Promise<void> => {
    const requestVersion = catalogRequestVersionRef.current + 1;
    catalogRequestVersionRef.current = requestVersion;
    setCatalogStatus('loading');
    setCatalogErrorKind(null);

    try {
      const nextCatalog = await preloadTrainingExerciseAiCatalog();
      if (catalogRequestVersionRef.current !== requestVersion) return;
      setCatalog(nextCatalog);
      setCatalogStatus('ready');
    } catch (error) {
      if (catalogRequestVersionRef.current !== requestVersion) return;
      setCatalog(null);
      setCatalogErrorKind(error instanceof TrainingExerciseAiCatalogTimeoutError ? 'timeout' : 'load');
      setCatalogStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadCatalog();

    return () => {
      catalogRequestVersionRef.current += 1;
    };
  }, [loadCatalog]);

  const retryCatalog = useCallback((): void => {
    void loadCatalog();
  }, [loadCatalog]);

  const launchWithAi = useCallback(
    async (provider: TrainingAiProvider): Promise<TrainingAiLaunchResult> => {
      const cachedCatalog = catalog;
      if (isLaunching || catalogStatus !== 'ready' || !cachedCatalog || cachedCatalog.length === 0) {
        return { ok: false, kind: isLaunching ? 'open-error' : 'catalog-error' };
      }

      const prompt = buildTrainingPlanAiPrompt(cachedCatalog);
      const target = buildTrainingAiLaunchTarget(provider, prompt);
      const exerciseCsv = serializeTrainingExerciseAiClipboardCsv(cachedCatalog);
      const clipboardText = buildAiClipboardText(target, prompt, exerciseCsv);

      setIsLaunching(true);
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          // Reserve the tab synchronously from the original tap. It stays
          // blank until the catalog has been copied, so popup blockers cannot
          // prevent the actual provider navigation after an async fallback.
          const reservedWindow = window.open('about:blank', '_blank');
          const webResult = await launchTrainingAiOnWeb({
            copySync: () => copyTextToClipboardSync(clipboardText),
            copyAsync: () => copyTextToClipboardAsync(clipboardText),
            openInNewTab: () => {
              if (reservedWindow && !reservedWindow.closed) {
                reservedWindow.location.assign(target.url);
                return true;
              }

              return Boolean(window.open(target.url, '_blank'));
            },
            redirectCurrentTab: () => window.location.assign(target.url),
            closeOpenedWindow: () => {
              if (reservedWindow && !reservedWindow.closed) reservedWindow.close();
            },
          });

          if (webResult === 'clipboard-error') return { ok: false, kind: 'clipboard-error' };
          if (webResult === 'open-error') return { ok: false, kind: 'open-error' };
          return { ok: true, provider, mode: target.mode };
        }

        try {
          await copyTextToClipboard(clipboardText);
        } catch {
          return { ok: false, kind: 'clipboard-error' };
        }

        try {
          await openTrainingAiTarget(target.url);
        } catch {
          return { ok: false, kind: 'open-error' };
        }

        return { ok: true, provider, mode: target.mode };
      } finally {
        setIsLaunching(false);
      }
    },
    [catalog, catalogStatus, isLaunching],
  );

  return { catalogStatus, catalogErrorKind, retryCatalog, isLaunching, launchWithAi };
};
