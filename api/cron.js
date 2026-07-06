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

    // 2. Collect all valid FCM tokens
    const tokens = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      return res.status(200).json({ message: 'No valid tokens found in users' });
    }

    // 3. Prepare the notification payload
    const message = {
      notification: {
        title: 'Amow Summary 📝',
        body: 'Waktunya cek rekap laporan Amomimus kamu nih! Yuk buka sekarang.',
      },
      tokens: tokens, // sendMulticast can handle up to 500 tokens at once
    };

    // 4. Send the multicast message
    // If you have more than 500 tokens, you must chunk the array into 500-token batches
    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`Successfully sent message: ${response.successCount} messages were sent successfully`);
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      console.log('List of tokens that caused failures: ' + failedTokens);
    }

    return res.status(200).json({ 
      success: true, 
      sent: response.successCount, 
      failed: response.failureCount 
    });

  } catch (error) {
    console.error('Error sending push notifications:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
