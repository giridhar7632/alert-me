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
	statusEmailInterval: Number(process.env.NOTIFICATION_INTERVAL) * 60 * 1000,
	targetUrl: process.env.WEBSITE_URL,
	bookingOpenText: 'Book Now',
	bookingClosedText: 'Bookings Open Soon',
}

// ========================================
// TRACKING VARIABLES
// ========================================
let checkCount = 0
let lastCheckTime = null
let lastStatusEmailTime = Date.now()
let consecutiveErrors = 0

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
async function gracefulShutdown(browser, intervalId, statusIntervalId) {
	if (isShuttingDown) return
	isShuttingDown = true

	console.log('\n🛑 Shutting down gracefully...')

	if (intervalId) {
		clearInterval(intervalId)
		console.log('✅ Check interval cleared')
	}

	if (statusIntervalId) {
		clearInterval(statusIntervalId)
		console.log('✅ Status interval cleared')
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
// SEND EMAIL NOTIFICATION (BOOKING FOUND)
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
// SEND STATUS EMAIL (HOURLY UPDATE)
// ========================================
async function sendStatusEmail() {
	const now = new Date()
	const uptime = formatUptime(
		Date.now() - lastStatusEmailTime + CONFIG.statusEmailInterval
	)
	const nextCheck = new Date(Date.now() + CONFIG.checkInterval)

	const statusEmailBody = `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
			<div style="background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
				<h2 style="color: #2563eb; margin-top: 0; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
					🔍 Booking Monitor Status Update
				</h2>
				
				<div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 4px;">
					<p style="margin: 5px 0; font-size: 16px;"><strong>Status:</strong> <span style="color: #059669;">✅ Running</span></p>
					<p style="margin: 5px 0; font-size: 16px;"><strong>Booking Status:</strong> <span style="color: #dc2626;">❌ Not Open Yet</span></p>
				</div>
				
				<div style="background-color: #f9fafb; padding: 15px; border-radius: 4px; margin: 20px 0;">
					<h3 style="margin-top: 0; color: #374151;">📊 Statistics</h3>
					<ul style="list-style: none; padding: 0;">
						<li style="margin: 8px 0;">📈 <strong>Total Checks:</strong> ${checkCount}</li>
						<li style="margin: 8px 0;">⏰ <strong>Last Check:</strong> ${
							lastCheckTime || 'N/A'
						}</li>
						<li style="margin: 8px 0;">⏱️ <strong>Running Since:</strong> ${uptime}</li>
						<li style="margin: 8px 0;">🔄 <strong>Check Interval:</strong> Every ${
							CONFIG.checkInterval / 60000
						} minutes</li>
						<li style="margin: 8px 0;">⚠️ <strong>Recent Errors:</strong> ${consecutiveErrors}</li>
					</ul>
				</div>
				
				<div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
					<p style="margin: 5px 0;"><strong>🔔 Next Check:</strong> ${nextCheck.toLocaleString()}</p>
					<p style="margin: 5px 0;"><strong>🌐 Monitoring URL:</strong></p>
					<p style="margin: 5px 0; word-break: break-all;"><a href="${
						CONFIG.targetUrl
					}" style="color: #2563eb;">${CONFIG.targetUrl}</a></p>
				</div>
				
				<div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
					<p style="margin: 5px 0;">💡 <strong>Note:</strong> You will receive an immediate alert when bookings open!</p>
					<p style="margin: 5px 0;">📧 This status update is sent every hour to confirm the monitor is active.</p>
					<p style="margin: 5px 0; color: #9ca3af; font-size: 12px;">Timestamp: ${now.toLocaleString()}</p>
				</div>
			</div>
		</div>
	`

	const mailOptions = {
		from: CONFIG.email.user,
		to: CONFIG.email.to,
		subject: `✅ Monitor Active - Still Searching (${checkCount} checks completed)`,
		html: statusEmailBody,
	}

	try {
		await transporter.sendMail(mailOptions)
		console.log('📧 Status email sent successfully!')
		lastStatusEmailTime = Date.now()
		return true
	} catch (error) {
		console.error('❌ Error sending status email:', error.message)
		return false
	}
}

// ========================================
// FORMAT UPTIME
// ========================================
function formatUptime(ms) {
	const seconds = Math.floor(ms / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)

	if (days > 0) {
		return `${days}d ${hours % 24}h ${minutes % 60}m`
	} else if (hours > 0) {
		return `${hours}h ${minutes % 60}m`
	} else {
		return `${minutes}m ${seconds % 60}s`
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
				headless: true,
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
					'--disable-features=AudioServiceOutOfProcess',
					'--disable-dbus',
				],
				ignoreHTTPSErrors: true,
				defaultViewport: { width: 1920, height: 1080 },
			})

			browser.on('disconnected', () => {
				console.log('⚠️  Browser disconnected')
			})

			page = await browser.newPage()

			// Set resource limits
			await page.setRequestInterception(true)
			page.on('request', (request) => {
				const resourceType = request.resourceType()
				if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
					request.abort()
				} else {
					request.continue()
				}
			})

			await page.setUserAgent(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			)

			console.log('🌐 Loading website...')

			await page.goto(CONFIG.targetUrl, {
				waitUntil: 'domcontentloaded',
				timeout: 60000,
			})

			console.log('⏳ Waiting for content to load...')

			await page.waitForSelector('.bg-white.rounded-2xl', { timeout: 30000 })
			await delay(2000)

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

			// Update tracking
			checkCount++
			lastCheckTime = new Date().toLocaleString()
			consecutiveErrors = 0 // Reset error counter on success

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
			consecutiveErrors++
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
				await delay(10000)
			}

			retryCount++

			if (retryCount >= maxRetries) {
				console.log('❌ Max retries reached for this run.')
				return false
			}
		} finally {
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
	console.log(
		`📧 Status Email: Every ${CONFIG.statusEmailInterval / 60000} minutes`
	)
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

	// Set up periodic booking checks
	let checkIntervalId = setInterval(async () => {
		try {
			const isOpen = await checkBookingStatus()

			if (isOpen) {
				console.log('\n✅ Booking opened! Stopping monitor.')
				console.log('Please book your slot at:', CONFIG.targetUrl)
				clearInterval(checkIntervalId)
				clearInterval(statusIntervalId)
				process.exit(0)
			}
		} catch (error) {
			console.error('❌ Error in monitoring loop:', error.message)
		}
	}, CONFIG.checkInterval)

	// Set up periodic status emails
	let statusIntervalId = setInterval(async () => {
		try {
			console.log('\n📧 Sending hourly status update...')
			await sendStatusEmail()
		} catch (error) {
			console.error('❌ Error sending status email:', error.message)
		}
	}, CONFIG.statusEmailInterval)

	// Set up graceful shutdown handlers
	process.on('SIGINT', () =>
		gracefulShutdown(null, checkIntervalId, statusIntervalId)
	)
	process.on('SIGTERM', () =>
		gracefulShutdown(null, checkIntervalId, statusIntervalId)
	)
	process.on('uncaughtException', (error) => {
		console.error('❌ Uncaught Exception:', error)
		gracefulShutdown(null, checkIntervalId, statusIntervalId)
	})

	console.log('\n👀 Monitoring in progress... Press Ctrl+C to stop.')
	console.log(`📧 You will receive status updates every hour.\n`)
}

// ========================================
// START THE SCRIPT
// ========================================
startMonitoring().catch((error) => {
	console.error('❌ Fatal error:', error)
	process.exit(1)
})
