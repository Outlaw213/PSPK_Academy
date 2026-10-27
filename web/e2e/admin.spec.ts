// M12c1: the admin's part of the panel on the real API (users, enrollments, permissions, log).
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, PASSWORD, canLogin, createUser, nav, newParticipant, register, shot, submit, title, uiLogin, uniq } from "./helpers";

const login = (page: Page) => uiLogin(page, ADMIN, PASSWORD, "Użytkownicy");
/** A list row by its content, clickable or not. */
const entry = (page: Page, text: string) => page.locator("[class*='min-h-11']").filter({ hasText: text });
const toast = (page: Page, text: string) => expect(page.getByText(text).first()).toBeVisible();

test("użytkownicy: akceptacja, odrzucenie, role, dezaktywacja, hasło, ochrona własnego konta", async ({ page, request }, info) => {
  const ok = await register(request, uniq("Tola"));
  const spam = await register(request, uniq("Spam"));
  await login(page);

  await expect(page.getByText(/Czekają na akceptację/)).toBeVisible();
  await shot(page, "31-uzytkownicy", info.project.name);
  await page.getByRole("button", { name: `Zatwierdź ${ok.name}` }).click();
  await toast(page, "Konto zatwierdzone");
  expect(await canLogin(request, ok.email, ok.password)).toBe(true);
  await page.getByRole("button", { name: `Odrzuć ${spam.name}` }).click();
  await toast(page, "Rejestracja odrzucona");
  expect(await canLogin(request, spam.email, spam.password)).toBe(false);

  // Roles.
  await page.getByLabel("Szukaj użytkowników").fill(ok.name.split(" ")[0]);
  await entry(page, ok.email).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByText("Instruktor", { exact: true }).click();
  await sheet.getByRole("button", { name: "Zapisz" }).click();
  await toast(page, "Zapisano zmiany");
  await expect(entry(page, ok.email).first()).toContainText("Instruktor");

  // Deactivate and back.
  await entry(page, ok.email).first().click();
  await sheet.getByRole("button", { name: "Dezaktywuj konto" }).click();
  await toast(page, "Konto dezaktywowane");
  await expect(entry(page, ok.email).first()).toContainText("Dezaktywowane");
  expect(await canLogin(request, ok.email, ok.password)).toBe(false);
  await entry(page, ok.email).first().click();
  await sheet.getByRole("button", { name: "Aktywuj ponownie" }).click();
  await toast(page, "Konto aktywne");

  // Password set by the admin.
  await entry(page, ok.email).first().click();
  await sheet.getByLabel("Nowe hasło").fill("nowe-haslo-od-admina-2026");
  await sheet.getByRole("button", { name: "Ustaw hasło" }).click();
  await toast(page, "Hasło ustawione.");
  expect(await canLogin(request, ok.email, "nowe-haslo-od-admina-2026")).toBe(true);
  await sheet.getByRole("button", { name: "Zamknij" }).click();

  // The admin cannot take away their own admin role.
  await page.getByLabel("Szukaj użytkowników").fill("admin@akademia");
  await entry(page, ADMIN).first().click();
  await sheet.getByText("Uczestnik", { exact: true }).click(); // keep at least one role, drop Administrator
  await sheet.getByText("Administrator", { exact: true }).click();
  await sheet.getByRole("button", { name: "Zapisz" }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Nie możesz dezaktywować siebie ani odebrać sobie roli administratora.");
});

test("nowe konto zakładane przez admina", async ({ page, request }) => {
  const first = uniq("Rafał");
  const email = `${first.toLowerCase().replace("ł", "l")}@akademia.example`;
  await login(page);
  await page.getByRole("button", { name: "Dodaj użytkownika" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Imię").fill(first);
  await sheet.getByLabel("Nazwisko").fill("Kowal");
  await sheet.getByLabel("E-mail").fill(email);
  await sheet.getByLabel("Hasło").fill("haslo-nowego-konta-26");
  await sheet.getByRole("button", { name: "Utwórz konto" }).click();
  await toast(page, "Konto utworzone");
  expect(await canLogin(request, email, "haslo-nowego-konta-26")).toBe(true); // active straight away (BR-28)
});

test("zapisy: zapis z postępem, podwójny zapis, anulowanie, filtr", async ({ page, request }, info) => {
  const p = await createUser(request, uniq("Józef"), ["PARTICIPANT"]);
  await login(page);
  await nav(page, "Zapisy").click();
  await expect(title(page, "Zapisy")).toBeVisible();

  const enroll = async () => {
    await page.getByRole("button", { name: "Zapisz" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Uczestnik", { exact: true }).fill(p.name.split(" ")[0]);
    await sheet.getByRole("radio", { name: new RegExp(p.name) }).click();
    await sheet.getByLabel("Ścieżka i wersja").selectOption({ label: "Podstawy kowalstwa · wersja 1" });
    await sheet.getByRole("button", { name: "Zapisz", exact: true }).click();
    return sheet;
  };
  await enroll();
  await toast(page, "Uczestnik zapisany");
  const row = entry(page, p.name).first();
  await expect(row).toContainText("0/35");
  await expect(row).toContainText("Aktywny");
  await shot(page, "32-zapisy", info.project.name);

  const sheet = await enroll();
  await expect(sheet.getByRole("alert")).toHaveText("Ten uczestnik jest już zapisany na tę ścieżkę.");
  await sheet.getByRole("button", { name: "Zamknij" }).click();

  await row.click();
  await page.getByRole("dialog").getByRole("button", { name: "Anuluj zapis" }).click();
  await toast(page, "Zapis anulowany");
  await page.getByRole("radio", { name: "Anulowane" }).click();
  await expect(entry(page, p.name).first()).toContainText("Anulowany");
});

test("uprawnienia: etap i cała wersja, duplikat, odebranie", async ({ page, request }, info) => {
  const ins = await createUser(request, uniq("Leon"), ["INSTRUCTOR"]);
  await login(page);
  await nav(page, "Uprawnienia").click();
  await expect(title(page, "Uprawnienia")).toBeVisible();

  const grant = async (scope: string) => {
    await page.getByRole("button", { name: "Nadaj" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Instruktor").selectOption({ label: `${ins.name} · ${ins.email}` });
    await sheet.getByLabel("Ścieżka i wersja").selectOption({ label: "Podstawy kowalstwa · wersja 1" });
    await expect(sheet.getByLabel("Zakres").locator("option")).toHaveCount(3); // whole version + 2 stages
    await sheet.getByLabel("Zakres").selectOption({ label: scope });
    await sheet.getByRole("button", { name: "Nadaj", exact: true }).click();
    return sheet;
  };
  await grant("Etap 1 · Kowalstwo podstawowe");
  await toast(page, "Uprawnienie nadane");
  await expect(entry(page, ins.name).first()).toContainText("Podstawy kowalstwa v1 · Etap 1 · Kowalstwo podstawowe");
  const dup = await grant("Etap 1 · Kowalstwo podstawowe");
  await expect(dup.getByRole("alert")).toHaveText("Takie uprawnienie już istnieje.");
  await dup.getByRole("button", { name: "Zamknij" }).click();
  await grant("Cała wersja");
  await toast(page, "Uprawnienie nadane");
  await expect(entry(page, ins.name)).toHaveCount(2);
  await expect(entry(page, ins.name).filter({ hasText: "cała wersja" })).toContainText("Wersja");
  await shot(page, "33-uprawnienia", info.project.name);

  await entry(page, ins.name).filter({ hasText: "Etap 1" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Odbierz uprawnienie" }).click();
  await toast(page, "Uprawnienie odebrane");
  await expect(entry(page, ins.name)).toHaveCount(1);
});

test("dziennik: zgłoszenia ze szczegółami i zdarzenia z filtrem", async ({ page, request }, info) => {
  const first = uniq("Ula");
  const who = `${first} Testowa`;
  const p = await newParticipant(request, first);
  await submit(request, p, "Bezpieczeństwo pracy w kuźni", "Pięć zagrożeń.");
  await login(page);
  await nav(page, "Dziennik").click();
  await expect(title(page, "Dziennik")).toBeVisible();

  await page.getByLabel("Status").selectOption({ label: "Czeka na instruktora" });
  await expect(entry(page, who).first()).toContainText("Czeka na instruktora");
  await shot(page, "34-dziennik-zgloszenia", info.project.name);
  await entry(page, who).first().click();
  await expect(title(page, who)).toBeVisible();
  const photo = page.getByRole("img", { name: "Zdjęcie 1" });
  await expect.poll(() => photo.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("Pięć zagrożeń.")).toBeVisible();
  await expect(page.getByText("Pięć różnych zagrożeń, przy każdym konkretny sposób ochrony.")).toBeVisible();
  await expect(page.getByText("Próba 1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Dziennik" }).first().click();
  await page.getByRole("radio", { name: "Zdarzenia" }).click();
  await page.getByLabel("Rodzaj zdarzenia").selectOption({ label: "Wysłanie zgłoszenia" });
  await expect(entry(page, who).first()).toContainText("Wysłanie zgłoszenia");
  await shot(page, "35-dziennik-zdarzenia", info.project.name);
});
