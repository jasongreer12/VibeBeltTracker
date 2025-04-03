import { Router, Request, Response } from 'express';
import sql from 'mssql';

const router = Router();

const trueShiftStart: string = '12:00:00'; // times in UTC. Equivalent to 06:00 AM in GMT-5
const trueShiftEnd: string = '23:00:00'; // times in UTC. Equivalent to 05:00 PM in GMT-5

router.get('/getMetrics', async (req, res) => {
    try {
        const dateToFetch = req.query.date as string;
        //console.log(dateToFetch);
        const pool: sql.ConnectionPool = req.app.locals.db;
        const result = await pool.request()
            .input('dateToFetch', sql.Date, dateToFetch)
            .query('SELECT * FROM OpRecord WHERE day = @dateToFetch');
            console.log(result.recordset.length);
            if (result.recordset.length > 0) {
                const record = result.recordset[0]; // Access the first row
                record.truePlantAvailability = ((record.plantUp / 60) / 11) * 100;
                console.log('Tons:', record.tons);
                console.log('Downtime:', record.downtime);
                console.log('Plant Up:', record.plantUp);
    
                res.json(record); // Send the record as JSON response
            } else {
                console.log('No records found for the given date.');
                res.json("EMPTY");
                //res.status(404).json({ message: 'No data available for the selected date.' });
            }

        //     if (recordset.length !== 0) {
        //       res.json(recordset);
        //       return;
        //     } else if (recordset.length === 0 || !result.recordset) { 

        //     }
    } catch (error) {
        console.error('Error fetching metrics: ', error);
        res.status(500).json({ error: 'Failed to fetch metrics.' });
    }
});


export default router;