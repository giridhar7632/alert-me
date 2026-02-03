# alert me

automated script to monitor the a website and notify you immediately when bookings open.

## Features
- ✅ Checks every 5 minutes automatically
- ✅ Sends instant email notification when booking opens
- ✅ Runs in background without browser window
- ✅ Reliable detection of button changes
- ✅ Direct booking link in email

## Setup Instructions

### Step 1: Install Node.js
If you don't have Node.js installed:
1. Go to https://nodejs.org/
2. Download and install the LTS version
3. Verify installation by opening terminal/command prompt and typing:
   ```bash
   node --version
   ```

### Step 2: Install Dependencies
Open terminal/command prompt in the folder containing these files and run:
```bash
npm install
```

This will install:
- **puppeteer** (for browser automation)
- **nodemailer** (for sending emails)

## Running the Script

### Start Monitoring
```bash
npm start
```

Or directly:
```bash
node app.js
```