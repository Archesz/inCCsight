"""
run.py — Pipeline completo de segmentação do corpo caloso.

Dado um ou mais caminhos de pasta, executa:
  1. ROQS  — segmentação 2D e geração dos CSVs
  2. CNN   — segmentação volumétrica 3D
  3. JSON  — converte os CSVs para mydata.json (carregado pela interface)

Uso:
    # Pasta pai com múltiplos sujeitos
    python run.py -p /dados/grupo_controle

    # Sujeito único (pasta contém os arquivos DTI diretamente)
    python run.py -p /dados/subject001

    # Múltiplos grupos
    python run.py -p /dados/grupo_controle /dados/grupo_pacientes

    # Pular CNN (roda apenas ROQS + conversão JSON)
    python run.py -p /dados/grupo_controle --skip-cnn

Estrutura esperada de cada sujeito:
    subject_folder/
        dti_L1.nii.gz  (ou .nii)
        dti_L2.nii.gz
        dti_L3.nii.gz
        dti_V1.nii.gz
        dti_V2.nii.gz
        dti_V3.nii.gz
"""

import argparse
import glob
import os
import subprocess
import sys
import time

# ── Diretório base deste script ───────────────────────────────────────────────

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
ROQS_DIR   = os.path.join(BASE_DIR, "roqs")
CNN_DIR    = os.path.join(BASE_DIR, "CNNBased")
CSVS_DIR   = os.path.join(BASE_DIR, "csvs")
PYTHON     = sys.executable


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_subject_folder(path):
    """Retorna True se a pasta contém arquivos DTI diretamente."""
    for ext in (".nii.gz", ".nii"):
        if os.path.isfile(os.path.join(path, f"dti_L1{ext}")):
            return True
    return False


def resolve_subjects(folders):
    """
    Valida cada caminho e retorna a lista limpa para passar ao pipeline.
    Ambos os scripts (roqs/main.py e CNNBased/main3D.py) sabem detectar se
    o caminho é uma pasta-pai ou uma pasta de sujeito único.
    """
    valid = []
    for folder in folders:
        folder = os.path.abspath(folder)
        if not os.path.isdir(folder):
            print(f"[AVISO] Pasta não encontrada, ignorando: {folder}", flush=True)
            continue
        if folder not in valid:
            valid.append(folder)
    return valid


def run_step(name, cmd, cwd):
    print(f"\n{'─'*60}", flush=True)
    print(f"  [{name}]", flush=True)
    print(f"  $ {' '.join(cmd)}", flush=True)
    print(f"{'─'*60}", flush=True)
    t0 = time.time()
    result = subprocess.run(cmd, cwd=cwd)
    elapsed = time.time() - t0
    if result.returncode != 0:
        print(f"\n[ERRO] {name} terminou com código {result.returncode}", flush=True)
        return False
    print(f"\n[OK] {name} concluído em {elapsed:.1f}s", flush=True)
    return True


# ── Argumentos ────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Pipeline completo ROQS + CNN + JSON")
parser.add_argument(
    "-p", "--path", nargs="+", required=True,
    help="Caminho(s) para pasta(s) de sujeitos ou pasta-pai com múltiplos sujeitos"
)
parser.add_argument(
    "--skip-cnn", action="store_true",
    help="Pular a etapa CNN (útil se torch não estiver instalado)"
)
parser.add_argument(
    "--skip-roqs", action="store_true",
    help="Pular a etapa ROQS"
)
parser.add_argument(
    "--skip-json", action="store_true",
    help="Pular a conversão final para JSON"
)
args = parser.parse_args()

# ── Resolução de pastas ───────────────────────────────────────────────────────

print("\n" + "=" * 60, flush=True)
print("  inCCsight — Pipeline de segmentação do corpo caloso", flush=True)
print("=" * 60, flush=True)

parent_folders = resolve_subjects(args.path)

if not parent_folders:
    print("[ERRO] Nenhuma pasta válida encontrada.", flush=True)
    sys.exit(1)

print(f"\n  Pastas a processar ({len(parent_folders)}):", flush=True)
for f in parent_folders:
    print(f"    • {f}", flush=True)

# ── Etapa 1 — ROQS ────────────────────────────────────────────────────────────

if not args.skip_roqs:
    ok = run_step(
        "ROQS — Segmentação 2D",
        [PYTHON, "main.py", "-p"] + parent_folders,
        cwd=ROQS_DIR
    )
    if not ok:
        print("\n[AVISO] ROQS falhou. Continuando mesmo assim...", flush=True)

# ── Etapa 2 — CNN ─────────────────────────────────────────────────────────────

if not args.skip_cnn:
    ok = run_step(
        "CNN — Segmentação volumétrica 3D",
        [PYTHON, "main3D.py", "-p"] + parent_folders,
        cwd=CNN_DIR
    )
    if not ok:
        print("\n[AVISO] CNN falhou. Continuando mesmo assim...", flush=True)
else:
    print("\n[--] CNN ignorada (--skip-cnn)", flush=True)

# ── Etapa 3 — Conversão JSON ──────────────────────────────────────────────────

if not args.skip_json:
    ok = run_step(
        "transformInJson — Conversão CSV → JSON",
        [PYTHON, "transformInJson.py"],
        cwd=CSVS_DIR
    )
    if not ok:
        print("\n[ERRO] Falha na conversão para JSON.", flush=True)
        sys.exit(1)
else:
    print("\n[--] Conversão JSON ignorada (--skip-json)", flush=True)

# ── Fim ───────────────────────────────────────────────────────────────────────

print("\n" + "=" * 60, flush=True)
print("  Pipeline concluído.", flush=True)
print(f"  JSON gerado em: {os.path.join(BASE_DIR, '..', 'src', 'data', 'mydata.json')}", flush=True)
print("=" * 60 + "\n", flush=True)
