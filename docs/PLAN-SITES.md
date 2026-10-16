# Mała Księga — plan i zakres

Stan prawny sprawdzony: 15 października 2026. Aplikacja dla jednej osoby prowadzącej działalność nierejestrowaną w Polsce, sprzedaż w PLN, zwolnienie z VAT. Publiczna strona, prywatne dane po zalogowaniu przez ChatGPT; to samo konto udostępnia tę samą bazę na wielu urządzeniach.

## Mechanizmy z przeanalizowanych projektów

| Projekt | Wykorzystana idea | Poprawa |
|---|---|---|
| hipek/sales-registry | Czytelna ewidencja, pasek limitu, CSV, dokument do wydruku | Obowiązkowe uwierzytelnianie API i izolacja właścicieli, oddzielne płatności |
| patimio66/mojmalybiznes | Sprzedaż + koszty + klienci, dane na dokumencie, korekty | Aktualne okresy prawne, płatności częściowe, zachowanie historii zamiast kaskadowego kasowania |
| Pawel-04/Projekt_AI | Kategorie, zestawienia okresowe, wykresy, ostrzeżenia | PIT kasowy, wersjonowanie prawa, prawidłowe rozdzielenie limitu i podatku |

Implementacja jest oryginalna. Nie kopiujemy kodu AGPL ani kodu o niejasnej licencji. Źródła inspiracji są wymienione w README.

## Etap 1: fundament i prawo

1. Kwoty wyłącznie w całkowitych groszach. Daty cywilne w Polsce, bez konwersji przez UTC.
2. Sprzedaż należna według daty sprzedaży; płatności według daty otrzymania; koszty według daty zapłaty i dokumentu.
3. Limit: 2025 — 3 499,50 zł miesięcznie; 2026 — 10 813,50 zł kwartalnie. Równość nie oznacza przekroczenia. Przekroczenie zostaje w historii i wymaga rejestracji, nie zeruje się po zmianie kwartału.
4. PIT: przychody otrzymane − udokumentowane koszty. Strata osobno, bez pomniejszania pensji. Skala 12%/32%, jedna kwota wolna, podstawa i podatek zaokrąglane do złotych. Inne dochody, odliczenia i zaliczki wprowadzane do prognozy; prognoza nie jest kompletnym zeznaniem podatkowym.
5. Roczne zestawienie PIT-36, brak miesięcznych zaliczek z DN. Termin z uwzględnieniem weekendów i świąt.
6. Informacja o warunku 60 miesięcy, koncesjach, VAT, kasie i KSeF. Ostrzeżenia nie zastępują klasyfikacji działalności. Aplikacja nie składa PIT/JPK/KSeF i nie zastępuje kasy fiskalnej.

## Etap 2: implementacja

- Vinext/React/TypeScript na Sites; D1 dla danych, R2 dla załączników.
- Stabilne ID użytkownika z platformy. Każdy odczyt i zapis ograniczony do właściciela. Brak danych finansowych w localStorage.
- Sprzedaż: klient opcjonalny, opis, kategoria, numer, daty, kwota, wpłata częściowa lub pełna, korekta z powiązaniem i uzasadnieniem. Archiwizacja kontaktów bez usuwania dokumentów.
- Płatności: wiele wpłat, w tym na przełomie lat; zwroty jako ujemne przepływy, powiązane z dokumentem.
- Koszty: data dokumentu i zapłaty, kategoria, część podatkowa, dowód i opcjonalny załącznik PDF/zdjęcie.
- Mini CRM: nazwa, NIP opcjonalny, telefon, email, adres, notatki, historia sprzedaży, saldo.
- Pulpit: limit, przychody kasowe i należne, koszty, dochód, należności, wykres miesięczny, historia zmian.
- Raporty: ewidencja sprzedaży, przepływy i koszty CSV (Excel), roczny raport do wydruku/PDF, kompletna kopia JSON i import kopii z kontrolą właściciela i identyfikatorów.
- Profil sprzedawcy, ustawienia podatkowe per rok, checklista obowiązków, źródła i data weryfikacji.
- Responsywny interfejs, stan pusty, tryb demonstracyjny wyraźnie oddzielony od zapisanej bazy, odświeżanie po powrocie do karty.

## Etap 3: weryfikacja i publikacja

- Testy kwot, progów, częściowych płatności, przełomu lat, strat, podatku i terminów.
- Testy SQL: izolacja użytkowników, walidacja powiązań, idempotencja zapisów, korekty i zachowanie historii.
- Sprawdzenie typów, migracji i produkcyjnego builda.
- W tym środowisku brak obsługiwanego control-browser, więc brak testu klikania w przeglądarce; wykonać dostępne testy automatyczne i raportować ten limit.
- Zapis źródeł, migracje produkcyjne, publikacja Site z dostępem publicznym. Dane finansowe nadal wymagają logowania.

## Źródła urzędowe

- https://www.podatki.gov.pl/poradniki-i-informatory/dzialalnosc-nierejestrowana
- https://www.podatki.gov.pl/podatki-osobiste/pit/informacje-podstawowe/co-jest-opodatkowane/dochody-z-dzialalnosci-nierejestrowanej
- https://www.podatki.gov.pl/podatki-osobiste/pit/stawki-i-limity/
- https://ksef.podatki.gov.pl/ponizej-10-000-zl/
- https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/ewidencja-sprzedazy-z-wykorzystaniem-kas-rejestrujacych
- https://eli.gov.pl/api/acts/DU/2024/1902/text.html

## Granice

Nie wyliczamy VAT czynnego, walut, ZUS od umów cywilnoprawnych, wspólnego rozliczenia małżonków, wszystkich ulg ani przenoszenia strat z poprzednich lat. Te przypadki wymagają osobnego rozliczenia. Progi na lata po 2026 nie są zgadywane. Kopia JSON zawiera metadane załączników; pliki dowodowe pobiera się osobno.
