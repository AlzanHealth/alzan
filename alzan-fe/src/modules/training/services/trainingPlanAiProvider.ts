export type TrainingAiProvider = 'chatgpt' | 'gemini' | 'claude';

export type TrainingAiLaunchResult =
  | { ok: true; provider: TrainingAiProvider; mode: TrainingAiLaunchMode }
  | { ok: false; kind: 'catalog-error' | 'clipboard-error' | 'open-error' };

export type TrainingAiLaunchMode = 'prefilled' | 'clipboard';

export type TrainingAiLaunchTarget = {
  url: string;
  mode: TrainingAiLaunchMode;
};

const MAX_PROVIDER_URL_LENGTH = 12_000;

const PROVIDER_HOME_URLS: Record<TrainingAiProvider, string> = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  claude: 'https://claude.ai/new',
};

export const buildTrainingAiLaunchTarget = (provider: TrainingAiProvider, prompt: string): TrainingAiLaunchTarget => {
  const queryParameter = provider === 'chatgpt' ? 'prompt' : 'q';
  const prefilledUrl = `${PROVIDER_HOME_URLS[provider]}?${queryParameter}=${encodeURIComponent(prompt)}`;
  if (prefilledUrl.length <= MAX_PROVIDER_URL_LENGTH) return { url: prefilledUrl, mode: 'prefilled' };

  return { url: PROVIDER_HOME_URLS[provider], mode: 'clipboard' };
};

export const buildAiClipboardText = (target: TrainingAiLaunchTarget, prompt: string, catalogCsv: string): string => {
  if (target.mode === 'prefilled') return catalogCsv;

  const firstLineEnd = catalogCsv.indexOf('\n');
  if (firstLineEnd < 0) return `${catalogCsv}\nAI_INSTRUCTIONS\n${prompt.trim()}`;

  const fileName = catalogCsv.slice(0, firstLineEnd);
  const catalogRows = catalogCsv.slice(firstLineEnd + 1);
  return `${fileName}\nAI_INSTRUCTIONS\n${prompt.trim()}\n\n${catalogRows}`;
};
