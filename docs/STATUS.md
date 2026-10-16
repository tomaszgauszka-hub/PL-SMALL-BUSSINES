# Stan wykonania — 16.10.2026

## Wykonane

- Odzyskano kompletną aplikację i wskazano nowe repo PL-SMALL-BUSSINES.
- Potwierdzono projekt Vercel plsmallbusiness z presetem Next.js i Node.js 24.
- Sprawdzono schemat TaskOn: 20 istniejących tabel, pięć dotychczasowych bucketów, brak kolizji mk_*.
- Zastosowano migrację initial_mala_ksiega, wersja 20261016075550.
- Utworzono 11 tabel z RLS, funkcje SECURITY INVOKER i prywatny bucket mk-evidence.
- Sprawdzono w rzeczywistym PostgreSQL izolację dwóch kont, idempotencję i odczyt plików. Test zakończył się ROLLBACK; nie pozostały dane testowe.
- 35 testów lokalnych oraz kompilacja produkcyjna przechodzą.
- Wszystkie 48 plików opublikowano w repozytorium. Porównanie drzewa Git potwierdziło zgodność bajtów z wersją lokalną.
- Vercel połączono z główną gałęzią repozytorium. Produkcja https://plsmallbusiness.vercel.app odpowiada HTTP 200.
- Zapisano NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY i NEXT_PUBLIC_APP_URL tylko dla produkcji, po czym przebudowano wdrożenie do stanu Ready.
- GitHub Actions wykonał kontrolę typów, testy i build poprawnie również po zmianach logowania.
- Zdiagnozowano rejestrację: Supabase zwraca user_already_exists dla adresu istniejącego we wspólnym Auth. Formularz objaśnia użycie konta TaskOn oraz wspólne hasło.
- Po zatwierdzeniu zapisano oba adresy powrotu Auth. Potwierdzenie panelu: Successfully added 2 URLs.
- Produkcyjny test HTTP przeszedł: dwie rzeczywiste rejestracje przez API aplikacji, logowanie, HttpOnly/Secure/SameSite=Lax, zapis klienta/sprzedaży/wpłaty/kosztu, idempotencja, druga sesja tego samego konta, prywatny widok, brak publicznego cache, izolacja drugiego konta, odrzucenie obcego klienta, odrzucenie obcego Origin i wylogowanie.
- Usunięto dane techniczne w kolejności zależności i oba konta testowe. Baza potwierdziła remaining_fixture_accounts = 0. Nie pozostały pliki dowodowe z testu.

## Identyfikacja Ewidora

Nowy symbol i logotyp, granatowo-miętowa paleta, czytelniejsza typografia i spójne widoki pulpitu, formularzy, raportów oraz logowania. Zachowano format wcześniejszych kopii JSON i istniejące dane.

Wysyłki rzeczywistej wiadomości odzyskiwania hasła nie testowano na skrzynce użytkownika. Istniejących globalnych szablonów i konfiguracji poczty TaskOn nie zmieniano.

## Połączenia

Konektory GitHub i Vercel odrzucały zapis kodem 403. Użytkownik zatwierdził dokończenie przez przeglądarkę; tą drogą opublikowano kod i skonfigurowano produkcję. Nie wyłączano ochrony SSO całego projektu.

## Kontrola bezpieczeństwa

Supabase Advisors nie wskazał problemów bezpieczeństwa dotyczących nowych obiektów mk_* ani mk_private. Informacje o nieużywanych indeksach nowych tabel są oczekiwane przed rozpoczęciem ewidencji; indeksy kluczy obcych pozostawiono.

W projekcie TaskOn istniały wcześniej ostrzeżenia, które pozostały poza zakresem tej migracji:

| Wynik | Liczba | Wyjaśnienie / naprawa |
| --- | --- | --- |
| Security Definer View | 10 | [Opis](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) |
| Function Search Path Mutable | 8 | [Opis](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) |
| Funkcje SECURITY DEFINER dostępne anon | 18 | [Opis](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) |
| Funkcje SECURITY DEFINER dostępne authenticated | 18 | [Opis](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) |
| Ochrona przed ujawnionymi hasłami wyłączona | 1 | [Opis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |

Te wyniki nie są potwierdzeniem poprawności zabezpieczeń całego TaskOn. Nie zmieniano istniejących widoków, funkcji, polityk ani globalnych ustawień Auth.

## Rozbudowa — katalog i profil JDG

Zaimplementowano pierwszy etap planu `PLAN-JDG.md`: wybór przy rejestracji, profil w bazie, przejście DN → JDG z historią, katalog produktów/usług, ceny/stawki, archiwizację i eksport. Wersjonowanie i identyfikatory operacji chronią zapis z wielu urządzeń. Osobny silnik oblicza pozycje faktur w całkowitych groszach.

Na tym etapie zakończono katalog i profile. Rozbudowę o faktury i podatki opisano w kolejnym wpisie poniżej; ewidencja DN pozostaje odrębna.

44 testy oraz kontrola TypeScript przechodzą. Dostosowano API załączników do 4 MB, dodano walidację przed zapisem wydatku i czytelne ponawianie samego załącznika. Okna blokują przewijanie strony w tle; menu mobilne ma zamykanie, obsługę Escape i kontrolę fokusu.

Migrację zastosowano w TaskOn jako `20261016143642_business_profiles_and_catalog.sql`. Baza potwierdziła RLS na wszystkich trzech nowych tabelach; doradca bezpieczeństwa nie wskazał problemów dotyczących tych obiektów. Plik migracji dopasowano do wersji potwierdzonej przez Supabase.


## Rozbudowa JDG — faktury i podatki, 16.10.2026

Zaimplementowano faktury sprzedaży/zakupu, szkice, wielopozycyjne dokumenty z katalogu, rabaty, korekty, niezmienne dane firmy i kontrahenta, płatności z odwróceniami, załączniki oraz prywatny wydruk do PDF. Zakup ma oddzielne okresy PIT/VAT, procent odliczenia VAT i udział kosztu. Import kopii dopisuje dokumenty, ich płatności i dane rozliczeń, zachowuje historię oraz przesuwa numerację.

Pulpit i widok PIT/VAT obejmują miesięczną skalę, liniowy i ryczałt, faktycznie zapłacone składki, roczną prognozę z odrębnym rozliczeniem innych dochodów na skali, VAT do zapłaty/przeniesienia/zwrotu oraz wykresy i dokładne tabele. Kontrola limitu VAT uwzględnia proporcję od pierwszego dnia sprzedaży i wcześniejszą DN. Prawo do ryczałtu badane według przychodu poprzedniego roku.

70 testów przeszło, w tym testy nowych migracji w PostgreSQL/PGlite, prywatność dwóch kont, idempotencja, wersjonowanie, korekty, import, składki, zaokrąglenia oraz zaliczki niezależne od faktycznych wpłat. Kompilacja produkcyjna sprawdza również nowe trasy. Nie tworzono nowych kont technicznych w produkcji.

Nowe 6 tabel JDG wraz z poprzednimi 14 tabelami Ewidory daje 20 tabel mk_*; każda ma RLS. Zakres jest opisany w PLAN-JDG.md i w interfejsie. KSeF/JPK, metody kasowe, zagranica, remanent, środki trwałe i płace pozostają poza zakresem.

Migracje produkcyjne zastosowano i sprawdzono w Supabase: `20261016175643_ewidora_invoices_and_payments.sql` oraz `20261016175703_ewidora_jdg_tax_periods.sql`. Wszystkie 20 tabel mk_* ma RLS; nowe RPC działają jako SECURITY INVOKER z ustalonym search_path. Doradca bezpieczeństwa nie zgłosił nowych obiektów Ewidory. Istniejąca konfiguracja TaskOn pozostała niezmieniona.


## Remanent KPiR i uprawnienia — 16.10.2026

Dodano prywatne spisy początkowe, miesięczne i końcowe z wyceną własnych składników oraz ilościowym ujęciem towarów obcych. Szkice mają wersjonowanie; zatwierdzone zapisy są niezmienne. Poprawka jest pełną wersją z przyczyną i historią. Wydruk do podpisu, CSV, kopia i import JSON zachowują utrwalone dane firmy. Katalog przenosi tylko nazwę/jednostkę. Wycenę, niższą cenę rynkową, koszt materiałów bezpośrednich i ustawowe pomniejszenia sprawdza również baza.

Różnica remanentowa koryguje roczny dochód skali/liniowego i zaliczkę za miesiąc rzeczywistego spisu. Nie jest przenoszona jako fikcyjny spis następnych miesięcy. Brak początku przy zatwierdzonym końcu blokuje właściwy wynik PIT; niepełny rok ma widoczną informację o niepełnej prognozie. VAT i ryczałt pozostają bez wpływu remanentu.

84 testy przechodzą, w tym 14 testów remanentu i uprawnień. TypeScript i build produkcyjny są poprawne. Testowa baza odtwarza teraz domyślne szerokie granty Supabase: sama kontrola RLS nie oznacza zakazu kasowania własnej historii. Zastosowano jawne uprawnienia do obiektów Ewidory. Produkcja potwierdziła 21 tabel mk_* z RLS, brak dostępu SELECT anon oraz brak DELETE/TRUNCATE authenticated na każdej z nich. Płatności faktur i historia przejść nie mają prawa UPDATE. Istniejących obiektów i globalnej konfiguracji TaskOn nie zmieniono.

Migracje zastosowane i potwierdzone przez Supabase:
- `20261016204716_inventory_counts.sql`
- `20261016204806_inventory_permissions.sql`
- `20261016204912_ewidora_explicit_privileges.sql`

Nie tworzono kont technicznych ani wpisów księgowych w produkcji. Pozostały zakres: środki trwałe, formalne struktury KPiR/JPK i szczególne procedury. Moduł nie obejmuje remanentu likwidacyjnego VAT.
