/* Relatórios de Provas · FOCA Quinta da Lixa - CNF
   Dados: data/competicoes.json (índice) + data/<competição>.json
   Regras de RP: ver CONTEXTO_RELATORIOS.md, secção 2. */
'use strict';

const ESTADO = { epoca: '', comps: [], linhas: [], nadadores: [], tac: null, calendario: [], calRaw: null, rec: null, recAtual: {} };
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
  ESTADO.comps = comps;
  try { const t = await fetch('data/tac.json', { cache: 'no-store' }); if (t.ok) ESTADO.tac = await t.json(); } catch (e) { ESTADO.tac = null; }
  try { const r2 = await fetch('data/recordes.json', { cache: 'no-store' }); if (r2.ok) ESTADO.rec = await r2.json(); } catch (e) { ESTADO.rec = null; }
  let cal = null;
  try { const k = await fetch('data/calendario.json', { cache: 'no-store' }); if (k.ok) cal = await k.json(); } catch (e) { cal = null; }
  ESTADO.calRaw = cal;
  ESTADO.calendario = juntarCalendario(cal);
  calcular();
}

/* ---------- Cálculo de RP (cronológico) ---------- */
function calcular() {
  const melhor = {};          // nadador|prova|piscina → {t, local, data}
  const linhas = [];
  for (const c of ESTADO.comps) {
    const rs = [...c.resultados].sort((a, b) => a.nprova - b.nprova);
    for (const r of rs) {
      const k = `${r.nadador}|${r.prova}|${c.piscina}`;
      const res = r.estado === 'OK' ? seg(r.resultado) : null;
      let ref = seg(r.ref), tipo = null;
      if (ref != null) tipo = r.inscPiscina === c.piscina ? `Inscrição (${r.inscPiscina}m)` : 'Tempo convertido';
      const ant = melhor[k];
      if (ant && (ref == null || ant.t < ref)) { ref = ant.t; tipo = `Resultado anterior · ${ant.local}`; }
      let ePR = false, prim = false, p = null, melh = null;
      if (res != null) {
        if (ref == null) { ePR = true; prim = true; tipo = 'RP · 1.º tempo'; }
        else { p = res / ref * 100; ePR = res < ref; if (ePR) melh = 100 - p; }
        if (!ant || res < ant.t) melhor[k] = { t: res, local: c.local, data: c.inicio };
      }
      const l = { ...r, comp: c.id, c, piscina: c.piscina, res, refS: ref, tipo, ePR, prim, p, melh };
      l.tac = tacObtidos(l);
      linhas.push(l);
    }
  }
  ESTADO.linhas = linhas;
  ESTADO.nadadores = [...new Set(linhas.map(l => l.nadador))].sort((a, b) => a.localeCompare(b, 'pt'));
  calcularRecordes();
}

/* RP atual por prova e piscina: o mais rápido entre inscrições e resultados */
function rpAtuais(nome) {
  const m = {};
  const pôr = (prova, pisc, t, onde, quando, origem) => {
    if (t == null || !pisc) return;
    const k = prova + '|' + pisc;
    if (!m[k] || t < m[k].t) m[k] = { prova, pisc, t, onde, quando, origem };
  };
  for (const l of ESTADO.linhas.filter(x => x.nadador === nome)) {
    pôr(l.prova, l.inscPiscina, seg(l.insc), 'Inscrição', l.c.inicio, 'Tempo de inscrição');
    pôr(l.prova, l.piscina, l.res, l.c.local, l.c.inicio, 'Resultado');
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
  if (i < 0) return [];
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
const anoDe = nome => (ESTADO.linhas.find(l => l.nadador === nome && l.ano) || {}).ano || null;

/* Situação TAC de um atleta: melhor tempo por prova e piscina contra as colunas aplicáveis */
function tacAtleta(nome, t = '') {
  const todas = ESTADO.linhas.filter(l => l.nadador === nome);
  const ls = linhasTipo(t, todas).filter(l => l.res != null);
  if (!ls.length || !ESTADO.tac) return null;
  const ult = todas[todas.length - 1], ano = anoDe(nome), ci = catDe(ano, ult.escalao);
  const melhores = {};
  for (const l of ls) { const k = l.prova + '|' + l.piscina; if (!melhores[k] || l.res < melhores[k].res) melhores[k] = l; }
  const provas = Object.values(melhores).sort((a, b) => porProva(a.prova, b.prova) || a.piscina - b.piscina);
  return { escalao: ult.escalao, genero: ult.genero, ano, cat: catsTAC()[ci] || null, provas, cols: colunasCat(ci) };
}

/* ---------- Agregados ---------- */
function resumo(ls) {
  const ok = ls.filter(l => l.res != null);
  const rp = ls.filter(l => l.ePR);
  const comRef = ok.filter(l => l.p != null);
  const media = comRef.length ? comRef.reduce((s, l) => s + l.p, 0) / comRef.length : null;
  return {
    nad: new Set(ls.map(l => l.nadador)).size, provas: ls.length,
    rp: rp.length, prim: rp.filter(l => l.prim).length, melh: rp.filter(l => !l.prim).length,
    taxa: ls.length ? rp.length / ls.length * 100 : null, media,
    p1: ls.filter(l => l.lugar === 1).length, p2: ls.filter(l => l.lugar === 2).length, p3: ls.filter(l => l.lugar === 3).length,
    dsq: ls.filter(l => l.estado !== 'OK').length,
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
    <div class="kpi"><div class="v">${s.provas}</div><div class="l">Provas nadadas</div>${s.dsq ? `<div class="d">${s.dsq} DSQ/NC/DNS</div>` : ''}</div>
    <div class="kpi"><div class="v">${s.rp}</div><div class="l">RP</div><div class="d">${s.melh} melhorias + ${s.prim} 1.º tempo</div></div>
    <div class="kpi"><div class="v">${pct0(s.taxa)}</div><div class="l">Provas com RP</div></div>
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
    return `<tr><td>${nome}</td>${extra}<td class="n">${s.provas}</td><td class="n">${s.rp}</td><td class="n">${s.melh}</td><td class="n">${s.prim}</td><td class="n">${pct0(s.taxa)}</td><td class="n">${s.p1 + s.p2 + s.p3}</td></tr>`;
  }).join('');
  return `<div class="tab-wrap"><table><thead><tr><th>${rot}</th>${chave === 'nadador' ? '<th>Escalão</th>' : '<th class="n">Nadadores</th>'}<th class="n">Provas</th><th class="n">RP</th><th class="n">Melhorias</th><th class="n">1.º tempo</th><th class="n">Provas/RP</th><th class="n">Pódios</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}
function celSituacao(l) {
  if (l.estado !== 'OK') return `<span class="chip est">${esc(l.estado)}</span>`;
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
function pontosConfirmar(ls) {
  const xs = [];
  for (const l of ls) {
    if (l.obs) xs.push(`${esc(l.nadador)} · ${esc(l.prova)}: ${esc(l.obs)}`);
    if (l.melh != null && l.melh > 8) xs.push(`${esc(l.nadador)} · ${esc(l.prova)}: melhoria de ${pct(l.melh)} (acima de 8%) — confirmar tempo e inscrição.`);
    if (l.estado !== 'OK') xs.push(`${esc(l.nadador)} · ${esc(l.prova)}: ${esc(l.estado)}.`);
  }
  return xs.length ? `<ul class="lista-pc">${xs.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p class="vazio">Nada a confirmar.</p>';
}
const impCab = (titulo, sub) => `<div class="imp-cab"><img src="logo.png" alt=""><div><div class="it">${esc(titulo)}</div><div class="is">${esc(sub)}</div></div></div>`;
const impRod = fonte => `<div class="imp-rod">FOCA Quinta da Lixa - CNF · Gerado em ${hoje()}${fonte ? ` · Fonte: ${esc(fonte)}` : ''}</div>`;

/* ---------- Tipos de competição e calendário ---------- */
const TIPOS = [
  { id: 'torneio', nome: 'Torneios/Provas' },
  { id: 'zonal', nome: 'Torneios Zonais Juvenis' },
  { id: 'territorial', nome: 'Campeonatos Territoriais' },
  { id: 'nacional', nome: 'Campeonatos Nacionais / Open de Portugal' },
  { id: 'meeting', nome: 'Meetings Internacionais' },
  { id: 'internacional', nome: 'Provas Internacionais' }
];
const nomeTipo = id => (TIPOS.find(t => t.id === id) || {}).nome || 'Todas as competições';
let filtroTipo = '';
try { filtroTipo = localStorage.getItem('foca-tipo') || ''; if (filtroTipo && !TIPOS.some(t => t.id === filtroTipo)) filtroTipo = ''; } catch (e) { filtroTipo = ''; }
function setTipo(t) { filtroTipo = t; try { localStorage.setItem('foca-tipo', t); } catch (e) { /* sem armazenamento */ } rota(); }
const compsTipo = t => ESTADO.comps.filter(c => !t || c.tipo === t);
const linhasTipo = (t, ls = ESTADO.linhas) => ls.filter(l => !t || l.c.tipo === t);
function chipsTipo(contar) {
  return `<div class="tipos nao-imp">${[{ id: '', nome: 'Todas' }, ...TIPOS].map(t => {
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
    let c = e.resultados ? ESTADO.comps.find(x => x.id === e.resultados) : null;
    if (!c) c = ESTADO.comps.find(x => !usados.has(x.id) && normal(x.local) === normal(e.local) && diasEntre(x.inicio, e.inicio) <= 7);
    if (c && !usados.has(c.id)) { usados.add(c.id); e.comp = c; if (e.tipo) c.tipo = e.tipo; }   // o tipo do calendário prevalece
  }
  for (const c of ESTADO.comps) if (!usados.has(c.id)) ents.push({ comp: c });
  for (const c of ESTADO.comps) if (!c.tipo) c.tipo = 'torneio';
  return ents.map(e => {
    const c = e.comp;
    return c ? { id: e.id, obs: e.obs, comp: c, nome: c.nome, inicio: c.inicio, fim: c.fim || c.inicio, local: c.local, piscina: c.piscina, tipo: c.tipo, url: c.url }
      : { id: e.id, obs: e.obs, comp: null, nome: e.nome, inicio: e.inicio, fim: e.fim || e.inicio, local: e.local, piscina: e.piscina, tipo: e.tipo || 'torneio', url: e.url };
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
      return `<tr><td>${dt}</td><td><a href="#comp/${e.comp.id}">${esc(e.nome)}</a></td><td>${esc(e.local)}</td><td class="n">${e.piscina}m</td><td>${esc(nomeTipo(e.tipo))}</td><td class="n">${x.nad}</td><td class="n">${x.provas}</td><td class="n">${x.rp} <span class="ref-lbl">(${x.melh}+${x.prim})</span></td><td class="n">${pct0(x.taxa)}</td><td class="n">${x.p1 + x.p2 + x.p3}</td><td><span class="chip rp">Realizada</span></td></tr>`;
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
  ${impRod('provas.annp.pt')}`;
}

/* ---------- Vistas ---------- */
function vistaEpoca() {
  app.innerHTML = relatorioConjunto('', 'Época ' + ESTADO.epoca, 'Relatório da época · Direção · FOCA Quinta da Lixa - CNF');
}

function vistaListaComps() {
  const contar = t => ESTADO.calendario.filter(e => !t || e.tipo === t).length;
  app.innerHTML = `${chipsTipo(contar)}<div class="nao-imp" style="text-align:right;margin:-8px 0 8px"><a class="btn sec mini" href="#gerir">Gerir calendário</a></div>${relatorioConjunto(filtroTipo, filtroTipo ? nomeTipo(filtroTipo) : 'Competições', 'Época ' + ESTADO.epoca + (filtroTipo ? ' · ' + nomeTipo(filtroTipo) : ' · todas as competições'))}`;
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
  if (!todas.length) return '<p class="aviso">Atleta não encontrado.</p>';
  const ult = todas[todas.length - 1];
  const ls = linhasTipo(t, todas);
  if (!ls.length) return `<div class="ficha"><div class="cab"><div><h1>${esc(nome)}</h1><div class="meta">${esc(ult.escalao)} · ${esc(nomeTipo(t))}</div></div></div><p class="aviso">Sem provas em ${esc(nomeTipo(t))}.</p></div>`;
  const s = resumo(ls);
  const comps = [...new Set(ls.map(l => l.comp))].length;
  const rps = rpAtuais(nome).map(r => `<tr><td>${esc(r.prova)}</td><td class="n">${r.pisc}m</td><td class="t"><strong>${fmt(r.t)}</strong></td><td>${esc(r.origem === 'Resultado' ? r.onde : 'Tempo de inscrição')}</td><td>${r.origem === 'Resultado' ? dataPT(r.quando) : '—'}</td></tr>`).join('');
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
    <section class="sec"><h2>Recordes pessoais atuais <span class="ref-lbl">(toda a época)</span></h2><div class="tab-wrap"><table><thead><tr><th>Prova</th><th class="n">Piscina</th><th>Tempo</th><th>Onde</th><th>Quando</th></tr></thead><tbody>${rps}</tbody></table></div></section>
    ${ESTADO.tac ? `<section class="sec"><h2>TAC e campeonatos${t ? ` <span class="ref-lbl">(${esc(nomeTipo(t))})</span>` : ''}</h2>${secTacAtleta(nome, t)}</section>` : ''}
    ${ls.some(l => l.recs && l.recs.length) ? `<section class="sec"><h2>Recordes do clube</h2>${tabRecordesBatidos(ls)}</section>` : ''}
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
    ${nome ? fichaHTML(nome, filtroTipo) : `<div class="cartoes">${ESTADO.nadadores.map(n => { const s = resumo(linhasTipo(filtroTipo, ESTADO.linhas.filter(l => l.nadador === n))); return `<a class="cartao" href="#atleta/${slug(n)}"><div class="ct">${esc(n)}</div><div class="cm">${s.provas} provas · <strong class="rp">${s.rp} RP</strong> · ${s.p1 + s.p2 + s.p3} pódios</div></a>`; }).join('')}</div>`}`;
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
const detLinhas = ls => ls.map(l => [l.c.local, l.nadador, l.ano || '', l.escalao, l.categoria, l.prova, l.insc ? fmt(seg(l.insc)) : 'NT', l.inscPiscina ? l.inscPiscina + 'm' : '', l.refS != null ? fmt(l.refS) : '', l.tipo || '', l.res != null ? fmt(l.res) : l.estado, l.p != null ? Math.round(l.p * 100) / 100 : null, l.ePR ? (l.prim ? 'RP · 1.º tempo' : 'RP') : '', l.melh != null ? Math.round(l.melh * 100) / 100 : null, l.lugar, textoTac(l), textoRec(l), l.obs || '']);
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
const notaTac = () => `<p class="ref-lbl nota-tac">Só contam resultados de competições (não tempos de inscrição). Resultados em 25m comparam com a tabela de piscina curta e em 50m com a de piscina longa. ${(ESTADO.tac?.notas || []).map(esc).join(' ')} "↑" = TAC de um escalão seguinte. Não é verificado o período de qualificação de cada campeonato.</p>`;

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
const itemObt = o => `<li>${esc(o.l.prova)} <span class="ref-lbl">${o.l.piscina}m · ${esc(o.c.col.nome)}</span> — <span class="t rp">${fmt(o.l.res)}</span> <span class="t ref-lbl">(TAC ${fmt(o.tac)}) · ${esc(o.l.c.local)}, ${dataPT(o.l.c.inicio)}</span></li>`;

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
function tacVisao() {
  const T = ESTADO.tac;
  const c = catsTAC().find(x => x.id === tacF.cat);
  const cols = c ? c.colunas.map(id => ({ id, col: colTAC(id) })) : T.colunas.map(x => ({ id: x.id, col: x }));
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
      <label>Categoria <select id="tf-cat">${catsTAC().map(c => opt(c.id, `${c.nome} (${anosTxt(c)})`, tacF.cat)).join('')}${opt('', 'Todas as colunas', tacF.cat)}</select></label>
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
  ESTADO.calendario = juntarCalendario(cal);
}
const slugTxt = s => normal(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const piscinaPadrao = ini => ini && ini.slice(5, 7) >= '09' ? 25 : 50;   // set–dez: 25m; jan–ago: 50m

let gEdit = null;   // id da competição em edição
function vistaGerir() {
  const raw = ESTADO.calRaw?.competicoes || [];
  const temChave = !!chaveGH.ler();
  const e = gEdit ? raw.find(x => x.id === gEdit) : null;
  const ligada = id => ESTADO.calendario.find(x => x.id === id && x.comp);
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`;
  const linhas = raw.map(x => {
    const lg = ligada(x.id);
    return `<tr><td>${dataPT(x.inicio)}${x.fim && x.fim !== x.inicio ? ' a ' + dataPT(x.fim) : ''}</td><td>${esc(x.nome)}${x.obs ? `<div class="ref-lbl">${esc(x.obs)}</div>` : ''}</td><td>${esc(x.local || '')}</td><td class="n">${x.piscina ? x.piscina + 'm' : '—'}</td><td>${esc(nomeTipo(x.tipo))}</td>
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
      <label>Tipo<select id="g-tipo">${TIPOS.map(t => opt(t.id, t.nome, e?.tipo || 'torneio')).join('')}</select></label>
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
  const dados = { nome, inicio: ini, fim, local, piscina: pisc, tipo: v('g-tipo') };
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
  const ls = [...ESTADO.linhas].filter(l => l.res != null && l.ano).sort((a, b) => a.c.inicio.localeCompare(b.c.inicio) || a.nprova - b.nprova);
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

/* ---------- Navegação ---------- */
function rota() {
  const [v, arg] = location.hash.replace(/^#/, '').split('/');
  const a = arg ? decodeURIComponent(arg) : '';
  document.querySelectorAll('#menu a').forEach(x => x.classList.toggle('ativo', x.dataset.v === (v === 'fichas' || v === 'gerir' ? 'comp' : (v || 'epoca'))));
  if (v === 'comp') a ? vistaComp(a) : vistaListaComps();
  else if (v === 'atleta') vistaAtleta(a);
  else if (v === 'fichas') vistaFichas(a);
  else if (v === 'tac') vistaTac();
  else if (v === 'gerir') vistaGerir();
  else if (v === 'recordes') vistaRecordes();
  else vistaEpoca();
  window.scrollTo(0, 0);
}

(async () => {
  try {
    await carregar();
    document.getElementById('epoca-lbl').textContent = ESTADO.epoca;
    document.getElementById('gerado').textContent = 'Atualizado em ' + hoje();
    window.addEventListener('hashchange', rota);
    rota();
  } catch (e) {
    app.innerHTML = `<p class="aviso erro">${esc(e.message)}. Se abriste o ficheiro com duplo clique, usa o endereço do GitHub Pages.</p>`;
  }
})();
