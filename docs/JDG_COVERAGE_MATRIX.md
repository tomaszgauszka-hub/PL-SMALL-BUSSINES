# Ewidora — macierz pokrycia wariantów JDG

Stan na 17.10.2026 (po PR #6). Macierz rozstrzyga, czy Ewidora może automatycznie rozliczać daną konfigurację. Konfiguracja, która istnieje tylko w ustawieniach, bez działającego księgowania, jest oznaczona jako nieobsługiwana.

Oznaczenia ostatniej kolumny:

- **Tak** — obliczenia są automatyczne; dokumenty z otwartymi pytaniami oznaczają okres jako wstępny.
- **Wstępnie** — wynik pomocniczy; użytkownik musi sam sprawdzić i złożyć dokumenty.
- **Nie** — Ewidora nie obsługuje; nie należy na niej polegać.

Podstawy prawne ryczałtu sprawdzono 17.10.2026 w tekście ujednoliconym Dz.U. 2025 poz. 843 (ze zmianami do Dz.U. 2026 poz. 779 i 1098). Warunki pozostałych wariantów oznaczone „do weryfikacji” wymagają sprawdzenia źródeł przed wdrożeniem modułu.

## Formy opodatkowania

| Wariant | Prawnie dopuszczalny | Obowiązki | Potrzebne moduły | Ewidora | Braki | Automatycznie |
| --- | --- | --- | --- | --- | --- | --- |
| A. Skala 12% / 32% | Tak | KPiR, zaliczki miesięczne lub kwartalne, PIT-36, JPK_PKPIR na żądanie (wysyłka elektroniczna — termin do weryfikacji) | KPiR, PIT, remanent, środki trwałe, ZUS | Zaliczki miesięczne, roczna prognoza, remanent | Zaliczki kwartalne, środki trwałe, formalna KPiR, PIT-36, ZUS | Wstępnie |
| B. Liniowy 19% | Tak, z wyłączeniem usług dla byłego pracodawcy (warunki do weryfikacji) | Jak A; PIT-36L, limit odliczenia zdrowotnej (2025: 12 900 zł, 2026: 14 100 zł) | Jak A | Zaliczki miesięczne, limit zdrowotnej z rejestru reguł | Jak A | Wstępnie |
| C1. Ryczałt — jedna stawka | Tak, przy spełnieniu art. 6 ust. 4 i braku wyłączeń z art. 8 | Ewidencja przychodów, ryczałt miesięczny lub kwartalny do 20. dnia, PIT-28, JPK_EWP | Ryczałt, klasyfikacja przychodów, ZUS | Silnik ryczałtu, klasyfikacja pozycji, kontrola limitu z poprzedniego roku | Ryczałt kwartalny, PIT-28, JPK_EWP, zapis odpowiedzi z art. 8 | Tak (miesięcznie) |
| C2. Ryczałt — wiele stawek, także na jednej fakturze | Tak (art. 12 ust. 3 wymaga ewidencji pozwalającej rozdzielić przychody) | Jak C1, odliczenia w proporcji przychodów roku (art. 11 ust. 3) | Jak C1 | Kategorie art. 12 ust. 1, pytanie o odrębność świadczeń, proporcjonalne odliczenia | Jak C1 | Tak (miesięcznie) |
| C3. Ryczałt — przychody z art. 12 ust. 1 pkt 4 (8,5% / 12,5%) | Tak; próg 100 000 zł liczony łącznie dla pkt 4, osobno dla najmu prywatnego; 200 000 zł dla małżonków z oświadczeniem | Jak C1 | Jak C1 | Automatyczny podział na 8,5% i 12,5% narastająco w roku | Zapis oświadczenia małżonków | Tak (miesięcznie) |
| C4. Ryczałt — najem prywatny (art. 6 ust. 1a) | Tak, poza działalnością | Odrębne rozliczenie | — | Kategoria blokowana w ewidencji JDG | Całość | Nie |
| D. Karta podatkowa | Tylko kontynuacja prawa nabytego przed 2022 r.; brak nowego wyboru | Decyzja naczelnika, PIT-16A i inne dokumenty roczne (do weryfikacji) | Karta podatkowa | Brak | Całość | Nie |
| E. Pełne księgi rachunkowe | Tak — obowiązek po przekroczeniu limitu przychodów lub z wyboru (warunki do weryfikacji) | Księgi rachunkowe, sprawozdawczość | Księgi rachunkowe | Brak | Całość | Nie |

## VAT

| Wariant | Prawnie dopuszczalny | Obowiązki | Moduły | Ewidora | Braki | Automatycznie |
| --- | --- | --- | --- | --- | --- | --- |
| Zwolnienie podmiotowe (art. 113) | Tak, do limitu (2025: 200 000 zł, 2026: 240 000 zł, proporcja w roku rozpoczęcia), z wyłączeniami z art. 113 ust. 13 | Kontrola limitu, utrata zwolnienia | VAT, limit | Kontrola limitu z proporcją i wcześniejszą DN | Lista wyłączeń z art. 113 ust. 13 | Wstępnie |
| Zwolnienie przedmiotowe (art. 43) | Tak, dla wskazanych czynności | Podstawa zwolnienia na fakturze | VAT | Stawka `zw` z podstawą | Kontrola zakresu art. 43 | Wstępnie |
| Czynny VAT, miesięcznie | Tak | JPK_V7M do 25. dnia, płatność | VAT, JPK | VAT należny/naliczony, nadwyżka, zwrot | JPK_V7M, oznaczenia GTU i procedur, korekty odliczeń | Wstępnie |
| Czynny VAT, kwartalnie | Tylko mały podatnik, z ograniczeniami w pierwszych 12 miesiącach (do weryfikacji) | JPK_V7K | VAT, JPK | Brak | Całość | Nie |
| Metoda kasowa VAT | Tylko mały podatnik (do weryfikacji) | Rozliczenie kwartalne, moment zapłaty | VAT | Brak | Całość | Nie |

## Pozostałe parametry profilu

| Wariant | Prawnie dopuszczalny | Ewidora | Braki | Automatycznie |
| --- | --- | --- | --- | --- |
| PIT kasowy (art. 14c ustawy o PIT) | Tak, przy spełnieniu warunków ustawowych (do weryfikacji) | Brak dla JDG; DN ma rozliczenie kasowe | Całość | Nie |
| Brak pracowników | Tak | Obsługiwane | — | Zgodnie z formą opodatkowania |
| Pracownicy lub zleceniobiorcy | Tak | Brak kadr i płac | Wynagrodzenia, PIT-4R, PIT-11, ZUS RCA | Nie — przy zatrudnieniu wynik niekompletny |
| Działalność krajowa w PLN | Tak | Obsługiwane | — | Zgodnie z formą |
| Transakcje wewnątrzunijne (WDT, WNT, usługi) | Tak | Brak | Stawki 0% WDT, VAT-UE, odwrotne obciążenie, waluty | Nie |
| Import i eksport poza UE | Tak | Brak | Całość | Nie |
| Sprzedaż internetowa B2C, OSS / IOSS | Tak | Brak | Całość | Nie |
| Waluty obce | Tak | Brak (tylko PLN) | Kursy NBP, różnice kursowe | Nie |
| Kasa fiskalna, sprzedaż bez faktur | Tak | Brak | Ewidencja raportów dobowych | Nie |
| Ulgi (IP Box, B+R, ulga na start ZUS, inne) | Tak, przy spełnieniu warunków | Brak (pole „inne odliczenia”) | Całość | Nie |
| Zawieszenie, wznowienie, zakończenie działalności | Tak | Brak | Remanent likwidacyjny, VAT od majątku, korekty art. 6 ust. 1f | Nie |
| KSeF — faktury B2B | Obowiązek od 1.04.2026; przy sprzedaży do 10 000 zł brutto miesięcznie faktury poza KSeF do 31.12.2026 (według wyjaśnień MF) | Tylko laboratorium MF TEST | Produkcja, pobieranie zakupów, uprawnienia | Nie |

## Kombinacje wymagające walidacji

| Kombinacja | Reguła | Stan |
| --- | --- | --- |
| Ryczałt i działalność wyłączona z art. 8 (apteka, kantor, handel częściami do pojazdów, wyroby akcyzowe, usługi dla byłego pracodawcy, karta podatkowa, okresowe zwolnienie) | Ryczałt niedozwolony | Funkcja `evaluateLumpSumEligibility` z testami; brak zapisu odpowiedzi w profilu |
| Ryczałt i przychód z poprzedniego roku powyżej 2 000 000 euro | Ryczałt niedozwolony (2026: 8 517 200 zł) | Kontrola w rozliczeniu roku |
| Ryczałt kwartalny i przychód z poprzedniego roku powyżej 200 000 euro | Tylko miesięcznie (2026: 851 720 zł) | Reguła w rejestrze; rozliczenia kwartalne nieobsługiwane |
| Karta podatkowa jako nowy wybór | Niedozwolona | Ewidora nie oferuje karty |
| Pozycje o różnych stawkach ryczałtu na jednej fakturze | Dozwolone dla odrębnych świadczeń; świadczenie kompleksowe ma jedną stawkę | Pytanie o strukturę świadczeń; kompleksowe → weryfikacja specjalisty |
| Stawka ryczałtu niezgodna z wybranym rodzajem przychodu | Niedozwolona | Odrzucane przy zapisie faktury |
