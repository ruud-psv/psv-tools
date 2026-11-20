import { test } from "node:test";
import assert from "node:assert/strict";
import { isIdentityColumn, isProbeVisibleColumn, maskForProbe, MASKED, stripIdentity } from "./privacy";

/** De kolommen van `/v1/clients`, zoals de probe ze op 2026-11-20 liet zien. */
const CLIENT_COLUMNS = [
  "_ringside_sequence", "_ringside_operation", "client_id", "crm_id", "external_id", "creation_datetime",
  "client_status", "record_type", "title", "lname_or_account_name", "fname", "mname", "prefered_name",
  "initials", "workplace", "job_title", "contact_person_id", "primary_address_id", "address_line_1",
  "address_line_2", "address_line_3", "city", "state", "country", "zipcode", "zipcode_confirmed",
  "address_type", "secondary_addresses", "mobile_phone_id", "mobile_phone", "home_phone_id", "home_phone",
  "business_phone_id", "business_phone", "email_id", "email", "client_types", "sales_reps", "service_reps",
  "suffix", "birthday", "date_of_death", "is_deceased", "gender", "marital_status", "secondary_contact_details",
  "exclude_from_marketing", "data_protection_questions", "preferred_language", "supplier_org_units",
  "inquiries", "last_touched_at",
];

test("naam, e-mail, telefoon en adresregels van een klant verdwijnen", () => {
  const stripped = CLIENT_COLUMNS.filter(isIdentityColumn).sort();
  assert.deepEqual(stripped, [
    "address_line_1", "address_line_2", "address_line_3", "business_phone", "business_phone_id", "email",
    "email_id", "fname", "home_phone", "home_phone_id", "initials", "lname_or_account_name", "mname",
    "mobile_phone", "mobile_phone_id", "prefered_name", "secondary_addresses", "secondary_contact_details",
  ]);
});

test("namen in andere tabellen worden ook geraakt", () => {
  for (const column of ["primary_first_name", "primary_last_name", "own_lname_or_accnt_name", "own_fname", "contact_name", "Email"]) {
    assert.ok(isIdentityColumn(column), column);
  }
});

test("wat de tools gebruiken blijft staan", () => {
  // De wachtlijst rekent met de GUID, geboortedatum, postcode en land.
  for (const column of ["client_id", "own_client_guid", "birthday", "zipcode", "country", "city", "crm_id"]) {
    assert.ok(!isIdentityColumn(column), column);
  }
  // Stoelen, verkoop en scans.
  for (const column of ["product_name", "product_details", "section_name", "row_name", "seat", "sale_type", "current_status", "scanner_name", "turnstile_name", "event_name", "transaction_date"]) {
    assert.ok(!isIdentityColumn(column), column);
  }
});

test("stripIdentity werkt op een hele pagina en laat de metadata staan", () => {
  const page = {
    data: [{ client_id: "abc", fname: "X", email: "x@example.com", zipcode: "1234 AB", birthday: "2000-01-01" }],
    has_more: false,
    metadata: { table_definition: [{ column: "fname", postgres_type: "text" }] },
  };
  assert.deepEqual(stripIdentity(page), {
    data: [{ client_id: "abc", zipcode: "1234 AB", birthday: "2000-01-01" }],
    has_more: false,
    metadata: { table_definition: [{ column: "fname", postgres_type: "text" }] },
  });
});

test("de probe toont alleen kolommen van de toestaanlijst", () => {
  const visible = CLIENT_COLUMNS.filter(isProbeVisibleColumn).sort();
  assert.deepEqual(visible, [
    "_ringside_operation", "_ringside_sequence", "client_status", "creation_datetime", "last_touched_at",
    "record_type", "supplier_org_units",
  ]);
});

test("een onbekende kolom is in de probe gemaskeerd, null blijft zichtbaar", () => {
  assert.deepEqual(maskForProbe({ sale_type: "Sale", nieuwe_kolom: "iets", birthday: "2000-01-01", gender: null, is_ga: true, is_deceased: false }), {
    sale_type: "Sale",
    nieuwe_kolom: MASKED,
    birthday: MASKED,
    gender: null,
    is_ga: true,
    is_deceased: MASKED,
  });
});
