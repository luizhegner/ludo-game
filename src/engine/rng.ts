/**
 * Gerador determinístico e serializável (mulberry32).
 * O estado é um único inteiro de 32 bits guardado no GameState, então
 * salvar/retomar a partida preserva a sequência de sorteios e os testes
 * ficam reprodutíveis.
 */

export function nextRandom(seed: number): { value: number; seed: number } {
  let a = (seed + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: a };
}

/** Inteiro em [min, max]. */
export function nextInt(seed: number, min: number, max: number): { value: number; seed: number } {
  const r = nextRandom(seed);
  return { value: min + Math.floor(r.value * (max - min + 1)), seed: r.seed };
}

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] | 0;
  }
  return (Math.random() * 4294967296) | 0;
}
