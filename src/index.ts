import express, { Application } from 'express';
import sql from 'mssql';
import dbConfig from './config/dbConfig';

const app: Application = express();
app.use(express.json());

// connect to SQL database
sql.connect(dbConfig)
  .then((pool) => {
    console.log('Connected to Microsoft SQL Server');
    // Optionally attach the connection pool to app.locals
    app.locals.db = pool;
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
  });

// start server
app.listen(3000, () => {
  console.log(`Server running on port port: 3000`);
});

app.get('/', (req, res) => {
    res.send('Hello from the Belt Scale App!');
  });