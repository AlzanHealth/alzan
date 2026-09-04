export function serializeEditableState(value: unknown): string {
  return JSON.stringify(value) ?? '';
}

export function cloneEditableState<T>(value: T): T {
  return JSON.parse(serializeEditableState(value)) as T;
}

export function hasUnsavedChanges(initialSnapshot: string | null, currentSnapshot: string): boolean {
  return initialSnapshot !== null && initialSnapshot !== currentSnapshot;
}
