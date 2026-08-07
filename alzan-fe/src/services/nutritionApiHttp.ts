type NutritionApiHttpErrorInput = {
  status: number;
  url: string;
  body: string;
};

export class NutritionApiHttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor({ status, url, body }: NutritionApiHttpErrorInput) {
    super(`Error en API nutricional: ${status}`);
    this.name = 'NutritionApiHttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export function isProductNotFoundHttpError(error: unknown): error is NutritionApiHttpError {
  return error instanceof NutritionApiHttpError && error.status === 404;
}
