import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

interface RelatedPaper {
  paperId: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  url?: string | null;
  pdfUrl: string | null;
}

async function searchOpenAlex(title: string): Promise<RelatedPaper[]> {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=5&select=id,title,authorships,publication_year,abstract_inverted_index,primary_location,open_access`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.results || []).map((work: any) => {
      // Giải mã inverted index abstract
      let abstract = '';
      if (work.abstract_inverted_index) {
        const wordPositions: [string, number][] = [];
        for (const [word, positions] of Object.entries(work.abstract_inverted_index as Record<string, number[]>)) {
          for (const pos of positions) {
            wordPositions.push([word, pos]);
          }
        }
        abstract = wordPositions
          .sort((a, b) => a[1] - b[1])
          .map(([word]) => word)
          .join(' ');
      }

      return {
        paperId: work.id || Math.random().toString(),
        title: work.title || 'Untitled',
        authors: (work.authorships || [])
          .slice(0, 3)
          .map((a: any) => a.author?.display_name || ''),
        year: work.publication_year || null,
        abstract: abstract || null,
        url: work.primary_location?.landing_page_url || null,
        pdfUrl: work.open_access?.oa_url || null,
      };
    }).filter((p: RelatedPaper) => p.title !== 'Untitled');
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  let session = await auth();
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');

  const isTestOrDev = process.env.NODE_ENV !== 'production' || process.env.PLAYWRIGHT_TEST === 'true';
  const hasPlaywrightHeader = req.headers.get('x-playwright-test') === 'true';

  if (jobId && jobId.startsWith('mock-') && (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === 'true' || (isTestOrDev && hasPlaywrightHeader))) {
    session = { accessToken: 'mock-token-123' } as any;
  }

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  try {
    let queryTitle = 'Attention Is All You Need';

    if (!jobId.startsWith('mock-')) {
      // Fetch job metadata from API Gateway to get fileName
      const jobRes = await fetch(`${API_BASE}/job/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
        },
      });

      if (jobRes.ok) {
        const jobData = await jobRes.json();
        const rawFileName = jobData.fileName || jobData.originalName || '';
        if (rawFileName) {
          // Clean the title: remove extension, replace separators with space
          queryTitle = rawFileName
            .replace(/\.[^/.]+$/, '') // remove extension (e.g. .pdf)
            .replace(/[_-]/g, ' ')    // replace underscores and dashes with spaces
            .trim();
        }
      } else {
        console.warn(`[Semantic Scholar] Failed to fetch job metadata for ${jobId}: ${jobRes.status}`);
      }
    }

    try {
      const ssUrl = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
      ssUrl.searchParams.set('query', queryTitle);
      ssUrl.searchParams.set('limit', '5');
      ssUrl.searchParams.set('fields', 'title,authors,year,abstract,openAccessPdf');

      const ssRes = await fetch(ssUrl.toString(), { signal: AbortSignal.timeout(5000) });
      if (!ssRes.ok) throw new Error(`status ${ssRes.status}`);

      const ssData = await ssRes.json();
      const papers = (ssData.data || []).map((paper: any) => ({
        paperId: paper.paperId,
        title: paper.title || 'Untitled',
        authors: (paper.authors || []).map((a: any) => a.name),
        year: paper.year || null,
        abstract: paper.abstract || null,
        pdfUrl: paper.openAccessPdf?.url || null,
      })).filter((p: any) => p.title !== 'Untitled');

      return NextResponse.json({ papers });
    } catch (err) {
      console.warn('Semantic Scholar failed, trying OpenAlex:', err);
      const papers = await searchOpenAlex(queryTitle);
      if (papers.length > 0) {
        return NextResponse.json({ papers });
      }
      return NextResponse.json({ papers: [] });
    }
  } catch (err: any) {
    console.error('[Semantic Scholar Route Error]:', err);
    return NextResponse.json({ papers: [] });
  }
}
