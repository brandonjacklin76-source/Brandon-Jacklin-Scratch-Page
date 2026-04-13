// Simple World Commerce game
// Persistent via localStorage

const GAME_KEY = 'world_commerce_save_v1';

const goods = [
  { id: 'grain', name: 'Grain', base: 10, icon: '🌾' },
  { id: 'spices', name: 'Spices', base: 40, icon: '🧂' },
  { id: 'textiles', name: 'Textiles', base: 25, icon: '🧵' },
  { id: 'knights', name: 'Knights', base: 100, icon: '⚔️' }
];

// cost to build a city (materials consumed)
const BUILD_COST = { grain: 5, textiles: 2, spices: 1 };

// terrain types for map variety
const terrains = { plain: '🌾', forest: '🌲', mountain: '⛰️', water: '🌊' };

// terrain colors for canvas
const terrainColors = { plain: '#90EE90', forest: '#228B22', mountain: '#696969', water: '#4169E1' };

// city growth stages
const cityEmojis = ['🏘️', '🏙️', '🏢', '🌆', '🏛️'];

let state = {
  money: 1000,
  turn: 1,
  inventory: { grain: 0, spices: 0, textiles: 0, knights: 0 },
  prices: {},
  log: [],
  // map: simple grid; tiles: {type: 'plain', cityId: null}
  map: { cols: 10, rows: 6, tiles: [] },
  cities: []
};

function randRange(min, max) { return Math.random() * (max - min) + min; }

function log(msg) {
  state.log.unshift(`[Turn ${state.turn}] ${msg}`);
  if (state.log.length > 200) state.log.pop();
  renderLog();
}

function save() { localStorage.setItem(GAME_KEY, JSON.stringify(state)); }
function load() {
  const raw = localStorage.getItem(GAME_KEY);
  if (raw) {
    try { const s = JSON.parse(raw); Object.assign(state, s); return true; } catch(e) { console.warn(e); }
  }
  return false;
}

function reset() {
  state = {
    money: 1000,
    turn: 1,
    inventory: { grain: 0, spices: 0, textiles: 0, knights: 0 },
    prices: {},
    log: [],
    map: { cols: 6, rows: 4, tiles: [] },
    cities: []
  };
  initPrices();
  initMap();
  save();
  renderAll();
  log('New game started.');
}

function initPrices() {
  goods.forEach(g => {
    state.prices[g.id] = Math.round(g.base * randRange(0.9, 1.3));
  });
}

function initMap() {
  const cols = state.map.cols || 6;
  const rows = state.map.rows || 4;
  state.map.cols = cols; state.map.rows = rows;
  // (re)initialize tiles if empty or wrong size
  const expected = cols * rows;
  if (!Array.isArray(state.map.tiles) || state.map.tiles.length !== expected || !state.map.tiles.every(t => t && typeof t === 'object' && 'type' in t)) {
    state.map.tiles = new Array(expected).fill().map(() => ({
      type: Object.keys(terrains)[Math.floor(Math.random() * Object.keys(terrains).length)],
      cityId: null
    }));
  }
}

function fluctuatePrices() {
  goods.forEach(g => {
    const cur = state.prices[g.id] || g.base;
    // drift toward base with some volatility, but add occasional spikes
    let change = randRange(-0.18, 0.18);
    if (Math.random() < 0.05) change += randRange(0.4, 0.9) * (Math.random()<0.5? -1:1);
    let next = Math.max(1, Math.round(cur * (1 + change)));
    // clamp to reasonable bounds
    const min = Math.max(1, Math.round(g.base * 0.4));
    const max = Math.round(g.base * 4);
    next = Math.min(max, Math.max(min, next));
    state.prices[g.id] = next;
  });
}

function buy(id) {
  const price = state.prices[id];
  if (state.money >= price) {
    state.money -= price;
    state.inventory[id] = (state.inventory[id] || 0) + 1;
    save();
    renderAll();
    log(`Bought 1 ${id} for $${price}.`);
  } else {
    log(`Not enough money to buy ${id}.`);
  }
}

function sell(id) {
  if ((state.inventory[id] || 0) <= 0) { log(`No ${id} to sell.`); return; }
  const price = state.prices[id];
  state.inventory[id] -= 1;
  state.money += price;
  save();
  renderAll();
  log(`Sold 1 ${id} for $${price}.`);
}

function nextTurn() {
  // simple upkeep/event: small passive income from each good (trade profit)
  const income = Math.floor(Object.keys(state.inventory).reduce((acc,k)=>acc + (state.inventory[k] * 0.02 * (state.prices[k]||1)),0));
  if (income) {
    state.money += income;
    log(`Passive trade income: $${income}.`);
  }

  // city income
  if (state.cities && state.cities.length) {
    const cityIncome = state.cities.reduce((acc,c)=>acc + Math.floor((c.population || 0) / 10) * (c.level || 1), 0);
    if (cityIncome) {
      state.money += cityIncome;
      log(`Cities produced $${cityIncome} from population.`);
    }
  }

  // population management
  state.cities.forEach(city => {
    const consumption = Math.ceil(city.population / 100); // 1 grain per 100 people
    if (state.inventory.grain >= consumption) {
      state.inventory.grain -= consumption;
      // population growth
      const growth = Math.floor(city.population * 0.05); // 5% growth
      city.population += growth;
      if (growth > 0) log(`City #${city.id} population grew by ${growth}.`);
    } else {
      // starvation
      const loss = Math.min(10, Math.floor(city.population * 0.02));
      city.population -= loss;
      if (loss > 0) log(`City #${city.id} lost ${loss} population due to food shortage.`);
    }
  });

  // events
  if (state.turn % 10 === 0) {
    // economic depression
    if (state.cities.length < 3) {
      goods.forEach(g => {
        state.prices[g.id] = Math.max(1, Math.floor(state.prices[g.id] * 0.5));
      });
      log('Economic depression! Prices halved due to insufficient cities.');
    } else {
      log('Economic depression averted by your thriving cities!');
    }
  }

  if (state.turn % 15 === 0) {
    // enemy attack
    const baseDamage = 200;
    const cityDefense = state.cities.length * 30;
    const knightDefense = (state.inventory.knights || 0) * 5;
    const totalDefense = cityDefense + knightDefense;
    const damage = Math.max(0, baseDamage - totalDefense);
    if ((state.inventory.knights || 0) >= 20) {
      log('Your mighty knights repelled the enemy attack completely!');
    } else if (damage > 0) {
      state.money = Math.max(0, state.money - damage);
      log(`Enemy attack! Lost $${damage} due to insufficient defenses.`);
    } else {
      log('Enemy attack repelled by your cities and knights!');
    }
  }

  state.turn += 1;
  fluctuatePrices();
  save();
  renderAll();
}

/* Rendering */
function renderStats() {
  document.getElementById('stat-money').innerText = `$${state.money.toFixed(0)}`;
  document.getElementById('stat-turn').innerText = state.turn;
  const citiesCount = (state.cities && state.cities.length) || 0;
  document.getElementById('stat-cities').innerText = citiesCount;
  const totalPop = state.cities.reduce((acc,c)=>acc + (c.population || 0), 0);
  document.getElementById('stat-population').innerText = totalPop.toLocaleString();
}

function renderInventory() {
  const list = document.getElementById('inventory-list');
  list.innerHTML = '';
  goods.forEach(g => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `<div>${g.icon} ${g.name}</div><div>${state.inventory[g.id] || 0}</div>`;
    list.appendChild(li);
  });
}

function renderMarket() {
  const wrapper = document.getElementById('market-list');
  wrapper.innerHTML = '';
  goods.forEach(g => {
    const card = document.createElement('div');
    card.className = 'd-flex align-items-center justify-content-between p-2 border-bottom';
    const price = state.prices[g.id];
    card.innerHTML = `
      <div>
        <div class="fw-bolder">${g.icon} ${g.name}</div>
        <div class="small text-muted">Price: $<span id="price-${g.id}">${price}</span></div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-primary me-2" data-buy="${g.id}">Buy</button>
        <button class="btn btn-sm btn-outline-secondary" data-sell="${g.id}">Sell</button>
      </div>
    `;
    wrapper.appendChild(card);
  });
  // attach handlers
  wrapper.querySelectorAll('[data-buy]').forEach(btn => btn.addEventListener('click', e=>buy(e.currentTarget.dataset.buy)));
  wrapper.querySelectorAll('[data-sell]').forEach(btn => btn.addEventListener('click', e=>sell(e.currentTarget.dataset.sell)));
}

function canAffordBuild() {
  return Object.keys(BUILD_COST).every(k => (state.inventory[k] || 0) >= (BUILD_COST[k] || 0));
}

function renderMap() {
  initMap();
  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');
  const tileSize = 50;
  canvas.width = state.map.cols * tileSize;
  canvas.height = state.map.rows * tileSize;
  const costText = Object.entries(BUILD_COST).map(([k,v])=>`${v} ${k}`).join(', ');
  document.getElementById('build-cost').innerText = costText;

  state.map.tiles.forEach((tile, idx) => {
    const x = (idx % state.map.cols) * tileSize;
    const y = Math.floor(idx / state.map.cols) * tileSize;
    ctx.fillStyle = terrainColors[tile.type] || '#FFFFFF';
    ctx.fillRect(x, y, tileSize, tileSize);
    // draw grid lines
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, tileSize, tileSize);
    if (tile.cityId !== null) {
      const city = state.cities.find(c=>c.id === tile.cityId);
      const level = city ? (city.level || 1) : 1;
      const emojiIndex = Math.min(level - 1, cityEmojis.length - 1);
      ctx.font = '30px serif';
      ctx.fillStyle = '#000';
      ctx.fillText(cityEmojis[emojiIndex], x + 10, y + 35);
    }
  });
}

function buildCity(tileIdx) {
  const tile = state.map.tiles[tileIdx];
  if (tile.type !== 'plain') { log('Can only build cities on plains.'); return; }
  if (tile.cityId !== null) { log('Tile already has a city.'); return; }
  // check cost
  const affordable = Object.keys(BUILD_COST).every(k => (state.inventory[k] || 0) >= BUILD_COST[k]);
  if (!affordable) { log('Not enough materials to build a city.'); return; }
  // consume
  Object.keys(BUILD_COST).forEach(k => { state.inventory[k] -= BUILD_COST[k]; });
  // create city
  const newId = (state.cities.length? state.cities[state.cities.length-1].id+1 : 1);
  const city = { id: newId, tile: tileIdx, level: 1, population: 100 };
  state.cities.push(city);
  tile.cityId = newId;
  save();
  renderAll();
  log(`Built city #${newId} with 100 population.`);
}

function upgradeCity(cityId) {
  const city = state.cities.find(c => c.id === cityId);
  if (!city) return;
  const upgradeCost = city.level * 50;
  if (state.money >= upgradeCost) {
    state.money -= upgradeCost;
    city.level += 1;
    save();
    renderAll();
    log(`Upgraded city #${cityId} to level ${city.level} for $${upgradeCost}.`);
  } else {
    log(`Not enough money to upgrade city #${cityId}.`);
  }
}

function renderLog() {
  const el = document.getElementById('game-log');
  el.innerHTML = state.log.map(l => `<div>${l}</div>`).join('');
}

function renderAll() {
  renderStats();
  renderInventory();
  renderMarket();
  renderMap();
  renderLog();
}

/* Init */
(function(){
  const loaded = load();
  if (!loaded) initPrices();
  renderAll();
  // bind buttons
  document.getElementById('btn-next').addEventListener('click', ()=>{ nextTurn(); });
  document.getElementById('btn-reset').addEventListener('click', ()=>{ if(confirm('Reset game?')) reset(); });

  // canvas click handler
  const canvas = document.getElementById('map');
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tileSize = 50;
    const col = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);
    const idx = row * state.map.cols + col;
    if (idx >= 0 && idx < state.map.tiles.length) {
      const tile = state.map.tiles[idx];
      if (tile.cityId) {
        upgradeCity(tile.cityId);
      } else if (tile.type === 'plain') {
        buildCity(idx);
      }
    }
  });

  // show initial message
  if (!loaded) log('Welcome trader — start buying and selling!');
  else log('Save loaded.');
})();
