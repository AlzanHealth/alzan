const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toHex = (value: number): string => (value >>> 0).toString(16).padStart(8, '0');

/**
 * The database stores progression keys as UUIDs, while the import format uses
 * readable values such as `work`. Keep UUIDs untouched and map other values to
 * a stable UUID so re-importing the same family updates the same progression.
 */
export const toImportedProgressionKey = (familyKey: string, progressionKey: string): string => {
  if (UUID_PATTERN.test(progressionKey)) return progressionKey;

  const input = `${familyKey}:${progressionKey}`;
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  let hashC = 0x85ebca6b;
  let hashD = 0xc2b2ae35;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193);
    hashB = Math.imul(hashB ^ code, 0x85ebca6b);
    hashC = Math.imul(hashC ^ code, 0xc2b2ae35);
    hashD = Math.imul(hashD ^ code, 0x27d4eb2d);
  }

  const raw = `${toHex(hashA)}${toHex(hashB)}${toHex(hashC)}${toHex(hashD)}`;
  const versionGroup = `5${raw.slice(13, 16)}`;
  const variantNibble = ((Number.parseInt(raw[16], 16) & 0x3) | 0x8).toString(16);
  const variantGroup = `${variantNibble}${raw.slice(17, 20)}`;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${versionGroup}-${variantGroup}-${raw.slice(20, 32)}`;
};
