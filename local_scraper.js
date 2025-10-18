const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-writer').createObjectCsvWriter;

// Configuration
const BASE_URL = 'https://myip.ms/browse/sites/2/rankii/15000000/ipID/23.227.38.0/ipIDii/23.227.38.255';
const LOGIN_URL = 'https://myip.ms/login';
const COOKIES_PATH = path.join(__dirname, 'session_cookies.json');
const OUTPUT_DIR = path.join(__dirname, 'data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function setupBrowser() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false, // Set to false for manual login and CAPTCHA solving
    defaultViewport: null,
    args: ['--start-maximized']
  });
  const page = await browser.newPage();
  return { browser, page };
}

async function loadCookiesIfExists(page) {
  if (fs.existsSync(COOKIES_PATH)) {
    console.log('Loading saved cookies...');
    const cookiesString = fs.readFileSync(COOKIES_PATH);
    const cookies = JSON.parse(cookiesString);
    await page.setCookie(...cookies);
    return true;
  }
  return false;
}

async function manualLogin(page) {
  console.log('Navigating to login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
  
  console.log('Please log in manually and solve any CAPTCHA...');
  console.log('Waiting for navigation to complete after login...');
  
  // Wait for user to manually log in and navigate to a page that indicates successful login
  // This could be a dashboard page or any page that appears after successful login
  await page.waitForNavigation({ timeout: 120000 }); // 2 minutes timeout for manual login
  
  console.log('Login completed. Saving cookies...');
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
}

async function verifyLogin(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  
  // Check if we're still on the login page or if there's a login button visible
  const loginButton = await page.$('input[type="submit"][value="Login"]');
  if (loginButton) {
    console.log('Not logged in. Please run the script again and log in manually.');
    return false;
  }
  
  console.log('Successfully logged in!');
  return true;
}

async function scrapePage(page, pageNum) {
  const url = BASE_URL.replace('/sites/2/', `/sites/${pageNum}/`);
  console.log(`Scraping page ${pageNum}: ${url}`);
  
  await page.goto(url, { waitUntil: 'networkidle2' });
  
  // Check for CAPTCHA or verification page
  const pageTitle = await page.title();
  if (pageTitle.includes('Verification') || pageTitle.includes('CAPTCHA')) {
    console.log('Human verification required. Please solve the CAPTCHA...');
    await page.waitForNavigation({ timeout: 120000 }); // 2 minutes timeout for CAPTCHA solving
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
        lastUpdate: cells[5]?.textContent.trim() || ''
      };
    });
  });
  
  console.log(`Extracted ${tableData.length} rows from page ${pageNum}`);
  return tableData;
}

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
      { id: 'lastUpdate', title: 'Last Update' }
    ]
  });
  
  await csvWriter.writeRecords(data);
  console.log(`Data saved to ${filename}`);
}

async function main() {
  const { browser, page } = await setupBrowser();
  
  try {
    const hasCookies = await loadCookiesIfExists(page);
    
    if (!hasCookies) {
      await manualLogin(page);
    }
    
    const isLoggedIn = await verifyLogin(page);
    if (!isLoggedIn) {
      await browser.close();
      return;
    }
    
    // Save cookies again after verifying login
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('Session cookies saved successfully.');
    
    // Test scraping a few pages
    const pagesToTest = [1, 2, 3]; // Test first 3 pages
    let allData = [];
    
    for (const pageNum of pagesToTest) {
      const data = await scrapePage(page, pageNum);
      allData = [...allData, ...data];
      
      // Add a delay between requests to be respectful to the server
      if (pageNum < pagesToTest.length) {
        console.log('Waiting before next request...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds delay
      }
    }
    
    // Save the test data
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(OUTPUT_DIR, `test_data_${timestamp}.csv`);
    await saveToCSV(allData, outputFile);
    
    console.log('Test scraping completed successfully!');
    console.log(`Total records scraped: ${allData.length}`);
    
    // Export cookies in base64 format for GitHub Actions
    const cookiesString = fs.readFileSync(COOKIES_PATH);
    const base64Cookies = Buffer.from(cookiesString).toString('base64');
    fs.writeFileSync(path.join(__dirname, 'session_cookies_base64.txt'), base64Cookies);
    console.log('Cookies exported in base64 format for GitHub Actions.');
    
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await browser.close();
  }
}

main();