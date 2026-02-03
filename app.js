const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
require('dotenv').config()

// ========================================
// CONFIGURATION - UPDATE THESE VALUES
// ========================================
const CONFIG = {
  email: {
    service: 'gmail',
    user: process.env.EMAIL_SERVER_USER, 
    password: process.env.EMAIL_SERVER_PASSWORD,
    to: process.env.EMAIL_RECIPIENT
  },
  emailSubject: process.env.EMAIL_SUBJECT,
  emailBody: process.env.EMAIL_BODY,
  targetCheck: process.env.TARGET_CHECK,
  
  // Monitoring settings
  checkInterval: 5 * 60 * 1000,
  targetUrl: process.env.WEBSITE_URL,
  
  // Text to look for when bookings are open
  bookingOpenText: 'Book Now',
  bookingClosedText: 'Bookings Open Soon',
};

// ========================================
// EMAIL SETUP
// ========================================
const transporter = nodemailer.createTransport({
  service: CONFIG.email.service,
  auth: {
    user: CONFIG.email.user,
    pass: CONFIG.email.password,
  },
});

// ========================================
// SEND EMAIL NOTIFICATION
// ========================================
async function sendEmailNotification(buttonText, timestamp) {
    emailBody = emailBody
    .replace(/\{\{BUTTON_TEXT\}\}/g, buttonText)
    .replace(/\{\{TIMESTAMP\}\}/g, timestamp)
    .replace(/\{\{URL\}\}/g, CONFIG.targetUrl);

  const mailOptions = {
    from: CONFIG.email.user,
    to: CONFIG.email.to,
    subject: CONFIG.emailSubject,
    html: CONFIG.emailBody,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Email notification sent successfully!');
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
  }
}

// ========================================
// CHECK BOOKING STATUS
// ========================================
async function checkBookingStatus() {
  let browser;
  
  try {
    console.log(`\n[${new Date().toLocaleString()}] Checking booking status...`);
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to the website
    await page.goto(CONFIG.targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    
    // Wait a bit for dynamic content to load
    await page.waitForTimeout(3000);
    
    // Find the specific card and check the button text
    const buttonText = await page.evaluate(() => {
      // Find all service cards
      const cards = document.querySelectorAll('.bg-white.rounded-2xl');
      
      for (const card of cards) {
        const heading = card.querySelector('h3');
        if (heading && heading.textContent.trim() === CONFIG.targetCheck) {
          const button = card.querySelector('button');
          if (button) {
            return button.textContent.trim();
          }
        }
      }
      return null;
    });
    
    if (buttonText) {
      console.log(`📋 Current button text: "${buttonText}"`);
      
      // Check if booking is now open
      if (buttonText.includes(CONFIG.bookingOpenText) || 
          buttonText === CONFIG.bookingOpenText) {
        console.log('🎉 BOOKING IS OPEN! Sending notification...');
        await sendEmailNotification(buttonText, new Date().toLocaleString());
        return true; // Booking is open
      } else {
        console.log('⏳ Booking not yet open. Will check again in 5 minutes.');
      }
    } else {
      console.log('⚠️  Could not find the button on the page.');
    }
    
    return false; // Booking not open yet
    
  } catch (error) {
    console.error('❌ Error during check:', error.message);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ========================================
// MAIN MONITORING LOOP
// ========================================
async function startMonitoring() {
  console.log('🚀 Booking Monitor Started');
  console.log('=' .repeat(60));
  console.log(`📍 Target URL: ${CONFIG.targetUrl}`);
  console.log(`⏱️  Check Interval: Every ${CONFIG.checkInterval / 60000} minutes`);
  console.log(`📧 Notification Email: ${CONFIG.email.to}`);
  console.log('=' .repeat(60));
  
  // Initial check
  const isOpen = await checkBookingStatus();
  
  if (isOpen) {
    console.log('\n✅ Booking is already open! Monitor will stop.');
    console.log('Please book your slot at:', CONFIG.targetUrl);
    return;
  }
  
  // Set up interval for periodic checks
  const intervalId = setInterval(async () => {
    const isOpen = await checkBookingStatus();
    
    if (isOpen) {
      console.log('\n✅ Booking opened! Stopping monitor.');
      console.log('Please book your slot at:', CONFIG.targetUrl);
      clearInterval(intervalId);
    }
  }, CONFIG.checkInterval);
  
  console.log('\n👀 Monitoring in progress... Press Ctrl+C to stop.\n');
}

// ========================================
// START THE SCRIPT
// ========================================
startMonitoring().catch(console.error);