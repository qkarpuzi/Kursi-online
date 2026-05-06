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

const poolPromise = new sql.ConnectionPool(config)
.connect()
.then(pool => {
    console.log("Jemi lidhur me SQL Server");
    return pool;
})
.catch(err => {
    console.error("Ka deshtuar lidhja me SQL: ", err );
    process.exit(1);
});
module.exports = {sql, poolPromise};