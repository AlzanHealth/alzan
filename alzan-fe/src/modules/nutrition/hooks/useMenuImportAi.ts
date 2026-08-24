import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { format } from 'date-fns';
import * as Linking from 'expo-linking';

import { copyTextToClipboard } from '../../../utils/clipboard';
import { serializeMenuImportAiIngredientCsv } from '../services/menuImportAiCatalog';
import { fetchMenuImportAiIngredientCatalog } from '../services/menuImportAiCatalogService';
import { buildMenuImportAiPrompt } from '../services/menuImportAiPrompt';
import {
  buildMenuImportAiLaunchTarget,
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

  const launchWithAi = useCallback(
    async (provider: MenuImportAiProvider): Promise<MenuImportAiLaunchResult> => {
      if (isLaunching) return { ok: false, kind: 'open-error' };

      const reservedWindow =
        Platform.OS === 'web' && typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;

      setIsLaunching(true);
      try {
        let catalog;
        try {
          catalog = await fetchMenuImportAiIngredientCatalog();
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'catalog-error' };
        }

        if (catalog.length === 0) {
          reservedWindow?.close();
          return { ok: false, kind: 'catalog-error' };
        }

        try {
          await copyTextToClipboard(serializeMenuImportAiIngredientCsv(catalog));
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'clipboard-error' };
        }

        const prompt = buildMenuImportAiPrompt({
          currentDate: format(new Date(), 'yyyy-MM-dd'),
          ingredientCount: catalog.length,
        });
        const target = buildMenuImportAiLaunchTarget(provider, prompt);
        if (!target) {
          reservedWindow?.close();
          return { ok: false, kind: 'open-error' };
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
    [isLaunching],
  );

  return { isLaunching, launchWithAi };
};
