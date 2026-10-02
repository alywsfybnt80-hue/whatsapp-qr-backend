const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.QR_BACKEND_TOKEN;

let qrData = null;
let clientReady = false;
let clientState = "disconnected";

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "./auth_state"
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  }
});

function auth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!TOKEN || header !== `Bearer ${TOKEN}`) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}

client.on("qr", async (qr) => {
  qrData = await QRCode.toDataURL(qr);
  clientReady = false;
  clientState = "qr_ready";
  console.log("QR Code generated");
});

client.on("ready", () => {
  qrData = null;
  clientReady = true;
  clientState = "connected";
  console.log("WhatsApp client is ready");
});

client.on("authenticated", () => {
  clientState = "authenticated";
  console.log("WhatsApp authenticated");
});

client.on("auth_failure", (msg) => {
  clientReady = false;
  clientState = "auth_failure";
  console.error("Authentication failure:", msg);
});

client.on("disconnected", (reason) => {
  clientReady = false;
  clientState = "disconnected";
  console.log("WhatsApp disconnected:", reason);
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.get("/qr-generate", auth, (req, res) => {
  if (!qrData) {
    return res.json({
      status: clientReady ? "connected" : clientState,
      qr: null
    });
  }

  res.json({
    status: "qr_ready",
    qr: qrData
  });
});

app.get("/session-status", auth, (req, res) => {
  res.json({
    status: clientState,
    connected: clientReady,
    has_qr: !!qrData
  });
});

app.post("/session-reconnect", auth, async (req, res) => {
  try {
    if (clientReady) {
      return res.json({
        status: "already_connected"
      });
    }

    await client.initialize();

    res.json({
      status: "reconnecting"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

app.post("/session-disconnect", auth, async (req, res) => {
  try {
    await client.logout();

    qrData = null;
    clientReady = false;
    clientState = "disconnected";

    res.json({
      status: "disconnected"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`QR Backend running on port ${PORT}`);
  client.initialize();
});
