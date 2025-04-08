import { Router, Request, Response } from 'express';
import sql from 'mssql';

const router = Router();

const trueShiftStart: string = '12:00:00'; // times in UTC. Equivalent to 06:00 AM in GMT-5
const trueShiftEnd: string = '23:00:00'; // times in UTC. Equivalent to 05:00 PM in GMT-5
const totalShiftHours: number = 11;

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
                record.truePlantAvailability = ((record.plantUp / 60) / totalShiftHours) * 100; // convert to hours and divide my shift total
                console.log('Tons:', record.tons);
                console.log('Downtime:', record.downtime);
                console.log('Plant Up:', record.plantUp);

                const scheduledPlantUp: number = await calculatePlantAvailability(dateToFetch, pool);
                if (scheduledPlantUp != -1) {
                    record.plantAvailability = ((record.plantUp / 60) / (scheduledPlantUp / 60)) * 100;
                } else {
                    record.plantAvailability = -1;
                }

                res.json(record); // Send the record as JSON response
            } else {
                console.log('No records found for the given date.');
                res.json("EMPTY");
                //res.status(404).json({ message: 'No data available for the selected date.' });
            }
    } catch (error) {
        console.error('Error fetching metrics: ', error);
        res.status(500).json({ error: 'Failed to fetch metrics.' });
    }
});


async function calculatePlantAvailability(date: string, pool: sql.ConnectionPool): Promise<number> {
    // scheduledPlantUp = shiftDuration - plannedDowntime
    const result = await pool.request()
        .input('date', sql.Date, date)
        .query('SELECT code, downtimeMinutes FROM OpDetails WHERE day = @date')
    let totalShiftMinutes: number = 660;
    // if code = 100-199 then subtract its downtimeMinutes from the total time it was supposed to be running
    const recordLength = result.recordset.length;
    for (let i: number = 0; i < recordLength; i++) {
        const record = result.recordset[i];
        if (record.code >= 100 && record.code <= 199) {
            totalShiftMinutes -= record.downtimeMinutes;
        }
        else if (record.code === null) {
            console.log('record code when it should be null = ', record.code);
            return -1;
        }
    }
    return totalShiftMinutes;
}


export default router;