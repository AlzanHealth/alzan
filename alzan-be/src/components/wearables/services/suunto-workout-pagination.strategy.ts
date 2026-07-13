/**
 * Conservative workout-list strategy used until Suunto's private partner
 * contract confirms the endpoint pagination mechanism.
 */
export interface SuuntoWorkoutPaginationStrategy {
  buildRequest(since: string): Record<string, string>;
  isComplete(returnedRows: number): boolean;
}

export class UnverifiedSinglePageWorkoutPaginationStrategy implements SuuntoWorkoutPaginationStrategy {
  public constructor(private readonly pageSize: number) {}

  public buildRequest(since: string): Record<string, string> {
    return { since, limit: String(this.pageSize) };
  }

  public isComplete(returnedRows: number): boolean {
    return returnedRows < this.pageSize;
  }
}
