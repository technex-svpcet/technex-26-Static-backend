# TECHNEX Registration Backend — Hackathon and APEX CTF

This package keeps the original `src/` and `public/` directories and retains the original Hackathon styling and original payment QR image. Admin and login routes are not mounted. Only two events are enabled.

## Setup
1. Install Node.js 20+ and run `npm install` (generates package-lock.json).
2. Create a Google Cloud service account; enable **Google Sheets API** and **Google Drive API**.
3. Create a Google Spreadsheet; share it with the service account email as **Editor**.
4. Create a Drive folder for payment screenshot evidence; share the folder with the service account email as **Editor**. Ensure the service account is permitted to create files in this folder; service-account Drive storage restrictions may require a Shared Drive or another supported upload identity.
5. Copy `.env.example` to `.env` and fill in credentials. The private key is written with escaped `\n` sequences on a single line. Do not commit `.env`.
6. Run `npm run dev`. Open `http://localhost:8080/register/hackathon` or `/register/apex-ctf`.
7. Test one registration per event. The backend creates `Hackathon` and `APEX CTF` tabs with member rows.

## Payment caveat
The original static QR is shown via `/api/payment-qr`; workshop QR is retained at `/api/workshop-payment-qr`. This is **not** an automatic UPI payment verification integration. Successful submission means the registration and evidence were received; the Google Sheet status is **Pending Verification**, not Paid. A trusted person must verify transactions against the actual UPI account statement. No admin panel is required; verify manually in Sheets. Do not use screenshots alone to establish successful payment.

## Security and limitations
Validation is server-side and client-side. 10 registration attempts per IP per 15 minutes. File uploads limited to 3MB and JPEG/PNG/WebP MIME types. For production, add CAPTCHA, persistent/distributed rate-limit storage and stronger upload-content checks. The in-memory limiter is not shared across multiple server instances. Duplicate detection uses Sheets reads, which are not atomic; concurrent submissions may still race. For guaranteed uniqueness, use a transactional database or an atomic locking mechanism. No live Google API tests have been run; test with your credentials before public launch.

## Endpoints
- GET `/health`
- GET `/register/hackathon`
- GET `/register/apex-ctf`
- POST `/api/register/hackathon` multipart form
- POST `/api/register/apex-ctf` multipart form
- GET `/api/payment-qr`
- GET `/api/workshop-payment-qr`

Future events can be enabled by extending the EVENTS mapping in `src/controllers/formController.js`, adding a registration page under `public/Registrataion/`, and adding a GET route in `src/app.js`.
