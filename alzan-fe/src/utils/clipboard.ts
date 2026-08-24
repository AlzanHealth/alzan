import * as Clipboard from 'expo-clipboard';

export const copyTextToClipboard = async (text: string): Promise<void> => {
  try {
    const copied = await Clipboard.setStringAsync(text);
    if (copied) return;
  } catch {
    // The web implementation can reject after an async catalog request has
    // consumed the original user gesture. Fall through to the browser API.
  }

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

  throw new Error('Clipboard copy failed');
};
