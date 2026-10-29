// Il form viene inviato alla Web App di Google Apps Script (URL in config.js), che salva
// il reclamo nel Google Sheet e manda l'email di notifica.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const form = document.getElementById('claim-form');
const errorsBox = document.getElementById('errors');
const photoUpload = document.getElementById('photo-upload');
const photoInput = document.getElementById('photo');
const preview = document.getElementById('photo-preview');
const replacement = document.getElementById('replacement');

document.getElementById('claimDate').valueAsDate = new Date();

form.addEventListener('change', (e) => {
  if (e.target.name === 'Foto') photoUpload.hidden = e.target.value !== 'Sì';
  const field = e.target.closest('.field');
  if (field) field.classList.remove('invalid');
});

photoInput.addEventListener('change', () => {
  preview.innerHTML = '';
  for (const file of photoInput.files) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    preview.appendChild(img);
  }
});

form.addEventListener('reset', () => {
  setTimeout(() => {
    document.getElementById('claimDate').valueAsDate = new Date();
    photoUpload.hidden = true;
    preview.innerHTML = '';
    errorsBox.hidden = true;
    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  });
});

document.getElementById('print-btn').addEventListener('click', () => window.print());

function markInvalid(el) {
  el.closest('.field').classList.add('invalid');
}

function validate() {
  const missing = [];
  const seen = new Set();
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  for (const el of form.querySelectorAll('[required]')) {
    if (seen.has(el.name)) continue;
    seen.add(el.name);
    if (!el.checkValidity()) {
      markInvalid(el);
      missing.push(el.name === 'email' ? 'Email' : el.name);
    }
  }
  const data = new FormData(form);
  if (replacement.checked && data.get('Campioni') !== 'Sì') {
    markInvalid(form.elements.Campioni[0]);
    missing.push('Campioni obbligatori per la sostituzione / Samples mandatory for replacement');
  }
  const photo = photoInput.files[0];
  if (data.get('Foto') === 'Sì' && !photo) {
    markInvalid(photoInput);
    missing.push('Foto da allegare / Photo to attach');
  } else if (photo && photo.size > MAX_PHOTO_BYTES) {
    markInvalid(photoInput);
    missing.push('Foto troppo grande, max 5 MB / Photo too large, max 5 MB');
  }
  return missing;
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function showErrors(messages) {
  errorsBox.innerHTML = '<strong>Campi mancanti o non validi / Missing or invalid fields:</strong><ul></ul>';
  const list = errorsBox.querySelector('ul');
  for (const m of messages) list.appendChild(Object.assign(document.createElement('li'), { textContent: m }));
  errorsBox.hidden = false;
  errorsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const submitButton = form.querySelector('button[type=submit]');
const submitLabel = submitButton.innerHTML;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const missing = validate();
  if (missing.length) return showErrors(missing);
  if (!window.CLAIMS_API_URL) return showErrors(['Invio non configurato: manca CLAIMS_API_URL in config.js']);
  errorsBox.hidden = true;

  const data = Object.fromEntries(new FormData(form));
  delete data.attachment;
  data['Richiesta sostituzione'] = replacement.checked ? 'Sì' : 'No';

  const file = data['Foto'] === 'Sì' ? photoInput.files[0] : null;

  submitButton.disabled = true;
  submitButton.textContent = 'Invio in corso… / Sending…';
  try {
    const photo = file ? { name: file.name, type: file.type, data: await readAsBase64(file) } : null;
    // Corpo text/plain: richiesta "semplice", niente preflight CORS verso Apps Script.
    const res = await fetch(window.CLAIMS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'submit', data, photo }),
    });
    const result = await res.json();
    if (!result.ok) throw new Error(result.error);
    location.href = 'grazie.html?id=' + encodeURIComponent(result.id);
  } catch (err) {
    showErrors(['Invio non riuscito, riprova / Sending failed, please retry: ' + err.message]);
    submitButton.disabled = false;
    submitButton.innerHTML = submitLabel;
  }
});
