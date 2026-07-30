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

export const MENU_IMPORT_PROMPT = `Crea un menú nutricional para importar en Alzan.

Devuelve únicamente un JSON válido, sin markdown ni comentarios, siguiendo exactamente el formato alzan-menu-plan v1.

REGLAS DEL CALENDARIO
- Usa una entrada en days por cada fecha, en formato YYYY-MM-DD.
- Incluye weekday en cada día usando lunes, martes, miércoles, jueves, viernes, sábado o domingo.
- weekday debe coincidir con date; no inventes fechas ni dupliques días.
- El formato admite hasta 45 días por documento. Si el periodo es mayor, divídelo en documentos consecutivos.

REGLAS NUTRICIONALES
- Genera 4–5 comidas por día cuando el usuario no indique otra cosa.
- Usa meal_type breakfast, lunch, merienda, dinner o snack según corresponda.
- Incluye solo name y quantity_g en cada ingrediente; la aplicación calcula calorías y macronutrientes.
- Expresa las cantidades en gramos. Aclara en el nombre si el alimento está cocido, en crudo, escurrido o listo para consumir.
- Usa nombres de ingredientes sencillos y reales que puedan existir en el catálogo de Alzan; evita marcas, recetas generales y cantidades vagas como “al gusto”.
- No inventes calorías, proteínas, hidratos ni grasas en el JSON.
- Reparte la proteína en 4 tomas principales y ajusta los hidratos: más alrededor de series, sesiones controladas y tiradas largas; algo menos en descanso o rodajes suaves.
- Si el objetivo indicado es recomposición corporal, prioriza un déficit semanal pequeño y una proteína aproximada de 160–190 g/día cuando el perfil del usuario coincida con el caso real, sin recortar hidratos en los días de calidad, pierna o tirada larga.
- No conviertas hidratación, suplementos o recomendaciones médicas en ingredientes salvo que el usuario lo pida explícitamente.

VALIDACIÓN FINAL
- Comprueba que cada día está entre las fechas solicitadas.
- Comprueba que weekday coincide con date.
- Comprueba que cada comida tiene al menos un ingrediente y que cada quantity_g es un número positivo.
- Devuelve solo el JSON siguiendo esta plantilla:

PLANTILLA JSON
${MENU_IMPORT_TEMPLATE}`;

export const MENU_IMPORT_CLIPBOARD_TEXT = `${MENU_IMPORT_PROMPT}\n`;
