import { MENU_IMPORT_MAX_DAYS, MENU_IMPORT_MAX_TOTAL_INGREDIENTS } from './menuImportContract';
import { MENU_IMPORT_TEMPLATE } from './menuImportTemplate';
import { MENU_IMPORT_JSON_OUTPUT_RULES } from './menuImportPromptRules';

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
- Conserva toda cantidad explícita. Solo estima una cantidad cuando se trate de una foto o porción visible y la estimación sea razonablemente clara; en documentos y menús escritos no inventes cantidades ausentes.
- El contrato solo admite gramos. Si aparece ml, l, unidades, piezas, cucharadas, cucharaditas, tazas, vasos u otra medida, busca una equivalencia fiable en internet o en una base de datos nutricional reconocida y conviértela a gramos.
- Para líquidos o productos con densidad específica, usa la densidad del alimento o de la marca cuando esté disponible; no supongas que 1 ml equivale siempre a 1 g. Si la equivalencia no es suficientemente fiable, devuelve un informe de bloqueo en vez de inventarla.
- No uses una equivalencia de otra marca cuando la entrada identifica una marca concreta. El JSON final debe contener solo el número en gramos, sin unidades, fuentes ni propiedades adicionales.
- No añadas alimentos que no estén visibles, escritos o incluidos en la receta.
- Si no puedes identificar con seguridad un alimento, devuelve un informe de bloqueo que identifique el ingrediente; no inventes una coincidencia.
- Distingue peso en crudo, cocido, escurrido y consumido. No cambies de estado ni apliques factores de cocción salvo que el documento o una fuente fiable lo indique claramente.
- No confundas cantidad de envase con cantidad consumida. Si el documento dice "1 yogur", busca el peso neto solo si la marca o el tamaño están identificados; si no, bloquea esa equivalencia.

CRITERIO CULINARIO
- Desglosa solo un nivel los platos compuestos reconocibles en sus componentes principales: por ejemplo, paella en arroz, proteínas, verduras y aceite; croqueta en relleno, bechamel, rebozado y aceite absorbido; o tarta en su base y relleno.
- No desgloses alimentos simples o productos habituales como pan, queso, yogur, jamón, galletas, cereales, pasta cocida, arroz cocido, conservas, cremas, salsas, aliños o condimentos.
- Mantén ajoaceite, mayonesa, pesto, bechamel y cualquier otra salsa como un ingrediente independiente. Nunca desmontes una salsa salvo que el usuario lo pida expresamente.
- El nombre del plato puede conservarse en meal.name, pero no debe aparecer como ingrediente si es una preparación compuesta que has desglosado.
- Puedes inferir los componentes esenciales de un plato conocido, pero no ingredientes opcionales, guarniciones o acompañamientos que no estén indicados o visibles.
- Las cantidades representan lo consumido; reparte una ración estimada entre sus componentes y combina ingredientes idénticos dentro de la misma comida sumando sus gramos.
- No descompongas pan, agua, sal o especias nutricionalmente insignificantes en materias primas; en frituras estima solo el aceite absorbido.

FECHAS Y TIPO DE COMIDA
- Si la entrada contiene exactamente una comida y no indica fecha, usa ${currentDate}.
- Si contiene exactamente una comida y no indica hora ni tipo, usa meal_type: "unspecified". Alzan pedirá al usuario que elija el tipo antes de importar.
- Si hay una hora o un tipo inequívoco, usa uno de estos valores: breakfast, almuerzo, lunch, merienda, dinner o snack.
- Si hay varias comidas, cada una necesita fecha y una hora o un tipo de comida inequívoco. No uses la fecha actual ni unspecified para completar un menú múltiple.
- Si faltan esos datos en varias comidas, no generes JSON: devuelve un informe de bloqueo breve solicitando solo las fechas, horas o tipos ausentes.

FIDELIDAD
- Conserva fechas, orden, nombres de comidas, ingredientes, alternativas y cantidades explícitas.
- No optimices el menú ni añadas comidas.
- No dupliques comidas, no las traslades de fecha y no conviertas recomendaciones, objetivos, macros o listas de compra en ingredientes.
- Un menú puede contener como máximo ${MENU_IMPORT_MAX_TOTAL_INGREDIENTS} ingredientes totales.

SALIDA
${MENU_IMPORT_JSON_OUTPUT_RULES}
- Los nombres deben ser breves y estar dentro de los límites del contrato; no añadas propiedades adicionales.

PLANTILLA
${MENU_IMPORT_TEMPLATE.trim()}

PASOS PARA EL USUARIO
1. Escribe tu comida o menú, o adjunta una foto o documento.
2. Envía el mensaje manualmente.
`;
