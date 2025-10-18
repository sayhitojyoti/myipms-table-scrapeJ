const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");

// Configuration
const COOKIES_ENV_VAR = "SESSION_DATA"; // GitHub Secret name
const OUTPUT_DIR = path.join(__dirname, "data");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Get random delay between requests (3-8 seconds)
 */
function getRandomDelay() {
  return Math.floor(Math.random() * (8000 - 3000 + 1)) + 3000;
}

/**
 * Get random user agent
 */
function getRandomUserAgent() {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Load cookies from base64 encoded environment variable
 * @returns {Array} Array of cookie objects
 */
function loadCookiesFromEnv() {
  const base64Cookies = process.env[COOKIES_ENV_VAR];
  if (!base64Cookies) {
    throw new Error(`${COOKIES_ENV_VAR} environment variable not found`);
  }

  try {
    const cookiesString = Buffer.from(base64Cookies, "base64").toString(
      "utf-8"
    );
    return JSON.parse(cookiesString);
  } catch (error) {
    throw new Error(`Failed to parse cookies: ${error.message}`);
  }
}

/**
 * Load URLs from chunk file
 * @param {String} chunkNumber Chunk number (e.g., "1", "2", etc.)
 * @returns {Array} Array of URLs
 */
function loadUrlsFromChunk(chunkNumber) {
  const chunkFilePath = path.join(
    __dirname,
    "chunks",
    `chunk_${chunkNumber}.txt`
  );

  if (!fs.existsSync(chunkFilePath)) {
    throw new Error(`Chunk file not found: ${chunkFilePath}`);
  }

  const content = fs.readFileSync(chunkFilePath, "utf-8");
  const urls = content.split("\n").filter((url) => url.trim() !== "");

  if (urls.length === 0) {
    throw new Error(`No URLs found in chunk file: ${chunkFilePath}`);
  }

  return urls;
}

/**
 * Setup browser with authentication cookies and stealth options
 * @param {Array} cookies Array of cookie objects
 * @returns {Object} Browser and page objects
 */
async function setupBrowser(cookies) {
  console.log("🚀 Launching stealth browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=VizDisplayCompositor",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });

  const page = await browser.newPage();

  // Set random user agent
  const userAgent = getRandomUserAgent();
  await page.setUserAgent(userAgent);
  console.log(`🤖 Using User Agent: ${userAgent.substring(0, 50)}...`);

  // Set viewport to look more human
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: true,
    isMobile: false,
  });

  // Stealth evasions
  await page.evaluateOnNewDocument(() => {
    // Override webdriver property
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // Override languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Override plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    // Override permissions
    Object.defineProperty(navigator, "permissions", {
      get: () => ({
        query: () => Promise.resolve({ state: "denied" }),
      }),
    });
  });

  // Set cookies for authentication
  if (cookies && cookies.length > 0) {
    await page.setCookie(...cookies);
    console.log(`🔑 Set ${cookies.length} authentication cookies`);
  } else {
    console.log("⚠️ No cookies found for authentication");
  }

  return { browser, page };
}

/**
 * Human-like scraping with random behaviors
 * @param {Object} page Puppeteer page object
 * @param {String} url URL to scrape
 * @returns {Array} Array of scraped data objects
 */
async function scrapePage(page, url) {
  console.log(`📄 Scraping: ${url}`);

  try {
    // Random pre-navigation delay (1-3 seconds)
    const preNavDelay = Math.floor(Math.random() * 2000) + 1000;
    await new Promise((resolve) => setTimeout(resolve, preNavDelay));

    await page.goto(url, {
      waitUntil: "domcontentloaded", // More reliable than networkidle2
      timeout: 500000,
    });

    // Simulate human-like behavior
    await page.mouse.move(
      Math.floor(Math.random() * 500) + 100,
      Math.floor(Math.random() * 300) + 100
    );

    // Random scroll
    await page.evaluate(() => {
      window.scrollTo(0, Math.floor(Math.random() * 400));
    });

    // Check for CAPTCHA or verification page
    const pageTitle = await page.title();
    const pageUrl = await page.url();

    if (
      pageTitle.includes("Verification") ||
      pageTitle.includes("CAPTCHA") ||
      pageUrl.includes("verify") ||
      pageTitle.includes("Bot") ||
      pageTitle.includes("Security Check")
    ) {
      console.error(
        "❌ Human verification required. Cannot proceed in headless mode."
      );
      return null;
    }

    // Check if we're on login page (session expired)
    if (
      pageUrl.includes("login") ||
      pageTitle.includes("Login") ||
      pageTitle.includes("Sign In")
    ) {
      console.error(
        "❌ Session expired or not logged in. Please update SESSION_DATA secret."
      );
      return null;
    }

    // Wait for the table with random timeout
    const tableTimeout = Math.floor(Math.random() * 10000) + 10000; // 10-20 seconds
    try {
      await page.waitForSelector("#sites_tbl", { timeout: tableTimeout });
    } catch (error) {
      console.error(`❌ Table #sites_tbl not found on page: ${url}`);
      return null;
    }

    // Add small delay before extracting data
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 2000)
    );

    // Extract data from the table
    const tableData = await page.evaluate(() => {
      const table = document.querySelector("#sites_tbl");
      if (!table) return [];

      const rows = Array.from(table.querySelectorAll("tr"));
      // Skip header row if it exists
      const dataRows = rows.slice(1);

      return dataRows
        .map((row, index) => {
          const cells = Array.from(row.querySelectorAll("td, th"));

          // Extract data with fallbacks
          const rank = cells[0]?.textContent?.trim() || `row-${index + 1}`;
          const domainLink = cells[1]?.querySelector("a");
          const ipLink = cells[2]?.querySelector("a");
          const ownerLink = cells[4]?.querySelector("a");

          return {
            rank: rank,
            domain:
              cells[1]?.textContent?.trim() ||
              domainLink?.textContent?.trim() ||
              "",
            domainUrl: domainLink?.href || "",
            ipAddress:
              cells[2]?.textContent?.trim() ||
              ipLink?.textContent?.trim() ||
              "",
            ipAddressUrl: ipLink?.href || "",
            location: cells[3]?.textContent?.trim() || "",
            owner:
              cells[4]?.textContent?.trim() ||
              ownerLink?.textContent?.trim() ||
              "",
            ownerUrl: ownerLink?.href || "",
            lastUpdate: cells[5]?.textContent?.trim() || "",
            sourceUrl: window.location.href,
            scrapedAt: new Date().toISOString(),
            // Add a unique identifier by combining rank and domain
            uniqueId: `${rank}-${cells[1]?.textContent?.trim() || ""}`.replace(
              /\s+/g,
              "-"
            ),
          };
        })
        .filter((row) => row.domain || row.ipAddress); // Filter out empty rows
    });

    console.log(`✅ Extracted ${tableData.length} rows from ${url}`);
    return tableData;
  } catch (error) {
    console.error(`❌ Error scraping ${url}:`, error.message);
    return null;
  }
}

/**
 * Save data to CSV file
 * @param {Array} data Array of data objects
 * @param {String} filename Output filename
 */
async function saveToCSV(data, filename) {
  const csvWriter = createObjectCsvWriter({
    path: filename,
    header: [
      { id: "rank", title: "Rank" },
      { id: "domain", title: "Domain" },
      { id: "domainUrl", title: "Domain_URL" },
      { id: "ipAddress", title: "IP_Address" },
      { id: "ipAddressUrl", title: "IP_Address_URL" },
      { id: "location", title: "Location" },
      { id: "owner", title: "Owner" },
      { id: "ownerUrl", title: "Owner_URL" },
      { id: "lastUpdate", title: "Last_Update" },
      { id: "sourceUrl", title: "Source_URL" },
      { id: "scrapedAt", title: "Scraped_At" },
      { id: "uniqueId", title: "Unique_ID" },
    ],
  });

  await csvWriter.writeRecords(data);
  console.log(`💾 Data saved to ${filename}`);
}

/**
 * Main function
 */
async function main() {
  // Get chunk number from command line arguments
  const chunkNumber = process.argv[2];
  if (!chunkNumber) {
    console.error(
      "❌ No chunk number specified. Usage: node worker_script.js <chunk_number>"
    );
    console.error("Example: node worker_script.js 1");
    process.exit(1);
  }

  console.log(`🎯 Starting to process chunk ${chunkNumber}`);

  try {
    // Load cookies and URLs
    console.log("🔧 Loading configuration...");
    const cookies = loadCookiesFromEnv();
    const urls = loadUrlsFromChunk(chunkNumber);

    console.log(`📊 Loaded ${urls.length} URLs from chunk_${chunkNumber}.txt`);
    console.log(`🔑 Loaded ${cookies.length} session cookies`);

    // Setup browser
    const { browser, page } = await setupBrowser(cookies);

    try {
      // Process each URL in the chunk
      let allData = [];
      let successCount = 0;
      let failCount = 0;

      console.log(`🔄 Starting to scrape ${urls.length} pages...`);

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const data = await scrapePage(page, url);

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          successCount++;
          console.log(`✅ Success: ${url} (${data.length} records)`);
        } else {
          failCount++;
          console.log(`❌ Failed: ${url}`);
        }

        // Add RANDOM delay between requests (3-8 seconds)
        if (i < urls.length - 1) {
          const randomDelay = getRandomDelay();
          console.log(
            `⏳ Waiting ${randomDelay / 1000}s before next request...`
          );
          await new Promise((resolve) => setTimeout(resolve, randomDelay));
        }
      }

      // Save the scraped data
      if (allData.length > 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const outputFile = path.join(
          OUTPUT_DIR,
          `data_chunk_${chunkNumber}_${timestamp}.csv`
        );
        await saveToCSV(allData, outputFile);

        console.log(`\n🎉 Chunk ${chunkNumber} processing completed!`);
        console.log(`📈 Summary:`);
        console.log(`   Total URLs processed: ${urls.length}`);
        console.log(`   Successful scrapes: ${successCount}`);
        console.log(`   Failed scrapes: ${failCount}`);
        console.log(`   Total records collected: ${allData.length}`);
        console.log(`   Output file: ${outputFile}`);
      } else {
        console.log("❌ No data was scraped from this chunk");
      }
    } finally {
      console.log("🔚 Closing browser...");
      await browser.close();
    }
  } catch (error) {
    console.error("💥 An error occurred:", error.message);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

main();
