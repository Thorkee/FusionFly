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
    const allowedExtensions = ['.nmea', '.obs', '.jsonl', '.json', '.txt'];
    const fileExtension = path_1.default.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(fileExtension)) {
        cb(null, true);
    }
    else {
        cb(new Error('File type not supported. Please upload NMEA, OBS, JSONL, JSON, or TXT files.'));
    }
};
const upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});
// Routes
router.post('/upload', upload.single('file'), fileController_1.fileController.uploadFile);
router.get('/status/:id', fileController_1.fileController.getProcessingStatus);
router.get('/download/:filename', fileController_1.fileController.downloadFile);
router.get('/list', fileController_1.fileController.listFiles);
