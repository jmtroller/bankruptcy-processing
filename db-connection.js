const mysql = require('mysql2/promise');

/**
 * Creates a new database connection.
 * Using hardcoded credentials to avoid environment variable loading issues
 * when running through PHP exec().
 * @returns {Promise<mysql.Connection>}
 */
function createDbConnection() {
  // Hardcoded credentials to avoid env variable issues with PHP exec
  const dbConfig = {
    host: '10.0.0.51',
    user: 'NodeUser',
    password: 'r3dxHQUg4yyy',
    database: 'TrollerBkDB',
  };
  
  console.log(`Attempting to connect to database at ${dbConfig.host} as ${dbConfig.user}`);
  
  return mysql.createConnection(dbConfig);
}

module.exports = { createDbConnection }; 