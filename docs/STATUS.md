# Stan wykonania — 16.10.2026

## Wykonane

- Odzyskano kompletną aplikację i wskazano nowe repo PL-SMALL-BUSSINES.
- Potwierdzono projekt Vercel plsmallbusiness z presetem Next.js i Node.js 24.
- Sprawdzono schemat TaskOn: 20 istniejących tabel, pięć dotychczasowych bucketów, brak kolizji mk_*.
- Zastosowano migrację initial_mala_ksiega, wersja 20261016075550.
- Utworzono 11 tabel z RLS, funkcje SECURITY INVOKER i prywatny bucket mk-evidence.
- Sprawdzono w rzeczywistym PostgreSQL izolację dwóch kont, idempotencję i odczyt plików. Test zakończył się ROLLBACK; nie pozostały dane testowe.
- 35 testów lokalnych oraz kompilacja produkcyjna przechodzą.

## Blokady połączeń

GitHub odrzuca utworzenie pierwszego pliku .gitignore kodem 403 Resource not accessible by integration. Odczyt metadanych i oznaczenia push/admin nie są dowodem dostępności operacji zapisu przez konektor. Repo pozostało puste.

Vercel odrzuca aktualizację konfiguracji oraz utworzenie publicznych zmiennych produkcyjnych kodem 403 dla scope tomaszgauszka-hubs-projects. Zmienne nie zostały zapisane. Samo odczytanie projektu działa. Próba wdrożenia podglądu bezpośrednio z plików, z zachowaniem SSO, również została odrzucona 403. Git nie ma własnej sesji uwierzytelnienia, GitHub CLI nie jest dostępny, a Vercel CLI zwraca loggedIn: false.

Automatyczna kontrola odrzuciła ssoProtection: null, ponieważ wyłączałoby ochronę SSO całego projektu bez osobnej zgody na taki zakres. Ponowiona, węższa konfiguracja pozostawiła SSO bez zmian, ale została odrzucona przez API Vercel kodem 403.

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
