#!/usr/bin/env python3
"""Compara la planilla de testing (.xlsx de Drive) con los consolidados del repo.

Detecta lo que alguien cargó en Drive sin pasar por el repo (o al revés):
casos y ejecuciones que están en un lado y no en el otro, filas con el mismo
ID y distinto contenido, e IDs duplicados en la planilla.

Si no hay planilla para comparar (nadie la bajó, no hay conexión con Drive),
avisa y sale con 0: **no frena** a nadie. Solo devuelve 1 si encontró
diferencias, para que quien lo use decida.

Uso:
  python3 scripts/comparar-planilla.py                    # usa la copia local de docs/documentacion
  python3 scripts/comparar-planilla.py --xlsx <archivo>   # p. ej. la bajada de Drive
  python3 scripts/comparar-planilla.py --xlsx <archivo> --importar
      # agrega al repo las filas que solo están en Drive (no toca las que difieren)

Salida: 0 = sincronizada u omitida · 1 = hay diferencias.
"""
from __future__ import annotations

import argparse
import csv
import io
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PRUEBAS = RAIZ / "docs" / "pruebas"
DEFAULT_XLSX = (
    RAIZ
    / "docs/documentacion/desarrollo-del-producto"
    / "01 UTN FRVM - PF 2026 – Plan de testing del producto - Equipo 12 v1.0.xlsx"
)

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
COLUMNAS = "ABCDEFGHIJ"  # las dos hojas tienen 10 columnas

HOJAS = [
    # (hoja de la planilla, prefijo de ID, consolidado del repo)
    ("Casos de Prueba", "TC-", "casos-prueba.csv"),
    ("Ejecución de Pruebas", "EJ-", "ejecucion.csv"),
]

ENCABEZADOS = {
    "TC-": ["ID Caso", "US asociada", "Objetivo", "Precondición", "Datos de entrada",
            "Pasos", "Resultado Esperado", "Prioridad", "Tipo", "Ejecutor"],
    "EJ-": ["ID Ejecución", "Sprint", "Fecha", "ID Caso", "US asociada", "Ejecutor",
            "Resultado", "Evidencia", "Defecto asociado", "Observaciones"],
}


def _alrededor(a: str, b: str, largo: int = 50) -> tuple[str, str]:
    """El fragmento de cada texto alrededor del primer carácter distinto."""
    i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
    desde = max(0, i - 15)

    def corte(t: str) -> str:
        return ("…" if desde else "") + t[desde : desde + largo] + ("…" if len(t) > desde + largo else "")

    return corte(a), corte(b)


def _texto(celda: ET.Element, compartidos: list[str]) -> str:
    tipo = celda.get("t")
    v = celda.find(M + "v")
    if tipo == "s" and v is not None and v.text is not None:
        return compartidos[int(v.text)]
    if tipo == "inlineStr":
        return "".join(t.text or "" for t in celda.iter(M + "t"))
    return v.text if v is not None and v.text is not None else ""


def leer_hojas(xlsx: Path) -> dict[str, list[list[str]]]:
    """Filas (10 columnas) de cada hoja, por nombre."""
    with zipfile.ZipFile(xlsx) as z:
        compartidos: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(M + "si"):
                compartidos.append("".join(t.text or "" for t in si.iter(M + "t")))
        rutas = {
            r.get("Id"): r.get("Target")
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        }
        hojas: dict[str, list[list[str]]] = {}
        for hoja in ET.fromstring(z.read("xl/workbook.xml")).iter(M + "sheet"):
            destino = rutas[hoja.get(R + "id")].lstrip("/")
            ruta = destino if destino.startswith("xl/") else f"xl/{destino}"
            filas = []
            for fila in ET.fromstring(z.read(ruta)).iter(M + "row"):
                valores = {}
                for c in fila.iter(M + "c"):
                    col = re.match(r"[A-Z]+", c.get("r") or "").group()
                    valores[col] = _texto(c, compartidos)
                filas.append([valores.get(col, "") for col in COLUMNAS])
            hojas[hoja.get("name")] = filas
    return hojas


def _normal(valor: str) -> str:
    """Compara sin formato: lo que cambia al pegar el TSV en Sheets no es una diferencia.

    - Saltos de línea dentro de la celda, " / " o un espacio: los TSV viejos
      unían las líneas con un espacio y los nuevos con " / ".
    - Espacios repetidos o al borde.
    - Fechas guardadas como número de serie de Excel (46234 → 31/07/2026).
    - Números enteros con decimal de Excel (4.0 → 4).
    """
    v = re.sub(r"(\s*\r?\n\s*|\s+/(?=\s|$))", " ", valor)
    v = re.sub(r"\s+", " ", v).strip()
    serie = re.fullmatch(r"(4\d{4})(?:\.0)?", v)  # 2009–2063: rango de fechas del proyecto
    if serie:
        fecha = date(1899, 12, 30) + timedelta(days=int(serie.group(1)))
        return fecha.strftime("%d/%m/%Y")
    return re.sub(r"^(\d+)\.0$", r"\1", v)


def _para_importar(fila: list[str]) -> list[str]:
    """Una fila de Drive con el formato del repo: las fechas que Excel guarda como
    número de serie pasan a dd/mm/aaaa. El resto se respeta tal cual (el sprint
    queda «4.0», como en el repo, y los saltos de línea pegados como " / " quedan así)."""
    salida = []
    for v in fila:
        v = v.strip()
        serie = re.fullmatch(r"(4\d{4})(?:\.0)?", v)
        if serie:
            v = (date(1899, 12, 30) + timedelta(days=int(serie.group(1)))).strftime("%d/%m/%Y")
        salida.append(v)
    return salida


def _num(id_: str) -> int:
    return int(re.sub(r"\D", "", id_) or 0)


def leer_csv(ruta: Path) -> list[list[str]]:
    with ruta.open(encoding="utf-8-sig", newline="") as f:
        return [fila for fila in csv.reader(f)][1:]


def agregar_al_csv(ruta: Path, filas: list[list[str]]) -> None:
    """Agrega filas al final (QUOTE_ALL) sin reescribir las anteriores."""
    buffer = io.StringIO()
    csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\n").writerows(filas)
    actual = ruta.read_bytes()
    separador = b"" if actual.endswith(b"\n") else b"\n"
    ruta.write_bytes(actual + separador + buffer.getvalue().encode("utf-8"))


def fuente(xlsx: Path) -> str:
    """Qué archivo se usó y de cuándo es: una copia local puede estar vieja."""
    from datetime import datetime

    cuando = datetime.fromtimestamp(xlsx.stat().st_mtime).strftime("%d/%m/%Y %H:%M")
    local = xlsx.resolve() == DEFAULT_XLSX.resolve()
    aviso = " — copia local: puede estar desactualizada respecto de Drive" if local else ""
    return f"Planilla: {xlsx.name} (archivo del {cuando}){aviso}"


def comparar(xlsx: Path, importar: bool) -> int:
    print(fuente(xlsx))
    hojas = leer_hojas(xlsx)
    hay_diferencias = False
    for nombre, prefijo, archivo in HOJAS:
        if nombre not in hojas:
            print(f"⚠️  La planilla no tiene la hoja «{nombre}»; se omite.")
            continue
        drive = [f for f in hojas[nombre] if f[0].strip().startswith(prefijo)]
        repo = [f for f in leer_csv(PRUEBAS / archivo) if f and f[0].startswith(prefijo)]
        en_drive = {f[0].strip(): f for f in drive}
        en_repo = {f[0]: f for f in repo}

        duplicados = sorted(k for k, n in Counter(f[0].strip() for f in drive).items() if n > 1)
        solo_drive = sorted((i for i in en_drive if i not in en_repo), key=_num)
        solo_repo = sorted((i for i in en_repo if i not in en_drive), key=_num)
        distintos = [
            i
            for i in en_drive
            if i in en_repo
            and [_normal(v) for v in en_drive[i]] != [_normal(v) for v in en_repo[i][:10]]
        ]

        ultimo = max((_num(i) for i in en_drive), default=0)
        print(f"{nombre}: Drive {len(drive)} filas (hasta {prefijo}{ultimo:0{3 if prefijo == 'TC-' else 2}d}) · repo {len(repo)}")
        if not (duplicados or solo_drive or solo_repo or distintos):
            print("   ✅ sincronizada")
            continue
        hay_diferencias = True
        if duplicados:
            print(f"   ❌ IDs duplicados en Drive: {', '.join(duplicados)}")
        if solo_drive:
            print(f"   ❌ Solo en Drive (cargados sin pasar por el repo): {', '.join(solo_drive)}")
        if solo_repo:
            print(f"   ⚠️  Solo en el repo (falta pegarlos en Drive): {', '.join(solo_repo)}")
        if distintos:
            print("   ⚠️  Mismo ID, distinto contenido:")
            for i in sorted(distintos, key=_num):
                cambios = []
                for k, (d, r) in enumerate(zip(en_drive[i], en_repo[i][:10])):
                    if _normal(d) != _normal(r):
                        fd, fr = _alrededor(_normal(d), _normal(r))
                        cambios.append(f"{ENCABEZADOS[prefijo][k]} (Drive: «{fd}» · repo: «{fr}»)")
                print(f"      {i}: " + "; ".join(cambios))
        if importar and solo_drive:
            agregar_al_csv(PRUEBAS / archivo, [_para_importar(en_drive[i]) for i in solo_drive])
            print(f"   ➕ Importados a docs/pruebas/{archivo}: {', '.join(solo_drive)}")

    if hay_diferencias and importar:
        print("Regenerá los TSV: npm run docs:para-pegar")
    return 1 if hay_diferencias else 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    p.add_argument("--importar", action="store_true")
    args = p.parse_args()

    if not args.xlsx.exists():
        print(
            f"ℹ️  No hay planilla para comparar ({args.xlsx.name}); se omite la comparación. "
            "Bajala de Drive o pasala con --xlsx."
        )
        return 0
    try:
        return comparar(args.xlsx, args.importar)
    except (zipfile.BadZipFile, KeyError) as error:
        print(f"ℹ️  No se pudo leer la planilla ({error}); se omite la comparación.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
