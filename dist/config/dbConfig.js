"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const dbConfig = {
    user: process.env.DBUSER, // assert non null values
    password: process.env.DBPASS,
    server: process.env.DBSERVER,
    port: 1433,
    database: process.env.DBNAME,
    options: {
        trustServerCertificate: true,
        encrypt: true,
    }
};
exports.default = dbConfig;
//# sourceMappingURL=dbConfig.js.map