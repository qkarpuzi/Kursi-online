const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
    encrypt: false,
    trustServerCertificate: true,
    trustedConnection: true   // Pa keta nuk mundem me pas sql server me windows auth
    }
};