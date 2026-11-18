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

const EVENTS = {
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
    fee: null,
    feeType: "perTeam",
  },

  bizcon: {
    tab: "BizCon",
    min: 1,
    max: 4,
    fee: null,
    feeType: "perTeam",
  },
};

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
  /^[6-9][0-9]{9}$/.test(value);

const validTransaction = (value) =>
  /^[a-zA-Z0-9_\/-]{6,100}$/.test(value);

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ==========================================
// CALCULATE REGISTRATION FEE
// ==========================================

function calculateFee(cfg, size) {
  if (
    typeof cfg.fee !== "number" ||
    !Number.isFinite(cfg.fee) ||
    cfg.fee < 0
  ) {
    return null;
  }

  if (cfg.feeType === "perParticipant") {
    return cfg.fee * size;
  }

  return cfg.fee;
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
// CREATE GOOGLE SHEETS TAB
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
    range: `'${tab}'!A1:P1`,
  });

  const existingHeaders =
    response.data.values?.[0] || [];

  // Create headers if the sheet is empty.

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

  // Protect existing spreadsheet data.

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
// Prevent simultaneous duplicate submissions
// within a single Node.js process.
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
// MAIN REGISTRATION CONTROLLER
// ==========================================

async function register(req, res, next) {
  try {
    const event = req.params.event;

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
        message: "Event registration is not enabled",
      });
    }

    // Registration remains closed until
    // the official fee has been configured.

    if (
      typeof cfg.fee !== "number" ||
      !Number.isFinite(cfg.fee) ||
      cfg.fee < 0
    ) {
      return res.status(503).json({
        message:
          "Registration is not open yet for this event.",
      });
    }

    const body = req.body || {};

    const size = Number(body.teamSize);

    const team = clean(body.teamName, 100);

    const txn = clean(body.transactionid, 100);

    // ======================================
    // TEAM SIZE VALIDATION
    // ======================================

    if (
      !Number.isInteger(size) ||
      size < cfg.min ||
      size > cfg.max
    ) {
      return res.status(400).json({
        message:
          `Team size must be ${cfg.min}-${cfg.max}`,
      });
    }

    if (team.length < 2) {
      return res.status(400).json({
        message: "Enter a valid team name",
      });
    }

    // ======================================
    // SERVER-SIDE FEE CALCULATION
    // ======================================

    const totalAmount = calculateFee(cfg, size);

    if (totalAmount === null) {
      return res.status(503).json({
        message:
          "Registration fee has not been configured.",
      });
    }

    // ======================================
    // TRANSACTION REFERENCE VALIDATION
    // ======================================

    if (!validTransaction(txn)) {
      return res.status(400).json({
        message:
          "Enter a valid UTR or transaction reference",
      });
    }

    // ======================================
    // SCREENSHOT VALIDATION
    // ======================================

    if (!req.file) {
      return res.status(400).json({
        message: "Upload your payment screenshot",
      });
    }

    const extension =
      ALLOWED_IMAGE_TYPES[req.file.mimetype];

    if (!extension) {
      return res.status(400).json({
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
        message: "Invalid screenshot image",
      });
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

      // Validate participant details.

      if (
        name.length < 2 ||
        !validEmail(email) ||
        !validPhone(phone) ||
        !["I", "II", "III", "IV"].includes(year) ||
        !branch ||
        !college ||
        !course
      ) {
        return res.status(400).json({
          message:
            `Check all details for member ${i}`,
        });
      }

      // Prevent repeated emails in one team.

      if (seenEmails.has(email)) {
        return res.status(400).json({
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

    if (!folder) {
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
      // Column G = index 6
      // ====================================

      const duplicateTeam = rows.some(
        (row) =>
          normalize(row[6]) === normalize(team)
      );

      if (duplicateTeam) {
        return res.status(409).json({
          message:
            "This team name is already registered",
        });
      }

      // ====================================
      // DUPLICATE TRANSACTION CHECK
      // Column N = index 13
      // ====================================

      const duplicateTransaction = rows.some(
        (row) =>
          normalize(row[13]) === normalize(txn)
      );

      if (duplicateTransaction) {
        return res.status(409).json({
          message:
            "This transaction reference has already been submitted",
        });
      }

      // ====================================
      // BIZCON PARTICIPANT RESTRICTION
      // One participant can join one team.
      // Column I = index 8
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
            message:
              "A participant is already registered with another BizCon team.",
          });
        }
      }

      // ====================================
      // VERIFY GOOGLE DRIVE FOLDER
      // ====================================

      await assertUploadFolder(drive, folder);

      // ====================================
      // GENERATE REGISTRATION ID
      // ====================================

      const registrationId = randomUUID();

      const timestamp = new Date().toISOString();

      // ====================================
      // UPLOAD PAYMENT SCREENSHOT
      // ====================================

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

      // ====================================
      // GOOGLE DRIVE SCREENSHOT LINK
      // ====================================

      const screenshotLink =
        driveResponse.data.webViewLink ||
        `https://drive.google.com/file/d/${screenshotId}/view`;

      // ====================================
      // PREPARE GOOGLE SHEETS ROWS
      // ====================================

      const values = members.map((member, i) => [
        timestamp,            // A - Timestamp
        cfg.tab,              // B - Event
        registrationId,       // C - Registration ID
        size,                 // D - Team Size
        i + 1,                // E - Participant Count
        totalAmount,          // F - Total Amount
        safe(team),           // G - Team Name
        safe(member.name),    // H - Name
        safe(member.email),   // I - Emails
        safe(member.phone),   // J - Phone no
        safe(member.college), // K - College
        safe(member.branch),  // L - Branch
        safe(member.year),    // M - YEAR
        safe(txn),            // N - UTR-TRN no
        screenshotLink,       // O - Screenshot link
      ]);

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

        // Preserve uploaded evidence for
        // authorized organizer review.
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

        feeType: cfg.feeType,

        totalAmount,

        paymentStatus: "Pending Verification",

        message:
          "Registration and payment screenshot submitted successfully.",
      });
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { register };