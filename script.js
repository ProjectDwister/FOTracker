// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    SHEET_ID: '1Su_cw-0RyzHTFRP_aqolWtT956cmPHpJbojt2YbwZzc',
    API_KEY: 'AIzaSyA9RuEF0WuE7W8K4vkd_rfKI2-6MSLpIc0',
    RANGE: 'Sheet1!A2:N',
    REFRESH_INTERVAL: 5 * 60 * 1000,
};

// Column mapping for Sheet1 (0-indexed) — matches actual sheet order
const COLUMNS = {
    STRATEGY:    0,   // Column A
    EXCHANGE:    1,   // Column B
    SYMBOL:      2,   // Column C
    TYPE:        3,   // Column D
    EXPIRY:      4,   // Column E  ← was wrongly STRIKE
    STRIKE:      5,   // Column F  ← was wrongly EXPIRY
    DIRECTION:   6,   // Column G
    QTY:         7,   // Column H
    ENTRY_DATE:  8,   // Column I
    ENTRY_PRICE: 9,   // Column J
    EXIT_DATE:   10,  // Column K
    LTP:         11,  // Column L
    STATUS:      12,  // Column M
    PNL:         13   // Column N
};

// ============================================================
// GLOBAL STATE
// ============================================================

let allPositions = [];
let refreshTimer = null;
let countdown = CONFIG.REFRESH_INTERVAL / 1000;

// ============================================================
// MAIN FUNCTIONS
// ============================================================

async function loadData() {
    showLoading();
    resetCountdown();

    try {
        if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'YOUR_GOOGLE_SHEET_ID_HERE') {
            throw new Error('Please configure SHEET_ID in script.js');
        }
        if (!CONFIG.API_KEY || CONFIG.API_KEY === 'YOUR_GOOGLE_API_KEY_HERE') {
            throw new Error('Please configure API_KEY in script.js');
        }

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${CONFIG.RANGE}?key=${CONFIG.API_KEY}`;
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 400) throw new Error('Invalid request. Check Sheet ID, API Key, and range format.');
            else if (response.status === 403) throw new Error('Access denied. Make sure the sheet is public and API is enabled.');
            else if (response.status === 404) throw new Error('Sheet not found. Check Sheet ID and sheet name.');
            else throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.values || data.values.length === 0) {
            showEmpty();
            return;
        }

        processData(data.values);
        renderTable();
        updateStats();
        updateLastUpdated();
        hideAllStates();
    const count = allPositions.length;
    document.getElementById("positionsCount").textContent = `${count} row${count !== 1 ? "s" : ""}`;

    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    }
}

function processData(rows) {
    allPositions = rows
        .filter(row => {
            if (!row || row.length <= COLUMNS.STATUS) return false;
            const status = row[COLUMNS.STATUS];
            if (!status || status.toString().trim().toLowerCase() !== 'open') return false;
            const qty = row[COLUMNS.QTY];
            if (!qty || qty.toString().trim() === '' || parseFloat(qty.toString().replace(/[^0-9.-]/g, '')) === 0) return false;
            const symbol = row[COLUMNS.SYMBOL];
            if (!symbol || symbol.toString().trim() === '') return false;
            const strategy = row[COLUMNS.STRATEGY];
            if (!strategy || strategy.toString().trim() === '') return false;
            const type = row[COLUMNS.TYPE];
            if (!type || type.toString().trim() === '') return false;
            return true;
        })
        .map(row => {
            let pnlValue = '0';
            if (row[COLUMNS.PNL]) {
                pnlValue = row[COLUMNS.PNL].toString().replace(/[₹$,\s]/g, '');
            }
            return {
                strategy:   row[COLUMNS.STRATEGY]    || '',
                exchange:   row[COLUMNS.EXCHANGE]    || '',
                symbol:     row[COLUMNS.SYMBOL]      || '',
                type:       row[COLUMNS.TYPE]        || '',
                expiry:     row[COLUMNS.EXPIRY]      || '',   // now correctly E
                strike:     row[COLUMNS.STRIKE]      || '',   // now correctly F
                direction:  row[COLUMNS.DIRECTION]   || '',
                qty:        row[COLUMNS.QTY]         || '0',
                entryPrice: row[COLUMNS.ENTRY_PRICE] || '0',
                ltp:        row[COLUMNS.LTP]         || '0',
                pnl:        pnlValue
            };
        });
}

function renderTable() {
    const tbody = document.getElementById('tableBody');

    if (allPositions.length === 0) {
        showEmpty();
        return;
    }

    tbody.innerHTML = allPositions.map((position, i) => {
        const pnlNum = parseFloat(position.pnl) || 0;
        const pnlClass = pnlNum >= 0 ? 'positive' : 'negative';
        const pnlSign = pnlNum >= 0 ? '+' : '−';
        const directionClass = position.direction && position.direction.toLowerCase() === 'long' ? 'long' : 'short';

        return `
            <tr style="animation-delay: ${i * 0.04}s">
                <td>
                    <div class="strategy-cell">
                        <span class="dir-pill ${directionClass}">${escapeHtml(position.direction || 'SHORT')}</span>
                        <span class="strategy-name">${escapeHtml(position.strategy)}</span>
                    </div>
                </td>
                <td class="symbol-cell">${escapeHtml(position.symbol)}</td>
                <td><span class="type-badge type-${escapeHtml(position.type)}">${escapeHtml(position.type)}</span></td>
                <td class="mono-cell">${formatStrike(position.strike)}</td>
                <td class="expiry-cell">${formatExpiry(position.expiry)}</td>
                <td class="qty-cell">${formatQty(position.qty)}</td>
                <td class="mono-cell">${formatPrice(position.entryPrice)}</td>
                <td class="mono-cell ltp">${formatPrice(position.ltp)}</td>
                <td>
                    <span class="pnl-badge ${pnlClass}">
                        <span class="pnl-sign">${pnlSign}</span>₹${formatPnLAbs(pnlNum)}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

function updateStats() {
    const totalPnL = allPositions.reduce((sum, p) => sum + (parseFloat(p.pnl) || 0), 0);
    const winners = allPositions.filter(p => parseFloat(p.pnl) > 0).length;
    const losers  = allPositions.filter(p => parseFloat(p.pnl) < 0).length;
    const pnlClass = totalPnL >= 0 ? 'positive' : 'negative';
    const pnlSign  = totalPnL >= 0 ? '+' : '−';

    document.getElementById('totalPositions').textContent = allPositions.length;
    document.getElementById('winnersCount').textContent = winners;
    document.getElementById('losersCount').textContent  = losers;
    document.getElementById('totalPnL').innerHTML =
        `<span class="${pnlClass}">${pnlSign}₹${formatPnLAbs(totalPnL)}</span>`;
}

// ============================================================
// FORMATTING HELPERS
// ============================================================

function formatPrice(val) {
    const clean = val.toString().replace(/[₹$,\s]/g, '');
    const num = parseFloat(clean);
    if (isNaN(num)) return val || '—';
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function formatStrike(val) {
    const clean = val.toString().replace(/[₹$,\s]/g, '');
    const num = parseFloat(clean);
    if (isNaN(num)) return val || '—';
    // Strike prices: no decimals if whole number
    return Number.isInteger(num)
        ? new Intl.NumberFormat('en-IN').format(num)
        : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function formatQty(val) {
    const clean = val.toString().replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    if (isNaN(num)) return val || '—';
    return new Intl.NumberFormat('en-IN').format(Math.round(num));
}

function formatPnLAbs(num) {
    const abs = Math.abs(num);
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs);
}

function formatExpiry(dateStr) {
    if (!dateStr) return '—';
    // Try parsing
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const dd   = String(date.getDate()).padStart(2, '0');
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const yy   = String(date.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
}

function updateLastUpdated() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    document.getElementById('lastUpdated').textContent = timeStr;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// COUNTDOWN TIMER
// ============================================================

function resetCountdown() {
    countdown = CONFIG.REFRESH_INTERVAL / 1000;
    updateCountdownDisplay();
}

function updateCountdownDisplay() {
    const el = document.getElementById('countdown');
    if (!el) return;
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
}

function startCountdown() {
    setInterval(() => {
        if (countdown > 0) countdown--;
        updateCountdownDisplay();
    }, 1000);
}

// ============================================================
// UI STATE MANAGEMENT
// ============================================================

function showLoading() {
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('errorState').style.display   = 'none';
    document.getElementById('emptyState').style.display   = 'none';
    document.querySelector('.table-wrapper').style.display = 'none';
}

function showError(message) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display   = 'flex';
    document.getElementById('emptyState').style.display   = 'none';
    document.querySelector('.table-wrapper').style.display = 'none';
    document.getElementById('errorMessage').textContent = message;
}

function showEmpty() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display   = 'none';
    document.getElementById('emptyState').style.display   = 'flex';
    document.querySelector('.table-wrapper').style.display = 'none';
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
startCountdown();
