import * as Clipboard from 'expo-clipboard';

export const copyTextToClipboard = async (text: string): Promise<void> => {
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (copied) return;
  }

  try {
    const copied = await Clipboard.setStringAsync(text);
    if (copied) return;
  } catch {
    // Browser clipboard access can be rejected by permissions or when the
    // original user gesture has expired.
  }

  throw new Error('Clipboard copy failed');
};
