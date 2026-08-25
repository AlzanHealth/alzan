export type TrainingAiProvider = 'chatgpt' | 'gemini' | 'claude';

export type TrainingAiLaunchResult =
  | { ok: true; provider: TrainingAiProvider; mode: TrainingAiLaunchMode }
  | { ok: false; kind: 'catalog-error' | 'clipboard-error' | 'open-error' };

export type TrainingAiLaunchMode = 'prefilled' | 'clipboard';

export type TrainingAiLaunchTarget = {
  url: string;
  mode: TrainingAiLaunchMode;
};

export type TrainingAiWebLaunchActions = {
  copySync: () => boolean;
  copyAsync: () => Promise<void>;
  openInNewTab: () => boolean;
  redirectCurrentTab: () => void;
};

export type TrainingAiWebLaunchResult = 'opened' | 'redirected' | 'clipboard-error' | 'open-error';

export const isAiCatalogReady = (catalogSize: number, isLoading: boolean): boolean => !isLoading && catalogSize > 0;

const MAX_PROVIDER_URL_LENGTH = 12_000;

const PROVIDER_HOME_URLS: Record<TrainingAiProvider, string> = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://aistudio.google.com/prompts/new_chat',
  claude: 'https://claude.ai/new',
};

const PROVIDER_PROMPT_QUERY_PARAMETERS: Record<TrainingAiProvider, string> = {
  chatgpt: 'prompt',
  gemini: 'prompt',
  claude: 'q',
};

export const buildTrainingAiLaunchTarget = (provider: TrainingAiProvider, prompt: string): TrainingAiLaunchTarget => {
  const queryParameter = PROVIDER_PROMPT_QUERY_PARAMETERS[provider];
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

export const launchTrainingAiOnWeb = async (
  actions: TrainingAiWebLaunchActions,
): Promise<TrainingAiWebLaunchResult> => {
  try {
    await actions.copyAsync();
  } catch {
    try {
      if (!actions.copySync()) return 'clipboard-error';
    } catch {
      return 'clipboard-error';
    }
  }

  try {
    if (actions.openInNewTab()) return 'opened';
    actions.redirectCurrentTab();
    return 'redirected';
  } catch {
    return 'open-error';
  }
};
