// SolarWinds Loggly (Papertrail) Logging Module
const https = require('https');
const os = require('os');

// Load environment variables
require('dotenv').config();

// Get SolarWinds Loggly configuration from environment variables
const LOGGLY_URL = process.env.LOGGLY_URL || 'https://logs.collector.solarwinds.com/inputs';
const LOGGLY_TOKEN = process.env.LOGGLY_TOKEN || 'HmUT6X37EweViNzYsDdP36oq5lrt';

// Syslog priority levels for different log types
const SYSLOG_PRIORITIES = {
  info: 14,      // local use 1, info
  success: 13,   // local use 1, notice  
  warning: 12,   // local use 1, warning
  error: 11,     // local use 1, error
  start: 14,     // local use 1, info
  complete: 13   // local use 1, notice
};

// Enhanced logging function that sends to both console and Papertrail
async function logMessage(message, level = 'info', scriptName = 'Script') {
  const emoji = {
    info: '📋',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    start: '🚀',
    complete: '🎉'
  };
  
  // Log to console with emoji
  console.log(`[${new Date().toISOString()}] ${emoji[level] || '➡️'} ${message}`);
  
  // Send to SolarWinds Loggly if configuration is available
  if (LOGGLY_URL && LOGGLY_TOKEN) {
    try {
      // Pass the raw message to Loggly, without the emoji
      const success = await sendPapertrailMessage(message, level, scriptName);
      if (!success) {
        console.warn('Loggly logging failed - check configuration and network connection');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error sending Loggly message:', error.message);
      return false;
    }
  } else {
    console.log('LOGGLY_URL or LOGGLY_TOKEN not configured - skipping Loggly logging');
    return false;
  }
}

// Function to send messages to SolarWinds Loggly
async function sendPapertrailMessage(message, level = 'info', scriptName = 'Script') {
  const timestamp = new Date().toISOString();
  const hostname = os.hostname();
  
  // Create JSON log entry for Loggly
  const logEntry = {
    timestamp: timestamp,
    hostname: hostname,
    level: level,
    script: scriptName,
    message: message
  };
  
  const postData = JSON.stringify(logEntry);
  const url = new URL(LOGGLY_URL);
  
  // Include token in the path for SolarWinds Loggly inputs endpoint
  const pathWithToken = `${url.pathname}/${LOGGLY_TOKEN}`;
  
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: pathWithToken,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          console.error(`Loggly API error: ${res.statusCode} - ${responseData}`);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Loggly request error:', error.message);
      resolve(false);
    });

    req.setTimeout(10000, () => {
      console.error('Loggly request timeout');
      req.destroy();
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

// Test function to verify SolarWinds Loggly configuration
async function testConnection() {
  console.log('\n🧪 Testing SolarWinds Loggly Configuration\n');
  
  if (!LOGGLY_URL || !LOGGLY_TOKEN) {
    console.error('❌ LOGGLY_URL or LOGGLY_TOKEN environment variables are not configured');
    console.log('Please set:');
    console.log('LOGGLY_URL=https://logs.collector.solarwinds.com/inputs');
    console.log('LOGGLY_TOKEN=your_token_here');
    return false;
  }
  
  console.log('✓ LOGGLY_URL is configured:', LOGGLY_URL);
  console.log('✓ LOGGLY_TOKEN is configured:', LOGGLY_TOKEN.substring(0, 8) + '...');
  
  // Test connection
  console.log('\n🚀 Testing connection to SolarWinds Loggly...');
  
  try {
    const success = await sendPapertrailMessage('Test message from bankruptcy processing script', 'info', 'Loggly Test');
    if (success) {
      console.log('✅ SUCCESS: Test message sent successfully!');
      console.log('Check your SolarWinds Loggly dashboard for the test message.');
      return true;
    } else {
      console.log('❌ FAILED: Test message was not sent successfully');
      return false;
    }
  } catch (error) {
    console.error('❌ ERROR sending test message:', error.message);
    return false;
  }
}

module.exports = {
  logMessage,
  sendPapertrailMessage,
  testConnection
};