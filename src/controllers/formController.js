
const { randomUUID } = require("crypto");
const { Readable } = require("stream");
const { getClients } = require("../config/main.config");

// ==========================================
// GOOGLE SHEETS HEADERS
// ==========================================

const HEADERS = [
  "Timestamp",
  "Event",
  "Registration ID",
  "Team Size",
  "Participant Count",
  "Total Amount (INR)",
  "Team Name",
  "Name",
  "Emails",
  "Phone no",
  "College",
  "Branch",
  "YEAR",
  "UTR-TRN no",
  "Screenshot link",
];

// ==========================================
// EVENT CONFIGURATION
// ==========================================

const EVENTS = Object.freeze({
  techquest: {
    tab: "TechQuest",
    min: 2,
    max: 5,
    fee: 50,
    feeType: "perParticipant",
  },

  overdrive: {
    tab: "Overdrive",
    min: 2,
    max: 4,
    fee: 450,
    feeType: "perTeam",
  },

  coastalclash: {
    tab: "Coastal Clash",
    min: 1,
    max: 4,
    fee: 399,
    feeType: "perTeam",
  },

  robosumo: {
    tab: "Robo Sumo",
    min: 1,
    max: 4,
    fee: 500,
    feeType: "perTeam",
  },

  bizcon: {
    tab: "BizCon",
    min: 2,
    max: 4,
    fees: Object.freeze({
      2: 299,
      3: 349,
      4: 399,
    }),
    feeType: "tiered",
  },

  vortex: {
    tab: "Vortex",
    min: 5,
    max: 5,
    fee: 500,
    feeType: "perTeam",
  },

  designx: {
    tab: "DesignXStudio",
    min: 1,
    max: 1,
    fee: 200,
    feeType: "perTeam",
  },

  gamerconquest: {
    tab: "Gamer Conquest",
    min: 1,
    max: 4,
    fee: 0,
    feeType: "perTeam",
  },
  envision: {
  tab: "Envision",
  min: 2,
  max: 4,
  fees: {
    2: 350,
    3: 400,
    4: 450,
  },
  feeType: "tiered",
},
});

// ==========================================
// VALIDATION HELPERS
// ==========================================

const clean = (value, max = 120) =>
  typeof value === "string"
    ? value.trim().slice(0, max)
    : "";

const safe = (value) => {
  if (typeof value !== "string") return value;

  return /^[=+@\-\t\r\n]/.test(value)
    ? "'" + value
    : value;
};

const normalize = (value) =>
  String(value || "")
    .replace(/^'(?=[=+@-])/, "")
    .trim()
    .toLowerCase();

const validEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validPhone = (value) =>
  typeof value === "string" &&
  /^[6-9][0-9]{9}$/.test(value);

const validTransaction = (value) =>
  /^[a-zA-Z0-9_/-]{6,100}$/.test(value);

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ==========================================
// SERVER-SIDE FEE CALCULATION
// ==========================================

function calculateFee(cfg, size) {
  if (
    !Number.isInteger(size) ||
    size < cfg.min ||
    size > cfg.max
  ) {
    return null;
  }

  let amount;

  if (cfg.feeType === "tiered") {
    amount = cfg.fees?.[size];
  } else if (cfg.feeType === "perParticipant") {
    amount = cfg.fee * size;
  } else if (cfg.feeType === "perTeam") {
    amount = cfg.fee;
  } else {
    return null;
  }

  return Number.isSafeInteger(amount) && amount >= 0
    ? amount
    : null;
}

// ==========================================
// VALIDATE IMAGE CONTENT
// ==========================================

function validImage(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return false;

  if (mimeType === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([
          137, 80, 78, 71, 13, 10, 26, 10,
        ])
      )
    );
  }

  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
}

// ==========================================
// VERIFY GOOGLE DRIVE FOLDER
// ==========================================

async function assertUploadFolder(drive, folder) {
  const response = await drive.files.get({
    fileId: folder,
    fields: "id,mimeType,capabilities(canAddChildren)",
    supportsAllDrives: true,
  });

  if (
    !response.data ||
    response.data.mimeType !==
      "application/vnd.google-apps.folder" ||
    !response.data.capabilities?.canAddChildren
  ) {
    throw new Error(
      "Google Drive upload folder is not accessible or writable."
    );
  }
}

// ==========================================
// CREATE OR VALIDATE GOOGLE SHEETS TAB
// ==========================================

async function ensureTab(sheets, spreadsheetId, tab) {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const tabExists = metadata.data.sheets?.some(
    (sheet) => sheet.properties.title === tab
  );

  if (!tabExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: tab,
              },
            },
          },
        ],
      },
    });
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tab}'!A1:O1`,
  });

  const existingHeaders = response.data.values?.[0] || [];

  if (!existingHeaders.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tab}'!A1:O1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [HEADERS],
      },
    });

    return;
  }

  const headersMatch =
    existingHeaders.length === HEADERS.length &&
    HEADERS.every(
      (header, index) =>
        String(existingHeaders[index] || "").trim() ===
        header
    );

  if (!headersMatch) {
    throw new Error(
      `The "${tab}" sheet has an incompatible column structure. Back up and migrate its existing records first.`
    );
  }
}

// ==========================================
// REGISTRATION LOCK
// ==========================================

let registrationQueue = Promise.resolve();

async function withRegistrationLock(callback) {
  const previous = registrationQueue;

  let release;

  registrationQueue = new Promise((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await callback();
  } finally {
    release();
  }
}

// ==========================================
// GLOBAL TRANSACTION DUPLICATE CHECK
// ==========================================

async function isTransactionAlreadyUsed(
  sheets,
  spreadsheetId,
  transactionId
) {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const existingTabs = new Set(
    (metadata.data.sheets || []).map(
      (sheet) => sheet.properties.title
    )
  );

  const eventTabs = [
    ...new Set(
      Object.values(EVENTS).map((cfg) => cfg.tab)
    ),
  ];

  const normalizedTransaction = normalize(transactionId);

  for (const tab of eventTabs) {
    if (!existingTabs.has(tab)) continue;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'!N2:N`,
    });

    const transactions = response.data.values || [];

    const duplicate = transactions.some(
      (row) =>
        normalize(row[0]) === normalizedTransaction
    );

    if (duplicate) return true;
  }

  return false;
}

// ==========================================
// MAIN REGISTRATION CONTROLLER
// ==========================================

async function register(req, res, next) {
  try {
    const event = String(req.params.event || "")
      .trim()
      .toLowerCase();

    const cfg = Object.prototype.hasOwnProperty.call(
      EVENTS,
      event
    )
      ? EVENTS[event]
      : null;

    // ======================================
    // EVENT VALIDATION
    // ======================================

    if (!cfg) {
      return res.status(404).json({
        success: false,
        message: "Event registration is not enabled",
      });
    }

    const body = req.body || {};

    const size = Number(body.teamSize);
    const team = clean(body.teamName, 100);
    const txn = clean(body.transactionid, 100);

    const isFree = event === "gamerconquest";
    const gameMode = clean(
      body.gameMode,
      20
    ).toUpperCase();

    // ======================================
    // TEAM SIZE VALIDATION
    // ======================================

    if (
      !Number.isInteger(size) ||
      size < cfg.min ||
      size > cfg.max
    ) {
      return res.status(400).json({
        success: false,
        message: `Team size must be ${cfg.min}-${cfg.max}`,
      });
    }

    // Gamer Conquest:
    // BGMI = 4 players
    // RC24 = 1 player

    if (
      isFree &&
      !(
        (gameMode === "BGMI" && size === 4) ||
        (gameMode === "RC24" && size === 1)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Choose BGMI with 4 players or RC24 with 1 player",
      });
    }

    if (team.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid team name",
      });
    }

    // ======================================
    // SERVER-SIDE FEE CALCULATION
    // ======================================

    const totalAmount = calculateFee(cfg, size);

    if (totalAmount === null) {
      return res.status(503).json({
        success: false,
        message:
          "Registration fee has not been configured.",
      });
    }

    // ======================================
    // PAYMENT VALIDATION
    // ======================================

    let extension = null;

    // Gamer Conquest is free.
    // No UTR or screenshot required.

    if (!isFree) {
      if (!validTransaction(txn)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid UTR or transaction reference",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Upload your payment screenshot",
        });
      }

      extension =
        ALLOWED_IMAGE_TYPES[req.file.mimetype];

      if (!extension) {
        return res.status(400).json({
          success: false,
          message:
            "Only JPEG, PNG and WEBP screenshots are allowed",
        });
      }

      if (
        !Buffer.isBuffer(req.file.buffer) ||
        !req.file.buffer.length ||
        req.file.buffer.length > MAX_FILE_SIZE
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Screenshot must be a valid image under 5 MB",
        });
      }

      if (
        !validImage(
          req.file.buffer,
          req.file.mimetype
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid screenshot image",
        });
      }
    }

    // ======================================
    // PARTICIPANT VALIDATION
    // ======================================

    const members = [];
    const seenEmails = new Set();

    for (let i = 1; i <= size; i++) {
      const name = clean(body[`name${i}`]);

      const email = clean(
        body[`email${i}`]
      ).toLowerCase();

      const phone = clean(body[`phone${i}`]);
      const year = clean(body[`year${i}`]);
      const branch = clean(body[`branch${i}`]);

      const selectedCollege = clean(
        body[`college${i}`]
      );

      const college =
        selectedCollege === "Other"
          ? clean(body[`customCollege${i}`])
          : selectedCollege;

      const selectedCourse = clean(
        body[`course${i}`]
      );

      const course =
        selectedCourse === "Other"
          ? clean(body[`customCourse${i}`])
          : selectedCourse;

      if (!validPhone(phone)) {
        return res.status(400).json({
          success: false,
          message:
            `Member ${i}: enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.`,
        });
      }

      if (
        name.length < 2 ||
        !validEmail(email) ||
        !["I", "II", "III", "IV"].includes(year) ||
        !branch ||
        !college ||
        !course
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Check all details for member ${i}`,
        });
      }

      if (seenEmails.has(email)) {
        return res.status(400).json({
          success: false,
          message:
            "Team members must have different email addresses",
        });
      }

      seenEmails.add(email);

      members.push({
        name,
        email,
        phone,
        year,
        branch,
        college,
        course,
      });
    }

    // ======================================
    // GOOGLE API CLIENTS
    // ======================================

    const {
      sheets,
      drive,
      spreadsheetId,
    } = getClients();

    if (!spreadsheetId) {
      throw new Error(
        "Missing GOOGLE_SPREADSHEET_ID"
      );
    }

    const folder =
      process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

    // Free registration needs no screenshot.
    if (!isFree && !folder) {
      throw new Error(
        "Missing GOOGLE_DRIVE_FOLDER_ID"
      );
    }

    // ======================================
    // REGISTRATION AND UPLOAD
    // ======================================

    return await withRegistrationLock(async () => {
      await ensureTab(
        sheets,
        spreadsheetId,
        cfg.tab
      );

      const previous =
        await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${cfg.tab}'!A2:O`,
        });

      const rows = previous.data.values || [];

      // ====================================
      // DUPLICATE TEAM NAME CHECK
      // ====================================

      const duplicateTeam = rows.some(
        (row) =>
          normalize(row[6]) === normalize(team)
      );

      if (duplicateTeam) {
        return res.status(409).json({
          success: false,
          message:
            "This team name is already registered",
        });
      }

      // ====================================
      // DUPLICATE TRANSACTION CHECK
      // ====================================

      if (!isFree) {
        const duplicateTransaction =
          await isTransactionAlreadyUsed(
            sheets,
            spreadsheetId,
            txn
          );

        if (duplicateTransaction) {
          return res.status(409).json({
            success: false,
            message:
              "This transaction ID has already been submitted for a TECHNEX event.",
          });
        }
      }

      // ====================================
      // BIZCON PARTICIPANT RESTRICTION
      // ====================================

      if (event === "bizcon") {
        const registeredEmails = new Set(
          rows.map((row) => normalize(row[8]))
        );

        const duplicateParticipant = members.some(
          (member) =>
            registeredEmails.has(
              normalize(member.email)
            )
        );

        if (duplicateParticipant) {
          return res.status(409).json({
            success: false,
            message:
              "A participant is already registered with another BizCon team.",
          });
        }
      }

      // ====================================
      // GENERATE REGISTRATION ID
      // ====================================

      const registrationId = randomUUID();
      const timestamp = new Date().toISOString();

      let screenshotLink = "";

      // ====================================
      // UPLOAD PAYMENT SCREENSHOT
      // ====================================

      if (!isFree) {
        await assertUploadFolder(drive, folder);

        const driveResponse =
          await drive.files.create({
            supportsAllDrives: true,

            requestBody: {
              name:
                `${event}-${registrationId}.${extension}`,
              parents: [folder],
            },

            media: {
              mimeType: req.file.mimetype,
              body: Readable.from(
                req.file.buffer
              ),
            },

            fields: "id,webViewLink",
          });

        const screenshotId =
          driveResponse.data.id;

        if (!screenshotId) {
          throw new Error(
            "Payment screenshot upload failed"
          );
        }

        screenshotLink =
          driveResponse.data.webViewLink ||
          `https://drive.google.com/file/d/${screenshotId}/view`;
      }

      // ====================================
      // PREPARE GOOGLE SHEETS ROWS
      // ====================================

      // Preserve existing 15 columns.
      // Save Gamer Conquest game in team name.

      const sheetTeamName = isFree
        ? `${team} (${gameMode})`
        : team;

      const values = members.map(
        (member, i) => [
          timestamp,
          cfg.tab,
          registrationId,
          size,
          i + 1,
          totalAmount,
          safe(sheetTeamName),
          safe(member.name),
          safe(member.email),
          safe(member.phone),
          safe(member.college),
          safe(member.branch),
          safe(member.year),
          isFree ? "" : safe(txn),
          screenshotLink,
        ]
      );

      // ====================================
      // SAVE TO GOOGLE SHEETS
      // ====================================

      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `'${cfg.tab}'!A:O`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: {
            values,
          },
        });
      } catch (error) {
        console.error(
          "Sheets append failed for registration:",
          registrationId
        );

        throw error;
      }

      // ====================================
      // SUCCESS RESPONSE
      // ====================================

      return res.status(201).json({
        success: true,
        registrationId,
        event: cfg.tab,
        teamName: team,
        teamSize: size,
        participantCount: members.length,

        ...(isFree ? { gameMode } : {}),

        feeType: cfg.feeType,
        totalAmount,

        paymentStatus: isFree
          ? "Not Required"
          : "Pending Verification",

        message: isFree
          ? "Free registration submitted successfully."
          : "Registration and payment screenshot submitted successfully.",
      });
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { register };
