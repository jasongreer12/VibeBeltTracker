import { Router, Request, Response } from 'express';
import sql from 'mssql';

const router = Router();

router.get('/getTodayDowntime', async (req, res) => { 
    try {
        const dateToFetch = req.query.date as string;
        //console.log(dateToFetch);
        const pool: sql.ConnectionPool = req.app.locals.db;
        const result = await pool.request()
            .input('dateToFetch', sql.Date, dateToFetch)
            .query('SELECT * FROM BeltDetails WHERE recordDate = @dateToFetch');
    
        res.json(result.recordset);
      } catch (error) {
        console.error('Error fetching todays results: ', error);
        res.status(500).json({ error: 'Failed to fetch records.'});
      }
    });

export default router;