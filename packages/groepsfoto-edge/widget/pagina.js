/* ============================================================
   Groepsfoto-kerstkaart — pagina-eigen JS, onder de PSV Campaign Kit.

   Praat alleen met het script op Bunny (zie packages/groepsfoto-edge).
   Hier staat geen enkele sleutel: de Turnstile site key is openbaar.
   ============================================================ */

var PSVK_GF = {
  /* Het adres van het Edge Script op Bunny (kerstkaart26), zonder / aan het eind. */
  script: 'https://kerstkaart26-qesy7.bunny.run',
  /* De sleutel van de campagne in PSV Tools (tabblad Campagnes). */
  campagne: 'kerstkaart-2026',
  turnstileSiteKey: '0x4AAAAAAGSEje6q0YHijq2a',
  /* Moet overeenkomen met de kleding die de campagne in PSV Tools toestaat. */
  kleding: [
    { waarde: 'passend', label: 'Kersttrui, net als de spelers' },
    { waarde: 'eigen', label: 'Mijn eigen kleding' },
    { waarde: 'shirt', label: 'PSV-thuisshirt' }
  ],
  kaarttekst: 'Fijne feestdagen en een sportief 2027!',
  aiLabel: 'Gemaakt met AI',
  logo: '/files/4075/uploads/16747a71-3f29-4df4-9e77-9590a956f8ec.png',
  selfieZijde: 1024,
  pollMs: 1500,
  maxWachtMs: 180000
};

(function () {
  var turnstileLaden = null;

  function laadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileLaden) return turnstileLaden;
    turnstileLaden = new Promise(function (klaar, mis) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function () { klaar(window.turnstile); };
      s.onerror = function () { turnstileLaden = null; mis(new Error('turnstile')); };
      document.head.appendChild(s);
    });
    return turnstileLaden;
  }

  function wacht(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function laadBeeld(src) {
    return new Promise(function (klaar, mis) {
      var img = new Image();
      img.onload = function () { klaar(img); };
      img.onerror = function () { mis(new Error('beeld')); };
      img.src = src;
    });
  }

  /* Verkleint de selfie en codeert hem opnieuw als JPEG. De browser zet de
     foto daarbij recht, en alle metadata (zoals GPS) valt eraf. */
  function verklein(bestand) {
    var url = URL.createObjectURL(bestand);
    return laadBeeld(url).then(function (img) {
      var schaal = Math.min(1, PSVK_GF.selfieZijde / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * schaal);
      c.height = Math.round(img.naturalHeight * schaal);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      return c.toDataURL('image/jpeg', 0.88);
    }, function (err) {
      URL.revokeObjectURL(url);
      throw err;
    });
  }

  function api(pad, init) {
    var url = PSVK_GF.script + '/groepsfoto/' + encodeURIComponent(PSVK_GF.campagne) + '/' + pad;
    return fetch(url, init).catch(function () {
      throw { melding: 'Geen verbinding. Controleer je internet en probeer het opnieuw.' };
    });
  }

  function leesFout(res) {
    return res.json().catch(function () { return {}; }).then(function (b) {
      throw { melding: (b && b.melding) || 'Er ging iets mis. Probeer het opnieuw.' };
    });
  }

  /* Tekst die in de breedte past, in PSV Condensed. */
  function pasTekst(ctx, tekst, maxBreedte, maxGrootte) {
    var grootte = maxGrootte;
    do {
      ctx.font = '700 ' + grootte + 'px "PSV Condensed", "Arial Narrow", sans-serif';
      if (ctx.measureText(tekst).width <= maxBreedte) break;
      grootte -= 2;
    } while (grootte > 12);
  }

  /* De kaart: foto met witte rand, AI-label op de foto, rode band met tekst en logo. */
  function tekenKaart(canvas, foto, logo) {
    var b = Math.min(foto.naturalWidth, 2048);
    var h = Math.round(foto.naturalHeight * (b / foto.naturalWidth));
    var rand = Math.round(b * 0.035);
    var band = Math.round(b * 0.16);
    canvas.width = b + rand * 2;
    canvas.height = h + rand * 2 + band;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(foto, rand, rand, b, h);

    var labelGrootte = Math.max(12, Math.round(b * 0.018));
    ctx.font = '400 ' + labelGrootte + 'px "PSV Sans", Arial, sans-serif';
    var lw = ctx.measureText(PSVK_GF.aiLabel).width + labelGrootte * 1.4;
    var lh = labelGrootte * 1.9;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(rand + b - lw - labelGrootte, rand + h - lh - labelGrootte, lw, lh);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(PSVK_GF.aiLabel, rand + b - lw - labelGrootte * 0.3, rand + h - lh / 2 - labelGrootte);

    var bandY = h + rand * 2;
    ctx.fillStyle = '#EE2523';
    ctx.fillRect(0, bandY, canvas.width, band);

    var tekstX = rand;
    if (logo) {
      var lhoogte = band * 0.6;
      var lbreedte = logo.naturalWidth * (lhoogte / logo.naturalHeight);
      ctx.drawImage(logo, canvas.width - rand - lbreedte, bandY + (band - lhoogte) / 2, lbreedte, lhoogte);
      var ruimte = canvas.width - rand * 3 - lbreedte;
      pasTekst(ctx, PSVK_GF.kaarttekst.toUpperCase(), ruimte, Math.round(band * 0.38));
    } else {
      pasTekst(ctx, PSVK_GF.kaarttekst.toUpperCase(), canvas.width - rand * 2, Math.round(band * 0.38));
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(PSVK_GF.kaarttekst.toUpperCase(), tekstX, bandY + band / 2);
  }

  function start(root) {
    if (root.getAttribute('data-psvk-gf') === 'aan') return;
    var form = root.querySelector('#psvk-gf-form');
    if (!form) return;
    root.setAttribute('data-psvk-gf', 'aan');

    var el = function (id) { return root.querySelector('#' + id); };
    var bestand = el('psvk-gf-file');
    var selfieVak = el('psvk-gf-selfie');
    var selfieImg = el('psvk-gf-selfie-img');
    var kies = el('psvk-gf-pick');
    var keuzes = el('psvk-gf-kleding');
    var akkoord = el('psvk-gf-ok');
    var knop = el('psvk-gf-go');
    var bericht = el('psvk-gf-message');
    var plek = el('psvk-gf-placeholder');
    var bezigVak = el('psvk-gf-busy');
    var bezigTekst = el('psvk-gf-busy-text');
    var canvas = el('psvk-gf-canvas');
    var klaarVak = el('psvk-gf-done');
    var download = el('psvk-gf-download');
    var deel = el('psvk-gf-share');
    var opnieuw = el('psvk-gf-again');

    var selfie = null;
    var token = '';
    var widget = null;
    var bezig = false;

    /* Kledingkeuzes; met één keuze is er niets te kiezen. */
    PSVK_GF.kleding.forEach(function (k, i) {
      var label = document.createElement('label');
      label.className = 'psvk-gf-choice';
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'psvk-gf-kleding';
      input.value = k.waarde;
      input.checked = i === 0;
      label.appendChild(input);
      label.appendChild(document.createTextNode(k.label));
      keuzes.appendChild(label);
    });
    if (PSVK_GF.kleding.length < 2) el('psvk-gf-kleding-stap').hidden = true;

    function toon(tekst) {
      bericht.textContent = tekst;
      bericht.hidden = !tekst;
    }

    function werkKnopBij() {
      knop.disabled = bezig || !selfie || !akkoord.checked || !token;
    }

    function zetTurnstile() {
      laadTurnstile().then(function (ts) {
        var vak = el('psvk-gf-turnstile');
        if (widget !== null) { ts.reset(widget); return; }
        widget = ts.render(vak, {
          sitekey: PSVK_GF.turnstileSiteKey,
          language: 'nl',
          callback: function (t) { token = t; werkKnopBij(); },
          'expired-callback': function () { token = ''; werkKnopBij(); },
          'error-callback': function () { token = ''; werkKnopBij(); }
        });
      }).catch(function () {
        toon('De beveiligingscontrole laadt niet. Ververs de pagina of probeer een andere browser.');
      });
    }

    bestand.addEventListener('change', function () {
      var f = bestand.files && bestand.files[0];
      bestand.value = '';
      if (!f) return;
      toon('');
      verklein(f).then(function (dataUrl) {
        selfie = dataUrl;
        selfieImg.src = dataUrl;
        selfieVak.hidden = false;
        kies.textContent = 'Andere selfie';
        werkKnopBij();
      }).catch(function () {
        toon('Deze foto kunnen we niet openen. Kies een jpg of png.');
      });
    });

    akkoord.addEventListener('change', werkKnopBij);

    function zetFase(fase) {
      plek.hidden = fase !== 'leeg';
      bezigVak.hidden = fase !== 'bezig';
      canvas.hidden = fase !== 'klaar';
      klaarVak.hidden = fase !== 'klaar';
    }

    function maak() {
      var kleding = (form.querySelector('input[name="psvk-gf-kleding"]:checked') || {}).value;
      bezig = true;
      werkKnopBij();
      toon('');
      zetFase('bezig');
      bezigTekst.textContent = 'Je kaart wordt gemaakt…';
      var gebruiktToken = token;
      token = '';

      return api('maak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfie: selfie, toestemming: true, kleding: kleding, turnstile: gebruiktToken })
      }).then(function (res) {
        return res.ok ? res.json() : leesFout(res);
      }).then(function (b) {
        var begin = Date.now();
        function peil() {
          if (Date.now() - begin > PSVK_GF.maxWachtMs) {
            throw { melding: 'Het duurt te lang. Probeer het over een paar minuten opnieuw.' };
          }
          if (Date.now() - begin > 20000) bezigTekst.textContent = 'Bijna klaar…';
          return api('status/' + b.ticket).then(function (res) {
            return res.ok ? res.json() : leesFout(res);
          }).then(function (s) {
            if (s.status === 'klaar') return b.ticket;
            if (s.status === 'mislukt') throw { melding: s.melding };
            return wacht(PSVK_GF.pollMs).then(peil);
          });
        }
        return wacht(PSVK_GF.pollMs).then(peil);
      }).then(function (ticket) {
        return api('beeld/' + ticket).then(function (res) {
          return res.ok ? res.blob() : leesFout(res);
        });
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var fonts = document.fonts && document.fonts.load
          ? document.fonts.load('700 64px "PSV Condensed"').catch(function () {})
          : Promise.resolve();
        return Promise.all([
          laadBeeld(url),
          laadBeeld(PSVK_GF.logo).catch(function () { return null; }),
          fonts
        ]).then(function (r) {
          tekenKaart(canvas, r[0], r[1]);
          URL.revokeObjectURL(url);
          zetFase('klaar');
          deel.hidden = !(navigator.canShare && window.File && navigator.canShare({
            files: [new File([new Blob()], 'kaart.jpg', { type: 'image/jpeg' })]
          }));
        });
      }).catch(function (err) {
        zetFase('leeg');
        toon((err && err.melding) || 'Er ging iets mis. Probeer het opnieuw.');
      }).then(function () {
        bezig = false;
        zetTurnstile();
        werkKnopBij();
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!knop.disabled) maak();
    });

    function alsBestand() {
      return new Promise(function (klaar) {
        canvas.toBlob(function (b) { klaar(b); }, 'image/jpeg', 0.92);
      });
    }

    download.addEventListener('click', function () {
      alsBestand().then(function (b) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'psv-kerstkaart.jpg';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
      });
    });

    deel.addEventListener('click', function () {
      alsBestand().then(function (b) {
        return navigator.share({
          files: [new File([b], 'psv-kerstkaart.jpg', { type: 'image/jpeg' })],
          title: 'Mijn PSV-kerstkaart'
        });
      }).catch(function () {});
    });

    opnieuw.addEventListener('click', function () {
      zetFase('leeg');
      toon('');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    zetFase('leeg');
    zetTurnstile();
    werkKnopBij();
  }

  /* De Kit kan zijn psvk:ready al gestuurd hebben voordat deze code draait,
     en Playable bouwt het blok soms opnieuw op. Daarom starten we ook zelf,
     en opnieuw zodra er een nieuw #psvk-app verschijnt. */
  function probeer() {
    var root = document.getElementById('psvk-app');
    if (root) start(root);
  }
  document.addEventListener('psvk:ready', function (e) { start(e.detail.root); });
  probeer();
  new MutationObserver(probeer).observe(document.documentElement, { childList: true, subtree: true });
})();
