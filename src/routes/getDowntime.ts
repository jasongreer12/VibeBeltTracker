import { Router, Request, Response } from 'express';
import sql from 'mssql';

const router = Router();

const trueShiftStart: string = '12:00:00'; // times in UTC. Equivalent to 06:00 AM in GMT-5
const trueShiftEnd: string = '23:00:00'; // times in UTC. Equivalent to 05:00 PM in GMT-5

// need to get total shift time from beltdetails to see how long belt didn't run relative to true shift times. Then need to get downtime reasons from users if there are any in seperate file. 
interface OpDetailsRecord {
  detailID: number;
  recordID: number | null;
  code: number | null;
  startingDowntime: Date;
  endingDowntime: Date;
  downtimeMinutes: number;
  day: Date;
}

router.get('/getTodayDowntime', async (req, res) => {
  try {
    const dateToFetch = req.query.date as string;
    //console.log(dateToFetch);
    const pool: sql.ConnectionPool = req.app.locals.db;
    const result = await pool.request()
      .input('dateToFetch', sql.Date, dateToFetch)
      .query<OpDetailsRecord>('SELECT * FROM OpDetails WHERE day = @dateToFetch ORDER BY endingDowntime');

    const recordset = result.recordset;
    //console.log(recordset.length);
    //console.log(recordset);
    //console.log(dateToFetch);



    if (recordset.length !== 0) {
      createOpRecord(dateToFetch, pool);
      res.json(recordset);
      return;
    } else if (recordset.length === 0 || !result.recordset) { // if there are no records for today, check if belt records exist, if they do run insertDowntime, else return
      // Insert downtime records only if they don't already exist
      await insertShiftDowntimes(dateToFetch, pool);
      //console.log("Inserting shift downtime function in getdowntime");
      // fetch the records after insertion
      const newResult = await pool.request()
        .input('dateToFetch', sql.Date, dateToFetch)
        .query('SELECT * FROM OpDetails WHERE day = @dateToFetch ORDER BY endingDowntime');
      //console.log(newResult.recordset.length + " new result record set in getdowntime line 48.");
      if (newResult.recordset.length === 0) {
        res.json("EMPTY");
      }
      else {
        res.json(newResult.recordset);
      }
    }
  } catch (error) {
    console.error('Error fetching todays results: ', error);
    res.status(500).json({ error: 'Failed to fetch records.' });
  }
});


// function to get total time belt was ran for given day
async function getBeltTotal(date: string, pool: sql.ConnectionPool): Promise<any[]> {
  try {
    const result = await pool.request()
      .input('dateToFetch', sql.Date, date)
      .query('SELECT startTime, stopTime FROM beltDetails WHERE recordDate = @dateToFetch');
    //console.log(result.recordset);
    return result.recordset;
  } catch (error) {
    console.error('Error in getBeltTotal:', error);
    throw error; // Let the calling function handle the error
  }
}

// function to calculate and insert downtime intervals
async function insertShiftDowntimes(dateToFetch: string, pool: sql.ConnectionPool): Promise<void> {
  const shiftStart = new Date(`1970-01-01T${trueShiftStart}Z`);
  const shiftEnd = new Date(`1970-01-01T${trueShiftEnd}Z`);

  const beltResult = await pool.request()
    .input('dateToFetch', sql.Date, dateToFetch)
    .query('SELECT startTime, stopTime FROM beltDetails WHERE recordDate = @dateToFetch');

  const beltIntervals = beltResult.recordset;
  if (!beltIntervals || beltIntervals.length === 0) {
    return;
  }

  const intervals = beltIntervals.map(record => ({
    start: new Date(record.startTime),
    stop: new Date(record.stopTime)
  })).sort((a, b) => a.start.getTime() - b.start.getTime());

  const downtimeRecords: { downtimeStart: Date; downtimeEnd: Date; downtimeMinutes: number }[] = [];

  if (intervals[0].start > shiftStart) {
    downtimeRecords.push({
      downtimeStart: shiftStart,
      downtimeEnd: intervals[0].start,
      downtimeMinutes: Math.floor((intervals[0].start.getTime() - shiftStart.getTime()) / 60000)
    });
  }
  for (let i = 0; i < intervals.length - 1; i++) {
    if (intervals[i + 1].start > intervals[i].stop) {
      downtimeRecords.push({
        downtimeStart: intervals[i].stop,
        downtimeEnd: intervals[i + 1].start,
        downtimeMinutes: Math.floor((intervals[i + 1].start.getTime() - intervals[i].stop.getTime()) / 60000)
      });
    }
  }
  if (intervals[intervals.length - 1].stop < shiftEnd) {
    downtimeRecords.push({
      downtimeStart: intervals[intervals.length - 1].stop,
      downtimeEnd: shiftEnd,
      downtimeMinutes: Math.floor((shiftEnd.getTime() - intervals[intervals.length - 1].stop.getTime()) / 60000)
    });
  }

  // check if record already exists, if it doesn't insert new one
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
  try {
    await Promise.all(
      downtimeRecords.map(record =>
        pool.request()
          .input('downtimeStart', sql.Time, record.downtimeStart)
          .input('downtimeEnd', sql.Time, record.downtimeEnd)
          .input('downtimeMinutes', sql.Int, record.downtimeMinutes)
          .input('dateToFetch', sql.Date, dateToFetch)
          .query(conditionalInsertQuery)
          .then(result => {
            console.log('Conditional query resolved for record:', record);
          })
      )
    );
  }
  catch (error) {
    console.log('query made error');
  }

  // create oprecord here
  createOpRecord(dateToFetch, pool);
  //console.log('Inserted Downtime Records:', downtimeRecords);
}

async function createOpRecord(date: string, pool: sql.ConnectionPool): Promise<void> {
  let downtimeCounter: number = 0;
  let tonsCounter: number = 0;
  let uptimeCounter: number = 660; // plant shift in minutes e.g. 11hrs X 60min
  let opdetailsID: number[] = []; // array to hold detailID. used to link detailID to recordID if needed
  console.log('inside of oprecord');
  try {
    const result = await pool.request()
      .input('dateToFetch', sql.Date, date)
      .query('SELECT od.detailID, od.downtimeMinutes, SUM(bd.tons) AS totalTons FROM dbo.OpDetails AS od JOIN dbo.BeltDetails AS bd ON od.day = bd.recordDate WHERE od.day = @dateToFetch GROUP BY od.detailID, od.downtimeMinutes');
    if (result.recordset.length > 0) {
      tonsCounter = result.recordset[0].totalTons;
      console.log('amount of tons = ', tonsCounter);
      for (let i = 0; i < result.recordset.length; i++) {
        downtimeCounter += result.recordset[i].downtimeMinutes;
        opdetailsID.push(result.recordset[i].detailID);
      }
      console.log('total downtime for day = ', downtimeCounter);
      uptimeCounter = uptimeCounter - downtimeCounter;
      console.log('total uptime for the day = ', uptimeCounter);

      // now insert into oprecord and link oprecord to opdetails
      const conditionalInsertQuery = `
        IF NOT EXISTS (
          SELECT 1 FROM OpRecord 
         WHERE day = @dateToFetch
        )
        BEGIN
          INSERT INTO OpRecord (tons, downtime, plantUp, day)
          OUTPUT INSERTED.recordID
          VALUES (@tonsCounter, @downtimeCounter, @uptimeCounter, @dateToFetch)
        END
        ELSE
        BEGIN
          SELECT recordID FROM OpRecord WHERE day = @dateToFetch;
        END
      `;

      const insertResult = await pool.request()
        .input('dateToFetch', sql.Date, date)
        .input('tonsCounter', sql.Float, tonsCounter)
        .input('downtimeCounter', sql.Float, downtimeCounter)
        .input('uptimeCounter', sql.Float, uptimeCounter)
        .query(conditionalInsertQuery);

      const opRecordID = insertResult.recordset[0].recordID;
      console.log('OpRecord inserted or selected with recordID = ', opRecordID);
      await Promise.all(
        opdetailsID.map(detailID =>
          pool.request()
            .input('recordID', sql.Int, opRecordID)
            .input('detailID', sql.Int, detailID)
            .query(`UPDATE OpDetails SET recordID = @recordID WHERE detailID = @detailID`)
        )
      );
    }
  } catch (error) {
    console.error('Error creating OpRec: ', error);
  }
}


export default router;