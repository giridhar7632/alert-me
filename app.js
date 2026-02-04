const puppeteer = require('puppeteer')
const nodemailer = require('nodemailer')
require('dotenv').config()

// ========================================
// CONFIGURATION
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
	checkInterval: Number(process.env.CHECK_INTERVAL) * 60 * 1000,
	targetUrl: process.env.WEBSITE_URL,
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
// UTILITY FUNCTIONS
// ========================================
const delay = (time) => new Promise((resolve) => setTimeout(resolve, time))

// Graceful cleanup handler
let isShuttingDown = false
async function gracefulShutdown(browser, intervalId) {
	if (isShuttingDown) return
	isShuttingDown = true

	console.log('\n🛑 Shutting down gracefully...')

	if (intervalId) {
		clearInterval(intervalId)
		console.log('✅ Interval cleared')
	}

	if (browser && browser.process()) {
		await browser
			.close()
			.catch((err) => console.error('Error closing browser:', err))
		console.log('✅ Browser closed')
	}

	console.log('👋 Goodbye!')
	process.exit(0)
}

// ========================================
// SEND EMAIL NOTIFICATION
// ========================================
async function sendEmailNotification(buttonText, timestamp) {
	let emailBody = CONFIG.emailBody
		.replace(/\{\{BUTTON_TEXT\}\}/g, buttonText)
		.replace(/\{\{TIMESTAMP\}\}/g, timestamp)
		.replace(/\{\{URL\}\}/g, CONFIG.targetUrl)

	const mailOptions = {
		from: CONFIG.email.user,
		to: CONFIG.email.to,
		subject: CONFIG.emailSubject,
		html: emailBody,
	}

	try {
		await transporter.sendMail(mailOptions)
		console.log('✅ Email notification sent successfully!')
		return true
	} catch (error) {
		console.error('❌ Error sending email:', error.message)
		return false
	}
}

// ========================================
// CHECK BOOKING STATUS
// ========================================
async function checkBookingStatus() {
	let browser = null
	let page = null
	const maxRetries = 3
	let retryCount = 0

	while (retryCount < maxRetries) {
		try {
			if (retryCount > 0) {
				console.log(`⚠️  Retry attempt ${retryCount}/${maxRetries}...`)
				await delay(5000)
			}

			console.log(
				`\n[${new Date().toLocaleString()}] Checking booking status...`
			)

			// Launch browser with optimized settings
			browser = await puppeteer.launch({
				headless: true, // Changed from 'headless: "new"'
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--disable-accelerated-2d-canvas',
					'--disable-gpu',
					'--disable-software-rasterizer',
					'--disable-extensions',
					'--disable-background-networking',
					'--disable-default-apps',
					'--disable-sync',
					'--metrics-recording-only',
					'--mute-audio',
					'--no-first-run',
					'--window-size=1920,1080',
					// Fix D-Bus errors
					'--disable-features=AudioServiceOutOfProcess',
					'--disable-dbus',
				],
				// Limit resources
				ignoreHTTPSErrors: true,
				defaultViewport: { width: 1920, height: 1080 },
			})

			// Set up browser close handlers
			browser.on('disconnected', () => {
				console.log('⚠️  Browser disconnected')
			})

			page = await browser.newPage()

			// Set resource limits
			await page.setRequestInterception(true)
			page.on('request', (request) => {
				// Block unnecessary resources to save memory
				const resourceType = request.resourceType()
				if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
					request.abort()
				} else {
					request.continue()
				}
			})

			// Set a realistic user agent
			await page.setUserAgent(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			)

			console.log('🌐 Loading website...')

			await page.goto(CONFIG.targetUrl, {
				waitUntil: 'domcontentloaded',
				timeout: 60000,
			})

			console.log('⏳ Waiting for content to load...')

			// Wait for the card container
			await page.waitForSelector('.bg-white.rounded-2xl', { timeout: 30000 })
			await delay(2000)

			// Find the card and check button text
			const buttonText = await page.evaluate(() => {
				const cards = Array.from(
					document.querySelectorAll('.bg-white.rounded-2xl')
				)

				for (const card of cards) {
					const heading = card.querySelector('h3')
					if (heading && heading.textContent.trim().includes('Bhasmaarti')) {
						const button = card.querySelector('button')
						const link = card.querySelector('a')
						return (
							button?.textContent.trim() || link?.textContent.trim() || null
						)
					}
				}
				return null
			})

			if (buttonText) {
				console.log(`📋 Current button text: "${buttonText}"`)

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

			return false
		} catch (error) {
			console.error(
				`❌ Error during check (attempt ${retryCount + 1}/${maxRetries}):`,
				error.message
			)

			if (error.message.includes('timeout')) {
				console.log(
					'💡 Tip: Website might be loading slowly or blocking connection.'
				)
			} else if (error.message.includes('pthread_create')) {
				console.log(
					'💡 Tip: System resources exhausted. Waiting longer before retry...'
				)
				await delay(10000) // Wait 10 seconds for resource recovery
			}

			retryCount++

			if (retryCount >= maxRetries) {
				console.log('❌ Max retries reached for this run.')
				return false
			}
		} finally {
			// CRITICAL: Always close page and browser
			try {
				if (page) {
					await page.close()
					page = null
				}
			} catch (err) {
				console.error('Error closing page:', err.message)
			}

			try {
				if (browser) {
					await browser.close()
					browser = null
				}
			} catch (err) {
				console.error('Error closing browser:', err.message)
			}

			// Force garbage collection if available
			if (global.gc) {
				global.gc()
			}
		}
	}

	return false
}

// ========================================
// INTERNET CONNECTION TEST
// ========================================
async function checkInternetConnection() {
	let browser = null
	try {
		console.log('🔍 Testing internet connection...')
		browser = await puppeteer.launch({
			headless: true,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-dbus',
			],
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
			browser = null
		}
	}
}

// ========================================
// MAIN MONITORING LOOP
// ========================================
async function startMonitoring() {
	console.log('🚀 Booking Monitor Started')
	console.log('='.repeat(60))
	console.log(`📍 Target URL: ${CONFIG.targetUrl}`)
	console.log(
		`⏱️  Check Interval: Every ${CONFIG.checkInterval / 60000} minutes`
	)
	console.log(`📧 Notification Email: ${CONFIG.email.to}`)
	console.log('='.repeat(60))

	// Initial internet check
	const hasInternet = await checkInternetConnection()
	if (!hasInternet) {
		console.log('Please fix your internet connection and run the script again.')
		return
	}

	// Initial booking check
	const isOpen = await checkBookingStatus()
	if (isOpen) {
		console.log('\n✅ Booking is already open! Monitor will stop.')
		console.log('Please book your slot at:', CONFIG.targetUrl)
		return
	}

	// Set up periodic checks
	let intervalId = setInterval(async () => {
		try {
			const isOpen = await checkBookingStatus()

			if (isOpen) {
				console.log('\n✅ Booking opened! Stopping monitor.')
				console.log('Please book your slot at:', CONFIG.targetUrl)
				clearInterval(intervalId)
				process.exit(0)
			}
		} catch (error) {
			console.error('❌ Error in monitoring loop:', error.message)
			// Continue monitoring despite errors
		}
	}, CONFIG.checkInterval)

	// Set up graceful shutdown handlers
	process.on('SIGINT', () => gracefulShutdown(null, intervalId))
	process.on('SIGTERM', () => gracefulShutdown(null, intervalId))
	process.on('uncaughtException', (error) => {
		console.error('❌ Uncaught Exception:', error)
		gracefulShutdown(null, intervalId)
	})

	console.log('\n👀 Monitoring in progress... Press Ctrl+C to stop.\n')
}

// ========================================
// START THE SCRIPT
// ========================================
startMonitoring().catch((error) => {
	console.error('❌ Fatal error:', error)
	process.exit(1)
})
