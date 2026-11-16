#!/usr/bin/env python3
"""Lee el Product Backlog (planilla «Sprint 0» de Drive) y muestra historias.

Si no hay planilla (nadie la bajó, no hay conexión con Drive), avisa y sale
con 0: no frena a nadie.

Uso:
  python3 scripts/leer-backlog.py                       # resumen de todas las US
  python3 scripts/leer-backlog.py --us 26 44            # detalle con criterios de aceptación
  python3 scripts/leer-backlog.py --sprint 5            # las US de un sprint
  python3 scripts/leer-backlog.py --encargado Gazzola   # las US de un integrante
  python3 scripts/leer-backlog.py --xlsx <archivo>      # p. ej. la bajada de Drive
  python3 scripts/leer-backlog.py --us 26 --csv         # CSV para editar y volver a pegar
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import re
import sys
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = (
    RAIZ
    / "docs/documentacion/desarrollo-del-producto"
    / "01 UTN FRVM - PF 2026 – Sprint 0 - Equipo 12 v1.0.xlsx"
)
HOJA = "Product Backlog"
CAMPOS = ["Épica", "US", "Título", "Descripción", "Criterios de aceptación",
          "Prioridad", "SP", "Sprint", "Versión", "Estado", "Encargado"]

# Reusa el lector de .xlsx de comparar-planilla.py (sin dependencias externas).
_spec = importlib.util.spec_from_file_location("comparar_planilla", Path(__file__).with_name("comparar-planilla.py"))
_cp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cp)  # type: ignore[union-attr]


def _entero(valor: str) -> str:
    return re.sub(r"^(\d+)\.0$", r"\1", valor.strip())


def leer_historias(xlsx: Path) -> list[dict[str, str]]:
    _cp.COLUMNAS = "ABCDEFGHIJK"
    filas = _cp.leer_hojas(xlsx).get(HOJA, [])
    historias, epica = [], ""
    for fila in filas:
        if fila[1].strip() in ("", "US") or not re.match(r"^\d+(\.0)?$", fila[1].strip()):
            continue
        if fila[0].strip():
            epica = fila[0].strip()  # la épica solo figura en la primera fila de su grupo
        h = dict(zip(CAMPOS, (v.strip() for v in fila)))
        h["Épica"] = epica
        for campo in ("US", "SP", "Sprint", "Versión"):
            h[campo] = _entero(h[campo])
        historias.append(h)
    return historias


def criterios(texto: str) -> list[str]:
    """Separa los criterios (vienen en un párrafo, una oración por criterio)."""
    partes = re.split(r"(?:\r?\n)+|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿])", texto.strip())
    return [p.strip() for p in partes if p.strip()]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    p.add_argument("--us", nargs="*", default=[])
    p.add_argument("--sprint")
    p.add_argument("--encargado")
    p.add_argument("--estado")
    p.add_argument("--csv", action="store_true", help="salida CSV (todas las columnas)")
    args = p.parse_args()

    if not args.xlsx.exists():
        print(f"ℹ️  No hay backlog para leer ({args.xlsx.name}). Bajalo de Drive o pasalo con --xlsx.")
        return 0
    try:
        historias = leer_historias(args.xlsx)
    except (zipfile.BadZipFile, KeyError) as error:
        print(f"ℹ️  No se pudo leer el backlog ({error}).")
        return 0

    pedidas = {u.upper().removeprefix("US-").lstrip("0") or "0" for u in args.us}
    if pedidas:
        historias = [h for h in historias if h["US"] in pedidas]
    if args.sprint:
        historias = [h for h in historias if h["Sprint"] == _entero(args.sprint)]
    if args.encargado:
        historias = [h for h in historias if args.encargado.lower() in h["Encargado"].lower()]
    if args.estado:
        historias = [h for h in historias if args.estado.lower() in h["Estado"].lower()]

    if not args.csv:
        from datetime import datetime

        cuando = datetime.fromtimestamp(args.xlsx.stat().st_mtime).strftime("%d/%m/%Y %H:%M")
        print(f"Backlog: {args.xlsx.name} (archivo del {cuando})")
        if args.xlsx.resolve() == DEFAULT_XLSX.resolve():
            print("⚠️  Es la copia local: puede estar desactualizada respecto de Drive.\n")

    if args.csv:
        w = csv.DictWriter(sys.stdout, fieldnames=CAMPOS, quoting=csv.QUOTE_ALL, lineterminator="\n")
        w.writeheader()
        w.writerows(historias)
        return 0

    if not historias:
        print("No hay historias con ese filtro.")
        return 0

    if pedidas:
        for h in historias:
            print(f"## US-{int(h['US']):02d} · {h['Título']}")
            print(f"{h['Épica']} · Prioridad {h['Prioridad']} · {h['SP']} SP · Sprint {h['Sprint']} · "
                  f"{h['Estado'] or 'sin estado'} · {h['Encargado'] or 'sin encargado'}\n")
            print(h["Descripción"] + "\n")
            print("Criterios de aceptación:")
            for c in criterios(h["Criterios de aceptación"]):
                print(f"- {c}")
            print()
        return 0

    print("| US | Título | Épica | SP | Sprint | Estado | Encargado |")
    print("|---|---|---|---|---|---|---|")
    for h in historias:
        print(f"| US-{int(h['US']):02d} | {h['Título']} | {h['Épica']} | {h['SP']} | {h['Sprint']} | "
              f"{h['Estado']} | {h['Encargado']} |")
    return 0


if __name__ == "__main__":
    sys.exit(main())
