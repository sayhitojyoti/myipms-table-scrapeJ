const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-writer').createObjectCsvWriter;

// Configuration
const COOKIES_ENV_VAR = 'SESSION_DATA'; // GitHub Secret name
const DELAY_BETWEEN_REQUESTS = 3000; // 3 seconds delay between requests
const OUTPUT_DIR = path.join(__dirname, 'data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
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
  
  const cookiesString = Buffer.from(base64Cookies, 'base64').toString('utf-8');
  return JSON.parse(cookiesString);
}

/**
 * Load URLs from chunk file
 * @param {String} chunkFilePath Path to chunk file
 * @returns {Array} Array of URLs
 */
function loadUrlsFromChunk(chunkFilePath) {
  if (!fs.existsSync(chunkFilePath)) {
    throw new Error(`Chunk file not found: ${chunkFilePath}`);
  }
  
  const content = fs.readFileSync(chunkFilePath, 'utf-8');
  return content.split('\n').filter(url => url.trim() !== '');
}

/**
 * Setup browser with authentication cookies
 * @param {Array} cookies Array of cookie objects
 * @returns {Object} Browser and page objects
 */
async function setupBrowser(cookies) {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Set cookies for authentication
  await page.setCookie(...cookies);
  
  return { browser, page };
}

/**
 * Scrape data from a single page
 * @param {Object} page Puppeteer page object
 * @param {String} url URL to scrape
 * @returns {Array} Array of scraped data objects
 */
async function scrapePage(page, url) {
  console.log(`Scraping: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Check for CAPTCHA or verification page
    const pageTitle = await page.title();
    if (pageTitle.includes('Verification') || pageTitle.includes('CAPTCHA')) {
      console.error('Human verification required. Cannot proceed in headless mode.');
      return null;
    }
    
    // Wait for the table to load
    await page.waitForSelector('#sites_tbl', { timeout: 30000 });
    
    // Extract data from the table
    const tableData = await page.evaluate(() => {
      const table = document.querySelector('#sites_tbl');
      if (!table) return [];
      
      const rows = Array.from(table.querySelectorAll('tr'));
      // Skip header row
      const dataRows = rows.slice(1);
      
      return dataRows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          rank: cells[0]?.textContent.trim() || '',
          domain: cells[1]?.querySelector('a')?.textContent.trim() || '',
          domainUrl: cells[1]?.querySelector('a')?.href || '',
          ipAddress: cells[2]?.textContent.trim() || '',
          ipAddressUrl: cells[2]?.querySelector('a')?.href || '',
          location: cells[3]?.textContent.trim() || '',
          owner: cells[4]?.textContent.trim() || '',
          ownerUrl: cells[4]?.querySelector('a')?.href || '',
          lastUpdate: cells[5]?.textContent.trim() || '',
          // Add a unique identifier by combining rank and domain
          uniqueId: `${cells[0]?.textContent.trim() || ''}-${cells[1]?.querySelector('a')?.textContent.trim() || ''}`
        };
      });
    });
    
    console.log(`Extracted ${tableData.length} rows from ${url}`);
    return tableData;
  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);
    return null;
  }
}

/**
 * Save data to CSV file
 * @param {Array} data Array of data objects
 * @param {String} filename Output filename
 */
async function saveToCSV(data, filename) {
  const csvWriter = csv({
    path: filename,
    header: [
      { id: 'rank', title: 'Rank' },
      { id: 'domain', title: 'Domain' },
      { id: 'domainUrl', title: 'Domain URL' },
      { id: 'ipAddress', title: 'IP Address' },
      { id: 'ipAddressUrl', title: 'IP Address URL' },
      { id: 'location', title: 'Location' },
      { id: 'owner', title: 'Owner' },
      { id: 'ownerUrl', title: 'Owner URL' },
      { id: 'lastUpdate', title: 'Last Update' },
      { id: 'uniqueId', title: 'UniqueID' }
    ]
  });
  
  await csvWriter.writeRecords(data);
  console.log(`Data saved to ${filename}`);
}

/**
 * Main function
 */
async function main() {
  // Get chunk file path from command line arguments
  const chunkFilePath = process.argv[2];
  if (!chunkFilePath) {
    console.error('No chunk file specified. Usage: node worker_script.js <chunk_file_path>');
    process.exit(1);
  }
  
  console.log(`Processing chunk file: ${chunkFilePath}`);
  
  try {
    // Load cookies and URLs
    const cookies = loadCookiesFromEnv();
    const urls = loadUrlsFromChunk(chunkFilePath);
    
    console.log(`Loaded ${urls.length} URLs from chunk file`);
    
    // Setup browser
    const { browser, page } = await setupBrowser(cookies);
    
    try {
      // Process each URL in the chunk
      let allData = [];
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const data = await scrapePage(page, url);
        
        if (data) {
          allData = [...allData, ...data];
          successCount++;
        } else {
          failCount++;
        }
        
        // Add delay between requests
        if (i < urls.length - 1) {
          console.log(`Waiting ${DELAY_BETWEEN_REQUESTS}ms before next request...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
        }
      }
      
      // Save the scraped data
      if (allData.length > 0) {
        const chunkName = path.basename(chunkFilePath, '.txt');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFile = path.join(OUTPUT_DIR, `${chunkName}_${timestamp}.csv`);
        await saveToCSV(allData, outputFile);
      }
      
      console.log('Chunk processing completed');
      console.log(`Total URLs: ${urls.length}`);
      console.log(`Successful: ${successCount}`);
      console.log(`Failed: ${failCount}`);
      console.log(`Total records: ${allData.length}`);
      
    } finally {
      await browser.close();
    }
    
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

main();