"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileRoutes = void 0;
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const fileController_1 = require("../controllers/fileController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
exports.fileRoutes = router;
// Configure multer storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path_1.default.join(__dirname, '../../uploads'));
    },
    filename: (req, file, cb) => {
        const fileExtension = path_1.default.extname(file.originalname);
        const fileName = `${(0, uuid_1.v4)()}${fileExtension}`;
        cb(null, fileName);
    }
});
// File filter to accept only certain file types
const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.nmea', '.obs', '.rnx', '.jsonl', '.json', '.txt', '.csv', '.imu', '.bin', '.ubx', '.21o', '.22o', '.23o'];
    const fileExtension = path_1.default.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(fileExtension)) {
        cb(null, true);
    }
    else {
        cb(new Error('File type not supported. Please upload NMEA, RINEX, UBX, IMU, JSON, CSV, or TXT files.'));
    }
};
const upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit (increased from 100MB)
});
// Public routes
router.get('/download/:filename', fileController_1.fileController.downloadFile); // Allow public downloads if needed
// Temporarily make routes public for testing
router.post('/upload', upload.fields([
    { name: 'gnssFile', maxCount: 1 },
    { name: 'imuFile', maxCount: 1 }
]), fileController_1.fileController.uploadFile);
router.get('/status/:id', fileController_1.fileController.getProcessingStatus);
router.get('/list', fileController_1.fileController.listFiles);
// Admin-only routes
router.post('/clear-cache', authMiddleware_1.authenticate, authMiddleware_1.authorizeAdmin, fileController_1.fileController.clearCache);
