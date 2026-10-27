// M12c2: the path builder on the real API (FR-ADM-02, BR-16, BR-19, BR-20, BR-34, Q-63).
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, PASSWORD, PHOTO, call, createUser, nav, shot, title, token, uiLogin, uniq } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const login = (page: Page) => uiLogin(page, ADMIN, PASSWORD, "Użytkownicy");
const toast = (page: Page, text: string) => expect(page.getByText(text).first()).toBeVisible();
/** A task row in the builder, by the task's name. */
const taskRow = (page: Page, name: string) => page.locator(`[data-task="${name}"]`);
const footer = (page: Page) => page.getByRole("button", { name: "Zapisz", exact: true });

async function addTask(page: Page, stage: string, type: RegExp, name: string) {
  await page.getByRole("region", { name: stage }).getByRole("button", { name: "Dodaj zadanie" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: type }).click();
  await sheet.getByLabel("Tytuł").fill(name);
  await sheet.getByRole("button", { name: "Utwórz i edytuj" }).click();
  await expect(title(page, name)).toBeVisible();
}

async function action(page: Page, task: string, what: string) {
  await page.getByRole("button", { name: `Działania: ${task}` }).click();
  await page.getByRole("dialog").getByText(what, { exact: true }).click();
}

test("seedowa ścieżka w kreatorze: liczby, oznaczenia z API, zdjęcie wzorcowe", async ({ page }, info) => {
  await login(page);
  await nav(page, "Ścieżki").click();
  const v1 = page.getByRole("button", { name: /2 etapy · 35 zadań/ }).first();
  await expect(v1).toContainText("Wersja 1");
  await expect(v1).toContainText("Przyjmuje zapisy");
  await shot(page, "41-sciezki", info.project.name);
  await v1.click();
  await expect(title(page, "Podstawy kowalstwa · v1")).toBeVisible();
  await expect(taskRow(page, "Bezpieczeństwo pracy w kuźni")).toContainText("E1.1 · Bezpieczeństwo pracy w kuźni");
  await expect(taskRow(page, "Damast puszkowy")).toContainText("E2.14 · Damast puszkowy");
  await shot(page, "42-kreator", info.project.name);
  await taskRow(page, "Haczyk / zawieszka").getByRole("button").first().click();
  await expect(title(page, "Haczyk / zawieszka")).toBeVisible();
  const thumb = page.getByRole("img", { name: "Wymagane: 2 podobne egzemplarze" });
  await expect.poll(() => thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByLabel("Kolejność operacji")).toHaveValue(/Kształtowanie rybiego ogona/);
  await shot(page, "43-edytor-karty", info.project.name);
});

test("nowa ścieżka od zera: etapy, zadania wszystkich typów, quiz z podglądem, kolejność, pliki, wersje", async ({ page, request }, info) => {
  const pathName = uniq("Kowalstwo artystyczne ");
  await login(page);
  await nav(page, "Ścieżki").click();
  await page.getByRole("button", { name: "Nowa ścieżka" }).click();
  await page.getByRole("dialog").getByLabel("Nazwa ścieżki").fill(pathName);
  await page.getByRole("dialog").getByRole("button", { name: "Utwórz" }).click();
  await toast(page, "Utworzono ścieżkę z wersją 1");
  await expect(title(page, `${pathName} · v1`)).toBeVisible();

  await page.getByRole("button", { name: "Dodaj etap" }).click();
  await page.getByRole("dialog").getByLabel("Nazwa etapu").fill("Formy");
  await page.getByRole("dialog").getByRole("button", { name: "Dodaj etap" }).click();
  await toast(page, "Dodano etap");

  // A work with its card.
  await addTask(page, "Etap 1", /^Praca własna/, "Liść");
  await page.getByLabel("Czas (dni)").fill("14");
  await page.getByLabel("Do wykonania").fill("2 sztuki");
  await page.getByLabel("Materiał", { exact: true }).fill("płaskownik 20 × 4 mm");
  await page.getByLabel("Cel ćwiczenia").fill("Kształtowanie liścia z płaskownika.");
  await page.getByLabel("Kolejność operacji").fill("Wyciągnięcie ogonka\nRozklepanie blaszki\nNacinanie żyłek");
  await page.getByLabel("Zadanie", { exact: true }).fill("Wykonaj 2 liście.");
  await page.getByLabel("Na co zwrócić uwagę").fill("Symetria, płynne przejście ogonka.");
  await page.getByLabel("Materiał do zaliczenia w aplikacji").fill("Zdjęcie obu liści.");
  await expect(page.getByText("Pliki dodasz po pierwszym zapisaniu zadania.").first()).toBeVisible();
  await footer(page).click();
  await toast(page, "Utworzono zadanie · wersja treści 1");
  await expect(taskRow(page, "Liść")).toContainText("E1.1 · Liść");
  await expect(taskRow(page, "Liść")).toContainText("wersja treści 1");

  // Theory with Markdown and a video.
  await addTask(page, "Etap 1", /^Teoria/, "Rodzaje stali");
  await page.getByLabel("Treść w Markdown").fill("## Stal niskowęglowa\n- łatwa w kuciu\n- **nie** hartuje się");
  await page.getByRole("radio", { name: "Podgląd" }).click();
  await expect(page.getByRole("heading", { name: "Stal niskowęglowa" })).toBeVisible();
  await page.getByLabel("Polecenie dla uczestnika").fill("Opisz trzy rodzaje stali.");
  await page.getByLabel("Link do filmu").fill("http://example.com/film");
  await expect(page.getByText("Link musi zaczynać się od https://")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dodaj film" })).toBeDisabled();
  await page.getByLabel("Tytuł filmu").fill("Gatunki stali");
  await page.getByLabel("Link do filmu").fill("https://www.youtube.com/watch?v=stal");
  await page.getByRole("button", { name: "Dodaj film" }).click();
  await footer(page).click();
  await toast(page, "Utworzono zadanie");
  await expect(taskRow(page, "Rodzaje stali")).toContainText("E1.2 · Rodzaje stali");

  // A quiz: cannot be saved without questions; preview grades in the browser only.
  await addTask(page, "Etap 1", /^Quiz/, "Test stali");
  await expect(page.getByText("Quiz musi mieć co najmniej jedno pytanie.")).toBeVisible();
  await expect(footer(page)).toBeDisabled();
  await page.getByRole("button", { name: "Dodaj pytanie" }).click();
  await page.getByLabel("Treść pytania 1").fill("Która stal jest niskowęglowa?");
  await page.getByLabel("Pytanie 1, odpowiedź 1", { exact: true }).fill("S235");
  await page.getByLabel("Pytanie 1, odpowiedź 2", { exact: true }).fill("NC6");
  await page.getByRole("button", { name: "Dodaj pytanie" }).click();
  await page.getByLabel("Treść pytania 2").fill("Co chroni oczy?");
  await page.getByRole("radiogroup", { name: "Rodzaj pytania 2" }).getByRole("radio", { name: "Kilka odpowiedzi" }).click();
  await page.getByLabel("Pytanie 2, odpowiedź 1", { exact: true }).fill("Okulary");
  await page.getByLabel("Pytanie 2, odpowiedź 2", { exact: true }).fill("Przyłbica");
  await page.getByRole("checkbox", { name: "Poprawna: pytanie 2, odpowiedź 2" }).click();
  await shot(page, "44-edytor-quizu", info.project.name);
  await page.getByRole("button", { name: "Podgląd" }).click();
  await page.getByRole("radio", { name: "S235" }).click();
  await page.getByRole("checkbox", { name: "Okulary" }).click();
  await page.getByRole("checkbox", { name: "Przyłbica" }).click();
  await page.getByRole("button", { name: "Sprawdź" }).click();
  await expect(page.getByRole("heading", { name: "Zaliczone" })).toBeVisible();
  await shot(page, "45-podglad-quizu", info.project.name);
  await page.getByRole("button", { name: "Edycja" }).click();
  await expect(page.getByLabel("Treść pytania 2")).toHaveValue("Co chroni oczy?"); // nothing lost while previewing
  await footer(page).click();
  await toast(page, "Utworzono zadanie");
  await expect(taskRow(page, "Test stali")).toContainText("E1.3 · Test stali");

  // Order: the backend recounts the labels (BR-34).
  await action(page, "Test stali", "Przesuń wyżej");
  await expect(taskRow(page, "Test stali")).toContainText("E1.2 · Test stali");
  await expect(taskRow(page, "Rodzaje stali")).toContainText("E1.3 · Rodzaje stali");

  // Files on the saved work: an upload is its own revision.
  await taskRow(page, "Liść").getByRole("button").first().click();
  await page.locator("#material-file").setInputFiles({ name: "lisc.jpg", mimeType: "image/jpeg", buffer: PHOTO });
  await toast(page, "Dodano zdjęcie wzorcowe · wersja treści 2");
  const thumb = page.getByRole("img", { name: "Zdjęcie wzorcowe" });
  await expect.poll(() => thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByLabel("Podpis zdjęcia 1").fill("Wymagane: 2 liście");
  await expect(page.getByRole("button", { name: "Dodaj PDF" })).toBeDisabled(); // unsaved edits first
  await expect(page.getByText("Najpierw zapisz zmiany").first()).toBeVisible();
  await footer(page).click();
  await toast(page, "Zapisano wersję treści 3");
  await taskRow(page, "Liść").getByRole("button").first().click();
  await expect(page.getByLabel("Podpis zdjęcia 1")).toHaveValue("Wymagane: 2 liście");
  await page.locator("#attachment-pdf").setInputFiles({ name: "rysunek.jpg", mimeType: "application/pdf", buffer: PHOTO });
  await toast(page, "Dozwolone są tylko pliki PDF.");
  await page.locator("#attachment-pdf").setInputFiles({ name: "rysunek.pdf", mimeType: "application/pdf", buffer: PDF });
  await toast(page, "Dodano PDF · wersja treści 4");
  await expect(page.getByLabel("Tytuł PDF 1")).toHaveValue("rysunek");
  await page.getByRole("button", { name: "Wersja", exact: true }).click();

  // A second stage, moving a task there, and the order of stages.
  await page.getByRole("button", { name: "Dodaj etap" }).click();
  await page.getByRole("dialog").getByLabel("Nazwa etapu").fill("Ostrza");
  await page.getByRole("dialog").getByRole("button", { name: "Dodaj etap" }).click();
  await action(page, "Rodzaje stali", "Etap 2 · Ostrza");
  await toast(page, "Przeniesiono na koniec etapu");
  await expect(taskRow(page, "Rodzaje stali")).toContainText("E2.1 · Rodzaje stali");
  await page.getByRole("button", { name: "Etap 2 wyżej" }).click();
  await expect(taskRow(page, "Rodzaje stali")).toContainText("E1.1 · Rodzaje stali");
  await expect(taskRow(page, "Liść")).toContainText("E2.1 · Liść");

  // Deactivate and back (BR-20): no label while off.
  await action(page, "Test stali", "Wyłącz zadanie");
  await toast(page, "Zadanie wyłączone");
  await expect(taskRow(page, "Test stali")).toContainText("wyłączone");
  await expect(taskRow(page, "Test stali")).not.toContainText("E2.");
  await action(page, "Test stali", "Włącz zadanie");
  await expect(taskRow(page, "Test stali")).toContainText("E2.2 · Test stali");

  // Open for enrollments; a participant sees exactly what was arranged.
  await page.getByRole("switch", { name: "Przyjmuje nowe zapisy" }).click();
  await toast(page, "Wersja przyjmuje zapisy");
  await expect(page.getByRole("switch", { name: "Przyjmuje nowe zapisy" })).toHaveAttribute("aria-checked", "true");
  const admin = await token(request, ADMIN);
  const paths = await call<{ items: { id: string; name: string }[] }>(request, admin, "GET", "/admin/paths?limit=200");
  const path = paths.items.find((p) => p.name === pathName)!;
  const v1 = (await call<{ versions: { id: string; version_number: number }[] }>(request, admin, "GET", `/admin/paths/${path.id}`)).versions[0];
  const p = await createUser(request, uniq("Kamil"), ["PARTICIPANT"]);
  await call(request, admin, "POST", "/admin/enrollments", { user_id: p.id, path_version_id: v1.id }, 201);
  const pt = await token(request, p.email, p.password);
  const progress = await call<{ stages: { name: string; tasks: { label: string; name: string; status: string }[] }[] }>(request, pt, "GET", `/me/paths/${v1.id}/progress`);
  expect(progress.stages.map((s) => [s.name, s.tasks.map((t) => `${t.label} ${t.name} ${t.status}`)])).toEqual([
    ["Ostrza", ["E1.1 Rodzaje stali AVAILABLE"]],
    ["Formy", ["E2.1 Liść LOCKED", "E2.2 Test stali LOCKED"]],
  ]);

  // A copy makes version 2 with the same content, closed for enrollments (Q-07).
  await page.getByRole("button", { name: "Kopia" }).click();
  await toast(page, "Utworzono wersję 2");
  await expect(title(page, `${pathName} · v2`)).toBeVisible();
  await expect(taskRow(page, "Liść")).toContainText("E2.1 · Liść");
  await expect(page.getByRole("switch", { name: "Przyjmuje nowe zapisy" })).toHaveAttribute("aria-checked", "false");
});
