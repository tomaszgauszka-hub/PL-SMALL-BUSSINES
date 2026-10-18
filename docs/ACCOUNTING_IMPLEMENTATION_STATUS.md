# Ewidora — stan wdrożenia księgowości JDG

Dokument aktualizowany po każdej istotnej zmianie. Nie podajemy procentu ukończenia. Rozróżniamy: **działa** (obliczenia i zapis, z testami), **częściowo**, **makieta / tylko konfiguracja**, **brak**.

## Etap P0 — 17.10.2026, PR #6 (`feature/accounting-p0-rules-ryczalt`)

### Zaimplementowane moduły

| Moduł | Pliki | Stan |
| --- | --- | --- |
| Wersjonowany rejestr reguł podatkowych | `lib/tax-rules.ts` | Działa. 18 reguł (22 wersje roczne) z podstawą prawną, okresem obowiązywania, wersją, parametrami i powiązanymi testami. Data spoza zweryfikowanych wersji zgłasza `UnsupportedPeriodError` — aplikacja nie przenosi bieżących wartości na inne lata. |
| Katalog rodzajów przychodów ryczałtu | `lib/lump-sum.ts` | Działa. 55 pozycji z art. 12 ust. 1 pkt 1–8 (litera po literze), stawki 2–17%, symbole PKWiU 2015 i zakres („ex”, opis). Najem prywatny i art. 6 ust. 1d zablokowane w ewidencji JDG. |
| Klasyfikacja pozycji sprzedaży | `lib/lump-sum.ts` | Działa. Stawka wynika z wybranego rodzaju przychodu. Podpowiedź z PKD lub AI nie wystarcza; wymagane potwierdzenie faktycznej czynności. Niezgodny PKWiU kieruje do weryfikacji. |
| Silnik ryczałtu wielostawkowego | `lib/lump-sum.ts`, `lib/jdg-tax.ts` | Działa. Rozdzielenie przychodów według stawek, próg 8,5% / 12,5% dla art. 12 ust. 1 pkt 4 (łącznie w roku, 200 000 zł dla małżonków), odliczenie składek społecznych i 50% zapłaconej zdrowotnej, proporcja odliczeń (rocznie według art. 11 ust. 3), przenoszenie zmniejszeń z korekt na kolejne okresy (art. 6 ust. 1e), zaokrąglenia do pełnych złotych. |
| Ocena dokumentów | `lib/review-status.ts`, `lib/document-review.ts` | Działa. Statusy `AUTO_VERIFIED`, `NEEDS_USER_INPUT`, `NEEDS_EXPERT_REVIEW`, `UNSUPPORTED_OR_INVALID`. Sprzedaż ryczałtowa (rodzaj przychodu, odrębność świadczeń), korekty (przyczyna i okres), zakupy (środek trwały powyżej 10 000 zł netto, samochód i paliwo, użytek prywatny, reprezentacja, związek z działalnością). Słowa kluczowe służą wyłącznie do zadania pytania. |
| Rozdzielenie PIT i VAT na pozycji | `lib/business.ts`, `lib/invoices.ts` | Działa. Pozycja ma osobno: stawkę VAT (`vatRate`), rodzaj przychodu (`revenueCategory`), stawkę ryczałtu (`lumpSumRate`), źródło klasyfikacji (`classificationSource`) i opcjonalny PKWiU. Zapis odrzuca stawkę niezgodną z rodzajem przychodu. |
| Formularz faktury | `app/invoice-workbench.tsx` | Działa (wymaga sprawdzenia na podglądzie). Przy profilu ryczałtowym: wybór rodzaju przychodu pogrupowany według stawek, PKWiU, potwierdzenie czynności, pytanie o odrębność świadczeń, przyczyna korekty, pytania przy zakupach, panel oceny dokumentu. Lista i szczegóły pokazują status oceny. |
| Pulpit PIT i VAT | `app/jdg-dashboard.tsx` | Działa (wymaga sprawdzenia na podglądzie). Rozbicie ryczałtu za miesiąc i rok: rodzaj przychodu, stawka, przychód, część ponad próg, odliczenie, podstawa, ryczałt. Liczba dokumentów do decyzji; wynik oznaczony jako wstępny. |

### Migracje

Brak. Klasyfikacja i odpowiedzi zapisują się w istniejącym polu `data` faktury. Baza produkcyjna nie została zmieniona.

### Testy

GitHub Actions dla PR #6: `pnpm typecheck`, `pnpm test`, `pnpm build` — sukces. Podgląd Vercel: stan READY.

Nowe testy (30): `tests/tax-rules.test.mjs`, `tests/lump-sum.test.mjs`, `tests/document-review.test.mjs` oraz 2 nowe w `tests/jdg-tax.test.mjs`. Łącznie 130 testów.

Scenariusze z sekcji 3.6 specyfikacji:

| # | Scenariusz | Test |
| --- | --- | --- |
| 1 | Jedna stawka 5,5% | `scenario 1` |
| 2 | Jedna stawka 8,5% | `scenario 2` |
| 3 | Jedna stawka 12% | `scenario 3 and 7` |
| 4 | Trzy stawki w jednej JDG | `scenario 4 and 8` |
| 5 | Kilka stawek na jednym dokumencie | `scenario 5` |
| 6 | Próg 8,5% / 12,5% | `scenario 6` (dwa testy), test integracyjny w `jdg-tax` |
| 7 | Odliczenia przy jednej stawce | `scenario 3 and 7`, `scenario 7` |
| 8 | Proporcjonalne odliczenia przy wielu stawkach | `scenario 4 and 8`, `scenario 8` (proporcja roczna) |
| 9 | Korekta przychodu z poprzedniego miesiąca | `scenario 9 and 11`, `corrections are recognised…` |
| 10 | Nieustalona klasyfikacja PKWiU | `scenario 10` |
| 11 | Zwrot sprzedaży | `scenario 9 and 11` |
| 12 | Faktura zaliczkowa i końcowa | **Brak** — typ dokumentu nieobsługiwany |
| 13 | Przejście między okresami | `scenario 7` (przeniesienie odliczeń), `scenario 13` (koniec roku) |
| 14 | Różne daty powstania przychodu | `JDG tax dates are accrual dates…` (istniejący) |
| 15 | Podatnik bez prawa do ryczałtu | `scenario 15`, `lump sum eligibility…` (istniejący) |

Wartości oczekiwane wyprowadzono ręcznie w komentarzach testów z przepisów, nie z wyniku programu.

### Zmienione zachowanie

- Korekta przewyższająca przychód stawki w miesiącu daje ryczałt 0 zł i przenosi zmniejszenie na kolejne miesiące (wcześniej: blokada wyniku). Niepokryte zmniejszenie na koniec roku nadal blokuje wynik roczny.
- Dokument ze statusem `UNSUPPORTED_OR_INVALID` blokuje wynik PIT miesiąca. Otwarte pytania nie blokują obliczeń, ale okres i rok są oznaczone jako wstępne (`verified: false`).

### Ograniczenia i ryzyka

- Odpowiedzi na pytania można zapisać tylko przed wystawieniem dokumentu. Dla wystawionych dokumentów potrzebna jest tabela historii decyzji (migracja do zatwierdzenia).
- Katalog produktów nie przechowuje rodzaju przychodu — po wyborze produktu rodzaj trzeba wskazać na pozycji.
- Odpowiedzi o wyłączeniach z art. 8 nie są jeszcze zapisywane w profilu (funkcja i testy istnieją).
- Proporcja odliczeń w miesiącu: ustawa określa proporcję roczną; aplikacja w miesiącu stosuje proporcję przychodów miesiąca, a rozliczenie roczne ją uzgadnia. Reguła `RYCZALT_DEDUCTION_ALLOCATION` opisuje to założenie.
- Przychody z art. 14 ust. 2 pkt 2, 5–12, 14, 19–21 ustawy o PIT (pozycje ryczałtu odsyłające do ustawy o PIT) zawsze wymagają weryfikacji specjalisty.
- Rok 2027 jest zablokowany w bazie i regułach (ustalenie K1).
- Interfejsu nie sprawdzono w przeglądarce w tej sesji: podgląd Vercel jest chroniony, a połączenie Vercel nie ma uprawnienia do obejścia ochrony.

### Funkcje nieobsługiwane

Zobacz [JDG_COVERAGE_MATRIX.md](JDG_COVERAGE_MATRIX.md). Najważniejsze: ZUS, deklaracje i JPK, KSeF produkcyjny, rozliczenia kwartalne, metody kasowe, środki trwałe, faktury zaliczkowe, zagranica, kadry.

### Wymagane działania użytkownika

1. Sprawdzić podgląd PR #6 (konto demonstracyjne lub testowe) i zatwierdzić scalenie. Scalenie z `main` wdraża produkcję.
2. Zdecydować o migracjach na współdzielonej bazie TaskOn: historia decyzji podatkowych, rodzaj przychodu w katalogu, zakres lat po 2026.
3. Zaplanować KSeF produkcyjny przed 1.01.2027 (uprawnienia i sposób uwierzytelnienia).

### Kolejne zadania

Etap zamknięty. Zadania, które byłyby następne, wymienia [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md).

## Etap portfolio — 18.10.2026, PR #6

Decyzja: projekt kończy się jako portfolio. KSeF zostaje w bezpłatnym środowisku TEST, nie realizujemy [PLAN-2027.md](PLAN-2027.md).

### Zaimplementowane

| Moduł | Pliki | Stan |
| --- | --- | --- |
| Rozlicz miesiąc | `lib/month-settlement.ts`, `app/month-settlement-panel.tsx` | Działa. Osiem kroków: dokumenty (szkice, luki w numeracji, możliwe duplikaty zakupów), sprawy do decyzji z przejściem do dokumentu, przychody według stawek, ryczałt lub zaliczka PIT, VAT, wpisane składki, terminy i wpłaty (oczekuje / po terminie / zapłacone), obowiązki deklaracyjne. Status miesiąca: rozliczony, do zapłaty, wstępny, wymaga poprawy. Eksport CSV. Bez utrwalania zamknięcia. |
| Demo JDG | `lib/demo-jdg.ts` | Działa. Fikcyjna pracownia na ryczałcie z czterema stawkami (3%, 5,5%, 8,5%, 14%), czynny VAT, korekta zwrotu, paliwo przy użytku mieszanym, zapłacone składki 2026; styczeń–sierpień opłacone, wrzesień do zapłaty, październik z otwartymi pytaniami i szkicem. Publiczne demo otwiera się na JDG. |
| Spójność formy opodatkowania | `lib/document-review.ts`, `lib/jdg-tax.ts`, `app/invoice-workbench.tsx` | Faktury oceniane według formy opodatkowania roku dokumentu (ustawienia roku), a nie bieżącego profilu. Wspólna funkcja `jdgReport` dla pulpitu, wydruku i rozliczenia. |
| Daty po 2026 r. | `lib/domain.ts` (`workDate`) | Domyślne daty formularzy nie wychodzą poza 31.12.2026, więc demo działa po końcu roku. |
| Zrzuty ekranu | `scripts/screenshots.mjs`, `.github/workflows/screenshots.yml` | Build demo w CI i Playwright; zrzuty w `docs/screenshots/`. |

### Testy

136 testów (6 nowych w `tests/month-settlement.test.mjs`: dane demo, statusy miesięcy, termin po czasie, blokada przy błędnym ujęciu, luki i duplikaty, odmiana liczebników). Kontrola wizualna 10 zrzutów (desktop i mobile) bez błędów przeglądarki. Jeden przebieg CI dla commita `7847cc1` nie przeszedł kroku testów, a ponowienie bez zmian kodu przeszło — test niestabilny, przyczyny nie ustalono (logi CI nie były dostępne z sesji roboczej; podejrzane są testy KSeF z losowymi danymi).

### Migracje

Brak.
