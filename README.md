# Mała Księga — PL SMALL BUSSINES

Polska aplikacja do ewidencji działalności nierejestrowanej: sprzedaż należna, wpłaty i zwroty, wydatki, baza klientów, prognoza PIT-36 oraz kontrola limitów. Własne konto email/hasło i prywatne dane dostępne z kilku urządzeń.

## Docelowe zasoby

| Zasób | Cel |
| --- | --- |
| GitHub | tomaszgauszka-hub/PL-SMALL-BUSSINES |
| Vercel | plsmallbusiness — preset Next.js, Node.js 24 |
| Supabase | TaskOn, ref booexvenlxuyrnamhsoi |
| Tabele | 11 tabel public.mk_*; funkcje pomocnicze mk_private |
| Pliki | Prywatny bucket mk-evidence, PDF/JPG/PNG do 5 MB |

## Stan na 16.10.2026

Migracja bazy została wykonana i zweryfikowana w TaskOn. Istniejących 20 tabel aplikacji TaskOn nie zmieniono. Każda z 11 nowych tabel ma RLS; funkcje działają jako SECURITY INVOKER z ustalonym search_path.

W rzeczywistym PostgreSQL sprawdzono izolację dwóch kont, ponowienie zapisu oraz prywatność metadanych plików. Cały test wycofano transakcją — nie pozostały konta ani dane testowe. Lokalnie przechodzi 35 testów i kompilacja produkcyjna.

Zapis pierwszego pliku do nowego repozytorium GitHub jest blokowany odpowiedzią 403 Resource not accessible by integration. Vercel rozpoznaje projekt plsmallbusiness, ale odrzuca zmianę konfiguracji i zapis zmiennych kodem 403 dla zespołu. Nowa wersja nie została dotąd uruchomiona publicznie; logowanie przez wdrożoną aplikację nie jest jeszcze zweryfikowane.

Szczegóły i dalsze kroki: [WDROZENIE.md](docs/WDROZENIE.md). Raport wykonanych prac: [STATUS.md](docs/STATUS.md).

## Architektura

Next.js 16, React 19, TypeScript i Node.js 24. Logowanie, rejestracja, potwierdzenie email, odzyskiwanie hasła, ponowna wysyłka potwierdzenia i wylogowanie korzystają z Supabase Auth.

API sprawdza użytkownika i wykonuje zapytania z jego JWT. Nie korzysta z klucza service-role. Sesja ma cookies HttpOnly, SameSite=Lax i Secure na produkcji. Dane prywatne nie trafiają do publicznego cache.

Zapisy księgowe i numeracja są transakcyjne; identyfikator operacji zapobiega podwojeniu zapisu. Kontakty, profil i kontekst PIT mają kontrolę wersji. Aplikacja odświeża dane po zapisie, po powrocie do karty oraz co 30 sekund.

Współdzielony projekt oznacza wspólny Supabase Auth. Dane finansowe są przypisane do auth.uid(), niezależnie od organizacji i uprawnień TaskOn. Nie wolno nadpisywać głównego Site URL, globalnych szablonów email ani konfiguracji Auth projektu TaskOn na potrzeby tego wdrożenia.

## Sprawdzenie

~~~sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
~~~

Testy obejmują obliczenia, PostgreSQL/RLS dwóch kont w PGlite, atomowość i idempotencję, kontrolę wersji, import kopii, walidację żądań i ochronę plików przed szerokimi politykami innych aplikacji.

## Zakres podatkowy

Obsługiwane są lata 2025–2026, sprzedaż krajowa w PLN i działalność ze zwolnieniem z VAT. Reguły oraz źródła urzędowe są dostępne w aplikacji i w lib/domain.ts. Przychód należny dla limitu jest oddzielony od faktycznie otrzymanego przychodu dla PIT.

Raport PIT przygotowuje dane i prognozę podatku na skali. Aplikacja nie wysyła deklaracji do urzędu ani faktur do KSeF. Nie oblicza czynnego VAT, rozliczeń walutowych, wspólnego PIT ani wszystkich ulg.

## Kopie danych

Eksportuj → Kopia JSON zapisuje dane ewidencji. Import dopisuje brakujące identyfikatory, zachowuje historyczne dane dokumentów, przywraca kontekst PIT i przekroczenia oraz nie nadpisuje istniejących ustawień.

Pliki dowodowe pobierz osobno i dodaj po imporcie w szczegółach wydatków. JSON nie zawiera bajtów załączników. Dawny audyt nie jest przedstawiany jako nowe operacje.

## Pochodzenie

Implementacja jest własna. Inspiracje funkcjonalne: hipek/sales-registry, patimio66/mojmalybiznes i Pawel-04/Projekt_AI. Nie włączono ich kodu do projektu.
