import { Router, Request, Response } from 'express';
import sql from 'mssql';

const router = Router();

const trueShiftStart: string = '12:00:00'; // times in UTC. Equivalent to 06:00 AM in GMT-5
const trueShiftEnd: string = '23:00:00'; // times in UTC. Equivalent to 05:00 PM in GMT-5

router.get('/updateOpDetail', async (req, res) => {
    try {
        const code = req.query.code as string;

        if (!/^\d+$/.test(code)) { // regex check to ensure code passed is numbers only
            res.status(400).json({ error: 'Invalid code: must be a number' });
        }

        const detailID = req.query.detailID as string;
        //console.log(dateToFetch);
        const pool: sql.ConnectionPool = req.app.locals.db;
        const result = await pool.request()
            .input('detailID', sql.Int, detailID)
            .query('SELECT * FROM OpDetails WHERE detailID = @detailID');

        if (result.recordset.length > 0) {
            const insertResult = await pool.request()
                .input('detailID', sql.Int, detailID)
                .input('code', sql.Int, code)
                .query('UPDATE OpDetails SET code = @code WHERE detailID = @detailID;');
            res.json("Success");
        } else {
            console.log('No records found for the given date.');
            //res.status(404).json({ message: 'No data available for the selected date.' });
        }
    } catch (error) {
        console.error('Error updating code: ', error);
        res.json("Fail");
        res.status(500).json({ error: 'Error updating code for Details.' });
    }
});


export default router;