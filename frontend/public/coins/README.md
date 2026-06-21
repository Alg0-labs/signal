# Craftwork 3D coin clips

The landing-page background (`CoinField`) renders animated 3D crypto coins.

These `*.webm` files are the spinning-coin clips from
https://coins.craftwork.design (free, commercial license), re-encoded to
**transparent (alpha) WebM** so they sit cleanly on the dark theme:

- `btc` `eth` `sol` `bnb` `usdt` `link` `matic`

How they were processed (the source clips ship on a white background):

```
ffmpeg -i <Coin>.webm \
  -vf "colorkey=0xFFFFFF:0.10:0.06,scale=480:480,format=yuva420p" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 0 -crf 36 \
  <sym>.webm
```

To add more coins: download the clip from Craftwork, run the command above,
save as `<sym>.webm` here, and add an entry to the `COINS` array in
`src/components/landing/coin-field.tsx`. If a file is missing, that coin
automatically falls back to a CSS-rendered 3D coin.
