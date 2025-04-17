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
router.get('/updateOpDetail', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const code = req.query.code;
        const detailID = req.query.detailID;
        //console.log(dateToFetch);
        const pool = req.app.locals.db;
        const result = yield pool.request()
            .input('detailID', mssql_1.default.Int, detailID)
            .query('SELECT * FROM OpDetails WHERE detailID = @detailID');
        if (result.recordset.length > 0) {
            const insertResult = yield pool.request()
                .input('detailID', mssql_1.default.Int, detailID)
                .input('code', mssql_1.default.Int, code)
                .query('UPDATE OpDetails SET code = @code WHERE detailID = @detailID;');
        }
        else {
            console.log('No records found for the given date.');
            //res.status(404).json({ message: 'No data available for the selected date.' });
        }
    }
    catch (error) {
        console.error('Error updating code: ', error);
        res.status(500).json({ error: 'Error updating code for Details.' });
    }
}));
exports.default = router;
//# sourceMappingURL=updateOpDetail.js.map