#!/usr/bin/env python3
"""Convierte una descarga del conector de Google Drive en un .xlsx.

La herramienta `download_file_content` de Claude devuelve el archivo en base64
(dentro de un JSON {content, id, mimeType, title} cuando es grande). Este script
lo decodifica para que lo lean `comparar-planilla.py` y `leer-backlog.py`.

Uso:
  python3 scripts/drive-a-xlsx.py <descarga.json|descarga.b64> <salida.xlsx>
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    origen, destino = Path(sys.argv[1]), Path(sys.argv[2])
    texto = origen.read_text(encoding="utf-8").strip()
    try:
        contenido = json.loads(texto)["content"]
    except (json.JSONDecodeError, KeyError, TypeError):
        contenido = texto  # base64 suelto
    datos = base64.b64decode(contenido)
    if not datos.startswith(b"PK"):
        print("La descarga no es un .xlsx (¿se exportó como texto?).", file=sys.stderr)
        return 1
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(datos)
    print(f"{destino} ({len(datos) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
