// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    SHEET_ID: '1Su_cw-0RyzHTFRP_aqolWtT956cmPHpJbojt2YbwZzc',  // ⚠️ REPLACE THIS
    API_KEY: 'AIzaSyA9RuEF0WuE7W8K4vkd_rfKI2-6MSLpIc0',     // ⚠️ REPLACE THIS
    RANGE: 'Sheet1!A2:N51',                  // Reading columns A to N
    REFRESH_INTERVAL: 5 * 60 * 1000,         // 5 minutes
};

// Column mapping for Sheet1
const COLUMNS = {
    STRATEGY: 0,        // Column A
    EXCHANGE: 1,        // Column B (not used in display)
    SYMBOL: 2,          // Column C
    TYPE: 3,            // Column D
    STRIKE: 4,          // Column E
    EXPIRY: 5,          // Column F
    DIRECTION: 6,       // Column G
    QTY: 7,             // Column H
    ENTRY_DATE: 8,      // Column I (not used in display)
    ENTRY_PRICE: 9,     // Column J
    EXIT_DATE: 10,      // Column K (not used in display)
    LTP: 11,            // Column L
    STATUS: 12,         // Column M
    PNL: 13             // Column N
};

// ============================================================
// GLOBAL STATE
// ============================================================

let allPositions = [];
let filteredPositions = [];

// ============================================================
// MAIN FUNCTIONS
// ============================================================

async function loadData() {
    showLoading();
    
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${CONFIG.RANGE}?key=${CONFIG.API_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.values || data.values.length === 0) {
            showEmpty();
            return;
        }
        
        processData(data.values);
        applyFilters();
        updateLastUpdated();
        hideAllStates();
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    }
}

function processData(rows) {
    allPositions = rows
        .filter(row => row[COLUMNS.STATUS] === 'Open')
        .map(row => ({
            strategy: row[COLUMNS.STRATEGY] || '',
            symbol: row[COLUMNS.SYMBOL] || '',
            type: row[COLUMNS.TYPE] || '',
            strike: row[COLUMNS.STRIKE] || '',
            expiry: row[COLUMNS.EXPIRY] || '',
            direction: row[COLUMNS.DIRECTION] || '',
            qty: row[COLUMNS.QTY] || '0',
            entryPrice: row[COLUMNS.ENTRY_PRICE] || '0',
            ltp: row[COLUMNS.LTP] || '0',
            pnl: row[COLUMNS.PNL] || '0'
        }));
    
    populateFilters();
}

function populateFilters() {
    const strategies = [...new Set(allPositions.map(p => p.strategy))].sort();
    const symbols = [...new Set(allPositions.map(p => p.symbol))].sort();
    
    const strategySelect = document.getElementById('strategyFilter');
    const symbolSelect = document.getElementById('symbolFilter');
    
    strategySelect.innerHTML = '<option value="">All Strategies</option>';
    strategies.forEach(s => {
        strategySelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
    
    symbolSelect.innerHTML = '<option value="">All Symbols</option>';
    symbols.forEach(s => {
        symbolSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
}

function applyFilters() {
    const strategyFilter = document.getElementById('strategyFilter').value;
    const symbolFilter = document.getElementById('symbolFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    
    filteredPositions = allPositions.filter(position => {
        return (!strategyFilter || position.strategy === strategyFilter) &&
               (!symbolFilter || position.symbol === symbolFilter) &&
               (!typeFilter || position.type === typeFilter);
    });
    
    renderTable();
    updateStats();
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    
    if (filteredPositions.length === 0) {
        showEmpty();
        return;
    }
    
    tbody.innerHTML = filteredPositions.map(position => {
        const pnlNum = parseFloat(position.pnl) || 0;
        const pnlClass = pnlNum >= 0 ? 'positive' : 'negative';
        
        // Color strategy based on direction
        const strategyClass = position.direction === 'Long' ? 'strategy-long' : 'strategy-short';
        
        return `
            <tr>
                <td><span class="strategy ${strategyClass}">${escapeHtml(position.strategy)}</span></td>
                <td class="symbol-cell">${escapeHtml(position.symbol)}</td>
                <td><span class="badge-type ${escapeHtml(position.type)}">${escapeHtml(position.type)}</span></td>
                <td>${escapeHtml(position.strike)}</td>
                <td>${formatExpiry(position.expiry)}</td>
                <td class="qty-cell">${formatNumber(position.qty)}</td>
                <td class="price-cell">₹${formatNumber(position.entryPrice)}</td>
                <td class="price-cell">₹${formatNumber(position.ltp)}</td>
                <td><span class="pnl ${pnlClass}">₹${formatCurrency(pnlNum)}</span></td>
            </tr>
        `;
    }).join('');
}

function updateStats() {
    const totalPnL = filteredPositions.reduce((sum, p) => sum + (parseFloat(p.pnl) || 0), 0);
    const pnlClass = totalPnL >= 0 ? 'positive' : 'negative';
    
    document.getElementById('totalPositions').textContent = filteredPositions.length;
    document.getElementById('totalPnL').textContent = `₹${formatCurrency(totalPnL)}`;
    document.getElementById('totalPnL').className = `stat-value pnl ${pnlClass}`;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function formatCurrency(num) {
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Math.abs(num));
}

function formatNumber(val) {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

function formatExpiry(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    const options = { day: '2-digit', month: 'short', year: '2-digit' };
    return date.toLocaleDateString('en-GB', options);
}

function updateLastUpdated() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
    document.getElementById('lastUpdated').textContent = timeStr;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// UI STATE MANAGEMENT
// ============================================================

function showLoading() {
    document.getElementById('loadingState').style.display = 'block';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.querySelector('.table-container').style.display = 'none';
}

function showError(message) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';
    document.querySelector('.table-container').style.display = 'none';
    document.getElementById('errorMessage').textContent = message;
}

function showEmpty() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
    document.querySelector('.table-container').style.display = 'none';
}

function hideAllStates() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.querySelector('.table-container').style.display = 'block';
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.getElementById('strategyFilter').addEventListener('change', applyFilters);
document.getElementById('symbolFilter').addEventListener('change', applyFilters);
document.getElementById('typeFilter').addEventListener('change', applyFilters);

// ============================================================
// INITIALIZATION
// ============================================================

// Load data on page load
loadData();

// Set up auto-refresh
setInterval(loadData, CONFIG.REFRESH_INTERVAL);
