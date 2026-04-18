require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
  console.log('Connecting to', process.env.CORP_DB_HOST);
  const connection = await mysql.createConnection({
    host: process.env.CORP_DB_HOST,
    port: process.env.CORP_DB_PORT || 3306,
    user: process.env.CORP_DB_USER,
    password: process.env.CORP_DB_PASS,
    database: process.env.CORP_DB_NAME
  });

  console.log('Connected. Pinging...');
  await connection.ping();
  console.log('Ping successful. Querying tblPersonas limit 1...');
  
  try {
    const [rows] = await connection.execute('SELECT * FROM tblPersonas LIMIT 1');
    console.log('Rows:', rows.length);
  } catch (e) {
    console.error('Query error:', e.message);
  }

  await connection.end();
}

test().catch(console.error);
