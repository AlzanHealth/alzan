export function isMenuImportOperationBlocked(importInFlight: boolean, analyzeInFlight: boolean): boolean {
  return importInFlight || analyzeInFlight;
}
