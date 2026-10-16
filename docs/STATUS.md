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
