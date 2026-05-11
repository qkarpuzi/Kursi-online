const sql = require('mssql/msnodesqlv8');
require('dotenv').config();

const config = {
    connectionString: `Server=${process.env.DB_SERVER};Database=${process.env.DB_NAME};Trusted_Connection=Yes;Driver={SQL Server Native Client 11.0};`
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('Connected to SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('Ka deshtuar lidhja me SQL: ', err);
        process.exit(1);
    });

module.exports = { sql, poolPromise };