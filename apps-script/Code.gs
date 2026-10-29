/**
 * Backend del modulo reclami Diatecx.
 *
 * Da incollare nell'editor Apps Script di un Google Sheet (Estensioni → Apps Script)
 * e pubblicare come Web App. Ogni reclamo inviato dal modulo:
 *   - diventa una riga del foglio "Reclami";
 *   - la foto viene salvata nella cartella Drive "Reclami - Foto";
 *   - viene inviata un'email di notifica a NOTIFY_EMAIL.
 * La dashboard (admin.html) legge e aggiorna gli stessi dati con il token amministratore.
 */

const NOTIFY_EMAIL = 'mluca@fbk.eu';
const SHEET_NAME = 'Reclami';
const PHOTO_FOLDER_NAME = 'Reclami - Foto';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const STATUSES = ['Aperto', 'In lavorazione', 'Chiuso - accolto', 'Chiuso - respinto'];

// Campi inviati dal modulo, nell'ordine delle colonne del foglio.
const FORM_FIELDS = [
  'Ragione sociale', 'Data reclamo', 'Referente', 'email', 'Telefono',
  'Divisione', 'Stabilimento', 'Articolo', 'Quantità', 'Batch nr',
  'DDT nr', 'Data DDT', 'Fattura nr', 'Data fattura',
  'Descrizione problematica', 'Foto', 'Campioni', 'Richiesta sostituzione',
];
const REQUIRED_FIELDS = [
  'Ragione sociale', 'Data reclamo', 'Referente', 'email', 'Divisione', 'Stabilimento',
  'Articolo', 'Quantità', 'Batch nr', 'DDT nr', 'Descrizione problematica', 'Foto', 'Campioni',
];
// Colonne gestite dall'amministratore.
const ADMIN_FIELDS = ['ID', 'Ricevuto il', 'Stato', 'Data chiusura', 'Note interne'];
const COLUMNS = [...ADMIN_FIELDS, ...FORM_FIELDS, 'Link foto'];
const DATE_ONLY_COLUMNS = ['Data reclamo', 'Data DDT', 'Data fattura', 'Data chiusura'];

/** Da eseguire una volta dall'editor: crea il foglio e il token amministratore. */
function setup() {
  getSheet_();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_TOKEN')) {
    props.setProperty('ADMIN_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  Logger.log('Token amministratore: ' + props.getProperty('ADMIN_TOKEN'));
}

function doGet() {
  return json_({ ok: true, message: 'API reclami Diatecx attiva' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    switch (req.action) {
      case 'submit':
        return json_(submitClaim_(req.data || {}, req.photo));
      case 'list':
        checkToken_(req.token);
        return json_({ ok: true, claims: listClaims_(), statuses: STATUSES });
      case 'update':
        checkToken_(req.token);
        return json_(updateClaim_(req.id, req.changes || {}));
      default:
        throw new Error('Azione non valida');
    }
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function submitClaim_(data, photo) {
  // Campo trappola per i bot: se compilato, fingiamo successo senza salvare.
  if (data._honey) return { ok: true, id: '' };

  const claim = {};
  for (const field of FORM_FIELDS) claim[field] = String(data[field] || '').trim().slice(0, 5000);
  const missing = REQUIRED_FIELDS.filter((f) => !claim[f]);
  if (missing.length) throw new Error('Campi mancanti: ' + missing.join(', '));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(claim.email)) throw new Error('Email non valida');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_();
    const now = new Date();
    const id = 'REC-' + now.getFullYear() + '-' + String(sheet.getLastRow()).padStart(4, '0');

    let blob = null;
    let photoUrl = '';
    if (photo && photo.data) {
      const bytes = Utilities.base64Decode(photo.data);
      if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Foto troppo grande (max 5 MB)');
      const type = /^image\//.test(photo.type) ? photo.type : 'image/jpeg';
      const name = id + '_' + String(photo.name || 'foto').replace(/[^\w.-]/g, '_');
      blob = Utilities.newBlob(bytes, type, name);
      photoUrl = getPhotoFolder_().createFile(blob).getUrl();
    }

    const row = Object.assign({}, claim, {
      'ID': id,
      'Ricevuto il': now,
      'Stato': 'Aperto',
      'Data chiusura': '',
      'Note interne': '',
      'Link foto': photoUrl,
    });
    sheet.appendRow(COLUMNS.map((c) => row[c]));

    sendNotification_(id, claim, photoUrl, blob);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function listClaims_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const header = values.shift();
  const tz = Session.getScriptTimeZone();
  return values.filter((r) => r[0]).map((r) => {
    const claim = {};
    header.forEach((col, i) => {
      let v = r[i];
      if (v instanceof Date) {
        v = DATE_ONLY_COLUMNS.includes(col) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
      }
      claim[col] = v;
    });
    return claim;
  });
}

function updateClaim_(id, changes) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_();
    const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
    const index = ids.indexOf(id);
    if (index < 0) throw new Error('Reclamo non trovato: ' + id);
    const rowNumber = index + 2;
    const col = (name) => COLUMNS.indexOf(name) + 1;

    if (changes['Stato'] !== undefined) {
      if (!STATUSES.includes(changes['Stato'])) throw new Error('Stato non valido');
      sheet.getRange(rowNumber, col('Stato')).setValue(changes['Stato']);
      const closed = changes['Stato'].startsWith('Chiuso');
      const closedCell = sheet.getRange(rowNumber, col('Data chiusura'));
      if (closed && !closedCell.getValue()) {
        closedCell.setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
      } else if (!closed) {
        closedCell.setValue('');
      }
    }
    if (changes['Note interne'] !== undefined) {
      sheet.getRange(rowNumber, col('Note interne')).setValue(String(changes['Note interne']).slice(0, 5000));
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function sendNotification_(id, claim, photoUrl, blob) {
  const rows = FORM_FIELDS
    .filter((f) => claim[f])
    .map((f) => '<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top">' + escape_(f) +
      '</th><td style="padding:4px 0;white-space:pre-wrap">' + escape_(claim[f]) + '</td></tr>')
    .join('');
  const photoRow = photoUrl ? '<p><a href="' + photoUrl + '">Foto su Google Drive</a></p>' : '';
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    replyTo: claim.email,
    subject: 'Reclamo ' + id + ' – ' + claim['Ragione sociale'] + ' – ' + claim['Articolo'] + ' – batch ' + claim['Batch nr'],
    htmlBody: '<h2>Nuovo reclamo ' + id + '</h2><table>' + rows + '</table>' + photoRow,
    attachments: blob ? [blob] : [],
  });
}

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!expected || token !== expected) throw new Error('Token non valido');
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
  }
  return sheet;
}

function getPhotoFolder_() {
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
}

function escape_(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
