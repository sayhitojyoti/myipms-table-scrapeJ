# Distributed Web Scraping System for MyIP.ms

This project implements a distributed web scraping system to extract data from MyIP.ms tables while respecting their 50-page-per-IP-address daily limit. The system uses GitHub Actions as free distributed workers to bypass this limitation.

## Project Structure

```
.
├── .github/
│   └── workflows/
│       └── scraper.yml       # GitHub Actions workflow configuration
├── chunks/                   # Generated URL chunks (50 URLs per file)
├── data/                     # Scraped data output directory
├── local_scraper.js          # Local script for authentication and testing
├── url_generator.js          # Script to generate and chunk URLs
├── worker_script.js          # Script executed by GitHub Actions workers
├── consolidate_data.js       # Script to combine and deduplicate results
├── session_cookies.json      # Saved authentication cookies (local)
├── session_cookies_base64.txt # Base64 encoded cookies for GitHub Actions
└── README.md                 # This documentation
```

## Prerequisites

- Node.js (v14 or higher)
- A GitHub account
- A GitHub repository to host the code and run GitHub Actions

## Installation

1. Clone this repository or create a new one with these files
2. Install dependencies:

```bash
npm init -y
npm install puppeteer csv-writer csv-parser
```

## Step-by-Step Implementation Guide

### Step 1: Setup & Local Testing

1. Run the local scraper to authenticate and test scraping:

```bash
node local_scraper.js
```

This will:
- Launch a browser window
- Navigate to the login page
- Wait for you to manually log in and solve any CAPTCHA
- Save your authenticated session cookies
- Test scraping a few pages
- Export cookies in base64 format for GitHub Actions

### Step 2: Generate URL Chunks

1. Run the URL generator script:

```bash
node url_generator.js
```

This will:
- Generate a list of all target URLs (from page 1 to 15,000+)
- Split them into chunks of 50 URLs each
- Save the chunks to the `chunks/` directory
- Create a manifest file with chunk information

### Step 3: Prepare the GitHub Repository

1. Create a new GitHub repository or use an existing one
2. Push all the code files to the repository:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 4: Configure the GitHub Secret

1. Go to your GitHub repository
2. Navigate to Settings > Secrets and variables > Actions
3. Click "New repository secret"
4. Name: `SESSION_DATA`
5. Value: Copy the content of `session_cookies_base64.txt`
6. Click "Add secret"

### Step 5: Execute the Scraping Run

1. Go to your GitHub repository
2. Navigate to Actions > "Distributed Web Scraping" workflow
3. Click "Run workflow"
4. Configure the run:
   - Max parallel jobs: Choose how many workers to run in parallel (5, 10, or 15)
   - Chunk start: The first chunk number to process
   - Chunk end: The last chunk number to process
5. Click "Run workflow"

The workflow will:
- Run multiple jobs in parallel, each processing a different chunk
- Each job will scrape the URLs in its chunk
- Save the results as CSV files
- Commit the CSV files back to the repository

### Step 6: Consolidate the Data

After all GitHub Actions jobs have completed:

1. Pull the latest changes from the repository:

```bash
git pull
```

2. Run the data consolidation script:

```bash
node consolidate_data.js
```

This will:
- Combine all the individual chunk CSV files
- Deduplicate records based on the unique identifier
- Produce a single `master_data.csv` file

## Technical Details

### Authentication & Session Handling

The system uses Puppeteer to handle authentication:
1. You manually log in and solve any CAPTCHA in a browser window
2. The session cookies are saved and reused by the workers
3. The cookies are stored as a base64-encoded GitHub Secret

### Distributed Scraping Strategy

- The URL list is split into chunks of 50 URLs (the daily limit per IP)
- Each GitHub Actions worker processes one chunk using a different IP address
- Workers run in parallel to speed up the process
- Each worker commits its results back to the repository

### Data Deduplication

The consolidation script deduplicates data based on:
1. A unique identifier (rank + domain)
2. Timestamp of the scrape (newer data takes precedence)

## Maintenance & Troubleshooting

### Refreshing Authentication

If the session expires:
1. Run `local_scraper.js` again to get fresh cookies
2. Update the `SESSION_DATA` secret in GitHub

### Handling Failed Jobs

If some jobs fail:
1. Check the GitHub Actions logs for errors
2. Re-run the workflow with the specific chunk range that failed

### Adding New Pages

As new data is added to the website:
1. Update the `TOTAL_PAGES` constant in `url_generator.js`
2. Run the URL generator again
3. Execute the workflow for the new chunks

## Limitations & Considerations

- The system assumes the table structure remains consistent
- Authentication session must be refreshed periodically
- GitHub Actions has usage limits that may affect very large scraping operations
- Be respectful to the target website by implementing delays between requests