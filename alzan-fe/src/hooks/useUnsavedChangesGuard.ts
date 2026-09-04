import { useCallback, useState } from 'react';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { Alert } from '../components/common/Alert';

interface UnsavedChangesGuardOptions {
  hasUnsavedChanges: boolean;
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
  title,
  message,
  stayLabel,
  discardLabel,
  saveLabel,
  onDiscard,
  onSaveAndExit,
}: UnsavedChangesGuardOptions) => {
  const navigation = useNavigation();
  const [allowNextRemoval, setAllowNextRemoval] = useState(false);

  const continueRemoval = useCallback((action: () => void) => {
    setAllowNextRemoval(true);
    setTimeout(action, 0);
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

  usePreventRemove(hasUnsavedChanges && !allowNextRemoval, ({ data }) => {
    showExitConfirmation(() => navigation.dispatch(data.action));
  });

  return useCallback(
    (onExit: () => void) => {
      if (!hasUnsavedChanges) {
        onExit();
        return;
      }

      showExitConfirmation(onExit);
    },
    [hasUnsavedChanges, showExitConfirmation],
  );
};
