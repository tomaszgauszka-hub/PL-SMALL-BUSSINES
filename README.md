# Ewidora — Mały biznes. Jasne finanse.

Prywatna ewidencja działalności nierejestrowanej i jednoosobowej działalności gospodarczej. Logowanie email/hasło, klienci, katalog, faktury, koszty, płatności oraz automatyczne miesięczne i roczne zestawienia PIT/VAT. Dostęp z przeglądarki na kilku urządzeniach.

Aplikacja: https://plsmallbusiness.vercel.app/

## Funkcje

- Wybór DN/JDG przy rejestracji i zapis typu w bazie. Kontrolowane przejście DN → JDG z datą, potwierdzeniem i zachowaniem historii.
- Produkty i usługi: ceny netto, jednostki, VAT, stawka ryczałtu, archiwizacja, wyszukiwanie i CSV.
- JDG: faktury sprzedaży i zakupów, wiele pozycji z katalogu, rabaty, ilości ułamkowe, szkice, automatyczne FV/FK, korekty i prywatny wydruk do PDF.
- Niezmienne dokumenty po wystawieniu: zachowane ceny, dane kontrahenta i firmy. Korekty tworzą osobne dokumenty. Płatności i odwrócenia błędnych wpisów zachowują historię.
- Osobne daty PIT, VAT, otrzymania dokumentu i płatności. Procent odliczenia VAT i udział kosztu PIT. Prywatne załączniki PDF/JPG/PNG do 4 MB.
- JDG: miesięczna skala, liniowy i ryczałt; odliczenia faktycznie zapłaconych składek, VAT należny/naliczony, nadwyżka do przeniesienia lub zadeklarowanego zwrotu oraz ewidencja wpłat podatków.
- Pulpit, wykresy i tabele, roczna prognoza, limit VAT z proporcją i wcześniejszą DN, próg skali, limit odliczenia zdrowotnej, kontrola prawa do ryczałtu według przychodu poprzedniego roku.
- Remanent KPiR: spis początkowy, miesięczny i końcowy, towary obce, wycena, podpisywany wydruk, CSV, historia poprawek i wpływ na PIT skali/liniowego.
- DN: odrębna ewidencja należności, kasowy PIT-36, kontrola miesięcznych limitów 2025 i kwartalnych 2026, zachowane przekroczenia i terminy CEIDG.
- CSV dokumentów i podatków, wydruk rocznego raportu JDG, kopia JSON z dopisującym importem faktur, płatności, katalogu, ustawień rozliczeń i spisów z natury. Pliki załączników pobiera się osobno.

## Zakres rozliczeń

Lata 2025–2026. Krajowe transakcje PLN i standardowe miesięczne rozliczenia; DN ze zwolnieniem VAT, JDG także z czynnym VAT. Daty rejestracji firmy mogą być wcześniejsze niż 2025 r. Formularze umożliwiają wskazanie właściwych okresów podatkowych; klasyfikacji czynności i prawa do ulg nie ustala sama nazwa produktu.

Skala ma jedną kwotę wolną dla połączonych dochodów. Przy liniowym lub ryczałcie dochody DN i inne dochody na skali są prognozowane oddzielnie, bez kompensowania wpłat różnych zeznań. Roczne wyniki są prognozą indywidualną z zapisanych danych. Ustawienia podatku są odrębne dla każdego roku.

Zakres nie obejmuje metod kasowych, rozliczeń kwartalnych, walut i zagranicy, remanentu likwidacyjnego VAT, środków trwałych, płac, wszystkich ulg ani szczególnych procedur VAT. ZUS jest ewidencją zapłaconych składek, nie kalkulatorem należnych składek. Eksport jest materiałem pomocniczym, a nie kompletną formalną księgą. Moduł księgowy nie wysyła faktur do produkcyjnego KSeF, deklaracji ani JPK.

Reguły i źródła urzędowe zweryfikowano 16.10.2026. Szczegóły: [PLAN-JDG.md](docs/PLAN-JDG.md).

KSeF TEST (17.10.2026): prywatne [laboratorium dla fikcyjnej JDG](docs/PLAN-KSEF-TEST.md) obejmuje panel `/ksef-test`, XAdES, walidację FA(3), szyfrowanie, rzeczywistą wysyłkę do MF TEST, status, testowy numer KSeF oraz prywatne pobrania XML/UPO. Dostęp ma wyłącznie konto z administracyjnie przypisanym laboratorium. Klucze i tokeny istnieją tylko w pamięci pojedynczego żądania. Dokumenty TEST nie zasilają księgowości.

## Architektura i wdrożenie

| Zasób | Konfiguracja |
| --- | --- |
| GitHub | tomaszgauszka-hub/PL-SMALL-BUSSINES |
| Vercel | plsmallbusiness; preset Next.js, Node.js 24 |
| Supabase | istniejący TaskOn, booexvenlxuyrnamhsoi |
| Dane | 23 tabele public.mk_*, RLS, prywatne funkcje mk_private |
| Pliki | prywatny bucket mk-evidence |

Next.js 16, React 19, TypeScript, Supabase Auth i PostgreSQL. API używa JWT zalogowanego użytkownika i auth.uid(); nie korzysta z klucza service-role. Cookies HttpOnly/Secure/SameSite, brak publicznego cache dla danych prywatnych, kontrola Origin zapisów. Identyfikatory operacji, transakcje, niezmienność wystawionych dokumentów i wersjonowanie edytowalnych rekordów chronią pracę na kilku urządzeniach. Odświeżanie po zapisach, powrocie do karty i co 30 sekund.

Projekt współdzieli Supabase Auth z TaskOn. Istniejące konto TaskOn służy do logowania tym samym adresem. Globalny Site URL, SMTP, szablony email, 20 wcześniejszych tabel i pozostałe buckety TaskOn pozostają niezmienione. Preview Vercel jest chronione, produkcja publiczna; dane wymagają logowania.

## Weryfikacja

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

100 testów: dokładne kwoty, progi i zaokrąglenia, miesięczne/roczne PIT, odliczenia składek, wiele stawek ryczałtu, VAT do przeniesienia, terminy, remanent miesięczny/roczny, poprawki spisów, import, izolacja dwóch kont w PostgreSQL/PGlite, transakcje, wersje i ponowienia oraz dostęp do laboratorium wyłącznie TEST/JDG. Wcześniejszy produkcyjny test rejestracji/logowania i prywatnej ewidencji zakończył się usunięciem kont technicznych. Nowy pilot KSeF korzysta z istniejącego konta; jego fikcyjna tożsamość jest przechowywana osobno od księgowości. 17.10.2026 wykonano rzeczywisty pełny obieg MF TEST: podpis XAdES, szyfrowanie FA(3), przyjęcie z numerem KSeF oraz pobranie i sprawdzenie UPO (5508 bajtów). Test wykonywał ten sam adapter serwerowy; obsługa konta w przeglądarce wymaga osobnej weryfikacji po wdrożeniu.

[Raport prac](docs/STATUS.md) · [Wdrożenie](docs/WDROZENIE.md) · [Marka](docs/BRAND.md)

## Pochodzenie

Implementacja własna. Inspiracje funkcjonalne: hipek/sales-registry, patimio66/mojmalybiznes i Pawel-04/Projekt_AI. Ich kodu nie włączono do projektu.
