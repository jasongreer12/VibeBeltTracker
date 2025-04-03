import { Router, Request, Response } from 'express';
import sql from 'mssql';




// phasing out 





const router = Router();

// shift boundaries (times are in UTC; adjust trueShiftEnd as needed)
const trueShiftStart: string = '12:00:00'; // shift starts at 12:00:00 UTC
const trueShiftEnd: string = '23:00:00';   // shift ends at 23:00:00 UTC

// helper function to get belt intervals for a given date
async function getBeltTotal(date: string, pool: sql.ConnectionPool): Promise<any[]> {
  const result = await pool.request()
    .input('dateToFetch', sql.Date, date)
    .query('SELECT startTime, stopTime FROM beltDetails WHERE recordDate = @dateToFetch');
  return result.recordset;
}

// route to calculate and insert downtime intervals dynamically
router.get('/insertShiftDowntimes', async (req, res): Promise<any> => {
  try {
    const dateToFetch = req.query.date as string;
    if (!dateToFetch) { // shouldnt happen due to requirements to submit but just in case user bypasses them
      return res.status(400).send('Date is required.');
    }

    const pool: sql.ConnectionPool = req.app.locals.db;

    // create shift boundary date objects for the given time. Use default date in database
    const shiftStart = new Date(`1970-01-01T${trueShiftStart}Z`);
    const shiftEnd = new Date(`1970-01-01T${trueShiftEnd}Z`);

    // get belt intervals from the helper function
    const beltIntervals = await getBeltTotal(dateToFetch, pool);

    if (!beltIntervals || beltIntervals.length === 0) {
      return res.status(400).send('No belt intervals found for this date.');
    }

    // convert and sort intervals by start time
    const intervals = beltIntervals.map(record => {
      return {
        start: new Date(record.startTime),
        stop: new Date(record.stopTime)
      };
    }).sort((a, b) => a.start.getTime() - b.start.getTime());

    // array to hold downtime intervals (each with start and end as date, and duration in minutes)
    const downtimeRecords: { downtimeStart: Date; downtimeEnd: Date; downtimeMinutes: number }[] = [];

    // calculate downtime before first belt interval if any
    if (intervals[0].start > shiftStart) {
      const downtimeStart = shiftStart;
      const downtimeEnd = intervals[0].start;
      const downtimeMinutes = Math.floor((downtimeEnd.getTime() - downtimeStart.getTime()) / 60000);
      downtimeRecords.push({ downtimeStart, downtimeEnd, downtimeMinutes });
    }

    // calculate downtime between consecutive intervals
    for (let i = 0; i < intervals.length - 1; i++) {
      // if theres a gap between the current stop and the next start, thats downtime
      if (intervals[i + 1].start > intervals[i].stop) {
        const downtimeStart = intervals[i].stop;
        const downtimeEnd = intervals[i + 1].start;
        const downtimeMinutes = Math.floor((downtimeEnd.getTime() - downtimeStart.getTime()) / 60000);
        downtimeRecords.push({ downtimeStart, downtimeEnd, downtimeMinutes });
      }
    }

    // calculate downtime after last belt interval if any
    if (intervals[intervals.length - 1].stop < shiftEnd) {
      const downtimeStart = intervals[intervals.length - 1].stop;
      const downtimeEnd = shiftEnd;
      const downtimeMinutes = Math.floor((downtimeEnd.getTime() - downtimeStart.getTime()) / 60000);
      downtimeRecords.push({ downtimeStart, downtimeEnd, downtimeMinutes });
    }

    // insert each downtime record into the opdetails table
    // for (const record of downtimeRecords) { // need to fix recordID and get code from user
    //   const insertQuery = `
    //     INSERT INTO OpDetails (recordID, code, startingDowntime, endingDowntime, downtimeMinutes, day) 
    //     VALUES (null, null, @downtimeStart, @downtimeEnd, @downtimeMinutes, @dateToFetch)
    //   `;
    //   await pool.request()
    //     .input('downtimeStart', sql.Time, record.downtimeStart)
    //     .input('downtimeEnd', sql.Time, record.downtimeEnd)
    //     .input('downtimeMinutes', sql.Int, record.downtimeMinutes)
    //     .input('dateToFetch', sql.Date, dateToFetch)
    //     .query(insertQuery);
    // }

    // // print inserted downtime records to console
    // console.log('Inserted Downtime Records:', downtimeRecords);

    // res.send(`Inserted ${downtimeRecords.length} downtime record(s). Check server logs for details.`);



    // insert each downtime record into the opdetails table if it has not already been inserted
    // this query will only insert a record if a matching record doesn't exist
    const conditionalInsertQuery = `
      IF NOT EXISTS (
        SELECT 1 FROM OpDetails 
        WHERE startingDowntime = @downtimeStart 
          AND endingDowntime = @downtimeEnd 
          AND downtimeMinutes = @downtimeMinutes 
          AND day = @dateToFetch
      )
      BEGIN
        INSERT INTO OpDetails (recordID, code, startingDowntime, endingDowntime, downtimeMinutes, day)
        VALUES (NULL, NULL, @downtimeStart, @downtimeEnd, @downtimeMinutes, @dateToFetch)
      END
    `;

    // use Promise.all to insert all records asynchronously
    await Promise.all(
      downtimeRecords.map(record =>
        pool.request()
          .input('downtimeStart', sql.Time, record.downtimeStart)
          .input('downtimeEnd', sql.Time, record.downtimeEnd)
          .input('downtimeMinutes', sql.Int, record.downtimeMinutes)
          .input('dateToFetch', sql.Date, dateToFetch)
          .query(conditionalInsertQuery)
      )
    );

    console.log('Inserted Downtime Records:', downtimeRecords);
    res.send(`Inserted ${downtimeRecords.length} downtime record(s). Check server logs for details.`);
  } catch (error) {
    console.error('Error calculating/inserting downtime:', error);
    res.status(500).send('Failed to process downtime.');
  }
});

export default router;
