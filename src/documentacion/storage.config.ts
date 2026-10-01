import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Configuración del almacenamiento de archivos de documentación (US-24).
 *
 * Se guarda en el FILESYSTEM del servidor, en un directorio CONFIGURABLE por
 * variables de entorno (sirve en desarrollo y en producción):
 *   - DOCS_STORAGE_DIR: carpeta destino (default `storage/documentacion`).
 *   - DOCS_MAX_MB:      tamaño máximo por archivo en MB (default 10).
 * En la base solo se guarda la referencia (nombre del archivo), nunca el binario.
 */
export function getStorageDir(): string {
  const dir = process.env.DOCS_STORAGE_DIR?.trim() || 'storage/documentacion';
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

const MAX_MB = Number(process.env.DOCS_MAX_MB ?? 10);
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export const documentacionStorage = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = getStorageDir();
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      // Nombre único en disco; el nombre original se guarda aparte en la BD.
      cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (e: Error | null, ok: boolean) => void,
  ) => {
    if (TIPOS_PERMITIDOS.includes(file.mimetype)) return cb(null, true);
    cb(new BadRequestException('Tipo de archivo no permitido (solo PDF o imagen).'), false);
  },
};

/** Tipo mínimo del archivo subido (evita depender de @types/multer). */
export interface ArchivoSubido {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
}
