# Ewidora — audyt księgowości JDG i analiza luk

> 18.10.2026 projekt zakończono jako portfolio ([podsumowanie](PROJECT_SUMMARY.md)). Ustalenia K1 (rok 2027) i K2 (KSeF produkcyjny) pozostają świadomymi ograniczeniami tej wersji.

Stan na 17.10.2026. Audyt objął gałąź `main` (commit `a018b59`, PR #1–#5), bazę Supabase projektu TaskOn (`booexvenlxuyrnamhsoi`), wdrożenie Vercel `plsmallbusiness` oraz dokumentację i testy. Zmiany wprowadzone po audycie opisuje [ACCOUNTING_IMPLEMENTATION_STATUS.md](ACCOUNTING_IMPLEMENTATION_STATUS.md).

Ocena funkcji:

- **Kompletna** — działa w zadeklarowanym zakresie i ma testy merytoryczne.
- **Częściowa** — działa, ale nie obejmuje części wymaganych przypadków.
- **Pozorna** — interfejs lub nazwa sugeruje więcej, niż faktycznie robi kod.
- **Brakująca** — brak implementacji.

## Ustalenia krytyczne

| # | Ustalenie | Skutek | Termin |
| --- | --- | --- | --- |
| K1 | Rok 2027 jest zablokowany w bazie (ograniczenia `check` dat i lat 2025–2026 w `mk_invoices`, `mk_invoice_sequences`, `mk_jdg_years`, `mk_jdg_months`, `mk_inventories`, `mk_sales`, `mk_payments`, `mk_expenses`) oraz w walidacji aplikacji. | Od 1.01.2027 nie da się wystawić faktury ani zapisać rozliczenia. | Przed 1.01.2027. Wymaga zweryfikowanych reguł na 2027 r. i migracji. |
| K2 | Faktury JDG nie trafiają do produkcyjnego KSeF. Laboratorium KSeF działa wyłącznie w MF TEST i jest odcięte od księgowości. | Według wyjaśnień MF podatnicy ze sprzedażą do 10 000 zł brutto miesięcznie mogą wystawiać faktury poza KSeF tylko do 31.12.2026. Od 1.01.2027 czynny podatnik VAT nie wystawi w Ewidorze faktury B2B zgodnie z obowiązkiem. | Przed 1.01.2027. |
| K3 | Stawkę ryczałtu wybierano jako samą liczbę na pozycji, bez rodzaju przychodu, PKWiU i potwierdzenia. Brak progu 8,5% / 12,5%. | Ryczałt mógł być liczony stawką niezwiązaną z czynnością. | Usunięte w PR #6 na poziomie silnika i formularza faktury. |
| K4 | Korekta ryczałtowa przewyższająca przychód miesiąca blokowała wynik, zamiast przejść na kolejne okresy (art. 6 ust. 1e ustawy o ryczałcie). | Błędny wynik miesięczny. | Usunięte w PR #6. |
| K5 | ZUS to wyłącznie ewidencja wpisanych wpłat. Składka zdrowotna na ryczałcie zależy od progów przychodu; aplikacja jej nie wylicza ani nie kontroluje. | Użytkownik może wpisać kwoty niezgodne z obowiązkiem. | P1. |
| K6 | Brak onboardingu, instrukcji, regulaminu, akceptacji wersji dokumentów i historii decyzji podatkowych. | Brak podstaw do udostępnienia automatycznych rozliczeń szerszej grupie użytkowników. | P1. |

## 1. Repozytorium i gałąź robocza — kompletne

Jedna gałąź `main` z automatycznym wdrożeniem produkcji Vercel. Prace prowadzono przez PR z kontrolą GitHub Actions (typecheck, testy, build). Podglądy Vercel są chronione i nie mają zmiennych produkcyjnej bazy, więc działają w trybie demonstracyjnym.

## 2. Architektura — kompletna dla obecnego zakresu

Next.js 16 (App Router), React 19, TypeScript, Supabase Auth i PostgreSQL. API działa z JWT zalogowanego użytkownika; brak klucza service-role. Logika obliczeń jest w czystych modułach `lib/*.ts`, a walidację powtarzają wyzwalacze PostgreSQL. Klient odświeża dane po zapisie, przy powrocie do karty i co 30 sekund.

Ograniczenie: obliczenia podatkowe wykonuje przeglądarka (`calculateJdgTaxes` w komponentach). Wynik nie jest utrwalany ani podpisywany wersją reguł. Zamknięcie miesiąca będzie wymagało zapisu wyniku po stronie serwera.

## 3. Struktura bazy — kompletna, z ograniczeniem K1

23 tabele `public.mk_*` z RLS i jawnymi uprawnieniami (brak DELETE/TRUNCATE, płatności tylko INSERT), prywatny schemat `mk_private`, idempotencja przez `mk_operations`, wersjonowanie szkiców. Faktury przechowują pozycje w polu `data` (jsonb), co pozwoliło dodać klasyfikację pozycji bez migracji.

Brakuje tabel: historii decyzji podatkowych, rejestru środków trwałych, deklaracji i ich statusów, zamknięć miesięcy, wersji dokumentów prawnych i akceptacji.

## 4. Migracje — kompletne

9 migracji w repozytorium odpowiada 9 wersjom zastosowanym w Supabase (sprawdzone 17.10.2026). `supabase/schema.sql` odpowiada wyłącznie pierwszej migracji. Baza jest współdzielona z TaskOn — każda migracja wymaga ostrożności i dotyczy tylko obiektów `mk_*`.

## 5. Fakturowanie — częściowe

| Funkcja | Ocena |
| --- | --- |
| Faktury sprzedaży i zakupu, szkice, numeracja FV/FK, wiele pozycji, rabaty, ilości ułamkowe | Kompletna |
| Niezmienność wystawionych dokumentów, korekty jako odrębne dokumenty | Kompletna |
| Płatności, odwrócenia, załączniki, wydruk | Kompletna |
| Mechanizm podzielonej płatności | Pozorna — pole na fakturze bez kontroli obowiązku |
| Faktury zaliczkowe i końcowe, sprzedaż bez faktury, paragony, waluty | Brakująca |
| Oznaczenia JPK (GTU, procedury), VAT-marża, odwrotne obciążenie | Brakująca |

## 6. KSeF — częściowe

Laboratorium `/ksef-test` wykonało rzeczywisty obieg MF TEST (XAdES, szyfrowanie FA(3), numer KSeF, UPO). Moduł nie jest powiązany z fakturami księgowymi, nie pobiera faktur zakupowych, nie obsługuje korekt, zaliczek, trybów awaryjnych ani środowiska produkcyjnego. Zobacz K2.

## 7. Ewidencja przychodów i kosztów — częściowa / pozorna

Przychody i koszty wynikają z faktur według daty PIT. Eksport CSV „ewidencja JDG” jest zestawieniem pomocniczym, a nie KPiR ani ewidencją przychodów w formie wymaganej przepisami — ocena **pozorna**, jeśli traktować go jako księgę. Brak JPK_PKPIR i JPK_EWP.

Przed PR #6: każda faktura zakupu mogła trafić w koszty według wpisanego procentu, bez pytań o charakter wydatku.

## 8. PIT, VAT i ZUS — częściowe

| Obszar | Ocena |
| --- | --- |
| Skala i liniowy — miesięczne zaliczki, roczna prognoza, odliczenia, limit zdrowotnej, remanent | Kompletna dla zaliczek miesięcznych |
| Ryczałt — wiele stawek na fakturze, proporcjonalne odliczenia | Częściowa przed PR #6 (brak klasyfikacji i progu) |
| Rozliczenia kwartalne PIT/ryczałtu/VAT, metody kasowe | Brakująca |
| VAT — należny/naliczony, nadwyżka, zwrot, limit zwolnienia | Kompletna dla miesięcznych rozliczeń krajowych |
| JPK_V7, VAT-UE, proporcja, korekty odliczeń | Brakująca |
| ZUS — ulga na start, preferencyjny, Mały ZUS Plus, składka zdrowotna | Brakująca (tylko ewidencja wpłat) |
| Etykiety PIT-36/PIT-36L/PIT-28 przy prognozie | Pozorna — nazwa formularza bez generowania deklaracji |

## 9. Środki trwałe i remanent

Remanent KPiR: **kompletny** w opisanym zakresie (spisy, poprawki, wpływ na PIT skali i liniowego). Środki trwałe i amortyzacja: **brakujące**.

## 10. Eksporty i deklaracje — brakujące

CSV, kopia JSON i wydruk roczny są materiałem pomocniczym. Brak generowania deklaracji, plików JPK i KEDU, statusów wysyłki i opłacenia.

## 11. Dokumentacja i testy — kompletne dla obecnego zakresu

`README.md`, `docs/PLAN-JDG.md`, `docs/PLAN-KSEF-TEST.md`, `docs/STATUS.md`, `docs/WDROZENIE.md`. Przed PR #6 100 testów: dokładne kwoty, progi, zaokrąglenia, izolacja kont w PostgreSQL/PGlite, transakcje, idempotencja, protokół KSeF. Brakowało testów scenariuszy ryczałtu wielostawkowego z progiem, korekt przechodzących na kolejne okresy i niejednoznacznych dokumentów.

## 12. Konta i uprawnienia — częściowe

Wspólne Supabase Auth z TaskOn, właściciel danych to `auth.uid()`, RLS na każdej tabeli. Brak ról (np. dostęp biura rachunkowego), brak rejestru zgód i akceptacji regulaminu. Laboratorium KSeF przydzielane administracyjnie.

## Podsumowanie luk według priorytetu

- **P0** — rejestr reguł wersjonowanych (wykonane), silnik ryczałtu z klasyfikacją (wykonane), ocena dokumentów niejednoznacznych (wykonane: silnik i formularz), historia decyzji (do zrobienia, wymaga migracji), obsługa 2027 (K1).
- **P1** — ZUS i składka zdrowotna, JPK_V7, PIT-28/36/36L, JPK_EWP/PKPIR, KSeF produkcyjny (K2), panel „Rozlicz miesiąc”, onboarding, instrukcja, regulamin.
- **P2** — kwartalne rozliczenia, metody kasowe, środki trwałe, zagranica, kadry, IP Box, procedury szczególne.
