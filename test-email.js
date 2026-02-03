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
    to: process.env.EMAIL_RECIPIENT,
  },
};

// ========================================
// TEST EMAIL FUNCTION
// ========================================
async function sendTestEmail() {
  console.log('📧 Testing email configuration...\n');
  
  const transporter = nodemailer.createTransport({
    service: CONFIG.email.service,
    auth: {
      user: CONFIG.email.user,
      pass: CONFIG.email.password,
    },
  });

  const mailOptions = {
    from: CONFIG.email.user,
    to: CONFIG.email.to,
    subject: '✅ Test Email - Booking Monitor Setup',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ff6b00;">✅ Email Configuration Successful!</h2>
        <p>If you're reading this, your email settings are configured correctly.</p>
        <p>Your booking is ready to send notifications.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Test sent at: ${new Date().toLocaleString()}
        </p>
      </div>
    `,
  };

  try {
    console.log(`Sending from: ${CONFIG.email.user}`);
    console.log(`Sending to: ${CONFIG.email.to}\n`);
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ SUCCESS! Test email sent successfully!');
    console.log('📬 Message ID:', info.messageId);
    
  } catch (error) {
    console.error('❌ ERROR: Failed to send test email\n');
    console.error('Error details:', error.message);
  }
}

// Run the test
sendTestEmail();