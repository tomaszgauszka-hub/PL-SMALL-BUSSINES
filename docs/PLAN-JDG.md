# Ewidora — katalog, faktury i prosta księgowość JDG

Plan i weryfikacja źródeł: 16.10.2026. To rozszerzenie aplikacji DN, z zachowaniem jej zapisów i wspólnego logowania TaskOn.

## Cel i podział prac

| Etap | Rezultat | Kryterium ukończenia |
| --- | --- | --- |
| 1. Konto i katalog | Rodzaj DN/JDG przy rejestracji, osobny profil w bazie, datowane przejście, produkty/usługi, ceny i stawki | RLS dwóch kont, zapis i odczyt na drugim urządzeniu, wersjonowanie, test przejścia bez zmiany wcześniejszych wpisów |
| 2. Faktury | Sprzedaż i zakup, wiele pozycji z katalogu, osobna numeracja, szkic/wystawiona/korekta, płatności, wydruk PDF i załączniki | Dokładne sumy netto/VAT/brutto; niezmienne dokumenty po wystawieniu; korekty; brak podwójnego księgowania |
| 3. Podatki i wykresy | Skala, liniowy i ryczałt; VAT należny/naliczony; zaliczki i zapłaty; historia miesięcy, limity, eksport | Testy granic, zaokrągleń, przenoszenia VAT, wielu stawek ryczałtu i oddzielenia DN/JDG |
| 4. Rozszerzenia i audyt | Formalne eksporty ewidencji, remanent, środki trwałe, szczególne przypadki | Osobna weryfikacja przepisów i przypadków przed włączeniem każdej funkcji |

Etapy 1–3 zaimplementowano. Stare wpisy DN nie są przeliczane jako dokumenty JDG; do wspólnego rocznego rozliczenia na skali trafia właściwy dochód DN. Z etapu 4 dodano remanent KPiR. Pozostałe rozszerzenia pozostają osobnym zakresem.

## Decyzje modelu

- `mk_business_profiles` przechowuje rodzaj działalności, rodzaj początkowy, datę rozpoczęcia JDG, formę PIT, status i datę VAT, podstawę zwolnienia oraz wersję konfiguracji. `mk_business_events` zachowuje przejście DN → JDG.
- Nie zmieniamy globalnych ustawień Auth TaskOn. Wybór przy rejestracji jest zapisany w metadanych Auth, a po otrzymaniu sesji w osobnym profilu aplikacji. Metadane użytkownika nie decydują o dostępie; właściciela nadal wyznacza `auth.uid()`.
- Dotychczasowi użytkownicy Ewidory zachowują profil DN. Pozostałe konta TaskOn nie są masowo przenoszone.
- Klienci i produkty są wspólne dla właściciela konta. Ewidencja DN i dokumenty JDG pozostają oddzielne. Przejście nie przelicza ani nie przemianowuje historii.
- `mk_products`: produkt/usługa, nazwa, kod, jednostka, cena netto w groszach, stawka VAT, stawka ryczałtu, opis, archiwizacja i wersja. Dokument musi zapamiętać kopię pozycji, a nie odwoływać się do jej aktualnej ceny.
- Zmiana DN → JDG wymaga daty i świadomego potwierdzenia. Nie cofamy jej jednym przełącznikiem. Wpisy DN kolidujące z datą przejścia wymagają wyjaśnienia; nie są automatycznie przekształcane.
- Wszystkie nowe tabele mają RLS, ustalone uprawnienia i indeks właściciela. Zapisy mają identyfikatory operacji, ochronę przed powieleniem i konfliktami wersji.

## Faktury — zaimplementowane

Osobne tabele `mk_invoices`, `mk_invoice_payments`, `mk_invoice_sequences`. Nagłówek: kierunek sprzedaż/zakup, rodzaj zwykła/korekta, numer, daty wystawienia/dostawy/PIT/VAT/otrzymania dokumentu, kontrahent i jego utrwalone dane, waluta PLN, termin płatności, status, dokument źródłowy i przyczyna korekty.

Pozycje: nazwa, jednostka, ilość do trzech miejsc, cena jednostkowa w groszach, rabat, stawka VAT i ryczałtu, netto/VAT/brutto. Obliczenia całkowitoliczbowe `BigInt`; kopia wyliczeń także w PostgreSQL. Dokument wystawiony nie może być po cichu nadpisany ani usunięty. Korekta tworzy nowy dokument. Wydruk do PDF zawiera dane sprzedawcy/nabywcy, daty, pozycje, podsumowania stawek i właściwe oznaczenia. Zakupy są wydrukiem ewidencji, nie kopią oryginalnej faktury dostawcy. KSeF pozostaje poza zakresem.

Zakup: data otrzymania, moment prawa do odliczenia VAT, procent odliczenia VAT, koszt PIT i kategoria ewidencji. Nie utożsamiamy daty zapłaty z datą ujęcia kosztu JDG. Podgląd przed zatwierdzeniem pokazuje kwoty i właściwy okres.

## Podatki — reguły i granice

Kalkulator obejmuje krajowe transakcje PLN, ogólne zasady momentu powstania przychodu i VAT, miesięczne rozliczenia. Każdy inny zakres będzie jawnie oznaczony i wdrażany oddzielnie; nie wolno wyświetlać obliczenia jako kompletnego, gdy brakuje wymaganej klasyfikacji albo danych.

- Skala: 12%/32%, próg 120 000 zł i wspólna kwota wolna. Zaliczka JDG i rozliczenie roczne z pozostałymi dochodami to osobne obliczenia.
- Liniowy: 19%, bez kwoty wolnej; zapłacona składka zdrowotna odliczana tylko raz i w 2026 do 14 100 zł, z uwzględnieniem części już w kosztach.
- Ryczałt: stawka wynika z faktycznej czynności/PKWiU, może być różna na jednej fakturze; koszty nie obniżają podstawy; odliczenie 50% właściwych zapłaconych składek zdrowotnych i proporcjonalne rozdzielenie odliczeń na stawki.
- VAT: 23/8/5/0/zw/np, VAT sprzedaży i uprawnione odliczenia zakupów, przeniesiona nadwyżka i zarejestrowane zapłaty. `zw`, `np` i `0%` nie są zamienne. Data VAT zakupu zależy również od otrzymania faktury i powstania obowiązku podatkowego u sprzedawcy.
- Zwolnienie VAT w 2026: próg 240 000 zł, proporcja dla rozpoczynających oraz wyłączenia. DN może być już działalnością dla VAT, więc przejście do CEIDG nie rozpoczyna automatycznie nowego limitu VAT.
- Historia ustawień podatkowych musi być związana z okresem. Zmiana formy opodatkowania nie może przeliczać poprzednich lat nową stawką.
- Wykresy: przychody/koszty/dochód według miesiąca; należny/naliczony VAT i nadwyżka; naliczony/zapłacony PIT; wykorzystanie właściwego limitu. Każdy wykres musi mieć też tabelę kwot.
- Składki ZUS i zdrowotne: początkowo ewidencja faktycznie zapłaconych kwot, osobno od kalkulatora należnych składek. Nie wyliczamy ich na podstawie samej jednej faktury.
- JPK_V7 i inne deklaracje/struktury wymagają kompletnej klasyfikacji i walidacji. Brak integracji KSeF nie usuwa innych obowiązków ewidencyjnych.

## Testy wymagane przed udostępnieniem księgowości JDG

1. Rejestracja DN/JDG, powrót po potwierdzeniu email, istniejące konto TaskOn, brak nadpisania istniejącego typu.
2. Przejście DN → JDG: granica dat, stare wpłaty po przejściu, korekty, kolizje wpisów i zachowanie klientów.
3. Katalog: dwa konta, konflikt wersji, archiwizacja, brak zmiany cen na historycznych dokumentach.
4. Faktury: wiele stawek, rabat, ilości ułamkowe, kwoty graniczne, unikalna numeracja, transakcja i ponowienie zapisu.
5. PIT/VAT: granice progów, podstawy i podatek zaokrąglane we właściwym miejscu; zwroty/korekty; roczne narastanie i zapłacone zaliczki; VAT do przeniesienia; brak podwójnego ujęcia kosztu i składki.

## Źródła urzędowe

- https://www.podatki.gov.pl/poradniki-i-informatory/rozpoczecie-dzialalnosci-gospodarczej
- https://www.podatki.gov.pl/podatki-firmowe/pit/stawki-i-limity
- https://www.podatki.gov.pl/ulgi-i-odliczenia/odliczenie-skladek-na-ubezpieczenie-zdrowotne-pit
- https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/kiedy-powstaje-obowiazek-podatkowy
- https://www.podatki.gov.pl/vat/abc-vat/odliczenie-podatku-naliczonego-i-zwrot-podatku
- https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/zwolnienie-podmiotowe-od-podatku-vat
- https://www.biznes.gov.pl/pl/portal/00239

## Bieżący zakres kodu

Etapy 1–3: katalog i profil, faktury, płatności/odwrócenia, korekty, wydruk oraz miesięczne i roczne PIT/VAT z wykresami i tabelami. 84 testy, w tym PostgreSQL/PGlite i dwa konta. Osobne tabele rocznych założeń oraz miesięcznych składek/wpłat mają RLS i wersjonowanie. Kopia przywraca dokumenty z historycznymi danymi oraz odpowiednio przesuwa numerację; nie nadpisuje istniejących rekordów ani typu działalności.

Przyjęto zaliczki miesięczne bez opcjonalnego odraczania małych kwot. Wcześniejsze zaliczki należne są oddzielone od faktycznie zapłaconych, więc zaległość nie jest ponownie doliczana w następnym miesiącu. VAT sumuje się według pól stawek, a następnie zaokrągla do pełnych złotych. Nadwyżka przechodzi pomiędzy miesiącami po odjęciu części zadeklarowanej do zwrotu.

Limit ryczałtu w 2026 r. to 8 517 200 zł przychodu w 2025 r., a w 2025 r. 8 569 200 zł przychodu w 2024 r. Nie jest to limit bieżącej sprzedaży. Kalkulator nie kwalifikuje działalności do stawki na podstawie nazwy pozycji. Ujemne podstawy wymagające ustalenia korekty i nieprawidłowe ujęcie zdrowotnej blokują prezentowanie PIT jako gotowego wyniku.

Dalszy etap 4 obejmuje środki trwałe, formalne struktury ewidencji/JPK i szczególne procedury. Są jawnie poza bieżącym zakresem.


## Remanent KPiR — zaimplementowane rozszerzenie

Spisy początkowe (1 stycznia lub początek JDG), miesięczne (styczeń–listopad) i końcowe (31 grudnia) w latach 2025–2026. Szkice są wersjonowane; zatwierdzone zapisy i dane firmy są niezmienne. Poprawka zawiera pełną nową wersję, przyczynę i odwołanie do poprzedniej; tylko najnowsza zatwierdzona wersja wpływa na PIT. Konflikt równoległych poprawek jest odrzucany. Puste spisy wymagają potwierdzenia stanu zerowego.

Ilość do trzech miejsc, cena w groszach, sumowanie z kontrolą zakresu także w PostgreSQL. Towary/materiały: zakup/nabycie lub niższa cena rynkowa z ceną pierwotną i uzasadnieniem. Produkcja/wyroby: koszt wytworzenia i właściwa obniżona wycena; produkcja w toku nie poniżej podanego kosztu materiałów bezpośrednich. Odpady według przydatności. Towary obce bez wartości, z nazwą właściciela; własne poza firmą z lokalizacją. Katalog przenosi nazwę/jednostkę, nigdy cenę sprzedaży jako wycenę zapasu. Cena obejmuje tylko nieodliczany VAT. Ustawowe pomniejszenie wartości wymaga osobnej kwoty i uzasadnienia.

PIT skali/liniowego: dochód roczny = przychód − koszty + remanent końcowy − początkowy (art. 24 ust. 2). Miesięczna zaliczka uwzględnia różnicę wobec spisu początkowego tylko dla faktycznego spisu na koniec tego miesiąca (art. 44 ust. 2); nie przenosimy oszacowania na następne miesiące. Brak początku przy zatwierdzonym końcu blokuje wynik właściwego PIT; brak pełnych spisów rocznych oznacza niepełną prognozę. Spis z 31 grudnia poprzedniego roku może zastąpić początek tylko przy wcześniejszym rozpoczęciu JDG. Ryczałt i VAT nie są korygowane remanentem.

Wydruk ma dane firmy, datę, pozycje, ilość/cenę/wartość, sumę, końcową klauzulę oraz miejsce na podpis. Zatwierdzenie zapisu nie jest podpisem dokumentu. Kopia JSON zachowuje pełną historię i utrwalone dane; import odtwarza rodziców przed poprawkami i nie duplikuje identyfikatorów. Osobne API i tabela `mk_inventories` z RLS, SECURITY INVOKER oraz prywatnym cache.

Poza zakresem: spis przy likwidacji i zmianach wspólników, VAT likwidacyjny, specjalne branżowe metody wyceny, pełna formalna KPiR/JPK. Wyceny nie ustalamy automatycznie z cen sprzedaży; użytkownik wprowadza właściwe wartości i wykonuje wymagany spis oraz podpis.

Podstawy, sprawdzone 16.10.2026:
- Rozporządzenie z 6.09.2025, Dz.U. 2025 poz. 1299, § 20–22 (od 1.01.2026): https://eli.gov.pl/api/acts/DU/2025/1299/text.pdf
- PIT, tekst jednolity Dz.U. 2026 poz. 592 ze zmianami, art. 24 ust. 2 i art. 44 ust. 2: https://eli.gov.pl/api/acts/DU/2026/592/text/U/D20260592Lj.pdf
- Rozporządzenie KPiR dla 2025, Dz.U. 2019 poz. 2544 ze zmianami, § 24–26: https://eli.gov.pl/api/acts/DU/2019/2544/text.pdf
