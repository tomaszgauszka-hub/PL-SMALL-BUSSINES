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

Repozytorium: [PL-SMALL-BUSSINES](https://github.com/tomaszgauszka-hub/PL-SMALL-BUSSINES). Zawartość katalogu aplikacji należy umieścić w głównym katalogu repo, a nie pod dodatkowym katalogiem mala-ksiega.

Wymagane zmienne środowiskowe produkcji:

| Klucz | Wartość |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | https://booexvenlxuyrnamhsoi.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Aktywny klucz publishable projektu TaskOn |
| NEXT_PUBLIC_APP_URL | Faktyczny adres HTTPS produkcji po przydzieleniu domeny |

Nie używaj klucza secret/service-role ani hasła PostgreSQL. Podglądom nie przypisuj automatycznie bazy produkcyjnej — bez osobnej konfiguracji pokazują demonstrację.

Obecna ochrona Vercel wymaga SSO poza domenami niestandardowymi. Nie została zmieniona. Publiczna produkcja wymaga świadomego ustalenia zakresu ochrony; podglądy mogą pozostać chronione. Własne logowanie aplikacji i RLS chronią ewidencję niezależnie od ustawień Vercel.

## Supabase — istniejący TaskOn

Migracja initial_mala_ksiega jest już wykonana, wersja 20261016075550. Plik odpowiadający tej historii: supabase/migrations/20261016075550_initial_mala_ksiega.sql. Nie uruchamiaj ponownie całego schema.sql w tej bazie.

Utworzono mk_clients, mk_profiles, mk_sales, mk_payments, mk_expenses, mk_taxes, mk_audit, mk_counters, mk_operations, mk_legal_events i mk_attachments oraz prywatny bucket mk-evidence.

Dalsze migracje muszą dotyczyć obiektów tej aplikacji i uwzględniać historię współdzielonego projektu. Przed poleceniami CLI sprawdź właściwy project ref i wykonaj dry-run. Nie wykonuj db reset ani config push na TaskOn.

## Logowanie we współdzielonym projekcie

Pozostaw istniejący Site URL, szablony wiadomości, SMTP oraz ustawienia rejestracji TaskOn. Nie wklejaj globalnie konfiguracji lokalnego supabase/config.toml ani szablonów z tego repozytorium.

Po ustaleniu rzeczywistego hosta produkcji dodaj do Supabase Authentication → URL Configuration → Redirect URLs dokładnie:

~~~text
https://TWOJ_HOST/auth/callback
https://TWOJ_HOST/auth/callback?next=/reset-password
~~~

Dodaj adresy do dotychczasowej listy, zachowując obecne wpisy. Standardowy przepływ PKCE wymaga otwarcia potwierdzenia lub resetu w przeglądarce, w której wysłano żądanie. Endpoint /auth/confirm obsługuje także token_hash, jeśli istniejące szablony projektu są z nim zgodne.

Wbudowany nadawca Supabase ma ograniczenia i może obsługiwać tylko adresy członków zespołu. Produkcyjna rejestracja osób spoza zespołu wymaga odpowiedniego SMTP: [dokumentacja](https://supabase.com/docs/guides/auth/auth-smtp).

## Weryfikacja wdrożenia

1. Potwierdź konfigurację właściwego projektu i zmiennych bez ujawniania kluczy.
2. Zaloguj się do aplikacji i dodaj klienta, sprzedaż, częściową wpłatę oraz koszt z plikiem.
3. Otwórz to samo konto w drugiej przeglądarce i sprawdź odświeżenie danych.
4. Sprawdź drugie konto: brak dostępu do danych i plików pierwszego konta.
5. Sprawdź potwierdzenie email, ponowną wysyłkę, odzyskanie hasła i wylogowanie.
6. Sprawdź eksport CSV/JSON oraz ponowny import bez duplikatów.
7. Bez sesji API aplikacji ma zwracać 401, a POST z obcym Origin — 403.

Kontrole bazy i testy lokalne są zakończone. Pełny test przeglądarka → aplikacja → Auth → baza pozostaje do wykonania po usunięciu blokad zapisu GitHub/Vercel.
