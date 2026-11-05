export interface TemplateSaveFlowLock {
  current: boolean;
}

export function startTemplateSave(lock: TemplateSaveFlowLock): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function finishTemplateSave(lock: TemplateSaveFlowLock): void {
  lock.current = false;
}
