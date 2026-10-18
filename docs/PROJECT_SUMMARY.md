# Ewidora — podsumowanie projektu

Projekt zamknięty 18.10.2026 na etapie portfolio. Ten dokument opisuje, co powstało, jakie decyzje podjęto i dlaczego rozwój zatrzymano.

## W skrócie

| | |
| --- | --- |
| Cel | Samodzielna ewidencja i rozliczenia JDG oraz działalności nierejestrowanej w Polsce |
| Okres prac | 16–18.10.2026, 6 pull requestów, 112 commitów |
| Kod | Ok. 440 KB TypeScript (Next.js 16, React 19), 9 migracji PostgreSQL, 23 tabele z RLS |
| Testy | 136 testów, w tym PostgreSQL w PGlite i protokół KSeF; CI w GitHub Actions |
| Wdrożenie | [plsmallbusiness.vercel.app](https://plsmallbusiness.vercel.app/) — publiczne demo bez logowania |
| Stan prawny | Reguły sprawdzone w źródłach urzędowych 16–17.10.2026, lata 2025–2026 |

## Przebieg

| Etap | Zakres |
| --- | --- |
| PR #1 | Profile DN/JDG zapisane w bazie, przejście DN → JDG z historią, katalog produktów i usług |
| PR #2 | Faktury sprzedaży i zakupów, płatności, korekty, załączniki; miesięczne i roczne PIT/VAT z wykresami |
| PR #3 | Remanent KPiR i jego wpływ na PIT; jawne uprawnienia bazy (bez DELETE) |
| PR #4–#5 | Laboratorium KSeF TEST: XAdES, FA(3) z walidacją XSD, szyfrowanie, wysyłka do MF TEST, numer KSeF i UPO |
| PR #6 | Wersjonowany rejestr reguł, ryczałt według rodzajów przychodu z art. 12 ust. 1, ocena dokumentów niejednoznacznych, panel „Rozlicz miesiąc”, demo JDG, audyt i dokumentacja |

## Najważniejsze decyzje

1. **Poprawność przed automatyzacją.** Wynik, którego nie da się ustalić z dokumentów, ma status „wymaga odpowiedzi” lub „wymaga specjalisty”, a nie domyślną wartość. Stawki ryczałtu nie ustala nazwa produktu, kod PKD ani podpowiedź AI.
2. **Reguły z datą i podstawą prawną.** Stawki i limity są w rejestrze z okresem obowiązywania. Rok bez sprawdzonych reguł jest nieobsługiwany — aplikacja nie przenosi wartości z innego roku.
3. **Niezmienne dokumenty i historia.** Korekty, odwrócenia płatności i poprawki spisów są osobnymi rekordami. Baza sama pilnuje tych zasad, niezależnie od interfejsu.
4. **Minimum sekretów.** Aplikacja korzysta z JWT użytkownika i RLS, bez klucza service-role. Laboratorium KSeF trzyma klucze tylko w pamięci jednego żądania.
5. **Uczciwy zakres.** Interfejs i dokumentacja rozróżniają funkcje działające, częściowe i nieobsługiwane ([macierz pokrycia](JDG_COVERAGE_MATRIX.md)).

## Dlaczego projekt zatrzymano

Analiza z 17–18.10.2026 ([plan 2027](PLAN-2027.md), [audyt](ACCOUNTING_GAP_ANALYSIS.md)) pokazała, że dalsze utrzymanie jako produktu wymagałoby:

- **KSeF produkcyjnego przed 1.01.2027** — od tego dnia faktury B2B trzeba wystawiać w KSeF, a w produkcji potrzebne jest bezpieczne przechowywanie danych dostępowych użytkowników;
- **corocznej aktualizacji reguł** — na 2027 r. dochodzą nowe limity i prawdopodobnie zmiany skali i ryczałtu;
- **kalkulatora ZUS, JPK i deklaracji** oraz odpowiedzialności za rozliczenia klientów.

Rynek oferuje bezpłatne fakturowanie z KSeF i samodzielną księgowość za kilkadziesiąt złotych miesięcznie, a produkcyjna baza nie miała zewnętrznych użytkowników. Projekt pozostaje więc dowodem kompetencji, a nie usługą.

## Czego dotyczyłyby kolejne kroki

Gdyby projekt wrócił do rozwoju: obsługa 2027 r. (migracja zakresów dat, reguły po publikacji ustaw), KSeF produkcyjny z uprawnieniem nadanym operatorowi, tabela historii decyzji dla wystawionych dokumentów, rodzaj przychodu w katalogu, kalkulator ZUS i składki zdrowotnej, JPK_V7M i JPK_EWP, zamknięcie miesiąca z utrwaleniem wyniku.

## Utrzymanie demo

- Publiczne demo nie zależy od bazy — działa na danych fikcyjnej firmy z 2026 r. Domyślne daty w formularzach nie wychodzą poza 31.12.2026, więc demo działa także po końcu 2026 r.
- Produkcja korzysta ze współdzielonego projektu Supabase i planu Vercel Hobby, przeznaczonego do użytku niekomercyjnego. Przy ewentualnym wznowieniu jako usługi potrzebny byłby osobny projekt bazy i plan komercyjny.
- Zrzuty ekranu odświeża workflow `Zrzuty ekranu demo` (commit z dopiskiem `[screenshots]` na gałęzi `feature/**`).
