import { Router, Request, Response } from 'express';
import sql from 'mssql';

const router = Router();

router.post('/insertDowntime', async (req: Request, res: Response) => { 
    try {
        const { startTime, endTime, downtimeCode, tonsMoved, recordDate } = req.body;

        const pool: sql.ConnectionPool = req.app.locals.db;
        const queryString = await pool.request()
            .input('startTime', sql.Time, startTime)
            .input('endTime', sql.Time, endTime)
            .input('tonsMoved', sql.Int, tonsMoved)
            .query(`
                INSERT INTO BeltDetails (beltID, shiftID, startTime, endTime, downtimeCode, tons, recordDate)
                VALUES (1000, 1, @startTime, @endTime, @tonsMoved, @recordDate)
            `);

        res.status(201).json({ message: "Downtime record inserted successfully." });
      } catch (error) {
        console.error('Error submitting results: ', error);
      }
    });

export default router;