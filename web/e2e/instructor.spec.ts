// M12b: the instructor's part of the panel on the real API (queue, review, courses, own assessments).
import { expect, test, type Page } from "@playwright/test";
import { INSTRUCTOR, PASSWORD, call, nav, newInstructor, newParticipant, shot, submit, title, uiLogin, uniq } from "./helpers";

const BHP = "Bezpieczeństwo pracy w kuźni";
const row = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first();
/** A list row by its content, clickable or not (a row stops being a button once nothing can be done with it). */
const entry = (page: Page, text: string) => page.locator("[class*='min-h-11']").filter({ hasText: text });
const login = (page: Page) => uiLogin(page, INSTRUCTOR, PASSWORD, "Kolejka ocen");
const taskStatus = async (request: import("@playwright/test").APIRequestContext, p: { token: string; tasks: Record<string, string> }, task: string) =>
  (await call<{ status: string }>(request, p.token, "GET", `/tasks/${p.tasks[task]}`)).status;

test("ocena: przejęcie, do poprawy z komentarzem, druga próba zaliczona", async ({ page, request }, info) => {
  const first = uniq("Olek");
  const who = `${first} Testowa`;
  const p = await newParticipant(request, first);
  await submit(request, p, BHP, "Oparzenia, oczy, dłonie i tlenek węgla.");

  await login(page);
  const item = row(page, new RegExp(who));
  await expect(item).toContainText(`E1.1 · ${BHP} · próba 1`);
  await expect(item).toContainText("1 zdj.");
  await shot(page, "21-kolejka", info.project.name);

  await item.click();
  await expect(title(page, who)).toBeVisible();
  const photo = page.getByRole("img", { name: "Zdjęcie 1 z 1" });
  await expect.poll(() => photo.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0); // loaded with the token
  await expect(page.getByText("Oparzenia, oczy, dłonie i tlenek węgla.")).toBeVisible();
  await page.getByRole("button", { name: "Przejmij do oceny" }).click();
  await expect(page.getByText("Przejęto do oceny")).toBeVisible();
  await expect(page.getByText("Pięć różnych zagrożeń, przy każdym konkretny sposób ochrony.")).toBeVisible(); // criteria of the sent revision
  await shot(page, "22-ocena", info.project.name);

  await page.getByRole("radio", { name: "Do poprawy" }).click();
  await page.getByRole("button", { name: "Odeślij do poprawy" }).click();
  await expect(page.getByText("Napisz, co uczestnik ma poprawić.").first()).toBeVisible(); // the comment is required (BR-07)
  await page.getByLabel("Komentarz (wymagany)").fill("Brakuje hałasu i ochrony słuchu.");
  await page.getByRole("button", { name: "Odeślij do poprawy" }).click();
  await expect(page.getByText("Skierowano do poprawy")).toBeVisible();
  await expect(title(page, "Kolejka ocen")).toBeVisible();
  expect(await taskStatus(request, p, BHP)).toBe("NEEDS_IMPROVEMENT");

  await submit(request, p, BHP, "Dopisałem hałas: nauszniki.");
  await page.reload();
  await row(page, new RegExp(`${who}.*próba 2`)).click();
  await expect(page.getByText("„Brakuje hałasu i ochrony słuchu.”")).toBeVisible(); // previous attempt with its feedback
  await page.getByRole("button", { name: "Przejmij do oceny" }).click();
  await page.getByRole("button", { name: "Zalicz zadanie" }).click();
  await expect(page.getByText("Zadanie zaliczone")).toBeVisible();
  expect(await taskStatus(request, p, BHP)).toBe("PASSED");
  expect(await taskStatus(request, p, "Gwóźdź")).toBe("AVAILABLE"); // the next one unlocked

  await nav(page, "Ocenione").click();
  await expect(title(page, "Ocenione")).toBeVisible();
  const rows = entry(page, who);
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: `E1.1 · ${BHP} · próba 2` })).toContainText("Zaliczone");
  await expect(rows.filter({ hasText: `E1.1 · ${BHP} · próba 1` })).toContainText("Do poprawy");
  await shot(page, "23-ocenione", info.project.name);
});

test("zwolnienie: zgłoszenie wraca do kolejki", async ({ page, request }) => {
  const first = uniq("Zenek");
  const p = await newParticipant(request, first);
  await submit(request, p, BHP);
  await login(page);
  await row(page, new RegExp(`${first} Testowa`)).click();
  await page.getByRole("button", { name: "Przejmij do oceny" }).click();
  await expect(page.getByRole("heading", { name: "Ocena" })).toBeVisible();
  await page.getByRole("button", { name: "Zwolnij zgłoszenie" }).click();
  await expect(page.getByText("Zgłoszenie zwolnione")).toBeVisible();
  await expect(page.getByRole("button", { name: "Przejmij do oceny" })).toBeVisible();
  await expect(page.locator("header").getByText("Czeka na instruktora")).toBeVisible();
});

test("wyścig: drugi instruktor przejął pierwszy — czytelny komunikat", async ({ page, request }) => {
  const first = uniq("Iga");
  const p = await newParticipant(request, first);
  const id = await submit(request, p, BHP);
  const other = await newInstructor(request, uniq("Bartek"));
  await login(page);
  await row(page, new RegExp(`${first} Testowa`)).click();
  await expect(page.getByRole("button", { name: "Przejmij do oceny" })).toBeVisible();
  await call(request, other.token, "POST", `/submissions/${id}/claim`); // meanwhile, someone else is faster
  await page.getByRole("button", { name: "Przejmij do oceny" }).click();
  await expect(page.getByText("Instruktor już ocenia to zgłoszenie.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: `Ocenia: ${other.name}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Przejmij do oceny" })).toHaveCount(0);
});

test("kursy: wynik do powtórki z komentarzem, potem zaliczony; etap zamknięty", async ({ page, request }, info) => {
  const first = uniq("Kuba");
  const who = `${first} Testowa`;
  const p = await newParticipant(request, first);
  await login(page);
  await nav(page, "Kursy").click();
  await expect(title(page, "Kursy")).toBeVisible();
  await expect(page.getByText("Podstawy kowalstwa · Etap 1 · Kowalstwo podstawowe")).toBeVisible();
  await expect(page.getByText("Podstawy kowalstwa · Etap 2 · Kowalstwo zaawansowane")).toBeVisible();
  await row(page, /^Podkowa/).click();
  await expect(title(page, "Podkowa")).toBeVisible();

  const person = entry(page, who);
  await expect(person).toContainText("Wpisz wynik");
  await shot(page, "24-kurs", info.project.name);
  await person.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: "Do powtórki" }).click();
  await sheet.getByRole("button", { name: "Zapisz wynik" }).click();
  await expect(sheet.getByText("Napisz, nad czym uczestnik ma popracować.")).toBeVisible();
  await sheet.getByLabel("Komentarz (wymagany)").fill("Podkowa nierówna — przyjdź na kolejny termin.");
  await sheet.getByRole("button", { name: "Zapisz wynik" }).click();
  await expect(page.getByText(`Do powtórki: ${who}`)).toBeVisible();
  await expect(person).toContainText("Do powtórki");
  expect(await taskStatus(request, p, "Podkowa")).toBe("NEEDS_IMPROVEMENT");

  await person.click();
  await sheet.getByRole("button", { name: "Zapisz wynik" }).click(); // "Zaliczony" is the default
  await expect(page.getByText(`Kurs zaliczony: ${who}`)).toBeVisible();
  await expect(person).toContainText("Zaliczony");
  expect(await taskStatus(request, p, "Podkowa")).toBe("PASSED");

  // A course in stage 2 is closed until stage 1 is complete (BR-31).
  await nav(page, "Kursy").click(); // tapping the active tab goes back to its first screen
  await row(page, /^Damast warstwowy/).click();
  await expect(entry(page, who)).toContainText("Etap niedostępny");

  await nav(page, "Ocenione").click();
  await expect(entry(page, who).filter({ hasText: "Podkowa · wynik kursu" }).first()).toContainText("Zaliczone");
});
