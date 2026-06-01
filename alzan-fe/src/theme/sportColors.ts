export const SPORT_COLORS: Record<string, string> = {
  gym: '#007AFF', // Azul sistema (User requested to keep this)
  running: '#E9A73C', // Ámbar deportivo
  cycling: '#E56353', // Coral dinámico
  swimming: '#34AADC', // Cyan agua (Kept existing as requested)
  football: '#2E7D32', // Verde campo
  basketball: '#FF9500', // Naranja cancha
  tennis: '#F2D648', // Amarillo pelota
  padel: '#8A5CC8', // Morado pista
  hiking: '#A9825A', // Tierra/montaña
  martial_arts: '#D64B7F', // Rosa combate
  climbing: '#6B8E4E', // Verde roca
  volleyball: '#E8B44B', // Dorado arena/playa
  trail: '#C46A2D', // Terracota montaña
  skiing: '#1B5E9E', // Azul noche invernal (oscuro, ≠ swimming)
  surf: '#1891AC', // Azul océano profundo (≠ swimming, gym, skiing)
  snowboard: '#7560E5', // Iris/violeta vibrante
  walking: '#34C759', // Verde paseo
  other: '#8E8E93', // Gris neutro
};

export type SportColorKey = keyof typeof SPORT_COLORS;
