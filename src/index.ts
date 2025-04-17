import express, { Application, Request, Response } from 'express';
import sql from 'mssql';
import dbConfig from './config/dbConfig';
import getTodayDowntime from './routes/getDowntime';
import getMetrics from './routes/getMetrics';
import updateOpDetail from './routes/updateOpDetail';

const app: Application = express();
app.use(express.json());


app.use(express.static("public"));
// connect to SQL database
sql.connect(dbConfig)
  .then((pool) => {
    console.log('Connected to Microsoft SQL Server');
    app.locals.db = pool;
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
  });


app.get('/api/beltdetails', async (req: Request, res: Response) => {
  try {
    const pool = app.locals.db;
    const result = await pool.request().query('SELECT * FROM BeltDetails');

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching results from records: ', error);
    res.status(500).json({ error: 'Failed to fetch records.'});
  }
});

app.use('/api', getTodayDowntime);
app.use('/api', getMetrics);
app.use('/api', updateOpDetail);

// start server
app.listen(3000, () => {
  console.log(`Server running on port port: 3000`);
});



