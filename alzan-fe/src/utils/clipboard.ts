import * as Clipboard from 'expo-clipboard';

export const copyTextToClipboardSync = (text: string): boolean => {
  if (typeof document === 'undefined' || !document.body) return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
};

export const copyTextToClipboardAsync = async (text: string): Promise<void> => {
  if (typeof document !== 'undefined') {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      throw new Error('Modern clipboard unavailable');
    }

    await navigator.clipboard.writeText(text);
    return;
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

export const copyTextToClipboard = async (text: string): Promise<void> => {
  try {
    await copyTextToClipboardAsync(text);
    return;
  } catch {
    if (copyTextToClipboardSync(text)) return;
  }

  throw new Error('Clipboard copy failed');
};
