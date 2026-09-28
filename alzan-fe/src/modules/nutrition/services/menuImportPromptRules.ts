import {
  MENU_IMPORT_MAX_DAYS,
  MENU_IMPORT_MAX_TOTAL_INGREDIENTS,
  MENU_IMPORT_MAX_UNIQUE_INGREDIENTS,
} from './menuImportContract';

export const MENU_IMPORT_JSON_OUTPUT_RULES = `REGLAS DE SERIALIZACIÓN OBLIGATORIAS
- Devuelve únicamente un objeto JSON válido, sin markdown, bloques de código, comentarios ni texto adicional.
- Usa exclusivamente comillas dobles ASCII ("), nunca comillas tipográficas, y no escapes guiones bajos.
- La raíz solo contiene format, version, menu_name y days.
- Cada day solo contiene date, weekday y meals.
- Cada meal solo contiene meal_type, name e ingredients.
- Cada ingredient solo contiene name y quantity_g.
- Las fechas deben ser reales y usar YYYY-MM-DD; weekday debe coincidir con date.
- meal_type solo puede ser breakfast, almuerzo, lunch, merienda, dinner o snack; unspecified solo se permite si existe una única comida.
- quantity_g siempre es un número JSON finito entre 0.1 y 10000, sin unidades ni texto.
- Nunca uses null, NaN, Infinity, strings numéricos, porcentajes, rangos, fracciones, símbolos de unidad ni expresiones como "al gusto" en quantity_g.
- No conviertas una cantidad ausente en 0. Si falta una cantidad y no puede estimarse de forma segura a partir de una porción visible, no generes un ingrediente inventado.
- Respeta como máximo ${MENU_IMPORT_MAX_DAYS} días, 10 comidas por día, 30 ingredientes por comida, ${MENU_IMPORT_MAX_TOTAL_INGREDIENTS} ingredientes totales y ${MENU_IMPORT_MAX_UNIQUE_INGREDIENTS} nombres únicos.
- Antes de responder comprueba: JSON completo y parseable, sin markdown; claves exactas; fechas reales y sin duplicados; weekday correcto; cada comida con ingredientes; cantidades convertidas a gramos; límites respetados; y ningún dato añadido por suposición.
- Si no puedes cumplir una regla, no devuelvas un JSON parcial ni campos inventados. Explica el bloqueo fuera del JSON para que Alzan no lo importe.`;
