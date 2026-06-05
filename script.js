// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    // Replace with your actual Google Sheet ID
    SHEET_ID: '1Su_cw-0RyzHTFRP_aqolWtT956cmPHpJbojt2YbwZzc',
    
    // Replace with your API key (Instructions in README.md)
    API_KEY: 'AIzaSyA9RuEF0WuE7W8K4vkd_rfKI2-6MSLpIc0',
    
    // Sheet name and range
    SHEET_NAME: 'Sheet1', // Change if your sheet has a different name
    RANGE: 'A2:N51', // Adjust if your data range is different
    
    // Auto-refresh interval (5 minutes in milliseconds)
    REFRESH_INTERVAL: 5 * 60 * 1000,
    
    // Column indices (0-based, matching your sheet)
    COLUMNS: {
        STRATEGY: 0,    // A
        EXCHANGE: 1,    // B
        SYMBOL: 2,      // C
        TYPE: 3,        // D
        EXPIRY: 4,      // E
        STRIKE: 5,      // F
        DIR: 6,         // G
        QTY: 7,         // H
        ENTRY_DATE: 8,  // I
        ENTRY_PRICE: 9, // J
        EXIT_DATE: 10,  // K
        LTP: 11,        // L
        STATUS: 12,     // M
        PNL: 13         // N
    }
};

// ============================================================
// GLOBAL STATE
// ============================================================

let allPositions = [];
let filteredPositions = [];
let refreshTimer = null;

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
    startAutoRefresh();
});

function setupEventListeners() {
    document.getElementById('refresh-btn').addEventListener('click', loadData);
    document.getElementById('filter-strategy').addEventListener('change', applyFilters);
    document.getElementById('filter-exchange').addEventListener('change', applyFilters);
    document.getElementById('filter-type').addEventListener('change', applyFilters);
}

function startAutoRefresh() {
    refreshTimer = setInterval(loadData, CONFIG.REFRESH_INTERVAL);
}

// ============================================================
// DATA LOADING
// ============================================================

async function loadData() {
    showLoading();
    
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${CONFIG.SHEET_NAME}!${CONFIG.RANGE}?key=${CONFIG.API_KEY}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.values || data.values.length === 0) {
            showEmptyState();
            return;
        }
        
        processData(data.values);
        updateLastUpdateTime();
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    }
}

function processData(rows) {
    const { COLUMNS } = CONFIG;
    
    // Filter only open positions
    allPositions = rows
        .filter(row => row[COLUMNS.STATUS] === 'Open' && row[COLUMNS.SYMBOL])
        .map(row => ({
            strategy: row[COLUMNS.STRATEGY] || '',
            exchange: row[COLUMNS.EXCHANGE] || '',
            symbol: row[COLUMNS.SYMBOL] || '',
            type: row[COLUMNS.TYPE] || '',
            expiry: row[COLUMNS.EXPIRY] || '',
            strike: row[COLUMNS.STRIKE] || '',
            dir: row[COLUMNS.DIR] || '',
            qty: parseFloat(row[COLUMNS.QTY]) || 0,
            entryDate: row[COLUMNS.ENTRY_DATE] || '',
            entryPrice: parseFloat(row[COLUMNS.ENTRY_PRICE]) || 0,
            ltp: parseFloat(row[COLUMNS.LTP]) || 0,
            pnl: parseFloat(row[COLUMNS.PNL]) || 0
        }));
    
    if (allPositions.length === 0) {
        showEmptyState();
        return;
    }
    
    populateFilters();
    applyFilters();
}

// ============================================================
// FILTERING
// ============================================================

function populateFilters() {
    const strategies = [...new Set(allPositions.map(p => p.strategy))].filter(Boolean).sort();
    const exchanges = [...new Set(allPositions.map(p => p.exchange))].filter(Boolean).sort();
    const types = [...new Set(allPositions.map(p => p.type))].filter(Boolean).sort();
    
    populateSelect('filter-strategy', strategies);
    populateSelect('filter-exchange', exchanges);
    populateSelect('filter-type', types);
}

function populateSelect(id, options) {
    const select = document.getElementById(id);
    const currentValue = select.value;
    
    // Keep "All" option, remove others
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        select.appendChild(opt);
    });
    
    // Restore previous selection if still valid
    if (options.includes(currentValue)) {
        select.value = currentValue;
    }
}

function applyFilters() {
    const strategyFilter = document.getElementById('filter-strategy').value;
    const exchangeFilter = document.getElementById('filter-exchange').value;
    const typeFilter = document.getElementById('filter-type').value;
    
    filteredPositions = allPositions.filter(position => {
        if (strategyFilter && position.strategy !== strategyFilter) return false;
        if (exchangeFilter && position.exchange !== exchangeFilter) return false;
        if (typeFilter && position.type !== typeFilter) return false;
        return true;
    });
    
    if (filteredPositions.length === 0) {
        showEmptyState();
    } else {
        renderTable();
        updateStats();
    }
}

// ============================================================
// RENDERING
// ============================================================

function renderTable() {
    const tbody = document.getElementById('positions-body');
    tbody.innerHTML = '';
    
    filteredPositions.forEach(position => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${escapeHtml(position.strategy)}</td>
            <td>${escapeHtml(position.exchange)}</td>
            <td><strong>${escapeHtml(position.symbol)}</strong></td>
            <td><span class="badge-type ${position.type}">${escapeHtml(position.type)}</span></td>
            <td>${escapeHtml(position.expiry)}</td>
            <td>${position.strike === 'N/A' ? '—' : formatNumber(position.strike, 0)}</td>
            <td><span class="badge-dir ${position.dir}">${escapeHtml(position.dir)}</span></td>
            <td>${formatNumber(position.qty, 0)}</td>
            <td>${escapeHtml(position.entryDate)}</td>
            <td>₹${formatNumber(position.entryPrice, 2)}</td>
            <td>₹${formatNumber(position.ltp, 2)}</td>
            <td class="pnl ${position.pnl >= 0 ? 'positive' : 'negative'}">
                ${position.pnl >= 0 ? '+' : ''}₹${formatNumber(Math.abs(position.pnl), 0)}
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    hideLoading();
    document.getElementById('table-container').style.display = 'block';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('error').style.display = 'none';
}

function updateStats() {
    const totalPnl = filteredPositions.reduce((sum, p) => sum + p.pnl, 0);
    
    document.getElementById('position-count').textContent = filteredPositions.length;
    
    const pnlElement = document.getElementById('total-pnl');
    pnlElement.textContent = `${totalPnl >= 0 ? '+' : ''}₹${formatNumber(Math.abs(totalPnl), 0)}`;
    pnlElement.className = `stat-value pnl ${totalPnl >= 0 ? 'positive' : 'negative'}`;
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
    });
    document.getElementById('last-update').textContent = timeString;
}

// ============================================================
// STATE MANAGEMENT
// ============================================================

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('table-container').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('error').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showEmptyState() {
    hideLoading();
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('table-container').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    
    // Update stats to show zeros
    document.getElementById('position-count').textContent = '0';
    document.getElementById('total-pnl').textContent = '₹0';
}

function showError(message) {
    hideLoading();
    document.getElementById('error').style.display = 'block';
    document.getElementById('error-message').textContent = message;
    document.getElementById('table-container').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatNumber(value, decimals) {
    if (isNaN(value)) return '—';
    return value.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}