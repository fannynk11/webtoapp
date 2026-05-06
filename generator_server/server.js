const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fse = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(express.static('public'));

const PORT = 3000;
const jobs = {};

// Konstanta path
const PROJECT_ROOT = path.resolve(__dirname, '..'); 
const TEMP_DIR = path.join(__dirname, 'temp_builds');
const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');

// Pastikan folder temp dan downloads ada
fse.ensureDirSync(TEMP_DIR);
fse.ensureDirSync(DOWNLOADS_DIR);

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
    const jobDir = path.join(TEMP_DIR, jobId);
    const job = jobs[jobId];
    const { url, appName } = job;

    try {
        job.status = 'processing';
        job.message = 'Menyalin template (1/4)...';
        
        // 1. Copy project as template explicitly by folder/file to avoid recursion
        await fse.ensureDir(jobDir);
        const foldersToCopy = ['lib', 'android', 'ios', 'web', 'windows', 'macos', 'linux', 'pubspec.yaml', 'pubspec.lock', 'analysis_options.yaml'];
        for (const item of foldersToCopy) {
            const srcItem = path.join(PROJECT_ROOT, item);
            const destItem = path.join(jobDir, item);
            if (await fse.pathExists(srcItem)) {
                await fse.copy(srcItem, destItem);
            }
        }

        // 2. Modify files
        job.message = 'Menyesuaikan konfigurasi (2/4)...';
        job.progress = 25;
        
        // a. Modify lib/main.dart
        const mainDartPath = path.join(jobDir, 'lib', 'main.dart');
        let mainDart = await fse.readFile(mainDartPath, 'utf8');
        mainDart = mainDart.replace('TARGET_URL_PLACEHOLDER', url);
        mainDart = mainDart.replace('APP_NAME_PLACEHOLDER', appName);
        mainDart = mainDart.replace('USE_CUSTOM_SPLASH_PLACEHOLDER', job.useCustomSplash ? 'true' : 'false');
        mainDart = mainDart.replace('SPLASH_BG_COLOR_PLACEHOLDER', job.splashBgColor);
        mainDart = mainDart.replace('SPLASH_TEXT_COLOR_PLACEHOLDER', job.splashTextColor);
        mainDart = mainDart.replace('SPLASH_LOADING_TEXT_PLACEHOLDER', job.splashLoadingText);
        mainDart = mainDart.replace('SPLASH_PROGRESS_BAR_COLOR_PLACEHOLDER', job.splashProgressBarColor);
        mainDart = mainDart.replace('SPLASH_USE_LOGO_BG_PLACEHOLDER', job.splashUseLogoBg ? 'true' : 'false');
        mainDart = mainDart.replace('SPLASH_LOGO_BG_COLOR_PLACEHOLDER', job.splashLogoBgColor);
        mainDart = mainDart.replace('HIDE_BOTTOM_NAV_PLACEHOLDER', job.hideBottomNav ? 'true' : 'false');
        mainDart = mainDart.replace('SPLASH_IMAGE_TYPE_PLACEHOLDER', job.splashImageType);
        mainDart = mainDart.replace('SPLASH_BG_IMAGE_TYPE_PLACEHOLDER', job.splashBgImageType);

        const assetsToRegister = [];

        // 1. Logo Image
        let finalImageData = job.splashImageData;
        if (job.splashImageType === 'asset' && job.splashImageData) {
            const base64Data = job.splashImageData.replace(/^data:image\/\w+;base64,/, "");
            const assetsDir = path.join(jobDir, 'assets');
            await fse.ensureDir(assetsDir);
            const logoPath = path.join(assetsDir, 'splash_logo.png');
            await fse.writeFile(logoPath, base64Data, 'base64');
            finalImageData = 'assets/splash_logo.png';
            assetsToRegister.push('assets/splash_logo.png');
        }

        // 2. Background Image
        let finalBgImageData = job.splashBgImageData;
        if (job.splashBgImageType === 'asset' && job.splashBgImageData) {
            const base64Data = job.splashBgImageData.replace(/^data:image\/\w+;base64,/, "");
            const assetsDir = path.join(jobDir, 'assets');
            await fse.ensureDir(assetsDir);
            const bgPath = path.join(assetsDir, 'splash_bg.png');
            await fse.writeFile(bgPath, base64Data, 'base64');
            finalBgImageData = 'assets/splash_bg.png';
            assetsToRegister.push('assets/splash_bg.png');
        }

        // 3. Daftarkan di pubspec.yaml
        if (assetsToRegister.length > 0) {
            const pubspecPath = path.join(jobDir, 'pubspec.yaml');
            let pubspec = await fse.readFile(pubspecPath, 'utf8');
            let assetsString = 'uses-material-design: true\n  assets:\n';
            for (const asset of assetsToRegister) {
                assetsString += `    - ${asset}\n`;
            }
            pubspec = pubspec.replace('uses-material-design: true', assetsString.trimEnd());
            await fse.writeFile(pubspecPath, pubspec);
        }

        mainDart = mainDart.replace('SPLASH_IMAGE_DATA_PLACEHOLDER', finalImageData);
        mainDart = mainDart.replace('SPLASH_BG_IMAGE_DATA_PLACEHOLDER', finalBgImageData);
        await fse.writeFile(mainDartPath, mainDart);

        // b. Modify AndroidManifest.xml for App Name
        const manifestPath = path.join(jobDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
        let manifest = await fse.readFile(manifestPath, 'utf8');
        manifest = manifest.replace(/android:label="[^"]*"/, `android:label="${appName}"`);
        await fse.writeFile(manifestPath, manifest);

        // 3. Run Build
        job.message = 'Sedang membuat APK, ini memakan waktu 2-5 menit (3/4)...';
        job.progress = 50;

        await runCommand('flutter clean', jobDir);
        await runCommand('flutter pub get', jobDir);
        await runCommand('flutter build apk --release', jobDir);

        // 4. Move generated APK to downloads
        job.message = 'Menyelesaikan proses (4/4)...';
        job.progress = 90;
        
        const apkSource = path.join(jobDir, 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');
        const safeAppName = appName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const apkFilename = `${safeAppName}_${jobId.substring(0, 5)}.apk`;
        const apkDest = path.join(DOWNLOADS_DIR, apkFilename);
        
        await fse.copy(apkSource, apkDest);

        // Sukses
        job.status = 'completed';
        job.progress = 100;
        job.message = 'APK berhasil dibuat!';
        job.downloadUrl = `/downloads/${apkFilename}`;

    } catch (error) {
        console.error(`Build failed for job ${jobId}:`, error);
        job.status = 'failed';
        job.message = 'Terjadi kesalahan saat membuat APK: ' + error.message;
    } finally {
        // Cleanup temp folder
        try {
            await fse.remove(jobDir);
        } catch (e) {
            console.error('Gagal menghapus folder temp:', e);
        }
    }
}

function runCommand(command, cwd) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => { // 10MB buffer
            if (error) {
                console.error(`Error executing ${command}:\n`, stderr);
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

app.listen(PORT, () => {
    console.log(`🚀 Generator Server berjalan di http://localhost:${PORT}`);
});
