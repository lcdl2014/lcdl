// =====================================================
// LA CUEVA DEL LOBIZÓN — APP.JS
// Lee datos en tiempo real desde Google Sheets
// =====================================================

// ID del Sheet oficial
const SHEET_ID = '1yFxmL00TynoUR3-RwpoHVkL1iH3dx84mDQWUoKS-wA8';
const SHEETS_API = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=`;

// Estado global
let DATA = {
  partidos: [],
  jugadores: [],
  resumen: [],
  rivales: {},
  goleadores: {},
};

// ─── FETCH DESDE GOOGLE SHEETS ────────────────────
async function fetchSheet(sheetName) {
  const url = SHEETS_API + encodeURIComponent(sheetName);
  const res = await fetch(url);
  const text = await res.text();
  // Google devuelve JSONP, hay que parsear
  const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/)[1]);
  const cols = json.table.cols.map(c => c.label);
  const rows = (json.table.rows || []).map(row => {
    const obj = {};
    row.c.forEach((cell, i) => {
      obj[cols[i]] = cell ? cell.v : '';
    });
    return obj;
  });
  return rows;
}

// ─── CARGAR TODOS LOS DATOS ───────────────────────
async function loadAllData() {
  try {
    const [partidos, jugadores, resumen] = await Promise.all([
      fetchSheet('PARTIDOS'),
      fetchSheet('JUGADORES'),
      fetchSheet('RESUMEN_TEMPORADAS'),
    ]);

    DATA.partidos = partidos.filter(p => p.RIVAL); // filtrar filas vacías
    DATA.jugadores = jugadores.filter(j => j.NOMBRE_COMPLETO);
    DATA.resumen = resumen.filter(r => r.TEMPORADA);

    // Calcular rivales desde partidos
    DATA.rivales = calcularRivales(DATA.partidos);
    DATA.goleadores = calcularGoleadores(DATA.partidos);

    return true;
  } catch (err) {
    console.error('Error cargando datos del Sheet:', err);
    return false;
  }
}

// ─── CALCULAR STATS DE RIVALES ────────────────────
function calcularRivales(partidos) {
  const rivales = {};
  partidos.forEach(p => {
    const rival = p.RIVAL;
    if (!rival) return;
    if (!rivales[rival]) rivales[rival] = { rival, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 };
    const r = rivales[rival];
    r.pj++;
    const gf = Number(p.GOLES_LCdL) || 0;
    const gc = Number(p.GOLES_RIVAL) || 0;
    r.gf += gf;
    r.gc += gc;
    if (p.RESULTADO === 'G') r.pg++;
    else if (p.RESULTADO === 'E') r.pe++;
    else if (p.RESULTADO === 'P') r.pp++;
  });
  return Object.values(rivales).map(r => ({
    ...r,
    pts: r.pg * 3 + r.pe,
    eficiencia: r.pj > 0 ? Math.round((r.pg * 3 + r.pe) / (r.pj * 3) * 100 * 10) / 10 : 0,
  })).sort((a, b) => b.pj - a.pj);
}

// ─── CALCULAR GOLEADORES DESDE PARTIDOS ───────────
function calcularGoleadores(partidos) {
  const goles = {};
  partidos.forEach(p => {
    if (!p.GOLEADORES) return;
    const texto = p.GOLEADORES;
    // Parsear "Nombre (3), Otro, Tercero (2)"
    const partes = texto.split(',').map(s => s.trim()).filter(Boolean);
    partes.forEach(parte => {
      const match = parte.match(/^(.+?)(?:\s*\((\d+)\))?$/);
      if (!match) return;
      const nombre = match[1].trim();
      const cant = parseInt(match[2] || '1');
      if (!goles[nombre]) goles[nombre] = { nombre, goles: 0 };
      goles[nombre].goles += cant;
    });
  });
  return Object.values(goles).sort((a, b) => b.goles - a.goles);
}

// ─── UTILS ────────────────────────────────────────
function getInitials(nombre) {
  return nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}
function eficienciaClass(e) {
  if (e >= 65) return 'efic-alta';
  if (e >= 40) return 'efic-media';
  return 'efic-baja';
}
function animateCount(el, target) {
  const duration = 1400;
  const start = performance.now();
  const update = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(ease * target);
    if (t < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
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
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  toggle.addEventListener('click', () => nav.classList.toggle('open'));
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showTab(link.dataset.tab);
    });
  });
}

// ─── INICIO ───────────────────────────────────────
function renderInicio() {
  const totalPJ = DATA.partidos.length;
  const totalPG = DATA.partidos.filter(p => p.RESULTADO === 'G').length;
  const totalGF = DATA.partidos.reduce((s, p) => s + (Number(p.GOLES_LCdL) || 0), 0);
  const temporadas = [...new Set(DATA.resumen.map(r => r.TEMPORADA))].length;

  // Actualizar frase hero
  document.getElementById('heroSub').textContent = `${temporadas} temporadas. ${totalPJ} partidos. Una manada.`;

  // Animar contadores
  animateCount(document.getElementById('statPartidos'), totalPJ);
  animateCount(document.getElementById('statVictorias'), totalPG);
  animateCount(document.getElementById('statGoles'), totalGF);

  // Último partido
  const ultimo = DATA.partidos[DATA.partidos.length - 1];
  if (ultimo) {
    const res = ultimo.RESULTADO === 'G' ? '🟢 Victoria' : ultimo.RESULTADO === 'E' ? '🟡 Empate' : '🔴 Derrota';
    const resColor = ultimo.RESULTADO === 'G' ? '#2a7d2a' : ultimo.RESULTADO === 'E' ? '#b8860b' : '#8B1C1C';
    document.getElementById('ultimoPartido').innerHTML = `
      <div class="ultimo-card">
        <div class="uc-header">
          <span class="uc-fecha">${ultimo.FECHA || ''} · ${ultimo.CONDICION || ''}</span>
          <span class="uc-resultado" style="color:${resColor}">${res}</span>
        </div>
        <div class="uc-marcador">
          <span class="uc-equipo">La Cueva del Lobizón</span>
          <span class="uc-score">${ultimo.GOLES_LCdL} — ${ultimo.GOLES_RIVAL}</span>
          <span class="uc-equipo">${ultimo.RIVAL}</span>
        </div>
        ${ultimo.GOLEADORES ? `<div class="uc-goles">⚽ ${ultimo.GOLEADORES}</div>` : ''}
        ${ultimo.MVP ? `<div class="uc-mvp">🏆 MVP: ${ultimo.MVP}</div>` : ''}
        ${ultimo.DATOS_COLOR ? `<div class="uc-nota">${ultimo.DATOS_COLOR}</div>` : ''}
      </div>`;
  }
}

// ─── TEMPORADAS ───────────────────────────────────
function renderTemporadas(filter = 'all') {
  const grid = document.getElementById('temporadasGrid');
  let data = [...DATA.resumen].filter(t => t.TEMPORADA && t.PJ > 0);
  if (filter !== 'all') data = data.filter(t => t.CATEGORIA === filter);

  // Más recientes primero
  data.sort((a, b) => {
    if (b.TEMPORADA !== a.TEMPORADA) return Number(b.TEMPORADA) - Number(a.TEMPORADA);
    if (a.CATEGORIA === 'MAYORES') return -1;
    return 1;
  });

  grid.innerHTML = data.map(t => {
    const rend = Number(t.RENDIMIENTO_PCT) || 0;
    const fill = Math.round(rend);
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
        <div class="tc-bar"><div class="tc-bar-fill" style="width:${fill}%"></div></div>
        <div class="tc-footer">
          <span class="tc-goles">⚽ ${t.GF || 0} goles a favor</span>
          <span class="tc-div">Div. ${t.DIVISIONAL || '—'}</span>
        </div>
        <div class="tc-footer" style="margin-top:6px">
          <span style="font-size:0.78rem;color:#888">${t.PJ || 0} PJ · ${t.PTS || 0} pts · ${rend}% rend.</span>
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
function initGoleadores() {
  // Usar goleadores calculados desde partidos, con fallback a datos históricos hardcodeados
  let gols = DATA.goleadores.length > 0 ? DATA.goleadores : FALLBACK_GOLEADORES;
  gols = gols.slice(0, 10); // Top 10

  const maxG = gols[0]?.goles || 1;

  // Podio — orden correcto: oro(0) plata(1) bronce(2) pero visual: plata izq, oro centro, bronce der
  const podio = document.getElementById('golPodio');
  const top3 = gols.slice(0, 3);
  const ordenVisual = [
    { data: top3[1], clase: 'p2', medal: '🥈' },
    { data: top3[0], clase: 'p1', medal: '🥇' },
    { data: top3[2], clase: 'p3', medal: '🥉' },
  ];

  podio.innerHTML = ordenVisual.map(({ data: g, clase, medal }) => {
    if (!g) return '';
    const nombre = g.nombre.split(' ').slice(0, 2).join(' ');
    return `
    <div class="podio-item ${clase}">
      <span class="podio-medal">${medal}</span>
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
      <div class="gol-bar-wrap">
        <div class="gol-bar" style="width:${Math.round(g.goles / maxG * 100)}%"></div>
      </div>
      <span class="gol-count">${g.goles}</span>
    </div>`).join('');
}

// Fallback hardcodeado por si los datos del Sheet no cargan
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
    const badge = activo
      ? '<span class="jc-badge activo">Activo</span>'
      : '<span class="jc-badge retirado">Retirado</span>';
    const avatarContent = j.FOTO_URL
      ? `<img src="${j.FOTO_URL}" alt="${display}" />`
      : getInitials(nombre);

    return `
    <div class="jugador-card ${activo ? '' : 'retirado'}">
      <div class="jc-avatar">${avatarContent}</div>
      <div class="jc-nombre">${display}</div>
      ${j.APODO ? `<div style="font-size:0.72rem;color:#888;margin-bottom:2px">"${j.APODO}"</div>` : ''}
      ${badge}
      <div class="jc-stats">
        <div class="jcs"><span class="jcs-val">${j.PJ_TOTAL || 0}</span><span class="jcs-lbl">PJ</span></div>
        <div class="jcs"><span class="jcs-val">${j.GOLES_TOTAL || 0}</span><span class="jcs-lbl">Goles</span></div>
      </div>
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
function initRivales() {
  const tbody = document.getElementById('rivalBody');
  const search = document.getElementById('rivalSearch');

  function render(filter = '') {
    const filtered = DATA.rivales.filter(r => r.rival.toLowerCase().includes(filter.toLowerCase()));
    tbody.innerHTML = filtered.map(r => `
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

  render();
  search.addEventListener('input', e => render(e.target.value));
}

// ─── CURIOSIDADES ──────────────────────────────────
const CURIOSIDADES = [
  { tipo: "record", titulo: "El Goleador", texto: "Federico Rosso es el máximo goleador histórico con 117 goles en 150 partidos. Un promedio de 0.78 goles por partido." },
  { tipo: "record", titulo: "El Eterno Capitán", texto: "Juan Andrés Aldecoa es el jugador con más partidos disputados: 228 en total, el único que superó los 200 partidos." },
  { tipo: "record", titulo: "La Peor Derrota", texto: "El 19/9/2021 sufrimos la derrota más dolorosa: Jean Piaget 12-1. Un partido que nunca se olvida." },
  { tipo: "record", titulo: "La Mejor Temporada", texto: "2015 fue nuestra mejor temporada: 13 victorias, 4 empates y solo 4 derrotas. Promedio de 2.05 puntos por partido." },
  { tipo: "curiosidad", titulo: "Primer Gol Histórico", texto: "El primer gol en la historia de La Cueva fue de Alfonso Rosso Campamar, el 27 de abril de 2014 vs Pallotti Universitario. Perdimos 3-1." },
  { tipo: "curiosidad", titulo: "Primera Victoria", texto: "La primera victoria llegó el 22/6/2014 vs Jean Piaget: 0-1. El gol fue de Agustín Silvera." },
  { tipo: "record", titulo: "Copa de Plata 2014", texto: "En el primer año de vida, La Cueva ganó la Copa de Plata. Final vs C.S.D. Niágara: 2-1 con doblete de Nicolás Borgia." },
  { tipo: "curiosidad", titulo: "El Ascenso", texto: "El 6/10/2019 ascendimos a la Divisional G: victoria 2-1 ante Bella Vista. Fue el primer ascenso del club." },
  { tipo: "record", titulo: "Gol 50 de Fede", texto: "El gol número 50 de Federico Rosso llegó el 6/11/2018 vs Arnold Gesell, en una victoria 4-0 donde hizo hat-trick." },
  { tipo: "curiosidad", titulo: "El Arquero Agigantado", texto: "En 2023, Sigfrido Vettorazzi atajó dos penales en la misma jugada vs Macabí Universitario. Un hecho rarísimo." },
  { tipo: "record", titulo: "La Remontada Épica", texto: "En 2024 íbamos 0-4 a los 13 minutos vs NSdL y terminamos empatando 4-4. Renato Moncalvo hizo tres goles." },
  { tipo: "curiosidad", titulo: "Con 9 Jugadores", texto: "En 2025 ganamos 1-0 a Clara Jackson jugando con solo 9 jugadores. Una de las victorias más emotivas." },
  { tipo: "record", titulo: "Gol Olímpico Histórico", texto: "Mauro Serra marcó un gol olímpico (directo de corner) vs Estudiantes Españoles en 2019. Fue el último partido de Kike antes de irse a España." },
  { tipo: "curiosidad", titulo: "Rodrigo Kahrs Imparable", texto: "En 2025, Rodrigo Kahrs marcó 4 goles en una sola tarde: goleada 6-4 vs Mariscal Nasazzi." },
  { tipo: "record", titulo: "249 partidos y contando", texto: "Al cierre de 2025, La Cueva lleva 249 partidos en Mayores: 111 victorias, 41 empates y 97 derrotas." },
  { tipo: "curiosidad", titulo: "La Primera Presenior", texto: "En 2025 debutamos en Pre Senior. El primer partido fue el 29/3/2025 vs Varela Universitario. Un nuevo capítulo." },
  { tipo: "curiosidad", titulo: "Federico Rosso x3 penales", texto: "En 2025 (Presenior), Federico Rosso convirtió 3 penales en un solo partido vs Jean Piaget." },
  { tipo: "record", titulo: "DTs históricos", texto: "Seis directores técnicos han dirigido al equipo: Valmaggia (2014-16), Piñeyrúa (2017-18), González (2019-21), Bengochea (2022-23) y Coitiño (2024-presente)." },
];

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function renderCuriosidades() {
  const grid = document.getElementById('curiosidadesGrid');
  const selected = shuffle(CURIOSIDADES).slice(0, 6);
  grid.innerHTML = selected.map(c => `
    <div class="curiosidad-card">
      <div class="cur-tipo">${c.tipo === 'record' ? '🏆 Récord' : '⚡ Curiosidad'}</div>
      <div class="cur-titulo">${c.titulo}</div>
      <div class="cur-texto">${c.texto}</div>
    </div>`).join('');
}

// ─── CHATBOT ──────────────────────────────────────
const CLUB_CONTEXT = `Sos el asistente oficial de La Cueva del Lobizón, un equipo de fútbol amateur uruguayo fundado en 2004, compitiendo desde 2014. Respondé SIEMPRE en español, de manera amigable y apasionada, como un hincha del club. Usá tono informal y cálido. Si tiene sentido, usá emojis.

DATOS CLAVE: 272 partidos totales (249 Mayores + 23 Presenior). Goleador histórico: Federico Rosso con 117 goles. Más partidos: Juan Aldecoa con 228. DT actual: Diego Coitiño. Colores: Negro, Rojo Granate, Blanco. Mejor temporada: 2015 (promedio 2.05). Peor derrota: Jean Piaget 12-1 (2021). Primer título: Copa de Plata 2014. Ascenso a Div G: 2019. Primera Presenior: 2025.`;

function initChatbot() {
  const fab = document.getElementById('chatFab');
  const panel = document.getElementById('chatPanel');
  const closeBtn = document.getElementById('chatClose');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const messages = document.getElementById('chatMessages');

  fab.addEventListener('click', () => panel.classList.toggle('open'));
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  function addMsg(text, role) {
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function getBotFallback(q) {
    q = q.toLowerCase();
    if (q.includes('goleador') || q.includes('gol')) return '🏆 El máximo goleador es Federico Rosso con 117 goles en 150 partidos.';
    if (q.includes('partido')) return '📊 Jugamos 272 partidos oficiales: 249 en Mayores y 23 en Presenior.';
    if (q.includes('dt') || q.includes('técnico')) return '⚽ El DT actual es Diego Coitiño (desde 2024).';
    if (q.includes('peor') || q.includes('derrota')) return '😰 La peor derrota fue el 19/9/2021: Jean Piaget 12-1.';
    if (q.includes('mejor') || q.includes('temporada')) return '🌟 La mejor temporada fue 2015: 13V-4E-4P, promedio 2.05 puntos.';
    if (q.includes('aldecoa') || q.includes('juan')) return '⚽ Juan Andrés Aldecoa tiene 228 partidos, el único en superar los 200.';
    return '🐺 Configurá la API key de Claude en config.js para respuestas completas sobre la historia del Lobo.';
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg(text, 'user');
    const loading = addMsg('Pensando...', 'bot loading');

    try {
      const apiKey = window.CLAUDE_API_KEY || '';
      if (!apiKey) {
        loading.textContent = getBotFallback(text);
        loading.classList.remove('loading');
        return;
      }
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: CLUB_CONTEXT,
          messages: [{ role: 'user', content: text }],
        }),
      });
      const data = await response.json();
      loading.textContent = data.content?.[0]?.text || 'No pude procesar eso. Intentá de nuevo.';
    } catch (err) {
      loading.textContent = getBotFallback(text);
    }
    loading.classList.remove('loading');
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
}

// ─── INIT PRINCIPAL ───────────────────────────────
async function init() {
  initNav();

  const ok = await loadAllData();

  // Ocultar loading
  const ls = document.getElementById('loadingScreen');
  if (ls) ls.style.display = 'none';

  if (ok) {
    renderInicio();
    initTemporadas();
    initGoleadores();
    initJugadores();
    initRivales();
  } else {
    document.getElementById('heroSub').textContent = '12 temporadas. 272 partidos. Una manada.';
  }

  renderCuriosidades();
  initChatbot();

  document.getElementById('reloadCuriosidades').addEventListener('click', renderCuriosidades);
}

document.addEventListener('DOMContentLoaded', init);
