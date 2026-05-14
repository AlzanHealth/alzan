import { Injectable } from '@nestjs/common';
import { CanonicalActivity } from '../../activity-import/parsers/activity-import-canonical.types';
import { CanonicalProvenance } from '../domain/wearable.types';

@Injectable()
export class DedupeService {
  public buildActivityFingerprint(userId: string, activity: CanonicalActivity): string {
    const startBucket = this.roundTimestamp(activity.summary.startedAt, 30);
    const endBucket = this.roundTimestamp(activity.summary.endedAt, 30);
    const distanceBucket =
      activity.summary.distanceM == null ? 'no-distance' : Math.round(activity.summary.distanceM / 50);
    const durationBucket =
      activity.summary.durationSeconds == null ? 'no-duration' : Math.round(activity.summary.durationSeconds / 30);
    return [userId, activity.sportType, startBucket, endBucket, durationBucket, distanceBucket].join(':');
  }

  public buildStrongActivityKey(userId: string, provenance: CanonicalProvenance): string | null {
    if (!provenance.sourceRecordId) return null;
    return [
      userId,
      provenance.provider,
      provenance.sourceChannel,
      provenance.sourcePackage ?? '',
      provenance.sourceRecordId,
    ].join(':');
  }

  private roundTimestamp(value: string | null, bucketSeconds: number): string {
    if (!value) return 'no-time';
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return 'invalid-time';
    return String(Math.round(parsed / (bucketSeconds * 1000)));
  }
}
