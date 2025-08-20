// Google Spaces Messaging Module
const https = require('https');
const { URL } = require('url');

// Google Spaces webhook URL - update this with your actual webhook URL
const GOOGLE_SPACES_WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/AAQAsMjh6b4/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=FMaN4PWbwZwSHBOMUqVJnHo_boRwenqkLb6uK1FKicQ';

// Enhanced logging function that sends to both console and Google Spaces
async function logMessage(message, level = 'info', scriptName = 'Script') {
  // Always log to console
  console.log(`[${new Date().toISOString()}] ${message}`);
  
  // Send to Google Spaces if webhook URL is configured
  if (GOOGLE_SPACES_WEBHOOK_URL) {
    try {
      const success = await sendGoogleSpacesMessage(message, level, scriptName);
      if (!success) {
        console.warn('Google Spaces notification failed - check webhook URL and network connection');
      }
    } catch (error) {
      console.error('Error sending Google Spaces message:', error.message);
    }
  } else {
    console.log('GOOGLE_SPACES_WEBHOOK_URL not configured - skipping Google Spaces notification');
  }
}

// Function to send messages to Google Spaces
async function sendGoogleSpacesMessage(message, level = 'info', scriptName = 'Script') {
  const emoji = {
    info: '📋',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    start: '🚀',
    complete: '🎉'
  };

  const timestamp = new Date().toISOString();
  const formattedMessage = `${emoji[level]} **${scriptName}** [${timestamp}]\n${message}`;

  const payload = {
    text: formattedMessage
  };

  return new Promise((resolve, reject) => {
    try {
      const url = new URL(GOOGLE_SPACES_WEBHOOK_URL);
      const postData = JSON.stringify(payload);
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            console.error(`Google Spaces API error: ${res.statusCode} - ${data}`);
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        console.error('Google Spaces request error:', error.message);
        reject(error);
      });

      req.write(postData);
      req.end();
    } catch (error) {
      console.error('Error preparing Google Spaces request:', error.message);
      reject(error);
    }
  });
}

// Test function to verify webhook configuration
async function testWebhook() {
  console.log('\n🧪 Testing Google Spaces Webhook Configuration\n');
  
  if (!GOOGLE_SPACES_WEBHOOK_URL) {
    console.error('❌ GOOGLE_SPACES_WEBHOOK_URL is not configured in this module');
    return false;
  }
  
  console.log('✓ GOOGLE_SPACES_WEBHOOK_URL is configured');
  console.log('📝 Webhook URL:', GOOGLE_SPACES_WEBHOOK_URL.substring(0, 50) + '...');
  
  // Test URL parsing
  try {
    const url = new URL(GOOGLE_SPACES_WEBHOOK_URL);
    console.log('✓ Webhook URL is valid');
    console.log('📡 Host:', url.hostname);
    
    // Verify it's a Google Spaces webhook URL
    if (!url.hostname.includes('googleapis.com')) {
      console.warn('⚠️ Warning: This doesn\'t look like a Google Spaces webhook URL');
      console.log('Google Spaces webhook URLs typically contain "googleapis.com"');
    }
    
    if (!url.pathname.includes('/spaces/')) {
      console.warn('⚠️ Warning: This doesn\'t look like a Google Spaces webhook URL');
      console.log('Google Spaces webhook URLs typically contain "/spaces/"');
    }
  } catch (error) {
    console.error('❌ Invalid webhook URL format:', error.message);
    return false;
  }
  
  // Test sending a message
  const testMessage = 'Test message from bankruptcy processing script';
  console.log('\n🚀 Sending test message to Google Spaces...');
  
  try {
    const success = await sendGoogleSpacesMessage(testMessage, 'info', 'Webhook Test');
    if (success) {
      console.log('✅ SUCCESS: Test message sent successfully!');
      console.log('Check your Google Space for the test message.');
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
  sendGoogleSpacesMessage,
  testWebhook
}; 