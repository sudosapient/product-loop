# Media generation and product assets

Use this reference when a product needs generated images, video, audio, illustrations, mock data visuals, or other non-text assets.

## Live capability discovery

Run `product-loop models` before freezing an asset plan and again at product kickoff. The command refreshes `GET <proxy>/v1/models`, preserves the complete catalog at `~/.config/product-loop/models.json`, and classifies capabilities from registry metadata when present. When the registry provides only ID/provider, it conservatively recognizes dedicated `image`/`imagen` and `video`/`veo` names; everything else remains text. Never assume a model from an old prompt or static score is still available.

Pi receives only text-capable models. Product Loop calls dedicated media endpoints directly:

- image: `POST <proxy>/v1/images/generations`
- video: `POST <proxy>/v1/videos/generations`

Use `product-loop media image|video` so credentials remain in the local proxy configuration and every result receives a provenance receipt.

## Decide whether media is required

Generate media only when it does narrative or interaction work that CSS, icons, existing licensed assets, or product screenshots cannot do more simply. Typical valid needs include a visual hero, editorial/product photography, a branded illustration system, onboarding guidance, a demo clip, a background plate, or test assets required by acceptance criteria.

Do not generate decorative filler, fake customer evidence, misleading product screenshots, logos resembling third parties, or assets whose ownership/consent is unresolved. Do not use generated text embedded inside images when real HTML text is possible.

## Freeze an asset contract

Record before generation:

- user-facing purpose and destination;
- required capability and currently available candidate models;
- prompt intent, forbidden content, subject, composition, style, lighting/motion, and aspect ratio;
- responsive crops, focal safe area, alt text/caption, and reduced-motion fallback;
- candidate count and cost/time ceiling;
- evaluator/rubric and acceptance evidence;
- output path, optimization format/weight target, provenance receipt, and replacement/rollback path.

## Generate and evaluate

```sh
product-loop models
product-loop media image \
  --prompt "Natural editorial photograph of ...; wide calm area on left for HTML headline; no text or logos" \
  --size 1536x1024 \
  --output product/assets/generated/hero

product-loop media video \
  --prompt "Eight-second seamless loop of ...; locked camera; no text or logos" \
  --duration 8 \
  --output product/assets/generated/hero-motion
```

Then place candidates in the real product. Verify subject accuracy, artifacts, crop at every required viewport, text contrast, accessibility fallback, motion comfort, load performance, and consistency with the approved visual direction. A raw generated file is not accepted evidence until it passes in-context computer-use review. Keep the generated receipt beside the asset or in private evidence storage according to the repository policy.

If no suitable media model is currently advertised, continue with a reversible placeholder or existing licensed asset only when the product contract permits it. Otherwise record the missing capability as a concrete preflight blocker; never silently replace a required image/video with low-quality filler.
