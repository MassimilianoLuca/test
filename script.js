// Il form viene inviato a FormSubmit (formsubmit.co), che inoltra il contenuto via email
// all'indirizzo indicato nell'attributo action del form in index.html.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const form = document.getElementById('claim-form');
const errorsBox = document.getElementById('errors');
const photoUpload = document.getElementById('photo-upload');
const photoInput = document.getElementById('photo');
const preview = document.getElementById('photo-preview');
const replacement = document.getElementById('replacement');

document.getElementById('claimDate').valueAsDate = new Date();

// Dopo l'invio FormSubmit rimanda a grazie.html (solo se la pagina è servita via http/https).
if (location.protocol.startsWith('http')) {
  form.elements._next.value = new URL('grazie.html', location.href).href;
} else {
  form.elements._next.remove();
}

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

form.addEventListener('submit', (e) => {
  const missing = validate();
  if (missing.length) {
    e.preventDefault();
    errorsBox.innerHTML = '<strong>Campi mancanti o non validi / Missing or invalid fields:</strong><ul>' +
      missing.map((m) => `<li>${m}</li>`).join('') + '</ul>';
    errorsBox.hidden = false;
    errorsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  errorsBox.hidden = true;

  const data = new FormData(form);
  form.elements._subject.value = `Reclamo ${data.get('Ragione sociale')} – ${data.get('Articolo')} – batch ${data.get('Batch nr')}`;
  document.getElementById('replacement-value').value = replacement.checked ? 'Sì' : 'No';
  if (data.get('Foto') !== 'Sì') photoInput.value = '';

  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  button.textContent = 'Invio in corso… / Sending…';
});

// Se l'utente torna indietro dal browser, riattiva il pulsante.
window.addEventListener('pageshow', () => {
  const button = form.querySelector('button[type=submit]');
  button.disabled = false;
  button.innerHTML = 'Invia reclamo <span class="en">/ Send claim</span>';
});
