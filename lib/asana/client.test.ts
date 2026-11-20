import { test } from "node:test";
import assert from "node:assert/strict";

import { AsanaConfigError, AsanaFout, TESTPROJECT, asanaApi, asanaConfig, escapeAsana, leesTaak, vanTestproject } from "./client";

interface Verzoek {
  methode: string;
  url: URL;
  headers: Record<string, string>;
  body?: unknown;
}

function nepFetch(antwoorden: { status?: number; body?: unknown }[]) {
  const verzoeken: Verzoek[] = [];
  const doeFetch = (async (input: URL | string, init?: RequestInit) => {
    verzoeken.push({
      methode: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const a = antwoorden.shift() ?? { status: 200, body: { data: {} } };
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  }) as typeof fetch;
  return { doeFetch, verzoeken };
}

test("asanaConfig vraagt ASANA_TOKEN", () => {
  assert.throws(() => asanaConfig({}), AsanaConfigError);
  assert.deepEqual(asanaConfig({ ASANA_TOKEN: " abc " }), { token: "abc" });
});

test("leesTaak: sectie uit het juiste project, custom fields als naam → waarde", () => {
  const taak = leesTaak(
    {
      gid: "1",
      name: "TEST | TICKETING | Real Madrid - PSV",
      notes: "brief",
      due_on: "2026-11-27",
      memberships: [
        { project: { gid: "999" }, section: { name: "Ander bord" } },
        { project: { gid: TESTPROJECT }, section: { name: "Productie" } },
      ],
      custom_fields: [
        { name: "DMID26", display_value: "DMID26-22619" },
        { name: "Leeg", display_value: null },
      ],
    },
    TESTPROJECT
  );
  assert.equal(taak.sectie, "Productie");
  assert.deepEqual(taak.projecten, ["999", TESTPROJECT]);
  assert.deepEqual(taak.velden, { DMID26: "DMID26-22619" });
  assert.equal(taak.dueOn, "2026-11-27");
  assert.ok(vanTestproject(taak));
  assert.ok(!vanTestproject({ projecten: ["999"] }));
});

test("client: taken uit een project, alleen open taken, met bearer-token", async () => {
  const { doeFetch, verzoeken } = nepFetch([
    { body: { data: [{ gid: "11", name: "Taak", memberships: [{ project: { gid: TESTPROJECT }, section: { name: "Productie" } }] }] } },
  ]);
  const taken = await asanaApi({ token: "tok" }, doeFetch).takenInProject(TESTPROJECT);
  assert.deepEqual(taken, [{ gid: "11", naam: "Taak", sectie: "Productie" }]);
  const [v] = verzoeken;
  assert.equal(v.url.pathname, `/api/1.0/projects/${TESTPROJECT}/tasks`);
  assert.equal(v.url.searchParams.get("completed_since"), "now");
  assert.equal(v.headers.Authorization, "Bearer tok");
});

test("client: reactie en sectie gaan als { data } naar de juiste paden", async () => {
  const { doeFetch, verzoeken } = nepFetch([{ status: 201, body: { data: { gid: "s1" } } }, { body: { data: {} } }]);
  const api = asanaApi({ token: "tok" }, doeFetch);
  await api.plaatsReactie("11", "<body>Hoi</body>");
  await api.naarSectie("22", "11");
  assert.equal(verzoeken[0].methode, "POST");
  assert.equal(verzoeken[0].url.pathname, "/api/1.0/tasks/11/stories");
  assert.deepEqual(verzoeken[0].body, { data: { html_text: "<body>Hoi</body>" } });
  assert.equal(verzoeken[1].url.pathname, "/api/1.0/sections/22/addTask");
  assert.deepEqual(verzoeken[1].body, { data: { task: "11" } });
});

test("client: weigert een ongeldig ID zonder verzoek", async () => {
  const { doeFetch, verzoeken } = nepFetch([]);
  await assert.rejects(asanaApi({ token: "t" }, doeFetch).taak("../users/me"), (err: unknown) => err instanceof AsanaFout && err.status === 400);
  assert.equal(verzoeken.length, 0);
});

test("client: een fout van Asana wordt een AsanaFout met de melding", async () => {
  const { doeFetch } = nepFetch([{ status: 403, body: { errors: [{ message: "Not authorized" }] } }]);
  await assert.rejects(asanaApi({ token: "t" }, doeFetch).taak("11"), (err: unknown) => err instanceof AsanaFout && err.status === 403 && err.message === "Not authorized");
});

test("bijlagen: herkent afbeeldingen aan de naam", async () => {
  const { doeFetch } = nepFetch([{ body: { data: [{ gid: "a", name: "5312 Ticketing UCL - MAILING 01.jpg" }, { gid: "b", name: "doelgroep.xlsx" }] } }]);
  const bijlagen = await asanaApi({ token: "t" }, doeFetch).bijlagen("11");
  assert.deepEqual(bijlagen.map((b) => b.isAfbeelding), [true, false]);
});

test("escapeAsana", () => {
  assert.equal(escapeAsana(`<KORTINGSCODE> & "x"`), "&lt;KORTINGSCODE&gt; &amp; &quot;x&quot;");
});
