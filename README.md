# Relatórios de Provas · FOCA Quinta da Lixa - CNF

Site de relatórios da época 2026/27: resumo da época, relatório por competição e ficha individual de cada atleta, com exportação para PDF (A4) e Excel.

## Estrutura
- `index.html` — página do site
- `assets/` — estilo, lógica (`app.js`) e logotipo
- `data/competicoes.json` — lista das competições carregadas
- `data/AAAA-MM-<local>.json` — dados de cada competição

## Acrescentar uma competição
1. Carregar o ficheiro `AAAA-MM-<local>.json` para a pasta `data/`.
2. Acrescentar o nome do ficheiro à lista em `data/competicoes.json`.
3. O site atualiza em 1 a 2 minutos.

O RP não se grava nos dados: é calculado pelo site, por ordem cronológica, a partir de todas as competições.
