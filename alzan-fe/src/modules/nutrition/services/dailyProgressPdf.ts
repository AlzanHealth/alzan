import { addDays, eachDayOfInterval, format, parseISO, startOfWeek } from 'date-fns';
import { supabase } from '../../../lib/supabaseClient';
import { getDateFnsLocale } from '../../../i18n/dateLocale';
import i18n from '../../../i18n';
import type { TranslationKey } from '../../../i18n/locales/en';
import type { Row } from '../../../types/requests.types';
import { createDailyProgressHtml as renderDailyProgressHtml } from './dailyProgressPdfView';

type ProgressSession = Pick<
  Row<'activity_sessions'>,
  'id' | 'start_time' | 'name' | 'sport_type' | 'notes' | 'duration_s' | 'distance_m' | 'avg_speed_m_per_s'
>;
type ProgressSet = Pick<
  Row<'workout_sets'>,
  'session_id' | 'exercise_id' | 'set_number' | 'reps' | 'weight_kg' | 'distance_m' | 'duration_s'
> & { exercise_name: string | null };
type ProgressExercise = Pick<Row<'exercises'>, 'id' | 'base_name_en' | 'base_name_es'>;
type ProgressMeal = Pick<Row<'meal_logs'>, 'id' | 'date' | 'meal_type' | 'name' | 'notes'>;
type ProgressItem = Pick<Row<'meal_items'>, 'meal_log_id' | 'name' | 'quantity_g' | 'data_quality' | 'origin'>;
type ProgressWeight = Pick<Row<'weight_logs'>, 'measured_at' | 'weight_kg'>;
type ProgressMeasurement = Pick<Row<'body_measurements'>, 'measured_at' | 'measurement_type' | 'value_cm'>;

export type DailyProgress = {
  date: string;
  status: 'normal' | 'over_target' | 'vacation';
  steps: number | null;
  weights: ProgressWeight[];
  measurements: ProgressMeasurement[];
  sessions: ProgressSession[];
  sets: ProgressSet[];
  meals: ProgressMeal[];
  items: ProgressItem[];
  notes: string[];
};

const t = (key: TranslationKey) => String(i18n.t(key));
const locale = () => getDateFnsLocale();
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const dateKey = (timestamp: string) => format(parseISO(timestamp), 'yyyy-MM-dd');
const numeric = (value: number | null | undefined, unit: string) =>
  value == null || !Number.isFinite(value) ? t('progressPdf.noData') : `${value} ${unit}`;

const list = (lines: string[], emptyText: string) =>
  lines.length
    ? `<ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : `<p class="empty">${escapeHtml(emptyText)}</p>`;

const weekKey = (date: string) => format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd');

const latestStepsByDate = (rows: Array<{ date: string; total_steps: number; is_manual: boolean }>) => {
  const result = new Map<string, { total: number; manual: boolean }>();
  rows.forEach(row => {
    const current = result.get(row.date);
    if (
      !current ||
      (row.is_manual && !current.manual) ||
      (row.is_manual === current.manual && row.total_steps > current.total)
    ) {
      result.set(row.date, { total: row.total_steps, manual: row.is_manual });
    }
  });
  return new Map(Array.from(result, ([date, value]) => [date, value.total]));
};

export const loadDailyProgress = async (
  userId: string,
  startDate: string,
  endDate: string,
): Promise<DailyProgress[]> => {
  const start = parseISO(startDate);
  const endExclusive = addDays(parseISO(endDate), 1);
  const [weightsResult, measurementsResult, stepsResult, sessionsResult, mealsResult, statusesResult] =
    await Promise.all([
      supabase
        .from('weight_logs')
        .select('measured_at,weight_kg')
        .eq('user_id', userId)
        .gte('measured_at', start.toISOString())
        .lt('measured_at', endExclusive.toISOString())
        .order('measured_at'),
      supabase
        .from('body_measurements')
        .select('measured_at,measurement_type,value_cm')
        .eq('user_id', userId)
        .gte('measured_at', start.toISOString())
        .lt('measured_at', endExclusive.toISOString())
        .order('measured_at'),
      supabase
        .from('daily_steps')
        .select('date,total_steps,is_manual')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('activity_sessions')
        .select('id,start_time,name,sport_type,notes,duration_s,distance_m,avg_speed_m_per_s')
        .eq('user_id', userId)
        .gte('start_time', start.toISOString())
        .lt('start_time', endExclusive.toISOString())
        .order('start_time'),
      supabase
        .from('meal_logs')
        .select('id,date,meal_type,name,notes')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('nutrition_day_statuses')
        .select('date,status,note')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date'),
    ]);
  const firstError = [
    weightsResult.error,
    measurementsResult.error,
    stepsResult.error,
    sessionsResult.error,
    mealsResult.error,
    statusesResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const sessions = sessionsResult.data ?? [];
  const sessionIds = sessions.map(session => session.id);
  const setsResult = sessionIds.length
    ? await supabase
        .from('workout_sets')
        .select('session_id,exercise_id,set_number,reps,weight_kg,distance_m,duration_s')
        .in('session_id', sessionIds)
        .order('set_number')
    : { data: [], error: null };
  if (setsResult.error) throw setsResult.error;
  const exerciseIds = Array.from(
    new Set((setsResult.data ?? []).map(set => set.exercise_id).filter((id): id is string => Boolean(id))),
  );
  const exercisesResult = exerciseIds.length
    ? await supabase.from('exercises').select('id,base_name_en,base_name_es').in('id', exerciseIds)
    : { data: [], error: null };
  if (exercisesResult.error) throw exercisesResult.error;
  const exercises = new Map(
    ((exercisesResult.data ?? []) as ProgressExercise[]).map(exercise => [
      exercise.id,
      i18n.language?.startsWith('en') ? exercise.base_name_en : exercise.base_name_es,
    ]),
  );

  const meals = mealsResult.data ?? [];
  const mealIds = meals.map(meal => meal.id);
  const itemsResult = mealIds.length
    ? await supabase
        .from('meal_items')
        .select('meal_log_id,name,quantity_g,data_quality,origin')
        .in('meal_log_id', mealIds)
    : { data: [], error: null };
  if (itemsResult.error) throw itemsResult.error;

  const dayMap = new Map<string, DailyProgress>();
  eachDayOfInterval({ start, end: parseISO(endDate) }).forEach(day => {
    const key = format(day, 'yyyy-MM-dd');
    dayMap.set(key, {
      date: key,
      status: 'normal',
      steps: null,
      weights: [],
      measurements: [],
      sessions: [],
      sets: [],
      meals: [],
      items: [],
      notes: [],
    });
  });
  const getDay = (key: string) => dayMap.get(key);

  (weightsResult.data ?? []).forEach(row => getDay(dateKey(row.measured_at))?.weights.push(row));
  (measurementsResult.data ?? []).forEach(row => getDay(dateKey(row.measured_at))?.measurements.push(row));
  (sessions as ProgressSession[]).forEach(row => getDay(dateKey(row.start_time))?.sessions.push(row));
  (setsResult.data ?? []).forEach(row => {
    const session = sessions.find(candidate => candidate.id === row.session_id);
    if (session)
      getDay(dateKey(session.start_time))?.sets.push({
        ...row,
        exercise_name: exercises.get(row.exercise_id) ?? null,
      } as ProgressSet);
  });
  (meals as ProgressMeal[]).forEach(row => getDay(row.date)?.meals.push(row));
  (itemsResult.data ?? []).forEach(row => {
    const meal = meals.find(candidate => candidate.id === row.meal_log_id);
    if (meal) getDay(meal.date)?.items.push(row as ProgressItem);
  });
  (statusesResult.data ?? []).forEach(row => {
    const day = getDay(row.date);
    if (day && (row.status === 'vacation' || row.status === 'over_target')) day.status = row.status;
    if (row.note?.trim()) day?.notes.push(row.note.trim());
  });
  latestStepsByDate(stepsResult.data ?? []).forEach((steps, date) => {
    const day = getDay(date);
    if (day) day.steps = steps;
  });
  (sessions as ProgressSession[]).forEach(session => {
    if (session.notes?.trim()) getDay(dateKey(session.start_time))?.notes.push(session.notes.trim());
  });
  (meals as ProgressMeal[]).forEach(meal => {
    if (meal.notes?.trim()) getDay(meal.date)?.notes.push(meal.notes.trim());
  });

  return Array.from(dayMap.values());
};

const renderDailyCard = (day: DailyProgress): string => {
  const weightLines = day.weights.map(
    row => `${format(parseISO(row.measured_at), 'HH:mm', { locale: locale() })}: ${numeric(row.weight_kg, 'kg')}`,
  );
  const measurementLines = day.measurements.map(row => {
    const label = t(`health.${row.measurement_type}` as TranslationKey);
    return `${label}: ${numeric(row.value_cm, 'cm')}`;
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
      const load = set.weight_kg === 0 ? t('progressPdf.loadNotRecorded') : numeric(set.weight_kg, 'kg');
      const details = [`${set.set_number}: ${set.reps} ${t('progressPdf.reps')}`, load];
      if (set.distance_m != null) details.push(numeric(set.distance_m / 1000, 'km'));
      if (set.duration_s != null) details.push(numeric(set.duration_s / 60, 'min'));
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
  const sessionsNotes = day.notes;

  return `<article class="day-card ${statusClass}">
    <header><h3>${escapeHtml(format(parseISO(day.date), 'EEEE, d MMMM yyyy', { locale: locale() }))}</h3><span>${escapeHtml(statusText)}</span></header>
    <div class="day-grid">
      <section><h4>${escapeHtml(t('progressPdf.weightMeasurements'))}</h4>${list([...weightLines, ...measurementLines], t('progressPdf.noData'))}</section>
      <section><h4>${escapeHtml(t('progressPdf.activity'))}</h4>${list(activityLines, t('progressPdf.noData'))}</section>
      <section><h4>${escapeHtml(t('progressPdf.training'))}</h4>${list(trainingLines, t('progressPdf.noTrainingRecorded'))}</section>
      <section><h4>${escapeHtml(t('progressPdf.food'))}</h4>${list(foodLines, t('progressPdf.noFoodRecorded'))}</section>
      <section><h4>${escapeHtml(t('progressPdf.notes'))}</h4>${list(sessionsNotes, t('progressPdf.noData'))}</section>
    </div>
  </article>`;
};

export const createDailyProgressHtml = (days: DailyProgress[]): string => {
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
    const endDate = format(addDays(parseISO(startDate), 6), 'd MMM yyyy', { locale: locale() });
    const context = contextNotes.length
      ? `<p>${escapeHtml(`${t('progressPdf.context')}: ${contextNotes.join(' · ')}`)}</p>`
      : '';
    return `<section class="week-section"><div class="week-summary"><h2>${escapeHtml(format(parseISO(startDate), 'd MMM', { locale: locale() }))} – ${escapeHtml(endDate)}</h2><p>${escapeHtml(`${loggedDays}/${weekDays.length} ${t('progressPdf.daysWithFood')} · ${trainingCount} ${t('progressPdf.trainingDays')} · ${markedCount} ${t('progressPdf.markedDays')}`)}</p>${context}</div>${weekDays.map(renderDailyCard).join('')}</section>`;
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
    .map(day => format(parseISO(day.date), 'd MMM yyyy', { locale: locale() }));
  const markedDates = days
    .filter(day => day.status !== 'normal')
    .map(
      day =>
        `${format(parseISO(day.date), 'd MMM yyyy', { locale: locale() })}: ${day.status === 'vacation' ? t('progressPdf.vacation') : t('progressPdf.overTarget')}`,
    );
  const measurementsByType = new Map<string, ProgressMeasurement[]>();
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

export const generateDailyProgressHtml = async (userId: string, startDate: string, endDate: string): Promise<string> =>
  renderDailyProgressHtml(
    await loadDailyProgress(userId, startDate, endDate),
    key => String(i18n.t(key)),
    getDateFnsLocale(),
  );
