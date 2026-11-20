import { STADIUM } from './venue/stadiumConfig.js';
import { generateVenue } from './venue/generateVenue.js';
import { findBetterDeals } from './analysis/recommend.js';
import { StadiumScene } from './scene/StadiumScene.js';

const venue = generateVenue(STADIUM);
const scene = new StadiumScene(document.getElementById('stage'), venue);
window.__seatview = { venue, scene }; // útil para depurar

const $ = (id) => document.getElementById(id);
const state = { seat: null, deals: [], qty: 2 };
$('eventName').textContent = `${STADIUM.event} · ${STADIUM.name}`;

const seatTitle = (s) => `Sector ${s.sectorId} · Fila ${s.row} · Asiento ${s.number}`;
const eur = (v) => `${v.toLocaleString('es-ES')} €`;

// ---------- color / leyenda ----------
const LEGENDS = {
  price: { title: 'Precio por entrada', grad: '#20b2a0,#8bd346,#f4c542,#f08a3c,#e0457b', ends: () => {
    const p = venue.seats.map((s) => s.price); return [eur(Math.min(...p)), eur(Math.max(...p))]; } },
  view: { title: 'Calidad de la vista', grad: '#d64545,#f08a3c,#f0c429,#8bd346,#20c070', ends: () => ['3 / 10', '10 / 10'] },
};
$('colorMode').addEventListener('click', (e) => {
  const mode = e.target.dataset?.mode;
  if (!mode) return;
  [...$('colorMode').children].forEach((b) => b.classList.toggle('on', b === e.target));
  scene.setColorMode(mode);
  const lg = LEGENDS[mode];
  $('legend').classList.toggle('hidden', !lg);
  if (lg) {
    const [a, b] = lg.ends();
    $('legend').innerHTML = `${lg.title}<div class="bar" style="background:linear-gradient(90deg,${lg.grad})"></div>
      <div class="ends"><span>${a}</span><span>${b}</span></div><div style="margin-top:6px">▪ gris = vendido</div>`;
  }
});

$('qty').addEventListener('change', (e) => {
  state.qty = +e.target.value;
  if (state.seat) selectSeat(state.seat, { fly: false });
});

// ---------- navegación ----------
$('backBtn').addEventListener('click', () => {
  if (scene.mode === 'seat' && scene.focusSector) {
    scene.goSector(scene.focusSector);
  } else {
    state.seat = null;
    scene.setSelection(null);
    $('panel').classList.add('hidden');
    scene.goOverview();
  }
});

const HINTS = {
  overview: 'Pasa el ratón por las gradas y haz clic en un sector',
  sector: 'Haz clic en un asiento libre para ver su vista',
  seat: 'Arrastra para mirar alrededor · haz clic en otro asiento para cambiar',
};
scene.on('mode', (mode) => {
  $('hint').textContent = HINTS[mode];
  $('backBtn').classList.toggle('hidden', mode === 'overview');
  $('backBtn').textContent = mode === 'seat' ? '← Volver al sector' : '← Vista general';
});

// ---------- tooltip ----------
scene.on('hover', (h) => {
  const tt = $('tooltip');
  if (!h) return tt.classList.add('hidden');
  tt.classList.remove('hidden');
  tt.style.left = `${h.x}px`;
  tt.style.top = `${h.y}px`;
  if (h.level === 'sector') {
    const s = h.sector;
    const ratings = s.seatIdx.map((i) => venue.seats[i].rating);
    tt.innerHTML = `<b>${s.name}</b><div class="sub">${s.standName} · ${s.tierLabel}</div>
      <div>Desde <b style="display:inline">${eur(s.minPrice)}</b> · ${s.available} libres</div>
      <div class="sub">Vista ${Math.min(...ratings).toFixed(1)} – ${Math.max(...ratings).toFixed(1)} / 10</div>`;
  } else {
    const s = h.seat;
    tt.innerHTML = s.sold
      ? `<b>Fila ${s.row} · Asiento ${s.number}</b><div class="sold">Ocupado</div>`
      : `<b>Fila ${s.row} · Asiento ${s.number}</b><div>${eur(s.price)} · vista ${s.rating.toFixed(1)}/10</div>`;
  }
});

// ---------- selección ----------
scene.on('seatClick', (seat) => {
  if (seat.sold) return toast('Ese asiento ya está vendido');
  selectSeat(seat);
});

function selectSeat(seat, { fly = true } = {}) {
  state.seat = seat;
  state.deals = findBetterDeals(venue, seat, { quantity: state.qty, limit: 5 });
  scene.focusSector = venue.sectorById[seat.sectorId];
  scene.setSelection(seat, state.deals);
  if (fly) scene.goSeat(seat);
  renderPanel();
}

function renderPanel() {
  const s = state.seat;
  const sec = venue.sectorById[s.sectorId];
  $('panel').classList.remove('hidden');
  $('seatCard').innerHTML = `
    <div class="card">
      <div class="where">${sec.standName} · ${sec.tierLabel}</div>
      <h2>${seatTitle(s)}</h2>
      <div class="price">${eur(s.price)} <small>/ entrada${state.qty > 1 ? ` · ${eur(s.price * state.qty)} por ${state.qty}` : ''}</small></div>
      <div class="score">
        <div class="num" style="border-color:${ratingColor(s.rating)}">${s.rating.toFixed(1)}</div>
        <div class="txt"><b>Calidad de vista ${s.rating.toFixed(1)}/10</b><br>Mejor que el ${s.percentile}% de los asientos del estadio</div>
      </div>
      <div class="metrics">
        <div class="metric"><div class="v">${Math.round(s.distCenter)} m</div><div class="l">al centro del campo</div></div>
        <div class="metric"><div class="v">${Math.round(s.height)} m</div><div class="l">sobre el césped</div></div>
        <div class="metric"><div class="v">${Math.round(s.elevAngle)}°</div><div class="l">ángulo de visión</div></div>
      </div>
      ${s.underOverhang ? '<div class="warn">⚠ Bajo el voladizo de la grada superior: puedes perder balones altos.</div>' : ''}
      <button class="buy" id="buyBtn">Comprar ${state.qty > 1 ? `${state.qty} entradas` : 'entrada'} · ${eur(s.price * state.qty)}</button>
    </div>`;
  $('buyBtn').onclick = () => toast('Demo: aquí iría la pasarela de pago de la ticketera', true);

  const d = state.deals;
  const deals = $('deals');
  if (!d.length) {
    deals.innerHTML = `<div class="deals"><div class="ok">✓ <b>Buena elección.</b> No hay ningún asiento libre con una vista igual o mejor por menos dinero${state.qty > 1 ? ` para ${state.qty} personas juntas` : ''}.</div></div>`;
    return;
  }
  deals.innerHTML = `<div class="deals">
    <h3>💡 Puedes ver lo mismo (o más) pagando menos</h3>
    <p class="lead">${d.length === 5 ? 'Las 5 mejores' : d.length} opciones con vista igual o mejor${state.qty > 1 ? ` y ${state.qty} asientos juntos` : ''}:</p>
    ${d.map((x, i) => `
      <button class="deal" data-i="${i}">
        <img data-thumb="${i}" alt="Vista desde ${seatTitle(x.seat)}">
        <div class="body">
          <div>
            <div class="t">${seatTitle(x.seat)}<span class="tag ${x.kind}">${x.kind === 'better' ? 'Mejor vista' : 'Vista similar'}</span></div>
            <div class="s">${venue.sectorById[x.seat.sectorId].standName} · ${venue.sectorById[x.seat.sectorId].tierLabel} · vista ${x.seat.rating.toFixed(1)}</div>
          </div>
          <div class="save"><div class="p">${eur(x.seat.price)}</div><div class="d">−${eur(x.saving * state.qty)}</div></div>
        </div>
      </button>`).join('')}
  </div>`;
  deals.querySelectorAll('.deal').forEach((b) => (b.onclick = () => selectSeat(d[+b.dataset.i].seat)));

  // Miniaturas reales renderizadas desde cada asiento (una por frame para no bloquear)
  const imgs = [...deals.querySelectorAll('img[data-thumb]')];
  const next = () => {
    const img = imgs.shift();
    if (!img || state.deals !== d) return;
    img.src = scene.renderThumb(d[+img.dataset.thumb].seat);
    requestAnimationFrame(next);
  };
  requestAnimationFrame(next);
}

function ratingColor(r) {
  return r >= 8.5 ? '#20c070' : r >= 7 ? '#8bd346' : r >= 5.5 ? '#f0c429' : r >= 4 ? '#f08a3c' : '#d64545';
}

let toastTimer;
function toast(msg, ok) {
  const t = $('toast');
  t.textContent = msg;
  t.style.background = ok ? '#0f2b1d' : '';
  t.style.borderColor = ok ? '#36f28f66' : '';
  t.style.color = ok ? '#c9ffe0' : '';
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}
