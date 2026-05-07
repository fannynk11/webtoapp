const nodemailer = require('nodemailer');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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
            from: `"WebToAPK Pro" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `🎁 Aplikasi ${appName} Kamu Sudah Siap!`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: white;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #2563eb; margin-bottom: 5px; font-size: 28px;">WebToAPK Pro</h1>
                        <p style="color: #64748b; font-size: 14px;">Transformasi Website ke Aplikasi Android</p>
                    </div>
                    
                    <div style="background-color: #f8fafc; padding: 30px; border-radius: 12px; text-align: center; border: 1px dashed #cbd5e1;">
                        <h2 style="color: #1e293b; margin-top: 0; font-size: 22px;">Halo! 👋</h2>
                        <p style="color: #475569; line-height: 1.6; font-size: 16px;">
                            Kabar gembira! Aplikasi <strong>${appName}</strong> yang kamu buat sudah berhasil kami proses dan siap untuk diunduh.
                        </p>
                        
                        <div style="margin: 35px 0;">
                            <a href="${downloadUrl}" style="background-color: #2563eb; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                                Download APK Sekarang
                            </a>
                        </div>
                        
                        <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
                            Jika tombol di atas tidak berfungsi, gunakan link ini:<br/>
                            <a href="${downloadUrl}" style="color: #3b82f6; word-break: break-all;">${downloadUrl}</a>
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 11px;">
                        <p>&copy; 2026 WebToAPK &bull; Layanan Pembuat APK Instan</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        return res.status(200).json({ success: true, message: 'Email berhasil dikirim!' });
    } catch (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({ error: error.message || 'Gagal mengirim email...' });
    }
}
