import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loader } from './api.github-template';

describe('GitHub template loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the default branch archive when GitHub has no available release', async () => {
    const zip = new JSZip();
    zip.file('bolt-astro-basic-template-main/package.json', '{"scripts":{"dev":"astro dev"}}');

    const archive = await zip.generateAsync({ type: 'arraybuffer' });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(archive));
    vi.stubGlobal('fetch', fetchMock);

    const response = await loader({
      request: new Request('http://localhost/api/github-template?repo=blueberry-llm/bolt-astro-basic-template'),
      context: {},
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        name: 'package.json',
        path: 'package.json',
        content: '{"scripts":{"dev":"astro dev"}}',
      },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://codeload.github.com/blueberry-llm/bolt-astro-basic-template/zip/refs/heads/main',
    );
  });

  describe('on the Workers runtime', () => {
    const repo = 'fixture/template';
    const apiUrl = `https://api.github.com/repos/${repo}`;
    const mainArchiveUrl = `https://codeload.github.com/${repo}/zip/refs/heads/main`;
    const masterArchiveUrl = `https://codeload.github.com/${repo}/zip/refs/heads/master`;

    const files = [
      { name: 'package.json', path: 'package.json', content: '{"name":"fixture"}' },
      { name: 'main.tsx', path: 'src/main.tsx', content: 'export {};' },
      { name: 'vite.config.ts', path: 'vite.config.ts', content: 'export default {};' },
    ];

    type Routes = Record<string, () => Response>;

    const notFound = () => new Response(null, { status: 404 });
    const noArchive: Routes = { [mainArchiveUrl]: notFound, [masterArchiveUrl]: notFound };

    function stubFetch(routes: Routes) {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const respond = routes[String(input)];

        if (!respond) {
          throw new Error(`Unexpected fetch: ${String(input)}`);
        }

        return respond();
      });

      vi.stubGlobal('fetch', fetchMock);

      return fetchMock;
    }

    function contentsApi(tree: { truncated?: boolean } = {}): Routes {
      const routes: Routes = {
        [apiUrl]: () => Response.json({ default_branch: 'main' }),
        [`${apiUrl}/git/trees/main?recursive=1`]: () =>
          Response.json({
            ...tree,
            tree: files.map((file) => ({ path: file.path, type: 'blob', size: file.content.length })),
          }),
      };

      for (const file of files) {
        routes[`${apiUrl}/contents/${file.path}`] = () =>
          Response.json({ content: btoa(file.content), encoding: 'base64' });
      }

      return routes;
    }

    async function archiveResponse() {
      const zip = new JSZip();

      for (const file of files) {
        zip.file(`template-main/${file.path}`, file.content);
      }

      const archive = await zip.generateAsync({ type: 'arraybuffer' });

      return () => new Response(archive);
    }

    function load() {
      return loader({
        request: new Request(`http://localhost/api/github-template?repo=${repo}`),
        context: { cloudflare: { ctx: { waitUntil: () => undefined } } },
      });
    }

    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('downloads the branch archive without spending GitHub API requests', async () => {
      const fetchMock = stubFetch({ [mainArchiveUrl]: await archiveResponse() });

      const response = await load();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(files);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(mainArchiveUrl);
    });

    it.each<[string, Routes]>([
      ['has no main or master branch', noArchive],
      ['cannot be downloaded', { [mainArchiveUrl]: () => new Response(null, { status: 503 }) }],
      ['is not a valid zip file', { [mainArchiveUrl]: () => new Response('not a zip file') }],
    ])('falls back to the Contents API when the archive %s', async (_reason, archiveRoutes) => {
      stubFetch({ ...archiveRoutes, ...contentsApi() });

      const response = await load();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(files);
    });

    it.each<[string, () => Response]>([
      ['is rate limited', () => new Response(null, { status: 403 })],
      [
        'fails on the network',
        () => {
          throw new TypeError('fetch failed');
        },
      ],
      ['returns no file content', () => Response.json({ message: 'Not Found' })],
    ])('fails instead of returning a partial file list when a content request %s', async (_reason, respond) => {
      stubFetch({ ...noArchive, ...contentsApi(), [`${apiUrl}/contents/src/main.tsx`]: respond });

      const response = await load();

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to fetch template files',
        details: expect.stringContaining('Failed to fetch src/main.tsx'),
      });
    });

    it('fails when GitHub truncates the repository tree', async () => {
      stubFetch({ ...noArchive, ...contentsApi({ truncated: true }) });

      const response = await load();

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({ error: 'Failed to fetch template files' });
    });

    it('still leaves out binary files without failing', async () => {
      stubFetch({
        ...noArchive,
        ...contentsApi(),
        [`${apiUrl}/contents/vite.config.ts`]: () =>
          Response.json({ content: btoa('\u0000binary'), encoding: 'base64' }),
      });

      const response = await load();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(files.filter((file) => file.path !== 'vite.config.ts'));
    });
  });
});
