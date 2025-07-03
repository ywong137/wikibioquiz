class WikipediaTokenAPI {
  private apiKey: string;
  private baseUrl = 'https://en.wikipedia.org/w/api.php';
  
  constructor() {
    this.apiKey = process.env.WIKIPEDIA_API_KEY!;
    if (!this.apiKey) {
      throw new Error('WIKIPEDIA_API_KEY environment variable is required');
    }
  }

  private async makeRequest(params: Record<string, string>): Promise<any> {
    const url = new URL(this.baseUrl);
    url.searchParams.append('format', 'json');
    url.searchParams.append('origin', '*');
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const headers = {
      'User-Agent': 'WikipediaGuessingGame/1.0 (https://replit.com)'
    };

    const response = await fetch(url.toString(), { headers });
    
    if (!response.ok) {
      throw new Error(`Wikipedia API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  async fetchWikipediaSections(title: string): Promise<string[]> {
    try {
      // Get page sections using parse API
      const data = await this.makeRequest({
        action: 'parse',
        page: title,
        prop: 'sections'
      });
      
      console.log(`Debug: Wikipedia API response for ${title}:`, JSON.stringify(data, null, 2));
      
      if (!data.parse || !data.parse.sections) {
        console.log(`Debug: No sections found in response for ${title}`);
        return [];
      }
      
      // Extract section titles, skip the introduction (level 0)
      const sections = data.parse.sections
        .filter((section: any) => section.level > 0 && section.line && section.line.trim())
        .map((section: any) => section.line.trim());
      
      console.log(`Debug: Extracted ${sections.length} sections for ${title}`);
      return sections;
      
    } catch (error) {
      console.error(`Failed to fetch sections for ${title}:`, error);
      return [];
    }
  }

  async fetchWikipediaBiography(title: string): Promise<string> {
    try {
      // Get page extract using extracts API
      const data = await this.makeRequest({
        action: 'query',
        titles: title,
        prop: 'extracts',
        exintro: 'true',
        explaintext: 'true',
        exsectionformat: 'plain'
      });
      
      if (!data.query || !data.query.pages) {
        throw new Error('No pages found in Wikipedia response');
      }
      
      const pages = Object.values(data.query.pages) as any[];
      const page = pages[0];
      
      if (!page.extract) {
        throw new Error('No extract found in Wikipedia response');
      }
      
      return page.extract;
      
    } catch (error) {
      console.error(`Failed to fetch biography for ${title}:`, error);
      throw error;
    }
  }
}

export const wikipediaTokenAPI = new WikipediaTokenAPI();