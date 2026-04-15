# InCCsight

**InCCsight** é uma ferramenta open-source de exploração e visualização de dados de **Diffusion Tensor Imaging (DTI)** do **Corpo Caloso**, desenvolvida pelo [MICLab](https://miclab.fee.unicamp.br/) da UNICAMP.

A aplicação roda no browser (Chrome/Edge) com um servidor local Node.js + Express e um backend Python para os pipelines de segmentação.

---

## Funcionalidades

- Segmentação 2D do corpo caloso via **ROQS**
- Segmentação volumétrica 3D via **CNN** (requer PyTorch)
- Visualização interativa 2D e 3D com Plotly (isosuperfície + volume rendering)
- **Comparação entre grupos** com boxplots agrupados, radar e tabela de estatísticas
- Quality Check automático por sujeito
- Seleção de métodos por análise (Todos / ROQS / CNN)
- Interface responsiva, roda 100% no browser local

---

## Pré-requisitos

| Dependência | Versão mínima | Onde obter |
|---|---|---|
| Node.js | 22 LTS | https://nodejs.org |
| Python | 3.8+ | https://python.org |
| Git | — | https://git-scm.com |

---

## Instalação — Windows

### 1. Clone o repositório

```powershell
git clone https://github.com/MICLab-Unicamp/inCCsight.git
cd inCCsight
```

### 2. Instale as dependências Node

```powershell
npm install --ignore-scripts
```

> `--ignore-scripts` evita erros relacionados ao download de binários opcionais.

### 3. Crie e ative o ambiente Python

```powershell
cd methods
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Instale o PyTorch (escolha conforme seu hardware)

```powershell
# CPU apenas (recomendado para começar)
pip install torch>=2.0.0 --index-url https://download.pytorch.org/whl/cpu

# GPU NVIDIA — CUDA 11.8
pip install torch>=2.0.0 --index-url https://download.pytorch.org/whl/cu118

# GPU NVIDIA — CUDA 12.1
pip install torch>=2.0.0 --index-url https://download.pytorch.org/whl/cu121
```

### 5. Volte para a raiz do projeto

```powershell
cd ..
```

---

## Instalação — Linux / macOS

### 1. Clone o repositório

```bash
git clone https://github.com/MICLab-Unicamp/inCCsight.git
cd inCCsight
```

### 2. Instale as dependências Node

```bash
npm install --ignore-scripts
```

### 3. Crie e ative o ambiente Python

```bash
cd methods
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Instale o PyTorch

```bash
# CPU apenas
pip install torch>=2.0.0 --index-url https://download.pytorch.org/whl/cpu

# GPU NVIDIA — CUDA 11.8
pip install torch>=2.0.0 --index-url https://download.pytorch.org/whl/cu118
```

### 5. Volte para a raiz

```bash
cd ..
```

---

## Como Executar

Ative o ambiente Python antes de rodar:

```bash
# Windows
methods\venv\Scripts\activate

# Linux / macOS
source methods/venv/bin/activate
```

### Comando único (recomendado)

```bash
npm run dev
```

Inicia em paralelo:
- **Servidor Express** — porta `3001` (API + pipeline Python)
- **React dev server** — porta `3000` (interface)

O browser abrirá automaticamente em **http://localhost:3000**.

---

### Dois terminais separados

```bash
# Terminal 1 — servidor
npm run server

# Terminal 2 — interface
npm start
```

---

## Como usar

### 1. Tela inicial — Seleção de dados

1. Cole o **caminho absoluto** da pasta do grupo no campo de texto
   - Windows: `C:\dados\controle`
   - Linux/macOS: `/home/user/dados/controle`
2. Cada **subpasta** dentro desse caminho representa um **sujeito** com arquivos DTI
3. Nomeie o grupo (ex: `Controle`, `Pacientes`)
4. Clique em **"+ Adicionar grupo"** para comparar múltiplos grupos
5. Escolha o **método de segmentação**:
   | Opção | Descrição |
   |---|---|
   | **Todos** | ROQS 2D + CNN 3D |
   | **ROQS (2D)** | Apenas segmentação 2D (mais rápido) |
   | **CNN (3D)** | Apenas volumétrico 3D |
6. Clique em **"Executar análise"** e aguarde o log de progresso

### 2. Dashboard de resultados

| Aba | Conteúdo |
|---|---|
| **Segmentação 2D** | Imagens ROQS, boxplots FA/MD/RD/AD, scatter, midline profile, radar |
| **Volumétrico 3D** | Visualização WebGL com modo Superfície/Volume, colorscales e opacidade |
| **Comparar Grupos** | Aparece com ≥ 2 grupos: boxplots agrupados, radar e tabela estatística |

### 3. Última análise

Clique em **"Última análise"** para recarregar os resultados anteriores sem reprocessar.

---

## Estrutura de dados necessária

```
grupo/
├── sujeito_001/
│   ├── dti_FA.nii.gz
│   ├── dti_L1.nii.gz  ← autovalores
│   ├── dti_L2.nii.gz
│   ├── dti_L3.nii.gz
│   ├── dti_V1.nii.gz  ← autovetores
│   ├── dti_V2.nii.gz
│   └── dti_V3.nii.gz
├── sujeito_002/
│   └── ...
```

Formato suportado: **NIfTI** (`.nii` / `.nii.gz`)

---

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor + React em paralelo **(recomendado)** |
| `npm run server` | Apenas o servidor Express (porta 3001) |
| `npm start` | Apenas o React dev server (porta 3000) |
| `npm run build` | Build de produção do React |

---

## Solução de problemas

### Porta 3001 já em uso

```powershell
# Windows
powershell -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process -Force"
```
```bash
# Linux / macOS
kill $(lsof -ti:3001)
```

### Erro `allowedHosts[0] should be a non-empty string` ao rodar `npm start`

Confirme que o arquivo `.env` na raiz contém:

```env
SKIP_PREFLIGHT_CHECK=true
DANGEROUSLY_DISABLE_HOST_CHECK=true
WDS_SOCKET_HOST=localhost
```

### Python / pipeline não encontrado

Certifique-se de ativar o ambiente virtual **antes** de rodar `npm run dev`:

```bash
# Windows
methods\venv\Scripts\activate

# Linux / macOS
source methods/venv/bin/activate
```

### Pipeline encerra com erro

Verifique o log na tela de carregamento. Causas comuns:
- Arquivos DTI ausentes ou nomeação incorreta
- PyTorch não instalado → use **"ROQS (2D)"** no seletor de métodos
- Sem permissão de leitura na pasta de dados

### CNN muito lenta sem GPU

Use o modo **"ROQS (2D)"** ou instale PyTorch com suporte CUDA.

---

## Tecnologias

| Camada | Stack |
|---|---|
| Frontend | React 18, React Router 6, Plotly.js, Bootstrap 5, SASS |
| Backend local | Node.js 22, Express 4 |
| Pipeline | Python 3.8+, PyTorch 2+, MONAI, DIPY, Nibabel, NumPy, Pandas |
| 3D rendering | Plotly WebGL (isosurface + volume ray casting) |

---

## Citação

```
MICLab-Unicamp. InCCsight: An open-source tool for DTI Corpus Callosum analysis.
https://github.com/MICLab-Unicamp/inCCsight
```

---

## Licença

MIT — veja o arquivo `LICENSE`.
