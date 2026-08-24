import { MENU_IMPORT_MAX_DAYS, MENU_IMPORT_MAX_TOTAL_INGREDIENTS } from './menuImportContract';
import { MENU_IMPORT_TEMPLATE } from './menuImportTemplate';

export type MenuImportAiPromptOptions = {
  currentDate: string;
};

export const buildMenuImportAiPrompt = ({
  currentDate,
}: MenuImportAiPromptOptions): string => `Convierte comidas o menús en un JSON alzan-menu-plan v1 listo para importar.

CONTEXTO
- La fecha local actual es ${currentDate}.
- Espera a que el usuario escriba una comida, adjunte una fotografía, pegue una receta o aporte un menú completo.

ENTRADAS POSIBLES
- Una única comida escrita con o sin cantidades.
- Una fotografía de una comida. Identifica únicamente los alimentos visibles o descritos y aproxima sus pesos según la porción visible.
- Una receta o un documento con una o varias comidas.
- Un menú completo y extenso de hasta ${MENU_IMPORT_MAX_DAYS} días.

INGREDIENTES Y CANTIDADES
- Para cada ingrediente usa el nombre más claro y común en español. No inventes alimentos ni IDs.
- Conserva toda cantidad explícita. Si no hay cantidad, estima una cantidad razonable en gramos.
- No añadas alimentos que no estén visibles, escritos o incluidos en la receta.
- Si no puedes identificar con seguridad un alimento, devuelve un informe de bloqueo que identifique el ingrediente; no inventes una coincidencia.

FECHAS Y TIPO DE COMIDA
- Si la entrada contiene exactamente una comida y no indica fecha, usa ${currentDate}.
- Si contiene exactamente una comida y no indica hora ni tipo, usa meal_type: "unspecified". Alzan pedirá al usuario que elija el tipo antes de importar.
- Si hay una hora o un tipo inequívoco, usa uno de estos valores: breakfast, almuerzo, lunch, merienda, dinner o snack.
- Si hay varias comidas, cada una necesita fecha y una hora o un tipo de comida inequívoco. No uses la fecha actual ni unspecified para completar un menú múltiple.
- Si faltan esos datos en varias comidas, no generes JSON: devuelve un informe de bloqueo breve solicitando solo las fechas, horas o tipos ausentes.

FIDELIDAD
- Conserva fechas, orden, nombres de comidas, ingredientes, alternativas y cantidades explícitas.
- No optimices el menú ni añadas comidas.
- Un menú puede contener como máximo ${MENU_IMPORT_MAX_TOTAL_INGREDIENTS} ingredientes totales.

SALIDA
- Si los datos son suficientes, responde únicamente con JSON válido, sin markdown ni comentarios.
- La raíz solo contiene format, version, menu_name y days.
- Cada day solo contiene date, weekday y meals.
- Cada meal solo contiene meal_type, name e ingredients.
- Cada ingredient solo contiene name y quantity_g.
- Los gramos son números JSON positivos, nunca texto con unidades.

PLANTILLA
${MENU_IMPORT_TEMPLATE.trim()}

PASOS PARA EL USUARIO
1. Escribe tu comida o menú, o adjunta una foto o documento.
2. Envía el mensaje manualmente.
`;
