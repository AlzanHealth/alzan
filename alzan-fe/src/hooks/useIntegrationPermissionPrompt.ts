import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

const promptForPermissionRequest = ({
  title,
  message,
  cancelLabel,
  continueLabel,
}: {
  title: string;
  message: string;
  cancelLabel: string;
  continueLabel: string;
}): Promise<boolean> =>
  new Promise(resolve => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: continueLabel, onPress: () => resolve(true) },
    ]);
  });

export function useIntegrationPermissionPrompt() {
  const { t } = useTranslation();

  const confirmPermissionRequest = useCallback(
    (serviceName: string): Promise<boolean> =>
      promptForPermissionRequest({
        title: t('settings.permissionPromptTitle', { service: serviceName }),
        message: t('settings.permissionPromptMessage', { service: serviceName }),
        cancelLabel: t('common.cancel'),
        continueLabel: t('settings.continueToPermission'),
      }),
    [t],
  );

  return { confirmPermissionRequest };
}
