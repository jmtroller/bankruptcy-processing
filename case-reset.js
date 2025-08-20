// Load required modules
const path = require('path');
const { createDbConnection } = require('./db-connection.js');
const { logMessage } = require('./google-spaces-messenger.js');
const https = require('https');
const { URL } = require('url');

/**
 * Sets flagEmail = 1 for recent cases based on filing date.
 * - For Tue-Fri, it includes cases from the previous day.
 * - For Sat, Sun, and Mon, it includes cases from the prior Friday.
 */
async function resetCaseFlags() {
  let connection;
  try {
    await logMessage('🚀 Starting case flags reset process', 'start', 'Case Reset Script');
    
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

    let daysToSubtract = 1;
    if (dayOfWeek === 0) { // Sunday
      daysToSubtract = 2;
    } else if (dayOfWeek === 1) { // Monday
      daysToSubtract = 3;
    }

    const targetDate = new Date();
    targetDate.setDate(today.getDate() - daysToSubtract);

    // Format to YYYY-MM-DD for the SQL query
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;

    connection = await createDbConnection();
    await logMessage('📊 Database connection established', 'info', 'Case Reset Script');

    await logMessage(`🔄 Resetting flagEmail = 1 for cases filed on or after ${formattedDate}...`, 'info', 'Case Reset Script');

    const queryClear = 'UPDATE vw_case_info SET flagEmail = 0 WHERE flagEmail = 1';
    const [resultClear] = await connection.execute(queryClear);
    await logMessage(`✅ Cleared ${resultClear.affectedRows} previously flagged cases`, 'info', 'Case Reset Script');

    const query = 'UPDATE vw_case_info SET flagEmail = 1 WHERE DATE(dateFiled) >= ?';
    const [result] = await connection.execute(query, [formattedDate]);

    await logMessage(`🎯 Case reset complete! ${result.affectedRows} cases flagged for processing`, 'success', 'Case Reset Script');
  } catch (error) {
    await logMessage(`❌ Failed to reset case flags: ${error.message}`, 'error', 'Case Reset Script');
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      await logMessage('📊 Database connection closed', 'info', 'Case Reset Script');
    }
  }
}

// If the script is run directly, execute the reset function.
if (require.main === module) {
  console.log('Running case-reset script directly...');
  resetCaseFlags().catch(error => {
    console.error('An error occurred while running the standalone reset script:', error);
    process.exit(1);
  });
}

module.exports = { resetCaseFlags }; 