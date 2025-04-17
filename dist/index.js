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
const express_1 = __importDefault(require("express"));
const mssql_1 = __importDefault(require("mssql"));
const dbConfig_1 = __importDefault(require("./config/dbConfig"));
const getDowntime_1 = __importDefault(require("./routes/getDowntime"));
const insertDowntime_1 = __importDefault(require("./routes/insertDowntime"));
const getMetrics_1 = __importDefault(require("./routes/getMetrics"));
const updateOpDetail_1 = __importDefault(require("./routes/updateOpDetail"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
/*
  Note: for project, i should be displaying plant duration for selected day, total rock crushed for day, total plant downtime for day,
        downtime event, true plant availibility, plant availibility % for day.



*/
app.use(express_1.default.static("public"));
// connect to SQL database
mssql_1.default.connect(dbConfig_1.default)
    .then((pool) => {
    console.log('Connected to Microsoft SQL Server');
    // Optionally attach the connection pool to app.locals
    app.locals.db = pool;
})
    .catch((err) => {
    console.error('Database connection failed:', err);
});
app.get('/api/beltdetails', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pool = app.locals.db;
        const result = yield pool.request().query('SELECT * FROM BeltDetails');
        res.json(result.recordset);
    }
    catch (error) {
        console.error('Error fetching results from records: ', error);
        res.status(500).json({ error: 'Failed to fetch records.' });
    }
}));
app.use('/api', getDowntime_1.default);
app.use('/api', insertDowntime_1.default);
app.use('/api', getMetrics_1.default);
app.use('/api', updateOpDetail_1.default);
// start server
app.listen(3000, () => {
    console.log(`Server running on port port: 3000`);
});
//# sourceMappingURL=index.js.map