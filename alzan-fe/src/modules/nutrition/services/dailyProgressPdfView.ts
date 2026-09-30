import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import type { Locale } from 'date-fns';
import type { TranslationKey } from '../../../i18n/locales/en';
import type { DailyProgress } from './dailyProgressPdf';

export type ProgressPdfTranslator = (key: TranslationKey) => string;
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const numeric = (value: number | null | undefined, unit: string, t: ProgressPdfTranslator) =>
  value == null || !Number.isFinite(value) ? t('progressPdf.noData') : `${value} ${unit}`;
const list = (lines: string[], emptyText: string) =>
  lines.length
    ? `<ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : `<p class="empty">${escapeHtml(emptyText)}</p>`;
const weekKey = (date: string) => format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd');

const renderDailyCard = (day: DailyProgress, t: ProgressPdfTranslator, locale: Locale): string => {
  const weightLines = day.weights.map(
    row => `${format(parseISO(row.measured_at), 'HH:mm', { locale })}: ${numeric(row.weight_kg, 'kg', t)}`,
  );
  const measurementLines = day.measurements.map(row => {
    const label = t(`health.${row.measurement_type}` as TranslationKey);
    return `${label}: ${numeric(row.value_cm, 'cm', t)}`;
  });
  const activityLines = [day.steps == null ? null : `${day.steps} ${t('progressPdf.steps')}`].filter(
    (line): line is string => Boolean(line),
  );
  const trainingLines = day.sessions.map(session => {
    const duration = session.duration_s == null ? null : `${Math.round(session.duration_s / 60)} min`;
    const distance = session.distance_m == null ? null : `${(session.distance_m / 1000).toFixed(2)} km`;
    const pace =
      session.distance_m && session.duration_s && session.distance_m > 0
        ? `${(session.duration_s / (session.distance_m / 1000) / 60).toFixed(2)} min/km`
        : null;
    const sessionSets = day.sets.filter(set => set.session_id === session.id);
    const exerciseNames = Array.from(
      new Set(sessionSets.map(set => set.exercise_name).filter((name): name is string => Boolean(name))),
    );
    const setDetails = sessionSets.map(set => {
      const load = set.weight_kg === 0 ? t('progressPdf.loadNotRecorded') : numeric(set.weight_kg, 'kg', t);
      const details = [`${set.set_number}: ${set.reps} ${t('progressPdf.reps')}`, load];
      if (set.distance_m != null) details.push(numeric(set.distance_m / 1000, 'km', t));
      if (set.duration_s != null) details.push(numeric(set.duration_s / 60, 'min', t));
      return `${set.exercise_name ?? t('progressPdf.unknownExercise')} — ${details.join(' · ')}`;
    });
    return [
      session.name || session.sport_type,
      exerciseNames.length === 0 && session.sport_type === 'strength' ? t('progressPdf.noExercisesRecorded') : null,
      ...[distance, duration, pace],
      ...setDetails,
    ]
      .filter(Boolean)
      .join(' — ');
  });
  const foodLines = day.meals.flatMap(meal => {
    const items = day.items.filter(item => item.meal_log_id === meal.id);
    const title = [meal.meal_type, meal.name].filter(Boolean).join(' — ');
    if (items.length === 0) return [`${title}: ${t('progressPdf.noIngredients')}`];
    return [`${title}:`].concat(
      items.map(item => {
        const quality = item.data_quality === 'automatic' ? t('progressPdf.automatic') : t('progressPdf.manual');
        return `${item.name}, ${item.quantity_g} g (${quality})`;
      }),
    );
  });
  const statusText =
    day.status === 'vacation'
      ? t('progressPdf.vacationLegend')
      : day.status === 'over_target'
        ? t('progressPdf.overTargetLegend')
        : t('progressPdf.normalLegend');
  const statusClass = day.status === 'vacation' ? 'vacation' : day.status === 'over_target' ? 'over-target' : '';

  return `<article class="day-card ${statusClass}">
    <header><h3>${escapeHtml(format(parseISO(day.date), 'EEEE, d MMMM yyyy', { locale }))}</h3><span>${escapeHtml(statusText)}</span></header>
    <div class="day-grid">
      <section><h4>${escapeHtml(t('progressPdf.weightMeasurements'))}</h4>${list([...weightLines, ...measurementLines], t('progressPdf.noData'))}</section>
      <section><h4>${escapeHtml(t('progressPdf.activity'))}</h4>${list(activityLines, t('progressPdf.noData'))}</section>
      <section><h4>${escapeHtml(t('progressPdf.training'))}</h4>${list(trainingLines, t('progressPdf.noTrainingRecorded'))}</section>
      <section><h4>${escapeHtml(t('progressPdf.food'))}</h4>${list(foodLines, t('progressPdf.noFoodRecorded'))}</section>
      <section><h4>${escapeHtml(t('progressPdf.notes'))}</h4>${list(day.notes, t('progressPdf.noData'))}</section>
    </div>
  </article>`;
};

export const createDailyProgressHtml = (days: DailyProgress[], t: ProgressPdfTranslator, locale: Locale): string => {
  const groupedByWeek = new Map<string, DailyProgress[]>();
  days.forEach(day => {
    const key = weekKey(day.date);
    const group = groupedByWeek.get(key) ?? [];
    group.push(day);
    groupedByWeek.set(key, group);
  });
  const weeklySections = Array.from(groupedByWeek, ([startDate, weekDays]) => {
    const trainingCount = weekDays.filter(day => day.sessions.length > 0).length;
    const markedCount = weekDays.filter(day => day.status !== 'normal').length;
    const loggedDays = weekDays.filter(day => day.meals.length > 0).length;
    const contextNotes = Array.from(new Set(weekDays.flatMap(day => day.notes))).slice(0, 2);
    const endDate = format(addDays(parseISO(startDate), 6), 'd MMM yyyy', { locale });
    const context = contextNotes.length
      ? `<p>${escapeHtml(`${t('progressPdf.context')}: ${contextNotes.join(' · ')}`)}</p>`
      : '';
    return `<section class="week-section"><div class="week-summary"><h2>${escapeHtml(format(parseISO(startDate), 'd MMM', { locale }))} – ${escapeHtml(endDate)}</h2><p>${escapeHtml(`${loggedDays}/${weekDays.length} ${t('progressPdf.daysWithFood')} · ${trainingCount} ${t('progressPdf.trainingDays')} · ${markedCount} ${t('progressPdf.markedDays')}`)}</p>${context}</div>${weekDays.map(day => renderDailyCard(day, t, locale)).join('')}</section>`;
  }).join('');
  const weights = days
    .flatMap(day => day.weights.map(row => ({ date: row.measured_at, value: row.weight_kg })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightTrend =
    weights.length > 1
      ? `${weights[0].value} kg → ${weights[weights.length - 1].value} kg`
      : t('progressPdf.noTrendData');
  const missingFoodDates = days
    .filter(day => day.meals.length === 0 && day.status !== 'vacation')
    .map(day => format(parseISO(day.date), 'd MMM yyyy', { locale }));
  const markedDates = days
    .filter(day => day.status !== 'normal')
    .map(
      day =>
        `${format(parseISO(day.date), 'd MMM yyyy', { locale })}: ${day.status === 'vacation' ? t('progressPdf.vacation') : t('progressPdf.overTarget')}`,
    );
  const measurementsByType = new Map<string, DailyProgress['measurements']>();
  days.forEach(day =>
    day.measurements.forEach(measurement => {
      const rows = measurementsByType.get(measurement.measurement_type) ?? [];
      rows.push(measurement);
      measurementsByType.set(measurement.measurement_type, rows);
    }),
  );
  const measurementTrends = Array.from(measurementsByType, ([type, rows]) => {
    const ordered = [...rows].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const label = t(`health.${type}` as TranslationKey);
    return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(`${ordered[0].value_cm} cm → ${ordered[ordered.length - 1].value_cm} cm`)}</td></tr>`;
  }).join('');

  return `<section class="daily-progress"><h1>${escapeHtml(t('progressPdf.title'))}</h1>
    <div class="status-legend"><h2>${escapeHtml(t('progressPdf.markerLegend'))}</h2><p>${escapeHtml(t('progressPdf.normalLegend'))}</p><p>${escapeHtml(t('progressPdf.overTargetLegend'))}</p><p>${escapeHtml(t('progressPdf.vacationLegend'))}</p></div>
    ${weeklySections}
    <section class="period-close"><h2>${escapeHtml(t('progressPdf.periodClose'))}</h2><table><tbody>
      <tr><th>${escapeHtml(t('progressPdf.weightTrend'))}</th><td>${escapeHtml(weightTrend)}</td></tr>
      ${measurementTrends}
      <tr><th>${escapeHtml(t('progressPdf.daysWithoutFood'))}</th><td>${escapeHtml(missingFoodDates.length ? missingFoodDates.join(', ') : t('progressPdf.none'))}</td></tr>
      <tr><th>${escapeHtml(t('progressPdf.markedDays'))}</th><td>${escapeHtml(markedDates.length ? markedDates.join(', ') : t('progressPdf.none'))}</td></tr>
    </tbody></table></section>
  </section>
  <style>
    .daily-progress{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#202124;padding:24px 0;page-break-before:always}
    .daily-progress h1{font-size:24px;margin:0 0 16px}.daily-progress h2{font-size:17px;margin:0 0 8px}
    .status-legend,.week-summary,.period-close{background:#f5f6f8;border-radius:10px;padding:14px;margin:12px 0}
    .status-legend p,.week-summary p{font-size:11px;margin:5px 0;color:#45484d}
    .day-card{border:1px solid #dfe1e5;border-left:4px solid #aeb4bd;border-radius:8px;margin:10px 0;padding:12px;break-inside:avoid}
    .day-card.over-target{border-left-color:#d97706}.day-card.vacation{border-left-color:#7c3aed}
    .day-card header{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.day-card h3{font-size:14px;margin:0;text-transform:capitalize}.day-card header span{font-size:10px;font-weight:600}
    .day-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.day-grid section{border-top:1px solid #eceef0;padding-top:6px;min-width:0}
    .day-grid h4{font-size:11px;margin:0 0 4px}.day-grid ul{margin:0;padding-left:16px;font-size:10px}.day-grid li{margin:2px 0;overflow-wrap:anywhere}.empty{font-size:10px;color:#858b93;margin:3px 0}
    .period-close table{width:100%;font-size:11px;border-collapse:collapse}.period-close th,.period-close td{text-align:left;vertical-align:top;padding:6px;border-bottom:1px solid #ddd}.period-close th{width:30%}
    @media print{.day-card,.week-summary,.status-legend,.period-close{break-inside:avoid}}
  </style>`;
};
