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
    const { url, appName, useCustomSplash, splashBgColor, splashTextColor, splashLoadingText, splashProgressBarColor, splashUseLogoBg, splashLogoBgColor, hideBottomNav, splashImageType, splashImageData, splashBgImageType, splashBgImageData } = req.body;
    
    if (!url || !appName) {
        return res.status(400).json({ error: 'URL dan Nama Aplikasi wajib diisi' });
    }

    const jobId = uuidv4();
    jobs[jobId] = {
        id: jobId,
        status: 'queued',
        progress: 0,
        message: 'Menyiapkan ruang kerja...',
        url: url,
        appName: appName,
        useCustomSplash: useCustomSplash || false,
        splashBgColor: splashBgColor || '#FFFFFF',
        splashTextColor: splashTextColor || '#6C63FF',
        splashLoadingText: splashLoadingText || 'Memuat halaman...',
        splashProgressBarColor: splashProgressBarColor || '#6C63FF',
        splashUseLogoBg: splashUseLogoBg || false,
        splashLogoBgColor: splashLogoBgColor || '#FFFFFF',
        hideBottomNav: hideBottomNav || false,
        splashImageType: splashImageType || 'none',
        splashImageData: splashImageData || '',
        splashBgImageType: splashBgImageType || 'color',
        splashBgImageData: splashBgImageData || '',
        downloadUrl: null
    };

    res.json({ jobId });

    // Mulai proses build di background
    processBuild(jobId);
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

    try {
        job.status = 'processing';
        
        // 1. Trigger GitHub Action
        job.message = 'Menghubungkan ke Build Server GitHub...';
        job.progress = 30;

        const response = await axios.post(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/build-apk.yml/dispatches`,
            {
                ref: 'main',
                inputs: {
                    app_name: appName,
                    target_url: url
                }
            },
            {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        // 2. Selesai
        job.status = 'completed';
        job.progress = 100;
        job.message = 'Permintaan Build terkirim! Klik tombol di bawah untuk memantau proses dan download APK di GitHub.';
        job.downloadUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`;

    } catch (error) {
        console.error(`Build failed for job ${jobId}:`, error.response?.data || error.message);
        job.status = 'failed';
        job.message = 'Gagal terhubung ke GitHub: ' + (error.response?.data?.message || error.message);
    }
}

function runCommand(command, cwd) {
    // Fungsi ini sudah tidak digunakan lagi
    return Promise.resolve();
}

app.listen(PORT, () => {
    console.log(`🚀 Generator Server berjalan di http://localhost:${PORT}`);
});

module.exports = app;


