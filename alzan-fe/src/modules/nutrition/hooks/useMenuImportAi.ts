import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { format } from 'date-fns';
import * as Linking from 'expo-linking';

import { copyTextToClipboard } from '../../../utils/clipboard';
import { serializeMenuImportAiIngredientCsv } from '../services/menuImportAiCatalog';
import { fetchMenuImportAiIngredientCatalog } from '../services/menuImportAiCatalogService';
import { buildMenuImportAiPrompt } from '../services/menuImportAiPrompt';
import {
  buildMenuImportAiClipboardText,
  buildMenuImportAiLaunchTarget,
  isAiCatalogReady,
  type MenuImportAiLaunchResult,
  type MenuImportAiProvider,
} from '../services/menuImportAiProvider';

const openMenuImportAiTarget = async (url: string, reservedWindow: Window | null): Promise<void> => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (!reservedWindow) throw new Error('Unable to open AI provider in a new window');
    reservedWindow.location.href = url;
    return;
  }

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error('Unable to open AI provider');
  await Linking.openURL(url);
};

export const useMenuImportAi = () => {
  const [isLaunching, setIsLaunching] = useState(false);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchMenuImportAiIngredientCatalog>> | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetchMenuImportAiIngredientCatalog()
      .then(nextCatalog => {
        if (cancelled) return;
        setCatalog(nextCatalog);
      })
      .catch(() => {
        if (cancelled) return;
        setCatalog(null);
      })
      .finally(() => {
        if (!cancelled) setIsCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const launchWithAi = useCallback(
    async (provider: MenuImportAiProvider): Promise<MenuImportAiLaunchResult> => {
      const cachedCatalog = catalog;
      if (isLaunching || !isAiCatalogReady(cachedCatalog?.length ?? 0, isCatalogLoading) || !cachedCatalog) {
        return { ok: false, kind: isLaunching ? 'open-error' : 'catalog-error' };
      }

      const reservedWindow =
        Platform.OS === 'web' && typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;

      setIsLaunching(true);
      try {
        const prompt = buildMenuImportAiPrompt({
          currentDate: format(new Date(), 'yyyy-MM-dd'),
        });
        const target = buildMenuImportAiLaunchTarget(provider, prompt);

        try {
          const ingredientCsv = serializeMenuImportAiIngredientCsv(cachedCatalog);
          await copyTextToClipboard(buildMenuImportAiClipboardText(target, prompt, ingredientCsv));
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'clipboard-error' };
        }

        try {
          await openMenuImportAiTarget(target.url, reservedWindow);
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'open-error' };
        }

        return { ok: true, provider, mode: target.mode };
      } finally {
        setIsLaunching(false);
      }
    },
    [catalog, isCatalogLoading, isLaunching],
  );

  return { isLaunching, isCatalogLoading, launchWithAi };
};
