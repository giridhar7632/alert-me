const puppeteer = require('puppeteer')
const nodemailer = require('nodemailer')
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
	emailSubject: process.env.EMAIL_SUBJECT,
	emailBody: process.env.EMAIL_BODY,
	targetCheck: process.env.TARGET_CHECK,

	// Monitoring settings
	checkInterval: 5 * 60 * 1000,
	targetUrl: process.env.WEBSITE_URL,

	// Text to look for when bookings are open
	bookingOpenText: 'Book Now',
	bookingClosedText: 'Bookings Open Soon',
}

// ========================================
// EMAIL SETUP
// ========================================
const transporter = nodemailer.createTransport({
	service: CONFIG.email.service,
	auth: {
		user: CONFIG.email.user,
		pass: CONFIG.email.password,
	},
})

// ========================================
// SEND EMAIL NOTIFICATION
// ========================================
async function sendEmailNotification(buttonText, timestamp) {
	emailBody = emailBody
		.replace(/\{\{BUTTON_TEXT\}\}/g, buttonText)
		.replace(/\{\{TIMESTAMP\}\}/g, timestamp)
		.replace(/\{\{URL\}\}/g, CONFIG.targetUrl)

	const mailOptions = {
		from: CONFIG.email.user,
		to: CONFIG.email.to,
		subject: CONFIG.emailSubject,
		html: CONFIG.emailBody,
	}

	try {
		await transporter.sendMail(mailOptions)
		console.log('✅ Email notification sent successfully!')
	} catch (error) {
		console.error('❌ Error sending email:', error.message)
	}
}

// ========================================
// CHECK BOOKING STATUS
// ========================================
const delay = (time) => new Promise((resolve) => setTimeout(resolve, time))

async function checkBookingStatus() {
	let browser
	const maxRetries = 3
	let retryCount = 0

	while (retryCount < maxRetries) {
		try {
			if (retryCount > 0) {
				console.log(`⚠️  Retry attempt ${retryCount}/${maxRetries}...`)
				await delay(5000) // Wait 5 seconds before retry
			}

			console.log(
				`\n[${new Date().toLocaleString()}] Checking booking status...`
			)

			browser = await puppeteer.launch({
				// 'headless: "new"' is deprecated in v22+. Use true.
				headless: true,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--disable-accelerated-2d-canvas',
					'--disable-gpu',
					'--window-size=1920,1080',
				],
			})

			const page = await browser.newPage()

			// Set a realistic user agent
			await page.setUserAgent(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			)

			// Set viewport
			await page.setViewport({ width: 1920, height: 1080 })

			console.log('🌐 Loading website...')

			// Increased timeout to 60s
			await page.goto(CONFIG.targetUrl, {
				waitUntil: 'domcontentloaded',
				timeout: 60000,
			})

			console.log('⏳ Waiting for content to load...')

			// Wait for the card container to appear
			await page.waitForSelector('.bg-white.rounded-2xl', { timeout: 30000 })

			await delay(2000)

			// Find the card and check the button text
			const buttonText = await page.evaluate(() => {
				// Find all service cards
				const cards = Array.from(
					document.querySelectorAll('.bg-white.rounded-2xl')
				)

				for (const card of cards) {
					const heading = card.querySelector('h3')
					// Check specifically for card
					if (heading && heading.textContent.trim().includes('Bhasmaarti')) {
						const button = card.querySelector('button')
						const link = card.querySelector('a')

						// Return text from whichever element exists
						if (button) return button.textContent.trim()
						if (link) return link.textContent.trim()
					}
				}
				return null
			})

			if (buttonText) {
				console.log(`📋 Current button text: "${buttonText}"`)

				// Case-insensitive check just to be safe
				const lowerButtonText = buttonText.toLowerCase()
				const lowerTargetText = CONFIG.bookingOpenText.toLowerCase()

				if (lowerButtonText.includes(lowerTargetText)) {
					console.log('🎉 BOOKING IS OPEN! Sending notification...')
					await sendEmailNotification(buttonText, new Date().toLocaleString())
					return true
				} else {
					console.log(`⏳ Booking not yet open. Will check again later.`)
				}
			} else {
				console.log('⚠️  Could not find button on the page.')
			}

			return false // Booking not open yet
		} catch (error) {
			console.error(
				`❌ Error during check (attempt ${retryCount + 1}/${maxRetries}):`,
				error.message
			)

			if (error.message.includes('timeout')) {
				console.log(
					'💡 Tip: Website might be loading slowly or blocking connection.'
				)
			}

			retryCount++

			if (retryCount >= maxRetries) {
				console.log('❌ Max retries reached for this run.')
				return false
			}
		} finally {
			if (browser) {
				await browser.close()
			}
		}
	}
	return false
}
// ========================================
// MAIN MONITORING LOOP
// ========================================
async function checkInternetConnection() {
	let browser
	try {
		console.log('🔍 Testing internet connection...')
		browser = await puppeteer.launch({
			headless: 'new',
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
		})
		const page = await browser.newPage()
		await page.goto('https://www.google.com', { timeout: 10000 })
		console.log('✅ Internet connection OK\n')
		return true
	} catch (error) {
		console.error('❌ No internet connection or network issue')
		console.error('Please check your internet and try again.\n')
		return false
	} finally {
		if (browser) {
			await browser.close()
		}
	}
}

async function startMonitoring() {
	console.log('🚀 Booking Monitor Started')
	console.log('='.repeat(60))
	console.log(`📍 Target URL: ${CONFIG.targetUrl}`)
	console.log(
		`⏱️  Check Interval: Every ${CONFIG.checkInterval / 60000} minutes`
	)
	console.log(`📧 Notification Email: ${CONFIG.email.to}`)
	console.log('='.repeat(60))

	// Initial check
	const hasInternet = await checkInternetConnection()
	if (!hasInternet) {
		console.log('Please fix your internet connection and run the script again.')
		return
	}

	const isOpen = await checkBookingStatus()

	if (isOpen) {
		console.log('\n✅ Booking is already open! Monitor will stop.')
		console.log('Please book your slot at:', CONFIG.targetUrl)
		return
	}

	// Set up interval for periodic checks
	const intervalId = setInterval(async () => {
		const isOpen = await checkBookingStatus()

		if (isOpen) {
			console.log('\n✅ Booking opened! Stopping monitor.')
			console.log('Please book your slot at:', CONFIG.targetUrl)
			clearInterval(intervalId)
		}
	}, CONFIG.checkInterval)

	console.log('\n👀 Monitoring in progress... Press Ctrl+C to stop.\n')
}

// ========================================
// START THE SCRIPT
// ========================================
startMonitoring().catch(console.error)
