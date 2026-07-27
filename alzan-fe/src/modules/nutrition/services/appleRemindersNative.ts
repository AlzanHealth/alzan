import { NativeModules, Platform } from 'react-native';

export type AppleReminderItem = {
  title: string;
  notes: string;
};

type AppleRemindersNativeModule = {
  createReminders: (options: { items: AppleReminderItem[]; listName: string }) => Promise<{
    created: number;
    listName: string;
  }>;
};

const getAppleRemindersModule = (): AppleRemindersNativeModule => {
  const nativeModule = NativeModules.AlzanAppleReminders as AppleRemindersNativeModule | undefined;
  if (!nativeModule) throw new Error('Apple Reminders native module is not available in this build.');
  return nativeModule;
};

export const createAppleReminders = async (
  items: AppleReminderItem[],
  listName: string,
): Promise<{ created: number; listName: string }> => {
  if (Platform.OS !== 'ios') throw new Error('Apple Reminders are only available on iOS.');
  return getAppleRemindersModule().createReminders({ items, listName });
};
