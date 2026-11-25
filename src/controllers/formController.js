const { randomUUID } = require("crypto");
const { Readable } = require("stream");
const { getClients } = require("../config/main.config");

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

const BIZ_FIELDS = [
  ["ideaName", "Idea / product / business name", "text", true],
  ["ideaDescription", "Briefly describe your idea, product, service or solution", "textarea", true],
  ["problemStatement", "What problem or need does your idea address?", "textarea", true],
  ["targetAudience", "Who would benefit from your solution?", "text", true],
  ["industry", "Industry / Domain", [
    "Technology / IT",
    "Healthcare",
    "Education",
    "FinTech",
    "Agriculture",
    "E-commerce / Retail",
    "Sustainability / Environment",
    "Food & Beverage",
    "Manufacturing",
    "Social Innovation",
    "Other",
  ], true],
  ["proposedSolution", "Proposed solution and how it works", "textarea", true],
  ["usp", "What makes your idea different or valuable (USP)?", "textarea", true],
  ["competitors", "Competitors or existing alternatives", "textarea", false],
  ["revenueModel", "How could your idea create value or generate revenue?", "textarea", false],
  ["currentStage", "Current stage", [
    "Concept / Idea Stage",
    "Researching the Problem",
    "Solution Designed",
    "Prototype in Development",
    "Prototype / Demo Ready",
    "Testing / Validation",
    "Launched / In Use",
    "Operating Business",
  ], true],
  ["testingStatus", "Testing / Feedback", [
    "Not tested yet",
    "Discussed with potential users",
    "Received feedback",
    "Prototype tested",
    "Pilot / trial conducted",
    "Other",
  ], false],
  ["feedbackDetails", "Optional testing or feedback details", "textarea", false],
  ["customerStatus", "Customers / Users", [
    "No users or customers yet",
    "People testing the idea",
    "Have active users",
    "Have paying customers",
    "Not applicable at this stage",
  ], false],
  ["biggestChallenge", "Biggest challenge", "textarea", true],
  ["expectedSupport", "What support are you looking for from BIZCON?", [
    "Mentorship",
    "Investor Interaction",
    "Funding Opportunities",
    "Incubation Support",
    "Partnerships",
    "Customer / User Connections",
    "Market Exposure",
    "Networking",
    "Feedback on Idea",
    "Other",
  ], true],
  ["investorInterest", "Interested in presenting at Investor’s Arena?", [
    "Yes",
    "No",
    "Maybe",
  ], true],
  ["fundingRequirement", "Approximate funding requirement (if applicable)", "text", false],
  ["introVideoUrl", "Introduction video link", "url", false],
  ["websiteUrl", "Website / product link / portfolio", "url", false],
  ["legalStructure", "Business / legal structure (if applicable)", [
    "Private Limited Company",
    "LLP",
    "Partnership Firm",
    "Sole Proprietorship",
    "Other Registered Entity",
    "Not Registered / Idea Stage",
  ], false],
  ["demoVideoUrl", "Product demonstration video link", "url", false],
];

const BIZ_HEADERS = BIZ_FIELDS.map(
  (field) => field[1]
).concat([
  "Pitch Deck URL",
  "Product Image URL",
]);

const BIZ_TAB = "BizCon Business Details";

const BIZ_BUSINESS_HEADERS = [
  "Timestamp",
  "Event",
  "Registration ID",
  "Team Size",
  "Participant Count",
  "Team Name",
  "Name",
  "Emails",
  "Phone no",
  "College",
  "Branch",
  "YEAR",
  "Course",
  ...BIZ_HEADERS,
];

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

const bizconCache = new Map();
const bizconFolderCache = new Map();

const BIZCON_CACHE_MS = 60000;

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

function validUrl(value) {
  try {
    const url = new URL(value);

    return ["https:", "http:"].includes(
      url.protocol
    );
  } catch {
    return false;
  }
}

function validDriveUrl(value) {
  try {
    const url = new URL(value);

    if (
      value.length > 1000 ||
      url.protocol !== "https:" ||
      url.hostname !== "drive.google.com" ||
      url.username ||
      url.password ||
      url.port
    ) {
      return false;
    }

    return (
      /^\/(?:drive\/(?:u\/\d+\/)?folders|file\/d)\/[\w-]+(?:\/|$)/.test(
        url.pathname
      ) ||
      (
        url.pathname === "/open" &&
        /^[\w-]+$/.test(
          url.searchParams.get("id") || ""
        )
      )
    );
  } catch {
    return false;
  }
}

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

  const existingHeaders =
    response.data.values?.[0] || [];

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

async function ensureBizconTabs(
  sheets,
  spreadsheetId,
  paymentTab
) {
  const cached = bizconCache.get(spreadsheetId);

  if (cached && cached.expires > Date.now()) {
    return cached.ids;
  }

  await ensureTab(
    sheets,
    spreadsheetId,
    paymentTab
  );

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields:
      "sheets.properties(sheetId,title,gridProperties(columnCount))",
  });

  const allSheets = metadata.data.sheets || [];

  const payment = allSheets.find(
    (sheet) => sheet.properties.title === paymentTab
  )?.properties;

  let business = allSheets.find(
    (sheet) => sheet.properties.title === BIZ_TAB
  )?.properties;

  if (!payment) {
    throw new Error("BizCon payment sheet not found");
  }

  if (!business) {
    const created = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: BIZ_TAB,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: BIZ_BUSINESS_HEADERS.length,
                },
              },
            },
          },
        ],
      },
    });

    business =
      created.data.replies[0].addSheet.properties;
  }

  const currentColumns =
    business.gridProperties.columnCount;

  if (currentColumns < BIZ_BUSINESS_HEADERS.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            appendDimension: {
              sheetId: business.sheetId,
              dimension: "COLUMNS",
              length:
                BIZ_BUSINESS_HEADERS.length -
                currentColumns,
            },
          },
        ],
      },
    });
  }

  const headerResponse =
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${BIZ_TAB}'!1:1`,
    });

  const existingHeaders =
    headerResponse.data.values?.[0] || [];

  if (
    existingHeaders.length &&
    JSON.stringify(existingHeaders) !==
      JSON.stringify(BIZ_BUSINESS_HEADERS)
  ) {
    throw new Error(
      "BizCon Business Details has incompatible headers"
    );
  }

  if (!existingHeaders.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${BIZ_TAB}'!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [BIZ_BUSINESS_HEADERS],
      },
    });
  }

  const ids = {
    payment: payment.sheetId,
    business: business.sheetId,
  };

  bizconCache.set(spreadsheetId, {
    ids,
    expires: Date.now() + BIZCON_CACHE_MS,
  });

  return ids;
}

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

  const normalizedTransaction =
    normalize(transactionId);

  for (const tab of eventTabs) {
    if (!existingTabs.has(tab)) continue;

    const response =
      await sheets.spreadsheets.values.get({
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

async function bizconTransactionsUsed(
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

  const ranges = [
    ...new Set(
      Object.values(EVENTS).map((cfg) => cfg.tab)
    ),
  ]
    .filter((tab) => existingTabs.has(tab))
    .map((tab) => `'${tab}'!N2:N`);

  if (!ranges.length) return false;

  const response =
    await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

  const normalizedTransaction =
    normalize(transactionId);

  return (response.data.valueRanges || []).some(
    (range) =>
      (range.values || []).some(
        (row) =>
          normalize(row[0]) === normalizedTransaction
      )
  );
}

function appendCells(sheetId, rows) {
  return {
    appendCells: {
      sheetId,
      rows: rows.map((row) => ({
        values: row.map((value) => ({
          userEnteredValue:
            typeof value === "number"
              ? { numberValue: value }
              : { stringValue: String(value ?? "") },
        })),
      })),
      fields: "userEnteredValue",
    },
  };
}

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

    if (!cfg) {
      return res.status(404).json({
        success: false,
        message: "Event registration is not enabled",
      });
    }

    const body = req.body || {};

    const bad = (message) =>
      res.status(400).json({
        success: false,
        message,
      });

    const bizAnswers = [];

    if (event === "bizcon") {
      for (
        const [key, label, type, required]
        of BIZ_FIELDS
      ) {
        const value =
          typeof body[key] === "string"
            ? body[key].trim()
            : "";

        const max =
          type === "textarea"
            ? 3000
            : type === "url"
              ? 1000
              : 300;

        if (
          (required && !value) ||
          value.length > max ||
          (
            value &&
            Array.isArray(type) &&
            !type.includes(value)
          )
        ) {
          return bad("Check: " + label);
        }

        if (
          value &&
          type === "url" &&
          !validUrl(value)
        ) {
          return bad("Invalid link: " + label);
        }

        bizAnswers.push(safe(value));
      }

      for (const [key, required] of [
        ["pitchDeckUrl", true],
        ["productImageUrl", false],
      ]) {
        const value =
          typeof body[key] === "string"
            ? body[key].trim()
            : "";

        if (!value && !required) {
          bizAnswers.push("");
          continue;
        }

        if (!validDriveUrl(value)) {
          return bad(
            "Enter a valid Google Drive link for " + key
          );
        }

        bizAnswers.push(safe(value));
      }

      if (req.file?.size > 3 * 1024 * 1024) {
        return bad(
          "Payment screenshot must be under 3 MB."
        );
      }
    }

    const size = Number(body.teamSize);
    const team = clean(body.teamName, 100);
    const txn = clean(body.transactionid, 100);

    const isFree = event === "gamerconquest";

    const gameMode = clean(
      body.gameMode,
      20
    ).toUpperCase();

    if (
      !Number.isInteger(size) ||
      size < cfg.min ||
      size > cfg.max
    ) {
      return bad(
        `Team size must be ${cfg.min}-${cfg.max}`
      );
    }

    if (
      isFree &&
      !(
        (gameMode === "BGMI" && size === 4) ||
        (gameMode === "RC24" && size === 1)
      )
    ) {
      return bad(
        "Choose BGMI with 4 players or RC24 with 1 player"
      );
    }

    if (team.length < 2) {
      return bad("Enter a valid team name");
    }

    const totalAmount = calculateFee(cfg, size);

    if (totalAmount === null) {
      return res.status(503).json({
        success: false,
        message:
          "Registration fee has not been configured.",
      });
    }

    let extension = null;

    if (!isFree) {
      if (!validTransaction(txn)) {
        return bad(
          "Enter a valid UTR or transaction reference"
        );
      }

      if (!req.file) {
        return bad("Upload your payment screenshot");
      }

      extension =
        ALLOWED_IMAGE_TYPES[req.file.mimetype];

      if (!extension) {
        return bad(
          "Only JPEG, PNG and WEBP screenshots are allowed"
        );
      }

      if (
        !Buffer.isBuffer(req.file.buffer) ||
        !req.file.buffer.length ||
        req.file.buffer.length > MAX_FILE_SIZE
      ) {
        return bad(
          "Screenshot must be a valid image under 5 MB"
        );
      }

      if (
        !validImage(
          req.file.buffer,
          req.file.mimetype
        )
      ) {
        return bad("Invalid screenshot image");
      }
    }

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
        return bad(
          `Member ${i}: enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.`
        );
      }

      if (
        name.length < 2 ||
        !validEmail(email) ||
        !["I", "II", "III", "IV"].includes(year) ||
        !branch ||
        !college ||
        !course
      ) {
        return bad(
          `Check all details for member ${i}`
        );
      }

      if (seenEmails.has(email)) {
        return bad(
          "Team members must have different email addresses"
        );
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

    if (!isFree && !folder) {
      throw new Error(
        "Missing GOOGLE_DRIVE_FOLDER_ID"
      );
    }

    return await withRegistrationLock(async () => {
      let bizSheetIds;

      if (event === "bizcon") {
        bizSheetIds = await ensureBizconTabs(
          sheets,
          spreadsheetId,
          cfg.tab
        );
      } else {
        await ensureTab(
          sheets,
          spreadsheetId,
          cfg.tab
        );
      }

      const previous =
        await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${cfg.tab}'!A2:O`,
        });

      const rows = previous.data.values || [];

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

      if (!isFree) {
        const duplicateTransaction =
          await (
            event === "bizcon"
              ? bizconTransactionsUsed
              : isTransactionAlreadyUsed
          )(
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

      const registrationId = randomUUID();
      const timestamp = new Date().toISOString();

      let screenshotLink = "";

      if (!isFree) {
        const cachedFolder =
          bizconFolderCache.get(folder) || 0;

        if (
          event !== "bizcon" ||
          cachedFolder <= Date.now()
        ) {
          await assertUploadFolder(drive, folder);

          if (event === "bizcon") {
            bizconFolderCache.set(
              folder,
              Date.now() + BIZCON_CACHE_MS
            );
          }
        }

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

      try {
        if (event === "bizcon") {
          const businessValues = members.map(
            (member, i) => [
              timestamp,
              cfg.tab,
              registrationId,
              size,
              i + 1,
              safe(team),
              safe(member.name),
              safe(member.email),
              safe(member.phone),
              safe(member.college),
              safe(member.branch),
              safe(member.year),
              safe(member.course),

              ...(
                i === 0
                  ? bizAnswers
                  : BIZ_HEADERS.map(() => "")
              ),
            ]
          );

          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,

            requestBody: {
              requests: [
                appendCells(
                  bizSheetIds.payment,
                  values
                ),

                appendCells(
                  bizSheetIds.business,
                  businessValues
                ),
              ],
            },
          });
        } else {
          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `'${cfg.tab}'!A:O`,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",

            requestBody: {
              values,
            },
          });
        }
      } catch (error) {
        if (event === "bizcon") {
          bizconCache.delete(spreadsheetId);
          bizconFolderCache.delete(folder);
        }

        console.error(
          "Sheets append failed for registration:",
          registrationId
        );

        throw error;
      }

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