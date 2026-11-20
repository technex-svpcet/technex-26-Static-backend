
require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { registrationRouter } = require("./routes/formRoutes");
const dynamicPaymentQrRouter = require("./routes/dynamicPaymentQr");

const app = express();

// ==========================================
// RAILWAY PROXY CONFIGURATION
// ==========================================

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ==========================================
// SECURITY CONFIGURATION
// ==========================================

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  express.json({
    limit: "60kb",
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "60kb",
  })
);

// ==========================================
// PUBLIC DIRECTORY
// ==========================================

const pub = path.join(__dirname, "..", "public");

// ==========================================
// ENABLED REGISTRATION EVENTS
// ==========================================
// Comment an event to disable registration.
// Uncomment it to enable registration.

const ENABLED_EVENTS = new Set([
  "techquest",

  // "overdrive",
  // "coastalclash",
  // "robosumo",
  // "bizcon",

  "vortex",
  "designx",
  "gamerconquest",
]);

// ==========================================
// EVENT SLUG ALIASES
// ==========================================

const EVENT_ALIASES = new Map([
  ["tech-quest", "techquest"],
  ["overdrive-9", "overdrive"],
  ["overdrive-9-0", "overdrive"],
  ["coastal-clash", "coastalclash"],
  ["robo-sumo", "robosumo"],
  ["biz-con", "bizcon"],

  ["design-x", "designx"],
  ["designxstudio", "designx"],
  ["design-x-studio", "designx"],

  ["vortex-valorant", "vortex"],

  ["gamer-conquest", "gamerconquest"],
  ["gamer-conquest-3-0", "gamerconquest"],
  ["gamerconquest-3", "gamerconquest"],
]);

// ==========================================
// EVENT DISPLAY NAMES
// ==========================================

const EVENT_NAMES = Object.freeze({
  techquest: "TECHQUEST 2K26",
  overdrive: "OVERDRIVE 9.0",
  coastalclash: "COASTAL CLASH",
  robosumo: "ROBO SUMO",
  bizcon: "BIZCON 2026",
  vortex: "VORTEX",
  designx: "DESIGNXSTUDIO",
  gamerconquest: "GAMER CONQUEST 3.0",
});

function resolveEvent(slug) {
  const normalized = String(slug || "")
    .trim()
    .toLowerCase();

  return EVENT_ALIASES.get(normalized) || normalized;
}

// ==========================================
// COMING SOON PAGE
// ==========================================

function comingSoonPage(event) {
  const eventName =
    EVENT_NAMES[event] || "TECHNEX EVENT";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
  <meta
    name="theme-color"
    content="#080b15"
  />
  <title>${eventName} | Registration Opening Soon</title>

  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      min-height: 100%;
      background: #080b15;
    }

    body {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      overflow-x: hidden;
      font-family: Arial, Helvetica, sans-serif;
      color: #ffffff;
      background:
        radial-gradient(
          ellipse at 50% 20%,
          rgba(202, 157, 69, 0.12),
          transparent 50%
        ),
        radial-gradient(
          ellipse at 90% 85%,
          rgba(67, 91, 160, 0.10),
          transparent 45%
        ),
        #080b15;
    }

    .glow {
      position: fixed;
      width: 380px;
      height: 380px;
      border-radius: 50%;
      background: rgba(214, 169, 77, 0.08);
      filter: blur(85px);
      pointer-events: none;
      animation: float 8s ease-in-out infinite;
    }

    .glow.one {
      top: -160px;
      left: -130px;
    }

    .glow.two {
      right: -160px;
      bottom: -170px;
      animation-delay: -4s;
    }

    .card {
      position: relative;
      width: 100%;
      max-width: 650px;
      padding: 60px 38px;
      text-align: center;
      border: 1px solid rgba(216, 176, 99, 0.25);
      border-radius: 22px;
      background: rgba(13, 17, 30, 0.88);
      box-shadow:
        0 25px 80px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
      animation: appear 0.7s ease both;
    }

    .eyebrow {
      color: #d5ad65;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 5px;
      text-transform: uppercase;
    }

    .line {
      width: 65px;
      height: 2px;
      margin: 24px auto;
      background: linear-gradient(
        90deg,
        transparent,
        #d8ac61,
        transparent
      );
    }

    .event {
      margin-bottom: 18px;
      color: #f0d5a0;
      font-size: clamp(14px, 3vw, 18px);
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
    }

    h1 {
      font-size: clamp(34px, 7vw, 56px);
      line-height: 1.12;
      font-weight: 800;
      letter-spacing: -1.5px;
    }

    h1 span {
      display: block;
      margin-top: 7px;
      color: #e6b96b;
    }

    .description {
      max-width: 460px;
      margin: 26px auto 0;
      color: #aeb5c5;
      font-size: 16px;
      line-height: 1.8;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-top: 30px;
      padding: 12px 20px;
      border: 1px solid rgba(216, 176, 99, 0.25);
      border-radius: 30px;
      color: #e9c58c;
      background: rgba(216, 176, 99, 0.07);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e6b96b;
      box-shadow: 0 0 12px #e6b96b;
      animation: pulse 2s infinite;
    }

    .footer {
      margin-top: 38px;
      color: #737d91;
      font-size: 11px;
      letter-spacing: 2px;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.45;
        transform: scale(0.8);
      }
    }

    @keyframes float {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(30px);
      }
    }

    @keyframes appear {
      from {
        opacity: 0;
        transform: translateY(18px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 600px) {
      body {
        padding: 16px;
      }

      .card {
        padding: 48px 22px;
        border-radius: 16px;
      }

      .eyebrow {
        letter-spacing: 3px;
      }

      .description {
        font-size: 14px;
      }

      .footer {
        font-size: 10px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation: none !important;
      }
    }
  </style>
</head>

<body>
  <div class="glow one"></div>
  <div class="glow two"></div>

  <main class="card">
    <div class="eyebrow">TECHNEX 2026</div>

    <div class="line"></div>

    <div class="event">${eventName}</div>

    <h1>
      REGISTRATION
      <span>OPENING SOON</span>
    </h1>

    <p class="description">
      Registration for this event will be live soon.
      We're getting everything ready for an incredible
      experience. Stay tuned for updates!
    </p>

    <div class="status">
      <span class="dot"></span>
      Coming Soon
    </div>

    <div class="footer">
      TECHNEX '26 &nbsp; | &nbsp; SVPCET NAGPUR
    </div>
  </main>
</body>
</html>`;
}

// ==========================================
// REGISTRATION RATE LIMITING
// ==========================================

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many registration attempts. Try again after 15 minutes.",
  },
});

// ==========================================
// REGISTRATION API
// ==========================================
// Disabled events cannot submit registrations.

app.use("/api/register/:event", (req, res, next) => {
  const event = resolveEvent(req.params.event);

  if (!ENABLED_EVENTS.has(event)) {
    return res.status(403).json({
      success: false,
      message:
        "Registration for this event is not open yet.",
    });
  }

  // Normalize aliases for the controller.
  req.params.event = event;

  next();
});

app.use(
  "/api/register",
  limiter,
  registrationRouter
);

// ==========================================
// DYNAMIC EVENT PAYMENT QR
// ==========================================

app.use("/api", dynamicPaymentQrRouter);

// ==========================================
// HEALTH CHECK - RAILWAY
// ==========================================

app.get("/health", (req, res) => {
  return res.status(200).json({
    ok: true,
    service: "TECHNEX registrations",
  });
});

// ==========================================
// DEFAULT PAGE
// ==========================================

app.get("/", (req, res) => {
  return res.redirect("/register/techquest");
});

// ==========================================
// EVENT REGISTRATION PAGES
// ==========================================

app.get("/register/:event", (req, res) => {
  const event = resolveEvent(req.params.event);

  res.setHeader("Cache-Control", "no-store");

  // Serve active registration forms.
  if (ENABLED_EVENTS.has(event)) {
    return res.sendFile(
      path.join(
        pub,
        "Registrataion",
        `${event}.html`
      )
    );
  }

  // Show coming-soon page instead of Unstop.
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  return res.status(200).send(
    comingSoonPage(event)
  );
});

// ==========================================
// WORKSHOP PAYMENT QR
// ==========================================

app.get("/api/workshop-payment-qr", (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  return res.sendFile(
    path.join(
      pub,
      "workshops",
      "technex-payment.jpg"
    )
  );
});

// ==========================================
// REGISTRATION SUCCESS PAGE
// ==========================================

app.get("/registration-success", (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  return res.sendFile(
    path.join(
      pub,
      "Landing pages",
      "registration-success.html"
    )
  );
});

// ==========================================
// STATIC ASSETS SECURITY
// ==========================================

app.use(
  "/assets",

  (req, res, next) => {
    let decodedPath;

    try {
      decodedPath = decodeURIComponent(req.path);
    } catch {
      return res.status(400).json({
        message: "Invalid asset path.",
      });
    }

    if (/\.html?\/?$/i.test(decodedPath)) {
      return res.status(404).json({
        message: "Page not found.",
      });
    }

    const normalizedPath = path.posix.normalize(
      decodedPath.replace(/\\/g, "/")
    );

    if (
      /^\/?Registrataion(?:\/|$)/i.test(
        normalizedPath
      )
    ) {
      return res.status(404).json({
        message: "Page not found.",
      });
    }

    return next();
  },

  express.static(pub, {
    index: false,
    dotfiles: "deny",
    redirect: false,
  })
);

// ==========================================
// UNKNOWN ROUTES
// ==========================================

app.use((req, res) => {
  return res.status(404).json({
    message: "Page or API endpoint not found.",
  });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {
  console.error("Request failed:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  const candidate = err.status || err.statusCode;

  const status =
    Number.isInteger(candidate) &&
    candidate >= 400 &&
    candidate <= 599
      ? candidate
      : 500;

  return res.status(status).json({
    success: false,
    message:
      status < 500
        ? "Invalid request or requested resource unavailable."
        : "Registration could not be processed. Please try again.",
  });
});

// ==========================================
// START SERVER - RAILWAY COMPATIBLE
// ==========================================

const port = Number(process.env.PORT) || 8080;

if (require.main === module) {
  const server = app.listen(
    port,
    "0.0.0.0",
    () => {
      console.log("");
      console.log("====================================");
      console.log(" TECHNEX 2026 Registration Server");
      console.log("====================================");

      console.log(
        `Environment: ${
          process.env.NODE_ENV || "development"
        }`
      );

      console.log(`Port: ${port}`);
      console.log("Server started successfully.");

      console.log("------------------------------------");
      console.log(" Enabled Registration Events");
      console.log("------------------------------------");

      for (const event of ENABLED_EVENTS) {
        console.log(`/register/${event}`);
      }

      console.log("------------------------------------");
      console.log(" Registration Opening Soon");
      console.log("------------------------------------");

      for (const event of Object.keys(EVENT_NAMES)) {
        if (!ENABLED_EVENTS.has(event)) {
          console.log(`/register/${event}`);
        }
      }

      console.log("------------------------------------");
      console.log(" Dynamic Payment QR");
      console.log("------------------------------------");

      console.log(
        "/api/payment-qr/:event?teamSize=N"
      );

      console.log("------------------------------------");
      console.log("Health Check: /health");
      console.log("====================================");
      console.log("");
    }
  );

  server.on("error", (error) => {
    console.error(
      "Server startup failed:",
      error.message
    );

    process.exit(1);
  });

  function shutdown(signal) {
    console.log(
      `${signal} received. Shutting down...`
    );

    const timeout = setTimeout(() => {
      console.error("Shutdown timed out.");
      process.exit(1);
    }, 10000);

    timeout.unref();

    server.close(() => {
      clearTimeout(timeout);
      console.log("Server closed successfully.");
      process.exit(0);
    });
  }

  process.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  process.once("SIGINT", () => {
    shutdown("SIGINT");
  });
}

module.exports = app;
