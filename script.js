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
    PNL:         13   // N
};

// ============================================================
// GLOBAL STATE
// ============================================================

let allPositions = [];
let countdown = CONFIG.REFRESH_INTERVAL / 1000;

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

        if (allPositions.length === 0) {
            showEmpty('No open positions found. All rows have an Exit Date filled in.');
            return;
        }

        renderTable();
        updateStats();
        updateLastUpdated();
        hideAllStates();

    } catch (error) {
        console.error('Load error:', error);
        showError(error.message);
    }
}

// ============================================================
// PROCESS DATA
// ============================================================

function processData(rows) {
    allPositions = rows
        .filter(row => {
            if (!row || row.length < 3) return false;

            // Must have a symbol
            const symbol = (row[COLUMNS.SYMBOL] || '').toString().trim();
            if (!symbol) return false;

            // A position is "open" when Exit Date (column K) is blank.
            // This mirrors the sheet formula: if EXIT_DATE is filled → Closed.
            // We don't rely on the formula-derived Status column (M) at all.
            const exitDate = (row[COLUMNS.EXIT_DATE] || '').toString().trim();
            if (exitDate) return false; // Has an exit date → closed

            return true;
        })
        .map(row => {
            // Clean P&L: strip currency symbols, commas, whitespace
            let pnlRaw = (row[COLUMNS.PNL] || '0').toString().replace(/[₹$,\s]/g, '').trim();
            if (!pnlRaw || pnlRaw === '-') pnlRaw = '0';

            return {
                strategy:   (row[COLUMNS.STRATEGY]    || '').trim(),
                exchange:   (row[COLUMNS.EXCHANGE]    || '').trim(),
                symbol:     (row[COLUMNS.SYMBOL]      || '').trim(),
                type:       (row[COLUMNS.TYPE]        || '').trim(),
                expiry:     (row[COLUMNS.EXPIRY]      || '').trim(),
                strike:     (row[COLUMNS.STRIKE]      || '').trim(),
                direction:  (row[COLUMNS.DIRECTION]   || '').trim(),
                qty:        (row[COLUMNS.QTY]         || '0').trim(),
                entryPrice: (row[COLUMNS.ENTRY_PRICE] || '0').trim(),
                ltp:        (row[COLUMNS.LTP]         || '0').trim(),
                pnl:        pnlRaw
            };
        });
}

// ============================================================
// RENDER TABLE
// ============================================================

function renderTable() {
    const tbody = document.getElementById('tableBody');
    const count = allPositions.length;

    document.getElementById('positionsCount').textContent = `${count} row${count !== 1 ? 's' : ''}`;

    tbody.innerHTML = allPositions.map((p, i) => {
        const pnlNum   = parseFloat(p.pnl) || 0;
        const pnlClass = pnlNum >= 0 ? 'positive' : 'negative';
        const pnlSign  = pnlNum >= 0 ? '+' : '−';
        const dirClass = p.direction.toLowerCase() === 'long' ? 'long' : 'short';

        return `<tr style="animation-delay:${i * 0.04}s">
            <td><span class="strategy-name">${esc(p.strategy)}</span></td>
            <td class="symbol-cell ${dirClass}">${esc(p.symbol)}</td>
            <td><span class="type-badge type-${esc(p.type)}">${esc(p.type)}</span></td>
            <td class="mono-cell">${fmtStrike(p.strike)}</td>
            <td class="expiry-cell">${fmtExpiry(p.expiry)}</td>
            <td class="qty-cell">${fmtQty(p.qty)}</td>
            <td class="mono-cell">${fmtPrice(p.entryPrice)}</td>
            <td class="mono-cell ltp">${fmtPrice(p.ltp)}</td>
            <td>
                <span class="pnl-badge ${pnlClass}">
                    <span class="pnl-sign">${pnlSign}</span>₹${fmtPnLAbs(pnlNum)}
                </span>
            </td>
        </tr>`;
    }).join('');
}

// ============================================================
// STATS
// ============================================================

function updateStats() {
    const totalPnL = allPositions.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);
    const winners  = allPositions.filter(p => parseFloat(p.pnl) > 0).length;
    const losers   = allPositions.filter(p => parseFloat(p.pnl) < 0).length;
    const sign     = totalPnL >= 0 ? '+' : '−';
    const cls      = totalPnL >= 0 ? 'positive' : 'negative';

    document.getElementById('totalPositions').textContent = allPositions.length;
    document.getElementById('winnersCount').textContent   = winners;
    document.getElementById('losersCount').textContent    = losers;
    document.getElementById('totalPnL').innerHTML =
        `<span class="${cls}">${sign}₹${fmtPnLAbs(totalPnL)}</span>`;
}

function updateLastUpdated() {
    document.getElementById('lastUpdated').textContent =
        new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
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
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(num));
}

function fmtExpiry(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr; // return as-is if not a parseable date
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
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
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('errorState').style.display   = 'none';
    document.getElementById('emptyState').style.display   = 'none';
    document.querySelector('.table-wrapper').style.display = 'none';
}

function showError(msg) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display   = 'flex';
    document.getElementById('emptyState').style.display   = 'none';
    document.querySelector('.table-wrapper').style.display = 'none';
    document.getElementById('errorMessage').textContent   = msg;
}

function showEmpty(msg) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display   = 'none';
    document.getElementById('emptyState').style.display   = 'flex';
    document.querySelector('.table-wrapper').style.display = 'none';
    const sub = document.getElementById('emptyMessage');
    if (sub && msg) sub.textContent = msg;
}

function hideAllStates() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display   = 'none';
    document.getElementById('emptyState').style.display   = 'none';
    document.querySelector('.table-wrapper').style.display = 'block';
}

// ============================================================
// INIT
// ============================================================

loadData();
setInterval(loadData, CONFIG.REFRESH_INTERVAL);
