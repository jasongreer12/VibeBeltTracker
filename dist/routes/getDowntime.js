"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mssql_1 = __importDefault(require("mssql"));
const moment_1 = __importDefault(require("moment"));
const router = (0, express_1.Router)();
const trueShiftStart = '12:00:00'; // times in UTC. Equivalent to 06:00 AM in GMT-5
const trueShiftEnd = '23:00:00'; // times in UTC. Equivalent to 05:00 PM in GMT-5
router.get('/getTodayDowntime', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dateToFetch = req.query.date;
        const pool = req.app.locals.db;
        // base query to bind inputs dynamically
        let query = 'SELECT * FROM OpDetails WHERE day ';
        const request = pool.request();
        if (dateToFetch.includes(' - ')) {
            // use moment.js to split each date
            const [startStr, endStr] = dateToFetch.split(' - ');
            const start = (0, moment_1.default)(startStr, "MM/DD/YYYY").format("YYYY-MM-DD");
            const end = (0, moment_1.default)(endStr, "MM/DD/YYYY").format("YYYY-MM-DD");
            query += 'BETWEEN @start AND @end ';
            request.input('start', mssql_1.default.Date, start);
            request.input('end', mssql_1.default.Date, end);
        }
        else {
            query += '= @date ';
            request.input('date', mssql_1.default.Date, dateToFetch);
        }
        query += 'ORDER BY endingDowntime';
        const result = yield request.query(query);
        const recordset = result.recordset;
        if (recordset.length !== 0) {
            createOpRecord(dateToFetch, pool);
            res.json(recordset);
            return;
        }
        else if (recordset.length === 0 || !result.recordset) { // if there are no records for today, check if belt records exist, if they do run insertDowntime, else return
            // Insert downtime records only if they don't already exist
            yield insertShiftDowntimes(dateToFetch, pool);
            //console.log("Inserting shift downtime function in getdowntime");
            // fetch the records after insertion
            const newResult = yield pool.request()
                .input('dateToFetch', mssql_1.default.Date, dateToFetch)
                .query('SELECT * FROM OpDetails WHERE day = @dateToFetch ORDER BY endingDowntime');
            //console.log(newResult.recordset.length + " new result record set in getdowntime line 48.");
            if (newResult.recordset.length === 0) {
                res.json("EMPTY");
            }
            else {
                res.json(newResult.recordset);
            }
        }
    }
    catch (error) {
        console.error('Error fetching todays results: ', error);
        res.status(500).json({ error: 'Failed to fetch records.' });
    }
}));
// function to get total time belt was ran for given day
function getBeltTotal(date, pool) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield pool.request()
                .input('dateToFetch', mssql_1.default.Date, date)
                .query('SELECT startTime, stopTime FROM beltDetails WHERE recordDate = @dateToFetch');
            //console.log(result.recordset);
            return result.recordset;
        }
        catch (error) {
            console.error('Error in getBeltTotal:', error);
            throw error; // Let the calling function handle the error
        }
    });
}
// function to calculate and insert downtime intervals
function insertShiftDowntimes(dateToFetch, pool) {
    return __awaiter(this, void 0, void 0, function* () {
        const shiftStart = new Date(`1970-01-01T${trueShiftStart}Z`);
        const shiftEnd = new Date(`1970-01-01T${trueShiftEnd}Z`);
        const beltResult = yield pool.request()
            .input('dateToFetch', mssql_1.default.Date, dateToFetch)
            .query('SELECT startTime, stopTime FROM beltDetails WHERE recordDate = @dateToFetch');
        const beltIntervals = beltResult.recordset;
        if (!beltIntervals || beltIntervals.length === 0) {
            return;
        }
        const intervals = beltIntervals.map(record => ({
            start: new Date(record.startTime),
            stop: new Date(record.stopTime)
        })).sort((a, b) => a.start.getTime() - b.start.getTime());
        const downtimeRecords = [];
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
            yield Promise.all(downtimeRecords.map(record => pool.request()
                .input('downtimeStart', mssql_1.default.Time, record.downtimeStart)
                .input('downtimeEnd', mssql_1.default.Time, record.downtimeEnd)
                .input('downtimeMinutes', mssql_1.default.Int, record.downtimeMinutes)
                .input('dateToFetch', mssql_1.default.Date, dateToFetch)
                .query(conditionalInsertQuery)
                .then(result => {
                console.log('Conditional query resolved for record:', record);
            })));
        }
        catch (error) {
            console.log('query made error');
        }
        // create oprecord here
        createOpRecord(dateToFetch, pool);
        //console.log('Inserted Downtime Records:', downtimeRecords);
    });
}
function createOpRecord(date, pool) {
    return __awaiter(this, void 0, void 0, function* () {
        let downtimeCounter = 0;
        let tonsCounter = 0;
        let uptimeCounter = 660; // plant shift in minutes e.g. 11hrs X 60min
        let opdetailsID = []; // array to hold detailID. used to link detailID to recordID if needed
        console.log('inside of oprecord');
        try {
            const result = yield pool.request()
                .input('dateToFetch', mssql_1.default.Date, date)
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
                const insertResult = yield pool.request()
                    .input('dateToFetch', mssql_1.default.Date, date)
                    .input('tonsCounter', mssql_1.default.Float, tonsCounter)
                    .input('downtimeCounter', mssql_1.default.Float, downtimeCounter)
                    .input('uptimeCounter', mssql_1.default.Float, uptimeCounter)
                    .query(conditionalInsertQuery);
                const opRecordID = insertResult.recordset[0].recordID;
                console.log('OpRecord inserted or selected with recordID = ', opRecordID);
                yield Promise.all(opdetailsID.map(detailID => pool.request()
                    .input('recordID', mssql_1.default.Int, opRecordID)
                    .input('detailID', mssql_1.default.Int, detailID)
                    .query(`UPDATE OpDetails SET recordID = @recordID WHERE detailID = @detailID`)));
            }
        }
        catch (error) {
            console.error('Error creating OpRec: ', error);
        }
    });
}
exports.default = router;
//# sourceMappingURL=getDowntime.js.map