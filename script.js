// Indirizzo a cui arrivano i reclami: modificare qui.
const CLAIM_EMAIL = 'reclami@diatecx.com';

const form = document.getElementById('claim-form');
const errorsBox = document.getElementById('errors');
const done = document.getElementById('done');
const photoUpload = document.getElementById('photo-upload');
const photosInput = document.getElementById('photos');
const preview = document.getElementById('photo-preview');

const LABELS = {
  company: 'Ragione sociale / Company name',
  claimDate: 'Data reclamo / Claim date',
  contact: 'Referente / Ref. person',
  email: 'Email',
  division: 'Divisione / Division',
  plant: 'Stabilimento / Plant',
  product: 'Articolo / Product',
  quantity: 'Quantità / Quantity',
  batch: 'Batch nr.',
  ddt: 'DDT nr. / Packing list nr.',
  description: 'Descrizione problematica / Problem description',
  photo: 'Foto / Photo',
  samples: 'Campioni / Samples',
};

document.getElementById('claimDate').valueAsDate = new Date();

form.addEventListener('change', (e) => {
  if (e.target.name === 'photo') photoUpload.hidden = e.target.value !== 'Sì';
  const field = e.target.closest('.field');
  if (field) field.classList.remove('invalid');
});

photosInput.addEventListener('change', () => {
  preview.innerHTML = '';
  for (const file of photosInput.files) {
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

function validate() {
  const missing = [];
  const seen = new Set();
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  for (const el of form.querySelectorAll('[required]')) {
    if (seen.has(el.name)) continue;
    seen.add(el.name);
    if (!el.checkValidity()) {
      el.closest('.field').classList.add('invalid');
      missing.push(LABELS[el.name] || el.name);
    }
  }
  const data = new FormData(form);
  if (data.get('replacement') && data.get('samples') !== 'Sì') {
    form.querySelector('[name=samples]').closest('.field').classList.add('invalid');
    missing.push('Campioni obbligatori per la sostituzione / Samples mandatory for replacement');
  }
  return missing;
}

function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function buildSummary(data) {
  const v = (k) => (data.get(k) || '').toString().trim();
  const withDate = (num, date) => [v(num), date && v(date) ? `del ${formatDate(v(date))}` : ''].filter(Boolean).join(' ');
  const photos = photosInput.files.length ? ` (${photosInput.files.length} foto da allegare)` : '';

  return [
    'MODULO RECLAMO CLIENTE / CUSTOMER COMPLAINT FORM',
    '',
    '— DATI GENERALI / GENERAL DATA —',
    `Ragione sociale / Company name: ${v('company')}`,
    `Data reclamo / Claim date: ${formatDate(v('claimDate'))}`,
    `Divisione / Division: ${v('division')}`,
    `Referente / Ref. person: ${v('contact')}`,
    `Email: ${v('email')}`,
    v('phone') ? `Telefono / Phone: ${v('phone')}` : null,
    `Stabilimento / Plant: ${v('plant')}`,
    '',
    '— DATI PRODOTTO / PRODUCT DATA —',
    `Articolo / Product: ${v('product')}`,
    `Quantità / Quantity: ${v('quantity')}`,
    `Batch nr.: ${v('batch')}`,
    `DDT nr. / Packing list nr.: ${withDate('ddt', 'ddtDate')}`,
    v('invoice') ? `Rif. fattura / Invoice ref.: ${withDate('invoice', 'invoiceDate')}` : null,
    '',
    'Descrizione problematica / Problem description:',
    v('description'),
    '',
    `Foto / Photo: ${v('photo')}${photos}`,
    `Campioni / Samples: ${v('samples')}`,
    `Richiesta sostituzione / Replacement requested: ${data.get('replacement') ? 'Sì' : 'No'}`,
  ].filter((line) => line !== null).join('\n');
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const missing = validate();
  if (missing.length) {
    errorsBox.innerHTML = '<strong>Campi mancanti o non validi / Missing or invalid fields:</strong><ul>' +
      missing.map((m) => `<li>${m}</li>`).join('') + '</ul>';
    errorsBox.hidden = false;
    errorsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  errorsBox.hidden = true;

  const data = new FormData(form);
  const summary = buildSummary(data);
  const subject = `Reclamo ${data.get('company')} – ${data.get('product')} – batch ${data.get('batch')}`;
  const mailto = `mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summary)}`;

  document.getElementById('summary').textContent = summary;
  document.getElementById('mail-link').href = mailto;
  form.hidden = true;
  done.hidden = false;
  window.scrollTo(0, 0);
  window.location.href = mailto;
});

document.getElementById('copy-btn').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(document.getElementById('summary').textContent);
  e.target.textContent = 'Copiato / Copied ✓';
});

document.getElementById('back-btn').addEventListener('click', () => {
  done.hidden = true;
  form.hidden = false;
});
