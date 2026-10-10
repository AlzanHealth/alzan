export type SuuntoHealthMetric = 'heart_rate' | 'hrv_rmssd' | 'recovery' | 'sleep' | 'stress' | 'steps' | 'energy';

export type SuuntoEducationTopic = 'what' | 'interpretation' | 'measurement';

export const suuntoEducationTopicTitles = {
  what: 'health.suuntoEducationWhat',
  interpretation: 'health.suuntoEducationInterpretation',
  measurement: 'health.suuntoEducationMeasurement',
} as const satisfies Record<SuuntoEducationTopic, `health.${string}`>;

const educationByMetric = {
  heart_rate: {
    titleTranslationKey: 'health.suuntoHeartRateAbout',
    sections: [
      { topic: 'what', translationKey: 'health.suuntoHeartRateWhat' },
      { topic: 'interpretation', translationKey: 'health.suuntoHeartRateInterpretation' },
      { topic: 'measurement', translationKey: 'health.suuntoHeartRateMeasurement' },
    ],
  },
  hrv_rmssd: {
    titleTranslationKey: 'health.suuntoHrvAbout',
    sections: [
      { topic: 'what', translationKey: 'health.suuntoHrvWhat' },
      { topic: 'interpretation', translationKey: 'health.suuntoHrvInterpretation' },
      { topic: 'measurement', translationKey: 'health.suuntoHrvMeasurement' },
    ],
  },
  recovery: {
    titleTranslationKey: 'health.suuntoBalanceAbout',
    sections: [
      { topic: 'what', translationKey: 'health.suuntoBalanceWhat' },
      { topic: 'interpretation', translationKey: 'health.suuntoBalanceInterpretation' },
      { topic: 'measurement', translationKey: 'health.suuntoBalanceMeasurement' },
    ],
  },
  sleep: {
    titleTranslationKey: 'health.suuntoSleepAbout',
    sections: [
      { topic: 'what', translationKey: 'health.suuntoSleepWhat' },
      { topic: 'interpretation', translationKey: 'health.suuntoSleepInterpretation' },
      { topic: 'measurement', translationKey: 'health.suuntoSleepMeasurement' },
    ],
  },
  stress: {
    titleTranslationKey: 'health.suuntoStressAbout',
    sections: [
      { topic: 'what', translationKey: 'health.suuntoStressWhat' },
      { topic: 'interpretation', translationKey: 'health.suuntoStressInterpretation' },
      { topic: 'measurement', translationKey: 'health.suuntoStressMeasurement' },
    ],
  },
  steps: {
    titleTranslationKey: 'health.suuntoStepsAbout',
    sections: [
      { topic: 'what', translationKey: 'health.suuntoStepsWhat' },
      { topic: 'interpretation', translationKey: 'health.suuntoStepsInterpretation' },
      { topic: 'measurement', translationKey: 'health.suuntoStepsMeasurement' },
    ],
  },
  energy: {
    titleTranslationKey: 'health.suuntoEnergyAbout',
    sections: [
      { topic: 'what', translationKey: 'health.suuntoEnergyWhat' },
      { topic: 'interpretation', translationKey: 'health.suuntoEnergyInterpretation' },
      { topic: 'measurement', translationKey: 'health.suuntoEnergyMeasurement' },
    ],
  },
} as const satisfies Record<
  SuuntoHealthMetric,
  {
    titleTranslationKey: `health.${string}`;
    sections: readonly { topic: SuuntoEducationTopic; translationKey: `health.${string}` }[];
  }
>;

export const getSuuntoHealthEducation = (metric: SuuntoHealthMetric) => educationByMetric[metric];
