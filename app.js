// =====================================================
// LA CUEVA DEL LOBIZÓN — APP.JS
// =====================================================

// D se asigna en DOMContentLoaded para garantizar que data.js ya cargó
let D = {};

// ─── UTILS ────────────────────────────────────────
function getInitials(nombre) {
  return nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}
function emojiPos(i) { return ['🥇','🥈','🥉'][i] || `${i+1}°`; }
function eficienciaClass(e) {
  if (e >= 65) return 'efic-alta';
  if (e >= 40) return 'efic-media';
  return 'efic-baja';
}
function animateCount(el) {
  const target = +el.dataset.target;
  const duration = 1600;
  const start = performance.now();
  const update = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(ease * target);
    if (t < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// ─── HERO COUNTERS ─────────────────────────────────
function initHeroCounters() {
  const els = document.querySelectorAll('.hstat-num');
  // Si ya están en el viewport al cargar, animalos directamente
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { animateCount(e.target); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -10px 0px' });
  els.forEach(el => {
    // Forzar valor inicial en 0 visualmente
    el.textContent = '0';
    obs.observe(el);
  });
}

// ─── NAV ──────────────────────────────────────────
function initNav() {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  toggle.addEventListener('click', () => nav.classList.toggle('open'));
  nav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => nav.classList.remove('open'));
  });

  // Active link on scroll
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');
  const onScroll = () => {
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 100) current = s.id;
    });
    navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${current}`));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

// ─── TEMPORADAS ────────────────────────────────────
function renderTemporadas(filter = 'all') {
  const grid = document.getElementById('temporadasGrid');
  const data = filter === 'all' ? D.resumenTemporadas : D.resumenTemporadas.filter(t => t.categoria === filter);
  grid.innerHTML = data.map(t => {
    const fill = Math.round(t.rendimiento);
    const catClass = t.categoria === 'PRESENIOR' ? 'presenior' : '';
    return `
    <div class="temporada-card fade-up">
      <div class="tc-header">
        <span class="tc-year">${t.temporada}</span>
        <span class="tc-cat ${catClass}">${t.categoria === 'PRESENIOR' ? 'PRE SENIOR' : 'MAYORES'}</span>
      </div>
      <div class="tc-body">
        <p class="tc-dt">DT: <span>${t.dt}</span></p>
        <div class="tc-stats">
          <div class="tc-stat"><span class="tc-stat-num g">${t.pg}</span><span class="tc-stat-label">Victorias</span></div>
          <div class="tc-stat"><span class="tc-stat-num e">${t.pe}</span><span class="tc-stat-label">Empates</span></div>
          <div class="tc-stat"><span class="tc-stat-num p">${t.pp}</span><span class="tc-stat-label">Derrotas</span></div>
        </div>
        <div class="tc-bar"><div class="tc-bar-fill" style="width:${fill}%"></div></div>
        <div class="tc-footer">
          <span class="tc-goles">⚽ ${t.gf} goles a favor</span>
          <span class="tc-div">Div. ${t.divisional}</span>
        </div>
        <div class="tc-footer" style="margin-top:6px">
          <span style="font-size:0.78rem;color:#888">${t.pj} PJ · ${t.pts} pts · ${t.rendimiento}% rend.</span>
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

// ─── GOLEADORES ────────────────────────────────────
function initGoleadores() {
  const gols = [...D.goleadoresHistoricos].sort((a, b) => b.goles - a.goles);
  const maxG = gols[0].goles;

  // Podio top 3
  const podio = document.getElementById('golPodio');
  const orden = [1, 0, 2]; // plata, oro, bronce
  podio.innerHTML = orden.map(i => {
    const g = gols[i];
    const medals = ['🥇', '🥈', '🥉'];
    const classes = ['p1', 'p2', 'p3'];
    return `
    <div class="podio-item ${classes[i]}">
      <span class="podio-medal">${medals[i]}</span>
      <span class="podio-goles">${g.goles}</span>
      <span class="podio-nombre">${g.nombre.split(' ').slice(0, 2).join(' ')}</span>
      <span class="podio-detalle">${g.pj} partidos jugados</span>
    </div>`;
  }).join('');

  // Tabla resto
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

// ─── JUGADORES ─────────────────────────────────────
function renderJugadores(filter = 'all') {
  const grid = document.getElementById('jugadoresGrid');
  let data = [...D.jugadores].filter(j => j.pj > 0);
  if (filter === 'activo') data = data.filter(j => j.activo);
  if (filter === 'retired') data = data.filter(j => !j.activo);
  data.sort((a, b) => b.pj - a.pj);

  grid.innerHTML = data.map(j => {
    const nombre = j.nombre.split(' ');
    const display = nombre.length >= 3 ? `${nombre[0]} ${nombre[nombre.length - 2]}` : j.nombre;
    const badge = j.activo
      ? '<span class="jc-badge activo">Activo</span>'
      : '<span class="jc-badge retirado">Retirado</span>';
    return `
    <div class="jugador-card ${j.activo ? '' : 'retirado'}">
      <div class="jc-avatar">
        ${j.fotoUrl ? `<img src="${j.fotoUrl}" alt="${display}" />` : getInitials(j.nombre)}
      </div>
      <div class="jc-nombre">${display}</div>
      ${badge}
      <div class="jc-stats">
        <div class="jcs"><span class="jcs-val">${j.pj}</span><span class="jcs-lbl">PJ</span></div>
        <div class="jcs"><span class="jcs-val">${j.goles}</span><span class="jcs-lbl">Goles</span></div>
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
  const sorted = [...D.rivalStats].sort((a, b) => b.pj - a.pj);

  function render(filter = '') {
    const filtered = sorted.filter(r => r.rival.toLowerCase().includes(filter.toLowerCase()));
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
  search.addEventListener('input', (e) => render(e.target.value));
}

// ─── CURIOSIDADES ──────────────────────────────────
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function renderCuriosidades() {
  const grid = document.getElementById('curiosidadesGrid');
  const selected = shuffle(D.datosCuriosos).slice(0, 6);
  grid.innerHTML = selected.map(c => `
    <div class="curiosidad-card">
      <div class="cur-tipo">${c.tipo === 'record' ? '🏆 Récord' : '⚡ Curiosidad'}</div>
      <div class="cur-titulo">${c.titulo}</div>
      <div class="cur-texto">${c.texto}</div>
    </div>`).join('');
}

function initCuriosidades() {
  renderCuriosidades();
  document.getElementById('reloadCuriosidades').addEventListener('click', renderCuriosidades);
}

// ─── CHATBOT ──────────────────────────────────────
// Contexto del equipo para el bot
const CLUB_CONTEXT = `
Sos el asistente oficial de La Cueva del Lobizón, un equipo de fútbol amateur uruguayo.
Respondé SIEMPRE en español, de manera amigable y apasionada, como si fueras un hincha del club que conoce toda su historia.
Usá un tono informal, cálido, con algo de humor futbolero. Si tiene sentido, usá algún emoji.

INFORMACIÓN CLAVE DEL CLUB:
- Fundado en 2004, compite desde 2014 en categoría Mayores. En 2025 se sumó la categoría Pre Senior.
- Colores: Negro, Rojo Granate y Blanco. La camiseta tiene una banda diagonal característica.
- Apodo: "El Lobo" / "Los Lobos"

DIRECTORES TÉCNICOS HISTÓRICOS:
- 2014-2016: Martín Valmaggia
- 2017-2018: Andrés Piñeyrúa (también jugó en Presenior 2025)
- 2019-2021: Uberfil González "Uber"
- 2022-2023: Santiago Bengochea
- 2024-presente: Diego Coitiño

RENDIMIENTO POR TEMPORADA (Mayores):
- 2014: 11G-2E-7P, 42 goles, Div. I. Copa de Plata campeones (primer año).
- 2015: 13G-4E-4P, 48 goles, Div. I. Mejor temporada histórica (prom 2.05).
- 2016: 6G-6E-10P, 37 goles, Div. H. Temporada difícil, peor racha.
- 2017: 8G-5E-9P, 28 goles, Div. H.
- 2018: 7G-7E-8P, 29 goles, Div. H.
- 2019: 13G-1E-7P, 50 goles, Div. H. Ascenso a Div. G.
- 2020: 11G-1E-5P, 46 goles, Div. G.
- 2021: 8G-1E-13P, 32 goles, Div. G. Afectada por COVID. Peor derrota: Jean Piaget 12-1.
- 2022: 8G-4E-6P, 30 goles, Div. G.
- 2023: 9G-3E-9P, 42 goles, Div. F.
- 2024: 7G-5E-9P, 47 goles, Div. F.
- 2025: 10G-2E-10P, 44 goles, Div. F. Primera temporada Presenior: 9G-4E-10P.

GOLEADORES HISTÓRICOS:
1. Federico Rosso Campamar: 117 goles (109 Mayores + 8 Presenior), 150 PJ
2. Mauro Serra Baltasar: 58 goles, 134 PJ
3. Renato Moncalvo: 52 goles, 139 PJ
4. Alfonso Rosso Campamar: 36 goles, 167 PJ
5. Gastón García: 33 goles, 65 PJ
6. Enrique Martínez: 19 goles, 190 PJ
7. Rodrigo Kahrs: 17 goles
8. Nicolás Zabaleta: 17 goles
9. Nicolás Borgia: ~13 goles (2014-2016)
10. Agustín Tosar: 10 goles

JUGADOR MÁS PARTIDOS: Juan Andrés Aldecoa Villar, 228 partidos (único en pasar 200).

HITOS HISTÓRICOS:
- 27/4/2014: Primer partido histórico vs Pallotti (derrota 3-1). Primer gol: Alfonso Rosso.
- 22/6/2014: Primera victoria vs Jean Piaget (0-1). Gol: Agustín Silvera.
- 4/12/2014: Copa de Plata campeones, final vs C.S.D. Niágara 2-1. Goles: Nicolás Borgia x2.
- 2015: Mauro Serra marcó 4 goles vs Clara Jackson.
- 2017: Gol de tiro libre de media cancha en el minuto 93'.
- 2018: Gol 50 de Federico Rosso vs Arnold Gesell (hat-trick en triunfo 4-0).
- 2019: Gol olímpico de Mauro Serra. Ascenso a Div. G.
- 2020: Federico Rosso marcó 20 goles en la temporada.
- 19/9/2021: Peor derrota histórica: Jean Piaget 12-1.
- 2023: Sigfrido Vettorazzi atajó 2 penales en la misma jugada vs Macabí.
- 2024: Remontada épica de 0-4 a 4-4 vs NSdL. Renato Moncalvo x3.
- 2025: Victorias jugando con 9 jugadores vs Clara Jackson.
- 2025 Presenior: Federico Rosso convirtió 3 penales en un partido vs Jean Piaget.
- 2025 Mayores: Rodrigo Kahrs marcó 4 goles vs Mariscal Nasazzi (6-4).

TOTALES HISTÓRICOS AL 2025:
- Mayores: 249 partidos, 111 victorias, 41 empates, 97 derrotas. 475 goles a favor.
- Presenior: 23 partidos, 9 victorias, 4 empates, 10 derrotas. 34 goles a favor.

Respondé cualquier pregunta sobre el club, sus jugadores, estadísticas o historia de manera precisa y entusiasta.
Si no tenés el dato exacto, indicalo honestamente pero con buena onda.
`;

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

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg(text, 'user');

    const loading = addMsg('Pensando...', 'bot loading');

    try {
      // Claude API - usar config.js para la key
      const apiKey = window.CLAUDE_API_KEY || '';
      if (!apiKey) {
        loading.textContent = '⚠️ Para usar el bot, configurá la API key de Claude en config.js. Por ahora te digo: ' + getBotFallback(text);
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
      loading.textContent = 'Error al conectar con el bot. ' + getBotFallback(text);
    }
    loading.classList.remove('loading');
  }

  // Fallback local para preguntas básicas
  function getBotFallback(q) {
    q = q.toLowerCase();
    if (q.includes('goleador') || q.includes('gol')) return '🏆 El máximo goleador histórico es Federico Rosso con 117 goles en 150 partidos.';
    if (q.includes('partido') || q.includes('jugad')) return '📊 Jugamos 249 partidos en Mayores y 23 en Presenior. Total: 272 partidos oficiales.';
    if (q.includes('dt') || q.includes('técnico') || q.includes('director')) return '⚽ El DT actual es Diego Coitiño (desde 2024). Antes: Bengochea, Uber González, Piñeyrúa y Valmaggia.';
    if (q.includes('peor') || q.includes('derrota')) return '😰 La peor derrota fue el 19/9/2021: Jean Piaget 12-1. Un día para olvidar...';
    if (q.includes('mejor') || q.includes('temporada')) return '🌟 La mejor temporada fue 2015: 13 victorias, 4 empates, 4 derrotas. Promedio de 2.05 puntos.';
    if (q.includes('aldecoa') || q.includes('juan')) return '⚽ Juan Andrés Aldecoa tiene 228 partidos, ¡el único que superó los 200! El motor del equipo.';
    if (q.includes('fede') || q.includes('rosso')) return '⚽ Federico Rosso es el máximo goleador con 117 goles. ¡Una máquina de hacer goles!';
    return 'Configurá la API key de Claude para respuestas completas sobre la historia del Lobo 🐺';
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
}

// ─── INIT ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Asegurarse que los datos estén disponibles
  if (!window.LCDL_DATA) {
    console.error('LCDL_DATA no encontrado. Verificar que data.js cargó correctamente.');
    return;
  }
  // Reasignar D con los datos reales
  Object.assign(D, window.LCDL_DATA);

  initNav();
  initHeroCounters();
  initTemporadas();
  initGoleadores();
  initJugadores();
  initRivales();
  initCuriosidades();
  initChatbot();
});
