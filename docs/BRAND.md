# Ewidora

**Mały biznes. Jasne finanse.**

Nazwa nawiązuje do ewidencji. Identyfikacja łączy prosty symbol litery e z czytelnym logotypem i spokojną paletą finansowej aplikacji.

## Paleta

| Rola | Kolor |
| --- | --- |
| Granat — logotyp, nagłówki, główne przyciski | `#142C45` |
| Mięta — znak i wyróżnienia | `#21C3A1` |
| Ciemna mięta — linki i tekst na jasnym tle | `#087F70` |
| Tło aplikacji | `#F4F7FB` |
| Powierzchnie kart | `#FFFFFF` |
| Tekst pomocniczy | `#5A6D82` |
| Ostrzeżenia i koszty na wykresach | `#B88036` |

Jasna mięta jest kolorem dekoracyjnym; tekst linków używa ciemnego odcienia. Główne przyciski mają biały tekst na granacie. Wartości księgowe używają cyfr o stałej szerokości.

## Pliki

- `public/brand/ewidora-symbol.png` — oryginalny znak z przezroczystością, wygenerowany narzędziem image_gen.
- `app/brand.tsx` — wspólny logotyp: symbol i tekst ewidora. Logo jest optymalizowane przez Next Image.
- `public/favicon.svg` — mały wariant symbolu, opracowany w SVG do kart przeglądarki.
- `app/brand.css` — kolorystyka, typografia i warianty mobilne.

## Prompt oryginalnego znaku

Built-in image_gen, transparent_background: true. Bez obrazów referencyjnych.

```text
Use case: logo-brand.
Asset type: final production app icon / brand symbol for a Polish bookkeeping web app called Ewidora.
Create ONE polished, original, extremely clear flat vector-style logo symbol, no text at all. The symbol is an elegant abstract lowercase e built from three rounded ledger/page strokes with a subtle ascending notch, evoking an orderly ledger and steady business progress. Compact distinctive silhouette, balanced geometric optical weight, not a generic checkmark, not a currency symbol, not a stock-chart arrow. Premium, calm, approachable financial software identity.
Palette: deep navy #142C45 and fresh mint #21C3A1 only, use navy as the structural anchor and mint for a restrained distinctive page/stroke. Entirely solid flat colors, no gradients, no 3D, no shadows, no mockup. Transparent background, actual alpha.
Composition: a single centered symbol in a square canvas, symbol fills about 76 percent of the square with comfortable equal transparent padding, clean precise curves, thick enough to read clearly at 24px app-icon size. Do not place it on a background tile or circle. No wordmark, no letters as text, no tagline, no labels, no watermark, no alternates, no brand board. This is a final reusable transparent asset for a real deployed web app.
```

Oryginalny znak zachowano bez retuszu. W interfejsie ma stałe proporcje; na wydrukach występuje wraz z nazwą. Zmiana marki nie zmienia danych, numeracji dokumentów ani formatu kopii `mala-ksiega-1`.
