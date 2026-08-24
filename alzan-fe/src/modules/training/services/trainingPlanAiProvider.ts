export type TrainingAiProvider = 'chatgpt' | 'gemini' | 'claude';

export type TrainingAiLaunchResult =
  | { ok: true; provider: TrainingAiProvider; mode: 'prefilled' | 'clipboard' }
  | { ok: false; kind: 'catalog-error' | 'clipboard-error' | 'open-error' };

export type TrainingAiLaunchTarget = {
  url: string;
  mode: 'prefilled' | 'clipboard';
};

export const AI_PREFILL_URL_MAX_LENGTH = 6000;

const PROVIDER_HOME_URLS: Record<TrainingAiProvider, string> = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  claude: 'https://claude.ai/new',
};

const buildChatGptPrefillUrl = (prompt: string): string =>
  `${PROVIDER_HOME_URLS.chatgpt}?q=${encodeURIComponent(prompt)}`;

export const buildTrainingAiLaunchTarget = (provider: TrainingAiProvider, prompt: string): TrainingAiLaunchTarget => {
  if (provider === 'chatgpt') {
    const prefilledUrl = buildChatGptPrefillUrl(prompt);
    if (prefilledUrl.length <= AI_PREFILL_URL_MAX_LENGTH) {
      return { url: prefilledUrl, mode: 'prefilled' };
    }
  }

  return { url: PROVIDER_HOME_URLS[provider], mode: 'clipboard' };
};
