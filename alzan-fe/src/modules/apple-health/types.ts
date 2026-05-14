import { LocalHealthSyncRecord, LocalHealthSyncState } from '../wearables';

export type AppleHealthSourceRevision = {
  bundleIdentifier?: string;
  productType?: string;
  version?: string;
  operatingSystemVersion?: string;
};

export type AppleHealthLocalSyncBatch = {
  sourceRevision?: AppleHealthSourceRevision;
  records: LocalHealthSyncRecord[];
  syncStates?: LocalHealthSyncState[];
  traceId?: string;
};

export const getAppleHealthSourcePackage = (sourceRevision?: AppleHealthSourceRevision): string | undefined => {
  return sourceRevision?.bundleIdentifier;
};
