# Modulo reclamo cliente – Diatecx

Versione web del modulo "Customer Complaint Form" (prima un .doc compilato e inviato via email).

Pagina statica (`index.html`, `grazie.html`, `style.css`, `script.js`), pubblicabile su GitHub Pages
o qualsiasi hosting statico.

## Come funziona
1. Il cliente compila il modulo (campi obbligatori segnati con `*`) e può allegare una foto (max 5 MB).
2. Premendo **Invia reclamo** il modulo viene validato e inviato a [FormSubmit](https://formsubmit.co),
   che manda subito un'email a **mluca@fbk.eu** con tutti i campi in tabella e la foto in allegato.
   L'oggetto è `Reclamo <cliente> – <articolo> – batch <batch>`; "Rispondi" risponde al cliente.
3. Il cliente viene poi portato su `grazie.html`.

## Attivazione (una sola volta)
Al **primo** invio FormSubmit manda a mluca@fbk.eu un'email di conferma: bisogna cliccare il link
"Activate Form". Da quel momento ogni reclamo arriva direttamente.

Dopo l'attivazione FormSubmit fornisce anche un indirizzo alias (stringa casuale): conviene sostituirlo
a `mluca@fbk.eu` nell'attributo `action` del form in `index.html`, così l'email non resta visibile nel codice.

## Cambiare destinatario
Modificare l'attributo `action` del form in `index.html`:

```html
<form id="claim-form" action="https://formsubmit.co/mluca@fbk.eu" ...>
```
