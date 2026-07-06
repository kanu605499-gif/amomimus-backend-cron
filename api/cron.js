const admin = require('firebase-admin');

// Ensure that we only initialize the Firebase app once
if (!admin.apps.length) {
  try {
    // Vercel Environment Variables:
    // FIREBASE_SERVICE_ACCOUNT must be a stringified JSON of the service account file
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
}

export default async function handler(req, res) {
  // Verify cron secret for security (optional but recommended in Vercel)
  // if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return res.status(401).end('Unauthorized');
  // }

  try {
    const db = admin.firestore();
    
    // 1. Fetch all users who have an fcmToken
    const usersSnapshot = await db.collection('users')
      .where('fcmToken', '!=', null)
      .get();
      
    if (usersSnapshot.empty) {
      console.log('No users with FCM tokens found.');
      return res.status(200).json({ message: 'No tokens found' });
    }

    // 2. Dictionary for translations
    const translations = {
      id: { title: 'Amow Summary 📝', body: 'Waktunya cek rekap laporan Amomimus kamu nih! Yuk buka sekarang.' },
      en: { title: 'Amow Summary 📝', body: 'Time to check your Amomimus summary report! Open it now.' },
      ja: { title: 'アモウサマリー 📝', body: 'アモミマスのサマリーレポートをチェックする時間です！今すぐ開いてください。' },
      de: { title: 'Amow Zusammenfassung 📝', body: 'Zeit, deinen Amomimus-Zusammenfassungsbericht zu überprüfen! Öffne ihn jetzt.' },
      th: { title: 'สรุป Amow 📝', body: 'ถึงเวลาตรวจสอบรายงานสรุป Amomimus ของคุณแล้ว! เปิดเลย.' },
      tamriel: { title: 'Amow Summary 📝', body: 'By the Nine! Your Amomimus missive has arrived. Break the seal now.' }
    };

    // 3. Group tokens by language
    const groupedTokens = {};
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken) {
        // Default to 'id' if language is missing or unknown
        const lang = translations[userData.language] ? userData.language : 'id';
        if (!groupedTokens[lang]) groupedTokens[lang] = [];
        groupedTokens[lang].push(userData.fcmToken);
      }
    });

    if (Object.keys(groupedTokens).length === 0) {
      return res.status(200).json({ message: 'No valid tokens found in users' });
    }

    // 4. Send the multicast messages per language
    let totalSent = 0;
    let totalFailed = 0;

    for (const [lang, tokens] of Object.entries(groupedTokens)) {
      const message = {
        notification: translations[lang],
        tokens: tokens,
      };

      // Chunk tokens into batches of 500
      for (let i = 0; i < tokens.length; i += 500) {
        const batchTokens = tokens.slice(i, i + 500);
        message.tokens = batchTokens;
        
        const response = await admin.messaging().sendEachForMulticast(message);
        totalSent += response.successCount;
        totalFailed += response.failureCount;

        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              console.log(`Failed token (${lang}): ${batchTokens[idx]} - ${resp.error}`);
            }
          });
        }
      }
    }

    console.log(`Successfully sent message: ${totalSent} sent, ${totalFailed} failed`);
    
    return res.status(200).json({ 
      success: true, 
      sent: totalSent, 
      failed: totalFailed 
    });

  } catch (error) {
    console.error('Error sending push notifications:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
