const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
require('dotenv').config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

const MONGODB_URI = process.env.MONGODB_URI;

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'webtoapp_secret_123';

// -- MONGODB SETUP --
const jobSchema = new mongoose.Schema({
    jobId: { type: String, unique: true },
    appName: String,
    url: String,
    email: String,
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
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI tidak ditemukan di Environment Variables!');
    }
    try {
        console.log('Attempting to connect to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Timeout setelah 5 detik
        });
        isConnected = true;
        console.log('✅ MongoDB Connected Successfully');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        throw new Error('Gagal terhubung ke Database: ' + err.message);
    }
}

// -- API ROUTES --

// Webhook untuk menerima update dari GitHub Actions
app.post('/api/webhook/github', async (req, res) => {
    const { jobId, status, downloadUrl, error, secret } = req.body;

    if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        await connectDB();
        const updateData = { 
            status, 
            message: status === 'completed' ? 'Build Berhasil!' : `Build Gagal: ${error || 'Kesalahan pada sistem build GitHub'}`,
            progress: status === 'completed' ? 100 : 0
        };
        if (downloadUrl) updateData.downloadUrl = downloadUrl;
        if (error) updateData.errorLog = error;

        const updatedJob = await Job.findOneAndUpdate({ jobId }, updateData, { new: true });
        
        // Kirim email otomatis jika selesai dan ada emailnya
        if (status === 'completed' && updatedJob && updatedJob.email) {
            console.log(`📧 Mengirim email otomatis ke ${updatedJob.email}...`);
            sendEmailNotification(updatedJob);
        }

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/generate', async (req, res) => {

    try {
        await connectDB();
        const payload = req.body;
        const { url, appName, email } = payload;
        
        if (!url || !appName) {
            return res.status(400).json({ error: 'URL dan Nama Aplikasi wajib diisi' });
        }

        const jobId = uuidv4();
        
        // Simpan ke Database
        const newJob = new Job({
            jobId,
            appName,
            url,
            email,
            status: 'processing',
            message: 'Menghubungkan ke GitHub...',
            progress: 10,
            payload
        });
        await newJob.save();

        // Trigger GitHub Action secara async (tidak menunggu build selesai)
        processBuild(jobId, payload, req.headers.host).catch(err => {
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

// Helper untuk upload Base64 ke Transfer.sh agar tidak melebihi limit GitHub Inputs
async function uploadToTemp(base64Data, filename) {
    if (!base64Data || !base64Data.startsWith('data:')) return base64Data;
    
    try {
        console.log(`Uploading ${filename} to temporary host...`);
        const base64Content = base64Data.split(';base64,').pop();
        const buffer = Buffer.from(base64Content, 'base64');
        
        const response = await axios.put(`https://transfer.sh/${filename}`, buffer, {
            headers: { 'Content-Type': 'application/octet-stream' }
        });
        
        console.log(`✅ Uploaded ${filename}: ${response.data}`);
        return response.data.trim();
    } catch (err) {
        console.error(`❌ Failed to upload ${filename}:`, err.message);
        return base64Data; // Fallback ke data asli jika gagal
    }
}

async function processBuild(jobId, payload, host) {
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
        const error = 'Konfigurasi GitHub belum lengkap di server.';
        await Job.findOneAndUpdate({ jobId }, { status: 'failed', message: error });
        return;
    }

    // Update message: Kita sedang upload gambar dulu
    await Job.findOneAndUpdate({ jobId }, { message: 'Sedang memproses gambar...' });

    // Cek dan upload gambar jika berupa Base64
    const splashImageUrl = await uploadToTemp(payload.splashImageData, `logo_${jobId}.png`);
    const splashBgUrl = await uploadToTemp(payload.splashBgImageData, `bg_${jobId}.png`);
    const appIconUrl = await uploadToTemp(payload.appIconData, `icon_${jobId}.png`);
    const offlineIconUrl = await uploadToTemp(payload.offlineIconData, `offline_${jobId}.png`);

    // Gunakan HTTPS jika di production (Vercel)
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const serverUrl = `${protocol}://${host}`;

    // Generate sanitized package name (slug)
    const packageSlug = payload.appName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20) || 'app';
    const packageName = `com.webtoapk.${packageSlug}`;

    try {
        await axios.post(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/build-apk.yml/dispatches`,
            {
                ref: 'main',
                inputs: {
                    job_id: jobId,
                    server_url: serverUrl,
                    webhook_secret: WEBHOOK_SECRET,
                    app_name: payload.appName,
                    package_name: packageName,
                    target_url: payload.url,
                    use_custom_splash: String(payload.useCustomSplash || false),
                    splash_bg_color: payload.splashBgColor || '#FFFFFF',
                    splash_text_color: payload.splashTextColor || '#6C63FF',
                    splash_loading_text: payload.splashLoadingText || 'Memuat...',
                    splash_progress_bar_color: payload.splashProgressBarColor || '#6C63FF',
                    splash_use_logo_bg: String(payload.splashUseLogoBg || false),
                    splash_logo_bg_color: payload.splashLogoBgColor || '#FFFFFF',
                    hide_bottom_nav: String(payload.hideBottomNav || false),
                    splash_image_type: payload.splashImageType || 'none',
                    splash_image_data: splashImageUrl,
                    splash_bg_image_type: payload.splashBgImageType || 'color',
                    splash_bg_image_data: splashBgUrl,
                    app_icon_type: payload.appIconType || 'none',
                    app_icon_data: appIconUrl,
                    
                    // Offline Screen
                    use_custom_offline: String(payload.useCustomOffline || false),
                    offline_title: payload.offlineTitle || 'Koneksi Terputus',
                    offline_desc: payload.offlineDesc || 'Pastikan internet aktif.',
                    offline_btn_text: payload.offlineBtnText || 'Coba Lagi',
                    offline_color: payload.offlineColor || '#F59E0B',
                    offline_icon_type: payload.offlineIconType || 'default',
                    offline_icon_data: offlineIconUrl
                }
            },
            {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        // Update database: Status tetap "processing" agar UI menunggu
        await Job.findOneAndUpdate({ jobId }, { 
            status: 'processing', 
            progress: 20,
            message: 'Build sedang diproses di GitHub (2-5 menit)...'
        });

    } catch (error) {
        let detail = error.response?.data?.message || error.message;
        let fullError = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        
        console.error(`❌ GitHub Dispatch Failed:`, fullError);
        
        let userFriendlyError = 'Terjadi kendala saat menghubungkan ke server build. Silakan hubungi Tim IT untuk bantuan.';
        
        if (detail.includes('inputs are too large') || fullError.includes('too large')) {
            userFriendlyError = 'Ukuran gambar yang diunggah terlalu besar. Silakan gunakan gambar yang lebih kecil (maks 50KB) atau gunakan Link URL.';
        } else if (detail.includes('401') || detail.includes('Bad credentials')) {
            userFriendlyError = 'Sistem mengalami kendala autentikasi (Token GitHub tidak valid).';
        } else if (error.response?.status === 404) {
            userFriendlyError = 'Workflow build tidak ditemukan. Pastikan file build-apk.yml ada di branch main.';
        } else if (error.response?.status === 422) {
            userFriendlyError = `Data tidak sesuai format GitHub (422). Detail: ${fullError}`;
        }

        await Job.findOneAndUpdate({ jobId }, { 
            status: 'failed', 
            message: `Gagal: ${userFriendlyError}`,
            errorLog: fullError
        });
    }
}

    // Endpoint untuk mengirim link APK ke email
app.post('/api/send-email', async (req, res) => {


    const { email, downloadUrl, appName } = req.body;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ error: 'Kredensial email di server belum diatur.' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });



        const mailOptions = {
            from: `"WebToAPK" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `🎁 Aplikasi ${appName} Kamu Sudah Siap!`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded-lg: 12px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #2563eb; margin-bottom: 10px;">WebToAPK</h1>
                        <p style="color: #64748b;">Transformasi Website ke Aplikasi Android</p>
                    </div>
                    
                    <div style="background-color: #f8fafc; padding: 30px; border-radius: 12px; text-align: center;">
                        <h2 style="color: #1e293b; margin-top: 0;">Halo! 👋</h2>
                        <p style="color: #475569; line-height: 1.6;">
                            Aplikasi <strong>${appName}</strong> yang dibuat sudah berhasil diproses dan siap untuk diunduh.
                        </p>
                        
                        <div style="margin: 30px 0;">
                            <a href="${downloadUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                                Download APK Sekarang
                            </a>
                        </div>
                        
                        <p style="color: #94a3b8; font-size: 12px;">
                            Jika tombol di atas tidak berfungsi, copy link berikut ke browser Anda:<br/>
                            <span style="color: #3b82f6;">${downloadUrl}</span>
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 12px;">
                        <p>&copy; 2026 WebToAPK. Dibuat untuk kemudahan transformasi digital.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Email berhasil dikirim!' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: error.message || 'Gagal mengirim email...' });
    }
});

// Fungsi bantuan untuk mengirim email notifikasi otomatis
async function sendEmailNotification(job) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('❌ Gagal mengirim email: Kredensial EMAIL_USER atau EMAIL_PASS belum diatur di .env');
        return;
    }

    try {
        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true, 
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });


        const mailOptions = {
            from: `"WebToAPK Pro" <${process.env.EMAIL_USER}>`,
            to: job.email,
            subject: `🎁 Aplikasi ${job.appName} Kamu Sudah Siap!`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: white;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #2563eb; margin-bottom: 5px; font-size: 28px;">WebToAPK Pro</h1>
                        <p style="color: #64748b; font-size: 14px;">Transformasi Website ke Aplikasi Android</p>
                    </div>
                    
                    <div style="background-color: #f8fafc; padding: 30px; border-radius: 12px; text-align: center; border: 1px dashed #cbd5e1;">
                        <h2 style="color: #1e293b; margin-top: 0; font-size: 22px;">Halo! 👋</h2>
                        <p style="color: #475569; line-height: 1.6; font-size: 16px;">
                            Kabar gembira! Aplikasi <strong>${job.appName}</strong> yang kamu buat sudah berhasil kami proses dan siap untuk diunduh.
                        </p>
                        
                        <div style="margin: 35px 0;">
                            <a href="${job.downloadUrl}" style="background-color: #2563eb; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                                Download APK Sekarang
                            </a>
                        </div>
                        
                        <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
                            Jika tombol di atas tidak berfungsi, gunakan link ini:<br/>
                            <a href="${job.downloadUrl}" style="color: #3b82f6; word-break: break-all;">${job.downloadUrl}</a>
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 11px;">
                        <p>&copy; 2026 WebToAPK &bull; Layanan Pembuat APK Instan</p>
                        <p>Pesan ini dikirim secara otomatis, mohon tidak membalas email ini.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Email berhasil dikirim ke ${job.email}`);
    } catch (error) {
        console.error('❌ Gagal mengirim email otomatis:', error.message);
        if (error.message.includes('Invalid login')) {
            console.error('👉 Tip: Pastikan kamu menggunakan APP PASSWORD (16 digit), bukan password Gmail biasa.');
        }
    }
}


app.listen(PORT, () => {


    });

module.exports = app;

