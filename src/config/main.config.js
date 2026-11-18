
require("dotenv").config();

const { google } = require("googleapis");

function getClients() {
  // Google Sheets — Service Account
  const sheetsAuth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(
        /\\n/g,
        "\n"
      ),
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  const sheets = google.sheets({
    version: "v4",
    auth: sheetsAuth,
  });

  // Google Drive — OAuth 2.0
  const driveAuth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );

  driveAuth.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  });

  const drive = google.drive({
    version: "v3",
    auth: driveAuth,
  });

  return {
    sheets,
    drive,
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  };
}

module.exports = { getClients };
