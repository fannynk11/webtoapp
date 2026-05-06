const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fse = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
require('dotenv').config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;


const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const jobs = {};

// Pastikan variabel GITHUB ada
if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error('PERINGATAN: Environment Variables GITHUB belum diatur!');
}


app.post('/api/generate', async (req, res) => {
    try {
        const payload = req.body;
        const { url, appName } = payload;
        
        if (!url || !appName) {
            return res.status(400).json({ error: 'URL dan Nama Aplikasi wajib diisi' });
        }

        const jobId = uuidv4();
        jobs[jobId] = {
            id: jobId,
            status: 'queued',
            progress: 0,
            message: 'Menyiapkan permintaan...',
            ...payload,
            downloadUrl: null
        };

        // Tunggu sampai GitHub Actions ter-trigger baru kirim response
        await processBuild(jobId);


        res.json({ jobId });
    } catch (err) {
        console.error('API Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) {
        return res.status(404).json({ error: 'Job tidak ditemukan' });
    }
    res.json(job);
});

async function processBuild(jobId) {
    const job = jobs[jobId];
    const { url, appName } = job;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
        throw new Error('Konfigurasi GitHub (Token/Owner/Repo) belum diatur di Environment Variables Vercel.');
    }

    try {
        job.status = 'processing';
        job.message = 'Menghubungkan ke GitHub...';
        job.progress = 50;

        await axios.post(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/build-apk.yml/dispatches`,
            {
                ref: 'main',
                inputs: {
                    app_name: appName,
                    target_url: url,
                    use_custom_splash: String(job.useCustomSplash || false),
                    splash_bg_color: job.splashBgColor || '#FFFFFF',
                    splash_text_color: job.splashTextColor || '#6C63FF',
                    splash_loading_text: job.splashLoadingText || 'Memuat...',
                    splash_image_type: job.splashImageType || 'none',
                    splash_image_data: job.splashImageData || '',
                    splash_bg_image_type: job.splashBgImageType || 'color',
                    splash_bg_image_data: job.splashBgImageData || ''
                }
            },
            {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        job.status = 'completed';
        job.progress = 100;
        job.message = 'Berhasil! Cek tab Actions di GitHub kamu.';
        job.downloadUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`;

    } catch (error) {
        const detail = error.response?.data?.message || error.message;
        console.error(`Build failed:`, detail);
        job.status = 'failed';
        job.message = 'Gagal terhubung ke GitHub: ' + detail;
        throw new Error(detail);
    }
}

// Hanya jalankan listen jika tidak di Vercel
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Local Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;



