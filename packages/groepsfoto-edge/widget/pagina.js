/* ============================================================
   Groepsfoto-kerstkaart — pagina-eigen JS (de loader zet de huisstijlset erbij).

   Praat alleen met het script op Bunny (zie packages/groepsfoto-edge).
   Hier staat geen enkele sleutel: de Turnstile site key is openbaar.
   ============================================================ */

var PSVK_GF = {
  /* Het adres van het Edge Script op Bunny (kerstkaart26), zonder / aan het eind. */
  script: 'https://kerstkaart26-qesy7.bunny.run',
  /* De sleutel van de campagne in PSV Tools (tabblad Campagnes). */
  campagne: 'kerstkaart-2026',
  turnstileSiteKey: '0x4AAAAAAGSEje6q0YHijq2a',
  /* De kleding van de kaart: die van de spelers op de foto. Moet in de
     campagne in PSV Tools aangevinkt staan. Met meer dan één waarde én een
     element #psvk-gf-kleding in de HTML kan de fan kiezen. */
  kleding: [
    { waarde: 'passend', label: 'Kersttrui, net als de spelers' }
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

  /* Alleen de camera: geen upload, zodat er geen bestaande foto van een
     ander in kan, en elke selfie dezelfde opbouw heeft (3:4, gezicht in het
     kader). Wat in beeld is, wordt het beeld: het midden in 3:4, verkleind tot
     hooguit 1024px en opnieuw als JPEG, zonder metadata. Het spiegelbeeld is
     alleen voor het scherm; het model krijgt de foto zoals de camera hem ziet. */
  function vraagCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject({ melding: 'Je browser kan hier de camera niet gebruiken. Open deze pagina in Safari of Chrome.' });
    }
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false
    }).catch(function (err) {
      var naam = err && err.name;
      if (naam === 'NotAllowedError' || naam === 'SecurityError') {
        throw { melding: 'Je gaf geen toestemming voor de camera. Sta de camera toe in je browser en probeer het opnieuw.' };
      }
      if (naam === 'NotFoundError' || naam === 'OverconstrainedError') {
        throw { melding: 'We vinden geen camera. Maak je kaart op je telefoon.' };
      }
      if (naam === 'NotReadableError') {
        throw { melding: 'Je camera is bezet door een andere app. Sluit die en probeer het opnieuw.' };
      }
      throw { melding: 'De camera start niet. Probeer het opnieuw of open de pagina in Safari of Chrome.' };
    });
  }

  function legVast(video) {
    var vb = video.videoWidth;
    var vh = video.videoHeight;
    var cw = vb;
    var ch = vh;
    if (vb / vh > 3 / 4) cw = Math.round(vh * 3 / 4);
    else ch = Math.round(vb * 4 / 3);
    var schaal = Math.min(1, PSVK_GF.selfieZijde / ch);
    var c = document.createElement('canvas');
    c.width = Math.round(cw * schaal);
    c.height = Math.round(ch * schaal);
    c.getContext('2d').drawImage(video, (vb - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
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
    var cameraVak = el('psvk-gf-camera');
    var video = el('psvk-gf-video');
    var startKnop = el('psvk-gf-start');
    var snapKnop = el('psvk-gf-snap');
    var opnieuwFoto = el('psvk-gf-retake');
    var selfieVak = el('psvk-gf-selfie');
    var selfieImg = el('psvk-gf-selfie-img');
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

    /* Kledingkeuzes; zonder keuzevak of met één keuze is er niets te kiezen. */
    if (keuzes && PSVK_GF.kleding.length > 1) PSVK_GF.kleding.forEach(function (k, i) {
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
    var stap = el('psvk-gf-kleding-stap');
    if (stap && !(keuzes && PSVK_GF.kleding.length > 1)) stap.hidden = true;

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

    var stroom = null;

    function stopCamera() {
      if (stroom) stroom.getTracks().forEach(function (t) { t.stop(); });
      stroom = null;
      video.srcObject = null;
      cameraVak.hidden = true;
      snapKnop.hidden = true;
    }

    function startCamera() {
      toon('');
      startKnop.disabled = true;
      vraagCamera().then(function (s) {
        stroom = s;
        video.srcObject = s;
        cameraVak.hidden = false;
        selfieVak.hidden = true;
        startKnop.hidden = true;
        opnieuwFoto.hidden = true;
        snapKnop.hidden = false;
        return video.play();
      }).catch(function (err) {
        stopCamera();
        startKnop.hidden = false;
        toon((err && err.melding) || 'De camera start niet. Probeer het opnieuw.');
      }).then(function () {
        startKnop.disabled = false;
      });
    }

    startKnop.addEventListener('click', startCamera);
    opnieuwFoto.addEventListener('click', function () {
      selfie = null;
      werkKnopBij();
      startCamera();
    });

    snapKnop.addEventListener('click', function () {
      if (!stroom || !video.videoWidth) return;
      selfie = legVast(video);
      stopCamera();
      selfieImg.src = selfie;
      selfieVak.hidden = false;
      opnieuwFoto.hidden = false;
      werkKnopBij();
    });

    /* Camera uit zodra de pagina niet meer in beeld is. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && stroom) {
        stopCamera();
        if (!selfie) startKnop.hidden = false;
        else opnieuwFoto.hidden = false;
      }
    });

    akkoord.addEventListener('change', werkKnopBij);

    function zetFase(fase) {
      plek.hidden = fase !== 'leeg';
      bezigVak.hidden = fase !== 'bezig';
      canvas.hidden = fase !== 'klaar';
      klaarVak.hidden = fase !== 'klaar';
    }

    function maak() {
      var kleding = (form.querySelector('input[name="psvk-gf-kleding"]:checked') || {}).value || PSVK_GF.kleding[0].waarde;
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

  /* De huisstijlset kan zijn psvk:ready al gestuurd hebben voordat deze code draait,
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
