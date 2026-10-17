# Christmas Pouch Hoodie — ad creatives

Made 2026-10-15 to replace "!Christmas Hoodie Ad!", whose video showed a
different garment (a red fleece pouch hoodie with a puppy) from the one the
page sells. These use only the page's own two product photos, so the ad shows
exactly what a click lands on, and every claim on them is one the page already
makes: $54.99, two designs, S–XL, free shipping, 30-day returns, order by
Dec 7 for Christmas. No reviews, ratings, discounts or "selling fast".

| File | Size | Use for |
|---|---|---|
| `reel.mp4` | 1080×1920, 12 s, silent | Reels, Stories, Feed (9:16) |
| `portrait.jpg` | 1080×1350 | Feed (4:5) |
| `square.jpg` | 1080×1080 | Feed, right column (1:1) |

Rebuild after changing a price or a claim: `python3 ads/christmas-pouch-hoodie/make.py`
(needs Pillow and ffmpeg). The text in the reel sits clear of the top strip
and the bottom third that Reels and Stories cover with their own UI.

## Ad copy

**Primary text**

> Cat & small dog owners, this one's for you 🎄
>
> Your pet rides in the front pouch while you wear a cosy Christmas hoodie.
>
> • 2 designs: Santa Red and Stocking Green
> • Sizes S–XL
> • Free shipping · 30-day returns
>
> Order by Dec 7 for Christmas delivery.

**Headline:** Christmas Pouch Hoodie — $54.99
**Description:** Free shipping · 30-day returns
**Call to action:** Shop Now
**Website URL:** https://chillmypet-christmas.pages.dev

## Before and after running them

- The reel has a silent audio track. Add a track from Meta's music library
  in Ads Manager if wanted; it is licensed for ads there.
- The photos came from the owner; confirm the supplier allows them in ads.
- **After Dec 7 these ads are wrong** ("Order by Dec 7"). Pause or replace
  them that day, along with the page's own cut-off strip.
