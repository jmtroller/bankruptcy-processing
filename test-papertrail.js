#!/usr/bin/env node

// Test script for Papertrail logging configuration
const { testConnection, logMessage } = require('./papertrail-logger.js');

async function runTest() {
  console.log('🔧 Testing Papertrail Configuration for Bankruptcy Processing Script\n');
  
  // Test the connection
  const connectionTest = await testConnection();
  
  if (connectionTest) {
    console.log('\n📤 Sending additional test messages...');
    
    // Send test messages with different log levels
    await logMessage('Test info message', 'info', 'Test Script');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await logMessage('Test success message', 'success', 'Test Script');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await logMessage('Test warning message', 'warning', 'Test Script');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await logMessage('Test error message', 'error', 'Test Script');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await logMessage('Test start message', 'start', 'Test Script');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await logMessage('Test complete message', 'complete', 'Test Script');
    
    console.log('\n✅ All test messages sent!');
    console.log('Check your Papertrail dashboard at https://papertrailapp.com/ to see the messages.');
  } else {
    console.log('\n❌ Configuration test failed. Please check your environment variables and network connection.');
  }
}

runTest().catch(console.error);