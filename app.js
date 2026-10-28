/* Relatórios de Provas · FOCA Quinta da Lixa - CNF
   Dados: data/competicoes.json (índice) + data/<competição>.json
   Regras de RP: ver CONTEXTO_RELATORIOS.md, secção 2. */
'use strict';

const ESTADO = { epoca: '', comps: [], linhas: [], nadadores: [], tac: null, calendario: [], calRaw: null, rec: null, recAtual: {}, rps: null, rpBase: {}, grupo: 'abs', compsTodas: [], linhasTodas: [], nadadoresTodos: [], calTodo: [] };
const app = document.getElementById('app');

/* ---------- Utilitários ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function seg(t) {                      // "1:05.71" → 65.71
  if (t == null || t === '') return null;
  const p = String(t).trim().split(':');
  const s = p.length === 2 ? (+p[0]) * 60 + parseFloat(p[1]) : parseFloat(p[0]);
  return isNaN(s) ? null : Math.round(s * 100) / 100;
}
function fmt(s) {                      // 65.71 → "1:05.71"
  if (s == null) return '—';
  const cs = Math.round(s * 100), m = Math.floor(cs / 6000), r = cs - m * 6000;
  const ss = (r / 100).toFixed(2);
  return m > 0 ? `${m}:${ss.padStart(5, '0')}` : ss;
}
const pct = v => v == null ? '—' : v.toFixed(2).replace('.', ',') + '%';
const pct0 = v => v == null || isNaN(v) ? '—' : Math.round(v) + '%';
const dataPT = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const datas = c => c.inicio === c.fim ? dataPT(c.inicio) : `${dataPT(c.inicio)} a ${dataPT(c.fim)}`;
const hoje = () => new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
const ordemEsc = ['Infantis A', 'Infantis B', 'Juvenis A', 'Juvenis B', 'Juniores', 'Seniores', 'Absolutos', 'Masters'];
const porEscalao = (a, b) => { const i = ordemEsc.indexOf(a), j = ordemEsc.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b, 'pt'); };
const distEstilo = p => { const m = /^(\d+)m (.+)$/.exec(p) || [0, 0, p]; const est = ['Livres', 'Costas', 'Bruços', 'Mariposa', 'Estilos']; return [est.indexOf(m[2]), +m[1]]; };
const porProva = (a, b) => { const x = distEstilo(a), y = distEstilo(b); return x[0] - y[0] || x[1] - y[1]; };
const slug = s => encodeURIComponent(s);
const chipLugar = l => l == null ? '—' : l <= 3 ? `<span class="chip p${l}">${l}.º</span>` : `${l}.º`;

/* ---------- Carregamento ---------- */
async function carregar() {
  const r = await fetch('data/competicoes.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('Não foi possível ler data/competicoes.json');
  const idx = await r.json();
  ESTADO.epoca = idx.epoca || '';
  const comps = await Promise.all(idx.competicoes.map(async f => {
    const x = await fetch('data/' + f, { cache: 'no-store' });
    if (!x.ok) throw new Error('Não foi possível ler data/' + f);
    return x.json();
  }));
  comps.sort((a, b) => a.inicio.localeCompare(b.inicio));
  ESTADO.comps = comps; ESTADO.compsTodas = comps;
  try { const t = await fetch('data/tac.json', { cache: 'no-store' }); if (t.ok) ESTADO.tac = await t.json(); } catch (e) { ESTADO.tac = null; }
  try { const r3 = await fetch('data/rps.json', { cache: 'no-store' }); if (r3.ok) ESTADO.rps = await r3.json(); } catch (e) { ESTADO.rps = null; }
  prepararRPs();
  try { const r2 = await fetch('data/recordes.json', { cache: 'no-store' }); if (r2.ok) ESTADO.rec = await r2.json(); } catch (e) { ESTADO.rec = null; }
  let cal = null;
  try { const k = await fetch('data/calendario.json', { cache: 'no-store' }); if (k.ok) cal = await k.json(); } catch (e) { cal = null; }
  ESTADO.calRaw = cal;
  ESTADO.calTodo = juntarCalendario(cal); ESTADO.calendario = ESTADO.calTodo;
  try { const g = localStorage.getItem('foca-grupo'); if (['abs', 'inf', 'cad'].includes(g)) ESTADO.grupo = g; } catch (e) { /* sem armazenamento */ }
  calcular();
}

/* ---------- Grupos: Equipa Absoluta e Infantis ---------- */
const GRUPOS = [
  { id: 'abs', nome: 'Equipa Absoluta', sub: 'Juvenis · Juniores · Seniores', menu: ['epoca', 'comp', 'atleta', 'marcas', 'estafetas', 'tac', 'recordes'] },
  { id: 'inf', nome: 'Infantis', sub: 'Infantis A · Infantis B', menu: ['epoca', 'comp', 'atleta', 'tac'] },
  { id: 'cad', nome: 'Cadetes', sub: 'Cadetes A · Cadetes B', menu: ['epoca', 'comp', 'atleta'] }
];
const MENU_NOMES = { epoca: 'Época', comp: 'Competições', atleta: 'Atletas', marcas: 'Melhores marcas', estafetas: 'Estafetas', tac: 'TAC', recordes: 'Recordes' };
const grupoAtual = () => GRUPOS.find(g => g.id === ESTADO.grupo) || GRUPOS[0];
function grupoDe(ano, escalao) {                 // pelo ano de nascimento (categorias do tac.json); se faltar, pelo escalão
  const i = catDe(ano, escalao), c = catsTAC()[i];
  if (c) return c.grupo || 'abs';
  return /infant/i.test(escalao || '') ? 'inf' : /cadet/i.test(escalao || '') ? 'cad' : 'abs';
}
const grupoNadador = nome => { const l = ESTADO.linhasTodas.find(x => x.nadador === nome); return l ? l.grupo : grupoDe(ESTADO.rpBase[nome]?.ano, ''); };
function aplicarGrupo() {
  const g = ESTADO.grupo;
  ESTADO.linhas = ESTADO.linhasTodas.filter(l => l.grupo === g);
  const ids = new Set(ESTADO.linhas.map(l => l.comp));
  ESTADO.comps = ESTADO.compsTodas.filter(c => ids.has(c.id));
  ESTADO.nadadores = ESTADO.nadadoresTodos.filter(n => grupoNadador(n) === g);
  ESTADO.calendario = ESTADO.calTodo.filter(e => e.comp ? ids.has(e.comp.id) : (e.grupo || 'abs') === g);
  if (filtroTipo && !tipos().some(t => t.id === filtroTipo)) filtroTipo = '';
}
function setGrupo(g) {
  ESTADO.grupo = g;
  try { localStorage.setItem('foca-grupo', g); } catch (e) { /* sem armazenamento */ }
  aplicarGrupo(); desenharMenu(); desenharLateral();
  const v = location.hash.replace(/^#/, '').split('/')[0] || 'epoca';
  if (!grupoAtual().menu.includes(v) && !['fichas', 'gerir'].includes(v)) location.hash = '#epoca'; else rota();
}
function desenharMenu() {
  const m = document.getElementById('menu');
  if (m) m.innerHTML = grupoAtual().menu.map(v => `<a href="#${v}" data-v="${v}">${MENU_NOMES[v]}</a>`).join('');
}
function desenharLateral() {
  const el = document.getElementById('lateral');
  if (!el) return;
  el.innerHTML = `<div class="lat-t">Grupo</div>${GRUPOS.map(g => {
    const n = ESTADO.nadadoresTodos.filter(x => grupoNadador(x) === g.id).length;
    return `<button class="grp ${g.id === ESTADO.grupo ? 'ativo' : ''}" onclick="setGrupo('${g.id}')"><span class="grp-n">${esc(g.nome)}</span><span class="grp-s">${esc(g.sub)} · ${n} nadadores</span></button>`;
  }).join('')}`;
}

/* ---------- Cálculo de RP (cronológico) ---------- */
/* RP de base (data/rps.json): a partir de validoDesde substituem a inscrição/conversão */
function prepararRPs() {
  ESTADO.rpBase = {};
  for (const a of ESTADO.rps?.nadadores || []) {
    const rp = {};
    for (const t of a.rp) rp[`${t.prova}|${t.pisc}`] = seg(t.tempo);
    ESTADO.rpBase[a.nadador] = { ano: a.ano, genero: a.genero, nascimento: a.nascimento, rp };
  }
}
const lblTabela = () => `RP (tabela ${ESTADO.rps?.dataTabela ? dataPT(ESTADO.rps.dataTabela) : ''})`;
function calcular() {
  const melhor = {};          // nadador|prova|piscina → {t, local, data}
  const linhas = [];
  const desde = ESTADO.rps?.validoDesde || null;
  let semeado = false;
  for (const c of ESTADO.compsTodas) {
    if (desde && !semeado && c.inicio >= desde) {          // entra a tabela de RP
      semeado = true;
      for (const [nome, b] of Object.entries(ESTADO.rpBase)) for (const [kp, t] of Object.entries(b.rp)) {
        const [prova, pisc] = kp.split('|'), k = `${nome}|${prova}|${pisc}`;
        if (!melhor[k] || t < melhor[k].t) melhor[k] = { t, local: lblTabela(), data: ESTADO.rps.dataTabela, tabela: true };
      }
    }
    const usaTabela = semeado;
    const rs = [...c.resultados].sort((a, b) => a.nprova - b.nprova);
    for (const r of rs) {
      const k = `${r.nadador}|${r.prova}|${c.piscina}`;
      const res = r.estado === 'OK' ? seg(r.resultado) : null;
      let ref = usaTabela && ESTADO.rpBase[r.nadador] ? null : seg(r.ref), tipo = null;   // sem tabela de RP (ex.: Infantis): inscrição/conversão
      if (ref != null) tipo = r.refOrigem === 'rp' ? lblTabela() : r.inscPiscina === c.piscina ? `Inscrição (${r.inscPiscina}m)` : 'Tempo convertido';
      const ant = melhor[k];
      if (ant && (ref == null || ant.t < ref)) { ref = ant.t; tipo = ant.tabela ? ant.local : `Resultado anterior · ${ant.local}`; }
      let ePR = false, prim = false, p = null, melh = null, nt = false;
      const grupo = grupoDe(r.ano, r.escalao);
      if (res != null) {
        if (ref == null && grupo !== 'abs') { nt = true; tipo = 'NT · sem RP (não contabilizado)'; }
        else if (ref == null) { ePR = true; prim = true; tipo = 'RP · 1.º tempo'; }
        else { p = res / ref * 100; ePR = res < ref; if (ePR) melh = 100 - p; }
        if (!ant || res < ant.t) melhor[k] = { t: res, local: c.local, data: c.inicio };
      }
      const l = { ...r, comp: c.id, c, piscina: c.piscina, res, refS: ref, tipo, ePR, prim, p, melh, nt, grupo };
      l.tac = tacObtidos(l);
      linhas.push(l);
    }
  }
  ESTADO.linhas = linhas; ESTADO.linhasTodas = linhas;
  ESTADO.nadadoresTodos = [...new Set([...linhas.map(l => l.nadador), ...Object.keys(ESTADO.rpBase)])].sort((a, b) => a.localeCompare(b, 'pt'));
  ESTADO.nadadores = ESTADO.nadadoresTodos;
  calcularRecordes();
  aplicarGrupo();
}

/* RP atual por prova e piscina: o mais rápido entre inscrições e resultados */
function rpAtuais(nome) {
  const m = {};
  const pôr = (prova, pisc, t, onde, quando, origem) => {
    if (t == null || !pisc) return;
    const k = prova + '|' + pisc;
    if (!m[k] || t < m[k].t) m[k] = { prova, pisc, t, onde, quando, origem };
  };
  const base = ESTADO.rpBase[nome];
  if (base) for (const [kp, t] of Object.entries(base.rp)) { const [prova, pisc] = kp.split('|'); pôr(prova, +pisc, t, lblTabela(), null, 'Tabela'); }
  for (const l of ESTADO.linhas.filter(x => x.nadador === nome)) {
    if (!base) pôr(l.prova, l.inscPiscina, seg(l.insc), 'Tempo de inscrição', null, 'Inscrição');
    const m0 = m[l.prova + '|' + l.piscina];
    if (l.res != null && (!m0 || l.res < m0.t || (m0.origem === 'Tabela' && Math.abs(l.res - m0.t) < 0.005))) m[l.prova + '|' + l.piscina] = { prova: l.prova, pisc: l.piscina, t: l.res, onde: l.c.local, quando: l.c.inicio, origem: 'Resultado', compId: l.comp, linha: l };
  }
  return Object.values(m).sort((a, b) => porProva(a.prova, b.prova) || a.pisc - b.pisc);
}

/* ---------- TAC (Tempos de Admissão aos Campeonatos) ---------- */
const colTAC = id => (ESTADO.tac?.colunas || []).find(c => c.id === id);
const catsTAC = () => ESTADO.tac?.categorias || [];
function catDe(ano, escalao) {          // índice da categoria de acesso (pelo ano; se faltar, pelo escalão)
  const cs = catsTAC();
  if (ano) { const i = cs.findIndex(c => (c.anos || []).includes(+ano) || (c.anoMax && +ano <= c.anoMax)); if (i >= 0) return i; }
  return cs.findIndex(c => c.escalao && c.escalao === escalao);
}
function colunasCat(i) {                // próprias + das categorias seguintes (sup: true)
  const cs = catsTAC();
  if (i < 0 || cs[i].semTAC) return [];
  return cs.slice(i).flatMap((c, k) => c.colunas.map(id => ({ id, sup: k > 0, cat: c, col: colTAC(id) })));
}
const tacTabela = (pisc, gen, prova) => ESTADO.tac?.tempos?.[String(pisc)]?.[gen]?.[prova] || null;
function tacObtidos(l) {                // TAC conseguidos num resultado (mesma piscina: 25m → tabela PC, 50m → PL)
  if (!ESTADO.tac || l.res == null) return [];
  const tab = tacTabela(l.piscina, l.genero, l.prova);
  if (!tab) return [];
  return colunasCat(catDe(l.ano, l.escalao)).filter(c => tab[c.id] && l.res <= seg(tab[c.id])).map(c => ({ ...c, tac: seg(tab[c.id]) }));
}
const rotTac = x => x.sup ? `${x.col.campeonato} · ↑ ${x.col.nome}` : x.col.campeonato;
function chipsTac(l) {
  if (!l.tac || !l.tac.length) return '<span class="nrp">—</span>';
  const vistos = new Set();
  return l.tac.filter(x => { const k = rotTac(x); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map(x => `<span class="chip tac${x.sup ? ' sup' : ''}" title="${esc(x.col.nome)} · TAC ${fmt(x.tac)}">${esc(rotTac(x))}</span>`).join(' ');
}
const textoTac = l => (l.tac || []).map(x => `${x.col.campeonato} (${x.col.nome}${x.sup ? ', escalão seguinte' : ''})`).join('; ');
const anoDe = nome => (ESTADO.linhas.find(l => l.nadador === nome && l.ano) || {}).ano || ESTADO.rpBase[nome]?.ano || null;
const generoDe = nome => (ESTADO.linhas.find(l => l.nadador === nome) || {}).genero || ESTADO.rpBase[nome]?.genero || null;
const escalaoDe = nome => { const ls = ESTADO.linhas.filter(l => l.nadador === nome); return ls.length ? ls[ls.length - 1].escalao : ''; };

/* Situação TAC de um atleta: melhor tempo por prova e piscina contra as colunas aplicáveis */
function tacAtleta(nome, t = '') {
  const todas = ESTADO.linhas.filter(l => l.nadador === nome);
  const ls = linhasTipo(t, todas).filter(l => l.res != null);
  if (!ESTADO.tac) return null;
  const genero = generoDe(nome), ano = anoDe(nome), escalao = escalaoDe(nome), ci = catDe(ano, escalao);
  const melhores = {};
  for (const l of ls) { const k = l.prova + '|' + l.piscina; if (!melhores[k] || l.res < melhores[k].res) melhores[k] = l; }
  if (!t && ESTADO.rpBase[nome]) for (const [kp, tt] of Object.entries(ESTADO.rpBase[nome].rp)) {   // RP da tabela (dentro da validade dos TAC)
    const [prova, pisc] = kp.split('|');
    if (!melhores[kp] || tt < melhores[kp].res) melhores[kp] = { prova, piscina: +pisc, genero, res: tt, c: { local: lblTabela(), inicio: ESTADO.rps.dataTabela }, tabela: true };
  }
  const provas = Object.values(melhores).sort((a, b) => porProva(a.prova, b.prova) || a.piscina - b.piscina);
  if (!provas.length) return null;
  return { escalao, genero, ano, cat: catsTAC()[ci] || null, provas, cols: colunasCat(ci) };
}

/* ---------- Agregados ---------- */
const AUSENTE = ['DNS', 'WDR'];                 // não nadou: não conta como prova nadada
const ausente = l => AUSENTE.includes(l.estado);
function resumo(lsTodas) {
  const ls = lsTodas.filter(l => !ausente(l));
  const ok = ls.filter(l => l.res != null);
  const rp = ls.filter(l => l.ePR);
  const comRef = ok.filter(l => l.p != null);
  const media = comRef.length ? comRef.reduce((s, l) => s + l.p, 0) / comRef.length : null;
  return {
    nad: new Set(ls.map(l => l.nadador)).size, provas: ls.length,
    rp: rp.length, prim: rp.filter(l => l.prim).length, melh: rp.filter(l => !l.prim).length,
    nt: ls.filter(l => l.nt).length,
    taxa: ls.length - ls.filter(l => l.nt).length > 0 ? rp.length / (ls.length - ls.filter(l => l.nt).length) * 100 : null, media,
    p1: ls.filter(l => l.lugar === 1).length, p2: ls.filter(l => l.lugar === 2).length, p3: ls.filter(l => l.lugar === 3).length,
    dsq: ls.filter(l => l.estado !== 'OK').length, ausentes: lsTodas.length - ls.length,
    rec: ls.reduce((n, l) => n + (l.recs ? l.recs.length : 0), 0), recProvas: ls.filter(l => l.recs && l.recs.length).length
  };
}
function agrupar(ls, chave) {
  const g = {};
  for (const l of ls) (g[l[chave]] ||= []).push(l);
  return g;
}

/* ---------- Blocos de HTML ---------- */
function kpis(s) {
  return `<div class="kpis">
    <div class="kpi"><div class="v">${s.nad}</div><div class="l">Nadadores</div></div>
    <div class="kpi"><div class="v">${s.provas}</div><div class="l">Provas nadadas</div>${s.dsq || s.ausentes ? `<div class="d">${[s.dsq ? s.dsq + ' DSQ' : '', s.ausentes ? s.ausentes + ' DNS/WDR não contadas' : ''].filter(Boolean).join(' · ')}</div>` : ''}</div>
    <div class="kpi"><div class="v">${s.rp}</div><div class="l">RP</div><div class="d">${s.melh} melhorias${ESTADO.grupo !== 'abs' ? '' : ` + ${s.prim} 1.º tempo`}</div></div>
    <div class="kpi"><div class="v">${pct0(s.taxa)}</div><div class="l">Provas com RP</div>${s.nt ? `<div class="d">${s.nt} prova${s.nt === 1 ? '' : 's'} com NT não contabilizada${s.nt === 1 ? '' : 's'}</div>` : ''}</div>
    <div class="kpi"><div class="v">${s.media == null ? '—' : s.media.toFixed(1).replace('.', ',') + '%'}</div><div class="l">Média face ao RP</div></div>
    <div class="kpi"><div class="v">${s.p1 + s.p2 + s.p3}</div><div class="l">Pódios</div><div class="d">${s.p1} × 1.º · ${s.p2} × 2.º · ${s.p3} × 3.º</div></div>
    ${ESTADO.rec ? `<div class="kpi"><div class="v">${s.rec}</div><div class="l">Recordes do clube</div><div class="d">${s.recProvas} prova${s.recProvas === 1 ? '' : 's'}</div></div>` : ''}
  </div>`;
}
function tabRelacao(ls, chave, rot) {
  const g = agrupar(ls, chave);
  const ks = Object.keys(g).sort(chave === 'escalao' ? porEscalao : (a, b) => a.localeCompare(b, 'pt'));
  const linhas = ks.map(k => {
    const s = resumo(g[k]);
    const nome = chave === 'nadador' ? `<a href="#atleta/${slug(k)}">${esc(k)}</a>` : esc(k);
    const extra = chave === 'nadador' ? `<td>${esc(g[k][g[k].length - 1].escalao)}${g[k][0].ano ? ` <span class="ref-lbl">${g[k][0].ano}</span>` : ''}</td>` : `<td class="n">${s.nad}</td>`;
    return `<tr><td>${nome}</td>${extra}<td class="n">${s.provas}</td><td class="n">${s.rp}</td><td class="n">${s.melh}</td><td class="n">${ESTADO.grupo !== 'abs' ? s.nt : s.prim}</td><td class="n">${pct0(s.taxa)}</td><td class="n">${s.p1 + s.p2 + s.p3}</td></tr>`;
  }).join('');
  return `<div class="tab-wrap"><table><thead><tr><th>${rot}</th>${chave === 'nadador' ? '<th>Escalão</th>' : '<th class="n">Nadadores</th>'}<th class="n">Provas</th><th class="n">RP</th><th class="n">Melhorias</th><th class="n">${ESTADO.grupo !== 'abs' ? 'NT (não contab.)' : '1.º tempo'}</th><th class="n">Provas/RP</th><th class="n">Pódios</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}
function celSituacao(l) {
  if (l.estado !== 'OK') return `<span class="chip est" title="${esc(l.motivo || '')}">${esc(l.estado)}</span>${l.motivo ? `<div class="ref-lbl">${esc(l.motivo)}</div>` : ''}`;
  if (l.nt) return '<span class="chip tac">NT · não contabilizado</span>';
  if (l.prim) return '<span class="chip rp">RP · 1.º tempo</span>';
  if (l.ePR) return `<span class="chip rp">RP · −${pct(l.melh)}</span>`;
  return '<span class="nrp">—</span>';
}
function tabDetalhe(ls, comComp) {
  const linhas = ls.map(l => `<tr>
    ${comComp ? `<td>${dataPT(l.c.inicio)}<div class="ref-lbl">${esc(l.c.local)} · ${l.piscina}m</div></td>` : `<td><a href="#atleta/${slug(l.nadador)}">${esc(l.nadador)}</a></td><td>${esc(l.escalao)}</td>`}
    <td>${esc(l.prova)}</td>
    <td class="t">${l.insc ? esc(fmt(seg(l.insc))) + ` <span class="ref-lbl">(${l.inscPiscina}m)</span>` : 'NT'}</td>
    <td class="t">${fmt(l.refS)}<div class="ref-lbl">${esc(l.tipo || '')}</div></td>
    <td class="t ${l.ePR ? 'rp' : ''}">${l.res != null ? fmt(l.res) : esc(l.estado)}</td>
    <td class="n t">${pct(l.p)}</td>
    <td>${celSituacao(l)} ${chipRec(l)}${l.obs ? `<div class="ref-lbl">${esc(l.obs)}</div>` : ''}</td>
    <td class="n">${chipLugar(l.lugar)}</td>
    <td>${chipsTac(l)}</td></tr>`).join('');
  return `<div class="tab-wrap"><table><thead><tr>${comComp ? '<th>Competição</th>' : '<th>Nadador</th><th>Escalão</th>'}<th>Prova</th><th>Inscrição</th><th>Referência</th><th>Resultado</th><th class="n">% do RP</th><th>Situação</th><th class="n">Lugar</th><th>TAC</th></tr></thead><tbody>${linhas || '<tr><td colspan="10" class="vazio">Sem provas.</td></tr>'}</tbody></table></div>`;
}
function classificacoes(c, ls) {
  const est = c.estrutura && c.estrutura.length ? c.estrutura : [{ grupo: 'Geral', categorias: [...new Set(ls.map(l => l.categoria))].sort(porEscalao) }];
  return est.map(g => `<h3>${esc(g.grupo)}</h3><div class="grelha2">${g.categorias.map(cat => {
    const xs = ls.filter(l => l.categoria === cat).sort((a, b) => (a.lugar ?? 999) - (b.lugar ?? 999) || porProva(a.prova, b.prova));
    const s = resumo(xs);
    const corpo = xs.map(l => `<tr><td class="n">${chipLugar(l.lugar)}</td><td>${esc(l.nadador)}</td><td>${esc(l.prova)}</td><td class="t">${l.res != null ? fmt(l.res) : esc(l.estado)}</td></tr>`).join('');
    return `<div><div class="ref-lbl" style="margin-bottom:4px"><strong>${esc(cat)}</strong> · ${xs.length} provas · pódios: ${s.p1} × 1.º, ${s.p2} × 2.º, ${s.p3} × 3.º</div>
      <div class="tab-wrap"><table><thead><tr><th class="n">Lugar</th><th>Nadador</th><th>Prova</th><th>Tempo</th></tr></thead><tbody>${corpo || '<tr><td colspan="4" class="vazio">Sem nadadores do clube.</td></tr>'}</tbody></table></div></div>`;
  }).join('')}</div>`).join('');
}
function tabDesclass(ls) {
  const xs = ls.filter(l => l.estado === 'DSQ').sort((a, b) => a.c.inicio.localeCompare(b.c.inicio) || a.nprova - b.nprova);
  if (!xs.length) return '<p class="vazio">Sem desclassificações.</p>';
  return `<div class="tab-wrap"><table><thead><tr><th>Nadador</th><th>Escalão</th><th>Prova</th><th>Competição</th><th>Motivo</th></tr></thead><tbody>${xs.map(l => `<tr><td><a href="#atleta/${slug(l.nadador)}">${esc(l.nadador)}</a></td><td>${esc(l.escalao)}</td><td>${esc(l.prova)}</td><td>${esc(l.c.local)} <span class="ref-lbl">${dataPT(l.c.inicio)}</span></td><td>${esc(l.motivo || 'Motivo não indicado na fonte')}</td></tr>`).join('')}</tbody></table></div>`;
}
function pontosConfirmar(ls) {
  const xs = [];
  for (const l of ls) {
    if (l.obs) xs.push(`${esc(l.nadador)} · ${esc(l.prova)}: ${esc(l.obs)}`);
    if (l.melh != null && l.melh > 8 && !l.confirmado) xs.push(`${esc(l.nadador)} · ${esc(l.prova)}: melhoria de ${pct(l.melh)} (acima de 8%) — confirmar tempo e inscrição.`);
    if (l.estado !== 'OK') xs.push(`${esc(l.nadador)} · ${esc(l.prova)}: ${esc(l.estado)}${l.motivo ? ' — ' + esc(l.motivo) : ''}${ausente(l) ? ' (não conta como prova nadada)' : ''}.`);
  }
  return xs.length ? `<ul class="lista-pc">${xs.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p class="vazio">Nada a confirmar.</p>';
}
const impCab = (titulo, sub) => `<div class="imp-cab"><img src="logo.png" alt=""><div><div class="it">${esc(titulo)}</div><div class="is">${esc(sub)}</div></div></div>`;
const impRod = fonte => `<div class="imp-rod">FOCA Quinta da Lixa - CNF · Gerado em ${hoje()}${fonte ? ` · Fonte: ${esc(fonte)}` : ''}</div>`;

/* ---------- Tipos de competição e calendário ---------- */
const TIPOS_ABS = [
  { id: 'torneio', nome: 'Torneios/Provas' },
  { id: 'zonal', nome: 'Torneios Zonais Juvenis' },
  { id: 'territorial', nome: 'Campeonatos Territoriais' },
  { id: 'nacional', nome: 'Campeonatos Nacionais / Open de Portugal' },
  { id: 'meeting', nome: 'Meetings Internacionais' },
  { id: 'internacional', nome: 'Provas Internacionais' }
];
const TIPOS_INF = [
  { id: 'torneio', nome: 'Torneios' },
  { id: 'territorial', nome: 'Campeonatos Territoriais' },
  { id: 'meeting', nome: 'Meetings' },
  { id: 'nacional', nome: 'Campeonatos Nacionais' }
];
const tipos = () => ESTADO.grupo !== 'abs' ? TIPOS_INF : TIPOS_ABS;
const TIPOS = TIPOS_ABS;
const nomeTipo = id => (tipos().find(t => t.id === id) || TIPOS_ABS.find(t => t.id === id) || {}).nome || 'Todas as competições';
let filtroTipo = '';
try { filtroTipo = localStorage.getItem('foca-tipo') || ''; if (filtroTipo && !TIPOS_ABS.some(t => t.id === filtroTipo)) filtroTipo = ''; } catch (e) { filtroTipo = ''; }
function setTipo(t) { filtroTipo = t; try { localStorage.setItem('foca-tipo', t); } catch (e) { /* sem armazenamento */ } rota(); }
const compsTipo = t => ESTADO.comps.filter(c => !t || c.tipo === t);
const linhasTipo = (t, ls = ESTADO.linhas) => ls.filter(l => !t || l.c.tipo === t);
function chipsTipo(contar) {
  return `<div class="tipos nao-imp">${[{ id: '', nome: 'Todas' }, ...tipos()].map(t => {
    const n = contar(t.id);
    return `<button class="tipo ${t.id === filtroTipo ? 'ativo' : ''}" onclick="setTipo('${t.id}')">${esc(t.nome)} <span>${n}</span></button>`;
  }).join('')}</div>`;
}

/* Junta o calendário (data/calendario.json) com as competições que já têm resultados.
   Quando há resultados, o nome, as datas, o local e a piscina vêm SEMPRE do ficheiro de resultados. */
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const diasEntre = (a, b) => Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5);
function juntarCalendario(cal) {
  const usados = new Set();
  const ents = (cal?.competicoes || []).map(e => ({ ...e }));
  for (const e of ents) {
    let c = e.resultados ? ESTADO.compsTodas.find(x => x.id === e.resultados) : null;
    if (!c) c = ESTADO.compsTodas.find(x => !usados.has(x.id) && normal(x.local) === normal(e.local) && diasEntre(x.inicio, e.inicio) <= 7);
    if (c && !usados.has(c.id)) { usados.add(c.id); e.comp = c; if (e.tipo) c.tipo = e.tipo; }   // o tipo do calendário prevalece
  }
  for (const c of ESTADO.compsTodas) if (!usados.has(c.id)) ents.push({ comp: c });
  for (const c of ESTADO.compsTodas) if (!c.tipo) c.tipo = 'torneio';
  return ents.map(e => {
    const c = e.comp;
    return c ? { id: e.id, obs: e.obs, grupo: e.grupo, comp: c, nome: c.nome, inicio: c.inicio, fim: c.fim || c.inicio, local: c.local, piscina: c.piscina, tipo: c.tipo, url: c.url }
      : { id: e.id, obs: e.obs, grupo: e.grupo || 'abs', comp: null, nome: e.nome, inicio: e.inicio, fim: e.fim || e.inicio, local: e.local, piscina: e.piscina, tipo: e.tipo || 'torneio', url: e.url };
  }).sort((a, b) => a.inicio.localeCompare(b.inicio));
}
function tabCalendario(t) {
  const hojeISO = new Date().toISOString().slice(0, 10);
  const xs = ESTADO.calendario.filter(e => !t || e.tipo === t);
  if (!xs.length) return `<p class="vazio">Sem competições de ${esc(nomeTipo(t))} no calendário.</p>`;
  const corpo = xs.map(e => {
    const dt = e.inicio === e.fim ? dataPT(e.inicio) : `${dataPT(e.inicio)} a ${dataPT(e.fim)}`;
    if (e.comp) {
      const x = resumo(ESTADO.linhas.filter(l => l.comp === e.comp.id));
      return `<tr><td>${dt}</td><td><a href="#comp/${e.comp.id}">${esc(e.nome)}</a></td><td>${esc(e.local)}</td><td class="n">${e.piscina}m</td><td>${esc(nomeTipo(e.tipo))}</td><td class="n">${x.nad}</td><td class="n">${x.provas}</td><td class="n">${x.rp} <span class="ref-lbl">${ESTADO.grupo !== 'abs' ? (x.nt ? `(${x.nt} NT)` : '') : `(${x.melh}+${x.prim})`}</span></td><td class="n">${pct0(x.taxa)}</td><td class="n">${x.p1 + x.p2 + x.p3}</td><td><span class="chip rp">Realizada</span></td></tr>`;
    }
    const est = e.fim < hojeISO ? '<span class="chip est">Falta carregar resultados</span>' : '<span class="chip tac">Por realizar</span>';
    return `<tr class="futura"><td>${dt}</td><td>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.nome)}</a>` : esc(e.nome)}${e.obs ? `<div class="ref-lbl">${esc(e.obs)}</div>` : ''}</td><td>${esc(e.local || '')}</td><td class="n">${e.piscina ? e.piscina + 'm' : '—'}</td><td>${esc(nomeTipo(e.tipo))}</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td>${est}</td></tr>`;
  }).join('');
  return `<div class="tab-wrap"><table><thead><tr><th>Data</th><th>Competição</th><th>Local</th><th class="n">Piscina</th><th>Tipo</th><th class="n">Nadadores</th><th class="n">Provas</th><th class="n">RP</th><th class="n">% RP</th><th class="n">Pódios</th><th>Estado</th></tr></thead><tbody>${corpo}</tbody></table></div>`;
}

/* Relatório de conjunto (época inteira ou um tipo de competição) */
function relatorioConjunto(t, titulo, sub) {
  const comps = compsTipo(t), ls = linhasTipo(t), s = resumo(ls);
  const barras = comps.map(c => {
    const x = resumo(ls.filter(l => l.comp === c.id));
    return `<div class="barra"><div>${esc(c.local)} <span class="ref-lbl">${dataPT(c.inicio)}</span></div><div class="b"><span style="width:${Math.min(100, x.taxa || 0)}%"></span></div><div class="n"><strong>${pct0(x.taxa)}</strong></div></div>`;
  }).join('');
  const top = ls.filter(l => l.melh != null).sort((a, b) => b.melh - a.melh).slice(0, 10);
  const topH = top.map((l, i) => `<tr><td class="n">${i + 1}</td><td><a href="#atleta/${slug(l.nadador)}">${esc(l.nadador)}</a></td><td>${esc(l.escalao)}</td><td>${esc(l.prova)} <span class="ref-lbl">${l.piscina}m</span></td><td class="t">${fmt(l.refS)}</td><td class="t rp">${fmt(l.res)}</td><td class="n t">−${pct(l.melh)}</td><td>${esc(l.c.local)}</td></tr>`).join('');
  const cats = agrupar(ls, 'categoria');
  const podH = Object.keys(cats).sort(porEscalao).map(k => { const x = resumo(cats[k]); return `<tr><td>${esc(k)}</td><td class="n">${x.p1}</td><td class="n">${x.p2}</td><td class="n">${x.p3}</td><td class="n"><strong>${x.p1 + x.p2 + x.p3}</strong></td></tr>`; }).join('');
  const cab = `${impCab(titulo, sub)}
  <div class="cab"><div><h1>${esc(titulo)}</h1><div class="meta">${esc(sub)} · ${comps.length} ${comps.length === 1 ? 'competição' : 'competições'} com resultados · atualizado em ${hoje()}</div></div>
    <div class="acoes"><button class="btn" onclick="window.print()">PDF (A4)</button><button class="btn amar" onclick="excelConjunto('${t}')">Excel</button></div></div>`;
  const cal = `<section class="sec"><h2>Calendário</h2>${tabCalendario(t)}</section>`;
  if (!ls.length) return `${cab}${cal}<p class="aviso">Ainda não há resultados de ${esc(nomeTipo(t))}.</p>`;
  return `${cab}
  ${kpis(s)}
  ${cal}
  <section class="sec"><h2>Evolução da % de provas com RP</h2><div class="barras">${barras}</div></section>
  <section class="sec"><h2>RP por escalão</h2>${tabRelacao(ls, 'escalao', 'Escalão')}</section>
  <section class="sec quebra"><h2>RP por nadador</h2>${tabRelacao(ls, 'nadador', 'Nadador')}</section>
  <section class="sec"><h2>Maiores melhorias</h2><div class="tab-wrap"><table><thead><tr><th class="n">#</th><th>Nadador</th><th>Escalão</th><th>Prova</th><th>Referência</th><th>Resultado</th><th class="n">Melhoria</th><th>Local</th></tr></thead><tbody>${topH || '<tr><td colspan="8" class="vazio">Sem melhorias.</td></tr>'}</tbody></table></div></section>
  <section class="sec"><h2>Pódios por categoria</h2><div class="tab-wrap"><table><thead><tr><th>Categoria</th><th class="n">1.º</th><th class="n">2.º</th><th class="n">3.º</th><th class="n">Total</th></tr></thead><tbody>${podH}</tbody></table></div></section>
  ${ESTADO.rec ? `<section class="sec"><h2>Recordes do clube batidos</h2>${tabRecordesBatidos(ls)}</section>` : ''}
  ${ESTADO.tac ? `<section class="sec quebra"><h2>TAC obtidos</h2>${tabTacObtidos(ls)}</section>` : ''}
  ${ls.some(l => l.estado === 'DSQ') ? `<section class="sec"><h2>Desclassificações</h2>${tabDesclass(ls)}</section>` : ''}
  ${impRod('provas.annp.pt')}`;
}

/* ---------- Vistas ---------- */
function vistaEpoca() {
  app.innerHTML = relatorioConjunto('', 'Época ' + ESTADO.epoca + (ESTADO.grupo !== 'abs' ? ' · ' + grupoAtual().nome : ''), `Relatório da época · ${grupoAtual().nome} · Direção · FOCA Quinta da Lixa - CNF`);
}

function vistaListaComps() {
  const contar = t => ESTADO.calendario.filter(e => !t || e.tipo === t).length;
  app.innerHTML = `${chipsTipo(contar)}<div class="nao-imp" style="text-align:right;margin:-8px 0 8px"><a class="btn sec mini" href="#gerir">Gerir calendário</a></div>${relatorioConjunto(filtroTipo, filtroTipo ? nomeTipo(filtroTipo) : 'Competições', grupoAtual().nome + ' · Época ' + ESTADO.epoca + (filtroTipo ? ' · ' + nomeTipo(filtroTipo) : ' · todas as competições'))}`;
}

function vistaComp(id) {
  const c = ESTADO.comps.find(x => x.id === id);
  if (!c) return vistaListaComps();
  const ls = ESTADO.linhas.filter(l => l.comp === id);
  const ord = [...ls].sort((a, b) => a.nadador.localeCompare(b.nadador, 'pt') || a.nprova - b.nprova);
  app.innerHTML = `
  ${impCab(c.nome, `${c.local} · ${datas(c)} · Piscina de ${c.piscina}m`)}
  <div class="cab"><div><h1>${esc(c.nome)}</h1><div class="meta">${esc(nomeTipo(c.tipo))} · ${esc(c.local)} · ${datas(c)} · Piscina de ${c.piscina}m · ${esc(c.organizador || '')} · <a href="${esc(c.url)}" target="_blank" rel="noopener">página da prova</a></div></div>
    <div class="acoes"><button class="btn" onclick="window.print()">PDF (A4)</button><button class="btn amar" onclick="excelComp('${c.id}')">Excel</button><a class="btn sec" href="#fichas/${c.id}">Fichas dos atletas</a></div></div>
  <section class="sec"><h2>Resumo</h2>${kpis(resumo(ls))}</section>
  <section class="sec"><h2>Provas nadadas / RP por escalão</h2>${tabRelacao(ls, 'escalao', 'Escalão')}</section>
  <section class="sec"><h2>Provas nadadas / RP por nadador</h2>${tabRelacao(ls, 'nadador', 'Nadador')}</section>
  <section class="sec quebra"><h2>Classificações por categoria</h2>${classificacoes(c, ls)}</section>
  <section class="sec quebra"><h2>Detalhe</h2>
    <div class="filtros"><input type="search" id="f-txt" placeholder="Filtrar por nadador ou prova"><label><input type="checkbox" id="f-rp"> Só RP</label></div>
    <div id="det">${tabDetalhe(ord)}</div></section>
  ${ESTADO.rec ? `<section class="sec"><h2>Recordes do clube</h2>${tabRecordesBatidos(ls)}</section>` : ''}
  ${ESTADO.tac ? `<section class="sec"><h2>TAC obtidos</h2>${tabTacObtidos(ls)}</section>` : ''}
  <section class="sec"><h2>Desclassificações</h2>${tabDesclass(ls)}</section>
  <section class="sec"><h2>Pontos a confirmar</h2>${pontosConfirmar(ls)}</section>
  ${impRod(c.url)}`;
  const aplicar = () => {
    const q = document.getElementById('f-txt').value.trim().toLowerCase(), so = document.getElementById('f-rp').checked;
    document.getElementById('det').innerHTML = tabDetalhe(ord.filter(l => (!q || (l.nadador + ' ' + l.prova + ' ' + l.escalao).toLowerCase().includes(q)) && (!so || l.ePR)));
  };
  document.getElementById('f-txt').oninput = aplicar;
  document.getElementById('f-rp').onchange = aplicar;
}

function fichaHTML(nome, t = '') {
  const todas = ESTADO.linhas.filter(l => l.nadador === nome);
  if (!todas.length && !ESTADO.rpBase[nome]) return '<p class="aviso">Atleta não encontrado.</p>';
  const ult = { escalao: escalaoDe(nome) || 'Sem competições', genero: generoDe(nome) };
  const ls = linhasTipo(t, todas);
  const rps = rpAtuais(nome).map(r => `<tr><td>${esc(r.prova)}</td><td class="n">${r.pisc}m</td><td class="t"><strong>${fmt(r.t)}</strong></td><td>${r.compId ? `<a href="#comp/${r.compId}">${esc(r.onde)}</a>` : esc(r.onde)}</td><td>${r.quando ? dataPT(r.quando) : '—'}</td></tr>`).join('');
  const secRps = `<section class="sec"><h2>Recordes pessoais atuais <span class="ref-lbl">(tabela de RP + competições)</span></h2><div class="tab-wrap"><table><thead><tr><th>Prova</th><th class="n">Piscina</th><th>Tempo</th><th>Origem</th><th>Data</th></tr></thead><tbody>${rps || '<tr><td colspan="5" class="vazio">Sem RP registados.</td></tr>'}</tbody></table></div></section>`;
  if (!ls.length) return `<div class="ficha">${impCab('Ficha individual · ' + nome, `Época ${ESTADO.epoca}`)}<div class="cab"><div><h1>${esc(nome)}</h1><div class="meta">${anoDe(nome) ? 'Ano ' + anoDe(nome) + ' · ' : ''}${ult.genero === 'F' ? 'Feminino' : 'Masculino'} · ${esc(nomeTipo(t))}</div></div></div><p class="aviso">${todas.length ? `Sem provas em ${esc(nomeTipo(t))}.` : 'Ainda sem competições carregadas nesta época.'}</p>${secRps}${ESTADO.tac && !t ? `<section class="sec"><h2>TAC e campeonatos</h2>${secTacAtleta(nome)}</section>` : ''}${impRod('')}</div>`;
  const s = resumo(ls);
  const comps = [...new Set(ls.map(l => l.comp))].length;
  const provas = agrupar(ls, 'prova');
  const evo = Object.keys(provas).sort(porProva).map(p => `<tr><td>${esc(p)}</td><td>${provas[p].map(l => `<span class="t ${l.ePR ? 'rp' : ''}">${l.res != null ? fmt(l.res) : esc(l.estado)}</span> <span class="ref-lbl">${esc(l.c.local)} ${l.piscina}m</span>`).join(' → ')}</td></tr>`).join('');
  return `<div class="ficha">
    ${impCab('Ficha individual · ' + nome, `${ult.escalao} · Época ${ESTADO.epoca}${t ? ' · ' + nomeTipo(t) : ''}`)}
    <div class="cab"><div><h1>${esc(nome)}</h1><div class="meta">${esc(ult.escalao)}${anoDe(nome) ? ' · Ano ' + anoDe(nome) : ''} · ${ult.genero === 'F' ? 'Feminino' : 'Masculino'} · Época ${esc(ESTADO.epoca)} · <strong>${esc(nomeTipo(t))}</strong></div></div></div>
    <div class="kpis">
      <div class="kpi"><div class="v">${comps}</div><div class="l">Competições</div></div>
      <div class="kpi"><div class="v">${s.provas}</div><div class="l">Provas nadadas</div></div>
      <div class="kpi"><div class="v">${s.rp}</div><div class="l">RP conseguidos</div><div class="d">${s.melh} melhorias + ${s.prim} 1.º tempo</div></div>
      <div class="kpi"><div class="v">${s.p1 + s.p2 + s.p3}</div><div class="l">Pódios</div><div class="d">${s.p1} × 1.º · ${s.p2} × 2.º · ${s.p3} × 3.º</div></div>
    </div>
    ${secRps}
    ${ESTADO.tac ? `<section class="sec"><h2>TAC e campeonatos${t ? ` <span class="ref-lbl">(${esc(nomeTipo(t))})</span>` : ''}</h2>${secTacAtleta(nome, t)}</section>` : ''}
    ${ls.some(l => l.recs && l.recs.length) ? `<section class="sec"><h2>Recordes do clube</h2>${tabRecordesBatidos(ls)}</section>` : ''}
    ${ls.some(l => l.estado === 'DSQ') ? `<section class="sec"><h2>Desclassificações</h2>${tabDesclass(ls)}</section>` : ''}
    <section class="sec"><h2>Evolução por prova</h2><div class="tab-wrap"><table><thead><tr><th>Prova</th><th>Tempos na época</th></tr></thead><tbody>${evo}</tbody></table></div></section>
    <section class="sec"><h2>Todas as provas</h2>${tabDetalhe(ls, true)}</section>
    ${impRod('provas.annp.pt')}
  </div>`;
}

function vistaAtleta(nome) {
  const opts = ESTADO.nadadores.map(n => `<option value="${esc(n)}" ${n === nome ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const contar = t => new Set(linhasTipo(t, nome ? ESTADO.linhas.filter(l => l.nadador === nome) : ESTADO.linhas).map(l => l.comp)).size;
  app.innerHTML = `${chipsTipo(contar)}<div class="cab nao-imp"><div><h1>Atletas</h1><div class="meta">Ficha individual · ${esc(nomeTipo(filtroTipo))}</div></div>
    <div class="acoes"><select id="sel-at"><option value="">Escolher atleta…</option>${opts}</select>${nome ? '<button class="btn" onclick="window.print()">PDF (A4)</button>' : ''}</div></div>
    ${nome ? fichaHTML(nome, filtroTipo) : `<div class="cartoes">${ESTADO.nadadores.map(n => { const s = resumo(linhasTipo(filtroTipo, ESTADO.linhas.filter(l => l.nadador === n))); return `<a class="cartao" href="#atleta/${slug(n)}"><div class="ct">${esc(n)}</div><div class="cm">${anoDe(n) || ''} · ${s.provas ? `${s.provas} provas · <strong class="rp">${s.rp} RP</strong> · ${s.p1 + s.p2 + s.p3} pódios` : 'sem provas'}</div></a>`; }).join('')}</div>`}`;
  document.getElementById('sel-at').onchange = e => { location.hash = e.target.value ? '#atleta/' + slug(e.target.value) : '#atleta'; };
}

function vistaFichas(id) {
  const c = ESTADO.comps.find(x => x.id === id);
  if (!c) return vistaListaComps();
  const nomes = [...new Set(ESTADO.linhas.filter(l => l.comp === id).map(l => l.nadador))].sort((a, b) => a.localeCompare(b, 'pt'));
  app.innerHTML = `<div class="cab nao-imp"><div><h1>Fichas dos atletas</h1><div class="meta">${esc(c.nome)} · ${esc(c.local)} · ${nomes.length} atletas · uma ficha por página</div></div>
    <div class="acoes"><a class="btn sec" href="#comp/${id}">Voltar</a><button class="btn" onclick="window.print()">PDF (A4) de todas</button></div></div>
    ${nomes.map(n => fichaHTML(n, '')).join('')}`;
}

/* ---------- Excel (ExcelJS, carregado só quando preciso) ---------- */
let exceljs = null;
function carregarExcel() {
  if (exceljs) return exceljs;
  exceljs = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    s.onload = () => ok(window.ExcelJS); s.onerror = () => { exceljs = null; ko(new Error('Sem ligação para gerar o Excel.')); };
    document.head.appendChild(s);
  });
  return exceljs;
}
function folha(wb, nome, cab, linhas) {
  const ws = wb.addWorksheet(nome);
  ws.addRow(cab);
  linhas.forEach(r => ws.addRow(r));
  ws.getRow(1).eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D56A0' } };
    c.border = { bottom: { style: 'medium', color: { argb: 'FFF9DD24' } } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cab.length } };
  ws.columns.forEach((col, i) => { let w = String(cab[i]).length; linhas.forEach(r => { w = Math.max(w, String(r[i] ?? '').length); }); col.width = Math.min(50, w + 3); });
  return ws;
}
const relLinhas = (ls, chave) => { const g = agrupar(ls, chave); return Object.keys(g).sort(chave === 'escalao' ? porEscalao : (a, b) => a.localeCompare(b, 'pt')).map(k => { const s = resumo(g[k]); return [k, s.provas, s.rp, s.melh, s.prim, s.taxa == null ? null : Math.round(s.taxa) / 100, s.p1, s.p2, s.p3]; }); };
const relCab = r => [r, 'Provas', 'RP', 'Melhorias', '1.º tempo', 'Provas/RP', '1.º', '2.º', '3.º'];
const detLinhas = ls => ls.map(l => [l.c.local, l.nadador, l.ano || '', l.escalao, l.categoria, l.prova, l.insc ? fmt(seg(l.insc)) : 'NT', l.inscPiscina ? l.inscPiscina + 'm' : '', l.refS != null ? fmt(l.refS) : '', l.tipo || '', l.res != null ? fmt(l.res) : l.estado, l.p != null ? Math.round(l.p * 100) / 100 : null, l.ePR ? (l.prim ? 'RP · 1.º tempo' : 'RP') : '', l.melh != null ? Math.round(l.melh * 100) / 100 : null, l.lugar, textoTac(l), textoRec(l), [l.motivo, l.obs].filter(Boolean).join(' · ')]);
const detCab = ['Competição', 'Nadador', 'Ano', 'Escalão', 'Categoria', 'Prova', 'Inscrição', 'Piscina insc.', 'Referência', 'Tipo de referência', 'Resultado', '% do RP', 'Situação', 'Melhoria %', 'Lugar', 'TAC', 'Recorde do clube', 'Observações'];
function pctCol(ws, idx) { ws.getColumn(idx).numFmt = '0%'; }
async function gravar(wb, nome) {
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = nome; document.body.appendChild(a); a.click(); a.remove();
}
async function excelComp(id) {
  try {
    const X = await carregarExcel(), wb = new X.Workbook();
    const c = ESTADO.comps.find(x => x.id === id), ls = ESTADO.linhas.filter(l => l.comp === id), s = resumo(ls);
    folha(wb, 'Resumo', ['Indicador', 'Valor'], [['Competição', c.nome], ['Local', c.local], ['Datas', datas(c)], ['Piscina', c.piscina + 'm'], ['Nadadores', s.nad], ['Provas nadadas', s.provas], ['RP', s.rp], ['Melhorias', s.melh], ['RP · 1.º tempo', s.prim], ['% provas com RP', s.taxa == null ? '' : Math.round(s.taxa) + '%'], ['Média face ao RP', s.media == null ? '' : s.media.toFixed(2) + '%'], ['1.º lugares', s.p1], ['2.º lugares', s.p2], ['3.º lugares', s.p3], ['Fonte', c.url], ['Gerado em', hoje()]]);
    pctCol(folha(wb, 'Por escalão', relCab('Escalão'), relLinhas(ls, 'escalao')), 6);
    pctCol(folha(wb, 'Por nadador', relCab('Nadador'), relLinhas(ls, 'nadador')), 6);
    folha(wb, 'Classificações', ['Categoria', 'Lugar', 'Nadador', 'Prova', 'Tempo'], [...ls].sort((a, b) => porEscalao(a.categoria, b.categoria) || (a.lugar ?? 999) - (b.lugar ?? 999)).map(l => [l.categoria, l.lugar, l.nadador, l.prova, l.res != null ? fmt(l.res) : l.estado]));
    folha(wb, 'Detalhe', detCab, detLinhas([...ls].sort((a, b) => a.nadador.localeCompare(b.nadador, 'pt') || a.nprova - b.nprova)));
    if (ls.some(l => l.estado === 'DSQ')) folha(wb, 'Desclassificações', ['Nadador', 'Escalão', 'Prova', 'Motivo'], ls.filter(l => l.estado === 'DSQ').map(l => [l.nadador, l.escalao, l.prova, l.motivo || '']));
    await gravar(wb, `${c.id}-relatorio.xlsx`);
  } catch (e) { alert(e.message); }
}
async function excelConjunto(t) {
  try {
    const X = await carregarExcel(), wb = new X.Workbook(), ls = linhasTipo(t);
    folha(wb, 'Calendário', ['Início', 'Fim', 'Competição', 'Local', 'Piscina', 'Tipo', 'Nadadores', 'Provas', 'RP', 'Melhorias', '1.º tempo', '% RP', 'Pódios', 'Estado'], ESTADO.calendario.filter(e => !t || e.tipo === t).map(e => {
      if (!e.comp) return [dataPT(e.inicio), dataPT(e.fim), e.nome, e.local || '', e.piscina ? e.piscina + 'm' : '', nomeTipo(e.tipo), '', '', '', '', '', '', '', 'Por realizar'];
      const x = resumo(ls.filter(l => l.comp === e.comp.id));
      return [dataPT(e.inicio), dataPT(e.fim), e.nome, e.local, e.piscina + 'm', nomeTipo(e.tipo), x.nad, x.provas, x.rp, x.melh, x.prim, x.taxa == null ? '' : Math.round(x.taxa) + '%', x.p1 + x.p2 + x.p3, 'Realizada'];
    }));
    pctCol(folha(wb, 'Por escalão', relCab('Escalão'), relLinhas(ls, 'escalao')), 6);
    pctCol(folha(wb, 'Por nadador', relCab('Nadador'), relLinhas(ls, 'nadador')), 6);
    folha(wb, 'Maiores melhorias', ['Nadador', 'Escalão', 'Prova', 'Piscina', 'Referência', 'Resultado', 'Melhoria %', 'Local'], ls.filter(l => l.melh != null).sort((a, b) => b.melh - a.melh).map(l => [l.nadador, l.escalao, l.prova, l.piscina + 'm', fmt(l.refS), fmt(l.res), Math.round(l.melh * 100) / 100, l.c.local]));
    folha(wb, 'TAC obtidos', ['Competição', 'Nadador', 'Ano', 'Escalão', 'Prova', 'Piscina', 'Resultado', 'TAC'], ls.filter(l => l.tac && l.tac.length).map(l => [l.c.local, l.nadador, l.ano || '', l.escalao, l.prova, l.piscina + 'm', fmt(l.res), textoTac(l)]));
    folha(wb, 'Detalhe', detCab, detLinhas(ls));
    await gravar(wb, `${t ? t : 'epoca'}-${ESTADO.epoca.replace('/', '-')}-relatorio.xlsx`);
  } catch (e) { alert(e.message); }
}

/* ---------- TAC: blocos e vistas ---------- */
const ordemProva = (a, b) => (a.startsWith('4x') - b.startsWith('4x')) || porProva(a, b) || a.localeCompare(b, 'pt');
const notaTac = () => `<p class="ref-lbl nota-tac">Contam os resultados das competições e os RP da tabela (todos dentro do período de validade dos TAC); não contam tempos de inscrição. Resultados em 25m comparam com a tabela de piscina curta e em 50m com a de piscina longa. ${(ESTADO.tac?.notas || []).map(esc).join(' ')} "↑" = TAC de um escalão seguinte. Não é verificado o período de qualificação de cada campeonato.</p>`;

function tabTacObtidos(ls) {
  const xs = ls.filter(l => l.tac && l.tac.length).sort((a, b) => a.nadador.localeCompare(b.nadador, 'pt') || ordemProva(a.prova, b.prova));
  if (!xs.length) return '<p class="vazio">Nenhum TAC obtido nesta competição.</p>';
  const camp = {};
  xs.forEach(l => l.tac.filter(x => !x.sup).forEach(x => { (camp[x.col.campeonato] ||= new Set()).add(l.nadador); }));
  const res = Object.keys(camp).map(k => `<span class="chip tac">${esc(k)}: ${camp[k].size} nadador${camp[k].size > 1 ? 'es' : ''}</span>`).join(' ');
  const corpo = xs.map(l => `<tr><td><a href="#atleta/${slug(l.nadador)}">${esc(l.nadador)}</a></td><td>${esc(l.escalao)}${l.ano ? ` <span class="ref-lbl">${l.ano}</span>` : ''}</td><td>${esc(l.prova)}</td><td class="n">${l.piscina}m</td><td class="t rp">${fmt(l.res)}</td>
    <td>${l.tac.map(x => `<div>${esc(x.col.campeonato)} · ${x.sup ? '↑ ' : ''}${esc(x.col.nome)} <span class="t ref-lbl">TAC ${fmt(x.tac)} · −${pct(100 - l.res / x.tac * 100)}</span></div>`).join('')}</td></tr>`).join('');
  return `<p style="margin:0 0 10px">${res}</p><div class="tab-wrap"><table><thead><tr><th>Nadador</th><th>Escalão</th><th>Prova</th><th class="n">Piscina</th><th>Resultado</th><th>TAC obtidos</th></tr></thead><tbody>${corpo}</tbody></table></div>${notaTac()}`;
}

function obtidosAtleta(s, cols) {
  const obt = [];
  for (const l of s.provas) for (const c of cols) {
    const tab = tacTabela(l.piscina, l.genero, l.prova);
    if (tab && tab[c.id] && l.res <= seg(tab[c.id])) obt.push({ l, c, tac: seg(tab[c.id]) });
  }
  return obt;
}
const itemObt = o => `<li>${esc(o.l.prova)} <span class="ref-lbl">${o.l.piscina}m · ${esc(o.c.col.nome)}</span> — <span class="t rp">${fmt(o.l.res)}</span> <span class="t ref-lbl">(TAC ${fmt(o.tac)}) · ${esc(o.l.c.local)}${o.l.tabela ? '' : ', ' + dataPT(o.l.c.inicio)}</span></li>`;

function secTacAtleta(nome, t = '') {
  const s = tacAtleta(nome, t);
  if (!s) return '<p class="vazio">Sem resultados válidos.</p>';
  if (!s.cat) return `<p class="vazio">Sem categoria de acesso para ${esc(s.escalao)}${s.ano ? ' (' + s.ano + ')' : ''}: falta o ano de nascimento ou a regra no ficheiro tac.json.</p>`;
  const proprias = s.cols.filter(c => !c.sup), sups = s.cols.filter(c => c.sup);
  const camps = [...new Set(proprias.map(c => c.col.campeonato))];
  const cartoes = camps.map(cp => {
    const obt = obtidosAtleta(s, proprias.filter(c => c.col.campeonato === cp));
    const n = new Set(obt.map(o => o.l.prova + o.l.piscina)).size;
    const estado = n ? `<span class="chip rp">Pode participar · TAC em ${n} prova${n > 1 ? 's' : ''}</span>` : '<span class="chip est">Sem TAC</span>';
    return `<div class="cartao tac-c"><div class="ct">${esc(cp)}</div><div style="margin:6px 0">${estado}</div>${obt.length ? `<ul class="lista-pc">${obt.map(itemObt).join('')}</ul>` : ''}</div>`;
  }).join('');
  const obtSup = obtidosAtleta(s, sups);
  const cartSup = obtSup.length ? `<div class="cartao tac-c sup"><div class="ct">TAC de escalões seguintes</div><ul class="lista-pc">${obtSup.map(o => itemObt(o).replace('<span class="ref-lbl">', `<span class="ref-lbl">${esc(o.c.col.campeonato)} · `)).join('')}</ul></div>` : '';
  // matriz: colunas próprias + a primeira categoria seguinte (para mostrar o próximo objetivo)
  const prox = sups.length ? sups.filter(c => c.cat.id === sups[0].cat.id) : [];
  const mcols = [...proprias, ...prox];
  const cab = mcols.map(c => `<th class="n">${esc(c.col.campeonato)}<br><span style="font-weight:500">${c.sup ? '↑ ' : ''}${esc(c.col.nome)}</span></th>`).join('');
  const linhas = s.provas.map(l => {
    const tab = tacTabela(l.piscina, l.genero, l.prova) || {};
    return `<tr><td>${esc(l.prova)}</td><td class="n">${l.piscina}m</td><td class="t">${fmt(l.res)}</td>${mcols.map(c => {
      const t = seg(tab[c.id]);
      if (t == null) return '<td class="n nrp">—</td>';
      const d = l.res / t * 100 - 100;
      return d <= 0 ? `<td class="n t rp">✓ ${fmt(t)}</td>` : `<td class="n t">${fmt(t)}<div class="ref-lbl">falta ${pct(d)}</div></td>`;
    }).join('')}</tr>`;
  }).join('');
  return `<div class="ref-lbl" style="margin-bottom:8px">Categoria de acesso: <strong>${esc(s.cat.nome)}</strong>${s.ano ? ` (nascido${s.genero === 'F' ? 'a' : ''} em ${s.ano})` : ' (pelo escalão: falta o ano)'} · ${s.genero === 'F' ? 'Feminino' : 'Masculino'} · tabela de TAC ${esc(ESTADO.tac.epoca || '')}</div>
    <div class="cartoes">${cartoes}${cartSup}</div>
    <h3>Distância aos TAC (melhor tempo da época por prova e piscina)</h3>
    <div class="tab-wrap"><table><thead><tr><th>Prova</th><th class="n">Piscina</th><th>Melhor</th>${cab}</tr></thead><tbody>${linhas}</tbody></table></div>${notaTac()}`;
}

const tacF = { gen: 'M', cat: 'juvB', pisc: 'ambas', estaf: false };
const catsGrupo = () => catsTAC().filter(c => (c.grupo || 'abs') === ESTADO.grupo);
function tacVisao() {
  if (tacF.cat && !catsGrupo().some(c => c.id === tacF.cat)) tacF.cat = catsGrupo()[0]?.id || '';
  const T = ESTADO.tac;
  const c = catsTAC().find(x => x.id === tacF.cat);
  const cols = c ? c.colunas.map(id => ({ id, col: colTAC(id) })) : [...new Set(catsGrupo().flatMap(k => k.colunas))].map(id => ({ id, col: colTAC(id) }));
  const piscs = tacF.pisc === 'ambas' ? ['25', '50'] : [tacF.pisc];
  const provas = [...new Set(piscs.flatMap(p => Object.keys(T.tempos[p]?.[tacF.gen] || {})))]
    .filter(p => tacF.gen === 'X' || tacF.estaf || !p.startsWith('4x'))
    .filter(p => cols.some(cc => piscs.some(pc => T.tempos[pc]?.[tacF.gen]?.[p]?.[cc.id])))
    .sort(ordemProva);
  return { cat: c, cols, piscs, provas };
}
function vistaTac() {
  const T = ESTADO.tac;
  if (!T) { app.innerHTML = '<p class="aviso erro">Falta o ficheiro data/tac.json.</p>'; return; }
  const { cat, cols, piscs, provas } = tacVisao();
  const nomeP = p => p === '25' ? 'Curta (25m)' : 'Longa (50m)';
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`;
  const dupla = piscs.length > 1;
  const cab1 = cols.map(c => `<th class="n" ${dupla ? 'colspan="2"' : ''} style="text-align:center">${esc(c.col.campeonato)}<br><span style="font-weight:500">${esc(c.col.nome)}</span></th>`).join('');
  const cab2 = dupla ? `<tr>${cols.map(() => '<th class="n">25m</th><th class="n">50m</th>').join('')}</tr>` : '';
  const corpo = provas.map(p => `<tr><td><strong>${esc(p)}</strong></td>${cols.map(c => piscs.map(pc => { const v = T.tempos[pc]?.[tacF.gen]?.[p]?.[c.id]; return `<td class="n t">${v ? esc(fmt(seg(v))) : '<span class="nrp">—</span>'}</td>`; }).join('')).join('')}</tr>`).join('');
  const gTxt = { M: 'Masculinos', F: 'Femininos', X: 'Mistos (estafetas)' }[tacF.gen];
  const anosTxt = c => c.anos ? c.anos.join(', ') : `${c.anoMax} e anteriores`;
  app.innerHTML = `
  ${impCab('Tempos de Admissão (TAC) ' + (T.epoca || ''), `${gTxt} · ${cat ? cat.nome : 'Todas as colunas'} · ${piscs.map(nomeP).join(' + ')}`)}
  <div class="cab"><div><h1>Tempos de admissão</h1><div class="meta">${esc(T.fonte || '')} · Época ${esc(T.epoca || '')}</div></div>
    <div class="acoes"><button class="btn" onclick="window.print()">PDF (A4)</button><button class="btn amar" onclick="excelTac()">Excel</button></div></div>
  <section class="sec">
    <div class="filtros">
      <label>Género <select id="tf-gen">${opt('M', 'Masculinos', tacF.gen)}${opt('F', 'Femininos', tacF.gen)}${opt('X', 'Mistos (estafetas)', tacF.gen)}</select></label>
      <label>Categoria <select id="tf-cat">${catsGrupo().map(c => opt(c.id, `${c.nome} (${anosTxt(c)})`, tacF.cat)).join('')}${opt('', 'Todas as colunas', tacF.cat)}</select></label>
      <label>Piscina <select id="tf-pisc">${opt('25', 'Curta (25m)', tacF.pisc)}${opt('50', 'Longa (50m)', tacF.pisc)}${opt('ambas', 'Curta e longa', tacF.pisc)}</select></label>
      ${tacF.gen === 'X' ? '' : `<label><input type="checkbox" id="tf-est" ${tacF.estaf ? 'checked' : ''}> Estafetas</label>`}
    </div>
    <div class="tab-wrap"><table class="tab-tac"><thead><tr><th ${dupla ? 'rowspan="2"' : ''}>Prova</th>${cab1}</tr>${cab2}</thead><tbody>${corpo || `<tr><td colspan="${1 + cols.length * piscs.length}" class="vazio">Sem tempos para esta seleção.</td></tr>`}</tbody></table></div>
    <p class="ref-lbl nota-tac">${(T.notas || []).map(esc).join(' ')}</p>
  </section>
  ${impRod(T.fonte)}`;
  const at = () => { tacF.gen = document.getElementById('tf-gen').value; tacF.cat = document.getElementById('tf-cat').value; tacF.pisc = document.getElementById('tf-pisc').value; const e = document.getElementById('tf-est'); tacF.estaf = e ? e.checked : tacF.estaf; vistaTac(); };
  ['tf-gen', 'tf-cat', 'tf-pisc', 'tf-est'].forEach(id => { const el = document.getElementById(id); if (el) el.onchange = at; });
}
async function excelTac() {
  try {
    const X = await carregarExcel(), wb = new X.Workbook(), T = ESTADO.tac;
    const nomeP = p => p === '25' ? 'PC' : 'PL';
    for (const g of ['M', 'F', 'X']) {
      const cols = T.colunas, piscs = ['25', '50'];
      const provas = [...new Set(piscs.flatMap(p => Object.keys(T.tempos[p]?.[g] || {})))].sort(ordemProva);
      const cab = ['Prova', ...cols.flatMap(c => piscs.map(p => `${c.campeonato} · ${c.nome} (${nomeP(p)})`))];
      const ls = provas.map(pr => [pr, ...cols.flatMap(c => piscs.map(p => { const v = T.tempos[p]?.[g]?.[pr]?.[c.id]; return v ? fmt(seg(v)) : ''; }))]);
      folha(wb, { M: 'Masculinos', F: 'Femininos', X: 'Mistos' }[g], cab, ls);
    }
    await gravar(wb, `TAC-${(T.epoca || '').replace('/', '-')}.xlsx`);
  } catch (e) { alert(e.message); }
}

/* ---------- Gerir calendário (grava data/calendario.json no GitHub) ---------- */
const GH = (() => {
  const h = location.hostname, partes = location.pathname.split('/').filter(Boolean);
  const gh = h.endsWith('.github.io');
  return { dono: gh ? h.split('.')[0] : 'simaofam', repo: gh && partes[0] ? partes[0] : 'relatorios-provas-foca', ramo: 'main', ficheiro: 'data/calendario.json' };
})();
const chaveGH = { ler() { try { return localStorage.getItem('foca-gh-token') || ''; } catch (e) { return ''; } }, gravar(v) { try { v ? localStorage.setItem('foca-gh-token', v) : localStorage.removeItem('foca-gh-token'); return true; } catch (e) { return false; } } };
const b64 = s => { const b = new TextEncoder().encode(s); let r = ''; for (let i = 0; i < b.length; i += 0x8000) r += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(r); };
const de64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));
async function ghPedido(metodo, caminho, corpo) {
  const t = chaveGH.ler();
  if (!t) throw new Error('Falta a chave de acesso do GitHub (ver passo 1 desta página).');
  const r = await fetch(`https://api.github.com/repos/${GH.dono}/${GH.repo}/${caminho}`, {
    method: metodo, cache: 'no-store',
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  if (r.status === 401) throw new Error('Chave inválida ou expirada. Cria uma nova no GitHub.');
  if (r.status === 403 || r.status === 404) throw new Error('A chave não tem permissão de escrita neste repositório (Contents: Read and write).');
  if (r.status === 409) throw new Error('O ficheiro mudou entretanto. Recarrega a página e tenta outra vez.');
  if (!r.ok) throw new Error('Erro do GitHub (' + r.status + ').');
  return r.json();
}
async function lerCalendarioGH() {
  const j = await ghPedido('GET', `contents/${GH.ficheiro}?ref=${GH.ramo}`);
  return { sha: j.sha, cal: JSON.parse(de64(j.content)) };
}
function textoCalendario(cal) {      // uma competição por linha, como o ficheiro original
  const base = { ...cal, competicoes: [] };
  const linhas = cal.competicoes.map(e => '  ' + JSON.stringify(e).replace(/","/g, '", "').replace(/":/g, '": ').replace(/,"/g, ', "'));
  return JSON.stringify(base, null, 1).replace('"competicoes": []', '"competicoes": [\n' + linhas.join(',\n') + '\n ]') + '\n';
}
async function gravarCalendario(alterar, mensagem) {
  const { sha, cal } = await lerCalendarioGH();
  cal.competicoes = alterar(cal.competicoes || []).sort((a, b) => a.inicio.localeCompare(b.inicio));
  await ghPedido('PUT', `contents/${GH.ficheiro}`, { message: mensagem, content: b64(textoCalendario(cal)), sha, branch: GH.ramo });
  ESTADO.calRaw = cal;
  ESTADO.calTodo = juntarCalendario(cal);
  aplicarGrupo();
}
const slugTxt = s => normal(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const piscinaPadrao = ini => ini && ini.slice(5, 7) >= '09' ? 25 : 50;   // set–dez: 25m; jan–ago: 50m

let gEdit = null;   // id da competição em edição
function vistaGerir() {
  const raw = ESTADO.calRaw?.competicoes || [];
  const temChave = !!chaveGH.ler();
  const e = gEdit ? raw.find(x => x.id === gEdit) : null;
  const ligada = id => ESTADO.calTodo.find(x => x.id === id && x.comp);
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`;
  const linhas = raw.map(x => {
    const lg = ligada(x.id);
    return `<tr><td>${dataPT(x.inicio)}${x.fim && x.fim !== x.inicio ? ' a ' + dataPT(x.fim) : ''}</td><td>${esc(x.nome)}${x.obs ? `<div class="ref-lbl">${esc(x.obs)}</div>` : ''}</td><td>${esc(x.local || '')}</td><td class="n">${x.piscina ? x.piscina + 'm' : '—'}</td><td>${esc(nomeTipo(x.tipo))}${x.grupo && x.grupo !== 'abs' ? ` <span class="chip tac">${esc((GRUPOS.find(g => g.id === x.grupo) || {}).nome || '')}</span>` : ''}</td>
      <td>${lg ? '<span class="chip rp">Com resultados</span>' : '<span class="chip tac">Sem resultados</span>'}</td>
      <td class="n" style="white-space:nowrap"><button class="btn sec mini" onclick="gEdit='${esc(x.id)}';vistaGerir()">Editar</button> <button class="btn sec mini perigo" onclick="apagarComp('${esc(x.id)}')">Apagar</button></td></tr>`;
  }).join('');
  const lg = e && ligada(e.id);
  app.innerHTML = `
  <div class="cab"><div><h1>Gerir calendário</h1><div class="meta">Época ${esc(ESTADO.epoca)} · ${raw.length} competições · repositório ${esc(GH.dono)}/${esc(GH.repo)}</div></div>
    <div class="acoes"><a class="btn sec" href="#comp">Voltar às competições</a></div></div>
  <section class="sec"><h2>1. Chave de acesso</h2>
    ${temChave ? `<p>Chave guardada neste navegador. <button class="btn sec mini" onclick="testarChave()">Testar</button> <button class="btn sec mini perigo" onclick="chaveGH.gravar('');vistaGerir()">Esquecer chave</button></p>`
      : `<p>Para gravar alterações, cola aqui a chave do GitHub (<em>fine-grained token</em> com acesso só a este repositório e permissão <strong>Contents: Read and write</strong>). Fica guardada só neste navegador.</p>
         <div class="filtros"><input type="password" id="g-chave" placeholder="github_pat_…" style="min-width:320px"><button class="btn" onclick="guardarChave()">Guardar chave</button></div>`}
    <div id="g-msg-chave" class="ref-lbl"></div>
  </section>
  <section class="sec"><h2>2. ${e ? 'Editar competição' : 'Acrescentar competição'}</h2>
    ${lg ? '<p class="ref-lbl">Esta competição já tem resultados: o nome, as datas, o local e a piscina que contam são os do ficheiro de resultados. Aqui só tem efeito o tipo e as notas.</p>' : ''}
    <div class="form-cal">
      <label>Nome<input id="g-nome" value="${esc(e?.nome || '')}" placeholder="Ex.: Meeting Internacional de …"></label>
      <label>Início<input type="date" id="g-ini" value="${esc(e?.inicio || '')}"></label>
      <label>Fim<input type="date" id="g-fim" value="${esc(e?.fim || '')}"></label>
      <label>Local<input id="g-local" value="${esc(e?.local || '')}"></label>
      <label>Piscina<select id="g-pisc">${opt('', 'Automática (25m set–dez, 50m jan–ago)', e ? e.piscina : '')}${opt(25, '25m', e?.piscina)}${opt(50, '50m', e?.piscina)}</select></label>
      <label>Grupo<select id="g-grupo">${GRUPOS.map(g => opt(g.id, g.nome, e?.grupo || ESTADO.grupo)).join('')}</select></label>
      <label>Tipo<select id="g-tipo">${tipos().map(t => opt(t.id, t.nome, e?.tipo || 'torneio')).join('')}</select></label>
      <label class="largo">Notas<input id="g-obs" value="${esc(e?.obs || '')}" placeholder="Ex.: Confirmar presença"></label>
    </div>
    <div class="acoes" style="margin-top:10px"><button class="btn" onclick="guardarComp()" ${temChave ? '' : 'disabled'}>${e ? 'Guardar alterações' : 'Acrescentar ao calendário'}</button>${e ? ' <button class="btn sec" onclick="gEdit=null;vistaGerir()">Cancelar</button>' : ''}</div>
    <div id="g-msg" class="ref-lbl" style="margin-top:8px"></div>
  </section>
  <section class="sec"><h2>Calendário atual</h2><div class="tab-wrap"><table><thead><tr><th>Datas</th><th>Competição</th><th>Local</th><th class="n">Piscina</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>${linhas || '<tr><td colspan="7" class="vazio">Calendário vazio.</td></tr>'}</tbody></table></div>
    <p class="ref-lbl nota-tac">As alterações ficam no GitHub de imediato; o site público atualiza em 1 a 2 minutos.</p></section>`;
}
function msgG(id, txt, erro) { const el = document.getElementById(id); if (el) { el.textContent = txt; el.style.color = erro ? 'var(--verm)' : 'var(--verde)'; } }
function guardarChave() {
  const v = document.getElementById('g-chave').value.trim();
  if (!v) return msgG('g-msg-chave', 'Cola a chave primeiro.', true);
  if (!chaveGH.gravar(v)) return msgG('g-msg-chave', 'Este navegador não deixa guardar a chave (modo privado?).', true);
  vistaGerir(); testarChave();
}
async function testarChave() {
  msgG('g-msg-chave', 'A testar…');
  try { await lerCalendarioGH(); msgG('g-msg-chave', 'Chave válida: consegue ler e gravar o calendário.'); }
  catch (e) { msgG('g-msg-chave', e.message, true); }
}
async function guardarComp() {
  const v = id => document.getElementById(id).value.trim();
  const nome = v('g-nome'), ini = v('g-ini'), local = v('g-local');
  let fim = v('g-fim') || ini;
  if (!nome || !ini || !local) return msgG('g-msg', 'Preenche pelo menos o nome, a data de início e o local.', true);
  if (fim < ini) return msgG('g-msg', 'A data de fim é anterior à de início.', true);
  const pisc = v('g-pisc') ? +v('g-pisc') : piscinaPadrao(ini);
  const dados = { nome, inicio: ini, fim, local, piscina: pisc, tipo: v('g-tipo'), grupo: v('g-grupo') };
  const obs = v('g-obs');
  msgG('g-msg', 'A gravar…');
  try {
    if (gEdit) {
      const id = gEdit;
      await gravarCalendario(cs => cs.map(x => { if (x.id !== id) return x; const n = { ...x, ...dados }; if (obs) n.obs = obs; else delete n.obs; return n; }), `Calendário: editar ${nome}`);
    } else {
      await gravarCalendario(cs => {
        let id = `${ini.slice(0, 7)}-${slugTxt(local)}-${dados.tipo}`, k = 2;
        while (cs.some(x => x.id === id)) id = `${ini.slice(0, 7)}-${slugTxt(local)}-${dados.tipo}-${k++}`;
        return [...cs, { id, ...dados, ...(obs ? { obs } : {}) }];
      }, `Calendário: acrescentar ${nome}`);
    }
    gEdit = null; vistaGerir(); msgG('g-msg', 'Gravado. O site público atualiza em 1 a 2 minutos.');
  } catch (e) { msgG('g-msg', e.message, true); }
}
async function apagarComp(id) {
  const x = (ESTADO.calRaw?.competicoes || []).find(c => c.id === id);
  if (!x || !confirm(`Apagar "${x.nome}" (${dataPT(x.inicio)}) do calendário?${x.resultados ? '\nOs resultados não são apagados.' : ''}`)) return;
  try { await gravarCalendario(cs => cs.filter(c => c.id !== id), `Calendário: apagar ${x.nome}`); if (gEdit === id) gEdit = null; vistaGerir(); msgG('g-msg', 'Apagada.'); }
  catch (e) { vistaGerir(); msgG('g-msg', e.message, true); }
}

/* ---------- Recordes do clube ---------- */
const PROVAS_REC = { 25: ['50m Livres', '100m Livres', '200m Livres', '400m Livres', '800m Livres', '1500m Livres', '50m Costas', '100m Costas', '200m Costas', '50m Bruços', '100m Bruços', '200m Bruços', '50m Mariposa', '100m Mariposa', '200m Mariposa', '100m Estilos', '200m Estilos', '400m Estilos'] };
PROVAS_REC[50] = PROVAS_REC[25].filter(p => p !== '100m Estilos');
const anoRefEpoca = data => { const [a, m] = data.split('-').map(Number); return m >= 9 ? a + 1 : a; };   // época começa a 1 de setembro
const escalaoRec = idade => idade >= 19 ? 'Seniores' : idade >= 17 ? 'Juniores' : idade >= 15 ? 'Juvenis' : idade >= 13 ? 'Infantis' : null;
function catsRecorde(idade) {
  const cs = ['Absolutos'], e = escalaoRec(idade);
  if (e) cs.push(e);
  if (idade >= 13 && idade <= 18) cs.push(`${idade} anos`);
  return cs;
}
const chaveRec = (cat, gen, pisc, prova) => `${cat}|${gen}|${pisc}|${prova}`;
/* Parte dos recordes do ficheiro e aplica, por ordem cronológica, os resultados das competições carregadas.
   Um resultado mais rápido (estritamente) passa logo a ser o recorde do clube. */
function calcularRecordes() {
  ESTADO.recAtual = {};
  if (!ESTADO.rec) return;
  for (const r of ESTADO.rec.recordes) ESTADO.recAtual[chaveRec(r.cat, r.gen, r.pisc, r.prova)] = { ...r, t: seg(r.tempo), novo: false };
  const ls = [...ESTADO.linhasTodas].filter(l => l.res != null && l.ano).sort((a, b) => a.c.inicio.localeCompare(b.c.inicio) || a.nprova - b.nprova);
  for (const l of ls) {
    const idade = anoRefEpoca(l.c.inicio) - l.ano;
    for (const cat of catsRecorde(idade)) {
      const k = chaveRec(cat, l.genero, l.piscina, l.prova), atual = ESTADO.recAtual[k];
      if (!PROVAS_REC[l.piscina]?.includes(l.prova)) continue;
      if (!atual || l.res < atual.t) {
        ESTADO.recAtual[k] = { cat, gen: l.genero, pisc: l.piscina, prova: l.prova, tempo: fmt(l.res), t: l.res, nadador: l.nadador, ano: l.ano, idade, data: l.c.inicio, comp: l.c.nome, local: l.c.local, novo: true, anterior: atual || null, compId: l.comp };
        (l.recs ||= []).push({ cat, anterior: atual || null });
      }
    }
  }
}
const ordemCatRec = c => (ESTADO.rec?.categorias || []).indexOf(c);
const chipRec = l => l.recs && l.recs.length ? `<span class="chip recorde" title="${esc(l.recs.map(r => r.cat).join(', '))}">Recorde do clube</span>` : '';
const textoRec = l => (l.recs || []).sort((a, b) => ordemCatRec(a.cat) - ordemCatRec(b.cat)).map(r => r.cat).join(', ');
function tabRecordesBatidos(ls) {
  const xs = ls.filter(l => l.recs && l.recs.length).sort((a, b) => a.c.inicio.localeCompare(b.c.inicio) || a.nprova - b.nprova);
  if (!xs.length) return '<p class="vazio">Nenhum recorde do clube batido.</p>';
  const corpo = xs.flatMap(l => l.recs.sort((a, b) => ordemCatRec(a.cat) - ordemCatRec(b.cat)).map(r => `<tr><td><span class="chip recorde">${esc(r.cat)}</span></td><td>${esc(l.prova)} <span class="ref-lbl">${l.piscina}m · ${l.genero === 'F' ? 'Fem.' : 'Masc.'}</span></td><td><a href="#atleta/${slug(l.nadador)}">${esc(l.nadador)}</a></td><td class="t rp">${fmt(l.res)}</td>
    <td>${r.anterior ? `<span class="t">${esc(r.anterior.tempo)}</span> <span class="ref-lbl">${esc(r.anterior.nadador)} · ${r.anterior.data ? dataPT(r.anterior.data) : ''}</span>` : '<span class="ref-lbl">sem registo</span>'}</td><td>${esc(l.c.local)} <span class="ref-lbl">${dataPT(l.c.inicio)}</span></td></tr>`)).join('');
  return `<div class="tab-wrap"><table><thead><tr><th>Categoria</th><th>Prova</th><th>Nadador</th><th>Novo recorde</th><th>Recorde anterior</th><th>Competição</th></tr></thead><tbody>${corpo}</tbody></table></div>`;
}

const recF = { gen: 'M', cat: 'Absolutos', pisc: '25', vista: 'consulta' };
function linhaRec(r) {
  if (!r) return '<td class="nrp">—</td><td></td><td></td><td></td><td></td><td></td>';
  return `<td class="t"><strong>${esc(r.tempo)}</strong>${r.novo ? ' <span class="chip recorde">Novo</span>' : ''}</td><td>${esc(r.nadador)}</td><td class="n">${r.ano}</td><td class="n">${r.idade}</td><td>${dataPT(r.data)}</td><td>${r.compId ? `<a href="#comp/${r.compId}">${esc(r.comp)}</a>` : esc(r.comp)} <span class="ref-lbl">${esc(r.local)}</span>${r.novo && r.anterior ? `<div class="ref-lbl">Anterior: ${esc(r.anterior.tempo)} · ${esc(r.anterior.nadador)}</div>` : ''}</td>`;
}
function celResumo(r) {
  if (!r) return '<td class="nrp">—</td>';
  return `<td><span class="t"><strong>${esc(r.tempo)}</strong></span>${r.novo ? ' <span class="chip recorde">Novo</span>' : ''}<div class="ref-lbl">${esc(r.nadador)} · ${r.data.slice(0, 4)}</div></td>`;
}
function vistaRecordes() {
  if (!ESTADO.rec) { app.innerHTML = '<p class="aviso erro">Falta o ficheiro data/recordes.json.</p>'; return; }
  const R = ESTADO.rec, A = ESTADO.recAtual;
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;
  const nomeCat = c => c === 'Seniores' ? 'Seniores (≥ 19 anos)' : c === 'Juniores' ? 'Juniores (17–18 anos)' : c === 'Juvenis' ? 'Juvenis (15–16 anos)' : c === 'Infantis' ? 'Infantis (13–14 anos)' : c === 'Absolutos' ? 'Absolutos (todas as idades)' : c;
  const novos = Object.values(A).filter(r => r.novo).length;
  const resumo = recF.vista === 'resumo';
  let corpo, cab, subt;
  if (resumo) {
    const provas = PROVAS_REC[25];
    cab = '<tr><th>Prova</th><th>Masculinos · PC (25m)</th><th>Masculinos · PL (50m)</th><th>Femininos · PC (25m)</th><th>Femininos · PL (50m)</th></tr>';
    corpo = provas.map(p => `<tr><td><strong>${esc(p)}</strong></td>${[['M', 25], ['M', 50], ['F', 25], ['F', 50]].map(([g, pc]) => PROVAS_REC[pc].includes(p) ? celResumo(A[chaveRec(recF.cat, g, pc, p)]) : '<td class="nrp">n/a</td>').join('')}</tr>`).join('');
    subt = `${nomeCat(recF.cat)} · masculinos e femininos · piscina curta e longa`;
  } else {
    cab = '<tr><th>Prova</th><th>Tempo</th><th>Nadador(a)</th><th class="n">Nasc.</th><th class="n">Idade</th><th>Data</th><th>Competição</th></tr>';
    corpo = PROVAS_REC[recF.pisc].map(p => `<tr><td><strong>${esc(p)}</strong></td>${linhaRec(A[chaveRec(recF.cat, recF.gen, +recF.pisc, p)])}</tr>`).join('');
    subt = `${recF.gen === 'M' ? 'Masculinos' : 'Femininos'} · ${nomeCat(recF.cat)} · ${recF.pisc === '25' ? 'Piscina curta (25m)' : 'Piscina longa (50m)'}`;
  }
  app.innerHTML = `
  ${impCab('Recordes do Clube', subt)}
  <div class="cab"><div><h1>Recordes do clube</h1><div class="meta">${esc(R.fonte)} · versão de ${dataPT(R.versao)}${novos ? ` · <strong>${novos} recorde${novos > 1 ? 's' : ''} novo${novos > 1 ? 's' : ''} esta época</strong>` : ''}</div></div>
    <div class="acoes"><button class="btn" onclick="window.print()">PDF (A4)</button><button class="btn amar" onclick="excelRecordes()">Excel</button></div></div>
  <section class="sec">
    <div class="filtros">
      <label>Vista <select id="rf-vista">${opt('consulta', 'Consulta', recF.vista)}${opt('resumo', 'Resumo por categoria (M/F · PC/PL)', recF.vista)}</select></label>
      ${resumo ? '' : `<label>Género <select id="rf-gen">${opt('M', 'Masculinos', recF.gen)}${opt('F', 'Femininos', recF.gen)}</select></label>`}
      <label>Categoria <select id="rf-cat"><optgroup label="Absolutos e escalões">${R.categorias.filter(c => !c.endsWith('anos')).map(c => opt(c, nomeCat(c), recF.cat)).join('')}</optgroup><optgroup label="Por idade">${R.categorias.filter(c => c.endsWith('anos')).map(c => opt(c, c, recF.cat)).join('')}</optgroup></select></label>
      ${resumo ? '' : `<label>Piscina <select id="rf-pisc">${opt('25', 'Curta (25m)', recF.pisc)}${opt('50', 'Longa (50m)', recF.pisc)}</select></label>`}
    </div>
    <h3 class="so-imp">${esc(subt)}</h3>
    <div class="tab-wrap"><table class="tab-rec">${`<thead>${cab}</thead><tbody>${corpo}</tbody>`}</table></div>
    <p class="ref-lbl nota-tac">Idade desportiva = ano de referência da época − ano de nascimento (a época começa a 1 de setembro). Escalões: Infantis 13–14, Juvenis 15–16, Juniores 17–18, Seniores ≥ 19; Absolutos = todas as idades. "Novo" = recorde batido numa competição desta época carregada no site (assumido de imediato). Nomes dos recordes antigos com a grafia da fonte (sem acentos).</p>
  </section>
  ${impRod(R.fonte)}`;
  const at = () => { const v = id => document.getElementById(id); recF.vista = v('rf-vista').value; recF.cat = v('rf-cat').value; if (v('rf-gen')) recF.gen = v('rf-gen').value; if (v('rf-pisc')) recF.pisc = v('rf-pisc').value; vistaRecordes(); };
  ['rf-vista', 'rf-gen', 'rf-cat', 'rf-pisc'].forEach(id => { const el = document.getElementById(id); if (el) el.onchange = at; });
}
async function excelRecordes() {
  try {
    const X = await carregarExcel(), wb = new X.Workbook(), A = ESTADO.recAtual;
    const cab = ['Categoria', 'Género', 'Piscina', 'Prova', 'Tempo', 'Nadador', 'Nasc.', 'Idade', 'Data', 'Competição', 'Local', 'Novo esta época', 'Recorde anterior'];
    const ls = [];
    for (const cat of ESTADO.rec.categorias) for (const g of ['M', 'F']) for (const pc of [25, 50]) for (const p of PROVAS_REC[pc]) {
      const r = A[chaveRec(cat, g, pc, p)];
      ls.push([cat, g === 'M' ? 'Masculino' : 'Feminino', pc + 'm', p, r ? r.tempo : '—', r?.nadador || '', r?.ano || '', r?.idade || '', r ? dataPT(r.data) : '', r?.comp || '', r?.local || '', r?.novo ? 'Sim' : '', r?.novo && r.anterior ? `${r.anterior.tempo} (${r.anterior.nadador})` : '']);
    }
    folha(wb, 'Recordes', cab, ls);
    await gravar(wb, 'recordes-clube-FOCA.xlsx');
  } catch (e) { alert(e.message); }
}

/* ---------- Melhores marcas (RP por nadador, com TAC) ---------- */
const mmF = { nome: '', pisc: 'ambas' };
function tacDeTempo(nome, prova, pisc, t) {     // TAC conseguidos (próprios e ↑) ou o mais próximo em falta
  if (!ESTADO.tac) return { ok: [], falta: null };
  const tab = tacTabela(pisc, generoDe(nome), prova);
  const cols = colunasCat(catDe(anoDe(nome), escalaoDe(nome)));
  if (!tab || !cols.length) return { ok: [], falta: null, semTabela: !tab };
  const ok = cols.filter(c => tab[c.id] && t <= seg(tab[c.id])).map(c => ({ ...c, tac: seg(tab[c.id]) }));
  let falta = null;
  if (!ok.some(c => !c.sup)) {
    const prop = cols.filter(c => !c.sup && tab[c.id]).map(c => ({ ...c, tac: seg(tab[c.id]) })).sort((a, b) => b.tac - a.tac)[0];
    if (prop) falta = { ...prop, d: t / prop.tac * 100 - 100 };
  }
  return { ok, falta };
}
function celTacMM(x) {
  const vistos = new Set();
  const chips = x.ok.filter(c => { const k = rotTac(c); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map(c => `<span class="chip tac${c.sup ? ' sup' : ''}" title="${esc(c.col.nome)} · TAC ${fmt(c.tac)}">${esc(rotTac(c))}</span>`).join(' ');
  const falta = x.falta ? `<span class="ref-lbl">Sem TAC · falta ${pct(x.falta.d)} para ${esc(x.falta.col.campeonato)} (${fmt(x.falta.tac)})</span>` : '';
  return chips ? chips + (falta ? '<br>' + falta : '') : (falta || '<span class="nrp">—</span>');
}
function linhasMM(nome) {
  return rpAtuais(nome).filter(r => mmF.pisc === 'ambas' || String(r.pisc) === mmF.pisc).map(r => ({ ...r, tacX: tacDeTempo(nome, r.prova, r.pisc, r.t) }));
}
function vistaMelhores(nomeRota) {
  if (nomeRota) mmF.nome = nomeRota;
  const nome = mmF.nome;
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;
  const cab = `<div class="cab nao-imp"><div><h1>Melhores marcas</h1><div class="meta">RP de cada nadador (tabela de ${ESTADO.rps?.dataTabela ? dataPT(ESTADO.rps.dataTabela) : '—'} + competições carregadas) com indicação de TAC</div></div>
    <div class="acoes">${nome ? '<button class="btn" onclick="window.print()">PDF (A4)</button>' : ''}<button class="btn amar" onclick="excelMelhores()">Excel${nome ? '' : ' (todos)'}</button></div></div>
    <section class="sec nao-imp"><div class="filtros">
      <label>Nadador <select id="mm-nome"><option value="">Escolher nadador…</option>${ESTADO.nadadores.map(n => opt(n, n, nome)).join('')}</select></label>
      <label>Piscina <select id="mm-pisc">${opt('25', 'Curta (25m)', mmF.pisc)}${opt('50', 'Longa (50m)', mmF.pisc)}${opt('ambas', 'Curta e longa', mmF.pisc)}</select></label>
    </div></section>`;
  let corpo = '';
  if (!nome) corpo = '<p class="aviso">Escolhe um nadador.</p>';
  else {
    const ls = linhasMM(nome), ano = anoDe(nome), cat = catsTAC()[catDe(ano, escalaoDe(nome))];
    const nTac = new Set(ls.filter(r => r.tacX.ok.some(c => !c.sup)).map(r => r.prova + r.pisc)).size;
    const linhas = ls.map(r => `<tr><td><strong>${esc(r.prova)}</strong></td><td class="n">${r.pisc}m</td><td class="t"><strong>${fmt(r.t)}</strong></td><td>${r.compId ? `<a href="#comp/${r.compId}">${esc(r.onde)}</a>` : esc(r.onde)}${r.quando ? ` <span class="ref-lbl">${dataPT(r.quando)}</span>` : ''}</td><td>${celTacMM(r.tacX)}</td></tr>`).join('');
    corpo = `${impCab('Melhores marcas · ' + nome, `${cat ? cat.nome : ''}${ano ? ' · ' + ano : ''} · ${mmF.pisc === 'ambas' ? 'Piscina curta e longa' : mmF.pisc === '25' ? 'Piscina curta' : 'Piscina longa'}`)}
      <div class="cab"><div><h2 class="nome-mm">${esc(nome)}</h2><div class="meta">${ano ? 'Ano ' + ano + ' · ' : ''}${generoDe(nome) === 'F' ? 'Feminino' : 'Masculino'}${cat ? ' · categoria de acesso: <strong>' + esc(cat.nome) + '</strong>' : ''} · ${ls.length} marcas · TAC em ${nTac} prova${nTac === 1 ? '' : 's'}</div></div>
        <div class="acoes nao-imp"><a class="btn sec mini" href="#atleta/${slug(nome)}">Ficha do atleta</a></div></div>
      <section class="sec"><div class="tab-wrap"><table><thead><tr><th>Prova</th><th class="n">Piscina</th><th>Tempo</th><th>Origem</th><th>TAC</th></tr></thead><tbody>${linhas || '<tr><td colspan="5" class="vazio">Sem marcas nesta piscina.</td></tr>'}</tbody></table></div>${notaTac()}</section>
      ${impRod(ESTADO.rps?.fonte || '')}`;
  }
  app.innerHTML = cab + corpo;
  document.getElementById('mm-nome').onchange = e => { location.hash = e.target.value ? '#marcas/' + slug(e.target.value) : '#marcas'; mmF.nome = e.target.value; if (!e.target.value) vistaMelhores(); };
  document.getElementById('mm-pisc').onchange = e => { mmF.pisc = e.target.value; vistaMelhores(); };
}
async function excelMelhores() {
  try {
    const X = await carregarExcel(), wb = new X.Workbook();
    const nomes = mmF.nome ? [mmF.nome] : ESTADO.nadadores;
    const txtTac = x => { const v = new Set(); return x.ok.filter(c => { const k = rotTac(c); if (v.has(k)) return false; v.add(k); return true; }).map(c => rotTac(c)).join('; '); };
    const ls = nomes.flatMap(n => linhasMM(n).map(r => [n, anoDe(n) || '', generoDe(n) === 'F' ? 'F' : 'M', r.prova, r.pisc + 'm', fmt(r.t), r.onde, r.quando ? dataPT(r.quando) : '', txtTac(r.tacX), r.tacX.falta ? `${pct(r.tacX.falta.d)} para ${r.tacX.falta.col.campeonato}` : '']));
    folha(wb, 'Melhores marcas', ['Nadador', 'Ano', 'Género', 'Prova', 'Piscina', 'Tempo', 'Origem', 'Data', 'TAC', 'Falta para TAC'], ls);
    await gravar(wb, mmF.nome ? `melhores-marcas-${slugTxt(mmF.nome)}.xlsx` : 'melhores-marcas-todos.xlsx');
  } catch (e) { alert(e.message); }
}

/* ---------- Estafetas (melhor equipa a partir das melhores marcas) ---------- */
const ESTAFETAS = [
  { id: '4x50L', nome: '4x50m Livres', dist: 50, estilos: ['Livres', 'Livres', 'Livres', 'Livres'], tac: '4x50m Livres', mista: true },
  { id: '4x100L', nome: '4x100m Livres', dist: 100, estilos: ['Livres', 'Livres', 'Livres', 'Livres'], tac: '4x100m Livres', mista: true },
  { id: '4x200L', nome: '4x200m Livres', dist: 200, estilos: ['Livres', 'Livres', 'Livres', 'Livres'], tac: '4x200m Livres', mista: false },
  { id: '4x50E', nome: '4x50m Estilos', dist: 50, estilos: ['Costas', 'Bruços', 'Mariposa', 'Livres'], tac: '4x50m Estilos', mista: true },
  { id: '4x100E', nome: '4x100m Estilos', dist: 100, estilos: ['Costas', 'Bruços', 'Mariposa', 'Livres'], tac: '4x100m Estilos', mista: true }
];
/* Categorias de estafeta → categorias de acesso (tac.json) e colunas de TAC de estafeta a comparar */
const CATS_EST = [
  { id: 'juvB', nome: 'Juvenis B', cats: ['juvB'], tac: ['juvB_jul', 'juvB_mar', 'juvB_zon'] },
  { id: 'juvA', nome: 'Juvenis A', cats: ['juvA'], tac: ['juvA_jul', 'juvA_mar', 'juvA_zon'] },
  { id: 'juv', nome: 'Juvenis (A + B)', cats: ['juvB', 'juvA'], tac: ['juvA_jul', 'juvA_mar', 'juvA_zon'] },
  { id: 'jun', nome: 'Juniores (1.º e 2.º ano)', cats: ['jun1', 'jun2'], tac: ['junior', 'junior1'] },
  { id: 'sen', nome: 'Seniores (Sub21 + Sénior)', cats: ['sub21', 'sen'], tac: ['senior', 'sub21'] },
  { id: 'abs', nome: 'Absoluta (todas as idades)', cats: null, tac: ['senior'] }
];
const estF = { est: '4x100L', gen: 'M', pisc: '25', cat: 'abs', lap: 0.4, fora: new Set() };
function elegiveis() {
  const ce = CATS_EST.find(c => c.id === estF.cat), cs = catsTAC();
  return ESTADO.nadadores.filter(n => {
    const g = generoDe(n);
    if (estF.gen !== 'X' && g !== estF.gen) return false;
    if (!ce.cats) return true;
    const i = catDe(anoDe(n), escalaoDe(n));
    return i >= 0 && ce.cats.includes(cs[i].id);
  });
}
function tempoPerna(nome, prova, pisc) {      // tempo na piscina da competição; se faltar, o da outra piscina (com alerta)
  const rps = rpAtuais(nome);
  const a = rps.find(r => r.prova === prova && r.pisc === pisc);
  if (a) return { t: a.t, pisc, outra: false };
  const b = rps.find(r => r.prova === prova && r.pisc !== pisc);
  return b ? { t: b.t, pisc: b.pisc, outra: true } : null;
}
function melhoresEquipas(E, nadadores, pisc, mista) {
  const pernas = E.estilos.map(es => `${E.dist}m ${es}`);
  const cand = pernas.map(pr => nadadores.map(n => ({ n, g: generoDe(n), ...(tempoPerna(n, pr, pisc) || {}) })).filter(x => x.t != null).sort((a, b) => a.t - b.t));
  const K = 6, lim = l => mista ? [...l.filter(x => x.g === 'M').slice(0, K), ...l.filter(x => x.g === 'F').slice(0, K)] : l.slice(0, K);
  const equipas = [];
  const livres = E.estilos.every(e => e === 'Livres');
  if (livres) {                                  // 4 nadadores distintos, a ordem não altera a soma
    const L = lim(cand[0]).slice(0, 12);
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) for (let c = b + 1; c < L.length; c++) for (let d = c + 1; d < L.length; d++) {
      const eq = [L[a], L[b], L[c], L[d]];
      if (mista && eq.filter(x => x.g === 'M').length !== 2) continue;
      eq.sort((x, y) => x.t - y.t);
      equipas.push([eq[1], eq[2], eq[3], eq[0]]);   // proposta: o mais rápido a fechar
    }
  } else {
    const L = cand.map(lim);
    for (const a of L[0]) for (const b of L[1]) { if (b.n === a.n) continue; for (const c of L[2]) { if (c.n === a.n || c.n === b.n) continue; for (const d of L[3]) {
      if (d.n === a.n || d.n === b.n || d.n === c.n) continue;
      const eq = [a, b, c, d];
      if (mista && eq.filter(x => x.g === 'M').length !== 2) continue;
      equipas.push(eq);
    } } }
  }
  const soma = eq => eq.reduce((s, x) => s + x.t, 0);
  equipas.sort((x, y) => soma(x) - soma(y));
  const vistas = new Set(), out = [];
  for (const eq of equipas) { const k = eq.map(x => x.n).sort().join('|') + (livres ? '' : '#' + eq.map(x => x.n).join('|')); if (vistas.has(k)) continue; vistas.add(k); out.push({ eq, soma: soma(eq) }); if (out.length === 3) break; }
  const usados = out[0] ? new Set(out[0].eq.map(x => x.n)) : new Set();
  const suplentes = pernas.map((pr, i) => (livres && i > 0) ? null : cand[i].filter(x => !usados.has(x.n)).slice(0, 3));
  return { pernas, equipas: out, suplentes, cand };
}
function vistaEstafetas() {
  const E = ESTAFETAS.find(e => e.id === estF.est);
  if (estF.gen === 'X' && !E.mista) estF.gen = 'M';
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;
  const pisc = +estF.pisc, ce = CATS_EST.find(c => c.id === estF.cat);
  const elig = elegiveis(), disp = elig.filter(n => !estF.fora.has(n));
  const R = melhoresEquipas(E, disp, pisc, estF.gen === 'X');
  const lap = Math.max(0, +estF.lap || 0);
  const est = s => s - 3 * lap;
  const tacTab = ESTADO.tac?.tempos?.[estF.pisc]?.[estF.gen]?.[E.tac] || null;
  const tacs = ce.tac.filter(id => tacTab && tacTab[id]).map(id => ({ col: colTAC(id), t: seg(tacTab[id]) }));
  const alertas = [];
  const blocoEq = (x, i) => {
    const linhas = x.eq.map((p, k) => {
      if (p.outra) alertas.push(`${p.n}: ${R.pernas[k]} com tempo de piscina ${p.pisc === 50 ? 'longa (50m)' : 'curta (25m)'} — não tem marca em ${pisc}m.`);
      const parc = k === 0 ? p.t : p.t - lap;
      return `<tr><td class="n">${k + 1}</td><td>${esc(R.pernas[k])}</td><td><strong>${esc(p.n)}</strong> <span class="ref-lbl">${p.g === 'F' ? 'F' : 'M'} · ${anoDe(p.n) || ''}</span></td><td class="t">${fmt(p.t)}${p.outra ? ` <span class="chip est" title="Tempo de outra piscina">⚠ ${p.pisc}m</span>` : ''}</td><td class="t">${fmt(parc)}${k > 0 && lap ? ' <span class="ref-lbl">(lançado)</span>' : ''}</td></tr>`;
    }).join('');
    const tot = est(x.soma);
    const cmp = tacs.map(tc => tot <= tc.t ? `<span class="chip rp">TAC ${esc(tc.col.campeonato)} · ${esc(tc.col.nome)} (${fmt(tc.t)})</span>` : `<span class="chip est">${esc(tc.col.campeonato)} · ${esc(tc.col.nome)}: falta ${fmt(tot - tc.t)} s (${fmt(tc.t)})</span>`).join(' ');
    return `<div class="cartao eq ${i === 0 ? 'melhor' : ''}"><div class="ct">${i === 0 ? 'Melhor equipa' : i + 1 + '.ª alternativa'}</div>
      <div class="tab-wrap"><table><thead><tr><th class="n">#</th><th>Percurso</th><th>Nadador</th><th>Melhor marca</th><th>Parcial estimado</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <div class="tot"><div>Soma das marcas <strong class="t">${fmt(x.soma)}</strong></div><div>Estimado com LAP (−${lap.toFixed(2).replace('.', ',')} s × 3) <strong class="t rp">${fmt(tot)}</strong></div></div>
      ${cmp ? `<div style="margin-top:6px">${cmp}</div>` : ''}</div>`;
  };
  const equipasH = R.equipas.length ? R.equipas.map(blocoEq).join('') : `<p class="aviso">Não há nadadores suficientes com marcas para esta estafeta (${disp.length} disponíveis${estF.gen === 'X' ? '; são precisos 2 M + 2 F' : ''}).</p>`;
  const alertU = [...new Set(alertas)];
  const sup = R.equipas.length ? R.pernas.map((pr, i) => R.suplentes[i] ? `<tr><td>${esc(pr)}</td><td>${R.suplentes[i].map(x => `${esc(x.n)} <span class="t ref-lbl">${fmt(x.t)}${x.outra ? ' ⚠' + x.pisc + 'm' : ''}</span>`).join(' · ') || '—'}</td></tr>` : '').join('') : '';
  const lista = elig.map(n => { const on = !estF.fora.has(n); return `<label class="disp ${on ? '' : 'off'}"><input type="checkbox" data-n="${esc(n)}" ${on ? 'checked' : ''}> ${esc(n)} <span class="ref-lbl">${generoDe(n) === 'F' ? 'F' : 'M'} · ${anoDe(n) || ''}</span></label>`; }).join('');
  app.innerHTML = `
  ${impCab('Estafeta ' + E.nome, `${{ M: 'Masculinos', F: 'Femininos', X: 'Mista (2 M + 2 F)' }[estF.gen]} · ${ce.nome} · Piscina ${pisc}m`)}
  <div class="cab"><div><h1>Estafetas</h1><div class="meta">Melhor equipa a partir das melhores marcas (tabela de RP + competições)</div></div>
    <div class="acoes"><button class="btn" onclick="window.print()">PDF (A4)</button></div></div>
  <section class="sec nao-imp"><div class="filtros">
    <label>Estafeta <select id="ef-est">${ESTAFETAS.map(e => opt(e.id, e.nome, estF.est)).join('')}</select></label>
    <label>Género <select id="ef-gen">${opt('M', 'Masculinos', estF.gen)}${opt('F', 'Femininos', estF.gen)}${E.mista ? opt('X', 'Mista (2 M + 2 F)', estF.gen) : ''}</select></label>
    <label>Categoria <select id="ef-cat">${CATS_EST.map(c => opt(c.id, c.nome, estF.cat)).join('')}</select></label>
    <label>Piscina <select id="ef-pisc">${opt('25', 'Curta (25m)', estF.pisc)}${opt('50', 'Longa (50m)', estF.pisc)}</select></label>
    <label>LAP (s por nadador lançado) <input type="number" id="ef-lap" step="0.05" min="0" max="2" value="${lap}" style="width:90px"></label>
  </div></section>
  ${alertU.length ? `<div class="aviso alerta"><strong>⚠ Atenção:</strong> foram usados tempos de outra piscina porque não há marca em ${pisc}m:<ul>${alertU.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
  <div class="cartoes eqs">${equipasH}</div>
  ${sup ? `<section class="sec"><h2>Suplentes por percurso</h2><div class="tab-wrap"><table><thead><tr><th>Percurso</th><th>Próximos melhores (fora da melhor equipa)</th></tr></thead><tbody>${sup}</tbody></table></div></section>` : ''}
  <section class="sec nao-imp"><h2>Nadadores disponíveis <span class="ref-lbl">(${disp.length} de ${elig.length})</span></h2>
    <p class="ref-lbl" style="margin-top:-6px">Desmarca quem não está disponível; a equipa recalcula na hora. <button class="btn sec mini" id="ef-todos">Marcar todos</button></p>
    <div class="lista-disp">${lista || '<p class="vazio">Sem nadadores nesta categoria.</p>'}</div></section>
  <p class="ref-lbl nota-tac">Estimativa = soma das melhores marcas individuais − LAP por cada um dos 3 nadadores com partida lançada. Estilos: a melhor combinação possível (Costas, Bruços, Mariposa, Livres) sem repetir nadadores. Mista: 2 masculinos + 2 femininos. Quando falta a marca na piscina da competição usa-se a da outra piscina, sem conversão, com alerta.</p>
  ${impRod('')}`;
  const v = id => document.getElementById(id);
  v('ef-est').onchange = e => { estF.est = e.target.value; vistaEstafetas(); };
  v('ef-gen').onchange = e => { estF.gen = e.target.value; vistaEstafetas(); };
  v('ef-cat').onchange = e => { estF.cat = e.target.value; vistaEstafetas(); };
  v('ef-pisc').onchange = e => { estF.pisc = e.target.value; vistaEstafetas(); };
  v('ef-lap').onchange = e => { estF.lap = e.target.value; vistaEstafetas(); };
  v('ef-todos').onclick = () => { estF.fora.clear(); vistaEstafetas(); };
  document.querySelectorAll('.lista-disp input').forEach(c => { c.onchange = () => { c.checked ? estF.fora.delete(c.dataset.n) : estF.fora.add(c.dataset.n); vistaEstafetas(); }; });
}

/* ---------- Navegação ---------- */
function rota() {
  let [v, arg] = location.hash.replace(/^#/, '').split('/');
  const a = arg ? decodeURIComponent(arg) : '';
  if (v && !grupoAtual().menu.includes(v) && !['fichas', 'gerir'].includes(v)) v = 'epoca';
  desenharLateral();
  document.querySelectorAll('#menu a').forEach(x => x.classList.toggle('ativo', x.dataset.v === (v === 'fichas' || v === 'gerir' ? 'comp' : (v || 'epoca'))));
  if (v === 'comp') a ? vistaComp(a) : vistaListaComps();
  else if (v === 'atleta') vistaAtleta(a);
  else if (v === 'fichas') vistaFichas(a);
  else if (v === 'tac') vistaTac();
  else if (v === 'gerir') vistaGerir();
  else if (v === 'recordes') vistaRecordes();
  else if (v === 'marcas') vistaMelhores(a);
  else if (v === 'estafetas') vistaEstafetas();
  else vistaEpoca();
  window.scrollTo(0, 0);
}

(async () => {
  try {
    await carregar();
    desenharMenu();
    document.getElementById('epoca-lbl').textContent = ESTADO.epoca;
    document.getElementById('gerado').textContent = 'Atualizado em ' + hoje();
    window.addEventListener('hashchange', rota);
    rota();
  } catch (e) {
    app.innerHTML = `<p class="aviso erro">${esc(e.message)}. Se abriste o ficheiro com duplo clique, usa o endereço do GitHub Pages.</p>`;
  }
})();
