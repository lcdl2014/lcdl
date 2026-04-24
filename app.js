// =====================================================
// LA CUEVA DEL LOBIZÓN — APP.JS v3
// Lee datos en tiempo real desde Google Sheets
// =====================================================

const SHEET_ID = '1yFxmL00TynoUR3-RwpoHVkL1iH3dx84mDQWUoKS-wA8';
const SHEETS_API = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=`;

let DATA = { partidos: [], jugadores: [], resumen: [], rivales: [], goleadores: [] };

// ─── FETCH GOOGLE SHEETS ──────────────────────────
async function fetchSheet(sheetName) {
  const url = SHEETS_API + encodeURIComponent(sheetName);
  const res = await fetch(url);
  const text = await res.text();
  const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/)[1]);
  const cols = json.table.cols.map(c => c.label);
  return (json.table.rows || []).map(row => {
    const obj = {};
    row.c.forEach((cell, i) => { obj[cols[i]] = cell ? cell.v : ''; });
    return obj;
  });
}

async function loadAllData() {
  try {
    const [partidos, jugadores, resumen] = await Promise.all([
      fetchSheet('PARTIDOS'),
      fetchSheet('JUGADORES'),
      fetchSheet('RESUMEN_TEMPORADAS'),
    ]);
    DATA.partidos = partidos.filter(p => p.RIVAL);
    DATA.jugadores = jugadores.filter(j => j.NOMBRE_COMPLETO);
    DATA.resumen = resumen.filter(r => r.TEMPORADA);
    DATA.rivales = calcularRivales(DATA.partidos);
    DATA.goleadores = calcularGoleadores(DATA.partidos);
    return true;
  } catch (err) {
    console.error('Error cargando datos:', err);
    return false;
  }
}

// ─── CALCULAR STATS ───────────────────────────────
function calcularRivales(partidos, cat = null) {
  const rivales = {};
  partidos.filter(p => !cat || p.CATEGORIA === cat).forEach(p => {
    if (!p.RIVAL) return;
    if (!rivales[p.RIVAL]) rivales[p.RIVAL] = { rival: p.RIVAL, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 };
    const r = rivales[p.RIVAL];
    r.pj++;
    r.gf += Number(p.GOLES_LCdL) || 0;
    r.gc += Number(p.GOLES_RIVAL) || 0;
    if (p.RESULTADO === 'G') r.pg++;
    else if (p.RESULTADO === 'E') r.pe++;
    else if (p.RESULTADO === 'P') r.pp++;
  });
  return Object.values(rivales).map(r => ({
    ...r, pts: r.pg * 3 + r.pe,
    eficiencia: r.pj > 0 ? Math.round((r.pg * 3 + r.pe) / (r.pj * 3) * 1000) / 10 : 0,
  })).sort((a, b) => b.pj - a.pj);
}

function calcularGoleadores(partidos, cat = null) {
  const goles = {};
  partidos.filter(p => !cat || p.CATEGORIA === cat).forEach(p => {
    if (!p.GOLEADORES) return;
    p.GOLEADORES.split(',').map(s => s.trim()).filter(Boolean).forEach(parte => {
      const m = parte.match(/^(.+?)(?:\s*\((\d+)\))?(?:\s*\(p\))?$/);
      if (!m) return;
      const nombre = m[1].replace(/\(p\)/g, '').trim();
      const cant = parseInt(m[2] || '1');
      if (!goles[nombre]) goles[nombre] = { nombre, goles: 0 };
      goles[nombre].goles += cant;
    });
  });
  return Object.values(goles).sort((a, b) => b.goles - a.goles);
}

// ─── UTILS ────────────────────────────────────────
function getInitials(n) { return n.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase(); }
function eficienciaClass(e) { return e >= 65 ? 'efic-alta' : e >= 40 ? 'efic-media' : 'efic-baja'; }
function animateCount(el, target) {
  const duration = 1400, start = performance.now();
  const update = now => {
    const t = Math.min((now - start) / duration, 1), ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(ease * target);
    if (t < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function ultimoPartidoHTML(p) {
  if (!p) return '<div class="no-data">Sin datos</div>';
  const resColor = p.RESULTADO === 'G' ? '#4caf50' : p.RESULTADO === 'E' ? '#f4c430' : '#e57373';
  const resLabel = p.RESULTADO === 'G' ? 'Victoria' : p.RESULTADO === 'E' ? 'Empate' : 'Derrota';
  return `
  <div class="ultimo-card">
    <div class="uc-header">
      <span class="uc-fecha">${p.FECHA || ''} · ${p.CONDICION || ''} · ${p.CANCHA || ''}</span>
      <span class="uc-resultado" style="color:${resColor}">● ${resLabel}</span>
    </div>
    <div class="uc-marcador">
      <span class="uc-equipo">La Cueva del Lobizón</span>
      <span class="uc-score">${p.GOLES_LCdL} — ${p.GOLES_RIVAL}</span>
      <span class="uc-equipo">${p.RIVAL}</span>
    </div>
    ${p.GOLEADORES ? `<div class="uc-goles">⚽ ${p.GOLEADORES}</div>` : ''}
    ${p.MVP ? `<div class="uc-mvp">🏆 MVP: ${p.MVP}</div>` : ''}
    ${p.DATOS_COLOR ? `<div class="uc-nota">${p.DATOS_COLOR}</div>` : ''}
  </div>`;
}

function ultimos5HTML(cat) {
  const partidos = DATA.partidos.filter(p => p.CATEGORIA === cat).slice(-5);
  if (!partidos.length) return '';
  const dots = partidos.map(p => {
    const cls = p.RESULTADO === 'G' ? 'g' : p.RESULTADO === 'E' ? 'e' : 'p';
    const label = p.RESULTADO === 'G' ? 'Victoria' : p.RESULTADO === 'E' ? 'Empate' : 'Derrota';
    return `<span class="u5-dot ${cls}" title="${label} vs ${p.RIVAL} (${p.FECHA || ''})"></span>`;
  }).join('');
  return `<div class="u5-strip"><span class="u5-label">${cat === 'MAYORES' ? 'Mayores' : 'Pre Senior'}</span><div class="u5-dots">${dots}</div></div>`;
}

// ─── NAVEGACIÓN POR PESTAÑAS ──────────────────────
function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const tab = document.getElementById(`tab-${tabName}`);
  if (tab) tab.classList.add('active');
  const link = document.querySelector(`.nav-link[data-tab="${tabName}"]`);
  if (link) link.classList.add('active');
  window.scrollTo(0, 0);
  document.getElementById('mainNav').classList.remove('open');
}

function initNav() {
  document.getElementById('navToggle').addEventListener('click', () =>
    document.getElementById('mainNav').classList.toggle('open'));
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); showTab(link.dataset.tab); });
  });
}

// ─── INICIO ───────────────────────────────────────
function renderInicio() {
  const total = DATA.partidos.length;
  const victorias = DATA.partidos.filter(p => p.RESULTADO === 'G').length;
  const goles = DATA.partidos.reduce((s, p) => s + (Number(p.GOLES_LCdL) || 0), 0);

  animateCount(document.getElementById('statPartidos'), total);
  animateCount(document.getElementById('statVictorias'), victorias);
  animateCount(document.getElementById('statGoles'), goles);

  const temporadas = [...new Set(DATA.resumen.map(r => r.TEMPORADA))].length;
  document.getElementById('heroSub').textContent = `${temporadas} temporadas. ${total} partidos. Una manada.`;

  // Último partido por categoría
  const lastMay = [...DATA.partidos.filter(p => p.CATEGORIA === 'MAYORES')].pop();
  const lastPre = [...DATA.partidos.filter(p => p.CATEGORIA === 'PRESENIOR')].pop();

  document.getElementById('ultimoMayores').innerHTML = ultimoPartidoHTML(lastMay);
  document.getElementById('ultimoPresenior').innerHTML = ultimoPartidoHTML(lastPre);

  // Últimos 5 por categoría
  document.getElementById('ultimos5').innerHTML = ultimos5HTML('MAYORES') + ultimos5HTML('PRESENIOR');
}

// ─── TEMPORADAS ───────────────────────────────────
function renderTemporadas(filter = 'all') {
  const grid = document.getElementById('temporadasGrid');
  let data = [...DATA.resumen].filter(t => t.TEMPORADA && t.PJ > 0);
  if (filter !== 'all') data = data.filter(t => t.CATEGORIA === filter);
  data.sort((a, b) => {
    const diff = Number(b.TEMPORADA) - Number(a.TEMPORADA);
    if (diff !== 0) return diff;
    return a.CATEGORIA === 'MAYORES' ? -1 : 1;
  });
  grid.innerHTML = data.map(t => {
    const rend = Number(t.RENDIMIENTO_PCT) || 0;
    const catClass = t.CATEGORIA === 'PRESENIOR' ? 'presenior' : '';
    return `
    <div class="temporada-card">
      <div class="tc-header">
        <span class="tc-year">${t.TEMPORADA}</span>
        <span class="tc-cat ${catClass}">${t.CATEGORIA === 'PRESENIOR' ? 'PRE SENIOR' : 'MAYORES'}</span>
      </div>
      <div class="tc-body">
        <p class="tc-dt">DT: <span>${t.DT || '—'}</span></p>
        <div class="tc-stats">
          <div class="tc-stat"><span class="tc-stat-num g">${t.PG || 0}</span><span class="tc-stat-label">Victorias</span></div>
          <div class="tc-stat"><span class="tc-stat-num e">${t.PE || 0}</span><span class="tc-stat-label">Empates</span></div>
          <div class="tc-stat"><span class="tc-stat-num p">${t.PP || 0}</span><span class="tc-stat-label">Derrotas</span></div>
        </div>
        <div class="tc-bar"><div class="tc-bar-fill" style="width:${Math.round(rend)}%"></div></div>
        <div class="tc-footer">
          <span class="tc-goles">⚽ ${t.GF || 0} goles</span>
          <span class="tc-div">Div. ${t.DIVISIONAL || '—'}</span>
        </div>
        <div class="tc-footer" style="margin-top:6px">
          <span style="font-size:0.75rem;color:#888">${t.PJ || 0} PJ · ${t.PTS || 0} pts · ${rend}% rend.</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function initTemporadas() {
  renderTemporadas();
  document.querySelectorAll('.ftab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTemporadas(btn.dataset.cat);
    });
  });
}

// ─── GOLEADORES ───────────────────────────────────
let goleadoresCatActual = 'all';

function renderGoleadores(cat = 'all') {
  goleadoresCatActual = cat;
  const catParam = cat === 'all' ? null : cat;
  let gols = catParam ? calcularGoleadores(DATA.partidos, catParam) : DATA.goleadores;
  if (!gols.length) gols = FALLBACK_GOLEADORES;
  gols = gols.slice(0, 10);
  const maxG = gols[0]?.goles || 1;

  // Podio — HTML order: GOLD, SILVER, BRONZE (móvil correcto)
  // CSS reordena para desktop: silver-left, gold-center, bronze-right
  const podio = document.getElementById('golPodio');
  const top3 = gols.slice(0, 3);
  podio.innerHTML = top3.map((g, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const classes = ['p1', 'p2', 'p3'];
    const nombre = g.nombre.split(' ').slice(0, 2).join(' ');
    return `
    <div class="podio-item ${classes[i]}">
      <span class="podio-medal">${medals[i]}</span>
      <span class="podio-goles">${g.goles}</span>
      <span class="podio-nombre">${nombre}</span>
    </div>`;
  }).join('');

  // Tabla 4-10
  const tabla = document.getElementById('golTabla');
  tabla.innerHTML = gols.slice(3).map((g, i) => `
    <div class="gol-row">
      <span class="gol-pos">${i + 4}°</span>
      <span class="gol-nombre">${g.nombre.split(' ').slice(0, 2).join(' ')}</span>
      <div class="gol-bar-wrap"><div class="gol-bar" style="width:${Math.round(g.goles / maxG * 100)}%"></div></div>
      <span class="gol-count">${g.goles}</span>
    </div>`).join('');
}

function initGoleadores() {
  renderGoleadores('all');
  document.querySelectorAll('.gftab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gftab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGoleadores(btn.dataset.cat);
    });
  });
}

const FALLBACK_GOLEADORES = [
  { nombre: "Federico Rosso Campamar", goles: 117 },
  { nombre: "Mauro Serra Baltasar", goles: 58 },
  { nombre: "Renato Moncalvo Villegas", goles: 52 },
  { nombre: "Alfonso Rosso Campamar", goles: 36 },
  { nombre: "Gastón García", goles: 33 },
  { nombre: "Enrique Martínez Marchese", goles: 19 },
  { nombre: "Rodrigo Kahrs", goles: 17 },
  { nombre: "Nicolás Zabaleta Vignone", goles: 17 },
  { nombre: "Alejandro Perdomo", goles: 12 },
  { nombre: "Agustín Tosar Rovira", goles: 10 },
];

// ─── JUGADORES ─────────────────────────────────────
function getDatoColor(j) {
  const pj = Number(j.PJ_TOTAL) || 0;
  const goles = Number(j.GOLES_TOTAL) || 0;
  const debut = Number(j.TEMPORADA_DEBUT) || 0;
  const pjMay = Number(j.PJ_MAYORES) || 0;
  const pjPre = Number(j.PJ_PRESENIOR) || 0;
  const facts = [];
  if (pj >= 200) facts.push(`El único jugador en superar los 200 partidos 🏅`);
  else if (pj >= 150) facts.push(`${pj} partidos — un pilar del club`);
  else if (pj >= 100) facts.push(`${pj} partidos — el centenario`);
  if (goles >= 100) facts.push(`${goles} goles — el máximo goleador histórico ⚽`);
  else if (goles >= 50) facts.push(`${goles} goles — entre los grandes anotadores del club`);
  else if (goles >= 20) facts.push(`${goles} goles en su carrera en La Cueva`);
  if (debut <= 2014) facts.push(`De los fundadores del equipo, desde el primer año`);
  if (pjMay > 0 && pjPre > 0) facts.push(`Jugó en ambas categorías: ${pjMay} May. + ${pjPre} Pre Sen.`);
  if (goles > 0 && pj > 0) {
    const ratio = (goles / pj).toFixed(2);
    if (ratio >= 0.5) facts.push(`Ratio goleador: ${ratio} goles/partido 🎯`);
  }
  if (!facts.length) facts.push(`${pj} partidos con la camiseta del Lobo`);
  return facts[Math.floor(Math.random() * facts.length)];
}

function renderJugadores(filter = 'all') {
  const grid = document.getElementById('jugadoresGrid');
  let data = [...DATA.jugadores];
  if (filter === 'activo') data = data.filter(j => j.ACTIVO === 'SI');
  if (filter === 'retired') data = data.filter(j => j.ACTIVO !== 'SI');
  data.sort((a, b) => (Number(b.PJ_TOTAL) || 0) - (Number(a.PJ_TOTAL) || 0));

  grid.innerHTML = data.map(j => {
    const nombre = j.NOMBRE_COMPLETO || '';
    const partes = nombre.split(' ');
    const display = partes.length >= 3 ? `${partes[0]} ${partes[partes.length - 2]}` : nombre;
    const activo = j.ACTIVO === 'SI';
    const badge = activo ? '<span class="jc-badge activo">Activo</span>' : '<span class="jc-badge retirado">Retirado</span>';
    const avatarContent = j.FOTO_URL ? `<img src="${j.FOTO_URL}" alt="${display}" />` : getInitials(nombre);
    const datoColor = getDatoColor(j);
    const posIcon = j.POSICION === 'ARQ' ? '🧤' : j.POSICION === 'DEF' ? '🛡️' : j.POSICION === 'MED' ? '⚙️' : j.POSICION === 'DEL' ? '⚽' : '';

    return `
    <div class="jugador-card ${activo ? '' : 'retirado'}" data-dato="${datoColor.replace(/"/g, '&quot;')}">
      <div class="jc-avatar">${avatarContent}</div>
      <div class="jc-nombre">${display}</div>
      ${j.APODO ? `<div class="jc-apodo">"${j.APODO}"</div>` : ''}
      ${posIcon ? `<div class="jc-pos">${posIcon} ${j.POSICION}</div>` : ''}
      ${badge}
      <div class="jc-stats">
        <div class="jcs"><span class="jcs-val">${j.PJ_TOTAL || 0}</span><span class="jcs-lbl">PJ</span></div>
        <div class="jcs"><span class="jcs-val">${j.GOLES_TOTAL || 0}</span><span class="jcs-lbl">Goles</span></div>
      </div>
      <div class="jc-tooltip">${datoColor}</div>
    </div>`;
  }).join('');
}

function initJugadores() {
  renderJugadores();
  document.querySelectorAll('.pftab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pftab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderJugadores(btn.dataset.filter);
    });
  });
}

// ─── RIVALES ──────────────────────────────────────
let rivalCatActual = 'all';

function renderRivales(filter = '', cat = 'all') {
  rivalCatActual = cat;
  const rivales = cat === 'all' ? DATA.rivales : calcularRivales(DATA.partidos, cat);
  const filtered = rivales.filter(r => r.rival.toLowerCase().includes(filter.toLowerCase()));
  document.getElementById('rivalBody').innerHTML = filtered.map(r => `
    <tr>
      <td>${r.rival}</td>
      <td>${r.pj}</td>
      <td style="color:#4caf50;font-weight:600">${r.pg}</td>
      <td style="color:#f4c430">${r.pe}</td>
      <td style="color:#e57373">${r.pp}</td>
      <td>${r.gf}</td>
      <td>${r.gc}</td>
      <td><span class="efic-badge ${eficienciaClass(r.eficiencia)}">${r.eficiencia}%</span></td>
    </tr>`).join('');
}

function initRivales() {
  renderRivales();
  const search = document.getElementById('rivalSearch');
  search.addEventListener('input', e => renderRivales(e.target.value, rivalCatActual));
  document.querySelectorAll('.rftab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rftab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRivales(search.value, btn.dataset.cat);
    });
  });
}

// ─── CURIOSIDADES ──────────────────────────────────
const CURIOSIDADES = [
  { tipo: "record", titulo: "El Goleador", texto: "Federico Rosso es el máximo goleador histórico con 117 goles en 150 partidos. Un promedio de 0.78 goles por partido." },
  { tipo: "record", titulo: "El Eterno Capitán", texto: "Juan Andrés Aldecoa 'Capi' es el jugador con más partidos: 228 en total, el único que superó los 200." },
  { tipo: "record", titulo: "La Peor Derrota", texto: "El 19/9/2021 sufrimos la derrota más dolorosa: Jean Piaget 12-1. Un partido que nunca se olvida." },
  { tipo: "record", titulo: "La Mejor Temporada", texto: "2015 fue nuestra mejor temporada: 13V-4E-4P. Promedio de 2.05 puntos por partido." },
  { tipo: "curiosidad", titulo: "Primer Gol Histórico", texto: "El primer gol fue de Alfonso Rosso, el 27/4/2014 vs Pallotti Universitario. Perdimos 3-1 pero arrancó la historia." },
  { tipo: "curiosidad", titulo: "Primera Victoria", texto: "La primera victoria llegó el 22/6/2014 vs Jean Piaget: 0-1. El gol fue de Agustín Silvera." },
  { tipo: "record", titulo: "Copa de Plata 2014", texto: "En el primer año ganamos la Copa de Plata. Final vs C.S.D. Niágara: 2-1 con doblete de Nicolás Borgia." },
  { tipo: "curiosidad", titulo: "El Ascenso", texto: "El 6/10/2019 ascendimos a la Divisional G: victoria 2-1 ante Bella Vista. Primer ascenso de la historia." },
  { tipo: "record", titulo: "Gol 50 de Fede", texto: "El gol 50 de Federico Rosso llegó el 6/11/2018 vs Arnold Gesell, en una victoria 4-0 donde hizo hat-trick." },
  { tipo: "curiosidad", titulo: "El Arquero Agigantado", texto: "En 2023, Sigfrido Vettorazzi atajó dos penales en la misma jugada vs Macabí. Hecho rarísimo en el fútbol." },
  { tipo: "record", titulo: "La Remontada Épica", texto: "En 2024 íbamos 0-4 a los 13 minutos vs NSdL y terminamos 4-4. Renato Moncalvo hizo tres goles." },
  { tipo: "curiosidad", titulo: "Con 9 Jugadores", texto: "En 2025 ganamos 1-0 a Clara Jackson jugando con solo 9 jugadores. Una de las victorias más emotivas." },
  { tipo: "record", titulo: "Gol Olímpico Histórico", texto: "Mauro Serra marcó un gol olímpico vs Estudiantes Españoles en 2019. Fue el último partido de Kike antes de irse a España." },
  { tipo: "curiosidad", titulo: "Kahrs Imparable", texto: "En 2025, Rodrigo Kahrs marcó 4 goles en una tarde: goleada 6-4 vs Mariscal Nasazzi." },
  { tipo: "record", titulo: "249 partidos de Mayores", texto: "Al cierre de 2025, 249 partidos en Mayores: 111 victorias, 41 empates, 97 derrotas." },
  { tipo: "curiosidad", titulo: "Primera Presenior", texto: "En 2025 debutamos en Pre Senior. El primer partido fue el 29/3/2025 vs Varela Universitario. Un nuevo capítulo." },
  { tipo: "curiosidad", titulo: "Federico Rosso x3 penales", texto: "En Presenior 2025, Federico Rosso convirtió 3 penales en un solo partido vs Jean Piaget." },
  { tipo: "record", titulo: "DTs históricos", texto: "5 directores técnicos en la historia: Valmaggia (2014-16), Piñeyrúa (2017-18), González 'Uber' (2019-21), Bengochea (2022-23), Coitiño (2024-25)." },
  { tipo: "curiosidad", titulo: "Nuevo capítulo 2026", texto: "Pablo Bernatene asumió como DT en 2026. Nueva era para el Lobo." },
  { tipo: "record", titulo: "230 partidos del Capi", texto: "Juan Andrés Aldecoa superó los 230 partidos en 2026. El jugador más longevo de la historia del club." },
];

function renderCuriosidades() {
  document.getElementById('curiosidadesGrid').innerHTML = shuffle(CURIOSIDADES).slice(0, 6).map(c => `
    <div class="curiosidad-card">
      <div class="cur-tipo">${c.tipo === 'record' ? '🏆 Récord' : '⚡ Curiosidad'}</div>
      <div class="cur-titulo">${c.titulo}</div>
      <div class="cur-texto">${c.texto}</div>
    </div>`).join('');
}

// ─── CHATBOT ──────────────────────────────────────
const CLUB_CONTEXT = `Sos el asistente oficial de La Cueva del Lobizón, un equipo de fútbol amateur uruguayo fundado en 2004, compitiendo desde 2014. Respondé SIEMPRE en español, de manera amigable y apasionada, como un hincha del club. Usá tono informal y cálido. Si tiene sentido, usá emojis.

DATOS CLAVE: 276+ partidos totales. Goleador histórico: Federico Rosso con 117 goles. Más partidos: Juan Aldecoa 'Capi' con 230+. DT 2024-25: Diego Coitiño. DT 2026: Pablo Bernatene. Colores: Negro, Rojo Granate, Blanco. Mejor temporada: 2015 (promedio 2.05). Peor derrota: Jean Piaget 12-1 (2021). Primer título: Copa de Plata 2014. Ascenso a Div G: 2019. Primera Presenior: 2025.`;

function initChatbot() {
  const fab = document.getElementById('chatFab');
  const panel = document.getElementById('chatPanel');
  const input = document.getElementById('chatInput');
  const messages = document.getElementById('chatMessages');

  fab.addEventListener('click', () => panel.classList.toggle('open'));
  document.getElementById('chatClose').addEventListener('click', () => panel.classList.remove('open'));

  function addMsg(text, role) {
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function fallback(q) {
    q = q.toLowerCase();
    if (q.includes('goleador') || q.includes('gol')) return '🏆 El máximo goleador es Federico Rosso con 117 goles en 150 partidos.';
    if (q.includes('partido')) return '📊 Llevamos más de 276 partidos oficiales en ambas categorías.';
    if (q.includes('dt') || q.includes('técnico')) return '⚽ El DT 2026 es Pablo Bernatene. Antes fue Diego Coitiño (2024-25).';
    if (q.includes('peor') || q.includes('derrota')) return '😰 La peor derrota fue el 19/9/2021: Jean Piaget 12-1.';
    if (q.includes('mejor') || q.includes('temporada')) return '🌟 La mejor temporada fue 2015: 13V-4E-4P, promedio 2.05 puntos.';
    return '🐺 Configurá la API key de Claude en config.js para respuestas completas.';
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg(text, 'user');
    const loading = addMsg('Pensando...', 'bot loading');
    try {
      const apiKey = window.CLAUDE_API_KEY || '';
      if (!apiKey) { loading.textContent = fallback(text); loading.classList.remove('loading'); return; }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: CLUB_CONTEXT, messages: [{ role: 'user', content: text }] }),
      });
      const data = await res.json();
      loading.textContent = data.content?.[0]?.text || 'No pude procesar eso. Intentá de nuevo.';
    } catch { loading.textContent = fallback(text); }
    loading.classList.remove('loading');
  }

  document.getElementById('chatSend').addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

// ─── INIT ──────────────────────────────────────────
async function init() {
  initNav();
  const ok = await loadAllData();
  document.getElementById('loadingScreen').style.display = 'none';
  if (ok) { renderInicio(); initTemporadas(); initGoleadores(); initJugadores(); initRivales(); }
  else { document.getElementById('heroSub').textContent = '12 temporadas. 276 partidos. Una manada.'; }
  renderCuriosidades();
  document.getElementById('reloadCuriosidades').addEventListener('click', renderCuriosidades);
  initChatbot();
}

document.addEventListener('DOMContentLoaded', init);
