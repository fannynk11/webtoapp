const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO_NAME;
const MONGODB_URI = process.env.MONGODB_URI;

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// -- MONGODB SETUP --
const jobSchema = new mongoose.Schema({
    jobId: { type: String, unique: true },
    appName: String,
    url: String,
    status: { type: String, default: 'queued' },
    progress: { type: Number, default: 0 },
    message: { type: String, default: 'Menyiapkan...' },
    downloadUrl: String,
    errorLog: String,
    payload: Object,
    createdAt: { type: Date, default: Date.now }
});

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

let isConnected = false;
async function connectDB() {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGODB_URI);
        isConnected = true;
        console.log('✅ MongoDB Connected');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
    }
}

// -- API ROUTES --

app.post('/api/generate', async (req, res) => {
    try {
        await connectDB();
        const payload = req.body;
        const { url, appName } = payload;
        
        if (!url || !appName) {
            return res.status(400).json({ error: 'URL dan Nama Aplikasi wajib diisi' });
        }

        const jobId = uuidv4();
        
        // Simpan ke Database
        const newJob = new Job({
            jobId,
            appName,
            url,
            status: 'processing',
            message: 'Menghubungkan ke GitHub...',
            progress: 10,
            payload
        });
        await newJob.save();

        // Trigger GitHub Action secara async (tidak menunggu build selesai)
        processBuild(jobId, payload).catch(err => {
            console.error(`Async processBuild error for ${jobId}:`, err.message);
        });

        res.json({ jobId });
    } catch (err) {
        console.error('API Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/status/:jobId', async (req, res) => {
    try {
        await connectDB();
        const job = await Job.findOne({ jobId: req.params.jobId });
        if (!job) {
            return res.status(404).json({ error: 'Job tidak ditemukan' });
        }
        res.json(job);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint baru untuk melihat riwayat build
app.get('/api/history', async (req, res) => {
    try {
        await connectDB();
        const history = await Job.find().sort({ createdAt: -1 }).limit(20);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function processBuild(jobId, payload) {
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
        const error = 'Konfigurasi GitHub belum lengkap di server.';
        await Job.findOneAndUpdate({ jobId }, { status: 'failed', message: error });
        return;
    }

    try {
        await axios.post(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/build-apk.yml/dispatches`,
            {
                ref: 'main',
                inputs: {
                    app_name: payload.appName,
                    target_url: payload.url,
                    use_custom_splash: String(payload.useCustomSplash || false),
                    splash_bg_color: payload.splashBgColor || '#FFFFFF',
                    splash_text_color: payload.splashTextColor || '#6C63FF',
                    splash_loading_text: payload.splashLoadingText || 'Memuat...',
                    splash_progress_bar_color: payload.splashProgressBarColor || '#6C63FF',
                    splash_use_logo_bg: String(payload.splashUseLogoBg || false),
                    hide_bottom_nav: String(payload.hideBottomNav || false),
                    splash_image_type: payload.splashImageType || 'none',
                    splash_image_data: payload.splashImageData || '',
                    splash_bg_image_type: payload.splashBgImageType || 'color',
                    splash_bg_image_data: payload.splashBgImageData || ''
                }
            },
            {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        // Update database setelah berhasil trigger
        await Job.findOneAndUpdate({ jobId }, { 
            status: 'completed', 
            progress: 100,
            message: 'Berhasil! Cek tab Actions di GitHub kamu.',
            downloadUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`
        });

    } catch (error) {
        const detail = error.response?.data?.message || error.message;
        console.error(`Build failed:`, detail);
        await Job.findOneAndUpdate({ jobId }, { 
            status: 'failed', 
            message: 'Gagal: ' + detail,
            errorLog: detail
        });
    }
}

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Local Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
