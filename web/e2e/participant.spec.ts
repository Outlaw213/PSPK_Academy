// M12a: the participant's part of the panel on the real API (statuses only from the backend, R11).
import { expect, test } from "@playwright/test";
import { ADMIN, PASSWORD, PHOTO, call, nav, newParticipant, sendAndAssess, shot, title, token, uiLogin } from "./helpers";

const row = (page: import("@playwright/test").Page, name: string | RegExp) => page.getByRole("button", { name }).first();
const badge = (scope: import("@playwright/test").Locator, text: string) => scope.getByText(text, { exact: true }).filter({ visible: true }).first();

test("logowanie: złe hasło, sesja po odświeżeniu, wylogowanie", async ({ page, request }, info) => {
  const p = await newParticipant(request);
  await page.goto("/");
  await page.getByLabel("E-mail").fill(p.email);
  await page.getByLabel("Hasło").fill("zupelnie-zle-haslo");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("alert")).toHaveText("Nieprawidłowy e-mail lub hasło.");
  await shot(page, "01-logowanie-blad", info.project.name);

  await page.getByLabel("Hasło").fill(p.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(title(page, "Moje ścieżki")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Podstawy kowalstwa" })).toBeVisible();
  await expect(page.getByText("Zaliczone 0 z 35 zadań")).toBeVisible();
  await shot(page, "02-sciezki", info.project.name);

  await page.reload(); // the access token lived in memory only; the HttpOnly cookie restores the session
  await expect(title(page, "Moje ścieżki")).toBeVisible();

  // Phones: the avatar at the top; desktop: the profile at the bottom of the sidebar.
  await page.getByRole("button", { name: "Konto i ustawienia" }).or(page.getByRole("button", { name: /Ewa Testowa/ })).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Wyloguj się" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("E-mail")).toBeVisible(); // the cookie was revoked
});

test("ścieżka: statusy z backendu, zadanie zablokowane bez przycisku startu", async ({ page, request }, info) => {
  const p = await newParticipant(request);
  await uiLogin(page, p.email, p.password);
  await page.getByRole("button", { name: /Podstawy kowalstwa/ }).click();
  await expect(title(page, "Podstawy kowalstwa")).toBeVisible();
  const bhp = row(page, /E1\.1.*Teoria/);
  const nail = row(page, /Gwóźdź.*E1\.2/);
  await expect(badge(bhp, "Dostępne")).toBeVisible();
  await expect(badge(nail, "Zablokowane")).toBeVisible();
  await expect(page.getByText("Odblokuje się po zaliczeniu wszystkich zadań poprzedniego etapu, także kursów.")).toBeVisible();
  await shot(page, "03-sciezka", info.project.name);

  await nail.click();
  await expect(title(page, "Gwóźdź")).toBeVisible();
  await expect(page.getByText("Odblokuje się po zaliczeniu poprzedniej pracy")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rozpocznij próbę/ })).toHaveCount(0);
  // Going around the panel does not help either: the backend refuses (TEST 12).
  const r = await request.post(`/api/v1/tasks/${p.tasks["Gwóźdź"]}/submissions`, { headers: { Authorization: `Bearer ${p.token}` }, data: {} });
  expect(r.status()).toBe(409);
  expect((await r.json()).error.code).toBe("TASK_LOCKED");
});

test("teoria: materiał, szkic, wysyłka, historia, wycofanie i nowa próba", async ({ page, request }, info) => {
  const p = await newParticipant(request);
  await uiLogin(page, p.email, p.password);
  await page.getByRole("button", { name: /Podstawy kowalstwa/ }).click();
  await row(page, /E1\.1.*Teoria/).click();
  await expect(title(page, "Bezpieczeństwo pracy w kuźni")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Najczęstsze zagrożenia" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Bezpieczne rozpalanie paleniska/ })).toHaveAttribute("target", "_blank");
  await shot(page, "04-teoria", info.project.name);

  await page.getByRole("button", { name: "Napisz odpowiedź" }).click();
  await expect(title(page, "Próba 1")).toBeVisible();
  await page.getByLabel("Komentarz dla instruktora").fill("Oparzenia, oczy, dłonie, tlenek węgla, hałas — okulary, buty, kleszcze, wentylacja, nauszniki.");
  await page.getByRole("button", { name: "Wyślij do oceny" }).click();
  await expect(title(page, "Bezpieczeństwo pracy w kuźni")).toBeVisible();
  await expect(badge(page.locator("header"), "Wysłane")).toBeVisible();

  await nav(page, "Zgłoszenia").click();
  await expect(title(page, "Zgłoszenia")).toBeVisible();
  await expect(row(page, /E1\.1 · Bezpieczeństwo pracy w kuźni/)).toContainText("Czeka na instruktora");
  await shot(page, "05-zgloszenia", info.project.name);

  await nav(page, "Ścieżki").click(); // each tab keeps its place: back on the task, freshly loaded
  await expect(title(page, "Bezpieczeństwo pracy w kuźni")).toBeVisible();
  await page.getByRole("button", { name: "Wycofaj" }).click();
  await expect(page.getByText("Zgłoszenie wycofane")).toBeVisible();
  await expect(badge(page.locator("header"), "Dostępne")).toBeVisible();
  await page.getByRole("button", { name: "Napisz odpowiedź" }).click();
  await expect(title(page, "Próba 2")).toBeVisible(); // the withdrawn attempt stays in history (BR-04)
});

test("praca własna: zdjęcie w szkicu, podgląd i wysyłka", async ({ page, request }, info) => {
  const p = await newParticipant(request);
  await sendAndAssess(request, p, "Bezpieczeństwo pracy w kuźni", "PASSED");
  await uiLogin(page, p.email, p.password);
  await page.getByRole("button", { name: /Podstawy kowalstwa/ }).click();
  await row(page, /Gwóźdź.*E1\.2/).click();
  await page.getByRole("button", { name: "Rozpocznij próbę 1" }).click();
  await expect(title(page, "Próba 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Wyślij do oceny" })).toBeDisabled(); // a work needs a photo (hint; BR-22 on the server)

  await page.locator("#draft-photos").setInputFiles({ name: "gwozdz.jpg", mimeType: "image/jpeg", buffer: PHOTO });
  const img = page.getByRole("img", { name: "Zdjęcie 1" });
  await expect(img).toHaveAttribute("src", /^blob:/); // loaded with the token, not by URL
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("1 / 10")).toBeVisible();
  await shot(page, "06-szkic-ze-zdjeciem", info.project.name);

  await page.getByRole("button", { name: "Wyślij do oceny" }).click();
  await expect(badge(page.locator("header"), "Wysłane")).toBeVisible();
});

test("karta Haczyk: zdjęcie wzorcowe z API", async ({ page, request }, info) => {
  const p = await newParticipant(request);
  await uiLogin(page, p.email, p.password);
  await page.getByRole("button", { name: /Podstawy kowalstwa/ }).click();
  await row(page, /Haczyk \/ zawieszka.*E1\.3/).click();
  await expect(title(page, "Haczyk / zawieszka")).toBeVisible();
  const ref = page.getByRole("img", { name: "Wymagane: 2 podobne egzemplarze" });
  await expect.poll(() => ref.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("Kształtowanie rybiego ogona – wykonanie ozdobnego zakończenia dolnej części.")).toBeVisible();
  await shot(page, "07-karta-haczyk", info.project.name);
});

test("quiz: nieudana próba, potem zaliczenie i odblokowanie Serca", async ({ page, request }, info) => {
  const p = await newParticipant(request);
  await sendAndAssess(request, p, "Bezpieczeństwo pracy w kuźni", "PASSED");
  await sendAndAssess(request, p, "Gwóźdź", "PASSED");
  const admin = await token(request, ADMIN);
  await sendAndAssess(request, p, "Haczyk / zawieszka", "PASSED");
  const quiz = await call<{ revision: { questions: { text: string; kind: string; options: { text: string; is_correct: boolean }[] }[] } }>(
    request,
    admin,
    "GET",
    `/admin/tasks/${p.tasks["Stal i ogień — test wiedzy"]}`,
  );
  const answer = async (correct: boolean) => {
    for (const q of quiz.revision.questions) {
      const group = page.getByRole("group").filter({ hasText: q.text });
      const picks = correct ? q.options.filter((o) => o.is_correct) : [q.options.find((o) => !o.is_correct)!];
      for (const o of picks) await group.getByRole(q.kind === "SINGLE" ? "radio" : "checkbox", { name: o.text, exact: true }).click();
    }
  };

  await uiLogin(page, p.email, p.password);
  await page.getByRole("button", { name: /Podstawy kowalstwa/ }).click();
  await row(page, /E1\.4.*Quiz/).click();
  await page.getByRole("button", { name: "Rozpocznij quiz" }).click();
  await answer(false);
  await page.getByRole("button", { name: "Sprawdź" }).click();
  await expect(page.getByRole("heading", { name: "Jeszcze nie tym razem" })).toBeVisible();
  await page.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await answer(true);
  await page.getByRole("button", { name: "Sprawdź" }).click();
  await expect(page.getByRole("heading", { name: "Zaliczone" })).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();
  await shot(page, "08-quiz-zaliczony", info.project.name);

  await page.getByRole("button", { name: "Wróć do zadania" }).click();
  await expect(badge(page.locator("header"), "Zaliczone")).toBeVisible();
  await page.getByRole("button", { name: "Etap 1" }).click();
  await expect(badge(row(page, /Serce \[dwa sposoby\].*E1\.5/), "Dostępne")).toBeVisible();
});

test("do poprawy: uwagi instruktora przy zadaniu", async ({ page, request }, info) => {
  const p = await newParticipant(request);
  await sendAndAssess(request, p, "Bezpieczeństwo pracy w kuźni", "NEEDS_IMPROVEMENT", "Brakuje hałasu i ochrony słuchu.");
  await uiLogin(page, p.email, p.password);
  await page.getByRole("button", { name: /Podstawy kowalstwa/ }).click();
  await expect(page.getByText("Instruktor skierował do poprawy. Zobacz uwagi i wyślij kolejną próbę.")).toBeVisible();
  await row(page, /E1\.1.*Teoria/).click();
  await expect(badge(page.locator("header"), "Do poprawy")).toBeVisible();
  await expect(page.getByText("Brakuje hałasu i ochrony słuchu.").first()).toBeVisible();
  await expect(page.getByText(/Instruktor Testowy ·/).first()).toBeVisible();
  await shot(page, "09-do-poprawy", info.project.name);
});

test("rejestracja: konto czeka na akceptację", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Załóż konto" }).click();
  await page.getByLabel("Imię").fill("Nowy");
  await page.getByLabel("Nazwisko").fill("Kowal");
  await page.getByLabel("E-mail").fill(`nowy-${Date.now()}@akademia.example`);
  await page.getByLabel("Hasło").fill("krotkie");
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await expect(page.getByText("Hasło musi mieć co najmniej 10 znaków.")).toBeVisible();
  await page.getByLabel("Hasło").fill("dlugie-haslo-kowala-2026");
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await expect(page.getByRole("heading", { name: "Konto czeka na akceptację" })).toBeVisible();
  await shot(page, "10-rejestracja", info.project.name);
  expect(PASSWORD).not.toBe(""); // the run script provides the seed password
});
