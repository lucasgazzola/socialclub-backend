#!/usr/bin/env python3
"""Lee la planilla de casos (.xlsx) y reporta el máximo TC-XXX / duplicados.

Fuente de verdad para /exportar-casos: no usar docs/exportables/casos-prueba.csv
para calcular el próximo ID.

Uso:
  python3 scripts/ids-planilla.py            # resumen
  python3 scripts/ids-planilla.py --max      # imprime el máximo (ej. 90)
  python3 scripts/ids-planilla.py --next     # imprime el próximo ID (TC-091)
  python3 scripts/ids-planilla.py --check    # sale 1 si hay IDs duplicados
"""
from __future__ import annotations

import argparse
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

DEFAULT_XLSX = (
    Path(__file__).resolve().parents[1]
    / "docs/documentacion/desarrollo-del-producto"
    / "01 UTN FRVM - PF 2026 – Plan de testing del producto - Equipo 12 v1.0.xlsx"
)


def _cell_text(cell: ET.Element, shared: list[str]) -> str:
    t = cell.get("t")
    v = cell.find("m:v", NS)
    if t == "s" and v is not None and v.text is not None:
        return shared[int(v.text)]
    if t == "inlineStr":
        return "".join(n.text or "" for n in cell.iter(M + "t"))
    return v.text if v is not None and v.text is not None else ""


def leer_ids(xlsx: Path) -> list[str]:
    with zipfile.ZipFile(xlsx) as z:
        shared: list[str] = []
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter(M + "t")))
        ws = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    ids: list[str] = []
    for row in ws.iter(M + "row"):
        for c in row.findall("m:c", NS):
            col = "".join(ch for ch in (c.get("r") or "") if ch.isalpha())
            if col != "A":
                continue
            val = _cell_text(c, shared)
            if val.startswith("TC-"):
                ids.append(val)
            break
    return ids


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    p.add_argument("--max", action="store_true")
    p.add_argument("--next", action="store_true")
    p.add_argument("--check", action="store_true")
    args = p.parse_args()

    if not args.xlsx.exists():
        print(f"No se encontró la planilla: {args.xlsx}", file=sys.stderr)
        return 2

    ids = leer_ids(args.xlsx)
    nums = [int(i.split("-", 1)[1]) for i in ids]
    max_n = max(nums) if nums else 0
    dupes = sorted(k for k, v in Counter(ids).items() if v > 1)

    if args.max:
        print(max_n)
        return 1 if dupes else 0
    if args.next:
        print(f"TC-{max_n + 1:03d}")
        return 1 if dupes else 0

    print(f"filas={len(ids)} únicos={len(set(ids))} máximo=TC-{max_n:03d}")
    if dupes:
        print("duplicados: " + ", ".join(dupes), file=sys.stderr)
        if args.check:
            return 1
        return 1 if args.check else 0
    if args.check:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
