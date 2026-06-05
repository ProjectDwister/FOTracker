# Live Derivatives Tracker

A beautiful, real-time dashboard for tracking open derivatives positions from Google Sheets.

![Dashboard Preview](preview.png)

## Features

- ✅ **Real-time Updates** - Auto-refreshes every 5 minutes
- 📊 **Live P&L Tracking** - See your total gains/losses at a glance
- 🎨 **Modern UI** - Clean, professional design with smooth animations
- 🔍 **Smart Filtering** - Filter by Strategy, Exchange, or Type
- 📱 **Responsive** - Works perfectly on desktop, tablet, and mobile
- 🎯 **Open Positions Only** - Focuses on active trades

## Setup Instructions

### Step 1: Enable Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Google Sheets API**:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create API credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the API key
   - (Optional) Restrict the key to "Google Sheets API" and your domain

### Step 2: Make Your Sheet Public

1. Open your Google Sheet
2. Click "Share" button
3. Change access to "Anyone with the link can view"
4. Copy the Sheet ID from the URL: