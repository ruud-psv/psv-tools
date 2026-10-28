"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ACCESS_LEVELS,
  DEFAULT_LEVEL,
  PAGE_GROUPS,
  isValidEmail,
  normalizeEmail,
  type AccessLevel,
  type UserAccess,
} from "@/lib/access";

const LEVEL_LABEL = Object.fromEntries(ACCESS_LEVELS.map((l) => [l.value, l.label])) as Record<
  AccessLevel,
  string
>;
const PAGE_NAME = Object.fromEntries(
  PAGE_GROUPS.flatMap((g) => g.pages.map((p) => [p.href, p.name]))
) as Record<string, string>;

const LEVEL_BADGE: Record<AccessLevel, "default" | "gold" | "secondary" | "outline"> = {
  admin: "default",
  "all-beta": "gold",
  all: "secondary",
  custom: "outline",
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

interface Draft {
  email: string;
  level: AccessLevel;
  pages: string[];
}

const EMPTY_DRAFT: Draft = { email: "", level: DEFAULT_LEVEL, pages: [] };

export function UserManagement() {
  const [users, setUsers] = useState<UserAccess[]>([]);
  const [fixedAdmins, setFixedAdmins] = useState<string[]>([]);
  const [me, setMe] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    fetch("/api/users", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Laden is mislukt.");
        setUsers(data.users);
        setFixedAdmins(data.adminEmails);
        setMe(data.me);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const listed = users.filter((u) => !fixedAdmins.includes(u.email));
    return q ? listed.filter((u) => u.email.includes(q)) : listed;
  }, [users, fixedAdmins, query]);

  const email = normalizeEmail(draft.email);
  const emailIsFixedAdmin = fixedAdmins.includes(email);
  const isSelf = email === me;

  function startEdit(user: UserAccess) {
    setDraft({ email: user.email, level: user.level, pages: user.pages });
    setEditing(true);
    setFormError(null);
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    setDraft(EMPTY_DRAFT);
    setEditing(false);
    setFormError(null);
  }

  function togglePage(href: string, on: boolean) {
    setDraft((d) => ({
      ...d,
      pages: on ? [...d.pages, href] : d.pages.filter((p) => p !== href),
    }));
  }

  function toggleGroup(hrefs: string[], on: boolean) {
    setDraft((d) => ({
      ...d,
      pages: on
        ? Array.from(new Set([...d.pages, ...hrefs]))
        : d.pages.filter((p) => !hrefs.includes(p)),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    if (!isValidEmail(email)) return setFormError("Vul een geldig e-mailadres in.");
    if (draft.level === "custom" && draft.pages.length === 0) {
      return setFormError("Vink minstens één pagina aan, of kies een ander niveau.");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Opslaan is mislukt.");
      setUsers(data.users);
      setNotice(`${email} is opgeslagen als ${LEVEL_LABEL[draft.level]}.`);
      resetForm();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(user: UserAccess) {
    if (
      !confirm(
        `${user.email} verwijderen? Diegene valt dan terug op het standaardniveau (${LEVEL_LABEL[DEFAULT_LEVEL]}).`
      )
    )
      return;
    setNotice(null);
    setActionError(null);
    try {
      const res = await fetch(`/api/users?email=${encodeURIComponent(user.email)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verwijderen is mislukt.");
      setUsers(data.users);
      if (draft.email === user.email) resetForm();
      setNotice(`${user.email} is verwijderd uit de lijst.`);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="alert alert--info">
        Wie niet in de lijst staat, ook iemand die nog nooit heeft ingelogd, krijgt{" "}
        <strong>{LEVEL_LABEL[DEFAULT_LEVEL]}</strong>. Een wijziging is binnen een halve minuut
        actief, ook als die persoon al is ingelogd.
      </div>

      {/* Formulier */}
      <Card className="p-5 sm:p-6">
        <form ref={formRef} onSubmit={save} className="space-y-5 scroll-mt-6">
          <h2 className="font-heading text-xl uppercase tracking-wide">
            {editing ? "Gebruiker bewerken" : "Gebruiker toevoegen"}
          </h2>

          <div className="form-group max-w-md">
            <Label htmlFor="um-email" className="form-label">
              E-mailadres
            </Label>
            <Input
              id="um-email"
              type="email"
              placeholder="voornaam.achternaam@psv.nl"
              value={draft.email}
              disabled={editing}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
            <p className="form-hint">Het adres waarmee diegene via Microsoft inlogt.</p>
          </div>

          {emailIsFixedAdmin ? (
            <div className="alert alert--warning">
              Dit adres staat in <code>ADMIN_EMAILS</code> en is altijd admin. Pas dat aan in de
              omgevingsvariabelen van Vercel.
            </div>
          ) : (
            <>
              <fieldset>
                <legend className="label mb-2 font-heading uppercase tracking-wide">
                  Toegang
                </legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {ACCESS_LEVELS.map((level) => {
                    const disabled = isSelf && level.value !== "admin";
                    return (
                      <label
                        key={level.value}
                        className={cn(
                          "flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors",
                          draft.level === level.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50",
                          disabled && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="level"
                            value={level.value}
                            checked={draft.level === level.value}
                            disabled={disabled}
                            onChange={() => setDraft((d) => ({ ...d, level: level.value }))}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="font-heading text-sm uppercase tracking-wide">
                            {level.label}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">{level.description}</span>
                      </label>
                    );
                  })}
                </div>
                {isSelf && (
                  <p className="form-hint mt-2">Je kunt je eigen admin-rechten niet intrekken.</p>
                )}
              </fieldset>

              {draft.level === "custom" && (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {PAGE_GROUPS.map((group) => {
                    const hrefs = group.pages.map((p) => p.href);
                    const all = hrefs.every((h) => draft.pages.includes(h));
                    return (
                      <div key={group.title}>
                        <label className="mb-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={all}
                            onChange={(e) => toggleGroup(hrefs, e.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="font-heading text-sm uppercase tracking-wide">
                            {group.title}
                          </span>
                        </label>
                        <ul className="space-y-1.5 pl-6">
                          {group.pages.map((page) => (
                            <li key={page.href}>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={draft.pages.includes(page.href)}
                                  onChange={(e) => togglePage(page.href, e.target.checked)}
                                  className="h-4 w-4 accent-primary"
                                />
                                {page.name}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {formError && <p className="form-error">{formError}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || emailIsFixedAdmin}>
              {saving && <Loader2 className="animate-spin" />}
              Opslaan
            </Button>
            {(editing || draft.email) && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Annuleren
              </Button>
            )}
          </div>
        </form>
      </Card>

      {notice && <div className="alert alert--success">{notice}</div>}
      {actionError && <div className="alert alert--error">{actionError}</div>}

      {/* Overzicht */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-xl uppercase tracking-wide">Gebruikers</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Zoek op e-mailadres"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden…
          </p>
        ) : loadError ? (
          <div className="alert alert--error">{loadError}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="label py-2 pr-4 font-heading uppercase tracking-wide">E-mail</th>
                  <th className="label py-2 pr-4 font-heading uppercase tracking-wide">Toegang</th>
                  <th className="label py-2 pr-4 font-heading uppercase tracking-wide">
                    Pagina&apos;s
                  </th>
                  <th className="label py-2 pr-4 font-heading uppercase tracking-wide">
                    Gewijzigd
                  </th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {!query &&
                  fixedAdmins.map((adminEmail) => (
                    <tr key={adminEmail} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{adminEmail}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="default">Admin</Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">Alles</td>
                      <td className="py-3 pr-4 text-muted-foreground" colSpan={2}>
                        Vast via <code>ADMIN_EMAILS</code>
                      </td>
                    </tr>
                  ))}
                {filtered.map((user) => (
                  <tr key={user.email} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{user.email}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={LEVEL_BADGE[user.level]}>{LEVEL_LABEL[user.level]}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {user.level === "custom"
                        ? user.pages.map((href) => PAGE_NAME[href] ?? href).join(", ")
                        : user.level === "all"
                          ? "Alles zonder beta"
                          : "Alles"}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground" title={user.updatedBy}>
                      {formatDate(user.updatedAt)}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${user.email} bewerken`}
                        onClick={() => startEdit(user)}
                      >
                        <Pencil />
                      </Button>
                      {user.email !== me && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${user.email} verwijderen`}
                          onClick={() => remove(user)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (query || fixedAdmins.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      {query
                        ? "Geen gebruikers gevonden."
                        : `Nog niemand in de lijst — iedereen heeft ${LEVEL_LABEL[DEFAULT_LEVEL]}.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
