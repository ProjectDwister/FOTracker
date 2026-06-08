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
let prevPnLMap      = new Map(); // symbol+strike+expiry → pnl from last cycle
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
    const TODAY_LABEL = "today";
    for (const row of rows) {
        // The summary rows have the label merged across cols A–M (index 0)
        // and the value in col N (index 13)
        const labelA = (row[0]  || '').toString().trim().toLowerCase();
        const labelM = (row[12] || '').toString().trim().toLowerCase();
        const label  = labelA || labelM; // check both just in case
        if (label === TODAY_LABEL) {
            const raw = (row[13] || '').toString().trim();
            // Sheet returns "—" when Q1 (EOD snapshot) is empty
            if (raw === '' || raw === '—' || raw === '-') {
                todayPnL = null;
            } else {
                const cleaned = raw.replace(/[₹$,\s]/g, '').trim();
                const parsed  = parseFloat(cleaned);
                todayPnL = isNaN(parsed) ? null : parsed;
            }
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

    // Snapshot current P&L before overwriting positions
    const prevSnapshot = new Map(prevPnLMap);

    allPositions    = validRows.filter(row => !(row[COLUMNS.EXIT_DATE] || '').toString().trim()).map(mapRow);
    closedPositions = validRows.filter(row =>  (row[COLUMNS.EXIT_DATE] || '').toString().trim()).map(mapRow);

    // Attach delta vs previous cycle to each open position
    allPositions.forEach(p => {
        const prev = prevSnapshot.get(posKey(p));
        const curr = parseFloat(p.pnl) || 0;
        p.pnlDelta = prev !== undefined ? curr - prev : null;
    });

    // Save current as next prev
    prevPnLMap = new Map();
    allPositions.forEach(p => prevPnLMap.set(posKey(p), parseFloat(p.pnl) || 0));
}

// Unique key per position for P&L delta tracking
function posKey(p) {
    return `${p.symbol}|${p.type}|${p.strike}|${p.expiry}`;
}

// ============================================================
// RENDER TABLE  (Strategy | Derivative | Entry | LTP | P&L)
// ============================================================

function renderTable() {
    const tbody = document.getElementById('tableBody');
    const count = allPositions.length;
    const countEl = document.getElementById('positionsCount');
    if (countEl) countEl.textContent = `${count} row${count !== 1 ? 's' : ''}`;

    // Track whether any P&L changed for haptic
    let anyChanged = false;

    tbody.innerHTML = allPositions.map((p, i) => {
        const pnlNum   = parseFloat(p.pnl) || 0;
        const pnlClass = pnlNum >= 0 ? 'positive' : 'negative';

        // Flash class for row background
        let flashClass = '';
        if (p.pnlDelta !== null && Math.abs(p.pnlDelta) >= 0.01) {
            anyChanged = true;
            flashClass = p.pnlDelta > 0 ? 'flash-green' : 'flash-red';
        }

        return `<tr class="${flashClass}" style="animation-delay:${i * 0.04}s" data-key="${esc(posKey(p))}">
            <td><span class="strategy-name">${esc(p.strategy)}</span></td>
            <td>${fmtDerivative(p)}</td>
            <td class="qty-cell text-right">${fmtQty(p.qty)}</td>
            <td class="mono-cell text-right">${fmtPrice(p.entryPrice)}</td>
            <td class="mono-cell ltp text-right">${fmtPrice(p.ltp)}</td>
            <td><span class="pnl-badge ${pnlClass}">₹${fmtPnLAbs(pnlNum)}</span></td>
        </tr>`;
    }).join('');

    // Remove flash class after animation completes
    if (anyChanged) {
        setTimeout(() => {
            tbody.querySelectorAll('.flash-green, .flash-red').forEach(el => {
                el.classList.remove('flash-green', 'flash-red');
            });
        }, 1200);

        // Haptic on mobile — single short pulse if any P&L changed
        if (navigator.vibrate) navigator.vibrate(40);
    }
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

        const flashClass = (p.pnlDelta !== null && Math.abs(p.pnlDelta) >= 0.01)
            ? (p.pnlDelta > 0 ? 'flash-green' : 'flash-red') : '';

        return `<div class="position-card ${flashClass}" style="animation-delay:${i * 0.04}s">
            <div class="card-top-left">
                ${fmtDerivative(p)}
                <span class="card-strategy">${esc(p.strategy)}</span>
            </div>
            <div class="card-top-right">
                <span class="pnl-badge ${pnlClass}">₹${fmtPnLAbs(pnlNum)}</span>
            </div>
            <div class="card-bottom-left">
                <span class="card-meta">Qty ${fmtQty(p.qty)}</span>
                <span class="card-entry">Entry ₹${fmtPrice(p.entryPrice)}</span>
            </div>
            <div class="card-bottom-right">
                <span class="card-ltp"><span class="card-meta">LTP </span>₹${fmtPrice(p.ltp)}</span>
            </div>
        </div>`;
    }).join('');

    // Clear flash after animation
    setTimeout(() => {
        list.querySelectorAll('.flash-green, .flash-red').forEach(el => {
            el.classList.remove('flash-green', 'flash-red');
        });
    }, 1200);
}

// ============================================================
// STATS
// ============================================================

// Track previous stat values for ticker animation
const prevStatValues = { openPnL: null, totalPnL: null, todayPnL: null };

// Animate a stat element from oldVal → newVal over ~600ms (easeOutQuart)
function animateStat(elId, oldVal, newVal) {
    const el = document.getElementById(elId);
    if (!el) return;

    // If no previous value, just set immediately
    if (oldVal === null || oldVal === newVal) {
        el.innerHTML = fmtStat(newVal);
        return;
    }

    const duration = 600;
    const startTime = performance.now();
    const diff = newVal - oldVal;

    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutQuart — fast start, smooth finish
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = oldVal + diff * eased;
        el.innerHTML = fmtStat(current);
        if (progress < 1) requestAnimationFrame(tick);
        else el.innerHTML = fmtStat(newVal); // snap to exact final value
    }

    requestAnimationFrame(tick);
}

function fmtStat(num) {
    const cls = num >= 0 ? 'positive' : 'negative';
    return `<span class="${cls}">₹${fmtPnLAbs(num)}</span>`;
}

function updateStats() {
    const sumPnL = arr => arr.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);
    const openPnL   = sumPnL(allPositions);
    const closedPnL = sumPnL(closedPositions);
    const totalPnL  = openPnL + closedPnL;

    // Animate Open, Total, Today — set Closed directly (not requested)
    animateStat('openPnL',  prevStatValues.openPnL,  openPnL);
    animateStat('totalPnL', prevStatValues.totalPnL, totalPnL);

    document.getElementById('closedPnL').innerHTML = fmtStat(closedPnL);

    const todayEl = document.getElementById('todayPnL');
    if (todayEl) {
        if (todayPnL !== null) {
            animateStat('todayPnL', prevStatValues.todayPnL, todayPnL);
        } else {
            todayEl.innerHTML = '<span style="color:var(--text-3)">—</span>';
        }
    }

    // Save for next cycle
    prevStatValues.openPnL  = openPnL;
    prevStatValues.totalPnL = totalPnL;
    prevStatValues.todayPnL = todayPnL;

    // Update mobile ticker (both copies for seamless loop)
    const tickerFmt = num => {
        if (num === null) return '—';
        const cls = num >= 0 ? 'positive' : 'negative';
        return `<span class="${cls}">₹${fmtPnLAbs(num)}</span>`;
    };
    ['', '2'].forEach(suffix => {
        const o = document.getElementById(`tickerOpen${suffix}`);
        const c = document.getElementById(`tickerClosed${suffix}`);
        const t = document.getElementById(`tickerTotal${suffix}`);
        const d = document.getElementById(`tickerToday${suffix}`);
        if (o) o.innerHTML = tickerFmt(openPnL);
        if (c) c.innerHTML = tickerFmt(closedPnL);
        if (t) t.innerHTML = tickerFmt(totalPnL);
        if (d) d.innerHTML = tickerFmt(todayPnL);
    });
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
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
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

    return `<div class="deriv-cell">
        <div class="deriv-top">
            <span class="symbol-cell ${dirClass}">${esc(p.symbol)}</span>
            ${typeStr}
            ${strike}
        </div>
        ${expiry ? `<div class="deriv-sub">${expiry}</div>` : ''}
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

// Set table header month/year
(function() {
    const el = document.getElementById('tableMonthYear');
    if (el) {
        const now = new Date();
        el.textContent = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase();
    }
})();

// Market status badge — Live (green) 9:00–17:00 IST, Closed (red) otherwise
function updateMarketStatus() {
    const badge = document.querySelector('.live-badge');
    const label = badge ? badge.querySelector('.label') : null;
    if (!badge || !label) return;

    const now = new Date();
    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60; // minutes
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istMin = (utcMin + istOffset) % (24 * 60);

    // Check IST weekday (0 = Sunday, 6 = Saturday)
    const istDate = new Date(now.getTime() + istOffset * 60 * 1000);
    const istDay  = istDate.getUTCDay();
    const isWeekday = istDay >= 1 && istDay <= 5;

    const isOpen = isWeekday && istMin >= 9 * 60 && istMin < 17 * 60;

    if (isOpen) {
        badge.classList.remove('closed');
        label.textContent = 'Live';
    } else {
        badge.classList.add('closed');
        label.textContent = 'Closed';
    }
}

updateMarketStatus();
setInterval(updateMarketStatus, 60 * 1000); // recheck every minute

loadData();
setInterval(loadData, CONFIG.REFRESH_INTERVAL);
