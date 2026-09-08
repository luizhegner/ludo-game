/**
 * Avatares: emoji (string curta) ou foto (data URL JPEG gerada por `fileToAvatar`).
 * Fotos são redimensionadas pra 128×128 antes de salvar, então cabem folgadas
 * no localStorage (≈ 10 KB cada) e no backup JSON.
 */

export const DEFAULT_AVATAR = '🙂';

/** Lado da foto salva, em px. */
export const AVATAR_SIZE = 128;

/** Grade de emojis oferecida no cadastro. Todos existem na fonte padrão do Android. */
export const EMOJI_AVATARS: readonly string[] = [
  '🦊', '🐼', '🦁', '🐸', '🐯', '🐵', '🐧', '🦄',
  '🐙', '🐝', '🐲', '🦉', '🐶', '🐱', '🐭', '🐰',
  '🐻', '🐨', '🐮', '🐷', '🐔', '🦆', '🦋', '🐢',
  '🐬', '🦈', '🦖', '🐳', '🐴', '🦒', '🦓', '🐺',
  '🦩', '🦜', '🦚', '🐞', '😎', '🤠', '🥳', '🤓',
  '👽', '🤖', '👻', '🎃', '🦸', '🧙', '🥷', '👑',
];

export function isPhoto(avatar: string | undefined | null): boolean {
  return !!avatar && avatar.startsWith('data:');
}

/** Um emoji aleatório, evitando os já usados (quando possível). */
export function randomAvatar(exclude: readonly string[] = []): string {
  const pool = EMOJI_AVATARS.filter((e) => !exclude.includes(e));
  const list = pool.length ? pool : EMOJI_AVATARS;
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Converte um arquivo de imagem (galeria/câmera) num data URL JPEG quadrado
 * de `size` px, recortando o centro. Respeita a orientação EXIF quando o
 * navegador suporta (`createImageBitmap` com `imageOrientation`).
 */
export async function fileToAvatar(file: File | Blob, size = AVATAR_SIZE): Promise<string> {
  const img = await decode(file);
  const w = img.width;
  const h = img.height;
  if (!w || !h) throw new Error('imagem vazia');
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponível');
  // fundo branco: PNG com transparência viraria preto no JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  if ('close' in img) img.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function decode(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* cai pro <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // segurança: se o navegador nunca responder (formato não suportado), não deixa a UI presa
    const timer = setTimeout(() => fail(new Error('tempo esgotado ao ler a imagem')), 15000);
    const done = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    };
    const fail = (err: Error) => {
      done();
      reject(err);
    };
    img.onload = () => {
      done();
      resolve(img);
    };
    img.onerror = () => fail(new Error('não foi possível ler a imagem'));
    img.src = url;
  });
}
