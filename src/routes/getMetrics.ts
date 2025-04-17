import { Router, Request, Response } from 'express';
import sql from 'mssql';
import moment from 'moment';

const router = Router();

const totalShiftHours = 11;    // each shift is 11 hours

// fetch a single day OpRecord row
async function fetchOrCreateMetricsForDate(
    date: string,
    pool: sql.ConnectionPool
): Promise<{
    tons: number;
    downtime: number;
    plantUp: number;
    scheduledPlantUp: number;
}> {
    // ensure OpDetails & OpRecord are up to date

    // fetch the OpRecord row
    const recRes = await pool.request()
        .input('day', sql.Date, date)
        .query<{ tons: number; downtime: number; plantUp: number }>(
            `SELECT tons, downtime, plantUp 
         FROM OpRecord 
        WHERE day = @day`
        );
    if (!recRes.recordset.length) {
        // no record found even after creation: treat as zeros
        return { tons: 0, downtime: 0, plantUp: 0, scheduledPlantUp: 0 };
    }
    const { tons, downtime, plantUp } = recRes.recordset[0];

    // calculate scheduledPlantUp from OpDetails codes
    let scheduledPlantUp = totalShiftHours * 60; // in minutes
    const dtRes = await pool.request()
        .input('day', sql.Date, date)
        .query<{ code: number | null; downtimeMinutes: number }>(
            `SELECT code, downtimeMinutes 
         FROM OpDetails 
        WHERE day = @day`
        );
    for (const r of dtRes.recordset) {
        if (r.code === null) {
            // unknown downtime > invalidate availability
            scheduledPlantUp = 0;
            break;
        }
        if (r.code >= 100 && r.code < 200) {
            scheduledPlantUp -= r.downtimeMinutes;
        }
    }

    return { tons, downtime, plantUp, scheduledPlantUp };
}

router.get('/getMetrics', async (req: Request, res: Response): Promise<void> => {
    try {
        const param = req.query.date as string;
        if (!param) { 
            return;// res.status(400).send('Date is required.');
        }
        const pool = req.app.locals.db as sql.ConnectionPool;

        // Build array of ISO dates
        const days: string[] = [];
        if (param.includes(' - ')) {
            const [start, end] = param.split(' - ');
            let cur = moment(start, 'MM/DD/YYYY').startOf('day');
            const last = moment(end, 'MM/DD/YYYY').startOf('day');
            while (cur.isSameOrBefore(last)) {
                days.push(cur.format('YYYY-MM-DD'));
                cur.add(1, 'day');
            }
        } else {
            days.push(param);
        }

        // Fetch metrics for each day in parallel
        const perDay = await Promise.all(
            days.map(d => fetchOrCreateMetricsForDate(d, pool))
        );

        // Aggregate
        const totalTons = perDay.reduce((sum, d) => sum + d.tons, 0);
        const totalDowntime = perDay.reduce((sum, d) => sum + d.downtime, 0);
        const totalPlantUp = perDay.reduce((sum, d) => sum + d.plantUp, 0);
        const totalSchedUp = perDay.reduce((sum, d) => sum + d.scheduledPlantUp, 0);

        // Compute combined availability metrics
        const truePlantAvailability =
            (totalPlantUp / 60) / (totalShiftHours * days.length) * 100;

        const plantAvailability = totalSchedUp > 0
            ? (totalPlantUp / 60) / (totalSchedUp / 60) * 100
            : -1;

        res.json({
            days: days.length,
            totalTons,
            totalDowntime,
            totalPlantUp,
            truePlantAvailability,
            plantAvailability
        });
    } catch (err) {
        console.error('Error fetching metrics:', err);
        res.status(500).json({ error: 'Failed to fetch metrics.' });
    }
});

export default router;
