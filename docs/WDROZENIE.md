# Wdrożenie plsmallbusiness

## Vercel

Projekt: plsmallbusiness, ID prj_qfmo2BYDsh4MP2XjHS0fscrs4GLy, zespół team_YoGY9i0DSaXvAadeoiAo5M4w.

| Pole | Wartość |
| --- | --- |
| Framework Preset | Next.js |
| Node.js | 24.x |
| Root Directory | Główny katalog aplikacji |
| Install Command | pnpm install --frozen-lockfile |
| Build Command | pnpm build |
| Output Directory | Automatyczna wartość Next.js |

Repozytorium: [PL-SMALL-BUSSINES](https://github.com/tomaszgauszka-hub/PL-SMALL-BUSSINES). Kod jest opublikowany w głównym katalogu repozytorium. Produkcja: [plsmallbusiness.vercel.app](https://plsmallbusiness.vercel.app). Główna gałąź uruchamia automatyczne wdrożenia.

Wymagane zmienne środowiskowe produkcji:

| Klucz | Wartość |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | https://booexvenlxuyrnamhsoi.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Aktywny klucz publishable projektu TaskOn |
| NEXT_PUBLIC_APP_URL | https://plsmallbusiness.vercel.app |

Nie używaj klucza secret/service-role ani hasła PostgreSQL. Podglądom nie przypisuj automatycznie bazy produkcyjnej — bez osobnej konfiguracji pokazują demonstrację.

Produkcja odpowiada publicznie HTTP 200. Nie wyłączano ochrony SSO całego projektu. Własne logowanie aplikacji i RLS chronią ewidencję niezależnie od ustawień Vercel. Publicznych zmiennych produkcyjnej bazy nie dodano do podglądów.

## Supabase — istniejący TaskOn

Migracja initial_mala_ksiega jest już wykonana, wersja 20261016075550. Plik odpowiadający tej historii: supabase/migrations/20261016075550_initial_mala_ksiega.sql. Nie uruchamiaj ponownie całego schema.sql w tej bazie.

Utworzono mk_clients, mk_profiles, mk_sales, mk_payments, mk_expenses, mk_taxes, mk_audit, mk_counters, mk_operations, mk_legal_events i mk_attachments oraz prywatny bucket mk-evidence.

Dalsze migracje muszą dotyczyć obiektów tej aplikacji i uwzględniać historię współdzielonego projektu. Przed poleceniami CLI sprawdź właściwy project ref i wykonaj dry-run. Nie wykonuj db reset ani config push na TaskOn.

## Logowanie we współdzielonym projekcie

Pozostaw istniejący Site URL, szablony wiadomości, SMTP oraz ustawienia rejestracji TaskOn. Nie wklejaj globalnie konfiguracji lokalnego supabase/config.toml ani szablonów z tego repozytorium.

Zapisane i potwierdzone adresy w Supabase Authentication → URL Configuration → Redirect URLs:

~~~text
https://plsmallbusiness.vercel.app/auth/callback
https://plsmallbusiness.vercel.app/auth/callback?next=/reset-password
~~~

Dodaj adresy do dotychczasowej listy, zachowując obecne wpisy. Standardowy przepływ PKCE wymaga otwarcia potwierdzenia lub resetu w przeglądarce, w której wysłano żądanie. Endpoint /auth/confirm obsługuje także token_hash, jeśli istniejące szablony projektu są z nim zgodne.

Potwierdzanie adresów email i odzyskiwanie haseł wymaga działającej poczty. Przed udostępnieniem tych funkcji sprawdź bieżące ograniczenia nadawcy i konfigurację SMTP: [dokumentacja](https://supabase.com/docs/guides/auth/auth-smtp).

TaskOn ma włączone nowe konta email i wyłączone obowiązkowe potwierdzanie email. Nie zmieniono tych globalnych ustawień. Przy obecnej konfiguracji nowe konto otrzymuje sesję bez wiadomości potwierdzającej; wysyłka resetu hasła nadal wymaga działającej poczty. Istniejące konto TaskOn służy także do Małej Księgi, a zmiana hasła dotyczy obu aplikacji.

## Weryfikacja wdrożenia

1. Potwierdź konfigurację właściwego projektu i zmiennych bez ujawniania kluczy.
2. Zaloguj się do aplikacji i dodaj klienta, sprzedaż, częściową wpłatę oraz koszt z plikiem.
3. Otwórz to samo konto w drugiej przeglądarce i sprawdź odświeżenie danych.
4. Sprawdź drugie konto: brak dostępu do danych i plików pierwszego konta.
5. Sprawdź potwierdzenie email, ponowną wysyłkę, odzyskanie hasła i wylogowanie.
6. Sprawdź eksport CSV/JSON oraz ponowny import bez duplikatów.
7. Bez sesji API aplikacji ma zwracać 401, a POST z obcym Origin — 403.

Kontrole bazy, testy lokalne i GitHub Actions są zakończone. Produkcyjny test HTTP rejestracja → sesja → API → baza → odczyt w drugiej sesji zakończył się powodzeniem. Potwierdzono także izolację drugiego konta, bezpieczne cookies, ochronę Origin, idempotencję i wylogowanie. Po teście usunięto oba konta techniczne i ich dane. Wysyłki wiadomości odzyskiwania hasła na skrzynkę użytkownika nie testowano.


## Laboratorium KSeF TEST — 17.10.2026

Migracja dokumentów: `20261017115254_ksef_test_documents.sql`, zastosowana po migracji laboratorium `20261017111004`. Nie wymaga nowych sekretów ani zmian globalnego Auth/SMTP TaskOn. Przydział laboratorium pozostaje administracyjny, na podstawie UUID potwierdzonego konta. Nie dodawaj przydziału na podstawie pola edytowalnego przez przeglądarkę.

Trasa `/api/ksef-test` działa jako Node.js Function (maxDuration 60 s). `next.config.ts` dołącza lokalne XSD oraz worker/WASM xmllint; biblioteki kryptograficzne pozostają po stronie serwera. Sprawdź te pliki w śladzie funkcji po zmianie konfiguracji bundlera. Nowa wersja nie potrzebuje płatnej kolejki, crona ani serwera.

Próba odbioru: na przypisanym koncie otwórz KSeF TEST, sprawdź połączenie, zapisz fakturę z fikcyjnymi pozycjami i zatwierdzoną zgodą TEST, wyślij raz. Gdy MF nadal przetwarza, odczekaj widoczny limit i wybierz Sprawdź status. Oczekiwane: numer KSeF TEST i pobrania XML/UPO. Po utracie odpowiedzi nigdy nie ponawiaj wysyłki tej samej faktury — użyj statusu. Z drugiego urządzenia odśwież widok. Bez sesji API zwraca 401, obcy Origin 403, inne konto nie otrzymuje laboratorium.
