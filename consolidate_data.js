const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const csvWriter = require('csv-writer').createObjectCsvWriter;

// Configuration
const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_FILE = path.join(__dirname, 'master_data.csv');

/**
 * Read all CSV files in the data directory
 * @returns {Promise<Array>} Array of file paths
 */
function getDataFiles() {
  return new Promise((resolve, reject) => {
    fs.readdir(DATA_DIR, (err, files) => {
      if (err) {
        return reject(err);
      }
      
      const csvFiles = files.filter(file => file.endsWith('.csv'));
      resolve(csvFiles.map(file => path.join(DATA_DIR, file)));
    });
  });
}

/**
 * Read data from a CSV file
 * @param {String} filePath Path to CSV file
 * @returns {Promise<Array>} Array of data objects
 */
function readCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

/**
 * Deduplicate data based on uniqueId
 * @param {Array} data Array of data objects
 * @returns {Array} Deduplicated array
 */
function deduplicateData(data) {
  console.log(`Deduplicating ${data.length} records...`);
  
  // Use a Map to deduplicate by uniqueId
  const uniqueMap = new Map();
  
  // Process each record
  data.forEach(record => {
    // If uniqueId is not available, create one from rank and domain
    const uniqueId = record.UniqueID || `${record.Rank}-${record.Domain}`;
    
    // If this uniqueId is not in the map, or this record is newer (based on timestamp in filename)
    // then add/update it in the map
    if (!uniqueMap.has(uniqueId) || 
        (record._source_timestamp && 
         (!uniqueMap.get(uniqueId)._source_timestamp || 
          record._source_timestamp > uniqueMap.get(uniqueId)._source_timestamp))) {
      uniqueMap.set(uniqueId, record);
    }
  });
  
  const deduplicated = Array.from(uniqueMap.values());
  console.log(`After deduplication: ${deduplicated.length} records`);
  
  return deduplicated;
}

/**
 * Save data to CSV file
 * @param {Array} data Array of data objects
 * @param {String} outputFile Output file path
 */
async function saveToCSV(data, outputFile) {
  // Get all possible headers from the data
  const allHeaders = new Set();
  data.forEach(record => {
    Object.keys(record).forEach(key => {
      // Skip internal fields used for processing
      if (!key.startsWith('_')) {
        allHeaders.add(key);
      }
    });
  });
  
  // Create header configuration for csv-writer
  const header = Array.from(allHeaders).map(id => ({ id, title: id }));
  
  const writer = csvWriter({
    path: outputFile,
    header
  });
  
  await writer.writeRecords(data);
  console.log(`Data saved to ${outputFile}`);
}

/**
 * Extract timestamp from filename
 * @param {String} filename Filename with timestamp
 * @returns {String|null} Timestamp string or null
 */
function extractTimestamp(filename) {
  const match = filename.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Starting data consolidation...');
    
    // Get all CSV files
    const files = await getDataFiles();
    console.log(`Found ${files.length} CSV files`);
    
    if (files.length === 0) {
      console.log('No data files found. Exiting.');
      return;
    }
    
    // Read and combine all data
    let allData = [];
    
    for (const file of files) {
      console.log(`Reading ${file}...`);
      const data = await readCsvFile(file);
      
      // Add source file and timestamp metadata to each record
      const timestamp = extractTimestamp(path.basename(file));
      data.forEach(record => {
        record._source_file = path.basename(file);
        record._source_timestamp = timestamp;
      });
      
      allData = [...allData, ...data];
    }
    
    console.log(`Total records read: ${allData.length}`);
    
    // Deduplicate data
    const deduplicated = deduplicateData(allData);
    
    // Remove metadata fields before saving
    deduplicated.forEach(record => {
      delete record._source_file;
      delete record._source_timestamp;
    });
    
    // Save consolidated data
    await saveToCSV(deduplicated, OUTPUT_FILE);
    
    console.log('Data consolidation completed successfully!');
    console.log(`Original record count: ${allData.length}`);
    console.log(`Final record count: ${deduplicated.length}`);
    console.log(`Duplicates removed: ${allData.length - deduplicated.length}`);
    
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();