# Ewidora — katalog, faktury i prosta księgowość JDG

Plan i weryfikacja źródeł: 16.10.2026. To rozszerzenie aplikacji DN, z zachowaniem jej zapisów i wspólnego logowania TaskOn.

## Cel i podział prac

| Etap | Rezultat | Kryterium ukończenia |
| --- | --- | --- |
| 1. Konto i katalog | Rodzaj DN/JDG przy rejestracji, osobny profil w bazie, datowane przejście, produkty/usługi, ceny i stawki | RLS dwóch kont, zapis i odczyt na drugim urządzeniu, wersjonowanie, test przejścia bez zmiany wcześniejszych wpisów |
| 2. Faktury | Sprzedaż i zakup, wiele pozycji z katalogu, osobna numeracja, szkic/wystawiona/korekta, płatności, wydruk PDF i załączniki | Dokładne sumy netto/VAT/brutto; niezmienne dokumenty po wystawieniu; korekty; brak podwójnego księgowania |
| 3. Podatki i wykresy | Skala, liniowy i ryczałt; VAT należny/naliczony; zaliczki i zapłaty; historia miesięcy, limity, eksport | Testy granic, zaokrągleń, przenoszenia VAT, wielu stawek ryczałtu i oddzielenia DN/JDG |
| 4. Rozszerzenia i audyt | Formalne eksporty ewidencji, remanent, środki trwałe, szczególne przypadki | Osobna weryfikacja przepisów i przypadków przed włączeniem każdej funkcji |

Pierwszy etap nie jest deklarowany jako gotowa księgowość JDG. Samo zapisanie formy PIT i statusu VAT nie uruchamia naliczania podatków od starych wpisów DN.

## Decyzje modelu

- `mk_business_profiles` przechowuje rodzaj działalności, rodzaj początkowy, datę rozpoczęcia JDG, formę PIT, status i datę VAT, podstawę zwolnienia oraz wersję konfiguracji. `mk_business_events` zachowuje przejście DN → JDG.
- Nie zmieniamy globalnych ustawień Auth TaskOn. Wybór przy rejestracji jest zapisany w metadanych Auth, a po otrzymaniu sesji w osobnym profilu aplikacji. Metadane użytkownika nie decydują o dostępie; właściciela nadal wyznacza `auth.uid()`.
- Dotychczasowi użytkownicy Ewidory zachowują profil DN. Pozostałe konta TaskOn nie są masowo przenoszone.
- Klienci i produkty są wspólne dla właściciela konta. Ewidencja DN i dokumenty JDG pozostają oddzielne. Przejście nie przelicza ani nie przemianowuje historii.
- `mk_products`: produkt/usługa, nazwa, kod, jednostka, cena netto w groszach, stawka VAT, stawka ryczałtu, opis, archiwizacja i wersja. Dokument musi zapamiętać kopię pozycji, a nie odwoływać się do jej aktualnej ceny.
- Zmiana DN → JDG wymaga daty i świadomego potwierdzenia. Nie cofamy jej jednym przełącznikiem. Wpisy DN kolidujące z datą przejścia wymagają wyjaśnienia; nie są automatycznie przekształcane.
- Wszystkie nowe tabele mają RLS, ustalone uprawnienia i indeks właściciela. Zapisy mają identyfikatory operacji, ochronę przed powieleniem i konfliktami wersji.

## Faktury — implementacja kolejnego etapu

Osobne tabele `mk_invoices`, `mk_invoice_payments`, `mk_invoice_sequences`. Nagłówek: kierunek sprzedaż/zakup, rodzaj zwykła/korekta, numer, daty wystawienia/dostawy/PIT/VAT/otrzymania dokumentu, kontrahent i jego utrwalone dane, waluta PLN, termin płatności, status, dokument źródłowy i przyczyna korekty.

Pozycje: nazwa, jednostka, ilość do trzech miejsc, cena jednostkowa w groszach, rabat, stawka VAT i ryczałtu, netto/VAT/brutto. Obliczenia całkowitoliczbowe `BigInt`; kopia wyliczeń także w PostgreSQL. Dokument wystawiony nie może być po cichu nadpisany ani usunięty. Korekta tworzy nowy dokument. PDF zawiera wymagane dane sprzedawcy/nabywcy i podsumowania stawek. KSeF pozostaje poza zakresem.

Zakup: data otrzymania, moment prawa do odliczenia VAT, procent odliczenia VAT, koszt PIT i kategoria ewidencji. Nie utożsamiamy daty zapłaty z datą ujęcia kosztu JDG. Podgląd przed zatwierdzeniem pokaże kwoty i właściwy okres.

## Podatki — reguły i granice

Początkowy kalkulator obejmie krajowe transakcje PLN, ogólne zasady momentu powstania przychodu i VAT, miesięczne rozliczenia. Każdy inny zakres będzie jawnie oznaczony i wdrażany oddzielnie; nie wolno wyświetlać obliczenia jako kompletnego, gdy brakuje wymaganej klasyfikacji albo danych.

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
5. PIT/VAT: granice progów, podstawy i podatek zaokrąglane we właściwym miejscu; zwroty/korekkty; roczne narastanie i zapłacone zaliczki; VAT do przeniesienia; brak podwójnego ujęcia kosztu i składki.

## Źródła urzędowe

- https://www.podatki.gov.pl/poradniki-i-informatory/rozpoczecie-dzialalnosci-gospodarczej
- https://www.podatki.gov.pl/podatki-firmowe/pit/stawki-i-limity
- https://www.podatki.gov.pl/ulgi-i-odliczenia/odliczenie-skladek-na-ubezpieczenie-zdrowotne-pit
- https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/kiedy-powstaje-obowiazek-podatkowy
- https://www.podatki.gov.pl/vat/abc-vat/odliczenie-podatku-naliczonego-i-zwrot-podatku
- https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/zwolnienie-podmiotowe-od-podatku-vat
- https://www.biznes.gov.pl/pl/portal/00239

## Bieżący zakres kodu

Etap 1 oraz dokładny silnik obliczeń pozycji faktur. Etapy 2–4 pozostają planem, dopóki odpowiadające im funkcje i testy nie zostaną ukończone. W interfejsie JDG nie wolno prezentować prognozy DN jako należnego PIT/VAT przedsiębiorcy.
