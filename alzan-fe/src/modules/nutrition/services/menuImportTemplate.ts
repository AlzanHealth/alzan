import {
  MENU_IMPORT_MAX_DAYS,
  MENU_IMPORT_MAX_TOTAL_INGREDIENTS,
  MENU_IMPORT_MAX_UNIQUE_INGREDIENTS,
} from './menuImportContract';
import { MENU_IMPORT_JSON_OUTPUT_RULES } from './menuImportPromptRules';

export const MENU_IMPORT_TEMPLATE = `{
  "format": "alzan-menu-plan",
  "version": 1,
  "menu_name": "{{NOMBRE_DEL_MENU}}",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "weekday": "lunes",
      "meals": [
        {
          "meal_type": "breakfast",
          "name": "{{NOMBRE_DE_LA_COMIDA}}",
          "ingredients": [
            {
              "name": "{{NOMBRE_DEL_INGREDIENTE}}",
              "quantity_g": 100
            }
          ]
        }
      ]
    }
  ]
}
`;

export const MENU_IMPORT_PROMPT = `Convierte el DOCX de nutrición adjunto en un JSON alzan-menu-plan v1 listo para importar.

ARCHIVOS
- Usa como fuente principal el DOCX que contiene el plan de nutrición y léelo completo, aunque tenga otro nombre.
- Si también hay un DOCX de entrenamiento o un CSV de ejercicios, ignóralos por completo. No bloquees por la ausencia de un DOCX de entrenamiento, exercises_rows o cualquier otro archivo que no sea necesario para nutrición.
- Si se adjunta un CSV de ingredientes (distinto de un CSV de ejercicios), úsalo únicamente como catálogo de nombres: cuando exista una coincidencia segura, copia exactamente el valor name_es de la fila correspondiente. No inventes nombres ni uses el CSV de ejercicios para resolver ingredientes.

SALIDA
- Devuelve únicamente JSON válido, sin markdown, comentarios ni texto adicional.
- La raíz solo contiene format, version, menu_name y days.
- Cada day solo contiene date, weekday y meals. Cada meal solo contiene meal_type, name e ingredients.
- Cada ingredient solo contiene name y quantity_g. No añadas IDs, categorías, unidades, calorías, macros ni recetas.
- Fechas YYYY-MM-DD, weekday correcto, gramos como números positivos y máximo de ${MENU_IMPORT_MAX_DAYS} días.

PROCESAMIENTO DÍA A DÍA
- Usa como fuente de asignación únicamente los bloques del menú que tienen una fecha. Ignora el resumen nutricional, objetivos, macros, hidratación, recomendaciones y listas de la compra.
- Si el DOCX contiene referencias de receta (por ejemplo R01, R02 o R35), úsalas solo para localizar la receta completa y sus cantidades explícitas.
- Nunca escribas códigos de receta como R01, R02 o R35 en la salida. Usa el nombre real de la comida y sus ingredientes, con los gramos exactos que figuren en la receta.
- Procesa todos los días del DOCX en orden cronológico y crea un día completo por fecha.
- days debe contener exactamente una entrada por cada fecha del plan, sin omitir días, agrupar fechas ni devolver solo el primer día.
- En cada fecha incluye todas las comidas que el DOCX asigna a ese día, en el mismo orden y sin trasladar comidas desde otra fecha.
- Antes de responder, comprueba que el número de días y las fechas del JSON coinciden con el plan fuente.

FIDELIDAD
- Conserva fechas, días, orden, comidas, nombres, ingredientes y cantidades del DOCX.
- No diseñes, optimices, corrijas raciones, mezcles recetas ni añadas comidas o ingredientes.
- Expande las recetas del documento; no conviertas una lista de la compra en una comida.
- Conserva el texto de alternativas y condiciones en el nombre de la comida solo cuando forme parte de la asignación del día; no combines alternativas ni elijas una por tu cuenta.
- Convierte unidades a gramos solo con una equivalencia explícita del DOCX. Para intervalos, usa un único número únicamente si el DOCX fija cuál corresponde a ese día; no uses medias, extremos ni estimaciones.
- Si una comida no tiene una opción o cantidad única explícita y no puede representarse con quantity_g sin inventar, no fabriques datos: devuelve un informe de bloqueo que indique la fecha y la comida concretas. No bloquees todo el menú por documentos de entrenamiento irrelevantes.

INGREDIENTES
- Conserva el nombre del ingrediente tal como aparece en el documento y no inventes alimentos distintos. Acepta diferencias de ortografía, acentos, singular/plural y sinónimos sin cambiar la identidad del alimento.
- Si el CSV de ingredientes contiene una coincidencia segura, prioriza su nombre canónico exacto en name_es sin cambiar la identidad ni la cantidad del ingrediente.
- Conserva siempre la cantidad original.
- Mantén meal_type entre breakfast, almuerzo, lunch, merienda, dinner y snack.
- No inventes nombres, IDs, calorías ni macronutrientes. No superes ${MENU_IMPORT_MAX_TOTAL_INGREDIENTS} ingredientes totales ni ${MENU_IMPORT_MAX_UNIQUE_INGREDIENTS} nombres distintos.

VALIDACIÓN
- Comprueba fechas, weekday, comidas con ingredientes, cantidades positivas y propiedades permitidas.
${MENU_IMPORT_JSON_OUTPUT_RULES}
- Si todo es válido, devuelve solo el JSON siguiendo esta plantilla. Devuelve un informe de bloqueo solo cuando falte el DOCX de nutrición o una fecha/comida no pueda representarse fielmente con el contrato; nunca bloquees por la ausencia de archivos de entrenamiento:

PLANTILLA JSON
${MENU_IMPORT_TEMPLATE}`;

export const MENU_IMPORT_CLIPBOARD_TEXT = `${MENU_IMPORT_PROMPT}\n`;
