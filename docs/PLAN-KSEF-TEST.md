# Ewidora — projekt integracji z KSeF TEST dla fikcyjnej JDG

Data weryfikacji: 17.10.2026. Zakres: wyłącznie osoba fizyczna prowadząca JDG. Spółki, grupy VAT, JST, egzekucja i produkcyjny KSeF są poza tym wdrożeniem.

## Cel i stan prac

Użytkownik ma przetestować rzeczywistą wysyłkę do testowego API Ministerstwa Finansów, otrzymać testowy numer KSeF i pobrać UPO. Sam podgląd XML albo symulacja powodzenia nie spełniają celu.

W tej fazie powstają projekt i konfiguracja pilota. Wysyłka nie jest jeszcze uruchomiona w aplikacji. Robocze przypisanie dotyczy potwierdzonego konta wskazanego przez użytkownika; w bazie właścicielem jest UUID Auth, nie edytowalne metadane ani adres wpisany przez przeglądarkę. Adresu konta, jego hasła i rzeczywistych danych księgowych nie przekazujemy do MF.

Pierwsza migracja dodaje tylko `mk_ksef_test_workspaces`, z RLS oraz wyłącznie odczytem własnego laboratorium przez użytkownika. Nie zmienia typu rzeczywistej działalności, zapisów DN/JDG, klientów, numeracji, PIT, VAT ani globalnego Auth TaskOn. Utworzenie tożsamości w TEST jest osobnym krokiem przygotowania, a nie rejestracją działalności w CEIDG.

Potwierdzony stan 17.10.2026: migracja została zastosowana w istniejącym projekcie, laboratorium przypisano do potwierdzonego konta pilota, a rzeczywiste wywołanie `POST /testdata/person` w MF TEST zakończyło się HTTP 200. Stan `person_created` zapisano w bazie. Identyfikatory wygenerowano wyłącznie na potrzeby testu. Wszystkie 87 testów przeszły, w tym izolacja właścicieli, brak praw zapisu użytkownika i odrzucenie hostów DEMO/PROD. Panel przeglądarkowy, certyfikat, autoryzacja, wysyłka faktury i UPO pozostają do implementacji; samo przypisanie w bazie nie udostępnia jeszcze tych funkcji w interfejsie.

## Środowisko i ograniczenie odpowiedzialności

| Środowisko MF | Adres API | Zastosowanie |
| --- | --- | --- |
| TEST / TE | `https://api-test.ksef.mf.gov.pl/v2` | Wybrany pilot; syntetyczne identyfikatory i samopodpisany certyfikat |
| DEMO | `https://api-demo.ksef.mf.gov.pl/v2` | Późniejsza walidacja z rzeczywistym uwierzytelnieniem; nie używamy w pilocie |
| PROD | `https://api.ksef.mf.gov.pl/v2` | Faktury wywołujące skutki prawne; niedostępne w tym module |

TEST jest oficjalnym środowiskiem technicznym MF, ale nie jest integracją produkcyjną. MF opisuje fikcyjną JDG w scenariuszu `testdata/person` z `isBailiff: false`. Nie potrzeba rzeczywistej JDG ani ZAW-FA do tego scenariusza. Dane TEST nie są prywatną piaskownicą: inni integratorzy mogą uwierzytelnić się w tym samym kontekście. Wszystkie dane, w tym kontrahenci, opisy, nazwy produktów i numery dokumentów, muszą być fikcyjne.

Wybrany kontrakt odczytany z działającego endpointu: API 2.9.0, build `2.9.0-te-20261014.1+9ffc823fec7307d6f1ad739ae3b7b022beab9431`. TEST może wyprzedzać produkcję; podczas implementacji należy ponownie porównać kontrakt i schematy XSD. Sam odczyt kontraktu nie oznacza udanej autoryzacji ani wysyłki.

## Docelowy przebieg dla użytkownika

1. Po zalogowaniu uprawnione konto otwiera „Laboratorium KSeF — TEST”. Publiczne demo Ewidory nie otrzymuje możliwości wywołań do MF.
2. Widzi fikcyjną JDG, testowy NIP, środowisko TEST i stan połączenia. Nie musi przełączać swojego rzeczywistego profilu DN na JDG.
3. „Przygotuj testową JDG” tworzy wyłącznie syntetyczny podmiot i lokalny certyfikat testowy. Ten etap jest wykonywany raz, a wynik zapisywany i weryfikowany.
4. „Nowa faktura testowa” otwiera osobny formularz z fikcyjnym klientem i katalogiem. Numeracja ma prefiks `TEST/`. Nie kopiujemy rzeczywistych faktur ani notatek klientów.
5. „Sprawdź XML” waliduje FA(3), kwoty, NIP-y fixture i zgodność sprzedawcy z kontekstem. „Wyślij do KSeF TEST” inicjuje wysyłkę po świadomym kliknięciu.
6. Lista pokazuje wynik MF: przyjęta, odrzucona, przetwarzana albo nieustalony wynik. Testowy numer KSeF, XML i UPO można pobrać. Dokumenty i wydruki mają oznaczenie TEST.

Pierwszy zakres dokumentów: zwykła krajowa faktura PLN z VAT 23%, 8%, 5%, 0% albo zwolnieniem, jedna i wiele pozycji. Korekty z odwołaniem do testowego dokumentu źródłowego są kolejnym krokiem po potwierdzeniu podstawowego cyklu. Faktury zaliczkowe, specjalne procedury VAT, załączniki FA(3) i offline24 nie są częścią pierwszego pilota.

## Uwierzytelnienie fikcyjnej JDG

1. Generujemy losowe identyfikatory testowe NIP i PESEL zgodne z wymaganym formatem i sumami kontrolnymi. Nie odczytujemy ich z rzeczywistych ustawień sprzedawcy ani rejestru CEIDG. Nazwa i opis są jednoznacznie fikcyjne.
2. `POST /testdata/person` z `nip`, `pesel`, `description` oraz `isBailiff: false` nadaje syntetycznej osobie uprawnienia właścicielskie w TEST.
3. Generujemy certyfikat X.509 self-signed zgodny z przykładami MF. Prywatny klucz pozostaje po stronie serwera; nie kupujemy podpisu kwalifikowanego. Nie wyłączamy weryfikacji certyfikatów HTTPS — self-signed dotyczy podpisu żądania, nie transportu TLS.
4. `POST /auth/challenge` zwraca wyzwanie. Budujemy `AuthTokenRequest` dla testowego NIP-u, podpisujemy XAdES i wywołujemy `POST /auth/xades-signature`.
5. Sprawdzamy `GET /auth/{referenceNumber}`, następnie jednorazowo pobieramy tokeny przez `POST /auth/token/redeem`. Odświeżanie korzysta z `POST /auth/token/refresh`.

Pierwszy techniczny test podpisu porównujemy z oficjalną aplikacją MF `KSeF.Client.Tests.CertTestApp` (.NET 10 SDK, dostępne bez opłaty licencyjnej). Ta aplikacja jest narzędziem programisty do testów, a nie nowym płatnym serwerem. Docelowy adapter działa w istniejącym backendzie Next.js/Node; wybór biblioteki XML/XAdES wymaga sprawdzenia utrzymania, licencji, dokładnej wersji i testów zgodności. Nie implementujemy własnych algorytmów kryptograficznych.

## Rzeczywista wysyłka online

Operacje niżej odnoszą się wyłącznie do stałego adresu TEST:

1. Pobrać właściwy, aktualny klucz MF przez `GET /security/public-key-certificates`; zweryfikować przeznaczenie i ważność. Klucze różnych środowisk nie są zamienne.
2. Wytworzyć niezmienny XML FA(3) w UTF-8. Walidować przypiętym XSD bez DTD, zewnętrznych encji ani pobierania zależności XML z sieci. Kwoty liczyć w groszach zgodnie z silnikiem Ewidory.
3. Wygenerować świeży klucz AES-256 i IV 128-bitowy dla sesji. Klucz AES opakować RSA-OAEP z SHA-256 i MGF1 SHA-256; XML zaszyfrować AES-256-CBC/PKCS#7 zgodnie z kontraktem MF.
4. `POST /sessions/online` z `formCode: {systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA'}` i parametrami szyfrowania.
5. `POST /sessions/online/{referenceNumber}/invoices` z SHA-256 i rozmiarami oryginalnych oraz zaszyfrowanych bajtów, treścią Base64 i `offlineMode: false`. Sam JSON danych faktury nie wystarcza.
6. Zapisać referencję sesji i faktury. Odczytać `GET /sessions/{referenceNumber}/invoices/{invoiceReferenceNumber}`. Sam HTTP 2xx z wysyłki nie jest potwierdzeniem przyjęcia faktury.
7. Po cyklu zamknąć sesję przez `POST /sessions/online/{referenceNumber}/close`. Odczytać wynik i pobrać UPO właściwym endpointem sesji/faktury. Status „przyjęta” wymaga potwierdzenia MF i testowego numeru KSeF; dostępność UPO jest osobnym polem.

## Architektura dopasowana do obecnej aplikacji

- Przeglądarka komunikuje się z prywatnym API Ewidory. Next.js uwierzytelnia konto przez dotychczasowe `currentUser()`, odczytuje przydzielone laboratorium z Supabase i wykonuje wywołania MF jako backend.
- Adres TEST jest stałą oraz ograniczeniem w bazie. Przeglądarka nie przekazuje hosta MF, danych właściciela ani środowiska. Moduł nie ma przełącznika PROD. Przekierowania HTTP są odrzucane; adresy pobrania UPO sprawdzamy względem dozwolonego hosta TEST.
- Endpointy własne: `GET /api/ksef-test` (stan), `POST /api/ksef-test/bootstrap`, `POST /api/ksef-test/invoices`, `POST /api/ksef-test/invoices/:id/send`, `POST /api/ksef-test/invoices/:id/refresh`, `GET /api/ksef-test/invoices/:id/xml`, `GET /api/ksef-test/invoices/:id/upo`. To projekt kontraktu, nie informacja o istniejących trasach.
- Zapisy wymagają bieżącej sesji, zgodnego Origin, JSON, walidacji i identyfikatora operacji. Odczyt i pobrania mają `private, no-store`; anonimowy dostęp jest zabroniony. Nie dokładamy klucza service-role do aplikacji.
- Żądania są krótkie, z limitami czasu. Stan i operacje przetrwają odświeżenie przeglądarki i zimny start funkcji. Nie opieramy idempotencji na pamięci procesu Vercela.
- Po timeoutcie wysyłki pokazujemy „wynik nieustalony” i ustalamy go po referencji/sesji/hashu. Nie wysyłamy automatycznie drugi raz. HTTP 429 respektuje Retry-After; 401 uruchamia kontrolowane odświeżenie dostępu, a błąd walidacji nie jest ponawiany jak awaria sieci.
- Początkowo brak crona, stałego workera i płatnej kolejki. Sprawdzanie stanu odbywa się po akcji użytkownika, z ograniczonym ponawianiem i przerwaniem po ukryciu karty. Późniejsze sprawdzenie wznawia odczyt, nie wysyłkę.

## Model danych i granica z księgowością

Pierwszy etap: `mk_ksef_test_workspaces` — UUID właściciela, stałe TEST/JDG/adres API, syntetyczna tożsamość, stan przygotowania i wersja kontraktu. Przydział wykonuje administrator. Zalogowany użytkownik odczytuje wyłącznie swój wpis; nie ma prawa INSERT/UPDATE/DELETE/TRUNCATE.

Kolejny etap:
- `mk_ksef_test_documents`: właściciel i laboratorium, niezmienny obraz danych testowych/XML po wysyłce, SHA-256, lokalny numer TEST, referencje MF, status, numer KSeF TEST, wynik walidacji i wersja.
- `mk_ksef_test_operations`: identyfikator operacji, odcisk danych, etap, dzierżawa wykonania, próby i zredagowane wyniki; ograniczenia unikalności chronią ponowienie z drugiego urządzenia.
- `mk_ksef_test_artifacts`: XML i UPO, właściciel, rozmiar, hash i środowisko; prywatne pobrania. W pilocie niewielkie pliki mieszczą się w obecnym PostgreSQL, bez nowej płatnej usługi.

Każda tabela będzie miała RLS i jawne granty odporne na szerokie default privileges projektu. Relacje obejmą właściciela, aby nie dało się podłączyć dokumentu do cudzego laboratorium. Raporty PIT/VAT i ewidencja `mk_invoices` nigdy nie pobierają tych rekordów. Testowy XML/UPO nie zmieniają statusu żadnej rzeczywistej faktury.

Certyfikaty, klucze prywatne i tokeny nie trafiają do logów, zwykłej kopii JSON ani przeglądarki. Jeśli będą przechowywane pomiędzy wywołaniami, wymagają szyfrowania uwierzytelnionego po stronie serwera, klucza spoza `NEXT_PUBLIC_*`, rozdzielenia według właściciela/środowiska i wygasania. Bez skonfigurowanej ochrony nie wdrażamy ich trwałego zapisu.

## Certyfikat typu 2

Certyfikat KSeF typu 1 służy do uwierzytelniania. Typ 2 służy do potwierdzania wystawcy na wizualizacji faktury wystawionej w trybie offline24, niedostępności albo awarii KSeF — w szczególności do drugiego oznaczenia QR „CERTYFIKAT” przed dosłaniem dokumentu. Nie jest to płatny „wyższy pakiet” ani certyfikat całej aplikacji. Do pierwszej wysyłki online w TEST typ 2 nie jest potrzebny. CCK MF nie pobiera opłat za swoje usługi (polityka certyfikacji, pkt 10.1). Testowy self-signed jest osobnym mechanizmem dopuszczonym wyłącznie w TEST.

## Koszt pilota i serwer

Cel: 0 zł dodatkowych opłat usługowych za niewielkie próby, bez zakupu VPS, domeny, komercyjnego pośrednika i podpisu kwalifikowanego. Nie oznacza to obietnicy braku kosztów każdej przyszłej skali ani audytu obecnych rachunków kont.

- Backend już działa jako funkcje Next.js na Vercel; nie potrzeba drugiego, całodobowego serwera tylko dla tego pilota. Alternatywnie cały test można uruchomić lokalnie.
- Vercel Hobby jest bezpłatny w granicach limitów dla osobistych, niekomercyjnych projektów. Sam brak sprzedaży aplikacji nie rozstrzyga późniejszego użycia komercyjnego. Rzeczywista obsługa firmy wymaga oceny warunków planu; ten etap dotyczy eksperymentu na fikcyjnych danych.
- Supabase ma plan Free: 500 MB bazy i 1 GB plików, z limitami transferu oraz usypianiem po bezczynności. Aktualnego planu organizacji i faktur nie audytowano. TaskOn i Ewidora współdzielą istniejące zasoby, więc budżet testów liczymy łącznie.
- Nie tworzymy nowego płatnego projektu ani dodatków. Przekroczenie limitów nie jest argumentem do automatycznego włączenia płatnego planu.

## Kolejność i kryteria odbioru

1. **Projekt i przydział:** potwierdzić konto, utworzyć odseparowane laboratorium, przetestować RLS/granty i ograniczenie TEST/JDG. Zapisać stan utworzenia osoby testowej, jeśli bootstrap się powiedzie.
2. **Uwierzytelnianie:** test self-signed/XAdES i odnowienia dostępu, bez płatnego certyfikatu; porównanie z oficjalnym narzędziem MF. Brak wycieku sekretów i brak możliwości wskazania PROD.
3. **Pierwsza faktura online:** walidacja FA(3), szyfrowanie, wysyłka, numer KSeF TEST, UPO i zgodność pobranego dokumentu. Dopiero to kończy pierwszy pełny test integracyjny.
4. **Obsługa w przeglądarce:** panel laboratorium tylko dla przypisanego konta, dokumenty fikcyjne, czytelne statusy i pobrania; praca po odświeżeniu i z drugiego urządzenia.
5. **Przypadki błędne:** zła suma/XSD, wygasły dostęp, brak uprawnienia, 429, awaria TEST, timeout po wysyłce, podwójne kliknięcie, ponowienie i izolacja dwóch kont. Test korekty po stabilnym zwykłym obiegu.

Wyników symulowanych nie oznaczamy jako odpowiedzi MF. Za dowód przyjęcia uznajemy odpowiedź z prawdziwego TEST z referencją, numerem KSeF i dostępnym UPO. Sam fakt utworzenia osoby w TEST nie dowodzi jeszcze poprawnej wysyłki faktur.

## Źródła pierwotne

- MF: środowiska TEST/DEMO/PROD — https://ksef.podatki.gov.pl/ksef-na-okres-obligatoryjny/wsparcie-dla-integratorow/
- Oficjalny scenariusz JDG — https://github.com/CIRFMF/ksef-api/blob/main/dane-testowe-scenariusze.md
- Samopodpisane certyfikaty i podpis XAdES — https://github.com/CIRFMF/ksef-api/blob/main/auth/testowe-certyfikaty-i-podpisy-xades.md
- Granice i jawność TEST — https://github.com/CIRFMF/ksef-api/blob/main/srodowiska.md
- Uwierzytelnianie — https://github.com/CIRFMF/ksef-api/blob/main/uwierzytelnianie.md
- Wysyłka, szyfrowanie i UPO — https://github.com/CIRFMF/ksef-api/blob/main/sesja-interaktywna.md
- Działający kontrakt TEST — https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json
- Certyfikaty typu 1/2 — https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/certyfikaty-ksef/
- Opłaty CCK MF, pkt 10.1 — https://ksef.podatki.gov.pl/media/gy3bmcud/polityka_certyfikacji_cck_mf-v20.pdf
- Vercel Hobby — https://vercel.com/docs/plans/hobby
- Vercel fair use — https://vercel.com/docs/limits/fair-use-guidelines
- Supabase Free — https://supabase.com/pricing
