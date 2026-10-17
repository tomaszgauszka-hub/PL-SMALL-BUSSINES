# Ewidora — laboratorium KSeF TEST dla fikcyjnej JDG

Data weryfikacji: 17.10.2026. Wersja aplikacji: 2.2. Zakres: fikcyjna osoba fizyczna prowadząca JDG, zwykłe faktury krajowe PLN. Spółki, grupy VAT, JST, egzekucja i produkcyjny KSeF są poza wdrożeniem.

## Wynik i dostęp

Zaimplementowano rzeczywisty obieg: przypisanie laboratorium → uwierzytelnienie XAdES → FA(3) i lokalne XSD → szyfrowanie → wysyłka online → wynik MF → testowy numer KSeF → UPO. Panel jest pod `/ksef-test`, a uprawnione konto ma link „KSeF TEST” w nawigacji. Konto musi być potwierdzone i mieć administracyjny przydział w bazie. Właścicielem jest UUID Auth; przeglądarka nie wskazuje właściciela ani NIP-u kontekstu.

17.10.2026 prawdziwe `POST /testdata/person` zakończyło się HTTP 200. Pełny test tego samego adaptera serwerowego zakończył się statusem MF 200, nadaniem numeru KSeF TEST, zamknięciem sesji i zapisanym UPO (5508 bajtów), sprawdzonym względem numeru i hasha odpowiedzi. Dokument zawierał dwie stawki: netto 150,00 zł, VAT 27,00 zł, brutto 177,00 zł. Pierwsze żądanie zakończyło się po utrwaleniu referencji; kolejne sprawdzenie dokończyło odczyt bez ponowienia wysyłki. To wynik rzeczywistego MF TEST, nie symulacji. Nie publikujemy identyfikatorów konta pilota w repozytorium. Obsługa konta w przeglądarce wymaga osobnej weryfikacji po wdrożeniu.

## Korzystanie

1. Zaloguj się na przypisane konto i wybierz „KSeF TEST”. Nie trzeba zmieniać rzeczywistego profilu DN na JDG.
2. „Sprawdź połączenie” wykonuje rzeczywiste uwierzytelnienie testowej JDG. Widoczna jest data ostatniej udanej próby.
3. Wprowadź 1–20 fikcyjnych pozycji i potwierdź użycie fikcyjnych danych. Sprzedawca i nabywca są generowani przez aplikację, bez importu klientów lub faktur księgowych.
4. „Sprawdź XML i zapisz” utrwala odrębny dokument z numerem `TEST/rok/UUID` i sprawdza oficjalny schemat FA(3). Zapis nie wysyła go do MF.
5. „Wyślij do TEST” uruchamia pojedynczą wysyłkę. HTTP 202 nie oznacza przyjęcia. Status „Przyjęta w KSeF TEST” wymaga odpowiedzi MF 200, zgodnego hasha i numeru KSeF.
6. Jeśli dokument jest przetwarzany lub wynik nie jest znany, użyj „Sprawdź status” po widocznym czasie oczekiwania. Dostępność UPO jest sprawdzana oddzielnie. XML i UPO pobiera się prywatnie z listy.
7. Na drugim urządzeniu zaloguj się na to samo konto i wybierz „Odśwież widok”. Stan pochodzi z bazy. Odświeżenie widoku nie wykonuje żądania do MF.

VAT 23%, 8%, 5%, krajowe 0% oraz `zw.` służą testowaniu XML. Dla `zw.` użyto fikcyjnego przykładu art. 113 ust. 1 ustawy o VAT. Korekty, zaliczki, waluty, specjalne procedury, załączniki FA(3) i offline24 wymagają dalszych etapów. Limit pilota: 100 dokumentów na konto.

## Granica środowiska

| Środowisko | Adres API | Stan |
| --- | --- | --- |
| TEST / TE | `https://api-test.ksef.mf.gov.pl/v2` | Jedyny dozwolony host, stała w kodzie i ograniczenie bazy |
| DEMO | `https://api-demo.ksef.mf.gov.pl/v2` | Niedostępne w module |
| PROD | `https://api.ksef.mf.gov.pl/v2` | Niedostępne w module |

Kontrakt odczytany z działającego TEST: API 2.9.0, build `2.9.0-te-20261014.1+9ffc823fec7307d6f1ad739ae3b7b022beab9431`. TEST może wyprzedzać produkcję. Przy aktualizacji porównaj kontrakt i manifest XSD.

MF TEST współdzieli dane pomiędzy integratorami; nie stanowi prywatnej piaskownicy. Wyłącznie fikcyjne identyfikatory, nazwy i opisy. Przydzielona tożsamość została wygenerowana na potrzeby `testdata/person` z `isBailiff: false`. Nie wymaga rzeczywistej JDG, rejestracji CEIDG ani ZAW-FA w tym scenariuszu. Dane prawdziwego konta, klientów i księgowości nie są przekazywane do MF.

## Podpis i poświadczenia

Dla każdej ręcznej operacji backend generuje świeży klucz RSA 2048, niewyeksportowalny klucz prywatny WebCrypto oraz krótkotrwały samopodpisany certyfikat TEST. Certyfikat zawiera naturalną osobę i `serialNumber=TINPL-<testowy NIP>`, zgodnie ze scenariuszem MF. Nie kupujemy podpisu kwalifikowanego. `verifyCertificateChain=false` dotyczy podpisu XAdES w TEST; weryfikacja certyfikatu HTTPS/TLS pozostaje włączona.

Przebieg: `POST /auth/challenge`, XAdES enveloped z SHA-256, explicit `Reference URI=""` i exc-c14n, `POST /auth/xades-signature`, ograniczone sprawdzanie `GET /auth/{referenceNumber}`, jednorazowe `POST /auth/token/redeem`. Weryfikacja podpisu i naruszenia podpisanych danych jest objęta testem lokalnym; zgodność potwierdziło rzeczywiste uwierzytelnienie MF TEST.

Klucze, certyfikat i tokeny pozostają tylko w pamięci jednego żądania. Nie są zapisywane w PostgreSQL, plikach, logach, JSON, przeglądarce ani zmiennych `NEXT_PUBLIC_*`. Po operacji adapter próbuje unieważnić sesję odświeżania przez `DELETE /auth/sessions/current`; token dostępu wygasa według MF. Następna operacja uwierzytelnia się od nowa. Nie utrzymujemy tokenów pomiędzy wywołaniami i nie potrzebujemy nowego klucza szyfrowania w środowisku.

Biblioteki przypięte w lockfile: `xadesjs` 2.6.8, `@peculiar/x509` 2.2.0, `@xmldom/xmldom` 0.9.12, `xpath` 0.0.34, `reflect-metadata` 0.2.2 i `xmllint-wasm` 5.3.0. Kryptografia korzysta z Node.js/WebCrypto i bibliotek, bez własnych algorytmów.

## Walidacja i wysyłka

Niezmienny XML UTF-8 powstaje z danych syntetycznych i dokładnych kwot groszowych silnika Ewidory. `lib/ksef/schemas/sources.json` dokumentuje oficjalne źródła oraz SHA-256 lokalnych XSD. Zależności schematu są dołączone lokalnie; walidacja nie pobiera ich z sieci, odrzuca DTD/encje i ma limit pamięci. Przed wysłaniem backend odtwarza cały kanoniczny dokument z przypisanego NIP-u, UUID i danych wejściowych, porównuje XML, hash, numer i kwoty, następnie ponownie sprawdza XSD.

1. `GET /security/public-key-certificates`: wybór ważnego klucza `SymmetricKeyEncryption` z identyfikatorem `publicKeyId`.
2. Losowy AES-256-CBC/PKCS#7 i IV 128-bitowy; opakowanie klucza RSA-OAEP SHA-256/MGF1 SHA-256.
3. `POST /sessions/online` z FA(3), wersją `1-0E` i parametrami szyfrowania. Utrwalenie referencji sesji.
4. Utrwalenie etapu `submission_started` **przed** nieidempotentnym POST. Jeśli zapis się nie powiedzie, faktura nie zostanie wysłana.
5. `POST /sessions/online/{session}/invoices` z SHA-256 i rozmiarami bajtów oryginału/szyfrogramu, Base64 oraz `offlineMode: false`. Utrwalenie referencji faktury, zamknięcie sesji.
6. `GET /sessions/{session}/invoices/{invoice}`: porównanie hasha, referencji, numeru dokumentu i NIP-u w numerze KSeF TEST. Odpowiedzi pośrednie nie są prezentowane jako przyjęcie.
7. UPO pobierane bezpośrednio przez uwierzytelniony endpoint `/sessions/{session}/invoices/{invoice}/upo`. Sprawdzane: typ XML, brak DTD/encji, numer dokumentu KSeF i hash `x-ms-meta-hash`, gdy MF go zwraca. Zapis prywatnego XML i SHA-256. Nie korzystamy z zewnętrznych URL UPO.

Po utracie odpowiedzi zapisane referencje umożliwiają wznowienie odczytu. Jeżeli brakuje referencji faktury, adapter szuka jej w sesji po hashu i numerze. Nie wysyła automatycznie nowego POST faktury. Stan z sesją nie wraca do „Gotowa”. Limit MF 429 respektuje Retry-After; nie jest automatycznie ponawiany. Nowe uwierzytelnienie, a nie utrwalony refresh token, obsługuje następną ręczną próbę.

## API i dane

- `GET /api/ksef-test` — własne laboratorium i maksymalnie 100 dokumentów, bez prywatnych poświadczeń.
- `POST /api/ksef-test` — ścisłe komendy JSON: `connect`, `create` z UUID i danymi, `send`/`refresh` z UUID. Host, właściciel i kontekst NIP pochodzą wyłącznie z backendu/bazy.
- `GET /api/ksef-test?id=<UUID>&download=xml|upo` — prywatne pobranie własnego dokumentu.

Istniejące sesje Supabase, `currentUser()`, RLS, `auth.uid()`, zgodny Origin, JSON, walidacja Zod, limit rozmiaru oraz `private, no-store` chronią API. Anonimowy dostęp 401, obcy Origin 403, brak przydziału odmawia dostępu. Aplikacja nie używa service-role. Publiczne demo nie wywołuje MF i nie ma linku laboratorium. Nie zmieniamy globalnego Auth/SMTP TaskOn.

| Obiekt | Rola |
| --- | --- |
| `public.mk_ksef_test_workspaces` | Administracyjny przydział TEST/JDG, syntetyczna tożsamość, stan i ostatnia udana autoryzacja |
| `public.mk_ksef_test_documents` | Odrębna faktura TEST, dane/XML/hash/kwoty, status, referencje, numer KSeF, UPO i historia etapów |
| `mk_private.ksef_test_runtime` | Dzierżawa operacji na konto: 120 s; minimalny odstęp 10 s; kontrola równoczesnych urządzeń |

Tabele mają RLS i jawne granty. Użytkownik odczytuje wyłącznie własne dokumenty; zapis odbywa się przez ograniczone funkcje transakcyjne. UUID tworzonej faktury pozwala powtórzyć zapis po utracie odpowiedzi bez duplikatu. Wysłana treść i nadane referencje są niezmienne; przyjęty dokument nie może cofnąć statusu. XML/UPO mieszczą się w istniejącej bazie. Brak relacji do `mk_invoices`, klientów, numeracji i PIT/VAT; testy potwierdzają brak zmiany ewidencji księgowej.

## Utrzymanie i koszty

Adapter działa w istniejącej Node.js Function Next.js na Vercel (60 s); budżet operacji MF 45 s, pojedyncze żądanie do 12 s. Stan i lease przeżywają odświeżenie oraz zimny start. Nie ma crona, workera, płatnej kolejki ani nowego serwera. Pliki WASM/workera/XSD są jawnie dołączone do funkcji przez konfigurację Next.js.

Cel niewielkiego pilota: 0 zł dodatkowych usług, bez VPS, domeny, komercyjnego pośrednika lub podpisu kwalifikowanego. Nie oznacza gwarancji braku kosztów dowolnej skali; TaskOn współdzieli zasoby. Nie zmieniano planów ani nie włączano płatnych dodatków. Warunki Vercel Hobby obejmują osobiste, niekomercyjne użycie; sam brak sprzedaży aplikacji nie rozstrzyga komercyjnego zastosowania. Supabase Free ma limity bazy i transferu. Aktualnych rachunków organizacji nie audytowano.

Certyfikat KSeF typu 1 służy do uwierzytelniania. Typ 2 służy do potwierdzania wystawcy na wizualizacji w trybach offline, w tym do oznaczenia QR „CERTYFIKAT”; nie jest potrzebny do tego online TEST. CCK nie pobiera opłat za swoje usługi (polityka, §10.1). Testowy self-signed jest odrębnym mechanizmem akceptowanym wyłącznie w TEST.

## Weryfikacja i dalszy zakres

100 testów obejmuje m.in. wszystkie stawki/XSD, XML escaping, podpis i jego naruszenie, szyfrowanie/odszyfrowanie, wymagany checkpoint, utraconą odpowiedź bez duplikatu, zgodność hashy/UPO, 429, TEST-only, owner RLS, dwie sesje oraz lease. TypeScript i build muszą przejść przed wdrożeniem. Lokalny trace funkcji obejmuje komplet XSD i xmllint WASM. Rzeczywisty wynik MF i UPO opisano wyżej; testy z atrapą MF są oddzielnym sprawdzeniem błędów.

Dalsze etapy wymagają osobnego projektu i testów: korekty, zaliczki, offline24, odnowienia certyfikatów i integracja produkcyjna. Obecny sukces TEST nie potwierdza gotowości do prawnego obiegu faktur produkcyjnych.

## Źródła pierwotne

- Kontrakt TEST — https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json
- Środowiska i jawność TEST — https://github.com/CIRFMF/ksef-api/blob/main/srodowiska.md
- Scenariusz JDG — https://github.com/CIRFMF/ksef-api/blob/main/dane-testowe-scenariusze.md
- Certyfikaty/XAdES — https://github.com/CIRFMF/ksef-api/blob/main/auth/testowe-certyfikaty-i-podpisy-xades.md
- Uwierzytelnienie — https://github.com/CIRFMF/ksef-api/blob/main/uwierzytelnianie.md
- Wysyłka/szyfrowanie/UPO — https://github.com/CIRFMF/ksef-api/blob/main/sesja-interaktywna.md
- Oficjalne XSD — https://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd
- Certyfikaty typu 1/2 — https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/certyfikaty-ksef/
- Polityka CCK §10.1 — https://ksef.podatki.gov.pl/media/gy3bmcud/polityka_certyfikacji_cck_mf-v20.pdf
- Vercel Hobby — https://vercel.com/docs/plans/hobby
- Supabase Free — https://supabase.com/pricing
