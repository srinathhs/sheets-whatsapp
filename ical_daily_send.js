const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs').promises;
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const readline = require('readline'); // For interactive token generation

// Google Sheets API setup
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']; // Read and Write scope for marking rows
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// Placeholder for your Google Sheet ID. Update this in the README.md.
const GOOGLE_SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE"; 
const SHEET_NAME = "Sheet1"; // Assuming data is in "Sheet1" or similar. Adjust if needed.

async function authorize() {
    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    try {
        const token = JSON.parse(await fs.readFile(TOKEN_PATH));
        oAuth2Client.setCredentials(token);
        return oAuth2Client;
    } catch (err) {
        console.log('No token.json found, attempting to generate new token...');
        return getNewToken(oAuth2Client);
    }
}

async function getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this URL:', authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve, reject) => {
        rl.question('Enter the code from that page here: ', async (code) => {
            rl.close();
            try {
                const { tokens } = await oAuth2Client.getToken(code);
                oAuth2Client.setCredentials(tokens);
                await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
                console.log('Token stored to', TOKEN_PATH);
                resolve(oAuth2Client);
            } catch (err) {
                console.error('Error retrieving access token', err);
                reject(err);
            }
        });
    });
}

async function getGoogleSheetService() {
    const auth = await authorize();
    return google.sheets({ version: 'v4', auth });
}

async function readAndProcessNewRows() {
    if (GOOGLE_SHEET_ID === "YOUR_GOOGLE_SHEET_ID_HERE") {
        console.error("ERROR: Please update GOOGLE_SHEET_ID in ical_daily_send.js with your actual Google Sheet ID.");
        return;
    }

    const sheets = await getGoogleSheetService();
    const range = `${SHEET_NAME}!A:Z`; // Read a wide range to cover all potential columns

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: range,
        });

        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found in the sheet.');
            return;
        }

        const headers = rows[0];
        const patronNameCol = headers.indexOf('Patron Name');
        const amountCol = headers.indexOf('Amount');
        const paymentOptionCol = headers.indexOf('Payment Option (Cash, Cheque, UPI)');
        const contactNumberCol = headers.indexOf('Contact Number');
        let notificationSentCol = headers.indexOf('Notification Sent');

        // If 'Notification Sent' column doesn't exist, add it
        if (notificationSentCol === -1) {
            console.log("Adding 'Notification Sent' column to the sheet...");
            const newHeader = [...headers, 'Notification Sent'];
            await sheets.spreadsheets.values.update({
                spreadsheetId: GOOGLE_SHEET_ID,
                range: `${SHEET_NAME}!A1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [newHeader],
                },
            });
            notificationSentCol = newHeader.length - 1; // Update index after adding
            console.log("'Notification Sent' column added. Please re-run the script.");
            return; // Re-run to pick up new column
        }

        for (let i = 1; i < rows.length; i++) { // Start from 1 to skip headers
            const row = rows[i];
            const notificationStatus = row[notificationSentCol];

            // Process if 'Notification Sent' is blank or 'FALSE'
            if (!notificationStatus || notificationStatus.toUpperCase() === 'FALSE') {
                const patronName = row[patronNameCol] || 'N/A';
                const amount = row[amountCol] || 'N/A';
                const paymentOption = row[paymentOptionCol] || 'N/A';
                const contactNumber = row[contactNumberCol];

                if (contactNumber) {
                    const message = `Dear ${patronName}, we have received ${amount} via ${paymentOption}.`;
                    const chatId = `${contactNumber}@c.us`;

                    console.log(`Sending message to ${chatId}: ${message}`);
                    try {
                        await client.sendMessage(chatId, message);
                        console.log('Message sent successfully.');

                        // Update 'Notification Sent' column to 'TRUE'
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: GOOGLE_SHEET_ID,
                            range: `${SHEET_NAME}!R${i + 1}C${notificationSentCol + 1}`, // R<row>C<col> notation
                            valueInputOption: 'RAW',
                            resource: {
                                values: [['TRUE']],
                            },
                        });
                        console.log(`Row ${i + 1} marked as 'Notification Sent'.`);
                    } catch (error) {
                        console.error(`Failed to send message to ${chatId} or update sheet for row ${i + 1}:`, error);
                    }
                } else {
                    console.log(`Skipping row ${i + 1}: No contact number found.`);
                }
            }
        }
    } catch (err) {
        console.error('Error reading or processing sheet:', err);
    }
}

// WhatsApp Client setup
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Added --disable-setuid-sandbox for Docker compatibility
    }
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('WhatsApp Client is ready!');
    // Start polling every 60 seconds (60000 milliseconds)
    console.log('Starting to monitor Google Sheet every 60 seconds...');
    await readAndProcessNewRows(); // Initial run
    setInterval(readAndProcessNewRows, 60000);
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
    console.log('Client was disconnected', reason);
});

client.on('message_ack', (msg, ack) => {
    /*
        ack: 0 = WPP.ACK.CLOCK, 1 = WPP.ACK.SENT, 2 = WPP.ACK.RECEIVED, 3 = WPP.ACK.READ, 4 = WPP.ACK.PLAYED
    */
    if (ack === 1) {
        console.log(`Message to ${msg.to} sent successfully (ACK: SENT)`);
    } else if (ack === 2) {
        console.log(`Message to ${msg.to} received by recipient (ACK: RECEIVED)`);
        // Do not destroy client here, as it needs to keep running for polling
    } else if (ack === 3) {
        console.log(`Message to ${msg.to} read by recipient (ACK: READ)`);
    } else {
        console.log(`Message to ${msg.to} acknowledgment: ${ack}`);
    }
});

// Initialize the WhatsApp client
client.initialize();
