export const BODY_COMPOSITION_VERSION = 5;
interface VersionedSnapshot {
  calculation_version: number;
  calculation_status: string;
}
export const needsCompositionRepair = (snapshot: VersionedSnapshot): boolean =>
  snapshot.calculation_status === 'stale' || snapshot.calculation_version !== BODY_COMPOSITION_VERSION;
export const isCurrentCompositionSnapshot = (snapshot: VersionedSnapshot): boolean => !needsCompositionRepair(snapshot);
