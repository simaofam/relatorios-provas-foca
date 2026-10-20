/* Relatórios de Provas · FOCA Quinta da Lixa - CNF
   Dados: data/competicoes.json (índice) + data/<competição>.json
   Regras de RP: ver CONTEXTO_RELATORIOS.md, secção 2. */
'use strict';

const ESTADO = { epoca: '', comps: [], linhas: [], nadadores: [] };
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
      linhas.push({ ...r, comp: c.id, c, piscina: c.piscina, res, refS: ref, tipo, ePR, prim, p, melh });
    }
  }
  ESTADO.linhas = linhas;
  ESTADO.nadadores = [...new Set(linhas.map(l => l.nadador))].sort((a, b) => a.localeCompare(b, 'pt'));
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
    dsq: ls.filter(l => l.estado !== 'OK').length
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
  </div>`;
}
function tabRelacao(ls, chave, rot) {
  const g = agrupar(ls, chave);
  const ks = Object.keys(g).sort(chave === 'escalao' ? porEscalao : (a, b) => a.localeCompare(b, 'pt'));
  const linhas = ks.map(k => {
    const s = resumo(g[k]);
    const nome = chave === 'nadador' ? `<a href="#atleta/${slug(k)}">${esc(k)}</a>` : esc(k);
    const extra = chave === 'nadador' ? `<td>${esc(g[k][g[k].length - 1].escalao)}</td>` : `<td class="n">${s.nad}</td>`;
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
    <td>${celSituacao(l)}${l.obs ? `<div class="ref-lbl">${esc(l.obs)}</div>` : ''}</td>
    <td class="n">${chipLugar(l.lugar)}</td></tr>`).join('');
  return `<div class="tab-wrap"><table><thead><tr>${comComp ? '<th>Competição</th>' : '<th>Nadador</th><th>Escalão</th>'}<th>Prova</th><th>Inscrição</th><th>Referência</th><th>Resultado</th><th class="n">% do RP</th><th>Situação</th><th class="n">Lugar</th></tr></thead><tbody>${linhas || '<tr><td colspan="9" class="vazio">Sem provas.</td></tr>'}</tbody></table></div>`;
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

/* ---------- Vistas ---------- */
function vistaEpoca() {
  const ls = ESTADO.linhas, s = resumo(ls);
  const comps = ESTADO.comps.map(c => {
    const x = resumo(ls.filter(l => l.comp === c.id));
    return `<tr><td>${datas(c)}</td><td><a href="#comp/${c.id}">${esc(c.nome)}</a></td><td>${esc(c.local)}</td><td class="n">${c.piscina}m</td><td class="n">${x.nad}</td><td class="n">${x.provas}</td><td class="n">${x.rp} <span class="ref-lbl">(${x.melh}+${x.prim})</span></td><td class="n">${pct0(x.taxa)}</td><td class="n">${x.p1 + x.p2 + x.p3}</td></tr>`;
  }).join('');
  const barras = ESTADO.comps.map(c => {
    const x = resumo(ls.filter(l => l.comp === c.id));
    return `<div class="barra"><div>${esc(c.local)} <span class="ref-lbl">${dataPT(c.inicio)}</span></div><div class="b"><span style="width:${Math.min(100, x.taxa || 0)}%"></span></div><div class="n"><strong>${pct0(x.taxa)}</strong></div></div>`;
  }).join('');
  const top = ls.filter(l => l.melh != null).sort((a, b) => b.melh - a.melh).slice(0, 10);
  const topH = top.map((l, i) => `<tr><td class="n">${i + 1}</td><td><a href="#atleta/${slug(l.nadador)}">${esc(l.nadador)}</a></td><td>${esc(l.escalao)}</td><td>${esc(l.prova)} <span class="ref-lbl">${l.piscina}m</span></td><td class="t">${fmt(l.refS)}</td><td class="t rp">${fmt(l.res)}</td><td class="n t">−${pct(l.melh)}</td><td>${esc(l.c.local)}</td></tr>`).join('');
  const cats = agrupar(ls, 'categoria');
  const podH = Object.keys(cats).sort(porEscalao).map(k => { const x = resumo(cats[k]); return `<tr><td>${esc(k)}</td><td class="n">${x.p1}</td><td class="n">${x.p2}</td><td class="n">${x.p3}</td><td class="n"><strong>${x.p1 + x.p2 + x.p3}</strong></td></tr>`; }).join('');
  app.innerHTML = `
  ${impCab('Relatório da Época ' + ESTADO.epoca, 'Direção · FOCA Quinta da Lixa - CNF')}
  <div class="cab"><div><h1>Época ${esc(ESTADO.epoca)}</h1><div class="meta">${ESTADO.comps.length} competições · atualizado em ${hoje()}</div></div>
    <div class="acoes"><button class="btn" onclick="window.print()">PDF (A4)</button><button class="btn amar" onclick="excelEpoca()">Excel</button></div></div>
  ${kpis(s)}
  <section class="sec"><h2>Competições</h2><div class="tab-wrap"><table><thead><tr><th>Data</th><th>Competição</th><th>Local</th><th class="n">Piscina</th><th class="n">Nadadores</th><th class="n">Provas</th><th class="n">RP</th><th class="n">% RP</th><th class="n">Pódios</th></tr></thead><tbody>${comps}</tbody></table></div></section>
  <section class="sec"><h2>Evolução da % de provas com RP</h2><div class="barras">${barras}</div></section>
  <section class="sec"><h2>RP por escalão</h2>${tabRelacao(ls, 'escalao', 'Escalão')}</section>
  <section class="sec quebra"><h2>RP por nadador</h2>${tabRelacao(ls, 'nadador', 'Nadador')}</section>
  <section class="sec"><h2>Maiores melhorias</h2><div class="tab-wrap"><table><thead><tr><th class="n">#</th><th>Nadador</th><th>Escalão</th><th>Prova</th><th>Referência</th><th>Resultado</th><th class="n">Melhoria</th><th>Local</th></tr></thead><tbody>${topH || '<tr><td colspan="8" class="vazio">Sem melhorias.</td></tr>'}</tbody></table></div></section>
  <section class="sec"><h2>Pódios por categoria</h2><div class="tab-wrap"><table><thead><tr><th>Categoria</th><th class="n">1.º</th><th class="n">2.º</th><th class="n">3.º</th><th class="n">Total</th></tr></thead><tbody>${podH}</tbody></table></div></section>
  ${impRod('provas.annp.pt')}`;
}

function vistaListaComps() {
  app.innerHTML = `<div class="cab"><div><h1>Competições</h1><div class="meta">Época ${esc(ESTADO.epoca)}</div></div></div>
  <div class="cartoes">${[...ESTADO.comps].reverse().map(c => { const x = resumo(ESTADO.linhas.filter(l => l.comp === c.id)); return `<a class="cartao" href="#comp/${c.id}"><div class="ct">${esc(c.nome)}</div><div class="cm">${esc(c.local)} · ${datas(c)} · ${c.piscina}m</div><div>${x.nad} nadadores · ${x.provas} provas · <strong class="rp">${x.rp} RP</strong> (${pct0(x.taxa)}) · ${x.p1 + x.p2 + x.p3} pódios</div></a>`; }).join('')}</div>`;
}

function vistaComp(id) {
  const c = ESTADO.comps.find(x => x.id === id);
  if (!c) return vistaListaComps();
  const ls = ESTADO.linhas.filter(l => l.comp === id);
  const ord = [...ls].sort((a, b) => a.nadador.localeCompare(b.nadador, 'pt') || a.nprova - b.nprova);
  app.innerHTML = `
  ${impCab(c.nome, `${c.local} · ${datas(c)} · Piscina de ${c.piscina}m`)}
  <div class="cab"><div><h1>${esc(c.nome)}</h1><div class="meta">${esc(c.local)} · ${datas(c)} · Piscina de ${c.piscina}m · ${esc(c.organizador || '')} · <a href="${esc(c.url)}" target="_blank" rel="noopener">página da prova</a></div></div>
    <div class="acoes"><button class="btn" onclick="window.print()">PDF (A4)</button><button class="btn amar" onclick="excelComp('${c.id}')">Excel</button><a class="btn sec" href="#fichas/${c.id}">Fichas dos atletas</a></div></div>
  <section class="sec"><h2>Resumo</h2>${kpis(resumo(ls))}</section>
  <section class="sec"><h2>Provas nadadas / RP por escalão</h2>${tabRelacao(ls, 'escalao', 'Escalão')}</section>
  <section class="sec"><h2>Provas nadadas / RP por nadador</h2>${tabRelacao(ls, 'nadador', 'Nadador')}</section>
  <section class="sec quebra"><h2>Classificações por categoria</h2>${classificacoes(c, ls)}</section>
  <section class="sec quebra"><h2>Detalhe</h2>
    <div class="filtros"><input type="search" id="f-txt" placeholder="Filtrar por nadador ou prova"><label><input type="checkbox" id="f-rp"> Só RP</label></div>
    <div id="det">${tabDetalhe(ord)}</div></section>
  <section class="sec"><h2>Pontos a confirmar</h2>${pontosConfirmar(ls)}</section>
  ${impRod(c.url)}`;
  const aplicar = () => {
    const q = document.getElementById('f-txt').value.trim().toLowerCase(), so = document.getElementById('f-rp').checked;
    document.getElementById('det').innerHTML = tabDetalhe(ord.filter(l => (!q || (l.nadador + ' ' + l.prova + ' ' + l.escalao).toLowerCase().includes(q)) && (!so || l.ePR)));
  };
  document.getElementById('f-txt').oninput = aplicar;
  document.getElementById('f-rp').onchange = aplicar;
}

function fichaHTML(nome) {
  const ls = ESTADO.linhas.filter(l => l.nadador === nome);
  if (!ls.length) return '<p class="aviso">Atleta não encontrado.</p>';
  const s = resumo(ls), ult = ls[ls.length - 1];
  const comps = [...new Set(ls.map(l => l.comp))].length;
  const rps = rpAtuais(nome).map(r => `<tr><td>${esc(r.prova)}</td><td class="n">${r.pisc}m</td><td class="t"><strong>${fmt(r.t)}</strong></td><td>${esc(r.origem === 'Resultado' ? r.onde : 'Tempo de inscrição')}</td><td>${r.origem === 'Resultado' ? dataPT(r.quando) : '—'}</td></tr>`).join('');
  const provas = agrupar(ls, 'prova');
  const evo = Object.keys(provas).sort(porProva).map(p => `<tr><td>${esc(p)}</td><td>${provas[p].map(l => `<span class="t ${l.ePR ? 'rp' : ''}">${l.res != null ? fmt(l.res) : esc(l.estado)}</span> <span class="ref-lbl">${esc(l.c.local)} ${l.piscina}m</span>`).join(' → ')}</td></tr>`).join('');
  return `<div class="ficha">
    ${impCab('Ficha individual · ' + nome, `${ult.escalao} · Época ${ESTADO.epoca}`)}
    <div class="cab"><div><h1>${esc(nome)}</h1><div class="meta">${esc(ult.escalao)} · ${ult.genero === 'F' ? 'Feminino' : 'Masculino'} · Época ${esc(ESTADO.epoca)}</div></div></div>
    <div class="kpis">
      <div class="kpi"><div class="v">${comps}</div><div class="l">Competições</div></div>
      <div class="kpi"><div class="v">${s.provas}</div><div class="l">Provas nadadas</div></div>
      <div class="kpi"><div class="v">${s.rp}</div><div class="l">RP conseguidos</div><div class="d">${s.melh} melhorias + ${s.prim} 1.º tempo</div></div>
      <div class="kpi"><div class="v">${s.p1 + s.p2 + s.p3}</div><div class="l">Pódios</div><div class="d">${s.p1} × 1.º · ${s.p2} × 2.º · ${s.p3} × 3.º</div></div>
    </div>
    <section class="sec"><h2>Recordes pessoais atuais</h2><div class="tab-wrap"><table><thead><tr><th>Prova</th><th class="n">Piscina</th><th>Tempo</th><th>Onde</th><th>Quando</th></tr></thead><tbody>${rps}</tbody></table></div></section>
    <section class="sec"><h2>Evolução por prova</h2><div class="tab-wrap"><table><thead><tr><th>Prova</th><th>Tempos na época</th></tr></thead><tbody>${evo}</tbody></table></div></section>
    <section class="sec"><h2>Todas as provas</h2>${tabDetalhe(ls, true)}</section>
    ${impRod('provas.annp.pt')}
  </div>`;
}

function vistaAtleta(nome) {
  const opts = ESTADO.nadadores.map(n => `<option value="${esc(n)}" ${n === nome ? 'selected' : ''}>${esc(n)}</option>`).join('');
  app.innerHTML = `<div class="cab nao-imp"><div><h1>Atletas</h1><div class="meta">Ficha individual da época</div></div>
    <div class="acoes"><select id="sel-at"><option value="">Escolher atleta…</option>${opts}</select>${nome ? '<button class="btn" onclick="window.print()">PDF (A4)</button>' : ''}</div></div>
    ${nome ? fichaHTML(nome) : `<div class="cartoes">${ESTADO.nadadores.map(n => { const s = resumo(ESTADO.linhas.filter(l => l.nadador === n)); return `<a class="cartao" href="#atleta/${slug(n)}"><div class="ct">${esc(n)}</div><div class="cm">${s.provas} provas · <strong class="rp">${s.rp} RP</strong> · ${s.p1 + s.p2 + s.p3} pódios</div></a>`; }).join('')}</div>`}`;
  document.getElementById('sel-at').onchange = e => { location.hash = e.target.value ? '#atleta/' + slug(e.target.value) : '#atleta'; };
}

function vistaFichas(id) {
  const c = ESTADO.comps.find(x => x.id === id);
  if (!c) return vistaListaComps();
  const nomes = [...new Set(ESTADO.linhas.filter(l => l.comp === id).map(l => l.nadador))].sort((a, b) => a.localeCompare(b, 'pt'));
  app.innerHTML = `<div class="cab nao-imp"><div><h1>Fichas dos atletas</h1><div class="meta">${esc(c.nome)} · ${esc(c.local)} · ${nomes.length} atletas · uma ficha por página</div></div>
    <div class="acoes"><a class="btn sec" href="#comp/${id}">Voltar</a><button class="btn" onclick="window.print()">PDF (A4) de todas</button></div></div>
    ${nomes.map(fichaHTML).join('')}`;
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
const detLinhas = ls => ls.map(l => [l.c.local, l.nadador, l.escalao, l.categoria, l.prova, l.insc ? fmt(seg(l.insc)) : 'NT', l.inscPiscina ? l.inscPiscina + 'm' : '', l.refS != null ? fmt(l.refS) : '', l.tipo || '', l.res != null ? fmt(l.res) : l.estado, l.p != null ? Math.round(l.p * 100) / 100 : null, l.ePR ? (l.prim ? 'RP · 1.º tempo' : 'RP') : '', l.melh != null ? Math.round(l.melh * 100) / 100 : null, l.lugar, l.obs || '']);
const detCab = ['Competição', 'Nadador', 'Escalão', 'Categoria', 'Prova', 'Inscrição', 'Piscina insc.', 'Referência', 'Tipo de referência', 'Resultado', '% do RP', 'Situação', 'Melhoria %', 'Lugar', 'Observações'];
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
async function excelEpoca() {
  try {
    const X = await carregarExcel(), wb = new X.Workbook(), ls = ESTADO.linhas;
    folha(wb, 'Competições', ['Início', 'Competição', 'Local', 'Piscina', 'Nadadores', 'Provas', 'RP', 'Melhorias', '1.º tempo', '% RP', 'Pódios'], ESTADO.comps.map(c => { const x = resumo(ls.filter(l => l.comp === c.id)); return [dataPT(c.inicio), c.nome, c.local, c.piscina + 'm', x.nad, x.provas, x.rp, x.melh, x.prim, x.taxa == null ? '' : Math.round(x.taxa) + '%', x.p1 + x.p2 + x.p3]; }));
    pctCol(folha(wb, 'Por escalão', relCab('Escalão'), relLinhas(ls, 'escalao')), 6);
    pctCol(folha(wb, 'Por nadador', relCab('Nadador'), relLinhas(ls, 'nadador')), 6);
    folha(wb, 'Maiores melhorias', ['Nadador', 'Escalão', 'Prova', 'Piscina', 'Referência', 'Resultado', 'Melhoria %', 'Local'], ls.filter(l => l.melh != null).sort((a, b) => b.melh - a.melh).map(l => [l.nadador, l.escalao, l.prova, l.piscina + 'm', fmt(l.refS), fmt(l.res), Math.round(l.melh * 100) / 100, l.c.local]));
    folha(wb, 'Detalhe', detCab, detLinhas(ls));
    await gravar(wb, `epoca-${ESTADO.epoca.replace('/', '-')}-relatorio.xlsx`);
  } catch (e) { alert(e.message); }
}

/* ---------- Navegação ---------- */
function rota() {
  const [v, arg] = location.hash.replace(/^#/, '').split('/');
  const a = arg ? decodeURIComponent(arg) : '';
  document.querySelectorAll('#menu a').forEach(x => x.classList.toggle('ativo', x.dataset.v === (v === 'fichas' ? 'comp' : (v || 'epoca'))));
  if (v === 'comp') a ? vistaComp(a) : vistaListaComps();
  else if (v === 'atleta') vistaAtleta(a);
  else if (v === 'fichas') vistaFichas(a);
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
