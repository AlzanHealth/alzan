import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { createDailyProgressHtml } from './dailyProgressPdfView';
import type { DailyProgress } from './dailyProgressPdf';

const start = new Date('2026-01-01T12:00:00.000Z');
const days: DailyProgress[] = Array.from({ length: 93 }, (_, dayIndex) => {
  const date = format(addDays(start, dayIndex), 'yyyy-MM-dd');
  const strengthSessionId = `${date}-strength`;
  const status = dayIndex % 3 === 0 ? 'normal' : dayIndex % 3 === 1 ? 'over_target' : 'vacation';
  const isSparseDay = dayIndex === 0;

  return {
    date,
    status,
    steps: isSparseDay ? null : dayIndex * 100,
    weights: isSparseDay ? [] : [{ measured_at: `${date}T07:00:00.000Z`, weight_kg: 70 + dayIndex / 10 }],
    measurements: isSparseDay
      ? []
      : [{ measured_at: `${date}T07:05:00.000Z`, measurement_type: 'waist', value_cm: 80 + dayIndex / 10 }],
    sessions: isSparseDay
      ? []
      : [
          {
            id: strengthSessionId,
            start_time: `${date}T10:00:00.000Z`,
            name: `Fuerza ${dayIndex} — sesión con nombre largo para probar ajuste de texto`,
            sport_type: 'strength',
            notes: `Nota de entrenamiento ${dayIndex}: ${'contexto extenso '.repeat(8)}`,
            duration_s: 3600,
            distance_m: null,
            avg_speed_m_per_s: null,
          },
          {
            id: `${date}-run`,
            start_time: `${date}T18:00:00.000Z`,
            name: `Carrera ${dayIndex}`,
            sport_type: 'running',
            notes: null,
            duration_s: 1800,
            distance_m: 5000,
            avg_speed_m_per_s: null,
          },
        ],
    sets: isSparseDay
      ? []
      : Array.from({ length: 12 }, (_, setIndex) => ({
          session_id: strengthSessionId,
          exercise_id: `exercise-${setIndex % 4}`,
          exercise_name: `Ejercicio ${setIndex % 4} con un nombre suficientemente largo`,
          set_number: setIndex + 1,
          reps: 8 + (setIndex % 5),
          weight_kg: setIndex === 0 ? 0 : 20 + setIndex,
          distance_m: null,
          duration_s: null,
        })),
    meals: isSparseDay
      ? []
      : Array.from({ length: 4 }, (_, mealIndex) => ({
          id: `${date}-meal-${mealIndex}`,
          date,
          meal_type: (['breakfast', 'lunch', 'snack', 'dinner'] as const)[mealIndex],
          name: `Plato ${dayIndex}-${mealIndex}`,
          notes: null,
        })),
    items: isSparseDay
      ? []
      : Array.from({ length: 32 }, (_, itemIndex) => ({
          meal_log_id: `${date}-meal-${Math.floor(itemIndex / 8)}`,
          name: `Ingrediente ${dayIndex}-${itemIndex}`,
          quantity_g: 50 + itemIndex,
          data_quality: itemIndex % 2 === 0 ? 'manual' : 'automatic',
          origin: itemIndex % 2 === 0 ? 'user' : 'imported',
        })),
    notes: isSparseDay
      ? []
      : [
          `Nota del día ${dayIndex}: ${'detalle clínico/de contexto '.repeat(8)}`,
          ...(dayIndex === 55 ? [`${'cadena_sin_espacios_'.repeat(30)}`] : []),
        ],
  };
});

const messages: Record<string, string> = {
  'progressPdf.noData': 'Sin dato',
  'progressPdf.steps': 'pasos',
  'progressPdf.reps': 'repeticiones',
  'progressPdf.loadNotRecorded': 'Carga no anotada',
  'progressPdf.noExercisesRecorded': 'Sin ejercicios detallados registrados',
  'progressPdf.unknownExercise': 'Ejercicio desconocido',
  'progressPdf.automatic': 'automático',
  'progressPdf.manual': 'manual',
  'progressPdf.normalLegend': 'Normal: la comida anotada es la ingesta completa del día.',
  'progressPdf.overTargetLegend':
    'Comí peor: el registro sigue siendo la ingesta completa; señala más cantidad, elecciones más calóricas, azúcar o alcohol. No implica comida sin registrar.',
  'progressPdf.vacationLegend': 'Vacaciones: lo anotado se consumió, pero puede haber extras que no se registraron.',
  'progressPdf.overTarget': 'Comí peor',
  'progressPdf.vacation': 'Vacaciones',
  'progressPdf.markerLegend': 'Significado del marcador de comida',
  'progressPdf.weightMeasurements': 'Peso y medidas',
  'progressPdf.activity': 'Actividad',
  'progressPdf.training': 'Entrenamiento realizado',
  'progressPdf.food': 'Comida registrada',
  'progressPdf.notes': 'Notas',
  'progressPdf.noTrainingRecorded': 'Sin entrenamiento registrado',
  'progressPdf.noFoodRecorded': 'Sin comida registrada',
  'progressPdf.noIngredients': 'Sin ingredientes registrados',
  'progressPdf.title': 'Registro diario de progreso',
  'progressPdf.daysWithFood': 'días con comida registrada',
  'progressPdf.trainingDays': 'días de entrenamiento',
  'progressPdf.markedDays': 'días marcados',
  'progressPdf.context': 'Contexto',
  'progressPdf.noTrendData': 'No hay suficientes medidas para comparar',
  'progressPdf.periodClose': 'Cierre del periodo',
  'progressPdf.weightTrend': 'Tendencia de peso',
  'progressPdf.daysWithoutFood': 'Días sin comida registrada',
  'progressPdf.none': 'Ninguno',
  'health.waist': 'Cintura',
};

const html = createDailyProgressHtml([...days].reverse(), key => messages[key] ?? key, es);
const cardDates = Array.from(html.matchAll(/<h3>([^<]+)<\/h3>/g), match => match[1]);
const firstDate = format(start, 'EEEE, d MMMM yyyy', { locale: es });
const lastDate = format(addDays(start, days.length - 1), 'EEEE, d MMMM yyyy', { locale: es });

assert.equal(cardDates.length, 93, 'every day in the maximum export range should get exactly one daily card');
assert.equal(cardDates[0], firstDate, 'daily cards must be chronological even when input rows arrive reversed');
assert.equal(cardDates.at(-1), lastDate);
assert.equal((html.match(/class="week-section"/g) ?? []).length, 14, 'the range crosses 14 Monday-based weeks');
assert.equal((html.match(/class="day-card/g) ?? []).length, 93);
assert.equal((html.match(/class="day-card over-target"/g) ?? []).length, 31);
assert.equal((html.match(/class="day-card vacation"/g) ?? []).length, 31);
assert.equal((html.match(/class="day-card "/g) ?? []).length, 31, 'normal days use the unmarked card class');
assert.match(html, /Normal: la comida anotada es la ingesta completa del día\./);
assert.match(html, /Comí peor: el registro sigue siendo la ingesta completa/);
assert.match(html, /Vacaciones: lo anotado se consumió, pero puede haber extras/);
assert.equal(
  (html.match(/Normal: la comida anotada/g) ?? []).length,
  32,
  'normal label appears in its legend and every normal card',
);
assert.equal(
  (html.match(/Comí peor: el registro/g) ?? []).length,
  32,
  'over-target label appears in its legend and every marked card',
);
assert.equal(
  (html.match(/Vacaciones: lo anotado/g) ?? []).length,
  32,
  'vacation label appears in its legend and every vacation card',
);
const firstOverTargetStart = html.indexOf('<article class="day-card over-target">');
const firstOverTargetEnd = html.indexOf('</article>', firstOverTargetStart);
const firstOverTargetCard = html.slice(firstOverTargetStart, firstOverTargetEnd);
assert.equal(
  (firstOverTargetCard.match(/<li>Ingrediente 1-\d+/g) ?? []).length,
  32,
  'the over-target marker must not create unlogged food or duplicate logged items',
);
assert.match(firstOverTargetCard, /No implica comida sin registrar/);
assert.match(html, /Vacaciones: lo anotado se consumió, pero puede haber extras que no se registraron\./);
assert.match(html, /Carga no anotada/);
assert.match(html, /Sin dato/);
assert.match(html, /Ingrediente 55-31, 81 g \(automático\)/);
assert.match(html, /Ingrediente 92-31, 81 g \(automático\)/);
assert.match(html, /Nota del día 92/);
assert.match(html, /5000|5\.00 km/);
assert.match(html, /\.week-summary[^}]*overflow-wrap:\s*anywhere/);
assert.match(html, /\.week-summary[^}]*break-after:\s*avoid/);

if (process.env.ALZAN_PDF_STRESS_HTML_PATH) {
  writeFileSync(process.env.ALZAN_PDF_STRESS_HTML_PATH, html);
}
