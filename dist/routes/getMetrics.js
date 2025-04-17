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
const router = (0, express_1.Router)();
const trueShiftStart = '12:00:00'; // times in UTC. Equivalent to 06:00 AM in GMT-5
const trueShiftEnd = '23:00:00'; // times in UTC. Equivalent to 05:00 PM in GMT-5
const totalShiftHours = 11;
router.get('/getMetrics', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dateToFetch = req.query.date;
        //console.log(dateToFetch);
        const pool = req.app.locals.db;
        const result = yield pool.request()
            .input('dateToFetch', mssql_1.default.Date, dateToFetch)
            .query('SELECT * FROM OpRecord WHERE day = @dateToFetch');
        console.log(result.recordset.length);
        if (result.recordset.length > 0) {
            const record = result.recordset[0]; // Access the first row
            record.truePlantAvailability = ((record.plantUp / 60) / totalShiftHours) * 100; // convert to hours and divide my shift total
            console.log('Tons:', record.tons);
            console.log('Downtime:', record.downtime);
            console.log('Plant Up:', record.plantUp);
            const scheduledPlantUp = yield calculatePlantAvailability(dateToFetch, pool);
            if (scheduledPlantUp != -1) {
                record.plantAvailability = ((record.plantUp / 60) / (scheduledPlantUp / 60)) * 100;
            }
            else {
                record.plantAvailability = -1;
            }
            res.json(record); // Send the record as JSON response
        }
        else {
            console.log('No records found for the given date.');
            res.json("EMPTY");
            //res.status(404).json({ message: 'No data available for the selected date.' });
        }
    }
    catch (error) {
        console.error('Error fetching metrics: ', error);
        res.status(500).json({ error: 'Failed to fetch metrics.' });
    }
}));
function calculatePlantAvailability(date, pool) {
    return __awaiter(this, void 0, void 0, function* () {
        // scheduledPlantUp = shiftDuration - plannedDowntime
        const result = yield pool.request()
            .input('date', mssql_1.default.Date, date)
            .query('SELECT code, downtimeMinutes FROM OpDetails WHERE day = @date');
        let totalShiftMinutes = 660;
        // if code = 100-199 then subtract its downtimeMinutes from the total time it was supposed to be running
        const recordLength = result.recordset.length;
        for (let i = 0; i < recordLength; i++) {
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
    });
}
exports.default = router;
//# sourceMappingURL=getMetrics.js.map