import type { ChartDataPoint, ChartDataPointSelect } from '../../../components/stats/SimpleChart';

export const getSelectedHealthHistoryPoint = (
  data: ChartDataPoint[],
  selectedPoint?: ChartDataPointSelect,
): ChartDataPointSelect | undefined => {
  if (!selectedPoint?.date) return undefined;

  const currentPoint = data.find(point => point.date?.getTime() === selectedPoint.date?.getTime());
  return currentPoint ? { ...currentPoint, dateRange: selectedPoint.dateRange } : undefined;
};

type HealthHistoryChartReadoutInput = {
  selectedPoint?: ChartDataPointSelect;
  summaryValue: string;
  summaryDate: string;
  formatValue: (value: number) => string;
  formatDate: (point: ChartDataPointSelect) => string;
};

export const getHealthHistoryChartReadout = ({
  selectedPoint,
  summaryValue,
  summaryDate,
  formatValue,
  formatDate,
}: HealthHistoryChartReadoutInput) => {
  if (!selectedPoint) {
    return { value: summaryValue, date: summaryDate, isSelected: false };
  }

  return {
    value: selectedPoint.value === null ? '—' : formatValue(selectedPoint.value),
    date: formatDate(selectedPoint),
    isSelected: true,
  };
};
