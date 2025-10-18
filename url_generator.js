const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://myip.ms/browse/sites/{page}/rankii/15000000/ipID/23.227.38.0/ipIDii/23.227.38.255';
const TOTAL_PAGES = 15000; // Adjust based on actual number of pages
const CHUNK_SIZE = 50; // Maximum pages per IP per day
const OUTPUT_DIR = path.join(__dirname, 'chunks');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Generate a list of all URLs to scrape
 * @returns {Array} Array of URL strings
 */
function generateUrlList() {
  console.log(`Generating URL list for ${TOTAL_PAGES} pages...`);
  const urls = [];
  
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const url = BASE_URL.replace('{page}', page);
    urls.push(url);
  }
  
  console.log(`Generated ${urls.length} URLs.`);
  return urls;
}

/**
 * Split URLs into chunks of specified size
 * @param {Array} urls List of URLs to chunk
 * @param {Number} chunkSize Maximum size of each chunk
 * @returns {Array} Array of URL chunks
 */
function chunkUrls(urls, chunkSize) {
  console.log(`Splitting ${urls.length} URLs into chunks of ${chunkSize}...`);
  const chunks = [];
  
  for (let i = 0; i < urls.length; i += chunkSize) {
    chunks.push(urls.slice(i, i + chunkSize));
  }
  
  console.log(`Created ${chunks.length} chunks.`);
  return chunks;
}

/**
 * Save URL chunks to files
 * @param {Array} chunks Array of URL chunks
 */
function saveChunks(chunks) {
  console.log(`Saving ${chunks.length} chunks to files...`);
  
  // Clear existing chunk files
  fs.readdirSync(OUTPUT_DIR)
    .filter(file => file.startsWith('chunk_') && file.endsWith('.txt'))
    .forEach(file => fs.unlinkSync(path.join(OUTPUT_DIR, file)));
  
  // Save new chunks
  chunks.forEach((chunk, index) => {
    const chunkNum = index + 1;
    const filename = path.join(OUTPUT_DIR, `chunk_${chunkNum.toString().padStart(4, '0')}.txt`);
    fs.writeFileSync(filename, chunk.join('\n'));
  });
  
  // Create a manifest file with chunk information
  const manifest = {
    totalPages: TOTAL_PAGES,
    chunkSize: CHUNK_SIZE,
    totalChunks: chunks.length,
    generatedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  console.log(`Saved ${chunks.length} chunk files to ${OUTPUT_DIR}`);
  console.log(`Manifest saved to ${path.join(OUTPUT_DIR, 'manifest.json')}`);
}

/**
 * Main function
 */
function main() {
  try {
    const urls = generateUrlList();
    const chunks = chunkUrls(urls, CHUNK_SIZE);
    saveChunks(chunks);
    
    console.log('URL generation and chunking completed successfully!');
    console.log(`Total URLs: ${urls.length}`);
    console.log(`Total chunks: ${chunks.length}`);
    console.log(`Chunk size: ${CHUNK_SIZE}`);
    console.log(`Output directory: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();