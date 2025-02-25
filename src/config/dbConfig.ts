import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const dbConfig: sql.config = {
    user: process.env.DBUSER!, // assert non null values
    password: process.env.DBPASS!,
    server: process.env.DBSERVER!,
    port: 1433!,
    database: process.env.DBNAME!,
    options: {
        trustServerCertificate: true,
        encrypt: true,
    }
};

export default dbConfig;
