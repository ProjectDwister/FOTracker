// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    SHEET_ID: '1Su_cw-0RyzHTFRP_aqolWtT956cmPHpJbojt2YbwZzc',
    API_KEY: 'AIzaSyA9RuEF0WuE7W8K4vkd_rfKI2-6MSLpIc0',
    RANGE: 'Sheet1!A2:N',
    REFRESH_INTERVAL: 5 * 60 * 1000,
};

// Column mapping — 0-indexed, matching actual Google Sheet columns A→N
const COLUMNS = {
    STRATEGY:    0,   // A
    EXCHANGE:    1,   // B
    SYMBOL:      2,   // C
    TYPE:        3,   // D
    EXPIRY:      4,   // E
    STRIKE:      5,   // F
    DIRECTION:   6,   // G
    QTY:         7,   // H
    ENTRY_DATE:  8,   // I
    ENTRY_PRICE: 9,   // J
    EXIT_DATE:   10,  // K
    LTP:         11,  // L
    STATUS:      12,  // M
    PNL:         13,  // N
};

// ============================================================
// GLOBAL STATE
// ============================================================

let allPositions    = [];   // open only (no exit date)
let closedPositions = [];   // closed only (has exit date)
let todayPnL        = null; // extracted from labelled summary row
let countdown       = CONFIG.REFRESH_INTERVAL / 1000;

// ============================================================
// MAIN LOAD FUNCTION
// ============================================================

async function loadData() {
    showLoading();
    resetCountdown();

    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${CONFIG.RANGE}?key=${CONFIG.API_KEY}`;
        const response = await fetch(url);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            if (response.status === 403) throw new Error('Access denied. Make sure the sheet is shared publicly and the API key is enabled.');
            if (response.status === 404) throw new Error('Sheet not found. Check the Sheet ID.');
            throw new Error(`API error ${response.status}: ${errData?.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();

        if (!data.values || data.values.length === 0) {
            showEmpty('No data found in the sheet.');
            return;
        }

        processData(data.values);
        renderTable();
        renderCards();
        updateStats();
        updateLastUpdated();

        if (allPositions.length === 0) {
            showEmpty('No open positions. All trades have been closed.');
        } else {
            hideAllStates();
        }

    } catch (error) {
        console.error('Load error:', error);
        showError(error.message);
    }
}

// ============================================================
// PROCESS DATA
// ============================================================

function processData(rows) {
    // Find Today's P&L by scanning for its label in column M
    todayPnL = null;
    const TODAY_LABEL = "today's p&l  (vs yesterday's eod)";
    for (const row of rows) {
        const label = (row[12] || '').toString().trim().toLowerCase();
        if (label === TODAY_LABEL) {
            const raw = (row[13] || '').toString().replace(/[₹$,\s]/g, '').trim();
            todayPnL = raw && raw !== '-' ? parseFloat(raw) : 0;
            break;
        }
    }

    const validRows = rows.filter(row => {
        if (!row || row.length < 3) return false;
        return (row[COLUMNS.SYMBOL] || '').toString().trim() !== '';
    });

    const mapRow = row => {
        let pnlRaw = (row[COLUMNS.PNL] || '0').toString().replace(/[₹$,\s]/g, '').trim();
        if (!pnlRaw || pnlRaw === '-') pnlRaw = '0';
        return {
            strategy:   (row[COLUMNS.STRATEGY]    || '').trim(),
            symbol:     (row[COLUMNS.SYMBOL]      || '').trim(),
            type:       (row[COLUMNS.TYPE]        || '').trim(),
            expiry:     (row[COLUMNS.EXPIRY]      || '').trim(),
            strike:     (row[COLUMNS.STRIKE]      || '').trim(),
            direction:  (row[COLUMNS.DIRECTION]   || '').trim(),
            qty:        (row[COLUMNS.QTY]         || '0').trim(),
            entryPrice: (row[COLUMNS.ENTRY_PRICE] || '0').trim(),
            ltp:        (row[COLUMNS.LTP]         || '0').trim(),
            pnl:        pnlRaw,
        };
    };

    allPositions    = validRows.filter(row => !(row[COLUMNS.EXIT_DATE] || '').toString().trim()).map(mapRow);
    closedPositions = validRows.filter(row =>  (row[COLUMNS.EXIT_DATE] || '').toString().trim()).map(mapRow);
}

// ============================================================
// RENDER TABLE  (Strategy | Derivative | Entry | LTP | P&L)
// ============================================================

function renderTable() {
    const tbody = document.getElementById('tableBody');
    const count = allPositions.length;
    document.getElementById('positionsCount').textContent = `${count} row${count !== 1 ? 's' : ''}`;

    tbody.innerHTML = allPositions.map((p, i) => {
        const pnlNum   = parseFloat(p.pnl) || 0;
        const pnlClass = pnlNum >= 0 ? 'positive' : 'negative';
        const pnlSign  = pnlNum < 0 ? '−' : '';

        return `<tr style="animation-delay:${i * 0.04}s">
            <td><span class="strategy-name">${esc(p.strategy)}</span></td>
            <td>${fmtDerivative(p)}</td>
            <td class="mono-cell text-right">${fmtPrice(p.entryPrice)}</td>
            <td class="mono-cell ltp text-right">${fmtPrice(p.ltp)}</td>
            <td><span class="pnl-badge ${pnlClass}">${pnlSign}₹${fmtPnLAbs(pnlNum)}</span></td>
        </tr>`;
    }).join('');
}

// ============================================================
// RENDER CARDS  (mobile portrait)
// ============================================================

function renderCards() {
    const list = document.getElementById('cardList');
    if (!list) return;

    list.innerHTML = allPositions.map((p, i) => {
        const pnlNum   = parseFloat(p.pnl) || 0;
        const pnlClass = pnlNum >= 0 ? 'positive' : 'negative';
        const pnlSign  = pnlNum < 0 ? '−' : '';

        return `<div class="position-card" style="animation-delay:${i * 0.04}s">
            <div class="card-top-left">
                ${fmtDerivative(p)}
                <span class="card-strategy">${esc(p.strategy)}</span>
            </div>
            <div class="card-top-right">
                <span class="pnl-badge ${pnlClass}">${pnlSign}₹${fmtPnLAbs(pnlNum)}</span>
            </div>
            <div class="card-bottom-left">
                <span class="card-entry">Entry ₹${fmtPrice(p.entryPrice)}</span>
            </div>
            <div class="card-bottom-right">
                <span class="card-ltp">₹${fmtPrice(p.ltp)}</span>
                <div class="card-meta" style="margin-top:2px">LTP</div>
            </div>
        </div>`;
    }).join('');
}

// ============================================================
// STATS
// ============================================================

function updateStats() {
    const sumPnL = arr => arr.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);
    const openPnL   = sumPnL(allPositions);
    const closedPnL = sumPnL(closedPositions);
    const totalPnL  = openPnL + closedPnL;

    const fmt = num => {
        const sign = num < 0 ? '−' : '';
        const cls  = num >= 0 ? 'positive' : 'negative';
        return `<span class="${cls}">${sign}₹${fmtPnLAbs(num)}</span>`;
    };

    document.getElementById('openPnL').innerHTML   = fmt(openPnL);
    document.getElementById('closedPnL').innerHTML = fmt(closedPnL);
    document.getElementById('totalPnL').innerHTML  = fmt(totalPnL);

    const todayEl = document.getElementById('todayPnL');
    if (todayEl) {
        todayEl.innerHTML = todayPnL !== null
            ? fmt(todayPnL)
            : '<span style="color:var(--text-3)">—</span>';
    }
}

function updateLastUpdated() {
    const t = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    document.getElementById('lastUpdated').textContent = t;
}

// ============================================================
// FORMATTERS
// ============================================================

function fmtPrice(val) {
    const n = parseFloat(val.toString().replace(/[₹$,\s]/g, ''));
    if (isNaN(n)) return val || '—';
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtStrike(val) {
    const n = parseFloat(val.toString().replace(/[₹$,\s]/g, ''));
    if (isNaN(n)) return val || '—';
    return Number.isInteger(n)
        ? new Intl.NumberFormat('en-IN').format(n)
        : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtQty(val) {
    const n = parseFloat(val.toString().replace(/[^0-9.-]/g, ''));
    if (isNaN(n)) return val || '—';
    return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

function fmtPnLAbs(num) {
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.abs(num));
}

function fmtExpiry(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}`;
}

// Builds the combined Derivative cell:
//   top line:  SYMBOL  CE/PE/FUT  Strike
//   sub line:  dd-mm  ·  Qty N
// CE/PE/FUT shown as plain coloured text (type-label), no box/padding.
// FUT rows omit strike (nothing after the label).
function fmtDerivative(p) {
    const isFut    = p.type.toUpperCase() === 'FUT';
    const dirClass = p.direction.toLowerCase() === 'long' ? 'long' : 'short';
    const typeStr  = p.type ? `<span class="type-label type-${esc(p.type.toUpperCase())}">${esc(p.type.toUpperCase())}</span>` : '';
    const strike   = (!isFut && p.strike) ? `<span class="deriv-strike">${fmtStrike(p.strike)}</span>` : '';
    const expiry   = fmtExpiry(p.expiry);
    const qty      = fmtQty(p.qty);

    return `<div class="deriv-cell">
        <div class="deriv-top">
            <span class="symbol-cell ${dirClass}">${esc(p.symbol)}</span>
            ${typeStr}
            ${strike}
        </div>
        <div class="deriv-sub">${expiry ? expiry + ' &nbsp;·&nbsp; ' : ''}Qty&nbsp;${qty}</div>
    </div>`;
}

function esc(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// ============================================================
// COUNTDOWN
// ============================================================

function resetCountdown() {
    countdown = CONFIG.REFRESH_INTERVAL / 1000;
    renderCountdown();
}

function renderCountdown() {
    const el = document.getElementById('countdown');
    if (!el) return;
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
}

setInterval(() => { if (countdown > 0) countdown--; renderCountdown(); }, 1000);

// ============================================================
// UI STATE
// ============================================================

function showLoading() {
    document.getElementById('loadingState').style.display  = 'flex';
    document.getElementById('errorState').style.display    = 'none';
    document.getElementById('emptyState').style.display    = 'none';
    document.querySelector('.table-wrapper').style.display = 'none';
}

function showError(msg) {
    document.getElementById('loadingState').style.display  = 'none';
    document.getElementById('errorState').style.display    = 'flex';
    document.getElementById('emptyState').style.display    = 'none';
    document.querySelector('.table-wrapper').style.display = 'none';
    document.getElementById('errorMessage').textContent    = msg;
}

function showEmpty(msg) {
    document.getElementById('loadingState').style.display  = 'none';
    document.getElementById('errorState').style.display    = 'none';
    document.getElementById('emptyState').style.display    = 'flex';
    document.querySelector('.table-wrapper').style.display = 'none';
    const sub = document.getElementById('emptyMessage');
    if (sub && msg) sub.textContent = msg;
}

function hideAllStates() {
    document.getElementById('loadingState').style.display  = 'none';
    document.getElementById('errorState').style.display    = 'none';
    document.getElementById('emptyState').style.display    = 'none';
    document.querySelector('.table-wrapper').style.display = 'block';
}

// ============================================================
// INIT
// ============================================================

loadData();
setInterval(loadData, CONFIG.REFRESH_INTERVAL);
