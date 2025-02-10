// 1️⃣ Cấu hình dotenv để đọc biến môi trường
require("dotenv").config();

// 2️⃣ Import thư viện
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

// 3️⃣ Middleware xử lý dữ liệu JSON
app.use(express.json());

// 4️⃣ Xác minh webhook từ Facebook
app.get("/webhook", (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook đã xác minh thành công!");
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 5️⃣ Thiết lập menu cố định
async function setupPersistentMenu() {
    const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
    const request_body = {
        persistent_menu: [
            {
                locale: "default",
                composer_input_disabled: false,
                call_to_actions: [
                    {
                        type: "postback",
                        title: "🎬 Bắt đầu trò chuyện",
                        payload: "START_CHAT"
                    },
                    {
                        type: "postback",
                        title: "🚫 Kết thúc trò chuyện",
                        payload: "END_CHAT"
                    }
                ]
            }
        ]
    };

    try {
        const response = await axios.post(`https://graph.facebook.com/v12.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`, request_body);
        console.log("📌 Menu cố định đã được thiết lập!", response.data);
    } catch (error) {
        console.error("❌ Lỗi khi thiết lập menu:", error.response?.data || error.message);
    }
}
setupPersistentMenu();

// 6️⃣ Danh sách chờ và cặp trò chuyện
const waitingUsers = []; // Danh sách người dùng đang chờ
const activeChats = new Map(); // Map { userId1 => userId2, userId2 => userId1 }

// 7️⃣ Xử lý tin nhắn từ Messenger
app.post("/webhook", (req, res) => {
    const body = req.body;

    if (body.object === "page") {
        body.entry.forEach(entry => {
            entry.messaging.forEach(webhook_event => {
                const sender_psid = webhook_event.sender.id;

                console.log("📩 Nhận tin nhắn từ:", sender_psid);

                if (webhook_event.message) {
                    handleMessage(sender_psid, webhook_event.message);
                } else if (webhook_event.postback) {
                    handlePostback(sender_psid, webhook_event.postback.payload);
                }
            });
        });

        res.status(200).send("EVENT_RECEIVED");
    } else {
        res.sendStatus(404);
    }
});

// 8️⃣ Xử lý postback từ menu
function handlePostback(sender_psid, payload) {
    if (payload === "START_CHAT") {
        handleStart(sender_psid);
    } else if (payload === "END_CHAT") {
        handleEnd(sender_psid);
    }
}

// 9️⃣ Hàm xử lý lệnh "Start"
function handleStart(sender_psid) {
    if (waitingUsers.length > 0) {
        const partner_psid = waitingUsers.shift();
        activeChats.set(sender_psid, partner_psid);
        activeChats.set(partner_psid, sender_psid);

        sendMessage(sender_psid, "✅ Bạn đã được kết nối với một người ẩn danh!");
        sendMessage(partner_psid, "✅ Bạn đã được kết nối với một người ẩn danh!");
    } else {
        waitingUsers.push(sender_psid);
        sendMessage(sender_psid, "🔄 Đang chờ kết nối với một người khác...");
    }
}

// 🔟 Hàm xử lý lệnh "End"
function handleEnd(sender_psid) {
    const partner_psid = activeChats.get(sender_psid);

    if (partner_psid) {
        sendMessage(sender_psid, "💔 Bạn đã rời khỏi cuộc trò chuyện.");
        sendMessage(partner_psid, "💔 Người kia đã rời khỏi cuộc trò chuyện.");
        activeChats.delete(sender_psid);
        activeChats.delete(partner_psid);
    } else {
        sendMessage(sender_psid, "⚠️ Bạn không trong cuộc trò chuyện nào.");
    }
}

// 1️⃣1️⃣ Hàm xử lý tin nhắn (chuyển tiếp giữa hai người dùng)
function handleMessage(sender_psid, received_message) {
    const partner_psid = activeChats.get(sender_psid);

    if (partner_psid) {
        forwardMessage(partner_psid, received_message.text);
    } else {
        sendMessage(sender_psid, "⚠️ Bạn chưa được kết nối. Hãy nhấn 'Bắt đầu trò chuyện' để kết nối!");
    }
}

function forwardMessage(recipient_psid, messageText) {
    sendMessage(recipient_psid, messageText);
}

// 1️⃣2️⃣ Hàm gửi tin nhắn
async function sendMessage(recipient_psid, messageText) {
    const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

    const request_body = {
        recipient: { id: recipient_psid },
        message: { text: messageText }
    };

    try {
        await axios.post(`https://graph.facebook.com/v12.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, request_body);
        console.log("📤 Tin nhắn đã gửi thành công!");
    } catch (error) {
        console.error("❌ Lỗi khi gửi tin nhắn:", error.response?.data || error.message);
    }
}

// 1️⃣3️⃣ Khởi động server
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy trên cổng ${PORT}`);
});
