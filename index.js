const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth()
});

let isClientReady = false;

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR scan karo WhatsApp > Linked Devices se');
});

client.on('ready', () => {
    console.log('WhatsApp Client ready! Server requests accept karne ke liye taiyaar hai.');
    isClientReady = true;
});

client.initialize();

// ========================================
// MESSAGE TEMPLATES - har trigger ke liye
// ========================================

const messageTemplates = {

    // 1. Documents upload hue
    DocUpload: (name, docListArr) => {
        let docListText = '';
        if (Array.isArray(docListArr) && docListArr.length > 0) {
            docListText = docListArr.map(d => `• ${d}`).join('\n');
        } else {
            docListText = 'No documents listed.';
        }
        return `Dear ${name},\nThank you! We have received the following documents from you:\n\n${docListText}\n\nOur team will review them and contact you if any additional information is required.\n\nWarm regards,\nTeam ITR, Rishabh Raja & Co.`;
    },

    // 2. Reminder - koi document upload nahi hua
    Reminder: (name) =>
        `Dear ${name},\nThis is a gentle reminder that we have not yet received your documents. Please upload them at your earliest convenience so we can proceed with your ITR filing.\n\nWarm regards,\nTeam ITR, Rishabh Raja & Co.`,

    // 3. Discussion stage
    Discussion: (name) =>
        `Dear ${name},\nWe have reviewed your data and would like to discuss a few points with you regarding your ITR. Our team will be in touch with you shortly.\n\nWarm regards,\nTeam ITR, Rishabh Raja & Co.`,

    // 4. Confirmation stage (with draft file attached)
    Confirmation: (name) =>
        `Dear ${name},\nPlease find attached the draft of your ITR for review. Kindly go through it and confirm so we can proceed with the final filing.\n\nWarm regards,\nTeam ITR, Rishabh Raja & Co.`,

    // 5. Billing stage
    Billing: (name) =>
        `Dear ${name},\nYour ITR filing process is complete on our end. Please find the billing details shared separately. Kindly process the payment at your earliest convenience.\n\nWarm regards,\nTeam ITR, Rishabh Raja & Co.`,

    // 6. Filed - final stage
    Filed: (name) =>
        `Dear ${name},\nWe are pleased to inform you that your Income Tax Return has been successfully filed. Thank you for your cooperation throughout the process.\n\nWarm regards,\nTeam ITR, Rishabh Raja & Co.`
};

// ========================================
// MAIN API ENDPOINT
// ========================================
// Zoho Creator yahan POST request bhejega with:
// { "Name": "...", "Phone_Number": "...", "Trigger": "DocUpload" / "Reminder" / "Discussion" / "Confirmation" / "Billing" / "Filed", "FileURL": "..." (optional, only for Confirmation) }

app.post('/send-whatsapp', async (req, res) => {
    try {
        if (!isClientReady) {
            return res.status(503).json({ success: false, error: 'WhatsApp client abhi ready nahi hai' });
        }

        const { Name, Phone_Number, Trigger, FileURL, DocList } = req.body;

        if (!Name || !Phone_Number || !Trigger) {
            return res.status(400).json({ success: false, error: 'Name, Phone_Number, aur Trigger zaroori hain' });
        }

        const templateFn = messageTemplates[Trigger];
        if (!templateFn) {
            return res.status(400).json({ success: false, error: `Unknown trigger: ${Trigger}` });
        }

        let number = Phone_Number.toString().replace(/[\s-]/g, '');
        if (!number.startsWith('91')) {
            number = '91' + number;
        }

        const chatId = number + '@c.us';
        const message = templateFn(Name, DocList);

        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
            return res.status(404).json({ success: false, error: `${number} WhatsApp pe registered nahi hai` });
        }

        // Agar Confirmation trigger hai aur file URL diya gaya hai, to file ke saath message bhejo
        if (Trigger === 'Confirmation' && FileURL) {
            try {
                const media = await MessageMedia.fromUrl(FileURL, { unsafeMime: true });
                await client.sendMessage(chatId, media, { caption: message });
                console.log(`Sent "${Trigger}" message with file to ${Name} (${number})`);
            } catch (fileErr) {
                console.error('File fetch/send failed, sending text only:', fileErr.message);
                await client.sendMessage(chatId, message, { linkPreview: false });
            }
        } else {
            await client.sendMessage(chatId, message, { linkPreview: false });
            console.log(`Sent "${Trigger}" message to ${Name} (${number})`);
        }

        res.json({ success: true, message: `Message sent to ${Name} for trigger: ${Trigger}` });

    } catch (err) {
        console.error('Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', whatsappReady: isClientReady });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API endpoint: POST http://localhost:${PORT}/send-whatsapp`);
});