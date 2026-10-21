import type { useExercises } from './useExercises';

type SearchResult = ReturnType<typeof useExercises>;
type Assert<T extends true> = T;

export type SearchResultExposesFuzzyCandidates = Assert<'fuzzyCandidates' extends keyof SearchResult ? true : false>;
