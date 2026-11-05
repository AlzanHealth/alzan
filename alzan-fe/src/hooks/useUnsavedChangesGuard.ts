import { useCallback, useRef } from 'react';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { Alert } from '../components/common/Alert';

interface UnsavedChangesGuardOptions {
  hasUnsavedChanges: boolean;
  isBusy?: boolean;
  interceptRouteRemoval?: boolean;
  onRouteRemoval?: () => void;
  title: string;
  message: string;
  stayLabel: string;
  discardLabel: string;
  saveLabel: string;
  onDiscard?: () => void;
  onSaveAndExit: (onSaved: () => void) => void | Promise<void>;
}

export const useUnsavedChangesGuard = ({
  hasUnsavedChanges,
  isBusy = false,
  interceptRouteRemoval = false,
  onRouteRemoval,
  title,
  message,
  stayLabel,
  discardLabel,
  saveLabel,
  onDiscard,
  onSaveAndExit,
}: UnsavedChangesGuardOptions) => {
  const navigation = useNavigation();
  const allowNextRemovalRef = useRef(false);

  const continueRemoval = useCallback((action: () => void) => {
    // Navigation can be attempted before a React state update is committed.
    // Keep this bypass synchronous so one confirmation click is enough.
    allowNextRemovalRef.current = true;
    setTimeout(() => {
      try {
        action();
      } finally {
        // Custom exits (for example switching between builder views) do not
        // pass through usePreventRemove, so clear the bypass as well.
        allowNextRemovalRef.current = false;
      }
    }, 0);
  }, []);

  const showExitConfirmation = useCallback(
    (onExit: () => void) => {
      Alert.alert(title, message, [
        { text: stayLabel, style: 'cancel' },
        {
          text: discardLabel,
          style: 'destructive',
          onPress: () => {
            onDiscard?.();
            continueRemoval(onExit);
          },
        },
        {
          text: saveLabel,
          onPress: () => {
            void Promise.resolve(onSaveAndExit(() => continueRemoval(onExit))).catch(() => undefined);
          },
        },
      ]);
    },
    [continueRemoval, discardLabel, message, onDiscard, onSaveAndExit, saveLabel, stayLabel, title],
  );

  usePreventRemove(hasUnsavedChanges || isBusy || interceptRouteRemoval, ({ data }) => {
    if (allowNextRemovalRef.current) {
      allowNextRemovalRef.current = false;
      navigation.dispatch(data.action);
      return;
    }

    if (isBusy) return;

    if (interceptRouteRemoval) {
      if (!hasUnsavedChanges) {
        onRouteRemoval?.();
        return;
      }

      showExitConfirmation(() => onRouteRemoval?.());
      return;
    }

    showExitConfirmation(() => navigation.dispatch(data.action));
  });

  return useCallback(
    (onExit: () => void) => {
      if (isBusy) return;

      if (!hasUnsavedChanges) {
        onExit();
        return;
      }

      showExitConfirmation(onExit);
    },
    [hasUnsavedChanges, isBusy, showExitConfirmation],
  );
};
