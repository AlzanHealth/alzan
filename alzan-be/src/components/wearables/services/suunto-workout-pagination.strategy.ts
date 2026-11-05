/** Offset pagination documented by Suunto Workout API v3 (List workouts). */
export interface SuuntoWorkoutPaginationStrategy {
  buildRequest(since: string, until: string, offset: number): Record<string, string>;
  isComplete(returnedRows: number): boolean;
}

export class OffsetWorkoutPaginationStrategy implements SuuntoWorkoutPaginationStrategy {
  public constructor(private readonly pageSize: number) {}

  public buildRequest(since: string, until: string, offset: number): Record<string, string> {
    return {
      since,
      until,
      limit: String(this.pageSize),
      offset: String(offset),
      'filter-by-modification-time': 'false',
    };
  }

  public isComplete(returnedRows: number): boolean {
    return returnedRows < this.pageSize;
  }
}
