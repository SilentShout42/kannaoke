interface Env {
  ASSETS: Fetcher;
}

interface Performance {
  videoId: string;
  startTime: number;
  title: string;
  artist: string;
  videoTitle: string;
  videoDate: string;
  endTime?: number | null;
}

const UNFURLER_RE =
  /discordbot|slackbot|twitterbot|facebookexternalhit|linkedinbot|telegrambot|whatsapp|vkshare|msnbot|googlebot|bingbot/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const vParam = url.searchParams.get('v');
    const tParam = url.searchParams.get('t');

    if (vParam && UNFURLER_RE.test(request.headers.get('user-agent') ?? '')) {
      const perfRes = await env.ASSETS.fetch(
        new Request(`${url.origin}/performances.json`),
      );

      if (perfRes.ok) {
        const performances = (await perfRes.json()) as Performance[];
        const candidates = performances.filter(p => p.videoId === vParam);

        let match: Performance | undefined;
        if (candidates.length > 0) {
          match = tParam
            ? candidates.reduce((best, p) =>
              Math.abs(p.startTime - Number(tParam)) <
                Math.abs(best.startTime - Number(tParam))
                ? p
                : best,
            )
            : candidates[0];
        }

        if (match) {
          const htmlRes = await env.ASSETS.fetch(
            new Request(`${url.origin}/index.html`),
          );

          const ogTitle = `"${match.title}" by ${match.artist} — Kannaoke`;
          const ogDesc =
            `Kanna Yanagi karaoke: ${match.title} by ${match.artist}` +
            ` · ${match.videoTitle} (${match.videoDate}).`;
          const canonicalUrl = request.url;

          return new HTMLRewriter()
            .on('title', {
              element(el) {
                el.setInnerContent(ogTitle);
              },
            })
            .on('meta[property="og:title"]', {
              element(el) {
                el.setAttribute('content', ogTitle);
              },
            })
            .on('meta[property="og:description"]', {
              element(el) {
                el.setAttribute('content', ogDesc);
              },
            })
            .on('meta[property="og:url"]', {
              element(el) {
                el.setAttribute('content', canonicalUrl);
              },
            })
            .on('meta[name="twitter:title"]', {
              element(el) {
                el.setAttribute('content', ogTitle);
              },
            })
            .on('meta[name="twitter:description"]', {
              element(el) {
                el.setAttribute('content', ogDesc);
              },
            })
            .on('link[rel="canonical"]', {
              element(el) {
                el.setAttribute('href', canonicalUrl);
              },
            })
            .transform(htmlRes);
        }
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
