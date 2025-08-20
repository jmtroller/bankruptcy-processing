async function getInsolvencyNamesAndNumbers() {
    // List of alternative endpoints to try
    const endpoints = [
      {
        url: 'https://www.thegazette.co.uk/insolvency/notice/data.feed?noticetypes=2433&results-page=1&results-page-size=100',
        description: 'Insolvency notices with noticetypes parameter'
      },
      {
        url: 'https://www.thegazette.co.uk/all-notices/notice/data.feed?categorycode=11&results-page-size=100&sort-by=newest',
        description: 'Original all-notices endpoint'
      },
      {
        url: 'https://www.thegazette.co.uk/all-notices/notice/data.feed?results-page=1&results-page-size=50',
        description: 'Basic all-notices endpoint'
      }
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`Trying ${endpoint.description}...`);
        const response = await fetch(endpoint.url, {
          headers: { Accept: 'application/json' }
        });

        console.log(`Response status: ${response.status}`);
        
        if (!response.ok) {
          console.log(`HTTP error! Status: ${response.status}`);
          continue;
        }

        const data = await response.json();
        console.log('Response data:', JSON.stringify(data, null, 2));

        // Check if we got an error response
        if (data.status === "500") {
          console.log('API returned 500 error status');
          continue;
        }

        // Check if we have valid data structure
        if (!data.entry || !Array.isArray(data.entry)) {
          console.log('No valid entry array found in response');
          continue;
        }

        const results = data.entry.map(notice => {
          const content = notice.content?.notice || {};
          return {
            name: content['company-name'] || content['person-name'] || 'Unknown',
            companyNumber: content['company-number'] || null,
            noticeType: notice.type || 'Unknown',
            publishDate: notice.published || null
          };
        });

        const filteredResults = results.filter(item => item.name !== 'Unknown');
        console.log(`Successfully fetched ${filteredResults.length} records:`);
        console.log(filteredResults);
        return filteredResults;

      } catch (error) {
        console.error(`Error with ${endpoint.description}:`, error.message);
        continue;
      }
    }

    console.error('❌ All API endpoints failed. The Gazette API appears to be experiencing server-side issues.');
    console.log('\n🔍 Alternative approaches you could try:');
    console.log('1. Check the Gazette website directly: https://www.thegazette.co.uk/insolvency');
    console.log('2. Try again later as this appears to be a temporary API issue');
    console.log('3. Consider using alternative data sources like Companies House API');
    console.log('4. Set up monitoring to check when the API is back online');
    
    return [];
  }
  
  getInsolvencyNamesAndNumbers();