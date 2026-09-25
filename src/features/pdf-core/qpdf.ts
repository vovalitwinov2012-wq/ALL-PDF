// Настоящее AES-шифрование/дешифрование через QPDF (WASM, 100% локально).
// WASM-модуль (~1.3MB) грузится лениво, только при открытии Защиты.
import type { QpdfInstance } from '@neslinesli93/qpdf-wasm';
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';

let modPromise: Promise<QpdfInstance> | null = null;

async function getQpdf(): Promise<QpdfInstance> {
  if (!modPromise) {
    const { default: createModule } = await import('@neslinesli93/qpdf-wasm');
    modPromise = createModule({ locateFile: () => wasmUrl });
  }
  return modPromise;
}

async function runQpdf(args: string[], input: Uint8Array): Promise<Uint8Array> {
  const q = await getQpdf();
  const FS = q.FS as unknown as {
    writeFile: (p: string, d: Uint8Array) => void;
    readFile: (p: string) => Uint8Array;
    unlink: (p: string) => void;
  };
  FS.writeFile('/in.pdf', input);
  try {
    FS.unlink('/out.pdf');
  } catch {
    // файла еще нет — нормально
  }
  let code = 1;
  try {
    code = q.callMain(args);
  } catch {
    code = 1; // Emscripten бросает ExitStatus при ненулевом выходе
  }
  if (code !== 0) throw new Error('qpdf-failed');
  return FS.readFile('/out.pdf');
}

export interface EncryptOptions {
  userPassword: string;
  ownerPassword: string;
  bits?: 128 | 256;
  /** Запретить всё, кроме просмотра: копирование, печать, изменение */
  restrictAll?: boolean;
}

/** Настоящее AES-шифрование. Пустой userPassword = открыть может каждый, права ограничены. */
export async function qpdfEncrypt(bytes: Uint8Array, opts: EncryptOptions): Promise<Uint8Array> {
  const args = [
    '/in.pdf',
    '--encrypt',
    opts.userPassword,
    opts.ownerPassword || opts.userPassword,
    String(opts.bits ?? 256)
  ];
  if (opts.restrictAll) {
    args.push('--accessibility=n', '--extract=n', '--modify=none', '--assemble=n', '--annotate=n', '--form=n', '--print=none');
  }
  args.push('--', '/out.pdf');
  return runQpdf(args, bytes);
}

/** Снятие пароля (нужен текущий пароль). */
export async function qpdfDecrypt(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  return runQpdf(['/in.pdf', `--password=${password}`, '--decrypt', '--', '/out.pdf'], bytes);
}

/** Линеаризация для быстрого просмотра в вебе. */
export async function qpdfLinearize(bytes: Uint8Array): Promise<Uint8Array> {
  return runQpdf(['/in.pdf', '--linearize', '--', '/out.pdf'], bytes);
}
