export type TrainingAiProvider = 'chatgpt' | 'gemini' | 'claude';

export type TrainingAiLaunchResult =
  | { ok: true; provider: TrainingAiProvider; mode: 'prefilled' }
  | { ok: false; kind: 'catalog-error' | 'clipboard-error' | 'open-error' };

export type TrainingAiLaunchTarget = {
  url: string;
  mode: 'prefilled';
};

const MAX_PROVIDER_URL_LENGTH = 12_000;

const PROVIDER_HOME_URLS: Record<TrainingAiProvider, string> = {
  chatgpt: 'https://chatgpt.com/?prompt=',
  gemini: 'https://gemini.google.com/app?prompt=',
  claude: 'https://claude.ai/new?q=',
};

export const buildTrainingAiLaunchTarget = (
  provider: TrainingAiProvider,
  prompt: string,
): TrainingAiLaunchTarget | null => {
  const url = `${PROVIDER_HOME_URLS[provider]}${encodeURIComponent(prompt)}`;
  if (url.length > MAX_PROVIDER_URL_LENGTH) return null;
  return { url, mode: 'prefilled' };
};
