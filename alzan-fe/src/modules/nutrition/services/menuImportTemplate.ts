import {
  MENU_IMPORT_MAX_DAYS,
  MENU_IMPORT_MAX_TOTAL_INGREDIENTS,
  MENU_IMPORT_MAX_UNIQUE_INGREDIENTS,
} from './menuImportContract';

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

export const MENU_IMPORT_PROMPT = `Convierte el documento de nutrición adjunto en un JSON para importarlo completo en Alzan.

Si la conversión puede completarse sin bloqueos, devuelve únicamente un JSON válido, sin markdown ni comentarios, siguiendo exactamente el formato alzan-menu-plan v1.

ARCHIVOS DE REFERENCIA
- El documento adjunto que contiene el plan de nutrición es la fuente de verdad del menú (normalmente se llama Plan_Nutricion.docx, pero el nombre puede variar). Identifícalo por su contenido y léelo completo, incluidas sus tablas, recetas, cantidades, fechas y notas de contexto.
- El CSV adjunto contiene el catálogo actualizado de ingredientes. Úsalo únicamente para resolver el nombre canónico del ingrediente y comprobar que existe; no lo uses para rediseñar el menú.
- Si también hay un documento con un plan de entrenamiento, ignóralo al construir este JSON: pertenece al importador de entrenamiento.

FIDELIDAD AL DOCUMENTO
- Adapta el documento al esquema JSON; no diseñes otro menú.
- Conserva exactamente las fechas, los días, el orden de las comidas, los nombres de las comidas, los ingredientes y sus cantidades del documento.
- No optimices calorías o macronutrientes, no corrijas cantidades, no sustituyas alimentos, no mezcles recetas, no elimines comidas y no añadas ingredientes que no aparezcan en el documento.
- Usa las recetas detalladas del documento para expandir referencias como R01 o R34. No uses una lista de la compra como si fuera una comida.
- Convierte una unidad a gramos solo cuando la equivalencia esté expresamente indicada en el documento o en el CSV. Si no se puede convertir sin suponer, detén la conversión y devuelve un informe de bloqueo en vez de inventar una cantidad.
- Si el documento ofrece alternativas sin indicar cuál se debe usar, no elijas arbitrariamente: informa del conflicto para que se pueda resolver antes de importar.
- Si un ingrediente no existe en el CSV o hay más de una coincidencia posible, informa del nombre y la fecha/comida afectada; no lo sustituyas ni lo inventes.

REGLAS DEL CALENDARIO
- Usa una entrada en days por cada fecha, en formato YYYY-MM-DD.
- Incluye weekday en cada día usando lunes, martes, miércoles, jueves, viernes, sábado o domingo.
- weekday debe coincidir con date; no inventes fechas ni dupliques días.
- El formato admite hasta ${MENU_IMPORT_MAX_DAYS} días por documento. Si el periodo es mayor, divídelo en documentos consecutivos.
- Incluye todos los días del periodo solicitado; no omitas fechas salvo que el usuario lo pida expresamente.

REGLAS NUTRICIONALES
- Mantén el número de comidas que aparece en el documento; no generes comidas adicionales por defecto.
- Usa únicamente estos meal_type según corresponda: breakfast, almuerzo, lunch, merienda, dinner y snack. Almuerzo representa la media mañana; lunch representa la comida principal.
- Incluye solo name y quantity_g en cada ingrediente; la aplicación calcula calorías y macronutrientes.
- Expresa las cantidades en gramos. Aclara en el nombre si el alimento está cocido, en crudo, escurrido o listo para consumir.
- Usa nombres de ingredientes sencillos y reales que puedan existir en el catálogo de Alzan; evita marcas, recetas generales y cantidades vagas como “al gusto”.
- Reutiliza nombres cuando sea el mismo alimento y no superes ${MENU_IMPORT_MAX_UNIQUE_INGREDIENTS} nombres de ingredientes distintos por documento.
- No superes ${MENU_IMPORT_MAX_TOTAL_INGREDIENTS} entradas de ingredientes en total por documento.
- No inventes calorías, proteínas, hidratos ni grasas en el JSON.
- No recalcules ni ajustes las raciones para alcanzar un objetivo nutricional: conserva las cantidades del documento.
- No conviertas hidratación, suplementos, alcohol o recomendaciones médicas en ingredientes salvo que aparezcan explícitamente como parte de una comida con cantidad importable.

VALIDACIÓN FINAL
- Comprueba que cada día está entre las fechas solicitadas.
- Comprueba que weekday coincide con date.
- Comprueba que cada comida tiene al menos un ingrediente y que cada quantity_g es un número positivo.
- Si no hay bloqueos, devuelve solo el JSON siguiendo esta plantilla. Si hay bloqueos, devuelve solo el informe de bloqueos y no un JSON incompleto:

PLANTILLA JSON
${MENU_IMPORT_TEMPLATE}`;

export const MENU_IMPORT_CLIPBOARD_TEXT = `${MENU_IMPORT_PROMPT}\n`;
