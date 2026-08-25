import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { format } from 'date-fns';
import * as Linking from 'expo-linking';

import { copyTextToClipboard } from '../../../utils/clipboard';
import { buildMenuImportAiPrompt } from '../services/menuImportAiPrompt';
import {
  buildMenuImportAiLaunchTarget,
  type MenuImportAiLaunchResult,
  type MenuImportAiProvider,
} from '../services/menuImportAiProvider';

const openMenuImportAiTarget = async (url: string, reservedWindow: Window | null): Promise<void> => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Open the complete URL in the click handler. Navigating an about:blank
    // popup after awaiting the clipboard is unreliable on Safari/iOS.
    if (!reservedWindow || reservedWindow.closed) throw new Error('Unable to open AI provider in a new window');
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

      const prompt = buildMenuImportAiPrompt({
        currentDate: format(new Date(), 'yyyy-MM-dd'),
      });
      const target = buildMenuImportAiLaunchTarget(provider, prompt);
      const reservedWindow =
        Platform.OS === 'web' && typeof window !== 'undefined' ? window.open(target.url, '_blank') : null;

      setIsLaunching(true);
      try {
        if (target.mode === 'clipboard') {
          try {
            await copyTextToClipboard(prompt);
          } catch {
            reservedWindow?.close();
            return { ok: false, kind: 'clipboard-error' };
          }
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
