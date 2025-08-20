// Google Spaces webhook test script
const { testWebhook } = require('./google-spaces-messenger.js');

// Run the test
if (require.main === module) {
  testWebhook().then(success => {
    console.log('\n' + '='.repeat(50));
    if (success) {
      console.log('🎉 Google Spaces webhook test completed successfully!');
      console.log('Your scripts should now send notifications to Google Spaces.');
      process.exit(0);
    } else {
      console.log('💥 Google Spaces webhook test failed.');
      console.log('Please check your webhook URL and network connection.');
      process.exit(1);
    }
  }).catch(error => {
    console.error('💥 Test script error:', error.message);
    process.exit(1);
  });
} 