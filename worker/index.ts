export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler;
