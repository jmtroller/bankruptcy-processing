// Load required modules
const path = require('path');
const { resetCaseFlags } = require('./case-reset.js');
const { logMessage } = require('./papertrail-logger.js');
const puppeteer = require('puppeteer-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createDbConnection } = require('./db-connection.js');
const fs = require('fs').promises;
const cheerio = require('cheerio');
const https = require('https');
const { URL } = require('url');

puppeteer.use(stealthPlugin());

// Safe logging wrapper that ensures the script continues even if Papertrail logging fails
function safeLogMessage(message, level = 'info', scriptName = 'Bankruptcy Script') {
  // Fire-and-forget logging - don't wait for it to complete
  logMessage(message, level, scriptName).catch(error => {
    // If Papertrail logging fails completely, fall back to console logging
    console.log(`[${new Date().toISOString()}] [FALLBACK] ${message}`);
    console.error(`[LOGGING ERROR] Papertrail logging failed: ${error.message}`);
  });
}

const LOGIN_URL = 'https://www.inforuptcy.com/user-portal?destination=filings';
const USERNAME = 'busbk.library@gmail.com';
const PASSWORD = '4infou9yh@M';

async function clearOutputDirectory() {
  const directory = 'output';
  try {
    safeLogMessage(`Clearing ${directory} directory...`, 'info', 'Bankruptcy Script');
    await fs.rm(directory, { recursive: true, force: true });
    await fs.mkdir(directory, { recursive: true });
    safeLogMessage('Directory cleared.', 'success', 'Bankruptcy Script');
  } catch (error) {
    console.error(`Error clearing directory: ${error.message}`);
  }
}

async function resetRejectFlags() {
  let connection;
  try {
    connection = await createDbConnection();
    safeLogMessage('Resetting flagMisc = 0 for any previously rejected cases...', 'info', 'Bankruptcy Script');
    const [result] = await connection.execute(
      'UPDATE vw_case_info SET flagMisc = 0 WHERE flagEmail = 1 AND flagMisc = 9'
    );
    safeLogMessage(`${result.affectedRows} row(s) reset.`, 'success', 'Bankruptcy Script');
  } catch (error) {
    console.error(`Failed to reset flags in database. Error: ${error.message}`);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

async function login(browser) {
  const page = await browser.newPage();
  try {
    // Set a user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    safeLogMessage('Navigating to login page...', 'info', 'Bankruptcy Script');
    await page.goto(LOGIN_URL, { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    
    // Wait for form elements to be available
    await page.waitForSelector('#edit-name', { timeout: 10000 });
    await page.waitForSelector('#edit-pass', { timeout: 10000 });
    await page.waitForSelector('#edit-submit', { timeout: 10000 });
    
    safeLogMessage('Entering credentials...', 'info', 'Bankruptcy Script');
    await page.type('#edit-name', USERNAME, { delay: 100 });
    await page.type('#edit-pass', PASSWORD, { delay: 100 });
    
    // Use Promise.race to handle navigation that might not complete normally
    await Promise.race([
      page.click('#edit-submit').then(() => 
        page.waitForNavigation({ 
          waitUntil: 'domcontentloaded', 
          timeout: 60000 
        }).catch(() => {
          // Navigation might fail but login could still succeed
          safeLogMessage('Navigation completed with potential redirect', 'info', 'Bankruptcy Script');
        })
      ),
      new Promise(resolve => setTimeout(resolve, 10000)) // 10 second fallback
    ]);
    
    // Wait a bit for any redirects to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    safeLogMessage('Verifying login success...', 'info', 'Bankruptcy Script');
    const content = await page.content();
    await fs.writeFile('login_page.html', content);
    
    if ((content.match(/Richard Saunders/g) || []).length >= 2) {
      safeLogMessage('🔓 Login successful!', 'success', 'Bankruptcy Script');
      const cookies = await page.cookies();
      return cookies;
    } else {
      await page.screenshot({ path: 'login_failure.png' });
      safeLogMessage('❌ Login verification failed - screenshot saved', 'error', 'Bankruptcy Script');
      throw new Error('Login verification failed.');
    }
  } catch (error) {
    safeLogMessage(`🚨 Login error: ${error.message}`, 'error', 'Bankruptcy Script');
    try {
      if (page && !page.isClosed()) await page.screenshot({ path: 'login_error.png' });
    } catch (screenshotError) {
      safeLogMessage(`Could not take error screenshot: ${screenshotError.message}`, 'warning', 'Bankruptcy Script');
    }
    throw error;
  } finally {
    try {
      if (page && !page.isClosed()) await page.close();
    } catch (closeError) {
      safeLogMessage(`Could not close page: ${closeError.message}`, 'warning', 'Bankruptcy Script');
    }
  }
}

async function getCaseDataFromDB() {
  const connection = await createDbConnection();
  safeLogMessage('Fetching cases', 'info', 'Bankruptcy Script');
  const [rows] = await connection.execute('SELECT * FROM vw_new_cases');
  await connection.end();
  return rows;
}

async function getPageContent(browser, url, caseData, cookies) {
  safeLogMessage(`Scraping ${url}`, 'info', 'Bankruptcy Script');
  let page;
  try {
    page = await browser.newPage();
    
    // Set resource limits to prevent memory issues
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    await page.setCookie(...cookies);
    safeLogMessage(`Scraping initial HTML for: ${caseData.simpleName}`, 'info', 'Bankruptcy Script');
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    
    const content = await page.content();
    if (content === '<html><head></head><body>No Accessible Documents Found</body></html>') {
      safeLogMessage(`No accessible documents found for ${caseData.simpleName}. Skipping to next case.`, 'info', 'Bankruptcy Script');
      return;
    }
    
    const outputDir = 'output';
    const filename = path.join(outputDir, `${caseData.simpleName}.html`);
    await fs.writeFile(filename, content);
    
  } catch (error) {
    console.error(`Error scraping ${url}: ${error.message}`);
    if (error.message.includes('Protocol error') || error.message.includes('Connection closed')) {
      throw error; // Re-throw browser connection errors to stop execution
    }
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error(`Error closing page: ${closeError.message}`);
      }
    }
  }
}

function randomDelay() {
  const delay = Math.random() * (5000 - 500) + 500;
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function downloadPdf(browser, pdfUrl, simpleName, cookies) {
  const documentsDir = '/home/ubuntu/inforuptcy';
  const newPath = path.join(documentsDir, `${simpleName}.pdf`);

  try {
    await fs.access(newPath);
   // safeLogMessage(`  - SKIPPING: File already exists for ${simpleName}.`, 'info', 'Bankruptcy Script');
    return;
  } catch (e) {
    // File does not exist, so proceed.
  }

  const page = await browser.newPage();
  const timeout = 60000; // 60-second timeout for download

  try {
    await fs.mkdir(documentsDir, { recursive: true });
    const filesBefore = new Set(await fs.readdir(documentsDir));

    await page.setCookie(...cookies);
    await page._client().send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: documentsDir,
    });

    const fullUrl = new URL(pdfUrl, 'https://www.inforuptcy.com').toString();
  //  safeLogMessage(`Attempting to download PDF for: ${simpleName}`, 'info', 'Bankruptcy Script');

    try {
      await page.goto(fullUrl, { timeout: 60000 });
    } catch (error) {
      if (!error.message.includes('net::ERR_ABORTED')) {
        console.error(`Navigation error for ${simpleName}: ${error.message}`);
        return;
      }
      safeLogMessage(`  - Download triggered for ${simpleName} (net::ERR_ABORTED is expected). Verifying file...`, 'info', 'Bankruptcy Script');
    }

    // --- Verification logic ---
    let downloadedFile = null;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const filesAfter = await fs.readdir(documentsDir);
      const newFiles = filesAfter.filter(f => !filesBefore.has(f) && !f.endsWith('.crdownload'));

      for (const candidateFile of newFiles) {
        const filePath = path.join(documentsDir, candidateFile);
        try {
          const fileBuffer = await fs.readFile(filePath);
          if (fileBuffer.toString('utf-8', 0, 5) === '%PDF-') {
          //  safeLogMessage(`  - Found valid PDF: ${candidateFile}`, 'success', 'Bankruptcy Script');
            downloadedFile = candidateFile;
            break; // Found our PDF, break from the for loop
          } else {
            safeLogMessage(`  - Found invalid file (not a PDF): ${candidateFile}. Deleting it.`, 'info', 'Bankruptcy Script');
            await fs.unlink(filePath);
          }
        } catch (e) {
          safeLogMessage(`  - Could not process candidate file ${candidateFile}: ${e.message}`, 'error', 'Bankruptcy Script');
        }
      }

      if (downloadedFile) {
        break; // Break from the while loop
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every second
    }

    if (downloadedFile) {
      const oldPath = path.join(documentsDir, downloadedFile);
      await fs.rename(oldPath, newPath);
   //   safeLogMessage(`  - SUCCESS: Verified and renamed to ${simpleName}.pdf`, 'success', 'Bankruptcy Script');
    } else {
      console.error(`  - FAILED: PDF download for ${simpleName} did not complete in ${timeout / 1000}s.`);
      // Clean up partial files
      const filesAfter = await fs.readdir(documentsDir);
      const newFiles = filesAfter.filter(f => !filesBefore.has(f));
      for (const file of newFiles) {
        if (file.endsWith('.crdownload')) {
          await fs.unlink(path.join(documentsDir, file));
          safeLogMessage(`  - Removed partial file: ${file}`, 'info', 'Bankruptcy Script');
        }
      }
    }
  } catch (error) {
    console.error(`An error occurred in downloadPdf for ${simpleName}: ${error.message}`);
  } finally {
    if (page && !page.isClosed()) {
      await page.close();
    }
  }
}

async function handleMultiStepDownload(browser, caseData, cookies) {
  const documentsDir = '/home/ubuntu/inforuptcy';
  const newPath = path.join(documentsDir, `${caseData.simpleName}.pdf`);

  try {
    await fs.access(newPath);
    safeLogMessage(`  - SKIPPING: File already exists for ${caseData.simpleName}.`, 'info', 'Bankruptcy Script');
    return;
  } catch (e) {
    // File does not exist, so proceed.
  }

  safeLogMessage(`Starting multi-step download for ${caseData.simpleName}...`, 'info', 'Bankruptcy Script');
  const page = await browser.newPage();
  const timeout = 90000;

  try {
    // Setup page
    await fs.mkdir(documentsDir, { recursive: true });
    const filesBefore = new Set(await fs.readdir(documentsDir));
    await page.setCookie(...cookies);
    await page._client().send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: documentsDir,
    });

    // 1. Navigate to filings page
    const filingsUrl = `https://www.inforuptcy.com/filings/${caseData.court}_${caseData.pacerId}`;
    safeLogMessage(`  - Step 1/4: Navigating to ${filingsUrl}`, 'info', 'Bankruptcy Script');
    await page.goto(filingsUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    safeLogMessage('  - Saving HTML and screenshot of filings page for review...', 'info', 'Bankruptcy Script');
    const htmlContent = await page.content();
    await fs.writeFile('filings_page.html', htmlContent);
    await page.screenshot({ path: 'filings_page.png', fullPage: true });
  

    // 2. Click the docket details link
    const docketLinkSelector = `a[onclick="return view_docket_details(this, '${caseData.court}_${caseData.pacerId}', '1.00000', 2);"]`;
  
    safeLogMessage('  - Step 2/4: Looking for and clicking docket details link...', 'info', 'Bankruptcy Script');
    await page.waitForSelector(docketLinkSelector, { timeout: 10000 });
    await page.click(docketLinkSelector);
    await page.waitForNetworkIdle({ timeout: 60000 });

    safeLogMessage('  - Saving page state after docket link click for review...', 'info', 'Bankruptcy Script');
    const docketHtml = await page.content();
    await fs.writeFile('docket_details_page.html', docketHtml);
    await page.screenshot({ path: 'docket_details_page.png', fullPage: true });

    // 3. Click the div in the zip form
    safeLogMessage('  - Step 3/4: Waiting for download div to appear and clicking it...', 'info', 'Bankruptcy Script');
    const downloadDivSelector = `div.item[onclick^="OpenPDFCombinedDownloadForm"]`;
    await page.waitForSelector(downloadDivSelector, { timeout: 30000 });
    // Using a more forceful programmatic click because the element might be obscured.
    await page.evaluate((selector) => document.querySelector(selector).click(), downloadDivSelector);

    // 4. Verify download
    safeLogMessage('  - Step 4/4: Verifying download...', 'info', 'Bankruptcy Script');
    let downloadedFile = null;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const filesAfter = await fs.readdir(documentsDir);
      const newFiles = filesAfter.filter(f => !filesBefore.has(f) && !f.endsWith('.crdownload'));

      for (const candidateFile of newFiles) {
        const filePath = path.join(documentsDir, candidateFile);
        try {
          const fileBuffer = await fs.readFile(filePath);
          if (fileBuffer.toString('utf-8', 0, 5) === '%PDF-') {
    //        safeLogMessage(`  - Found valid PDF: ${candidateFile}`, 'success', 'Bankruptcy Script');
            downloadedFile = candidateFile;
            break; // Found our PDF, break from the for loop
          } else {
     //       safeLogMessage(`  - Found invalid file (not a PDF): ${candidateFile}. Deleting it.`, 'info', 'Bankruptcy Script');
            await fs.unlink(filePath);
          }
        } catch (e) {
      //    safeLogMessage(`  - Could not process candidate file ${candidateFile}: ${e.message}`, 'error', 'Bankruptcy Script');
        }
      }

      if (downloadedFile) {
        break; // Break from the while loop
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (downloadedFile) {
      const oldPath = path.join(documentsDir, downloadedFile);
      await fs.rename(oldPath, newPath);
  //    safeLogMessage(`  - SUCCESS: Verified and renamed to ${caseData.simpleName}.pdf`, 'success', 'Bankruptcy Script');
    } else {
    //  safeLogMessage(`  - FAILED: Multi-step download for ${caseData.simpleName} did not complete in ${timeout/1000}s.`, 'error', 'Bankruptcy Script');
    }

  } catch (error) {
    console.error(`An error occurred in handleMultiStepDownload for ${caseData.simpleName}: ${error.message}`);
    await page.screenshot({ path: `multistep_error_${caseData.simpleName}.png` });
  } finally {
    if (page && !page.isClosed()) await page.close();
  }
}

async function testSelectorOnLocalFile() {
  const filePath = 'docket_details_page.html';
  safeLogMessage(`Testing selectors on local file: ${filePath}`, 'info', 'Bankruptcy Script');

  try {
    const htmlContent = await fs.readFile(filePath, 'utf-8');
    const $ = cheerio.load(htmlContent);

    const selector = 'div.item[onclick^="OpenPDFZipDownloadForm"]';
    safeLogMessage(`\n--- Testing selector: "${selector}" ---`, 'info', 'Bankruptcy Script');

    const selectedElement = $(selector);

    if (selectedElement.length > 0) {
      safeLogMessage(`SUCCESS: Found ${selectedElement.length} element(s).`, 'success', 'Bankruptcy Script');
      for (let i = 0; i < selectedElement.length; i++) {
        const elem = selectedElement.get(i);
        safeLogMessage(`  - Element ${i + 1}:`, 'info', 'Bankruptcy Script');
        safeLogMessage(`    HTML: ${$(elem).toString()}`, 'info', 'Bankruptcy Script');
        safeLogMessage(`    onclick: ${$(elem).attr('onclick')}`, 'info', 'Bankruptcy Script');
      }
    } else {
      safeLogMessage('FAILURE: Selector did not find any elements.', 'error', 'Bankruptcy Script');
    }

  } catch (error) {
    if (error.code === 'ENOENT') {
      safeLogMessage(`Error: The file '${filePath}' was not found. Please ensure it exists in the root directory.`, 'error', 'Bankruptcy Script');
    } else {
      safeLogMessage(`An error occurred while testing the selector: ${error.message}`, 'error', 'Bankruptcy Script');
    }
  }
}

async function updateCaseAsRejected(simpleName) {
  let connection;
  try {
    connection = await createDbConnection();
    safeLogMessage(`Flagging reject in DB: ${simpleName}`, 'info', 'Bankruptcy Script');
    await connection.execute('UPDATE vw_case_info SET flagMisc = 9 WHERE simpleName = ?', [simpleName]);
  } catch (error) {
    console.error(`Failed to update database for ${simpleName}. Error: ${error.message}`);
  } finally {
    if (connection) await connection.end();
  }
}

async function main() {
  safeLogMessage('🚀 Starting bankruptcy case processing script', 'start', 'Bankruptcy Script');
  
  try {
    await resetCaseFlags();
    await clearOutputDirectory();
    await resetRejectFlags();

  //  safeLogMessage('Launching browser...', 'info', 'Bankruptcy Script');
    
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: '/snap/bin/chromium',
        userDataDir: '/tmp/chrome-user-data-' + Date.now(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--memory-pressure-off',
          '--max_old_space_size=4096'
        ]
      });
      safeLogMessage('Browser launched successfully', 'success', 'Bankruptcy Script');
    } catch (browserError) {
      safeLogMessage(`Browser launch failed: ${browserError.message}`, 'error', 'Bankruptcy Script');
      throw browserError;
    }

    try {
      const cookies = await login(browser);
      const allCases = await getCaseDataFromDB();
  //    safeLogMessage(`Found ${allCases.length} cases to process`, 'info', 'Bankruptcy Script');
      const documentsDir = '/home/ubuntu/inforuptcy';

      // --- Phase 1: Scrape initial HTML ---
      //safeLogMessage('📄 Starting Phase 1: Scraping initial HTML', 'info', 'Bankruptcy Script');
      let scrapedCount = 0;
      for (const row of allCases) {
        const pdfPath = path.join(documentsDir, `${row.simpleName}.pdf`);
        try {
          await fs.access(pdfPath);
//          safeLogMessage(`PDF already exists for ${row.simpleName}, skipping HTML scrape.`, 'info', 'Bankruptcy Script');
          continue;
        } catch (e) {
          // PDF does not exist, proceed.
        }
        const url = `https://www.inforuptcy.com/ir-documentselect/${row.court}_${row.pacerId}/1.00000`;
        await getPageContent(browser, url, row, cookies);
        scrapedCount++;
        await randomDelay();
      }
      safeLogMessage(`Phase 1 complete: Scraped ${scrapedCount} cases`, 'success', 'Bankruptcy Script');

      // --- Phase 2: Process downloaded HTML ---
      safeLogMessage('📥 Starting Phase 2: Processing and Downloading', 'info', 'Bankruptcy Script');
      const outputDir = 'output';
      const filesToProcess = (await fs.readdir(outputDir)).filter(f => f.endsWith('.html'));
      
      let successCount = 0;
      let rejectedCount = 0;
      let skippedCount = 0;

      for (const file of filesToProcess) {
  //      safeLogMessage(`\nProcessing HTML file: ${file}`, 'info', 'Bankruptcy Script');
        const simpleName = path.basename(file, '.html');

        const pdfPath = path.join(documentsDir, `${simpleName}.pdf`);
        try {
          await fs.access(pdfPath);
     //     safeLogMessage(`PDF already exists for ${simpleName}, skipping processing.`, 'info', 'Bankruptcy Script');
          skippedCount++;
          continue;
        } catch (e) {
          // PDF does not exist, proceed to download.
        }

        const caseData = allCases.find(c => c.simpleName === simpleName);
        if (!caseData) {
          safeLogMessage(`  - WARNING: Could not find case data for ${simpleName} in DB. Skipping.`, 'warning', 'Bankruptcy Script');
          continue;
        }
        const htmlContent = await fs.readFile(path.join(outputDir, file), 'utf-8');
        const $ = cheerio.load(htmlContent);

        if (htmlContent.includes('OpenPDFCombinedDownloadForm')) {
          await handleMultiStepDownload(browser, caseData, cookies);
          successCount++;
        } else {
          const downloadLink = $('#download').attr('href');
          if (downloadLink) {
            await downloadPdf(browser, downloadLink, simpleName, cookies);
            successCount++;
          } else {
      //      safeLogMessage(`Rejecting ${simpleName} (Reason: No download link)`, 'info', 'Bankruptcy Script');
            await updateCaseAsRejected(simpleName);
            rejectedCount++;
          }
        }
        await randomDelay();
      }
      
      // Send summary
      safeLogMessage(`📊 Processing complete! Success: ${successCount}, Rejected: ${rejectedCount}, Skipped: ${skippedCount}`, 'complete', 'Bankruptcy Script');
      
    } catch (error) {
      safeLogMessage(`❌ Fatal error in main process: ${error.message}`, 'error', 'Bankruptcy Script');
      throw error;
    } finally {
      await browser.close();
    }
  } catch (error) {
    safeLogMessage(`💥 Script failed: ${error.message}`, 'error', 'Bankruptcy Script');
    throw error;
  }
}

main().catch(console.error);