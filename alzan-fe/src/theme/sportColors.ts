export const SPORT_COLORS: Record<string, string> = {
  gym: '#007AFF', // Azul técnico elegante (User requested to keep this)
  running: '#E9A73C', // Ámbar deportivo
  cycling: '#E56353', // Coral dinámico
  swimming: '#34AADC', // Cyan (Kept existing as requested)
  football: '#2E7D32', // Dark Green
  basketball: '#FF9500', // Orange (Kept existing)
  tennis: '#F2D648', // Amarillo clásico
  padel: '#8A5CC8', // Morado único
  hiking: '#A9825A', // Tierra/montaña
  martial_arts: '#D64B7F', // Rosa combate
  climbing: '#6B8E4E', // Verde roca
  walking: '#34C759', // Greenish (Default for walking if needed)
  other: '#8E8E93', // Gris neutro
};

export type SportColorKey = keyof typeof SPORT_COLORS;
