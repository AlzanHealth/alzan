import assert from 'node:assert/strict';
import { isProductNotFoundHttpError, NutritionApiHttpError } from './nutritionApiHttp';

const missingProduct = new NutritionApiHttpError({
  status: 404,
  url: 'https://world.openfoodfacts.org/api/v2/product/231626003623',
  body: '{"code":"0231626003623","status":0,"status_verbose":"product not found"}',
});
assert.equal(isProductNotFoundHttpError(missingProduct), true);

const serverFailure = new NutritionApiHttpError({
  status: 500,
  url: 'https://world.openfoodfacts.org/api/v2/product/231626003623',
  body: 'Internal Server Error',
});
assert.equal(isProductNotFoundHttpError(serverFailure), false);
assert.equal(isProductNotFoundHttpError(new TypeError('Failed to fetch')), false);

console.log('nutritionApi.spec.ts: all assertions passed');
