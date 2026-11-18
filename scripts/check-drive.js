require('dotenv').config();
const {Readable} = require('stream');
const {google} = require('googleapis');

async function main() {
  const {GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID} = process.env;
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_DRIVE_FOLDER_ID must be set in .env');
  }
  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({version: 'v3', auth});
  const folderId = GOOGLE_DRIVE_FOLDER_ID;

  let meta;
  try {
    meta = (await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType,driveId,capabilities(canAddChildren)',
      supportsAllDrives: true,
    })).data;
  } catch (e) {
    throw new Error(`Folder ${folderId} is not visible to ${GOOGLE_CLIENT_EMAIL}. Check the ID and share the folder with the service account as Editor. API: ${e.response?.data?.error?.message || e.message}`);
  }
  if (meta.mimeType !== 'application/vnd.google-apps.folder') throw new Error(`${folderId} is not a folder`);
  if (!meta.capabilities?.canAddChildren) throw new Error(`Service account cannot add files to folder "${meta.name}"`);
  console.log(`Folder OK: ${meta.name} (${folderId})${meta.driveId ? ` in Shared Drive ${meta.driveId}` : ' in My Drive'}`);

  const name = `technex-drive-check-${Date.now()}.txt`;
  let created;
  try {
    created = (await drive.files.create({
      supportsAllDrives: true,
      requestBody: {name, parents: [folderId]},
      media: {mimeType: 'text/plain', body: Readable.from(['ok'])},
      fields: 'id,name',
    })).data;
  } catch (e) {
    const apiMessage = e.response?.data?.error?.message || e.message;
    if (/storage quota|shared drives/i.test(apiMessage)) {
      throw new Error(`Folder is in My Drive. Service accounts cannot store files there. Move the folder to a Shared Drive where ${GOOGLE_CLIENT_EMAIL} is a Contributor/Manager, then update GOOGLE_DRIVE_FOLDER_ID. API: ${apiMessage}`);
    }
    throw new Error(`Upload failed: ${apiMessage}`);
  }
  console.log(`Upload OK: ${created.name} (${created.id})`);
  await drive.files.delete({supportsAllDrives: true, fileId: created.id}).catch(() => {});
  console.log('Cleanup OK. Drive upload is ready.');
}

main().catch((e) => {
  console.error(`DRIVE CHECK FAILED: ${e.message}`);
  process.exitCode = 1;
});
