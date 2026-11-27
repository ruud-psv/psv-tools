import { test } from "node:test";
import assert from "node:assert/strict";

import { creativeTekst, ctaLabel, metPostTekst, normaliseerCreative, postZonderTekst } from "./creative";

test("gewone advertentie met link_data", () => {
  const d = normaliseerCreative({
    body: "Het nieuwe thuisshirt is er.",
    object_story_spec: {
      link_data: {
        message: "Het nieuwe thuisshirt is er.",
        name: "Shop het shirt",
        description: "Nu in de Fanstore",
        link: "https://psv.nl/shop",
        call_to_action: { type: "SHOP_NOW", value: { link: "https://psv.nl/shop?utm=meta" } },
        image_hash: "abc",
      },
    },
    effective_object_story_id: "1_2",
  });
  assert.equal(d.soort, "afbeelding");
  assert.deepEqual(d.teksten, ["Het nieuwe thuisshirt is er."]);
  assert.deepEqual(d.koppen, ["Shop het shirt"]);
  assert.deepEqual(d.beschrijvingen, ["Nu in de Fanstore"]);
  assert.deepEqual(d.ctas, ["SHOP_NOW"]);
  assert.deepEqual(d.links, ["https://psv.nl/shop?utm=meta", "https://psv.nl/shop"]);
  assert.equal(d.afbeeldingen, 1);
  assert.equal(postZonderTekst(d), null);
});

test("video", () => {
  const d = normaliseerCreative({
    object_story_spec: {
      video_data: { message: "Kijk de samenvatting", title: "PSV - Ajax", video_id: "9", call_to_action: { type: "WATCH_MORE" } },
    },
  });
  assert.equal(d.soort, "video");
  assert.equal(d.videos, 1);
  assert.deepEqual(d.koppen, ["PSV - Ajax"]);
});

test("carrousel: tekst per kaart", () => {
  const d = normaliseerCreative({
    object_story_spec: {
      link_data: {
        message: "Kies je shirt",
        child_attachments: [
          { name: "Thuis", link: "https://psv.nl/thuis", picture: "x" },
          { name: "Uit", description: "Zwart", link: "https://psv.nl/uit", video_id: "3" },
        ],
      },
    },
  });
  assert.equal(d.soort, "carrousel");
  assert.equal(d.kaarten.length, 2);
  assert.equal(d.afbeeldingen, 1);
  assert.equal(d.videos, 1);
  assert.match(creativeTekst(d).join("\n"), /Kaart 2: Uit · Zwart · https:\/\/psv\.nl\/uit · video/);
});

test("Advantage+: alle varianten", () => {
  const d = normaliseerCreative({
    asset_feed_spec: {
      bodies: [{ text: "A" }, { text: "B" }, { text: "A" }],
      titles: [{ text: "Kop 1" }, { text: "Kop 2" }],
      call_to_action_types: ["BUY_TICKETS"],
      link_urls: [{ website_url: "https://psv.nl/tickets" }],
      images: [{ hash: "1" }, { hash: "2" }, { hash: "3" }],
    },
  });
  assert.equal(d.soort, "dynamisch");
  assert.deepEqual(d.teksten, ["A", "B"]);
  assert.equal(d.afbeeldingen, 3);
  const tekst = creativeTekst(d).join("\n");
  assert.match(tekst, /Tekst \(2 varianten\):\n  1\. A\n  2\. B/);
  assert.match(tekst, /Knop: Tickets kopen \(BUY_TICKETS\)/);
});

test("bestaande post: tekst komt uit de post", () => {
  const d = normaliseerCreative({ effective_object_story_id: "123_456" });
  assert.equal(d.soort, "post");
  assert.equal(postZonderTekst(d), "123_456");
  assert.match(creativeTekst(d).join("\n"), /draait op post 123_456/);
  const aangevuld = metPostTekst(d, "  Uitverkocht!  ");
  assert.deepEqual(aangevuld.teksten, ["Uitverkocht!"]);
  assert.equal(postZonderTekst(aangevuld), null);
  assert.equal(metPostTekst(d, undefined), d);
});

test("lege creative en onbekende CTA", () => {
  const d = normaliseerCreative(undefined);
  assert.equal(d.soort, "onbekend");
  assert.equal(postZonderTekst(d), null);
  assert.equal(ctaLabel("SHOP_NOW"), "Shop nu");
  assert.equal(ctaLabel("GET_DIRECTIONS"), "Get directions");
});
